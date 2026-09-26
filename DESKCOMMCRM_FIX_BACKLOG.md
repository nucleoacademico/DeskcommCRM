# Backlog de correções da auditoria DeskcommCRM

> Este backlog nasce da auditoria iniciada em 25/09/2026. Não autoriza correção
> automática: primeiro reproduzir, preservar evidência e confirmar o escopo.

## Priorização atual

| ID      | Prioridade | Área              | Problema                                                                                                  | Estado                         | Critério de aceite                                                                                                 |
| ------- | ---------- | ----------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| AUD-002 | P1         | Auth/email        | Supabase aceitou a recuperação e registrou envio; entrega, link e troca de senha aguardam confirmação     | 🟡 FUNCIONANDO PARCIALMENTE    | email chega; link abre domínio correto; token expira; senha muda; sessão antiga é tratada                          |
| AUD-003 | P1         | RLS/RBAC          | Banco A/B passou; falta prova online da troca/caches/realtime entre dois tenants                          | 🟡 FUNCIONANDO PARCIALMENTE    | matriz A/B passa em UI, API, realtime e banco; tentativas cruzadas retornam 403/404 e não alteram dados            |
| AUD-009 | P1         | UAZAPI/Inbox      | LID/PN corrigido; webhook real criou contato/mensagem, repetição foi idempotente e Inbox exibiu o contato | ✅ FUNCIONANDO E VALIDADA      | aprovado em produção com dados sintéticos e limpeza confirmada                                                     |
| AUD-001 | P2         | Scheduler/IA      | chamada ao `agent-dispatcher` aposentado removida; worker atual consumiu eventos reais                    | ✅ FUNCIONANDO E VALIDADA      | deploy online, scheduler sem a linha aposentada e `media.persist/derive` concluídos pelo worker atual              |
| AUD-004 | P2         | Arquitetura       | CRM compartilha Supabase com outro produto                                                                | 🟡 FUNCIONANDO PARCIALMENTE    | ownership, secrets, quotas e alertas documentados; nenhum recurso cruzado indevido; decisão de isolamento aprovada |
| AUD-006 | P2         | Integrações       | Google, email, push e Meta Ads incompletos                                                                | 🔵 REQUER CONFIGURAÇÃO EXTERNA | telas mostram estado correto; sandbox configurado; jornada ponta a ponta passa                                     |
| AUD-007 | P2         | Testes/OpenRouter | Teste lexical substituído por contrato comportamental                                                     | ✅ FUNCIONANDO E VALIDADA      | regressão completa: 13.452 aprovados, 1 expected fail, zero falhas                                                 |
| AUD-008 | P2         | Testes/Inbox      | Mocks Realtime ajustados; rejeições não tratadas eliminadas                                               | ✅ FUNCIONANDO E VALIDADA      | regressão completa sem seção `Unhandled Errors`                                                                    |
| AUD-010 | P2         | Mídia/IA          | MIME inferido pelos bytes; PNG recebido como `octet-stream` foi armazenado e derivado pela IA             | ✅ FUNCIONANDO E VALIDADA      | storage `image/png`, derivação `ready`, texto derivado presente e workers `done`                                   |
| AUD-011 | P2         | RBAC/navegação    | Catálogo, guard de página e API alinhados por papel                                                       | ✅ FUNCIONANDO E VALIDADA      | 4 papéis × 6 páginas × UI/API = 48/48 verificações online aprovadas                                                |
| AUD-012 | P2         | Segurança/VoIP    | RPC service-only revogada de `authenticated` e preservada para `service_role`                             | ✅ FUNCIONANDO E VALIDADA      | `authenticated` recebeu `42501`; `service_role` resolveu; ACL publicada coincide com migration/baseline            |
| AUD-005 | P3         | Banco             | grants e RLS contraditórios em três tabelas internas                                                      | 🟡 FUNCIONANDO PARCIALMENTE    | contrato decidido; grants/policies alinhados; teste positivo e negativo adicionado                                 |

## Fila de validação que pode gerar novos bugs

1. Login, logout, sessão, MFA, esqueci senha, convite e expiração.
2. Tenant A/B e papéis viewer, agent, manager, admin e platform_admin.
3. UAZAPI: entrada, resposta, mídia, status, reconexão, webhook e histórico.
4. CRM: contato → lead → etapa → tarefa → atividade → reload → auditoria.
5. IA: credencial → agente → versão → preview real → publicar → conversa →
   custo/execução → handoff humano.
6. Agenda: disponibilidade → tipo → compromisso → lembrete → Google.
7. Campanhas e proteção anti-ban: importação, supressão, pacing e falhas.
8. Canais e webhooks: UAZAPI, Z-API, Meta Cloud, Nuvemshop e chamadas externas.
9. Métricas, faturamento, anúncios, atividades e audit log.
10. Configurações, LGPD, API tokens, extensões, SIP e administração global.
11. Responsividade e acessibilidade em desktop, tablet e mobile.

## Modelo obrigatório para novos itens

```text
ID:
Prioridade: P0 | P1 | P2 | P3
Área:
Estado permitido:
Pré-condições:
Passos mínimos de reprodução:
Resultado esperado:
Resultado observado:
Evidências:
Impacto:
Hipótese de causa:
Correção proposta:
Teste de regressão:
Dependência externa:
```
