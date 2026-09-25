# Auditoria real do DeskcommCRM Be Heroes

> Documento vivo. Início: 25/09/2026. Ambiente auditado: produção em
> `https://crm.beheroesschool.com.br`, branch `beheroes-crm-comm`, versão de saúde
> `v1.47.0-beheroes.1`. A auditoria ainda não terminou; este arquivo não é um
> certificado global de funcionamento.

## Regra de classificação

Somente estes estados são usados nas matrizes:

- ✅ FUNCIONANDO E VALIDADA
- 🟡 FUNCIONANDO PARCIALMENTE
- 🟠 IMPLEMENTADA MAS NÃO VALIDADA
- 🔴 NÃO FUNCIONANDO
- ⚫ NÃO IMPLEMENTADA
- ⚪ MOCK / PLACEHOLDER
- 🔵 REQUER CONFIGURAÇÃO EXTERNA

Severidade: P0 bloqueia ou expõe todo o sistema; P1 afeta segurança, dados ou
uma jornada central; P2 afeta uma função relevante com contorno; P3 é melhoria
ou defeito de baixo impacto.

## Escopo e método

A auditoria cruza quatro fontes de evidência, sem substituir uma pela outra:

1. inventário estático de páginas, APIs, workers, migrations e testes;
2. estado real do Supabase e configuração do deploy, sem registrar segredos;
3. chamadas HTTP e logs/efeitos persistidos;
4. jornadas E2E no navegador, incluindo recarga e confirmação no banco.

Uma tela abrir não valida sua função. Uma ação só recebe ✅ depois de interação,
resposta, persistência e recarga quando aplicável. Integrações externas só podem
receber ✅ após uma operação controlada ponta a ponta.

## Fase 1 — inventário integral

### Identidade do artefato implantado

| Item | Evidência | Estado |
|---|---|---|
| Repositório implantado | `nucleoacademico/DeskcommCRM`, branch `beheroes-crm-comm` | ✅ FUNCIONANDO E VALIDADA |
| Commit observado | `702a3e7d2a114aae54a2d0acc159151f56147339` | ✅ FUNCIONANDO E VALIDADA |
| Deploy Dokploy | projeto `CRM_DESKCOMM_BEHEROES`; último deploy concluído | ✅ FUNCIONANDO E VALIDADA |
| Saúde pública | Supabase, Redis e WAHA responderam `ok`; 50/27/10 ms na amostra | ✅ FUNCIONANDO E VALIDADA |
| Proteção sem sessão | `/app/crm` respondeu 307 para `/login?next=%2Fapp%2Fcrm` | ✅ FUNCIONANDO E VALIDADA |
| Login público | `/login` respondeu HTTP 200 em 209 ms | ✅ FUNCIONANDO E VALIDADA |

### Dimensão do sistema encontrada no código

| Superfície | Quantidade |
|---|---:|
| Páginas Next.js (`page.tsx`) | 137 |
| Rotas HTTP (`route.ts`) | 359 |
| Arquivos de server actions | 57 |
| Arquivos TS/TSX em app e componentes | 1.201 |
| Arquivos com formulários | 54 |
| Arquivos com dialog/sheet/alert | 88 |
| Hooks | 167 |
| Workers | 19 |
| Migrations SQL | 333 |
| Arquivos de teste unitário | 1.607 |
| Specs E2E | 150 |

Esses números provam superfície implementada e testabilidade potencial, não o
funcionamento do ambiente online.

### Catálogo funcional de navegação

O catálogo canônico possui 58 destinos/hubs. Abaixo está o inventário por
jornada; rotas auxiliares e páginas de detalhe entram na seção seguinte.

| Área | Destinos encontrados | Acesso mínimo predominante | Estado da área nesta fase |
|---|---|---|---|
| Atendimento | Inbox, Radar, Agenda, Respostas rápidas | viewer | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| CRM | Prospecção, Funis, Campanhas, Contatos, Tarefas, Chamadas, Produtos, Comandas, Etapas do funil | viewer a admin | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| Agente de IA | Agentes, Follow-ups, Roteadores, Credenciais, Provedores, Conhecimento, Memória, Skills, Casos, Alertas, Avisos, Propostas, Execuções, Uso e orçamento | viewer a admin | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| Canais | Conexões, Nuvemshop, Webhooks | manager/admin | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| Análise | Faturamento, Desempenho, Meta Ads, Atividades, Evolução da IA, Audit Log | viewer a manager | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| Organização | Perfil, Segurança, Notificações, Equipe, Distribuição, Tags, Organização, Conversões, Meta Ads, Marca, Billing, LGPD, API Tokens, SIP, Extensões, Dados externos | viewer a admin | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| Administração da plataforma | 28 páginas protegidas mais `/admin/forbidden` | platform_admin | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| Entrada e implantação | login, signup, recuperação, convites, onboarding, instalação e páginas públicas | público/autenticado | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |

