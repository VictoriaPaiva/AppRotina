# Preparação para uso oficial — limpeza temporária

**Atualização — 28/10/2026: limpeza autorizada concluída pela usuária na interface. Relatório OK e nova prévia com as 16 tabelas zeradas confirmados pela usuária; Auth, outras contas e estrutura preservados. Execução novamente bloqueada e servidor local reiniciado.** O procedimento e os registros de preparação abaixo são históricos. Não é exclusão de conta. Não há migration, função instalada, grant, policy, alteração de schema ou uso de service_role.

## Auditoria antes da implementação

Catálogo do **Rotina - Desenvolvimento** consultado em READ ONLY em 27/10/2026 por `scripts/dev-cleanup-audit.sql`, sem leitura de registros pessoais. Confirmadas exatamente 16 tabelas funcionais em `public`, todas com `user_id UUID NOT NULL` e RLS. Nenhuma tabela em `routine_private` e nenhuma candidata de progresso instalada.

| Tabela funcional | Dependência relevante |
|---|---|
| areas | Auth; referenciada por activities |
| activities | Auth + área do mesmo owner |
| reminder_configs | Activity do mesmo owner |
| commitment_configs | Activity do mesmo owner |
| planning_contexts | Activity do mesmo owner |
| fixed_schedules | Activity do mesmo owner |
| goals | Activity do mesmo owner; validação agregada diferida |
| recurrence_rules | Activity; referenciada por time_windows |
| time_windows | Activity + recorrência do mesmo owner (RESTRICT) |
| daily_plan_items | Activity do mesmo owner (RESTRICT) |
| ideas | Auth |
| projects | Auth; referenciada por project_tasks |
| project_tasks | Projeto do mesmo owner |
| financial_transactions | Auth; vínculo opcional com conta mensal |
| fixed_expenses | Auth; referenciada por fixed_expense_months |
| fixed_expense_months | Cadastro fixo + lançamento do mesmo owner; vínculo circular com financial_transactions |

Todos esses registros são dados funcionais da conta e entram na limpeza, inclusive históricos mensais. Não há tabela `profiles` ou outra tabela funcional adicional no catálogo auditado.

**Técnicas/estruturais preservadas:** `auth.users`, identidades/sessões e demais tabelas de Auth; `supabase_migrations`; schemas `storage`, `realtime`, `vault`, extensões/GraphQL; funções, triggers, índices, constraints e RLS. O MVP não possui anexos em Storage a incluir neste corte. `routine_private` contém helpers, não dados funcionais.

**Candidata pausada, excluída e nunca aplicada:** `user_temporal_preferences`, `progress_attempts`, `activity_progress_logs`, `activity_goal_versions`, `progress_log_goal_versions`, `activity_progress_voids`. Se aparecer qualquer tabela não auditada, materialização, foreign table, schema funcional adicional ou FK externa para o app, o mecanismo aborta; não tenta ampliar a limpeza automaticamente.

## Mecanismo e permissões

- Página temporária, sem link nos menus: `http://localhost:3000/dev/limpar-dados`.
- Endpoint somente POST: `/api/dev/clear-data`; abrir a página não consulta nem limpa nada.
- Exige `NODE_ENV=development`, opt-in local, origem localhost da própria página e URL do projeto de desenvolvimento auditado. Produção/test/ambiente sem opt-in não executam.
- O servidor verifica a sessão real com `auth.getUser()` em cada pedido. O browser não escolhe owner nem fornece user_id, e campos extras são recusados.
- Sem mudar os grants de DELETE existentes: usa o CLI Supabase já autenticado do computador, por processo local com argumentos separados e janela oculta. **Esse transporte possui privilégios administrativos do desenvolvedor**, necessários porque a sessão comum não pode apagar vários pais. O projeto é fixado explicitamente no código e a identidade vem exclusivamente da sessão web verificada, associada a `auth.uid()` somente dentro da transação.
- Não há senha de banco, chave service_role ou token de sessão enviado ao CLI. SQL temporário é removido ao terminar; erros da API não expõem saída do CLI, registros, hashes ou credenciais. Não executar a aplicação dev em servidor compartilhado.

## Ordem segura, em uma única transação

