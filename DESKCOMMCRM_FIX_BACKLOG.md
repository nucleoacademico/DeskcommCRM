# Backlog de correções da auditoria DeskcommCRM

> Este backlog nasce da auditoria iniciada em 25/09/2026. Não autoriza correção
> automática: primeiro reproduzir, preservar evidência e confirmar o escopo.

## Priorização atual

| ID | Prioridade | Área | Problema | Estado | Critério de aceite |
|---|---|---|---|---|---|
| AUD-002 | P1 | Auth/email | Recuperação de senha e convites sem entrega transacional operacional | 🔵 REQUER CONFIGURAÇÃO EXTERNA | email chega; link abre domínio correto; token expira; senha muda; sessão antiga é tratada |
| AUD-003 | P1 | RLS/RBAC | Banco A/B passou; falta prova online da troca/caches/realtime entre dois tenants | 🟡 FUNCIONANDO PARCIALMENTE | matriz A/B passa em UI, API, realtime e banco; tentativas cruzadas retornam 403/404 e não alteram dados |
| AUD-009 | P1 | UAZAPI/Inbox | LID com 16–17 dígitos é tratado como telefone e a mensagem é perdida | 🔴 NÃO FUNCIONANDO | parser preserva LID, usa `sender_pn` válido, cobre grupo/newsletter, reconcilia seis eventos e prova entrada no Inbox |
| AUD-001 | P2 | Scheduler/IA | `agent-dispatcher` aposentado chamado a cada minuto | 🟡 FUNCIONANDO PARCIALMENTE | linha removida; testes ajustados; worker atual processa evento real; logs sem chamadas inúteis |
| AUD-004 | P2 | Arquitetura | CRM compartilha Supabase com outro produto | 🟡 FUNCIONANDO PARCIALMENTE | ownership, secrets, quotas e alertas documentados; nenhum recurso cruzado indevido; decisão de isolamento aprovada |
| AUD-006 | P2 | Integrações | Google, email, push e Meta Ads incompletos | 🔵 REQUER CONFIGURAÇÃO EXTERNA | telas mostram estado correto; sandbox configurado; jornada ponta a ponta passa |
| AUD-007 | P2 | Testes/OpenRouter | Teste lexical falha por estilo de aspas apesar de o ramo existir | 🟡 FUNCIONANDO PARCIALMENTE | teste comportamental substitui regex; suíte fica verde sem enfraquecer cobertura |
| AUD-008 | P2 | Testes/Inbox | Quatro rejeições assíncronas são aceitas como falso positivo | 🟡 FUNCIONANDO PARCIALMENTE | mocks expõem contrato atual; zero `Unhandled Errors`; subscriptions são encerradas |
| AUD-010 | P2 | Mídia/IA | UAZAPI persiste `octet-stream`; 11/20 derivações morreram | 🟡 FUNCIONANDO PARCIALMENTE | MIME detectado por bytes/tipo; áudio e imagem reais derivam; inválido falha uma vez com diagnóstico útil |
| AUD-011 | P2 | RBAC/navegação | Links e páginas são oferecidos a papéis cujas APIs recusam o conteúdo | 🟡 FUNCIONANDO PARCIALMENTE | catálogo, page guard e API concordam; matriz viewer/agent/manager/admin sem casca quebrada nem 403 inesperado |
| AUD-012 | P2 | Segurança/VoIP | RPC service-only está executável por qualquer `authenticated` e revela roteamento cross-tenant | 🔴 NÃO FUNCIONANDO | authenticated recebe 42501; service_role resolve; ACL de migration, baseline e produção coincide |
| AUD-005 | P3 | Banco | grants e RLS contraditórios em três tabelas internas | 🟡 FUNCIONANDO PARCIALMENTE | contrato decidido; grants/policies alinhados; teste positivo e negativo adicionado |

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