### Páginas e jornadas fora do menu principal

- Inbox possui lista e detalhe de conversa.
- Contatos possui lista e detalhe/Customer 360.
- Funis possuem lista e quadro por pipeline.
- Campanhas possuem criação, detalhe, importação e supressões.
- IA possui páginas de criação/detalhe/versões/teste dos agentes, fontes de
  conhecimento e demais subáreas operacionais.
- Equipe, extensões, LGPD, dados externos e onboarding possuem subrotas.
- Administração da plataforma cobre organizações, usuários, configuração,
  marca, SMTP, provedores, módulos, atualizações e suporte.

A lista exata de cobertura por página é mantida em
`DESKCOMMCRM_TEST_COVERAGE.md`.

### APIs encontradas

Foram encontradas 359 rotas. Maiores grupos: IA 74, cron 31, admin 22,
conversas 20, agenda 20, leads 14, financeiro 12, contatos 11, equipe 11,
voz 11, conexões/canais 10, extensões 10 e webhooks 9. Os demais grupos cobrem
auth, campanhas, templates, tarefas, produtos, métricas, LGPD, integrações,
tokens, health, MCP e funções internas.

Existência de rota não é validação. Cada rota será exercitada pela jornada de
produto correspondente e, para rotas internas, por chamada autenticada ou
efeito observável.

### Banco Supabase — schema `crm_comm`

| Item | Resultado observado | Estado |
|---|---:|---|
| Tabelas base | 170 | ✅ FUNCIONANDO E VALIDADA |
| Views | 5 | ✅ FUNCIONANDO E VALIDADA |
| Funções | 237 | ✅ FUNCIONANDO E VALIDADA |
| Policies RLS | 547 | ✅ FUNCIONANDO E VALIDADA |
| Triggers | 199 | ✅ FUNCIONANDO E VALIDADA |
| Tabelas com RLS ativo | 170/170 | ✅ FUNCIONANDO E VALIDADA |
| Funções `SECURITY DEFINER` do schema executáveis por PUBLIC | 0 | ✅ FUNCIONANDO E VALIDADA |
| Tabelas com RLS e nenhuma policy | 31 | 🟡 FUNCIONANDO PARCIALMENTE |

As 31 tabelas sem policy são majoritariamente internas e concedidas apenas a
`service_role`, portanto a ausência pode ser deliberada. Três merecem revisão
de contrato por combinarem grants amplos com RLS sem policy:
`system_update_runs`, `system_version` e `watchdog_cursors`. Não há evidência
atual de vazamento; há ambiguidade e provável acesso cliente morto.

Domínios persistidos encontrados: organizações e RBAC; contatos, conversas e
mensagens; leads, funis, etapas e tarefas; canais e sessões; campanhas;
agenda; agentes, versões, modelos, credenciais, conhecimento, memória, skills,
execuções e orçamento; follow-up e roteamento; eventos/jobs; extensões; banco
externo; financeiro; LGPD; voz; anúncios; auditoria e webhooks.

### Volume real do tenant observado

| Entidade | Linhas |
|---|---:|
| Organizações CRM | 1 |
| Memberships | 1 |
| Platform admins | 1 |
| Usuários Auth do projeto Supabase compartilhado | 19 |
| Fatores MFA verificados | 1 |
| Contatos / leads | 34 / 34 |
| Conversas / mensagens | 32 / 90 |
| Funis / etapas | 1 / 8 |
| Tarefas / atividades | 1 / 34 |
| Agentes / versões | 1 / 1 |
| Templates | 1 |
| Sessões de canal ativas e não arquivadas | 1 |
| Webhook sources | 1 |
| Appointments / routers / follow-up flows | 0 / 0 / 0 |
| Linhas de audit log | 72 |

Há somente um tenant CRM. Portanto o isolamento A/B ainda não pode receber ✅
em produção sem criar um segundo tenant sintético e usuários de teste separados.

### Storage, Edge Functions e isolamento operacional

