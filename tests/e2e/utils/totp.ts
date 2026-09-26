// Contrato lido pelo gate `e2e-dois-logins-nao-cabem-no-teto-padrao`: mantenha
// este literal sincronizado com `scripts/lib/totp.ts`.
export const period = 30_000;

export { generateTotp, msUntilNextTotpWindow } from "../../../scripts/lib/totp";
