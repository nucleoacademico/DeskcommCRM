# Revisão de `SECURITY DEFINER` — `crm_comm`

Snapshot de produção: 25/09/2026. Escopo estrito: funções do schema
`crm_comm` que são `SECURITY DEFINER` e executáveis por `authenticated`.

## Resultado executivo

- Antes da correção havia 39 funções no recorte.
- `crm_comm.fn_resolve_inbound_number(text)` era exclusivamente de worker e
  estava exposta indevidamente. O AUD-012 removeu `PUBLIC`, `anon` e
  `authenticated`, preservou apenas `service_role` e fixou `search_path=''`.
- Restaram 38 funções. Não houve revogação em massa: RPCs de produto e helpers
  de RLS dependem da execução por usuário autenticado.
- Todas as 38 têm owner `postgres`, `SECURITY DEFINER=true`, `anon=false` e
  `authenticated=true`. Salvo indicação, também têm `service_role=true` e
  `search_path=crm_comm, extensions`.
- A inspeção é de contrato e call sites; itens “revisar” não são classificados
  como vazamento sem um teste negativo reproduzível.

## Inventário individual

| Função (`crm_comm`) | Consumidor observado | Contrato de execução | Risco / decisão |
|---|---|---|---|
| `emit_event(text,text,uuid,jsonb,jsonb,uuid)` | workers, handlers e mutações autenticadas | autenticada legítima, com papel/tenant no corpo | Médio; superfície ampla, manter e cobrir eventos permitidos |
| `fn_agenda_conexoes_google_do_dono(uuid,uuid)` | consulta da Agenda/Google | RPC autenticada | Baixo; valida usuário, tenant e admin/suporte |
| `fn_agenda_ocupacao_google_do_dono(uuid,uuid,timestamptz,timestamptz)` | grade da Agenda | RPC autenticada | Baixo; valida usuário e tenant |
| `fn_agenda_settings(uuid,jsonb)` | action/API de configurações | RPC autenticada | Baixo; usa helper de papel |
| `fn_appointment_change(uuid,uuid,bigint,jsonb)` | rotas de Agenda e integrações | autenticada + serviço | Médio; mutação privilegiada, mas possui portão de papel/suporte quando há `auth.uid()` |
| `fn_buscar_trechos_das_fontes(uuid,uuid[],vector,integer,real,text)` | worker e busca RAG | autenticada + serviço | Médio; filtro programático de organização, manter testes A/B |
| `fn_can_view_conversation(uuid,uuid)` | policies e Inbox | helper autenticado de RLS | Baixo; valida identidade/papel/plataforma |
| `fn_can_view_lead(uuid,uuid)` | policies e CRM | helper autenticado de RLS | Baixo; valida identidade/papel/plataforma |
| `fn_colegas_podem_mexer_na_agenda(uuid)` | regra de edição da Agenda | leitura autenticada | Médio-baixo; revela um booleano de configuração por UUID e confia na borda; revisar hardening isolado |
| `fn_conversation_assign(uuid,uuid,uuid,text,uuid,boolean)` | Inbox/atribuição | RPC autenticada | Baixo; valida identidade, papel e organização |
| `fn_definir_aviso_de_caso(uuid,uuid,text,text,boolean,boolean)` | API de casos de IA | autenticada + serviço | Baixo; portões de papel e origem de serviço |
| `fn_definir_cliente_pela_agenda(uuid,boolean)` | ficha do contato/Agenda | RPC autenticada | Baixo; exige papel apropriado |
| `fn_definir_colegas_podem_mexer_na_agenda(uuid,boolean)` | configurações da Agenda | RPC autenticada | Baixo; exige gerente+, suporte permitido e MFA |
| `fn_estornar_comanda(uuid,uuid,text)` | financeiro/comandas | RPC autenticada | Baixo; valida ator e papel |
| `fn_finalizar_comanda(uuid,uuid,uuid,integer)` | financeiro/comandas | RPC autenticada | Baixo; valida ator e papel, operação transacional |
| `fn_google_counts_for_conflicts(uuid,uuid,text)` | sincronização Google | RPC autenticada | Baixo; valida usuário/tenant |
| `fn_google_coverage(uuid,uuid,timestamptz,timestamptz)` | cobertura Google | RPC autenticada | Baixo; valida usuário/tenant |
| `fn_google_resolve(uuid,uuid,text,text,text,text)` | resolução de conflito Google | RPC autenticada | Baixo; usa helper de papel |
| `fn_google_selection(uuid,jsonb,uuid[],uuid)` | seleção de calendários | RPC autenticada | Baixo; usa helper de papel |
| `fn_is_platform_admin()` | policies e autorização global | helper autenticado de RLS | Baixo; usa somente `auth.uid()` |
| `fn_lgpd_anonymize_contact(uuid,uuid)` | jornada LGPD | RPC autenticada; sem grant de `service_role` | Baixo; valida papel/plataforma e mantém trilha |
| `fn_log_event(uuid,text,jsonb)` | triggers de mensagens/leads | helper de emissão; hoje autenticada + serviço | Médio; não deve aceitar evento arbitrário como API pública; revisar call direto antes de eventual revoke |
| `fn_meet_action(uuid,uuid,text,uuid,text,uuid)` | rotas Google Meet | RPC autenticada | Baixo; valida papel/tenant |
| `fn_member_role_in_org(uuid,uuid)` | autorização/membership | helper autenticado | Baixo; vincula consulta ao usuário da sessão |
| `fn_mesclar_contatos(uuid,uuid,uuid[])` | mesclagem de contatos | autenticada + serviço; `search_path=''` | Baixo; valida papel e origem de serviço |
| `fn_passagem_devolvida(uuid,uuid)` | retomada humana | RPC autenticada | Baixo; valida papel/tenant |
| `fn_reply_action(uuid,uuid,text,text,text,text)` | API de respostas de IA | RPC autenticada | Baixo; valida papel/tenant |
| `fn_reserve_channel_connection(uuid,uuid,text,text,boolean)` | conexão WAHA/canais | RPC autenticada | Baixo; valida papel/tenant e idempotência |
| `fn_role_at_least(uuid,text)` | dezenas de RPCs/policies | helper autenticado de RLS | Baixo; contrato exige acesso autenticado |
| `fn_set_channel_routing(uuid,uuid,uuid[],boolean)` | configurações de roteamento | RPC autenticada | Baixo; valida papel/tenant |
| `fn_support_context()` | policies e modo suporte | helper autenticado | Baixo; deriva contexto de `auth.uid()`, sessão e MFA |
| `fn_support_storage_write_allowed(text)` | policies de Storage | helper autenticado de RLS | Baixo; necessário para a policy; não é RPC de produto |
| `fn_support_write_allowed(uuid)` | policies e mutações | helper autenticado de RLS | Baixo; necessário para autorização contextual |
| `fn_user_org_ids()` | policies de praticamente todo o schema | helper autenticado de RLS | Baixo; revogar quebraria o isolamento normal |
| `fn_user_role_in(uuid)` | policies/guards | helper autenticado de RLS | Baixo; necessário ao RBAC |
| `fn_user_role_in_org(uuid)` | policies/guards | helper autenticado de RLS | Baixo; usa `auth.uid()` e suporte ativo |
| `fn_vocabulario_de_tags_operar(uuid,text,text,text,text)` | API/configuração de tags | RPC autenticada | Baixo; exige manager+ antes de escrever |
| `retrieve_top_k_chunks(uuid,uuid,vector,integer,real)` | worker/busca RAG legada | autenticada + serviço | Médio; filtro programático de organização, manter teste A/B |

## RPC corrigida — AUD-012

| Função | Owner | Definer | ACL final | `search_path` | Consumidor | Resultado |
|---|---|---:|---|---|---|---|
| `crm_comm.fn_resolve_inbound_number(text)` | `postgres` | sim | `postgres`, `service_role` | vazio | worker de voz | `authenticated` 403/42501; `service_role` 200 |

O corpo referencia `crm_comm.phone_numbers` de forma qualificada. A migration
corretiva, o baseline e o banco publicado terminam com o mesmo contrato.

## Próximas verificações focalizadas

1. Testar chamada direta de `fn_log_event` com sessão sem membership; se aceitar
   evento arbitrário, convertê-la em helper interno/service-only sem quebrar triggers.
2. Testar enumeração cross-tenant do único booleano retornado por
   `fn_colegas_podem_mexer_na_agenda`; endurecer no corpo se houver impacto útil.
3. Manter testes A/B de RAG para as duas funções de busca vetorial.

Nenhum desses três pontos autoriza revogação coletiva: cada mudança precisa de
reprodução, call-site confirmado, migration própria e reteste positivo/negativo.
