/**
 * Auditoria controlada de RBAC contra a instalacao de producao.
 *
 * Este script e intencionalmente separado do Playwright normal: a configuracao
 * E2E do projeto bloqueia producao. Ele cria uma organizacao vazia e usuarios
 * descartaveis, testa paginas/APIs e remove tudo no finally.
 *
 * Requer ALLOW_PRODUCTION_QA=CRM_DESKCOMM_BEHEROES e credenciais do Dokploy no
 * ambiente. Segredos nunca sao gravados no relatorio.
 */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { generateTotp, msUntilNextTotpWindow } from "../tests/e2e/utils/totp";

const COMPOSE_ID = "jZUbIZ73CMq9dewkRrYdu";
const REQUIRED_CONFIRMATION = "CRM_DESKCOMM_BEHEROES";
const APP_ORIGIN = "https://crm.beheroesschool.com.br";
const marker = `QA_AUDIT_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}_RBAC`;
const evidenceDir = path.join(process.cwd(), ".audit-evidence", marker.toLowerCase());

type Role = "viewer" | "agent" | "manager" | "admin";
type Env = Record<string, string>;

interface QaUser {
  id: string;
  email: string;
  role: Role;
  totpSecret?: string;
}

interface RouteCheck {
  role: Role;
  route: string;
  expected: "allowed" | "denied";
  finalUrl: string;
  result: "allowed" | "denied" | "unexpected";
  status: number | null;
}

interface ApiCheck {
  role: Role;
  endpoint: string;
  expected: "allowed" | "denied";
  status: number;
  result: "allowed" | "denied" | "unexpected";
}

function parseEnv(raw: string): Env {
  const parsed: Env = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

async function loadDeploymentEnv(): Promise<Env> {
  const dokployUrl = process.env.DOKPLOY_URL?.replace(/\/dashboard.*$/, "").replace(/\/$/, "");
  const token = process.env.DOKPLOY_TOKEN;
  if (!dokployUrl || !token) throw new Error("DOKPLOY_URL/DOKPLOY_TOKEN ausentes");
  const response = await fetch(`${dokployUrl}/api/compose.one?composeId=${COMPOSE_ID}`, {
    headers: { "x-api-key": token },
  });
  if (!response.ok) throw new Error(`Dokploy compose.one respondeu ${response.status}`);
  const compose = (await response.json()) as { env?: string };
  const env = parseEnv(compose.env ?? "");
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!env[key]) throw new Error(`Variavel obrigatoria ausente no deploy: ${key}`);
  }
  return env;
}

async function enrollTotp(
  url: string,
  anonKey: string,
  user: QaUser,
  password: string,
): Promise<string> {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (signInError) throw new Error(`login para cadastro MFA: ${signInError.message}`);
  const { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: marker,
  });
  if (enrollError || !enrolled) throw new Error(`cadastro MFA: ${enrollError?.message}`);
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
    factorId: enrolled.id,
  });
  if (challengeError || !challenge) throw new Error(`desafio MFA: ${challengeError?.message}`);
  const { error: verifyError } = await client.auth.mfa.verify({
    factorId: enrolled.id,
    challengeId: challenge.id,
    code: generateTotp(enrolled.totp.secret),
  });
  if (verifyError) throw new Error(`verificacao MFA: ${verifyError.message}`);
  await client.auth.signOut();
  return enrolled.totp.secret;
}

