# QA operacional — CRM Be Heroes (24–25/09/2026)

Ambiente: `https://crm.beheroesschool.com.br`; organização Be Heroes. Testes realizados com o usuário administrador e registros sintéticos, sem disparar mensagens para clientes reais. Este é um relatório de progresso, não uma homologação completa.

## Fluxos executados

| Área | Exercício | Resultado |
| --- | --- | --- |
| Contatos | Criar, editar, recarregar, consultar Visão geral, Timeline e LGPD | Criação e edição persistiram. A ação irreversível de anonimização não foi acionada. |
| Funil | Criar negócio vinculado ao contato, editar descrição/valor, arrastar para outra etapa e recarregar | Persistiu em “Aguardando pagamento”. O cartão arredonda o valor exibido; o total da coluna preserva centavos. |
| Tarefas | Criar com descrição/prazo, concluir, filtrar concluídas, reabrir | Ciclo funcionou; tarefa de QA ficou pendente. Na primeira tentativa, o campo de prazo não persistiu; ao ajustar pela interface, persistiu. |
| Modelos | Criar resposta compartilhada com variável e atalho | Modelo `/qateste` persistiu. Envio em conversa real não foi feito. |
| Equipe/agenda | Abrir disponibilidade e formulário de agendamento; validar convite sem e-mail | Convite vazio foi bloqueado corretamente. Não havia horários disponíveis; agenda semanal não publicada, único atendente desligado e Google Calendar não configurado. |
| IA | Criar agente restrito em rascunho, executar prévia com mensagem sintética | Resposta foi gerada; agente permaneceu não publicado. Prévia demorou ~50 s. Nenhuma conversa ou mensagem real foi vinculada ao teste. |
| Webhook | Criar fonte temporária, usar “Enviar lead de teste”, consultar histórico e banco | Um contato e um negócio foram criados na etapa definida. Fonte foi desativada em 25/09; novo POST devolveu HTTP 404. |

## Achados prioritários

1. **Bloqueio do administrador da plataforma:** `/admin` redireciona para `/admin/forbidden` embora o usuário tenha papel de plataforma. Em `proxy.ts`, o cliente Supabase é criado sem `db.schema`; em seguida chama `fn_is_platform_admin`, função que só existe em `crm_comm`. O cliente servidor comum configura esse schema. Causa provável de bloqueio, ainda não corrigida.
2. **IA classifica prévia como produção:** a execução `da9847f4-1c86-45e7-9244-83c375610980` tem `is_dry_run=true` e nenhum ID de mensagem/conversa, mas a aba “Execuções” apresentou a chamada LLM `c0fea93d-c560-4b37-97e4-d024d20a5993` como “produção”. A chamada LLM tem propósito `agent_preview`. Corrigir rótulo/consulta para não induzir o operador a erro.
3. **Medição de IA inconsistente:** a prévia registrou 0 tokens e custo 0 em `ai_agent_runs`, apesar de `llm_calls` registrar 5.751 tokens de entrada e 36 de saída. Custo da chamada é `NULL`; a interface mostra traços. Há lacuna para apurar consumo real.
4. **Alerta global de WhatsApp enganoso:** alerta de sessão desconectada corresponde a uma sessão WAHA antiga sem número, enquanto a instância principal UAZAPI recebe mensagens. O operador pode acreditar que todo o canal caiu.
5. **Prontidão operacional incompleta:** pipeline padrão “Pedidos” ainda usa etapas de e-commerce; não há regras de automação; atendimento do único membro está desligado, agenda semanal não publicada e Google Calendar não configurado. Não é seguro apresentar esses recursos como prontos.
6. **Integrações pendentes:** SMTP e VAPID não configurados; fluxos de recuperação/convite e notificações exigem validação após configuração. Conexão com repositório no Dokploy existe, mas autoDeploy está desligado.

## Registros sintéticos preservados para rastreabilidade

- Contato: `d6bca3b6-e467-4145-b052-cba0bd3af116`.
- Negócio manual: `5d31a519-810d-43e4-a501-a6ba64c6d337`.
- Tarefa: `267be4cd-7284-4f89-a3ff-bfaeb6bdb1f1`.
- Modelo: `9b496b76-578d-4916-9686-41b50e3a280f`.
- Agente em rascunho: `e908eb4e-bbc6-4379-b3b1-760a2ef26483`.
- Fonte de webhook desativada: `8035e97c-496b-4fa6-8923-52397eea6154`; captura `c72c6adf-401a-4324-9bc1-d0cd8279caa9`; negócio `0f12bf0f-d152-42c7-befb-10deea4b48c8` e contato `868ee158-4325-4571-be56-a42dbfca3237`.

## Ainda não homologado

Inbox completo (filtros, atribuição, notas, anexos, envio e recebimento), automações com gatilho e efeito real, agendamento ponta a ponta, autenticação de funcionário, recuperação de senha, MFA em novo dispositivo, integrações Meta/Z-API, relatórios, exportações e regras de permissão por perfil. Esses casos exigem sessão de navegador controlável e, para comunicação externa, destinos de teste autorizados. Não inferir funcionamento apenas porque a página ou o endpoint de saúde responde.

## Qualidade local observada

Typecheck e build passaram; ESLint sem erros e com 427 avisos. Vitest: 13.403 testes aprovados, um teste de texto frágil falhou, e quatro erros assíncronos de mocks foram reportados. Esses resultados não substituem QA operacional na produção.

## Correções de 25/09 (posteriores à triagem acima)

- `proxy.ts` passou a consultar a RPC de administrador no schema configurado (`crm_comm`). Teste cobre admin permitido e não-admin negado.
- A aba de execuções passou a classificar `purpose='agent_preview'` como teste e a mostrar ausência de dados como “—”, sem inventar zero.
- A sessão WAHA vazia e sem vínculos foi arquivada de modo reversível no banco; os dois alertas abertos dela foram resolvidos. O canal UAZAPI operacional não foi alterado.
- Testes direcionados: 9 aprovados; typecheck, ESLint dos arquivos alterados e build de produção passaram. A validação após deploy ainda é necessária para atestar o ambiente público.
