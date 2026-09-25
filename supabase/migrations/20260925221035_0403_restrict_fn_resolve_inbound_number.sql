-- 0403 / AUD-012: esta RPC atravessa RLS de propósito para o worker de voz localizar
-- o tenant pelo DNIS. Portanto ela é estritamente service-only: uma sessão de
-- usuário, mesmo autenticada, não pode enumerar roteamento de outros tenants.
revoke execute on function public.fn_resolve_inbound_number(text)
  from public, anon, authenticated;
grant execute on function public.fn_resolve_inbound_number(text)
  to service_role;

-- A consulta já usa nomes qualificados; fechar o search_path elimina resolução
-- acidental de objetos do chamador dentro de uma SECURITY DEFINER.
alter function public.fn_resolve_inbound_number(text)
  set search_path = '';

comment on function public.fn_resolve_inbound_number(text) is
  'Resolve DNIS para o worker de voz. SECURITY DEFINER e EXECUTE exclusivo de service_role.';

notify pgrst, 'reload schema';
