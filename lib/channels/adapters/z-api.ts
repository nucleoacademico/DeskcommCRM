import { createAdminClient } from "@/lib/supabase/admin";
import type { FetchedMedia } from "@/lib/messaging/media/types";
import { resolveDirectCredentials, zApiHeaders, zApiUrl } from "../direct/credentials";
import type { ChannelAdapter, ChannelHealth, OutboundEnvelope, RecipientInput } from "../types";

function digits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function zApiPayload(envelope: OutboundEnvelope): {
  operation: string;
  body: Record<string, unknown>;
} {
  const phone = envelope.to;
  if (!envelope.media) return { operation: "send-text", body: { phone, message: envelope.body ?? "" } };
  if (envelope.kind === "image") {
    return {
      operation: "send-image",
      body: { phone, image: envelope.media.url, ...(envelope.media.caption ? { caption: envelope.media.caption } : {}) },
    };
  }
  if (envelope.kind === "video") {
    return {
      operation: "send-video",
      body: { phone, video: envelope.media.url, ...(envelope.media.caption ? { caption: envelope.media.caption } : {}) },
    };
  }
  if (envelope.kind === "audio") {
    return { operation: "send-audio", body: { phone, audio: envelope.media.url } };
  }
  return {
    operation: "send-document",
    body: {
      phone,
      document: envelope.media.url,
      ...(envelope.media.filename ? { fileName: envelope.media.filename } : {}),
    },
  };
}

async function publicMedia(url: string, hintMime?: string | null): Promise<FetchedMedia> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("z_api_media_invalid_url");
  const res = await fetch(parsed, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`z_api_media_download_failed: ${res.status}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mime: res.headers.get("content-type")?.split(";")[0] || hintMime || "application/octet-stream",
  };
}

export const zApiAdapter: ChannelAdapter = {
  provider: "z_api",
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
    notConfigured: "z_api_not_configured",
    sendFailed: "z_api_error",
    unknownError: "z_api_unknown",
  },
  async checkHealth(input): Promise<ChannelHealth> {
    const creds = await resolveDirectCredentials(createAdminClient(), {
      organizationId: input.organizationId,
      provider: "z_api",
      externalId: input.sessionRef,
    });
    if (!creds) return { reachable: false, status: null, detail: "sem_credencial_para_a_sessao" };
    try {
      const res = await fetch(zApiUrl(creds, "status"), {
        headers: zApiHeaders(creds),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 401 || res.status === 403) {
        return { reachable: true, status: "FAILED", detail: "credencial_recusada" };
      }
      if (!res.ok) return { reachable: true, status: "FAILED", detail: `http_${res.status}` };
      return { reachable: true, status: json.connected === true ? "WORKING" : "STOPPED", detail: null };
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
    if (envelope.kind === "contact") throw new Error("z_api_contact_not_supported");
    const creds = await resolveDirectCredentials(createAdminClient(), {
      organizationId: envelope.organizationId,
      provider: "z_api",
      externalId: envelope.sessionRef,
    });
    if (!creds) throw new Error("z_api_not_configured");
    const request = zApiPayload(envelope);
    await envelope.beforeSend?.();
    const res = await fetch(zApiUrl(creds, request.operation), {
      method: "POST",
      headers: zApiHeaders(creds),
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.error) throw new Error(`z_api_send_failed: ${res.status}`);
    const id = json.messageId ?? json.zaapId ?? json.id;
    return { externalId: typeof id === "string" ? id : null };
  },
};
