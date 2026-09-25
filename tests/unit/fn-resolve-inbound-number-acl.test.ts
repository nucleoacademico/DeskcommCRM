import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260925221035_0403_restrict_fn_resolve_inbound_number.sql",
  ),
  "utf8",
);
const baseline = readFileSync(join(process.cwd(), "supabase/baseline.sql"), "utf8");

function contract(sql: string) {
  return {
    revokesAuthenticated:
      /revoke\s+execute\s+on\s+function\s+public\.fn_resolve_inbound_number\(text\)[\s\S]{0,100}from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i.test(
        sql,
      ),
    grantsOnlyWorker:
      /grant\s+execute\s+on\s+function\s+public\.fn_resolve_inbound_number\(text\)[\s\S]{0,60}to\s+service_role\s*;/i.test(
        sql,
      ),
    fixesSearchPath:
      /fn_resolve_inbound_number\(text\)[\s\S]{0,100}set\s+search_path\s*=\s*''/i.test(sql) ||
      /security\s+definer\s+stable\s+set\s+search_path\s*=\s*''/i.test(sql),
  };
}

describe("fn_resolve_inbound_number é RPC exclusiva do worker", () => {
  it.each([
    ["migration corretiva", migration],
    ["baseline", baseline],
  ])("mantém ACL e search_path fechados no %s", (_label, sql) => {
    expect(contract(sql)).toEqual({
      revokesAuthenticated: true,
      grantsOnlyWorker: true,
      fixesSearchPath: true,
    });
  });
});
