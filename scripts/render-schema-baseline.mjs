#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , schemaArg, outputArg] = process.argv;
// PostgREST usa o nome do schema também em configurações textuais. Normalizar
// aqui segue a semântica padrão do PostgreSQL (`CRM_COMM` sem aspas vira
// `crm_comm`) e evita que o pre-request hook procure um schema com aspas no
// próprio nome.
const schema = schemaArg?.trim().toLowerCase();

if (!schema || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema)) {
  throw new Error("uso: node scripts/render-schema-baseline.mjs <schema> [arquivo-de-saida]");
}

const origem = resolve("supabase/baseline.sql");
const destino = resolve(outputArg || `supabase/baseline.${schema}.sql`);
const identificador = `"${schema.replaceAll('"', '""')}"`;
// PostgreSQL normaliza identificadores não citados para minúsculas. Manter o
// schema privado na mesma convenção evita nomes mistos difíceis de expor e
// inspecionar nas ferramentas do Supabase/PostgREST.
const schemaPrivado = `${schema}_private`;
const identificadorPrivado = `"${schemaPrivado.replaceAll('"', '""')}"`;

let sql = readFileSync(origem, "utf8");

// O dump canônico usa `public` para os objetos do CRM. No Supabase hospedado,
// extensões confiáveis vivem em `extensions` (exceto pg_trgm, já instalado em
// `public`). A chave interna do OAuth fica num schema não exposto por PostgREST.
sql = sql
  .replace(
    /set search_path\s+to\s+'public',\s*'private',\s*'extensions',\s*'pg_temp'/gi,
    `set search_path to ${identificador}, ${identificadorPrivado}, extensions, pg_temp`,
  )
  .replace(
    /set search_path\s+to\s+'private',\s*'pg_temp'/gi,
    `set search_path to ${identificadorPrivado}, pg_temp`,
  )
  .replace(/SET "search_path" TO 'public'/g, `SET "search_path" TO ${identificador}, extensions`)
  .replace(/set search_path\s*=\s*public/gi, `set search_path = ${identificador}, extensions`)
  .replace(/set search_path\s+to\s+'public'/gi, `set search_path to ${identificador}, extensions`)
  .replace(/set search_path\s+to\s+public/gi, `set search_path to ${identificador}, extensions`)
  .replace(
    /set_config\('search_path',\s*'public,\s*extensions'/gi,
    `set_config('search_path', '${identificador}, extensions'`,
  )
  .replace(
    /create schema if not exists private/gi,
    `create schema if not exists ${identificadorPrivado}`,
  )
  .replace(/schema private/gi, `schema ${identificadorPrivado}`)
  .replace(/\bprivate\./g, `${identificadorPrivado}.`)
  .replace(/'public'::regnamespace/g, `'${identificador}'::regnamespace`)
  .replace(/"public"/g, identificador)
  .replace(/\bpublic\./g, `${identificador}.`)
  .replace(/'public'/g, `'${schema}'`);

for (const extensionObject of ["vector", "vector_cosine_ops", "citext"]) {
  sql = sql.replaceAll(
    `${identificador}."${extensionObject}"`,
    `"extensions"."${extensionObject}"`,
  );
  sql = sql.replaceAll(`${identificador}.${extensionObject}`, `extensions.${extensionObject}`);
}

sql = sql
  .replaceAll(`${identificador}."gin_trgm_ops"`, `"public"."gin_trgm_ops"`)
  .replaceAll(`${identificador}.gin_trgm_ops`, `public.gin_trgm_ops`);

// `pgrst.db_pre_request` não é SQL executado neste ponto: é uma configuração
// textual que o PostgREST resolve depois. Aspas de identificador dentro desse
// valor passam a fazer parte do nome e produzem `schema ""crm_comm"" does not
// exist`, portanto o hook deve usar o identificador normalizado sem aspas.
sql = sql.replaceAll(
  `pgrst.db_pre_request = '${identificador}.`,
  `pgrst.db_pre_request = '${schema}.`,
);

const extensoes = `-- Extensões compartilhadas da instância Supabase (fora do schema do CRM).
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema public;

`;

const leftovers = sql.split("\n").filter((line) => {
  const semExtensoes = line
    .replaceAll('"public"."gin_trgm_ops"', "")
    .replaceAll("public.gin_trgm_ops", "");
  return (
    !line.trimStart().startsWith("--") &&
    /(?:\bpublic\.|"public"|schema\s+public|search_path[^\n]*\bpublic\b|'public')/i.test(
      semExtensoes,
    )
  );
});

if (leftovers.length > 0) {
  throw new Error(
    `referências de schema public não transformadas:\n${leftovers.slice(0, 20).join("\n")}`,
  );
}

sql = extensoes + sql;
writeFileSync(destino, sql);
console.log(destino);
