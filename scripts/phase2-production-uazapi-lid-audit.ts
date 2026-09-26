/** Jornada descartavel UAZAPI LID: webhook publico -> banco -> Inbox online. */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const APP_ORIGIN = "https://crm.beheroesschool.com.br";
const COMPOSE_ID = "jZUbIZ73CMq9dewkRrYdu";
const REQUIRED_CONFIRMATION = "CRM_DESKCOMM_BEHEROES";

function parseEnv(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
      .map((line) => {
        const at = line.indexOf("=");
        let value = line.slice(at + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        )
          value = value.slice(1, -1);
        return [line.slice(0, at).trim(), value];
      }),
  );
}

async function deploymentEnv() {
  const base = process.env.DOKPLOY_URL?.replace(/\/dashboard.*$/, "").replace(/\/$/, "");
  const token = process.env.DOKPLOY_TOKEN;
  if (!base || !token) throw new Error("DOKPLOY_URL/DOKPLOY_TOKEN ausentes");
  const response = await fetch(`${base}/api/compose.one?composeId=${COMPOSE_ID}`, {
    headers: { "x-api-key": token },
  });
  if (!response.ok) throw new Error(`compose.one HTTP ${response.status}`);
  return parseEnv(((await response.json()) as { env?: string }).env ?? "");
}

async function main() {
  if (process.env.ALLOW_PRODUCTION_QA !== REQUIRED_CONFIRMATION)
    throw new Error("confirmacao de producao ausente");
  const env = await deploymentEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey)
    throw new Error("credenciais Supabase incompletas no deploy");

  const run = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const marker = `QA_AUDIT_${run}_UAZAPI_LID`;
  const contactName = `Contato ${marker}`;
  const password = `Qa!${randomBytes(18).toString("base64url")}8y`;
  const providerToken = randomBytes(24).toString("hex");
  const webhookPath = randomBytes(24).toString("hex");
  const externalId = `qa-uazapi-${run}`;
  const admin = createClient(url, serviceKey, {
    db: { schema: "crm_comm" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let orgId: string | null = null;
  let userId: string | null = null;
  let browser;

  try {
    const org = await admin
      .from("organizations")
      .insert({
        slug: `qa-uazapi-${run}`,
        display_name: marker,
        legal_name: marker,
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        onboarded_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (org.error || !org.data) throw new Error(`criar org: ${org.error?.message}`);
    orgId = (org.data as { id: string }).id;

    const created = await admin.auth.admin.createUser({
      email: `qa-aud009-${run}@example.invalid`,
      password,
      email_confirm: true,
      user_metadata: { full_name: marker },
    });
    if (created.error || !created.data.user)
      throw new Error(`criar usuario: ${created.error?.message}`);
    userId = created.data.user.id;
    const membership = await admin.from("user_organizations").insert({
      user_id: userId,
      organization_id: orgId,
      role: "manager",
      accepted_at: new Date().toISOString(),
    });
    if (membership.error) throw new Error(`membership: ${membership.error.message}`);

    const encryptedToken = await admin.rpc("fn_encrypt_oauth", { plaintext: providerToken });
    const encryptedWebhook = await admin.rpc("fn_encrypt_oauth", {
      plaintext: randomBytes(32).toString("hex"),
    });
    if (
      encryptedToken.error ||
      !encryptedToken.data ||
      encryptedWebhook.error ||
      !encryptedWebhook.data
    ) {
      throw new Error(
        `cifra indisponivel: ${encryptedToken.error?.message ?? encryptedWebhook.error?.message ?? "sem retorno"}`,
      );
    }
    const session = await admin
      .from("channel_sessions")
      .insert({
        organization_id: orgId,
        provider: "uazapi",
        provider_external_id: externalId,
        provider_base_url: "https://qa.invalid",
        provider_token_encrypted: encryptedToken.data,
        phone_number: "+5511999999999",
        display_name: marker,
        status: "WORKING",
        webhook_path_token: webhookPath,
        webhook_secret_encrypted: encryptedWebhook.data,
        metadata: {},
      })
      .select("id")
      .single();
    if (session.error || !session.data) throw new Error(`criar canal: ${session.error?.message}`);

    const payload = {
      EventType: "messages",
      token: providerToken,
      message: {
        messageid: marker,
        sender: "98765432109876543@lid",
        sender_pn: "12025550123@s.whatsapp.net",
        sender_lid: "98765432109876543@lid",
        chatid: "98765432109876543@lid",
        senderName: contactName,
        messageType: "text",
        text: `mensagem ${marker}`,
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    };
    const webhookUrl = `${APP_ORIGIN}/api/v1/webhooks/channel/${webhookPath}`;
    const first = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const firstBody = await first.json().catch(() => ({}));
    const repeated = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const repeatedBody = await repeated.json().catch(() => ({}));
    if (!first.ok || !repeated.ok)
      throw new Error(`webhook HTTP ${first.status}/${repeated.status}`);

    const contact = await admin
      .from("contacts")
      .select("id, phone_number, wa_identity, wa_lid")
      .eq("organization_id", orgId)
      .eq("display_name", contactName)
      .maybeSingle();
    const message = await admin
      .from("messages")
      .select("id, conversation_id, external_id, body")
      .eq("organization_id", orgId)
      .eq("external_id", marker)
      .maybeSingle();
    if (contact.error || !contact.data)
      throw new Error(`contato LID nao persistiu: ${contact.error?.message ?? "ausente"}`);
    if (message.error || !message.data)
      throw new Error(`mensagem LID nao persistiu: ${message.error?.message ?? "ausente"}`);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    await page.goto(`${APP_ORIGIN}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
    await page.locator("#email").fill(`qa-aud009-${run}@example.invalid`);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(/\/app(?:\/|$)/, { timeout: 30_000 });
    await page.goto(`${APP_ORIGIN}/app/inbox`, { waitUntil: "domcontentloaded" });
    await page
      .getByText(contactName, { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    const dir = path.join(process.cwd(), ".audit-evidence", `uazapi-lid-${run}`);
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, "inbox-after-webhook.png"), fullPage: true });

    const contactRow = contact.data as Record<string, unknown>;
    const result = {
      run,
      executedAt: new Date().toISOString(),
      schema: "crm_comm",
      webhook: {
        firstStatus: first.status,
        repeatedStatus: repeated.status,
        firstBody,
        repeatedBody,
      },
      persistence: {
        contact: true,
        message: true,
        phone: contactRow.phone_number,
        waIdentity: contactRow.wa_identity,
        waLid: contactRow.wa_lid,
      },
      inboxVisible: true,
      secretsPersistedInEvidence: false,
    };
    await writeFile(path.join(dir, "results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.info(
      JSON.stringify({
        webhook: result.webhook,
        persistence: result.persistence,
        inboxVisible: true,
      }),
    );
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (orgId) {
      await admin.from("user_organizations").delete().eq("organization_id", orgId);
      await admin.from("organizations").delete().eq("id", orgId);
      const remaining = await admin
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("id", orgId);
      console.info(JSON.stringify({ cleanup: { remainingOrganizations: remaining.count ?? 0 } }));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
