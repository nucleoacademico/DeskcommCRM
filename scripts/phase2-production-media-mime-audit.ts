/** Prova online: UAZAPI envia octet-stream; bytes PNG vencem e sao derivados. */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (process.env.ALLOW_PRODUCTION_QA !== REQUIRED_CONFIRMATION)
    throw new Error("confirmacao de producao ausente");
  const env = await deploymentEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("credenciais Supabase incompletas no deploy");
  const admin = createClient(url, serviceKey, {
    db: { schema: "crm_comm" },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const run = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const marker = `QA_AUDIT_${run}_MIME`;
  const bucket = `qa-media-${run.toLowerCase()}`;
  const sourceObject = "source.bin";
  const providerToken = randomBytes(24).toString("hex");
  const webhookPath = randomBytes(24).toString("hex");
  let orgId: string | null = null;
  let storedPath: string | null = null;

  try {
    const createdBucket = await admin.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 5_000_000,
    });
    if (createdBucket.error) throw new Error(`criar bucket QA: ${createdBucket.error.message}`);
    const png = await readFile(
      path.join(process.cwd(), "evidence", "marca", "crm-login-claro.png"),
    );
    const uploaded = await admin.storage
      .from(bucket)
      .upload(sourceObject, png, { contentType: "application/octet-stream", upsert: false });
    if (uploaded.error) throw new Error(`upload QA: ${uploaded.error.message}`);
    const publicUrl = admin.storage.from(bucket).getPublicUrl(sourceObject).data.publicUrl;
    const sourceProbe = await fetch(publicUrl);
    const sourceContentType = sourceProbe.headers.get("content-type")?.split(";", 1)[0] ?? null;
    if (sourceContentType !== "application/octet-stream")
      throw new Error(`fonte nao preservou octet-stream: ${sourceContentType}`);

    const org = await admin
      .from("organizations")
      .insert({
        slug: `qa-mime-${run}`,
        display_name: marker,
        legal_name: marker,
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        onboarded_at: new Date().toISOString(),
        // Espelha o tenant real Be Heroes: a derivacao precisa medir o caminho
        // OpenRouter/JEV contratado, nao o default Anthropic de uma org crua.
        settings: {
          llm: {
            provider: "openrouter",
            default_model: "openrouter/auto",
            routing: {
              mode: "jev_cascade",
              decision_model: "typesafe/jev-1.13",
              free_model: "openrouter/free",
              fallback_model: "openrouter/auto",
              min_confidence: 0.78,
              timeout_ms: 4000,
            },
          },
        },
      })
      .select("id")
      .single();
    if (org.error || !org.data) throw new Error(`criar org: ${org.error?.message}`);
    orgId = (org.data as { id: string }).id;

    const encryptedToken = await admin.rpc("fn_encrypt_oauth", { plaintext: providerToken });
    const encryptedWebhook = await admin.rpc("fn_encrypt_oauth", {
      plaintext: randomBytes(32).toString("hex"),
    });
    if (!encryptedToken.data || !encryptedWebhook.data)
      throw new Error("cifra de canal indisponivel");
    const session = await admin
      .from("channel_sessions")
      .insert({
        organization_id: orgId,
        provider: "uazapi",
        provider_external_id: `qa-uazapi-${run}`,
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
        sender: "12025550124@s.whatsapp.net",
        sender_pn: "12025550124@s.whatsapp.net",
        chatid: "12025550124@s.whatsapp.net",
        senderName: marker,
        messageType: "image",
        imageUrl: publicUrl,
        mimetype: "application/octet-stream",
        caption: marker,
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    };
    const webhook = await fetch(`${APP_ORIGIN}/api/v1/webhooks/channel/${webhookPath}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const webhookBody = await webhook.json().catch(() => ({}));
    if (!webhook.ok) throw new Error(`webhook HTTP ${webhook.status}`);

    let message: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 36; attempt++) {
      const selected = await admin
        .from("messages")
        .select(
          "id, media_mime, media_storage_path, media_size_bytes, media_derived_status, media_derived_text, metadata",
        )
        .eq("organization_id", orgId)
        .eq("external_id", marker)
        .maybeSingle();
      if (selected.error) throw new Error(`ler mensagem: ${selected.error.message}`);
      message = selected.data as Record<string, unknown> | null;
      if (message?.media_storage_path) storedPath = String(message.media_storage_path);
      if (message?.media_derived_status === "ready" || message?.media_derived_status === "failed")
        break;
      await delay(5_000);
    }
    if (!message) throw new Error("mensagem de midia nao persistiu");

    const events = await admin
      .from("event_log")
      .select("event_type, status, attempts, last_error")
      .eq("organization_id", orgId)
      .in("event_type", ["media.persist_requested", "media.derive_requested"])
      .order("created_at", { ascending: true });
    const result = {
      run,
      executedAt: new Date().toISOString(),
      schema: "crm_comm",
      sourceContentType,
      webhook: { status: webhook.status, body: webhookBody },
      message: {
        stored: Boolean(message.media_storage_path),
        persistedMime: message.media_mime,
        bytes: message.media_size_bytes,
        derivedStatus: message.media_derived_status,
        hasDerivedText:
          typeof message.media_derived_text === "string" && message.media_derived_text.length > 0,
        mediaStatus: (message.metadata as Record<string, unknown> | null)?.media_status ?? null,
      },
      events: events.data ?? [],
      secretsPersistedInEvidence: false,
    };
    const dir = path.join(process.cwd(), ".audit-evidence", `media-mime-${run}`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.info(JSON.stringify(result));
    if (
      !result.message.stored ||
      result.message.persistedMime !== "image/png" ||
      result.message.derivedStatus !== "ready"
    )
      process.exitCode = 2;
  } finally {
    if (storedPath) await admin.storage.from("whatsapp-media").remove([storedPath]);
    await admin.storage
      .from(bucket)
      .remove([sourceObject])
      .catch(() => undefined);
    await admin.storage.deleteBucket(bucket).catch(() => undefined);
    if (orgId) {
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
