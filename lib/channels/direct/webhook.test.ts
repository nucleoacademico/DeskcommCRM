import { describe, expect, it } from "vitest";

import { parseUazapiWebhook, parseZApiWebhook } from "./webhook";

describe("webhooks dos canais por API", () => {
  it("transforma mensagem recebida da UAZAPI sem carregar o token para o evento", () => {
    const events = parseUazapiWebhook(
      JSON.stringify({
        EventType: "messages",
        token: "segredo-que-nao-pode-vazar",
        message: {
          messageid: "msg-uaz-1",
          sender: "5531999999999@s.whatsapp.net",
          senderName: "Cliente",
          fromMe: false,
          messageType: "text",
          text: "Olá",
          messageTimestamp: 1_800_000_000,
        },
      }),
      "instancia-a",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "inbound",
      message: { externalId: "msg-uaz-1", from: "5531999999999", text: "Olá" },
    });
    expect(JSON.stringify(events)).not.toContain("segredo-que-nao-pode-vazar");
  });

  it.each([
    ["brasileiro", "5531999999999@s.whatsapp.net", "+5531999999999"],
    ["internacional", "12025550123@s.whatsapp.net", "+12025550123"],
  ])("normaliza telefone %s dentro do limite E.164", (_label, sender, esperado) => {
    const [event] = parseUazapiWebhook(JSON.stringify({
      EventType: "messages",
      message: { messageid: `msg-${_label}`, sender, chatid: sender, text: "oi" },
    }), "instancia-a");

    expect(event).toMatchObject({
      kind: "inbound",
      message: {
        whatsappIdentity: { kind: "phone", phone: esperado, lid: null, chatId: sender },
      },
    });
  });

  it("preserva LID opaco em vez de projetá-lo como telefone", () => {
    const [event] = parseUazapiWebhook(JSON.stringify({
      EventType: "messages",
      message: {
        messageid: "msg-lid",
        sender: "98765432109876543@lid",
        chatid: "98765432109876543@lid",
        text: "oi",
      },
    }), "instancia-a");

    expect(event).toMatchObject({
      kind: "inbound",
      message: {
        from: "98765432109876543",
        whatsappIdentity: {
          kind: "lid",
          phone: null,
          lid: "98765432109876543@lid",
          chatId: "98765432109876543@lid",
        },
      },
    });
  });

  it("prioriza sender_pn como telefone e mantém sender_lid para correlação", () => {
    const [event] = parseUazapiWebhook(JSON.stringify({
      EventType: "messages",
      message: {
        messageid: "msg-pn-lid",
        sender: "98765432109876543@lid",
        sender_pn: "12025550123@s.whatsapp.net",
        sender_lid: "98765432109876543@lid",
        chatid: "98765432109876543@lid",
        text: "oi",
      },
    }), "instancia-a");

    expect(event).toMatchObject({
      kind: "inbound",
      message: {
        from: "12025550123",
        whatsappIdentity: {
          kind: "lid",
          phone: "+12025550123",
          lid: "98765432109876543@lid",
          chatId: "98765432109876543@lid",
        },
      },
    });
  });

  it("aceita sender_lid tipado mesmo sem sufixo", () => {
    const [event] = parseUazapiWebhook(JSON.stringify({
      EventType: "messages",
      message: {
        messageid: "msg-lid-explicito",
        sender_lid: "opaque-lid-value",
        chatid: "opaque-lid-value@lid",
        text: "oi",
      },
    }), "instancia-a");

    expect(event).toMatchObject({
      kind: "inbound",
      message: { whatsappIdentity: { kind: "lid", phone: null, lid: "opaque-lid-value" } },
    });
  });

  it.each([
    ["grupo", { isGroup: true, chatid: "120363000000000000@g.us", sender: "5511999999999@s.whatsapp.net" }, "group"],
    ["newsletter", { chatid: "123456789012345@newsletter", sender: "123456789012345@newsletter" }, "newsletter"],
  ])("distingue %s e não o transforma em contato", (_label, payload, reason) => {
    const events = parseUazapiWebhook(JSON.stringify({
      EventType: "messages",
      message: { messageid: `msg-${_label}`, ...payload, text: "oi" },
    }), "instancia-a");
    expect(events).toEqual([{ kind: "ignored", reason }]);
  });

  it("recusa payload incompleto sem fabricar identidade", () => {
    expect(parseUazapiWebhook(JSON.stringify({
      EventType: "messages",
      message: { messageid: "msg-incompleta", text: "oi" },
    }), "instancia-a")).toEqual([{ kind: "ignored", reason: "unsupported_identity" }]);
    expect(parseUazapiWebhook(JSON.stringify({
      EventType: "messages",
      message: { sender: "5511999999999@s.whatsapp.net", text: "oi" },
    }), "instancia-a")).toEqual([]);
  });

  it("ignora o eco de envio da UAZAPI", () => {
    const events = parseUazapiWebhook(
      JSON.stringify({
        EventType: "messages",
        message: { id: "eco", sender: "5531999999999", fromMe: true, text: "oi" },
      }),
      "instancia-a",
    );
    expect(events).toEqual([]);
  });

  it("transforma imagem recebida da Z-API e preserva URL para persistência", () => {
    const events = parseZApiWebhook(
      JSON.stringify({
        type: "ReceivedCallback",
        instanceId: "instancia-z",
        messageId: "msg-z-1",
        phone: "5531888888888",
        fromMe: false,
        senderName: "Cliente Z",
        momment: 1_800_000_000_000,
        image: {
          imageUrl: "https://cdn.example.test/imagem.jpg",
          mimeType: "image/jpeg",
          caption: "comprovante",
        },
      }),
      "instancia-z",
    );
    expect(events[0]).toMatchObject({
      kind: "inbound",
      message: {
        type: "image",
        text: "comprovante",
        media: { url: "https://cdn.example.test/imagem.jpg", mime: "image/jpeg" },
      },
    });
  });

  it("mapeia confirmação de entrega da Z-API", () => {
    const events = parseZApiWebhook(
      JSON.stringify({
        type: "DeliveryCallback",
        instanceId: "instancia-z",
        messageId: "msg-z-2",
      }),
      "instancia-z",
    );
    expect(events).toEqual([{ kind: "status", externalIds: ["msg-z-2"], status: "sent" }]);
  });
});