async function login(page: Page, user: QaUser, password: string): Promise<void> {
  await page.goto(`${APP_ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  // Em producao o HTML chega antes do bundle; preencher antes da hidratacao faz
  // o React Hook Form reaplicar os defaultValues vazios e apagar credenciais.
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(password);
  if ((await page.locator("#email").inputValue()) !== user.email)
    throw new Error("email nao permaneceu no formulario");
  if ((await page.locator("#password").inputValue()) !== password)
    throw new Error("senha nao permaneceu no formulario");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  if (user.totpSecret) {
    try {
      await page.waitForURL(/\/login\/mfa/, { timeout: 30_000 });
    } catch (error) {
      const alert = await page.locator('[role="alert"]').allTextContents();
      await page.screenshot({
        path: path.join(evidenceDir, `${user.role}-login-failure.png`),
        fullPage: true,
      });
      throw new Error(
        `${user.role} nao chegou ao MFA: ${alert.join(" | ") || "sem mensagem na tela"}; ${String(error)}`,
      );
    }
    if (msUntilNextTotpWindow() < 3_000) await page.waitForTimeout(msUntilNextTotpWindow() + 300);
    await page.locator('input[aria-label="Dígito 1"]').click();
    await page.keyboard.type(generateTotp(user.totpSecret), { delay: 50 });
  }
  try {
    await page.waitForURL(/\/app(?:\/|$)/, { timeout: 30_000 });
  } catch (error) {
    const alert = await page.locator('[role="alert"]').allTextContents();
    await page.screenshot({
      path: path.join(evidenceDir, `${user.role}-login-failure.png`),
      fullPage: true,
    });
    throw new Error(
      `${user.role} nao entrou no app: ${alert.join(" | ") || "sem mensagem na tela"}; ${String(error)}`,
    );
  }
}

function isAllowed(role: Role, minimum: Role): boolean {
  const rank: Record<Role, number> = { viewer: 1, agent: 2, manager: 3, admin: 4 };
  return rank[role] >= rank[minimum];
}

async function testRole(
  context: BrowserContext,
  user: QaUser,
  password: string,
  routeChecks: RouteCheck[],
  apiChecks: ApiCheck[],
): Promise<void> {
  const page = await context.newPage();
  await login(page, user, password);

  const routes: Array<{ route: string; minimum: Role }> = [
    { route: "/app/radar", minimum: "agent" },
    { route: "/app/agenda", minimum: "agent" },
    { route: "/app/campaigns", minimum: "manager" },
    { route: "/app/metrics", minimum: "agent" },
    { route: "/app/team", minimum: "manager" },
    { route: "/app/calls", minimum: "manager" },
  ];
  for (const route of routes) {
    const response = await page.goto(`${APP_ORIGIN}${route.route}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    const expected = isAllowed(user.role, route.minimum) ? "allowed" : "denied";
    const denied = new URL(page.url()).pathname === "/403";
    const result = denied
      ? "denied"
      : new URL(page.url()).pathname === route.route
        ? "allowed"
        : "unexpected";
    routeChecks.push({
      role: user.role,
      route: route.route,
      expected,
      finalUrl: new URL(page.url()).pathname,
      result,
      status: response?.status() ?? null,
    });
    if (result !== expected)
      throw new Error(`${user.role} ${route.route}: esperado ${expected}, obtido ${result}`);
  }

  const apis: Array<{ endpoint: string; minimum: Role }> = [
    { endpoint: "/api/v1/leads/at-risk", minimum: "agent" },
    { endpoint: "/api/v1/agenda/pessoas", minimum: "agent" },
    { endpoint: "/api/v1/campaigns", minimum: "manager" },
    { endpoint: "/api/v1/metrics/attendants", minimum: "agent" },
    { endpoint: "/api/v1/team", minimum: "manager" },
    { endpoint: "/api/v1/calls", minimum: "manager" },
  ];
  for (const api of apis) {
    const response = await page.request.get(`${APP_ORIGIN}${api.endpoint}`);
    const status = response.status();
    const expected = isAllowed(user.role, api.minimum) ? "allowed" : "denied";
    const denied = status === 401 || status === 403;
    const result = denied ? "denied" : status < 500 ? "allowed" : "unexpected";
    apiChecks.push({ role: user.role, endpoint: api.endpoint, expected, status, result });
    if (result !== expected)
      throw new Error(`${user.role} ${api.endpoint}: esperado ${expected}, HTTP ${status}`);
  }

  await page.goto(`${APP_ORIGIN}/app/inbox`, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: path.join(evidenceDir, `${user.role}-inbox.png`), fullPage: true });
  await page.close();
}

