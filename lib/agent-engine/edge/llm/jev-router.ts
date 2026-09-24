/**
 * Cascata de custo da OpenRouter.
 *
 * Jev NÃO escreve a resposta: ele só decide, de forma tipada, se esta chamada
 * pode usar o pool gratuito ou se precisa do Auto Router. A decisão é sempre
 * conservadora: tool-call, baixa confiança, timeout, resposta inválida ou erro
 * de rede caem em `openrouter/auto`.
 */
import { z } from "zod";

import type { Logger } from "../../obs/logger";
import { allowlistedFetch, buildAllowlist } from "../egress";

const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

export const DEFAULT_JEV_ROUTING = {
  mode: "off" as const,
  decisionModel: "typesafe/jev-1.13",
  freeModel: "openrouter/free",
  fallbackModel: "openrouter/auto",
  minConfidence: 0.78,
  timeoutMs: 4_000,
};

export interface JevRoutingConfig {
  mode: "off" | "jev_cascade";
  decisionModel: string;
  freeModel: string;
  fallbackModel: string;
  minConfidence: number;
  timeoutMs: number;
}

export interface JevRouteInput {
  apiKey: string;
  config: JevRoutingConfig;
  purpose: string;
  conversationExcerpt: string;
  hasTools: boolean;
  abortSignal?: AbortSignal;
}

export interface JevRouteResult {
  model: string;
  route: "free" | "auto";
  confidence: number | null;
  reason: "jev" | "tools" | "low_confidence" | "jev_unavailable";
  decisionModel: string | null;
  decisionCostUsd: number | null;
}

interface JevRouteDeps {
  fetchImpl?: typeof fetch;
  log?: Logger;
}

const responseSchema = z.object({
  model: z.string().optional(),
  answers: z.object({
    route: z.object({
      type: z.literal("choice"),
      choice: z.enum(["free", "auto"]),
      confidence: z.number().min(0).max(1),
    }),
  }),
  usage: z.object({ cost: z.number().nonnegative().optional() }).optional(),
});

function auto(
  config: JevRoutingConfig,
  reason: JevRouteResult["reason"],
  extras?: {
    confidence?: number | null;
    decisionModel?: string | null;
    decisionCostUsd?: number | null;
  },
): JevRouteResult {
  return {
    model: config.fallbackModel,
    route: "auto",
    confidence: extras?.confidence ?? null,
    reason,
    decisionModel: extras?.decisionModel ?? null,
    decisionCostUsd: extras?.decisionCostUsd ?? null,
  };
}

/**
 * Decide o modelo de resposta sem jamais transformar o roteador em ponto único
 * de falha. O trecho da conversa é limitado pelo chamador e nunca vai a logs.
 */
export async function decideJevRoute(
  input: JevRouteInput,
  deps: JevRouteDeps = {},
): Promise<JevRouteResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs);
  const abortFromParent = () => controller.abort(input.abortSignal?.reason);
  input.abortSignal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await allowlistedFetch(
      OPENROUTER_DECISIONS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.config.decisionModel,
          state: {
            purpose: input.purpose,
            has_tools: input.hasTools,
            conversation_excerpt: input.conversationExcerpt,
          },
          questions: {
            route: {
              type: "choice",
              instructions:
                "Choose the least expensive safe route for this CRM task. Prefer free only when the task is routine and low consequence.",
              criteria: {
                free: "Simple classification, extraction, summarization, formatting, or routine conversational text. No financial, legal, security, pricing, eligibility, policy, contractual promise, complex multi-step reasoning, or material ambiguity.",
                auto: "Requires stronger reasoning or reliability; involves financial, legal, security, pricing, eligibility, policy, contractual promises, ambiguity, long context, or multiple dependent steps.",
              },
            },
          },
        }),
        signal: controller.signal,
      },
      {
        allowlist: buildAllowlist([OPENROUTER_DECISIONS_URL]),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.log ? { log: deps.log } : {}),
      },
    );

    if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("resposta Jev inválida");

    const answer = parsed.data.answers.route;
    const metadata = {
      confidence: answer.confidence,
      decisionModel: parsed.data.model ?? input.config.decisionModel,
      decisionCostUsd: parsed.data.usage?.cost ?? null,
    };
    // Jev continua sendo a entrada de análise, mas pool gratuito com tools
    // seria uma aposta desnecessária: embora o Free Router filtre por
    // capacidade, a seleção entre os elegíveis é aleatória.
    if (input.hasTools) return auto(input.config, "tools", metadata);
    if (answer.choice !== "free") return auto(input.config, "jev", metadata);
    if (answer.confidence < input.config.minConfidence) {
      return auto(input.config, "low_confidence", metadata);
    }

    return {
      model: input.config.freeModel,
      route: "free",
      reason: "jev",
      ...metadata,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) throw error;
    deps.log?.warn("llm: Jev indisponível; seguindo pelo Auto Router", {
      purpose: input.purpose,
      error_name: error instanceof Error ? error.name : "unknown",
    });
    return auto(input.config, "jev_unavailable");
  } finally {
    clearTimeout(timeout);
    input.abortSignal?.removeEventListener("abort", abortFromParent);
  }
}
