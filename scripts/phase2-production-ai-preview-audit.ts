/**
 * Prova controlada do caminho real de IA da organizacao Be Heroes.
 *
 * Usa um admin temporario, executa a mesma rota do botao "Testar agente",
 * registra apenas metadados nao sensiveis e remove usuario/runs/chamadas QA.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { generateTotp, msUntilNextTotpWindow } from "../tests/e2e/utils/totp";

const COMPOSE_ID = "jZUbIZ73CMq9dewkRrYdu";
const REQUIRED_CONFIRMATION = "CRM_DESKCOMM_BEHEROES";
const APP_ORIGIN = "https://crm.beheroesschool.com.br";
const marker = `QA_AI_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
const evidenceDir = path.join(process.cwd(), ".audit-evidence", marker.toLowerCase());

type Env = Record<string, string>;

function parseEnv(raw: string): Env {
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
      .map((line) => {
        const at = line.indexOf("=");
        const key = line.slice(0, at).trim();
        let value = line.slice(at + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

async function loadDeploymentEnv(): Promise<Env> {
  const base = process.env.DOKPLOY_URL?.replace(/\/dashboard.*$/, "").replace(/\/$/, "");
  const token = process.env.DOKPLOY_TOKEN;
  if (!base || !token) throw new Error("DOKPLOY_URL/DOKPLOY_TOKEN ausentes");
  const response = await fetch(`${base}/api/compose.one?composeId=${COMPOSE_ID}`, {
    headers: { "x-api-key": token },
  });
  if (!response.ok) throw new Error(`Dokploy compose.one respondeu ${response.status}`);
  const env = parseEnv(((await response.json()) as { env?: string }).env ?? "");
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!env[key]) throw new Error(`Variavel obrigatoria ausente: ${key}`);
  }
  return env;
}

async function loginWithTotp(
  page: Page,
  email: string,
  password: string,
  secret: string,
): Promise<void> {
  await page.goto(`${APP_ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/login\/mfa/, { timeout: 30_000 });
  if (msUntilNextTotpWindow() < 3_000) await page.waitForTimeout(msUntilNextTotpWindow() + 300);
  await page.locator('input[aria-label="Dígito 1"]').click();
  await page.keyboard.type(generateTotp(secret), { delay: 50 });
  await page.waitForURL(/\/app(?:\/|$)/, { timeout: 30_000 });
}

async function main(): Promise<void> {
  if (process.env.ALLOW_PRODUCTION_QA !== REQUIRED_CONFIRMATION) {
    throw new Error(`Execucao recusada: defina ALLOW_PRODUCTION_QA=${REQUIRED_CONFIRMATION}`);
  }
  await mkdir(evidenceDir, { recursive: true });
  const deployment = await loadDeploymentEnv();
  const url = deployment.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = deployment.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin = createClient(url, deployment.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "crm_comm" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const password = `Qa!${randomBytes(18).toString("base64url")}9z`;
  const email = `${marker.toLowerCase()}-${randomUUID()}@example.invalid`;
  let userId: string | null = null;
  let orgId: string | null = null;
  let runId: string | null = null;
  const llmCallIds: string[] = [];
  let browser;

  try {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id,settings")
      .eq("display_name", "Be Heroes School")
      .single();
    if (orgError || !org) throw new Error(`organizacao Be Heroes: ${orgError?.message}`);
    orgId = String(org.id);

    const { data: agent, error: agentError } = await admin
      .from("ai_agents")
      .select("id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    if (agentError || !agent) throw new Error(`agente para preview: ${agentError?.message}`);
    const agentId = String(agent.id);

    const { data: version, error: versionError } = await admin
      .from("ai_agent_versions")
      .select("id,status")
      .eq("organization_id", orgId)
      .eq("agent_id", agentId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();
    if (versionError || !version) throw new Error(`versao para preview: ${versionError?.message}`);
    const versionId = String(version.id);

    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: marker },
    });
    if (userError || !created.user) throw new Error(`usuario QA: ${userError?.message}`);
    userId = created.user.id;
    const { error: memberError } = await admin.from("user_organizations").insert({
      organization_id: orgId,
      user_id: userId,
      role: "admin",
      accepted_at: new Date().toISOString(),
    });
    if (memberError) throw new Error(`membership QA: ${memberError.message}`);

    const auth = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await auth.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`login MFA: ${signInError.message}`);
    const { data: enrolled, error: enrollError } = await auth.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: marker,
    });
    if (enrollError || !enrolled) throw new Error(`enroll MFA: ${enrollError?.message}`);
    const { data: challenge, error: challengeError } = await auth.auth.mfa.challenge({
      factorId: enrolled.id,
    });
    if (challengeError || !challenge) throw new Error(`challenge MFA: ${challengeError?.message}`);
    const { error: verifyError } = await auth.auth.mfa.verify({
      factorId: enrolled.id,
      challengeId: challenge.id,
      code: generateTotp(enrolled.totp.secret),
    });
    if (verifyError) throw new Error(`verify MFA: ${verifyError.message}`);
    await auth.auth.signOut();

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const page = await context.newPage();
    await loginWithTotp(page, email, password, enrolled.totp.secret);
    const startedAt = new Date().toISOString();
    const response = await page.request.post(
      `${APP_ORIGIN}/api/v1/ai/agents/${agentId}/versions/${versionId}/test`,
      {
        data: { sample_message: "Responda em uma frase: qual é a finalidade de um CRM?" },
        timeout: 180_000,
      },
    );
    const body = (await response.json()) as {
      data?: { run_id?: string; status?: string; final_text?: string; latency_ms?: number };
      error?: { code?: string; message?: string };
    };
    runId = body.data?.run_id ?? null;

    const { data: calls, error: callsError } = await admin
      .from("llm_calls")
      .select("id,purpose,provider,model,status,origem_da_escolha,latency_ms")
      .eq("organization_id", orgId)
      .eq("agent_id", agentId)
      .eq("purpose", "agent_preview")
      .gte("created_at", startedAt)
      .order("created_at", { ascending: true });
    if (callsError) throw new Error(`telemetria llm_calls: ${callsError.message}`);
    for (const call of calls ?? []) llmCallIds.push(String(call.id));

    const result = {
      marker,
      executedAt: new Date().toISOString(),
      target: APP_ORIGIN,
      schema: "crm_comm",
      sourceAgentModified: false,
      sourceVersionStatus: version.status,
      httpStatus: response.status(),
      apiStatus: body.data?.status ?? null,
      producedText: (body.data?.final_text?.trim().length ?? 0) > 0,
      outputCharacters: body.data?.final_text?.trim().length ?? 0,
      latencyMs: body.data?.latency_ms ?? null,
      errorCode: body.error?.code ?? null,
      calls: (calls ?? []).map((call) => ({
        purpose: call.purpose,
        provider: call.provider,
        model: call.model,
        status: call.status,
        selection: call.origem_da_escolha,
        latencyMs: call.latency_ms,
      })),
      secretsPersisted: false,
      promptOrResponsePersistedInEvidence: false,
    };
    await writeFile(
      path.join(evidenceDir, "results.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    console.info(JSON.stringify(result));
    if (!response.ok() || !result.producedText || result.calls.length === 0) process.exitCode = 2;
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (llmCallIds.length) await admin.from("llm_calls").delete().in("id", llmCallIds);
    if (runId) await admin.from("ai_agent_runs").delete().eq("id", runId);
    if (userId) {
      await admin.from("audit_log").delete().eq("actor_user_id", userId);
      await admin.from("user_organizations").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    console.info(
      JSON.stringify({ cleanup: { userRemoved: Boolean(userId), qaRunsRemoved: true } }),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