Buckets CRM identificados: `ai-policy`, `catalog-photos`, `lgpd-exports`,
`skill-assets`, `whatsapp-media` (privados) e `brand-logos` (público por desenho).
O mesmo projeto Supabase também contém buckets, tabelas, crons e Edge Functions
de outro produto Be Heroes School. Isso não prova falha, mas amplia o raio de
impacto e torna a separação por schema, secrets, policies e funções uma parte
obrigatória desta auditoria.

Há 21 Edge Functions ativas no projeto compartilhado. A maioria não pertence
ao CRM. Sete não exigem JWT no gateway, incluindo webhooks/workers públicos;
cada uma precisa ser avaliada pelo próprio mecanismo de assinatura/segredo antes
de qualquer classificação de segurança.

### Rotinas automáticas

- O container `scheduler` agenda 31 rotas do CRM.
- O schema compartilhado também possui 18 jobs `pg_cron`, todos associados ao
  outro produto e não ao `crm_comm`.
- `crm_comm.cron_jobs` estava vazio; essa tabela representa jobs de domínio, não
  a configuração do scheduler Docker.
- O scheduler chama `api/v1/cron/agent-dispatcher` todo minuto, porém a própria
  rota está marcada `@deprecated` e sempre devolve `skipped: true`. É tráfego e
  log desnecessário, sem executar IA.
- Os demais crons cobrem prospecção, worker de follow-up, event drain,
  roteamento, recuperação de mensagens, retenção, saúde de canais, agenda,
  campanhas, risco, contatos, LGPD, conhecimento e manutenção.

### Módulos opcionais e mocks

| Item | Evidência | Estado |
|---|---|---|
| Banco de dados externo | `MODULO_BANCO_EXTERNO=desligado` | 🔵 REQUER CONFIGURAÇÃO EXTERNA |
| Fluxos de atendimento | existe no código, mas consta em `MODULOS_AINDA_NAO_LIGAVEIS` | ⚫ NÃO IMPLEMENTADA |
| Dados fictícios da Agenda | importados apenas por `/vitrine-agenda`, não pela Agenda produtiva | ⚪ MOCK / PLACEHOLDER |
| Assinatura PAdES de export LGPD | TODO explícito até provisionar certificado | 🔵 REQUER CONFIGURAÇÃO EXTERNA |

### Dependências externas configuradas

| Capacidade | Estado nesta instalação | Classificação |
|---|---|---|
| Supabase, Redis, WAHA | health online | ✅ FUNCIONANDO E VALIDADA |
| WhatsApp UAZAPI | canal ativo observado; jornada controlada ainda pendente | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| Z-API e Meta Cloud API | adaptadores/código a inventariar e operação não provada | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| OpenRouter/JEV e OpenAI | chaves presentes; conteúdo não registrado; execução produtiva pendente | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| Google Calendar | client id/secret ausentes | 🔵 REQUER CONFIGURAÇÃO EXTERNA |
| Email transacional | SMTP/Resend incompletos | 🔵 REQUER CONFIGURAÇÃO EXTERNA |
| Push web | VAPID ausente | 🔵 REQUER CONFIGURAÇÃO EXTERNA |
| Nuvemshop | flag habilitada; OAuth real pendente | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |
| Meta Ads | nenhuma conexão persistida | 🔵 REQUER CONFIGURAÇÃO EXTERNA |
| SIP/voz | operação real ainda não provada | 🟠 IMPLEMENTADA MAS NÃO VALIDADA |

### Evidências funcionais já obtidas antes desta rodada

Estas evidências são aproveitadas, mas não transformam o módulo inteiro em ✅:

- contato: criar, editar, recarregar e visualizar histórico/LGPD;
- lead: criar, editar, mover entre etapas e recarregar;
- tarefa: criar, editar, concluir, filtrar e reabrir;
- resposta rápida: criar; editar, excluir e usar no Inbox seguem pendentes;
- agente: preview controlado executou; publicação e turno real seguem pendentes;
- webhook de entrada: fonte criada, lead recebido, fonte desativada e nova
  chamada recusada; demais tipos e assinatura seguem pendentes;
- Agenda abriu, mas sem disponibilidade configurada e sem criação validada.

### Jornadas CRUD online repetidas nesta rodada

Em 25/09/2026, um `admin` de tenant QA isolado executou pela interface online,
sem atalhos SQL para as ações sob teste:

- contato: criar com nome/e-mail/telefone/tags → abrir ficha → editar nome e
  e-mail → recarregar → confirmar persistência → excluir;
- resposta rápida: criar título/corpo/atalho → editar → recarregar → confirmar
  persistência → excluir;
