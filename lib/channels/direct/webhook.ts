import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import type { InboundMessageEvent } from "../meta/webhook";
import type { DirectProvider } from "./credentials";

export type DirectWebhookEvent =
  | { kind: "inbound"; message: InboundMessageEvent }
  | { kind: "status"; externalIds: string[]; status: string }
  | { kind: "connection"; status: string }
  | { kind: "ignored"; reason: "group" | "newsletter" | "unsupported_identity" };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function phone(value: unknown): string | null {
  const raw = string(value);
  if (!raw) return null;
  const at = raw.indexOf("@");
  if (at >= 0) {
    const suffix = raw.slice(at).toLowerCase();
    if (suffix !== "@s.whatsapp.net" && suffix !== "@c.us") return null;
  }
  const withoutJid = at >= 0 ? raw.slice(0, at) : raw;
  const digits = withoutJid.replace(/\D/g, "");
  // E.164 comporta no máximo 15 dígitos. O teto é o que impede um LID opaco
  // de voltar a ser projetado na coluna de telefone do contato.
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

function lid(value: unknown, explicit = false): string | null {
  const raw = string(value);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!explicit && !lower.endsWith("@lid")) return null;
  if (lower.endsWith("@lid")) {
    const opaque = raw.slice(0, -4);
    return opaque ? `${opaque}@lid` : null;
  }
  // `sender_lid` é um campo tipado pela UAZAPI e pode vir sem o sufixo. Ele é
  // preservado como identidade opaca; nunca passa pelo normalizador telefônico.
  return raw;
}

function jidSuffix(value: string | null): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  return at >= 0 ? value.slice(at).toLowerCase() : null;
}

function uazapiIdentity(message: Record<string, unknown>):
  | {
      kind: "phone" | "lid";
      phone: string | null;
      lid: string | null;
      chatId: string;
      from: string;
    }
  | { ignored: "group" | "newsletter" | "unsupported_identity" } {
  const chatId = string(message.chatid, message.chatId, message.from, message.sender) ?? "";
  const sender = string(message.sender);
  const suffix = jidSuffix(chatId);

  if (message.isGroup === true || suffix === "@g.us") return { ignored: "group" };
  if (suffix === "@newsletter" || suffix === "@broadcast") return { ignored: "newsletter" };

  const resolvedPhone = phone(message.sender_pn ?? message.senderPn)
    ?? phone(sender)
    ?? phone(chatId);
  const opaqueLid = lid(message.sender_lid ?? message.senderLid, true)
    ?? lid(sender)
    ?? lid(chatId);

  if (!resolvedPhone && !opaqueLid) return { ignored: "unsupported_identity" };
  const kind: "phone" | "lid" = opaqueLid ? "lid" : "phone";
  const primary = resolvedPhone ?? opaqueLid!;
  return {
    kind,
    phone: resolvedPhone,
    lid: opaqueLid,
    chatId: chatId || primary,
    from: primary.replace(/^\+/, "").replace(/@lid$/i, ""),
  };
}

