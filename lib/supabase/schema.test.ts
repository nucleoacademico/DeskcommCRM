import { describe, expect, it } from "vitest";

import { schemaPostgresEntreAspas, supabaseDbSchema } from "@/lib/supabase/schema";

describe("schema Supabase configurável", () => {
  it("preserva identificador com maiúsculas e usa public como padrão", () => {
    expect(supabaseDbSchema("CRM_COMM")).toBe("CRM_COMM");
    expect(supabaseDbSchema()).toBe("public");
    expect(schemaPostgresEntreAspas("CRM_COMM")).toBe('"CRM_COMM"');
  });

  it("recusa texto que poderia alterar SQL", () => {
    expect(() => supabaseDbSchema('CRM_COMM"; drop schema public;--')).toThrow(
      /identificador PostgreSQL/,
    );
  });
});