- tarefa: criar → editar → recarregar → concluir → filtrar concluídas → reabrir
  → voltar às abertas → excluir.

As três jornadas passaram sem resposta HTTP 4xx/5xx. O tenant, usuário e dados
sintéticos foram removidos; consulta independente posterior encontrou zero
organizações, usuários, contatos, tarefas ou templates com os marcadores QA.

## Achados iniciais

### AUD-001 — cron chama rota aposentada todo minuto

- Severidade: P2
- Estado: 🟡 FUNCIONANDO PARCIALMENTE
- Área: operação / IA
- Evidência: `docker/scheduler/entrypoint.sh` agenda
  `api/v1/cron/agent-dispatcher`; a rota declara `@deprecated` e sempre responde
  `{ skipped: true, deprecated: true }`.
- Impacto: requisição, autenticação, logs e ruído operacional a cada minuto sem
  trabalho útil; pode mascarar a saúde do dispatcher real.
- Correção recomendada: remover a linha do scheduler e atualizar os testes que
  hoje exigem correspondência literal entre rotas cron e agenda, preservando a
  rota NO-OP apenas para instalações antigas.
- Regressão exigida: provar que `event-log-drain`/worker continua consumindo
  `ai_agent.dispatch_requested` e que nenhuma spec pressupõe o cron aposentado.

### AUD-002 — email de recuperação/convite não está operacional

- Severidade: P1
- Estado: 🔵 REQUER CONFIGURAÇÃO EXTERNA
- Área: autenticação
- Evidência: SMTP e Resend sem host/usuário/senha/remetente completos no deploy;
  o usuário já observou recuperação sem recebimento. Nos logs Auth das últimas
  24 horas há uma resposta 429 com `over_email_send_rate_limit`, além de dois
  links/códigos recusados como `otp_expired`.
- Impacto: usuário sem senha pode ficar bloqueado e convites podem não chegar.
- Correção recomendada: configurar provedor transacional, remetente e URLs do
  Supabase; validar entrega, spam, expiração e troca de senha em jornada real.

### AUD-003 — isolamento multi-tenant ainda não tem prova A/B pela UI

- Severidade: P1
- Estado: 🟡 FUNCIONANDO PARCIALMENTE
- Área: segurança / RLS
- Evidência atual: em transações descartáveis, admin comum de A não leu
  organização/contato de B; manager de B não leu A; escrita A→B recebeu
  `42501`. Um usuário sem vínculo leu zero linhas e não conseguiu inserir.
  Ainda não foi executada a troca visual completa entre A/B com dois logins.
- Impacto: a camada Postgres/RLS está provada, mas cache, cookie de organização
  ativa, realtime e endpoints service-role ainda precisam de validação A/B E2E.
- Correção recomendada: criar tenant B sintético, papéis de teste e matriz de
  tentativas positivas/negativas, com limpeza controlada ao final.

### AUD-004 — projeto Supabase compartilhado amplia o raio de impacto

- Severidade: P2
- Estado: 🟡 FUNCIONANDO PARCIALMENTE
- Área: arquitetura / segurança operacional
- Evidência: recursos do CRM e do Be Heroes School coexistem no mesmo projeto,
  inclusive Auth, Storage, Edge Functions e `pg_cron`.
- Impacto: erro de secret, policy ou função pode atravessar produtos; métricas e
  alertas também se misturam.
- Correção recomendada: inventário de ownership por recurso, budgets/alertas,
  secrets mínimos e decisão documentada entre isolamento lógico endurecido ou
  projetos separados.

### AUD-005 — contratos ambíguos em três tabelas internas

- Severidade: P3
- Estado: 🟡 FUNCIONANDO PARCIALMENTE
- Área: banco / RLS
- Evidência: `system_update_runs`, `system_version` e `watchdog_cursors` têm RLS
  sem policy apesar de grants para papéis cliente.
- Impacto: acesso cliente é negado apesar do grant; manutenção futura pode
  interpretar o contrato incorretamente.
- Correção recomendada: revogar grants cliente se forem service-only ou criar
  policies mínimas, acompanhado de teste de isolamento.

### AUD-006 — integrações exibidas sem configuração suficiente

- Severidade: P2
- Estado: 🔵 REQUER CONFIGURAÇÃO EXTERNA
- Área: Agenda, autenticação, notificações e anúncios
- Evidência: Google OAuth, email transacional, VAPID e Meta Ads não estão
  operacionalmente configurados.
