# Fase 2 — correção controlada e reteste real

Data de consolidação: 26/09/2026  
Ambiente: `https://crm.beheroesschool.com.br`  
Schema canônico: `crm_comm`  
Deploy corretivo: commit `9bfe07f1e`, concluído com sucesso no Dokploy.

## Resultado executivo

A Fase 2 encerrou AUD-001, AUD-007, AUD-008, AUD-009, AUD-010, AUD-011 e
AUD-012 com testes online ou regressão completa. AUD-002 avançou: o Supabase
aceitou a recuperação e registrou `mail.send`, mas continua parcial até o
destinatário confirmar recebimento, abrir o link e trocar a senha.

Nenhum reteste de produção usou dados de clientes. As organizações, usuários,
memberships, contatos, mensagens, objetos de Storage e credenciais de canal
criados para QA eram sintéticos e foram removidos ao final de cada execução.

## Evidências por achado

| Achado      | Prova executada                                                   | Resultado                                                                         |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| AUD-001     | scheduler publicado e workers atuais observados em eventos reais  | ✅ rota aposentada não é mais agendada; persistência/derivação processadas        |
| AUD-002     | recuperação da conta administradora + logs Auth                   | 🟡 `/recover` 200 e `mail.send`; entrega/link/troca aguardam confirmação          |
| AUD-007/008 | suíte unitária completa fora da restrição de sockets do sandbox   | ✅ 1.346 arquivos, 13.452 testes, 1 expected fail, zero falhas/erros não tratados |
| AUD-009     | webhook UAZAPI público → DB → login → Inbox → repetição           | ✅ `ingested`, depois `duplicate`; LID preservado e contato visível               |
| AUD-010     | mídia pública `octet-stream` → webhook → Storage → OpenRouter/JEV | ✅ `image/png`, 70.268 bytes, derivação `ready`, texto presente                   |
| AUD-011     | viewer/agent/manager/admin em 6 páginas e 6 APIs                  | ✅ 48/48 decisões de acesso corretas; TOTP real no admin                          |
| AUD-012     | RPC com JWT `authenticated` e chave `service_role`                | ✅ `42501` para usuário; execução aceita para serviço                             |

## IA real — OpenRouter/JEV

O endpoint usado pelo botão **Testar agente** foi executado com o agente já
existente da Be Heroes, sem editar seu rascunho. A chamada terminou HTTP 200,
status `ok`, produziu 141 caracteres e levou 42,4 s de ponta a ponta. A
telemetria `llm_calls` registrou `purpose=agent_preview`, provider `openrouter`,
modelo efetivo `openrouter/auto`, status `ok` e 8,9 s no provedor.

A configuração da organização permanece em `routing.mode=jev_cascade`, com
decisor `typesafe/jev-1.13`, pool barato `openrouter/free` e fallback
`openrouter/auto`. Este preview carregou ferramentas; pelo contrato da cascata,
JEV mantém chamadas com ferramentas no Auto Router por segurança. Portanto o
uso de `openrouter/auto` neste cenário é o resultado esperado, não retorno à
limitação antiga. O conteúdo do prompt e da resposta não foi gravado na
evidência; usuário, membership, run e chamada QA foram removidos.

## Gates técnicos

- `npm run typecheck`: aprovado.
- `npm run lint:channels`: aprovado; nenhum débito novo.
- `npm run lint:role-rank`: aprovado; nenhuma comparação proibida nova.
- teste do contrato RBAC: 18/18 aprovado.
- health público após deploy: HTTP 200.

O primeiro disparo da suíte completa dentro do sandbox não é evidência de
defeito: o ambiente recusou `listen 127.0.0.1` e sockets IPC com `EPERM`, criando
timeouts derivados. A repetição com permissão para servidores locais passou
integralmente e é o resultado válido registrado acima.

## Evidência local redigida

- `.audit-evidence/qa_audit_20260926143847_rbac/results.json`
- `.audit-evidence/rpc-acl-20260926144304/results.json`
- `.audit-evidence/uazapi-lid-20260926144519/results.json`
- `.audit-evidence/media-mime-20260926145207/results.json`
- `.audit-evidence/password-recovery-20260926144138/results.json`
- `.audit-evidence/qa_ai_20260926150844/results.json`

O JSON de recuperação de senha contém uma classificação prematura da interface:
o script encontrou uma região de alerta vazia antes da conclusão da action. O
veredito confiável desse item vem dos logs Auth (`/recover` 200 e `mail.send`),
e não daquele campo de UI. O script será mantido com espera explícita antes de
uma nova execução; não foi enviado um segundo email para evitar duplicidade e
limite de envio.

## Pendência que exige participação do destinatário

Para encerrar AUD-002, confirmar se o email de recuperação chegou à conta
administradora, abrir o link, definir uma senha nova e validar login, expiração
do token e tratamento da sessão anterior. Até isso acontecer, a plataforma não
será declarada totalmente validada em autenticação.
