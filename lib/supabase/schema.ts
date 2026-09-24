const IDENTIFICADOR_POSTGRES = /^[A-Za-z_][A-Za-z0-9_$]*$/;

export const SUPABASE_DB_SCHEMA_PADRAO = "public";

/** Resolve o schema de dados da aplicação sem aceitar texto que possa virar SQL. */
export function supabaseDbSchema(valor?: string | null): string {
  const schema = valor?.trim() || SUPABASE_DB_SCHEMA_PADRAO;
  if (!IDENTIFICADOR_POSTGRES.test(schema)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_DB_SCHEMA deve ser um identificador PostgreSQL simples");
  }
  return schema;
}

export function schemaPostgresEntreAspas(valor?: string | null): string {
  return `"${supabaseDbSchema(valor).replaceAll('"', '""')}"`;
}
