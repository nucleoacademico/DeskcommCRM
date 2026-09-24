-- ============================================================================
-- 0402 — ROTEADORES DA OPENROUTER NO CATÁLOGO
--
-- `openrouter/auto` escolhe o modelo adequado para a chamada; `openrouter/free`
-- limita a seleção aos modelos gratuitos compatíveis com as capacidades
-- pedidas. São roteadores, portanto NÃO têm preço fixo próprio: o custo depende
-- do modelo escolhido e as colunas de preço ficam NULL, nunca zero inventado.
--
-- O Auto Router é o padrão do provider porque é o fallback conservador da
-- cascata Jev. O Free Router continua selecionável, mas não vira padrão.
-- Ids e capacidades conferidos na documentação oficial da OpenRouter em
-- 24/09/2026. Idempotente para install e update.
-- ============================================================================

update public.ai_models
   set is_default_for_provider = false
 where provider = 'openrouter'
   and model_id <> 'openrouter/auto'
   and is_default_for_provider;

insert into public.ai_models
  (provider, model_id, display_name, description, supports_tools,
   is_default_for_provider, source, synced_at, deprecated_at)
values
  ('openrouter', 'openrouter/auto', 'OpenRouter Auto Router',
   'Escolhe automaticamente o modelo mais adequado considerando capacidade, ferramentas e custo.',
   true, true, 'manual', now(), null),
  ('openrouter', 'openrouter/free', 'OpenRouter Free Router',
   'Seleciona entre modelos gratuitos compatíveis. Usado pela cascata Jev apenas em tarefas simples e de baixo risco.',
   true, false, 'manual', now(), null)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  supports_tools = excluded.supports_tools,
  is_default_for_provider = excluded.is_default_for_provider,
  deprecated_at = null;