1. Conferir catálogo, Auth, owner e snapshot. Bloquear brevemente escritas nas 16 tabelas; timeout aborta sem retry automático.
2. Limpar **apenas do owner atual** `fixed_expense_months.paid_at` e `financial_transaction_id` para desfazer o ciclo de FKs. São registros que serão excluídos na mesma transação.
3. Excluir, sempre com `WHERE user_id = auth.uid()`, nesta ordem: `daily_plan_items` → `ideas` → `project_tasks` → `projects` → `financial_transactions` → `fixed_expense_months` → `fixed_expenses` → `time_windows` → `reminder_configs` → `commitment_configs` → `planning_contexts` → `fixed_schedules` → `goals` → `recurrence_rules` → `activities` → `areas`.
4. Executar as constraints diferidas; os pais também já terão sido removidos. Nenhuma constraint ou trigger é desabilitada.
5. Antes de COMMIT, exigir zero linhas do owner nas 16 tabelas, comparar contagens **e hashes de todas as linhas de outros owners**, conferir Auth inteiro e a assinatura de tabelas/colunas/FKs/índices/funções/policies/triggers/migrations. Qualquer divergência aborta tudo.

Sem TRUNCATE, DELETE global, DELETE em Auth, troca de owner ou mudança de estrutura. Em erro no meio, a remoção e a quebra do vínculo financeiro são revertidas juntas.

## Prévia e confirmação — execução real ainda não autorizada

1. Na configuração local ignorada pelo Git, habilitar **somente a prévia** com `DEV_DATA_CLEANUP_ENABLED=true` e manter `DEV_DATA_CLEANUP_ALLOW_EXECUTE=false`. Reiniciar `npm run dev` se necessário. O CLI precisa estar autenticado no projeto autorizado; nenhuma nova credencial deve ser versionada.
2. Entrar com a conta que será oficial, abrir a página temporária e clicar **Gerar prévia de contagens**. Conferir e-mail e as 16 contagens. A prévia não remove dados; seu token fica vinculado à conta, ao conteúdo das linhas e à estrutura, expira em 10 minutos e só pode ser usado uma vez.
3. **Aguardar confirmação explícita da usuária após revisar as contagens.** Só então habilitar temporariamente `DEV_DATA_CLEANUP_ALLOW_EXECUTE=true`. Após reinício/hot reload, gerar nova prévia; os tokens são intencionalmente voláteis.
4. Fechar outras abas do app, revisar a nova prévia, digitar **APAGAR MEUS DADOS DE TESTE** e clicar **Apagar somente meus dados de teste**. Não há confirmação por query string ou execução ao carregar a página. Se dados/sessão/catálogo mudarem, parar e obter nova prévia.
5. Conferir contagens finais zero, preservação de outras contas/estrutura e nova verificação de sessão. O relatório informa quantas outras contas Auth existem; não afirma ter verificado uma conta B real se nenhuma existir. Os testes A/B descritos abaixo são locais.
6. Em perda de rede após o envio, não repetir a operação: gerar nova prévia para descobrir se houve COMMIT. O token anterior já estará consumido.
7. Depois da execução autorizada e da validação inicial: voltar ambas as flags para false e remover a página, o endpoint e `lib/dev-cleanup` antes de considerar a ferramenta encerrada. Manter este registro e os testes como evidência. Não deixar um reset permanente no produto.

**Contagens reais desta sessão ainda não obtidas:** não há navegador autenticado disponível nesta execução. A prévia deve vir da sessão web da usuária, não de um UUID escolhido pelo agente ou digitado no browser.

## Validação

Testes SQL/PGlite com dados em todas as 16 tabelas para A e B: preview somente leitura; limpeza de A com B idêntica; Auth/e-mail/hash de senha preservados; estrutura e migrations intactas; rollback em falha; recusa de dados/catálogo alterados e de candidata de progresso. Sob os grants reais de `authenticated`, A voltou ao Banco Mestre vazio e criou primeira Área/Activity, Ideia, Projeto, Planejamento, lançamento financeiro e Conta fixa.

Testes de API/UI: produção/flags/origem, rejeição de user_id, sessão expirada, confirmação exata, nonce por conta/expiração/uso único, nenhum fetch ao montar, falha de rede sem sucesso ou retry automático, transporte CLI fixado no desenvolvimento e remoção do SQL temporário.

Verificações locais: **171 unitários e 118 SQL/PGlite**, lint, TypeScript, build Webpack e diff-check aprovados. Em HTTP de produção, GET da página dev e POST de prévia retornaram **404**. Permanece o aviso preexistente cacheComponents/partialPrefetching.

Depois da **limpeza real autorizada**, validar no navegador login/senha e sessão, estados iniciais dos sete módulos, primeiro cadastro completo e outra conta de teste. SQL não substitui login real via GoTrue. A próxima tarefa será **exclusão definitiva de conta**, ainda não iniciada nem implementada aqui.
