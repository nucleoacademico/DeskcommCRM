-- Canais WhatsApp por API de sessão: UAZAPI e Z-API.
--
-- As credenciais são por organização/sessão e usam a mesma cifra das outras
-- integrações de canal. As colunas são genéricas porque os dois transportes
-- têm o mesmo contrato: uma referência de instância, uma base HTTP, um token e
-- um client token opcional. Nenhum segredo volta pelo PostgREST.

alter table public.channel_sessions
  add column if not exists provider_external_id text,
  add column if not exists provider_base_url text,
  add column if not exists provider_token_encrypted bytea,
  add column if not exists provider_client_token_encrypted bytea;

comment on column public.channel_sessions.provider_external_id is
  'Identificador da instância no provedor de WhatsApp por API. É o sessionRef dos providers uazapi e z_api.';
comment on column public.channel_sessions.provider_base_url is
  'Base HTTPS do provedor. Para UAZAPI pode ser o domínio próprio do servidor; para Z-API é a base pública oficial.';
comment on column public.channel_sessions.provider_token_encrypted is
  'Token da instância cifrado por fn_encrypt_oauth. Nunca retorna ao browser.';
comment on column public.channel_sessions.provider_client_token_encrypted is
  'Token adicional de segurança da conta, quando o provedor oferecer, cifrado por fn_encrypt_oauth.';

alter table public.channel_sessions drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions add constraint channel_sessions_provider_check
  check (provider in ('waha', 'meta_cloud', 'zernio', 'zernio_social', 'wacalls', 'datafy', 'uazapi', 'z_api'));

alter table public.channel_sessions drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions add constraint channel_sessions_provider_ref_check check (
  (provider = 'waha' and waha_session_name is not null) or
  (provider = 'meta_cloud' and meta_phone_number_id is not null) or
  (provider in ('zernio', 'zernio_social') and zernio_account_id is not null) or
  (provider = 'wacalls' and wacalls_session_id is not null) or
  (provider = 'datafy' and datafy_phone_number_id is not null) or
  (provider in ('uazapi', 'z_api') and provider_external_id is not null and provider_base_url is not null)
);

alter table public.webhook_events_log drop constraint if exists webhook_events_log_provider_check;
alter table public.webhook_events_log add constraint webhook_events_log_provider_check check (provider in (
  'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'datafy', 'uazapi', 'z_api'
));

create unique index if not exists channel_sessions_direct_provider_ativo_unique
  on public.channel_sessions (organization_id, provider, provider_external_id)
  where archived_at is null and provider in ('uazapi', 'z_api');