- Impacto: páginas podem existir e parecer completas, mas jornadas dependentes
  falham ou permanecem vazias.
- Correção recomendada: UI deve indicar claramente “não configurado”, impedir
  ações impossíveis e oferecer diagnóstico; só validar após configurar sandbox.

### AUD-007 — suíte unitária não está verde por teste lexical desatualizado

- Severidade: P2
- Estado: 🟡 FUNCIONANDO PARCIALMENTE
- Área: qualidade / OpenRouter
- Evidência: a suíte completa executou 13.408 testes: 13.406 passaram, um era
  `expected fail` e um falhou. A falha procura literalmente aspas simples em
  `provider === 'openrouter'`, enquanto o ramo funcional existe com aspas duplas.
  Seis arquivos relacionados, com 78 testes de catálogo, chave, endpoint,
  binding e isolamento da chave, passaram.
- Impacto: o gate fica vermelho apesar do ramo existir; uma falha falsa reduz a
  confiança no CI e pode esconder uma regressão verdadeira.
- Correção recomendada: substituir a leitura/regex do fonte por teste
  comportamental do `resolveOrgLlmConfig` com pool simulado ou fixture de banco.
- Regressão exigida: testar BYOK, fallback de instalação, ausência de chave e
  proibição de encaminhar chave da instalação a base URL controlada pelo tenant.

### AUD-008 — quatro rejeições assíncronas não tratadas na suíte do Inbox

- Severidade: P2
- Estado: 🟡 FUNCIONANDO PARCIALMENTE
- Área: qualidade / Inbox / Realtime
- Evidência: Vitest relatou quatro `Unhandled Rejection` em
  `deep-link-nao-espera-a-lista.test.tsx` e
  `inbox-aba-minhas-encanamento.test.tsx`. Os mocks de
  `@/lib/supabase/browser` não expõem o novo `browserSupabaseDbSchema`, usado
  assincronamente por `useRealtimeChannel`.
- Impacto: os casos aparecem como aprovados mesmo lançando erros depois da
  asserção; isso permite falso positivo em jornadas centrais do Inbox.
- Correção recomendada: atualizar o mock compartilhado e fazer a suíte falhar
  sob rejeição não tratada; desmontar/aguardar subscriptions de forma explícita.
- Regressão exigida: os dois arquivos devem passar sem seção `Unhandled Errors`.

### AUD-009 — eventos UAZAPI com remetente LID são descartados como telefone inválido

- Severidade: P1
- Estado: 🔴 NÃO FUNCIONANDO
- Área: WhatsApp / UAZAPI / Inbox
- Evidência de produção: entre 24/09 22:02 UTC e 25/09 11:48 UTC, seis chamadas
  de `fn_upsert_wa_contact` falharam no CHECK
  `contacts_phone_e164_format`. Os valores projetados como telefone tinham
  16–17 dígitos, acima do limite E.164 de 15. A transação não criou contato,
  conversa nem mensagem.
- Contexto de volume: no mesmo intervalo amplo, 78 chamadas da RPC responderam
  200. Portanto o canal não está totalmente inoperante; o ramo de identidade
  LID/PN é que está quebrado e perde uma parcela real das entradas.
- Causa confirmada no código: `parseUazapiWebhook()` escolhe
  `message.sender` antes de `message.chatid`, remove o sufixo e aceita qualquer
  sequência com pelo menos 8 dígitos, sem teto. O contrato atual da UAZAPI
  declara que `sender` pode ser JID/LID opaco e oferece `sender_pn` (telefone
  resolvido) e `sender_lid`; identificadores `@lid` não devem ser convertidos em
  telefone.
- Impacto: mensagens legítimas de clientes podem não aparecer no Inbox e não
  gerar lead, atividade, roteamento ou resposta de IA. O webhook pode continuar
  respondendo normalmente enquanto o resultado interno volta `failed`, tornando
  a perda pouco visível para a operação.
- Correção recomendada: modelar a identidade direta como `phone | lid`, preferir
  `sender_pn` quando for JID telefônico E.164, preservar `sender_lid`/`sender`
  `@lid` como identidade opaca e recusar grupo/newsletter no caminho 1:1. Não
  truncar nem fabricar telefone.
- Regressão exigida: fixtures reais redigidas para telefone, LID, grupo e
  newsletter; confirmar contato/conversa/mensagem, idempotência e efeitos pós-
  entrada. Reconciliar pela API os seis eventos perdidos após a correção.

### AUD-010 — derivação de áudio/imagem falha por MIME genérico

