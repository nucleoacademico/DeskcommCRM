import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseUazapiWebhook } from "@/lib/channels/direct/webhook";
import { ingestMetaInbound } from "@/lib/channels/meta/ingest";

const state = vi.hoisted(() => ({
  inserts: 0,
  effects: 0,
  rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

vi.mock("@/lib/channels/contato-por-telefone", () => ({
  encontrarContatoPorTelefone: async () => null,
}));

vi.mock("@/lib/escalacao/numero-interno-de-aviso", () => ({
  ehNumeroInternoDeAviso: async () => false,
  registrarMensagemIgnorada: async () => undefined,
}));

vi.mock("@/lib/channels/pos-entrada", () => ({
  aplicarEfeitosPosEntrada: async () => { state.effects += 1; },
}));

function adminFalso(): SupabaseClient {
  const from = (table: string) => {
    if (table !== "messages") throw new Error(`tabela inesperada: ${table}`);
    return {
      insert: () => ({
        select: () => ({
          maybeSingle: async () => {
            state.inserts += 1;
            return state.inserts === 1
              ? { data: { id: "message-1" }, error: null }
              : { data: null, error: { code: "23505", message: "duplicate key" } };
          },
        }),
      }),
    };
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    state.rpcs.push({ name, args });
    if (name === "fn_upsert_wa_contact") return { data: "contact-1", error: null };
    if (name === "fn_upsert_wa_conversation") return { data: "conversation-1", error: null };
    return { data: null, error: null };
  };
  return { from, rpc } as unknown as SupabaseClient;
}

function eventoLid() {
  const [event] = parseUazapiWebhook(JSON.stringify({
    EventType: "messages",
    message: {
      messageid: "QA_AUDIT_20260925_UAZAPI_LID",
      sender: "98765432109876543@lid",
      sender_pn: "12025550123@s.whatsapp.net",
      sender_lid: "98765432109876543@lid",
      chatid: "98765432109876543@lid",
      senderName: "Contato QA",
      messageType: "text",
      text: "mensagem QA",
      messageTimestamp: 1_800_000_000,
    },
  }), "instance-qa");
  if (!event || event.kind !== "inbound") throw new Error("fixture não produziu inbound");
  return event.message;
}

beforeEach(() => {
  state.inserts = 0;
  state.effects = 0;
  state.rpcs = [];
});

describe("UAZAPI LID — parser até persistência idempotente", () => {
  it("envia phone e LID aos upserts e não duplica a mensagem repetida", async () => {
    const admin = adminFalso();
    const event = eventoLid();

    const first = await ingestMetaInbound(admin, event, {
      organizationId: "org-qa",
      channelSessionId: "session-qa",
    });
    const repeated = await ingestMetaInbound(admin, event, {
      organizationId: "org-qa",
      channelSessionId: "session-qa",
    });

    expect(first).toEqual({
      status: "ingested",
      messageId: "message-1",
      conversationId: "conversation-1",
    });
    expect(repeated).toEqual({ status: "duplicate" });
    expect(state.rpcs.filter((call) => call.name === "fn_upsert_wa_contact")[0]).toEqual({
      name: "fn_upsert_wa_contact",
      args: {
        p_org: "org-qa",
        p_kind: "lid",
        p_phone: "+12025550123",
        p_lid: "98765432109876543@lid",
        p_chat_id: "98765432109876543@lid",
        p_notify: "Contato QA",
      },
    });
    expect(state.inserts).toBe(2);
    expect(state.effects).toBe(1);
  });
});
