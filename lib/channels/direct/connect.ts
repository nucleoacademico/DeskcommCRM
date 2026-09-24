import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";

import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "../archived";
import { CHANNEL_PROVIDER_UAZAPI, CHANNEL_PROVIDER_Z_API } from "../capabilities";
import type { DirectProvider } from "./credentials";
import { isDirectProvider, zApiHeaders, zApiUrl } from "./credentials";

export interface DirectProviderDescriptor {
  id: DirectProvider;
  label: string;
  default: boolean;
  fields: Array<{
    id: "base_url" | "external_id" | "token" | "client_token";
    label: string;
    required: boolean;
    secret: boolean;
    placeholder: string;
  }>;
}

export const DIRECT_PROVIDERS: readonly DirectProviderDescriptor[] = [
  {
    id: CHANNEL_PROVIDER_UAZAPI as DirectProvider,
    label: "UAZAPI",
    default: true,
    fields: [
      { id: "base_url", label: "Server URL", required: true, secret: false, placeholder: "https://seu-servidor.uazapi.com" },
      { id: "external_id", label: "Nome da instância", required: false, secret: false, placeholder: "opcional — detectado automaticamente" },
      { id: "token", label: "Instance Token", required: true, secret: true, placeholder: "cole o token rotacionado" },
      { id: "client_token", label: "Client Token", required: false, secret: true, placeholder: "não utilizado pela UAZAPI" },
    ],
  },
  {
    id: CHANNEL_PROVIDER_Z_API as DirectProvider,
    label: "Z-API",
    default: false,
    fields: [
      { id: "external_id", label: "Instance ID", required: true, secret: false, placeholder: "id da instância" },
      { id: "token", label: "Token da instância", required: true, secret: true, placeholder: "token" },
      { id: "client_token", label: "Client-Token", required: false, secret: true, placeholder: "token de segurança da conta" },
    ],
  },
] as const;

export interface DirectConnectionInput {
  provider: DirectProvider;
  baseUrl?: string;
  externalId?: string;
  token: string;
  clientToken?: string;
}

export interface DirectValidation {
  provider: DirectProvider;
  externalId: string;
  baseUrl: string;
  phoneNumber: string | null;
  displayName: string;
  status: "WORKING" | "STOPPED";
}

function normalizeBaseUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("A Server URL precisa usar HTTPS e não pode conter credenciais.");
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("A Server URL precisa ser pública.");
  }
  if (isIP(host)) {
    const privateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    const privateIpv6 = host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
    if (privateIpv4 || privateIpv6) throw new Error("A Server URL precisa ser pública.");
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, "");
}

