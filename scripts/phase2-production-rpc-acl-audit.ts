/** Prova online descartavel da ACL da RPC service-only do roteamento VoIP. */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

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
  const body = (await response.json()) as { env?: string };
  return parseEnv(body.env ?? "");
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
  const email = `qa-aud012-${run}@example.invalid`;
  const password = `Qa!${randomBytes(18).toString("base64url")}7x`;
  const admin = createClient(url, serviceKey, {
    db: { schema: "crm_comm" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const user = createClient(url, anonKey, {
    db: { schema: "crm_comm" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let userId: string | null = null;

  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user)
      throw new Error(`criar usuario: ${created.error?.message}`);
    userId = created.data.user.id;
    const signed = await user.auth.signInWithPassword({ email, password });
    if (signed.error) throw new Error(`login usuario: ${signed.error.message}`);

    const denied = await user.rpc("fn_resolve_inbound_number", { p_number: "+5511999999999" });
    const service = await admin.rpc("fn_resolve_inbound_number", { p_number: "+5511999999999" });
    const result = {
      run,
      executedAt: new Date().toISOString(),
      schema: "crm_comm",
      function: "fn_resolve_inbound_number(text)",
      authenticated: {
        accepted: denied.error === null,
        code: denied.error?.code ?? null,
        expected: "42501",
      },
      serviceRole: {
        accepted: service.error === null,
        errorCode: service.error?.code ?? null,
        returnedMatch: service.data !== null,
      },
      secretsPersisted: false,
    };
    const dir = path.join(process.cwd(), ".audit-evidence", `rpc-acl-${run}`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.info(JSON.stringify(result));
    if (
      result.authenticated.accepted ||
      result.authenticated.code !== "42501" ||
      !result.serviceRole.accepted
    )
      process.exitCode = 2;
  } finally {
    await user.auth.signOut();
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
