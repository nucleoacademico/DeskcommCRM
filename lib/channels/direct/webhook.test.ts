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
