import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { NAV_CATALOG, type NavDestinationId } from "@/lib/navigation/catalogo";

const ROOT = process.cwd();
const humanRoles: Role[] = ["viewer", "agent", "manager", "admin"];

const contract = [
  { href: "/app/radar", page: "app/app/radar/page.tsx", minimum: "agent" },
  { href: "/app/agenda", page: "app/app/agenda/page.tsx", minimum: "agent" },
  { href: "/app/campaigns", page: "app/app/campaigns/page.tsx", minimum: "manager" },
  { href: "/app/metrics", page: "app/app/metrics/page.tsx", minimum: "agent" },
  { href: "/app/team", page: "app/app/team/page.tsx", minimum: "manager" },
  { href: "/app/calls", page: "app/app/calls/page.tsx", minimum: "manager" },
] as const satisfies readonly {
  href: NavDestinationId;
  page: string;
  minimum: Role;
}[];

describe("AUD-011 — menu, página e papel compartilham o mesmo contrato", () => {
  it.each(contract)("$href declara o papel mínimo no catálogo", ({ href, minimum }) => {
    const destination = NAV_CATALOG.find((item) => item.href === href);
    expect(destination?.minRole).toBe(minimum);
  });

  it.each(contract)("$href bloqueia antes de montar o client", ({ href, page }) => {
    const source = readFileSync(join(ROOT, page), "utf8");
    expect(source).toContain(`requirePageAccess(\"${href}\")`);
  });

  it.each(contract)("$href produz a matriz de quatro papéis", ({ href, minimum }) => {
    const destination = NAV_CATALOG.find((item) => item.href === href)!;
    const actual = Object.fromEntries(
      humanRoles.map((role) => [role, ROLE_RANK[role] >= ROLE_RANK[destination.minRole ?? "viewer"]]),
    );
    const expected = Object.fromEntries(
      humanRoles.map((role) => [role, ROLE_RANK[role] >= ROLE_RANK[minimum]]),
    );
    expect(actual).toEqual(expected);
  });
});
