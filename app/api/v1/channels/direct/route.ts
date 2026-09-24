import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  configureDirectWebhook,
  DIRECT_PROVIDERS,
  listDirectSessions,
  saveDirectSession,
  validateDirectCredentials,
} from "@/lib/channels/direct/connect";
import { isDirectProvider } from "@/lib/channels/direct/credentials";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { basePublicaDaInstalacao } from "@/lib/webhooks/url-publica";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({
  provider: z.string().trim(),
  base_url: z.string().trim().max(500).optional(),
  external_id: z.string().trim().max(200).optional(),
  token: z.string().trim().min(8).max(1000),
  client_token: z.string().trim().max(1000).optional(),
});

function webhookUrl(req: NextRequest, token: string): string {
  return `${basePublicaDaInstalacao(req)}/api/v1/webhooks/channel/${token}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_direct" });
  if (!authz.ok) return authz.response;
  try {
    const sessions = await listDirectSessions(createAdminClient(), authz.org.orgId);
    return ok(
      {
        providers: DIRECT_PROVIDERS,
        sessions: sessions.map((session) => ({
          ...session,
          webhookUrl: session.webhookPathToken
            ? webhookUrl(req, session.webhookPathToken)
            : null,
        })),
      },
      { requestId },
    );
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : "Falha ao listar canais.", 500, { requestId });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_direct" });
  if (!authz.ok) return authz.response;
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_request", "Credenciais incompletas ou provedor inválido.", 422, { requestId });
  }
  const provider = parsed.data.provider;
  if (!isDirectProvider(provider)) {
    return fail("invalid_request", "Credenciais incompletas ou provedor inválido.", 422, { requestId });
  }

  try {
    const input = {
      provider,
      baseUrl: parsed.data.base_url,
      externalId: parsed.data.external_id,
      token: parsed.data.token,
      clientToken: parsed.data.client_token,
    };
    const validation = await validateDirectCredentials(input);
    const saved = await saveDirectSession(createAdminClient(), {
      ...input,
      ...validation,
      organizationId: authz.org.orgId,
    });
    const url = webhookUrl(req, saved.session.webhookPathToken!);
    let webhookConfigured = true;
    let webhookWarning: string | null = null;
    try {
      await configureDirectWebhook({
        ...validation,
        token: saved.token,
        clientToken: saved.clientToken,
        webhookUrl: url,
      });
    } catch (err) {
      webhookConfigured = false;
      webhookWarning = err instanceof Error ? err.message : "O webhook não foi configurado.";
    }

    return ok(
      {
        connected: true,
        session: { ...saved.session, webhookUrl: url },
        webhook_configured: webhookConfigured,
        webhook_warning: webhookWarning,
      },
      { requestId },
    );
  } catch (err) {
    return fail("invalid_request", err instanceof Error ? err.message : "Não foi possível conectar.", 422, { requestId });
  }
}