- Severidade: P2
- Estado: 🟡 FUNCIONANDO PARCIALMENTE
- Área: WhatsApp multimodal / IA
- Evidência de produção: 20 eventos `media.derive_requested` nas últimas 24h;
  11 terminaram `dead` após cinco tentativas. Foram seis áudios com
  `transcription_400`, dois áudios com erro vazio e três imagens recusadas por
  `file part media type application/octet-stream`. Nove derivados ficaram
  prontos; dois stickers foram pulados por desenho.
- Causa confirmada no código: o adaptador UAZAPI aceita `Content-Type` da URL e
  persiste `application/octet-stream`; o worker repassa esse MIME ao endpoint de
  transcrição/visão e nomeia o arquivo de áudio como `.bin`. Não há detecção do
  tipo pelos bytes, extensão ou tipo normalizado da mensagem.
- Impacto: o arquivo original é persistido, mas áudio não é transcrito e parte
  das imagens não é compreendida pelo agente. O sistema abre aviso e grava
  marcador de falha, porém a função prometida não acontece.
- Correção recomendada: determinar MIME confiável no download (magic bytes +
  tipo da mensagem + URL como sinais), nunca enviar `octet-stream` a modelos
  que exigem tipo concreto e preservar o erro detalhado da API de transcrição
  sem conteúdo sensível.
- Regressão exigida: amostras OGG/Opus, MP3, M4A, JPEG, PNG, WebP e arquivo
  inválido, todos recebidos com header `octet-stream`; provar storage, MIME,
  derivação, retry e aviso.

### AUD-011 — navegação oferece páginas que o próprio backend recusa por papel

- Severidade: P2
- Estado: 🟡 FUNCIONANDO PARCIALMENTE
- Área: RBAC / navegação / experiência dos funcionários
- Evidência online: quatro usuários QA reais (`viewer`, `agent`, `manager` e
  `admin`) percorreram 58 destinos declarados, totalizando 232 navegações
  desktop. Em repetição dirigida, com espera completa e captura do corpo HTTP:
  - `viewer` abriu Radar, mas `/api/v1/leads/at-risk` recusou com 403 e exigiu
    `agent`;
  - `viewer` abriu Agenda, mas `/api/v1/agenda/pessoas` recusou com 403 e exigiu
    `agent`;
  - `viewer` e `agent` abriram Campanhas, mas `/api/v1/campaigns` recusou com
    403 e exigiu `manager`;
  - `viewer` abriu Desempenho, mas `/api/v1/metrics/attendants` recusou com 403
    e exigiu `agent`;
  - `viewer` e `agent` abriram Equipe, mas `/api/v1/team` recusou com 403 e
    exigiu `manager`;
  - Chamadas já declara `manager` no catálogo; acesso direto abaixo desse papel
    abre a casca, mas `/api/v1/calls` recusa corretamente com 403.
- Controle de segurança: as recusas impedem leitura indevida; não foi observado
  vazamento de dados. O defeito é a UI prometer uma capacidade que não entrega.
- Causa confirmada no código: Radar, Agenda, Campanhas, Desempenho e Equipe não
  declaram `minRole` compatível no catálogo/rota, enquanto suas APIs aplicam
  `requireRole` mais alto. Em Campanhas, o comentário da própria página afirma
  que a API exige `manager`, mas o catálogo deixa o papel implícito como
  `viewer`.
- Impacto: funcionários veem links e telas que terminam em erro; uma empresa
  pode concluir que o sistema está quebrado mesmo quando a autorização está
  apenas inconsistente. Isso impede certificar os papéis para demonstração.
- Correção recomendada: decidir a capacidade por jornada e torná-la única no
  catálogo, página e API. Se `viewer` deve ler, liberar apenas GET com RLS; se
  não deve, ocultar o destino e redirecionar antes de montar o client.
- Regressão exigida: matriz E2E por papel para cada destino, provando menu,
  acesso direto, GET e mutações; página recusada não pode renderizar casca com
  requisição 403 no console.

### AUD-012 — RPC de roteamento telefônico exposta a qualquer autenticado

- Severidade: P2
- Estado: 🔴 NÃO FUNCIONANDO
- Área: segurança / VoIP / grants de função
- Contrato esperado: a migration `0347_modulo_voip` revoga `EXECUTE` de
  `public` e `anon` e concede a função `fn_resolve_inbound_number(text)` somente
  a `service_role`; o único consumidor localizado é o worker de voz.
