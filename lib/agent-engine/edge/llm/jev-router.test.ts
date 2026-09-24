import { describe, expect, it, vi } from "vitest";

import { decideJevRoute, type JevRoutingConfig } from "./jev-router";

const config: JevRoutingConfig = {
  mode: "jev_cascade",
  decisionModel: "typesafe/jev-1.13",
  freeModel: "openrouter/free",
  fallbackModel: "openrouter/auto",
  minConfidence: 0.78,
  timeoutMs: 100,
};

function answer(choice: "free" | "auto", confidence: number) {
  return new Response(
    JSON.stringify({
      model: "typesafe/jev-1.13-20260917",
      answers: { route: { type: "choice", choice, confidence } },
      usage: { cost: 0.00001 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("decideJevRoute", () => {
  it("usa o pool gratuito quando Jev escolhe free com confiança suficiente", async () => {
    const result = await decideJevRoute(
      {
        apiKey: "segredo",
        config,
        purpose: "classifier",
        conversationExcerpt: "Classifique esta mensagem simples.",
        hasTools: false,
      },
      { fetchImpl: vi.fn(async () => answer("free", 0.92)) as typeof fetch },
    );
    expect(result).toMatchObject({ model: "openrouter/free", route: "free", reason: "jev" });
  });

  it("baixa confiança cai no Auto Router", async () => {
    const result = await decideJevRoute(
      {
        apiKey: "segredo",
        config,
        purpose: "classifier",
        conversationExcerpt: "Caso ambíguo.",
        hasTools: false,
      },
      { fetchImpl: vi.fn(async () => answer("free", 0.51)) as typeof fetch },
    );
    expect(result).toMatchObject({
      model: "openrouter/auto",
      route: "auto",
      reason: "low_confidence",
    });
  });

  it("Jev analisa tool-call, mas a execução fica no Auto Router", async () => {
    const fetchImpl = vi.fn(async () => answer("free", 0.99));
    const result = await decideJevRoute(
      {
        apiKey: "segredo",
        config,
        purpose: "agent_turn",
        conversationExcerpt: "Consulte o CRM.",
        hasTools: true,
      },
      { fetchImpl: fetchImpl as typeof fetch },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ model: "openrouter/auto", route: "auto", reason: "tools" });
  });

  it("falha do Jev preserva a resposta pelo Auto Router", async () => {
    const result = await decideJevRoute(
      {
        apiKey: "segredo",
        config,
        purpose: "agent_turn",
        conversationExcerpt: "Olá.",
        hasTools: false,
      },
      { fetchImpl: vi.fn(async () => new Response("erro", { status: 503 })) as typeof fetch },
    );
    expect(result).toMatchObject({
      model: "openrouter/auto",
      route: "auto",
      reason: "jev_unavailable",
    });
  });
});
