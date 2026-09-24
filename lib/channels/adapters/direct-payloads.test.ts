import { describe, expect, it } from "vitest";

import type { OutboundEnvelope } from "../types";
import { uazapiPayload } from "./uazapi";
import { zApiPayload } from "./z-api";

function envelope(patch: Partial<OutboundEnvelope> = {}): OutboundEnvelope {
  return {
    organizationId: "org-1",
    sessionRef: "sessao-1",
    to: "5531999999999",
    kind: "text",
    body: "Olá",
    ...patch,
  };
}

describe("payloads de saída dos canais por API", () => {
  it("monta texto UAZAPI", () => {
    expect(uazapiPayload(envelope())).toEqual({
      path: "send/text",
      body: { number: "5531999999999", text: "Olá" },
    });
  });

  it("monta mídia UAZAPI", () => {
    expect(
      uazapiPayload(
        envelope({
          kind: "image",
          media: { url: "https://cdn.example.test/a.jpg", caption: "foto", mime: "image/jpeg" },
        }),
      ),
    ).toMatchObject({ path: "send/media", body: { type: "image", text: "foto" } });
  });

  it("monta texto e imagem Z-API", () => {
    expect(zApiPayload(envelope())).toEqual({
      operation: "send-text",
      body: { phone: "5531999999999", message: "Olá" },
    });
    expect(
      zApiPayload(
        envelope({
          kind: "image",
          media: { url: "https://cdn.example.test/a.jpg", caption: "foto", mime: "image/jpeg" },
        }),
      ),
    ).toMatchObject({ operation: "send-image", body: { caption: "foto" } });
  });
});
