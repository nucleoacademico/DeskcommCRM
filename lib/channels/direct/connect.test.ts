import { afterEach, describe, expect, it, vi } from "vitest";

import { validateDirectCredentials } from "./connect";

describe("validateDirectCredentials", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("remove o sufixo de dispositivo do JID da UAZAPI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            instance: { name: "barberlove-m8ilq", profileName: "Douglas Madeira", status: "connected" },
            status: { connected: true, jid: "553184800544:14@s.whatsapp.net" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      validateDirectCredentials({
        provider: "uazapi",
        baseUrl: "https://douglasmadeira.uazapi.com",
        token: "token-seguro",
      }),
    ).resolves.toMatchObject({
      externalId: "barberlove-m8ilq",
      phoneNumber: "+553184800544",
      status: "WORKING",
    });
  });
});