async function cleanup(
  admin: SupabaseClient<unknown, "crm_comm", unknown>,
  users: QaUser[],
  orgId: string | null,
) {
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) console.error(`[cleanup] usuario ${user.role}: ${error.message}`);
  }
  if (orgId) {
    await admin.from("user_organizations").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    if (error) console.error(`[cleanup] organizacao: ${error.message}`);
  }
}

async function main(): Promise<void> {
  if (process.env.ALLOW_PRODUCTION_QA !== REQUIRED_CONFIRMATION) {
    throw new Error(`Execucao recusada: defina ALLOW_PRODUCTION_QA=${REQUIRED_CONFIRMATION}`);
  }
  await mkdir(evidenceDir, { recursive: true });
  const deployment = await loadDeploymentEnv();
  const supabaseUrl = deployment.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = deployment.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin = createClient(supabaseUrl, deployment.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "crm_comm" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const password = `Qa!${randomBytes(18).toString("base64url")}9z`;
  const users: QaUser[] = [];
  let orgId: string | null = null;
  const routeChecks: RouteCheck[] = [];
  const apiChecks: ApiCheck[] = [];
  let browser;

  try {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        slug: marker.toLowerCase().replaceAll("_", "-"),
        display_name: marker,
        legal_name: marker,
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        onboarded_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (orgError || !org) throw new Error(`criar organizacao QA: ${orgError?.message}`);
    orgId = (org as { id: string }).id;

    for (const role of ["viewer", "agent", "manager", "admin"] as const) {
      const email = `${marker.toLowerCase()}-${role}@example.invalid`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `${marker} ${role}` },
      });
      if (error || !data.user) throw new Error(`criar usuario ${role}: ${error?.message}`);
      const user: QaUser = { id: data.user.id, email, role };
      users.push(user);
      const { error: membershipError } = await admin.from("user_organizations").insert({
        user_id: user.id,
        organization_id: orgId,
        role,
        accepted_at: new Date().toISOString(),
      });
      if (membershipError) throw new Error(`membership ${role}: ${membershipError.message}`);

      // Isola problema de credencial do caminho Server Action/cookie do app.
      const credentialProbe = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: credentialError } = await credentialProbe.auth.signInWithPassword({
        email,
        password,
      });
      if (credentialError)
        throw new Error(`preflight de credencial ${role}: ${credentialError.message}`);
      await credentialProbe.auth.signOut();
    }
    users.find((user) => user.role === "admin")!.totpSecret = await enrollTotp(
      supabaseUrl,
      anonKey,
      users.find((user) => user.role === "admin")!,
      password,
    );

    browser = await chromium.launch({ headless: true });
    for (const user of users) {
      const context = await browser.newContext({
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
      });
      await testRole(context, user, password, routeChecks, apiChecks);
      await context.close();
    }

    const report = {
      marker,
      executedAt: new Date().toISOString(),
      target: APP_ORIGIN,
      schema: "crm_comm",
      secretsPersisted: false,
      routes: routeChecks,
      apis: apiChecks,
      summary: {
        routeChecks: routeChecks.length,
        apiChecks: apiChecks.length,
        passed: [...routeChecks, ...apiChecks].filter((item) => item.result === item.expected)
          .length,
        failed: [...routeChecks, ...apiChecks].filter((item) => item.result !== item.expected)
          .length,
      },
    };
    await writeFile(
      path.join(evidenceDir, "results.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    console.info(JSON.stringify(report.summary));
  } finally {
    if (browser) await browser.close();
    await cleanup(admin, users, orgId);
    const { count: remainingUsers } = await admin
      .from("user_organizations")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", orgId ?? "00000000-0000-0000-0000-000000000000");
    const { count: remainingOrgs } = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("display_name", marker);
    console.info(
      JSON.stringify({
        cleanup: {
          remainingMemberships: remainingUsers ?? 0,
          remainingOrganizations: remainingOrgs ?? 0,
        },
      }),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
