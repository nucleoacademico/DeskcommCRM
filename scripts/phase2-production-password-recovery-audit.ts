/**
 * Smoke real do pedido de recuperacao de senha em producao.
 * Nao grava o endereco testado nem qualquer segredo em disco ou stdout.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const APP_ORIGIN = "https://crm.beheroesschool.com.br";
const REQUIRED_CONFIRMATION = "CRM_DESKCOMM_BEHEROES";

async function main(): Promise<void> {
  if (process.env.ALLOW_PRODUCTION_QA !== REQUIRED_CONFIRMATION) {
    throw new Error(`Execucao recusada: defina ALLOW_PRODUCTION_QA=${REQUIRED_CONFIRMATION}`);
  }
  const email = process.env.RECOVERY_TARGET_EMAIL;
  if (!email) throw new Error("RECOVERY_TARGET_EMAIL ausente");

  const run = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const evidenceDir = path.join(process.cwd(), ".audit-evidence", `password-recovery-${run}`);
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const responseErrors: Array<{ status: number; path: string }> = [];
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      responseErrors.push({ status: response.status(), path: url.pathname });
    }
  });

  try {
    await page.goto(`${APP_ORIGIN}/login/forgot`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
    await page.locator("#email").fill(email);
    await page.getByRole("button", { name: "Enviar link de redefinição", exact: true }).click();

    const success = page.getByText("Verifique seu e-mail", { exact: true });
    const error = page.locator('[role="alert"]');
    // A regiao de alerta existe vazia antes da server action terminar. Esperar
    // apenas por "visible" classificava a requisicao cedo demais como rejeitada.
    await page.waitForFunction(
      () => {
        const accepted = Array.from(document.querySelectorAll("body *")).some(
          (node) => node.textContent?.trim() === "Verifique seu e-mail",
        );
        const rejected = Array.from(document.querySelectorAll('[role="alert"]')).some(
          (node) => (node.textContent?.trim().length ?? 0) > 0,
        );
        return accepted || rejected;
      },
      undefined,
      { timeout: 30_000 },
    );
    const outcome = (await success.isVisible()) ? "accepted" : "rejected";
    const errorText = outcome === "rejected" ? await error.textContent() : null;
    await page.screenshot({ path: path.join(evidenceDir, "request-result.png"), fullPage: true });
    const result = {
      run,
      executedAt: new Date().toISOString(),
      target: APP_ORIGIN,
      emailPersisted: false,
      outcome,
      error: errorText,
      responseErrors,
    };
    await writeFile(
      path.join(evidenceDir, "results.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    console.info(JSON.stringify({ outcome, responseErrors }));
    if (outcome !== "accepted") process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