function date(value: unknown): Date {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date();
  const ms = numeric > 10_000_000_000 ? numeric : numeric * 1000;
  const parsed = new Date(ms);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function mediaType(raw: string | null): string {
  const value = (raw ?? "text").toLowerCase();
  if (value.includes("image")) return "image";
  if (value.includes("video")) return "video";
  if (value.includes("audio") || value.includes("ptt")) return "audio";
  if (value.includes("document") || value.includes("file")) return "document";
  if (value.includes("sticker")) return "sticker";
  if (value.includes("contact") || value.includes("vcard")) return "contact";
  if (value.includes("location")) return "location";
  return "text";
}

function mediaFrom(message: Record<string, unknown>, type: string) {
  if (type === "text" || type === "contact" || type === "location") return null;
  const content = object(message.content);
  const nested = object(message[type]);
  const url = string(
    message.mediaUrl,
    message.fileUrl,
    message.imageUrl,
    message.audioUrl,
    message.videoUrl,
    message.documentUrl,
    content.url,
    content.URL,
    nested.url,
  );
  if (!url) return null;
  return {
    id: url,
    url,
    mime: string(message.mimetype, message.mimeType, content.mimetype, content.mimeType, nested.mimetype),
    voice: type === "audio" && (message.ptt === true || message.isPtt === true),
  };
}

export function parseUazapiWebhook(rawBody: string, sessionRef: string): DirectWebhookEvent[] {
  const root = object(JSON.parse(rawBody));
  const eventType = (string(root.EventType, root.eventType, root.type) ?? "").toLowerCase();
  if (eventType === "messages_update" || eventType.includes("message_update")) {
    const event = object(root.event);
    const rawIds = Array.isArray(event.MessageIDs)
      ? event.MessageIDs
      : Array.isArray(root.MessageIDs)
        ? root.MessageIDs
        : [root.messageid, root.id];
    const ids = rawIds.filter((id): id is string => typeof id === "string" && id.length > 0);
    return ids.length
      ? [{ kind: "status", externalIds: ids, status: string(root.state, event.State, root.status) ?? "sent" }]
      : [];
  }
  if (eventType.includes("connection")) {
    const status = string(root.status, object(root.instance).status, object(root.event).status) ?? "unknown";
    return [{ kind: "connection", status }];
  }
  if (eventType !== "messages" && !eventType.includes("message")) return [];
  const message = object(root.message);
  if (message.fromMe === true || message.wasSentByApi === true) return [];
  const externalId = string(message.messageid, message.id, root.messageid);
  if (!externalId) return [];
  const identity = uazapiIdentity(message);
  if ("ignored" in identity) return [{ kind: "ignored", reason: identity.ignored }];
  const type = mediaType(string(message.messageType, message.type));
  const content = object(message.content);
  const text = string(message.text, content.text, content.caption, message.caption);
  return [{
    kind: "inbound",
    message: {
      kind: "inbound_message",
      wabaId: "",
      phoneNumberId: sessionRef,
      externalId,
      from: identity.from,
      whatsappIdentity: {
        kind: identity.kind,
        phone: identity.phone,
        lid: identity.lid,
        chatId: identity.chatId,
      },
      profileName: string(message.senderName, message.pushName, message.chatName),
      sentAt: date(message.messageTimestamp ?? message.timestamp ?? root.timestamp),
      type,
      text,
      media: mediaFrom(message, type),
    },
  }];
}

export function parseZApiWebhook(rawBody: string, sessionRef: string): DirectWebhookEvent[] {
  const root = object(JSON.parse(rawBody));
  const typeName = (string(root.type) ?? "").toLowerCase();
  const externalId = string(root.messageId, root.zaapId, root.id);
  if (typeName.includes("delivery") || typeName.includes("messagestatus")) {
    return externalId
      ? [{ kind: "status", externalIds: [externalId], status: root.error ? "failed" : string(root.status) ?? "sent" }]
      : [];
  }
  if (typeName.includes("connected") || typeName.includes("disconnected")) {
    return [{ kind: "connection", status: typeName.includes("disconnected") ? "STOPPED" : "WORKING" }];
  }
  if (root.fromMe === true || !externalId) return [];
  const from = phone(root.phone ?? root.senderLid);
  if (!from) return [];
  const textObject = object(root.text);
  const image = object(root.image);
  const audio = object(root.audio);
  const video = object(root.video);
  const document = object(root.document);
  // `root.type` identifica o CALLBACK (ex.: ReceivedCallback), não o conteúdo.
  // O tipo da mensagem é a chave preenchida no corpo.
  const rawType =
    Object.keys(image).length > 0
      ? "image"
      : Object.keys(audio).length > 0
        ? "audio"
        : Object.keys(video).length > 0
          ? "video"
          : Object.keys(document).length > 0
            ? "document"
            : string(object(root.message).type, root.messageType) ?? "text";
  const messageType = mediaType(rawType);
  const mediaObject =
    messageType === "image" ? image : messageType === "audio" ? audio : messageType === "video" ? video : document;
  const url = string(
    mediaObject.imageUrl,
    mediaObject.audioUrl,
    mediaObject.videoUrl,
    mediaObject.documentUrl,
    mediaObject.url,
  );
  const text = string(textObject.message, root.message, mediaObject.caption);
  return [{
    kind: "inbound",
    message: {
      kind: "inbound_message",
      wabaId: "",
      phoneNumberId: sessionRef,
      externalId,
      from,
      profileName: string(root.senderName, root.chatName),
      sentAt: date(root.momment ?? root.timestamp),
      type: messageType,
      text,
      media: url
        ? {
            id: url,
            url,
            mime: string(mediaObject.mimeType, mediaObject.mimetype),
            voice: messageType === "audio",
          }
        : null,
    },
  }];
}

export function parseDirectWebhook(
  provider: DirectProvider,
  rawBody: string,
  sessionRef: string,
): DirectWebhookEvent[] {
  return provider === "uazapi"
    ? parseUazapiWebhook(rawBody, sessionRef)
    : parseZApiWebhook(rawBody, sessionRef);
}

export async function directPayloadBelongsToSession(
  admin: SupabaseClient,
  input: {
    provider: DirectProvider;
    sessionId: string;
    sessionRef: string;
    rawBody: string;
  },
): Promise<boolean> {
  let root: Record<string, unknown>;
  try {
    root = object(JSON.parse(input.rawBody));
  } catch {
    return false;
  }
  if (input.provider === "z_api") {
    return string(root.instanceId) === input.sessionRef;
  }
  const payloadToken = string(root.token);
  if (!payloadToken) return false;
  const { data } = await admin
    .from("channel_sessions")
    .select("provider_token_encrypted")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (!data?.provider_token_encrypted) return false;
  const expected = await decryptWebhookSecret(
    admin,
    data.provider_token_encrypted as unknown as string,
  );
  return expected !== null && expected === payloadToken;
}
