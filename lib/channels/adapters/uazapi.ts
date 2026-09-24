import { createAdminClient } from "@/lib/supabase/admin";
import type { FetchedMedia } from "@/lib/messaging/media/types";
import { resolveDirectCredentials } from "../direct/credentials";
import type {
  ChannelAdapter,
  ChannelHealth,
  OutboundEnvelope,
  RecipientInput,
} from "../types";

function digits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function uazapiPayload(envelope: OutboundEnvelope): {
  path: string;
  body: Record<string, unknown>;
} {
  if (!envelope.media) {
    return { path: "send/text", body: { number: envelope.to, text: envelope.body ?? "" } };
  }
  const type =
    envelope.kind === "image" || envelope.kind === "video" || envelope.kind === "audio"
      ? envelope.kind
      : "document";
  return {
    path: "send/media",
    body: {
      number: envelope.to,
      type,
      file: envelope.media.url,
      ...(envelope.media.caption ? { text: envelope.media.caption } : {}),
      ...(envelope.media.filename ? { docName: envelope.media.filename } : {}),
    },
  };
}

async function publicMedia(url: string, hintMime?: string | null): Promise<FetchedMedia> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("uazapi_media_invalid_url");
  const res = await fetch(parsed, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`uazapi_media_download_failed: ${res.status}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mime: res.headers.get("content-type")?.split(";")[0] || hintMime || "application/octet-stream",
  };
}

export const uazapiAdapter: ChannelAdapter = {
  provider: "uazapi",
  resolveRecipient(input: RecipientInput): string | null {
    if (input.isGroup && input.groupChatId) return input.groupChatId;
    const raw = input.waIdentity?.startsWith("phone:")
      ? input.waIdentity.slice("phone:".length)
      : input.phoneNumber;
    const value = raw ? digits(raw) : "";
    return value || null;
  },
  isConfigured: () => true,
  codes: {
    notConfigured: "uazapi_not_configured",
    sendFailed: "uazapi_error",
    unknownError: "uazapi_unknown",
  },
  async checkHealth(input): Promise<ChannelHealth> {
    const creds = await resolveDirectCredentials(createAdminClient(), {
      organizationId: input.organizationId,
      provider: "uazapi",
      externalId: input.sessionRef,
    });
    if (!creds) return { reachable: false, status: null, detail: "sem_credencial_para_a_sessao" };
    try {
      const res = await fetch(`${creds.baseUrl}/instance/status`, {
        headers: { token: creds.token },
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 401 || res.status === 403) {
        return { reachable: true, status: "FAILED", detail: "credencial_recusada" };
      }
      if (!res.ok) return { reachable: true, status: "FAILED", detail: `http_${res.status}` };
      const status = (json.status ?? {}) as Record<string, unknown>;
      const instance = (json.instance ?? {}) as Record<string, unknown>;
      const connected = status.connected === true || status.loggedIn === true || instance.status === "connected";
      return { reachable: true, status: connected ? "WORKING" : "STOPPED", detail: null };
    } catch (err) {
      return {
        reachable: false,
        status: null,
        detail: (err instanceof Error ? err.message : "erro_desconhecido").slice(0, 200),
      };
    }
  },
  fetchInboundMedia(input) {
    const url = input.url.replace(/^meta-media:/, "");
    return publicMedia(url, input.hintMime);
  },
  async send(envelope): Promise<{ externalId: string | null }> {
    if (envelope.kind === "contact") throw new Error("uazapi_contact_not_supported");
    const creds = await resolveDirectCredentials(createAdminClient(), {
      organizationId: envelope.organizationId,
      provider: "uazapi",
      externalId: envelope.sessionRef,
    });
    if (!creds) throw new Error("uazapi_not_configured");
    const request = uazapiPayload(envelope);
    await envelope.beforeSend?.();
    const res = await fetch(`${creds.baseUrl}/${request.path}`, {
      method: "POST",
      headers: { token: creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`uazapi_send_failed: ${res.status}`);
    const message = (json.message ?? {}) as Record<string, unknown>;
    const id = json.messageid ?? json.id ?? message.messageid ?? message.id;
    return { externalId: typeof id === "string" ? id : null };
  },
};