- Evidência do banco implantado: a função é `SECURITY DEFINER`, pertence a
  `postgres` e seu ACL inclui explicitamente `authenticated`. Um usuário Auth
  real sem membership CRM chamou a RPC com um número sintético de outro tenant
  e recebeu uma linha contendo `organization_id` e `routing_mode`. Tudo ocorreu
  dentro de transação com `ROLLBACK`; não havia número ativo real antes do teste.
- Impacto: qualquer conta autenticada pode enumerar números de entrada
  adivinháveis e descobrir IDs internos de organização, agente/fallback e regra
  de roteamento, atravessando o isolamento esperado da camada de serviço.
- Observação do advisor: 39 funções `SECURITY DEFINER` do schema estão
  executáveis por `authenticated`; várias são RPCs de usuário legítimas, então
  não foram classificadas em bloco. Esta foi validada porque contradiz a própria
  migration e o consumidor é exclusivamente service-role.
- Correção recomendada: `REVOKE EXECUTE ... FROM authenticated` no schema
  implantado, preservar somente `service_role`, fixar `search_path` explícito e
  adicionar teste de ACL pós-migration. A consulta interna já qualifica
  `crm_comm.phone_numbers`, reduzindo o risco de hijack de nome, mas não corrige
  a autorização.
- Regressão exigida: `authenticated` recebe `42501`; `service_role` resolve DID
  ativo; migrations/baseline e banco publicado terminam com ACL idêntico.

## Advisors e perfil de desempenho do Supabase

Após filtrar exclusivamente o schema `crm_comm`, os advisors apontaram:

- 31 tabelas com RLS e nenhuma policy, já tratadas como server-only ou contratos
  a revisar; não representam leitura aberta por si só;
- 53 objetos descobríveis no schema GraphQL por `anon` e 145 por
  `authenticated`. A varredura HTTP anônima e os testes RLS não encontraram
  leitura de dados, mas os grants amplos aumentam a superfície de descoberta;
- sete funções sem `search_path` fixo. Seis não são `SECURITY DEFINER`; a sétima
  é a RPC do AUD-012 e usa referência de tabela qualificada;
- 240 FKs sem índice, 12 policies com `auth.*` sem initplan, cinco tabelas de
  ponteiro sem PK, 111 índices ainda não usados e 236 ocorrências de policies
  permissivas múltiplas. São sinais de dívida de performance, não prova isolada
  de lentidão; precisam ser priorizados por workload antes de criar/remover
  índices.

No `pg_stat_statements`, as consultas CRM de maior tempo acumulado tinham médias
baixas a moderadas na maior parte: membership (~3,9 ms), pre-request gateway
(~0,4 ms), sessão de canal (~18 ms), suporte (~2 ms) e sweep de confirmação
(~9 ms). A maior consulta recorrente observada foi uma leitura de conversas com
média ~84 ms em 68 chamadas. Não apareceu uma única query sustentada capaz de,
sozinha, explicar “sobrecarga”; o volume anterior foi dominado pelos loops já
delimitados nos logs.

## Leitura dos logs reais do Supabase

Na janela de 24 horas encerrada em 25/09 12:00 UTC foram observados 53.510 logs
de edge, 16.188 de PostgREST, 13.172 de Supavisor, 7.888 de Postgres e 6.926 de
Auth. O volume pertence ao projeto compartilhado e não pode ser atribuído todo
ao CRM.

O erro anterior de schema foi delimitado com precisão:

- 1.038 erros PostgREST `3F000` ocorreram de 24/09 12:00 a 19:47 UTC, incluindo
  referência inválida ao schema citado como `CRM_COMM` com aspas duplicadas;
- 4.176 erros Supavisor `42P01` ocorreram de 24/09 19:46 a 21:54 UTC, com queries
  do worker procurando tabelas como `job_queue`, `event_log`, `cron_jobs` e
  `platform_settings` fora do schema correto;
- nenhum novo `3F000` ou `42P01` apareceu após 24/09 21:54 UTC até o fim da
  janela analisada. Portanto a correção anterior eliminou esse padrão, mas não
  elimina o novo AUD-009.

Cinco erros `42501` posteriores correspondem a acessos negados por RLS/grant,
incluindo sondas a `organizations` e `fn_service_begin`; o bloqueio é compatível
com teste negativo e não foi classificado como defeito sem contexto adicional.

Os 93 eventos `ai_agent.dispatch_requested` da janela foram consumidos pelo
`agent-engine` e ficaram `done`, mas a única versão de agente da organização
está em `draft`. Não há versão publicada; portanto nenhuma conversa real pode
ser usada para afirmar que a IA está atendendo clientes. O único
`ai_agent_run` existente é evidência de teste/preview, não de produção.

