import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "../archived";
import type { ChannelProvider } from "../types";

export type DirectProvider = Extract<ChannelProvider, "uazapi" | "z_api">;

export interface DirectCredentials {
  provider: DirectProvider;
  externalId: string;
  baseUrl: string;
  token: string;
  clientToken: string | null;
}

export function isDirectProvider(value: string): value is DirectProvider {
  return value === "uazapi" || value === "z_api";
}

export async function resolveDirectCredentials(
  admin: SupabaseClient,
  input: { organizationId: string; provider: DirectProvider; externalId: string },
): Promise<DirectCredentials | null> {
  const base = () =>
    admin
      .from("channel_sessions")
      .select(
        "provider, provider_external_id, provider_base_url, provider_token_encrypted, provider_client_token_encrypted",
      )
      .eq("organization_id", input.organizationId)
      .eq("provider", input.provider)
      .eq("provider_external_id", input.externalId);

  const { data, error } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).maybeSingle(),
    () => base().maybeSingle(),
  );
  if (error) throw new Error(`direct_creds_lookup_failed: ${error.message}`);
  if (!data?.provider_token_encrypted || !data.provider_base_url) return null;

  const token = await decryptWebhookSecret(
    admin,
    data.provider_token_encrypted as unknown as string,
  );
  if (!token) return null;
  const clientToken = data.provider_client_token_encrypted
    ? await decryptWebhookSecret(
        admin,
        data.provider_client_token_encrypted as unknown as string,
      )
    : null;

  return {
    provider: input.provider,
    externalId: data.provider_external_id as string,
    baseUrl: String(data.provider_base_url).replace(/\/$/, ""),
    token,
    clientToken,
  };
}

export function zApiUrl(creds: DirectCredentials, operation: string): string {
  return `${creds.baseUrl}/instances/${encodeURIComponent(creds.externalId)}/token/${encodeURIComponent(creds.token)}/${operation}`;
}

export function zApiHeaders(creds: DirectCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(creds.clientToken ? { "Client-Token": creds.clientToken } : {}),
  };
}