function phoneDigits(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

export async function validateDirectCredentials(input: DirectConnectionInput): Promise<DirectValidation> {
  const token = input.token.trim();
  if (!token) throw new Error("Informe o token da instância.");

  if (input.provider === CHANNEL_PROVIDER_UAZAPI) {
    const baseUrl = normalizeBaseUrl(input.baseUrl?.trim() ?? "");
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/instance/status`, {
        headers: { token },
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
    } catch {
      throw new Error("Não foi possível falar com a UAZAPI nessa Server URL.");
    }
    if (res.status === 401 || res.status === 403) throw new Error("Token recusado pela UAZAPI.");
    if (!res.ok) throw new Error(`A UAZAPI respondeu HTTP ${res.status}.`);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const instance = (json.instance ?? {}) as Record<string, unknown>;
    const status = (json.status ?? {}) as Record<string, unknown>;
    const externalId = stringValue(
      input.externalId,
      instance.name,
      instance.instanceName,
      instance.id,
      json.instanceName,
    );
    if (!externalId) throw new Error("A UAZAPI autenticou, mas não informou a instância.");
    const phone = phoneDigits(status.jid ?? instance.owner ?? instance.phone ?? json.phone);
    const connected = status.connected === true || status.loggedIn === true || instance.status === "connected";
    return {
      provider: input.provider,
      externalId,
      baseUrl,
      phoneNumber: phone ? `+${phone}` : null,
      displayName: stringValue(instance.profileName, instance.name, externalId) ?? "UAZAPI",
      status: connected ? "WORKING" : "STOPPED",
    };
  }

  if (input.provider === CHANNEL_PROVIDER_Z_API) {
    const externalId = input.externalId?.trim();
    if (!externalId) throw new Error("Informe o Instance ID.");
    const baseUrl = "https://api.z-api.io";
    const clientToken = input.clientToken?.trim() || null;
    const url = `${baseUrl}/instances/${encodeURIComponent(externalId)}/token/${encodeURIComponent(token)}/status`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: clientToken ? { "Client-Token": clientToken } : {},
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Não foi possível falar com a Z-API.");
    }
    if (res.status === 401 || res.status === 403) throw new Error("Credenciais recusadas pela Z-API.");
    if (!res.ok) throw new Error(`A Z-API respondeu HTTP ${res.status}.`);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const phone = phoneDigits(json.phone ?? json.device?.toString());
    return {
      provider: input.provider,
      externalId,
      baseUrl,
      phoneNumber: phone ? `+${phone}` : null,
      displayName: stringValue(json.name, json.connectedPhone, externalId) ?? "Z-API",
      status: json.connected === true ? "WORKING" : "STOPPED",
    };
  }

  throw new Error("Provedor não suportado.");
}

export interface DirectSession {
  id: string;
  provider: DirectProvider;
  externalId: string;
  baseUrl: string;
  phoneNumber: string | null;
  displayName: string | null;
  status: string | null;
  webhookPathToken: string | null;
  hasToken: boolean;
  hasClientToken: boolean;
}

const DIRECT_COLUMNS =
  "id, provider, provider_external_id, provider_base_url, provider_token_encrypted, provider_client_token_encrypted, phone_number, display_name, status, webhook_path_token";

export async function listDirectSessions(
  admin: SupabaseClient,
  organizationId: string,
): Promise<DirectSession[]> {
  const base = () =>
    admin
      .from("channel_sessions")
      .select(DIRECT_COLUMNS)
      .eq("organization_id", organizationId)
      .in("provider", DIRECT_PROVIDERS.map((p) => p.id));
  const { data, error } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).order("created_at", { ascending: true }),
    () => base().order("created_at", { ascending: true }),
  );
  if (error) throw new Error(`direct_sessions_list_failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[])
    .filter((row) => isDirectProvider(String(row.provider)))
    .map((row) => ({
      id: String(row.id),
      provider: row.provider as DirectProvider,
      externalId: String(row.provider_external_id),
      baseUrl: String(row.provider_base_url),
      phoneNumber: (row.phone_number as string | null) ?? null,
      displayName: (row.display_name as string | null) ?? null,
      status: (row.status as string | null) ?? null,
      webhookPathToken: (row.webhook_path_token as string | null) ?? null,
      hasToken: !!row.provider_token_encrypted,
      hasClientToken: !!row.provider_client_token_encrypted,
    }));
}

export async function saveDirectSession(
  admin: SupabaseClient,
  input: DirectConnectionInput & DirectValidation & { organizationId: string },
): Promise<{ session: DirectSession; token: string; clientToken: string | null }> {
  const tokenEncrypted = await encryptWebhookSecret(admin, input.token.trim());
  const clientToken = input.clientToken?.trim() || null;
  const clientTokenEncrypted = clientToken ? await encryptWebhookSecret(admin, clientToken) : null;
  const webhookPathToken = randomBytes(24).toString("hex");
  const webhookSecretEncrypted = await encryptWebhookSecret(admin, randomBytes(32).toString("hex"));
  if (!tokenEncrypted || (clientToken && !clientTokenEncrypted) || !webhookSecretEncrypted) {
    throw new Error("A cifra de segredos não está disponível nesta instalação.");
  }

  const existing = (await listDirectSessions(admin, input.organizationId)).find(
    (session) => session.provider === input.provider && session.externalId === input.externalId,
  );
  const row = {
    organization_id: input.organizationId,
    provider: input.provider,
    provider_external_id: input.externalId,
    provider_base_url: input.baseUrl,
    provider_token_encrypted: tokenEncrypted,
    provider_client_token_encrypted: clientTokenEncrypted,
    phone_number: input.phoneNumber,
    display_name: input.displayName,
    status: input.status,
    webhook_path_token: existing?.webhookPathToken ?? webhookPathToken,
    webhook_secret_encrypted: webhookSecretEncrypted,
    archived_at: null,
  };
  const query = existing
    ? admin.from("channel_sessions").update(row).eq("id", existing.id).select(DIRECT_COLUMNS).single()
    : admin
        .from("channel_sessions")
        .insert({ ...row, metadata: metadataInicialDoCanal() })
        .select(DIRECT_COLUMNS)
        .single();
  const { data, error } = await query;
  if (error || !data) throw new Error(`Não foi possível gravar o canal: ${error?.message ?? "sem retorno"}`);
  return {
    token: input.token.trim(),
    clientToken,
    session: {
      id: String(data.id),
      provider: input.provider,
      externalId: String(data.provider_external_id),
      baseUrl: String(data.provider_base_url),
      phoneNumber: (data.phone_number as string | null) ?? null,
      displayName: (data.display_name as string | null) ?? null,
      status: (data.status as string | null) ?? null,
      webhookPathToken: (data.webhook_path_token as string | null) ?? null,
      hasToken: true,
      hasClientToken: !!clientToken,
    },
  };
}

export async function configureDirectWebhook(
  input: DirectValidation & { token: string; clientToken: string | null; webhookUrl: string },
): Promise<void> {
  if (input.provider === CHANNEL_PROVIDER_UAZAPI) {
    const res = await fetch(`${input.baseUrl}/webhook`, {
      method: "POST",
      headers: { token: input.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        url: input.webhookUrl,
        events: ["messages", "messages_update", "connection"],
        excludeMessages: ["wasSentByApi"],
        addUrlEvents: false,
        addUrlTypesMessages: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`UAZAPI recusou o webhook (HTTP ${res.status}).`);
    return;
  }

  const creds = {
    provider: input.provider,
    externalId: input.externalId,
    baseUrl: input.baseUrl,
    token: input.token,
    clientToken: input.clientToken,
  } as const;
  for (const operation of ["update-webhook-received", "update-webhook-delivery"] as const) {
    const res = await fetch(zApiUrl(creds, operation), {
      method: "PUT",
      headers: zApiHeaders(creds),
      body: JSON.stringify({ value: input.webhookUrl }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Z-API recusou ${operation} (HTTP ${res.status}).`);
  }
}