## Gates executados em 25/09/2026

| Gate | Resultado | Interpretação |
|---|---|---|
| TypeScript (`tsc --noEmit`) | passou sem saída | tipagem do checkout válida |
| 9 arquivos críticos | 73/73 testes passaram | navegação, cron, RBAC, MFA, login e tenant guard |
| 6 arquivos OpenRouter relacionados | 78/78 testes passaram | boa cobertura do caminho, sem provar chamada externa real |
| Suíte unitária completa | 13.406 passaram; 1 falhou; 1 expected fail; 4 erros assíncronos | gate geral vermelho; AUD-007 e AUD-008 |
| Invariantes Postgres/RLS | não iniciou: Docker Desktop desligado | sem veredito; não conta como falha nem aprovação do produto |
| RLS — membro real | sessão `authenticated` do membro ativo leu 1 organização e somente seus contatos, leads e mensagens | escopo positivo validado diretamente no banco |
| RLS — usuário sem vínculo | UUID autenticado sem membership leu 0 organizações, 0 contatos, 0 leads e 0 mensagens | isolamento negativo validado diretamente no banco |
| RLS — escrita sem vínculo | `INSERT` em `contacts` foi recusado com `42501`; transação revertida e nenhuma linha permaneceu | proteção de escrita validada diretamente no banco |
| RLS A/B — dois tenants | admin comum de A viu A e não viu organização/contato de B; manager de B viu B e não viu A | isolamento de leitura entre tenants validado em transações descartáveis |
| RLS A/B — escrita cruzada | admin comum de A tentou inserir contato em B e recebeu `42501`; zero linhas criadas | isolamento de escrita entre tenants validado em transação descartável |
| RLS — platform admin | o superadministrador viu o tenant sintético B | comportamento global deliberado confirmado; não equivale ao papel `admin` de tenant |
| Logs Supabase (24h) | schema errors cessaram; seis falhas UAZAPI posteriores | AUD-009 confirmado em produção |
| Event log/mídia (24h) | 20 derivações; 11 dead após 5 tentativas | AUD-010 confirmado em produção |
| 88 páginas privadas estáticas sem sessão | 87 redirecionaram para login; `/admin/forbidden` mostrou apenas a recusa | perímetro de páginas validado |
| 141 APIs GET estáticas sem sessão | 120×401, 17×403, 2 callbacks seguros, health público; 0×5xx | nenhuma API de dados respondeu 200 anonimamente |
| Matriz autenticada de navegação | 4 papéis × 58 destinos = 232 navegações; 0×5xx; 25 divergências iniciais triadas | APIs protegidas, mas AUD-011 confirma inconsistência UI/API por papel |
| Mobile dirigido | 7 telas críticas em 390×844; overflow horizontal medido = 0 | recorte responsivo aprovado; não substitui toda a matriz mobile |
| CRUD online isolado | contato, resposta rápida e tarefa: criar/editar/reload/excluir; tarefa concluir/reabrir | três jornadas aprovadas, sem 4xx/5xx e com limpeza confirmada |

Os dois callbacks acessíveis sem sessão não entregaram dados: Google Agenda
renderizou a página de retorno não verificável e os callbacks Google Ads e
Nuvemshop redirecionaram com erro de estado/configuração. Isso é comportamento
de falha segura, não valida as integrações OAuth.

Os testes A/B usaram organizações, memberships e contatos sintéticos dentro de
transações com `ROLLBACK`. Uma consulta posterior confirmou zero organizações,
contatos ou vínculos de auditoria remanescentes em produção. A validação cobre
a camada Postgres/RLS; a troca visual de empresa e as jornadas completas com
dois logins continuam pendentes de E2E autenticado.

O comando via `pnpm` tentou reconstruir `node_modules` por divergência de
metadados e abortou sem TTY. Para não modificar dependências durante a auditoria,
os binários locais de TypeScript/Vitest foram chamados diretamente.

## Próxima execução

A Fase 2 começa pelas jornadas de maior risco e valor: autenticação/MFA e
recuperação, isolamento/RBAC, WhatsApp Inbox, CRM completo e IA real. Depois
avança por Agenda, campanhas, canais, análise, organização e administração.
Cada resultado será anexado aqui com horário, ator/papel, passos, IDs de dados
sintéticos e evidência de persistência, sem registrar credenciais ou PII.
