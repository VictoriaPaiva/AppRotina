# Calendário — execução e itens avulsos

Implementação local em desenvolvimento, 18/11/2026. Sem commit, push, merge, aplicação remota de migration ou deploy.

## Auditoria e arquitetura

- `/calendario` usa `readCalendarPage`, lê `daily_plan_items` no mês e resolve nomes/áreas do Banco Mestre. Antes, `CalendarBoard` apresentava somente leitura dos snapshots.
- `/hoje` e `/planejamento` usam `PlanningBoard`, Server Actions em `app/planejamento/actions.ts` e `createPlanRepository`. As ações autenticam o usuário, aplicam optimistic concurrency e revalidam as três rotas.
- A conclusão comum atualiza `completed_at` com o snapshot esperado. O guard calcula timestamps e mantém as regras de checklist, execução quantitativa e subitens. As RPCs especializadas continuam sendo as mesmas.
- `activity_id` era obrigatório. O FK composto de owner/Activity, a unicidade por Activity/data e os snapshots assumiam origem no Banco Mestre. Já existia FK de `user_id` para `auth.users`, com cascade; nenhuma duplicação foi criada.

## Modelagem e migration

Nova migration: `supabase/migrations/20261118000300_calendar_standalone_plans.sql`. As migrations anteriores permanecem intactas.

`daily_plan_items` mantém a mesma identidade e recebe origem explícita `activity | standalone`, título, descrição e importância próprios. `activity_id` passa a aceitar NULL somente na forma standalone. O CHECK de formato exige Activity nos itens de origem activity e proíbe snapshots de Activity/subitens/checklist/quantidade nos avulsos. Não se infere a origem de um ID ausente.

A origem é imutável. Os itens existentes recebem default activity sem reescrever snapshots ou timestamps. FK composto, unicidade de Activity/data, RLS e grants anteriores permanecem; avulsos podem ser múltiplos na mesma data. A duração avulsa é opcional ou inteira positiva; os valores históricos de duração de Activity continuam válidos.

`create_standalone_plan(jsonb)` é uma RPC estreita, autenticada, com search_path fixo e whitelist de campos. Deriva o owner de `auth.uid()`. Não concede INSERT direto nos novos campos nem usa service role. O retorno lê a linha final depois dos triggers de ordenação, incluindo sua versão atual de concorrência.

`guard_daily_plan_item()` foi redefinida explicitamente, preservando o corpo final V0.5. Apenas a admissão/snapshot de Activity e a validação de sincronização passam a considerar a origem. Ordenação, ownership, identidade, timestamps, conclusão, reabertura e normalização continuam compartilhados. Não há substituição textual de funções na migration.

`sync_open_activity_plans` continua filtrando por Activity e não alcança avulsos com activity_id NULL. A exclusão de Activity continua bloqueada por ocorrências vinculadas; avulsos não dependem dela. A exclusão de conta já remove daily_plan_items, inclusive avulsos, sem outro fluxo.

## Comportamento

O Calendário incorpora o próprio `PlanningBoard`, sem uma segunda regra de execução. Concluídos permanecem no dia. Metas semanais/mensais recebem o total completo do período, mesmo atravessando a borda do mês exibido.

`+ Item avulso` abre formulário com data selecionada, título obrigatório, horário/duração opcionais, importância existente e observação. Erros mantêm o rascunho. Sucesso atualiza o Calendário na data salva; Hoje e Planejamento reconhecem o item sem consultar Activity. O indicador discreto Avulso substitui o link ao Banco Mestre.

Os controles compartilhados de horário e remanejamento continuam disponíveis. Não se pode remanejar um item concluído, conforme a regra existente.

## Validação

- Unitários: leitura e renderização de avulsos sem mestre, painel incorporado com conclusão/reabertura, autenticação/validação/revalidação da criação e total quantitativo entre meses.
- SQL/PGlite: cadeia real de migrations, upgrade preservando histórico, criação com/sem horário, retorno imediatamente utilizável para conclusão, ordenação, conclusão/reabertura/CAS, pendências, ownership/RLS/anon, campos protegidos, invariantes e isolamento do sync de Activity.
- PostgreSQL 17 local: o mesmo contrato e sessões independentes para inserção/ordenação e disputa de conclusão; regressões de dia V0.5 e subitens nas suítes existentes.
- Smoke autenticado local: navegação real Next/Chrome contra API e banco sintéticos; reabertura pelo Calendário refletida em Hoje, criação avulsa com horário/duração/observação, conclusão persistente, reabertura e contagem de Activities inalterada. O smoke existente também cobre checklist, quantidade, subitens, histórico, volume, responsividade e Ideias.
- TypeScript, lint e build são executados antes do fechamento. Os resultados finais constam na entrega; logs locais em node_modules/.cache/calendar-* não são versionados.

Resultado local: 289/289 unitários, 167/167 SQL/PGlite e nova execução direcionada 1/1 após o ajuste do retorno da RPC; PostgreSQL 17.11 com três suítes aprovadas (`--calendar`, `--day`, `--activities`). TypeScript, lint e build aprovados, com Cache Components e Partial Prefetching preservados. O build mantém o aviso existente de metadataBase. Smoke autenticado completo aprovado em Next/Chrome/PGlite, incluindo os passos novos do Calendário, sem erros de relógio instável ou exceções no navegador.

O smoke foi estabilizado para aguardar o novo documento e hidratação antes de interagir, e verificar a edição de Ideias pela persistência/releitura em vez de uma mensagem transitória. As tentativas anteriores expuseram timeout inicial de compilação e essas corridas do harness; nenhum código de Ideias precisou mudar. A falha XX000 registrada pelo cenário de exclusão é injetada deliberadamente para testar preservação de rascunho em erro.

## Arquivos da entrega

- UI: `components/calendar/CalendarBoard.tsx`, novo `components/calendar/StandalonePlanForm.tsx`, `components/planning/PlanningBoard.tsx`.
- Fluxo: `app/planejamento/actions.ts`, `lib/planning/contracts.ts`, `validation.ts`, `repository.ts`, `server.ts`, `calendar-server.ts` e `lib/banco-mestre/data/database.types.ts`.
- Schema: a nova migration citada acima, sem alterações às anteriores.
- Testes: `tests/calendar.test.cjs`, `tests/planning.test.cjs`, `tests/db/data-layer.test.mjs`, novo `tests/db/calendar-standalone.test.mjs`, novo `tests/postgres/calendar-standalone.test.mjs` e `tests/postgres/run-local.mjs`.
- Suporte de testes: novo `tests/helpers/calendar-standalone.mjs`, `tests/helpers/load-with-stubs.cjs`, `tests/helpers/pglite-client.mjs`, `tests/next/v05-local-api.mjs` e `tests/next/v05-browser-smoke.mjs`.
- Documentação: README da raiz e este documento.

## Validação manual após aplicação autorizada em Development

1. Aplicar a cadeia pendente em Development por procedimento habitual; não publicar o código com schema antigo.
2. No Calendário, selecionar hoje, abrir `+ Item avulso`, conferir a data e salvar com título; repetir com horário, duração e observação.
3. Conferir ordenação e ausência no Banco Mestre; concluir e reabrir no Calendário, conferindo o resultado em Hoje após navegação.
4. Repetir com Activity comum, checklist, quantidade e subitens. Concluídos devem continuar no dia correspondente.
5. Conferir que outra conta não lista nem altera o item.

## Backlog e limites

- Edição de título, importância, duração e observação e exclusão do avulso ficam para etapa própria, com confirmação destrutiva e CAS. A identidade própria permite implementá-las sem Activity artificial.
- Não inclui recorrência, área, goals, checklist ou subitens próprios de avulso.
- Navegação/refresh observa as invalidações existentes; não foi introduzida sincronização Realtime entre abas abertas.
- Aplicação da migration em Development, validação manual remota e promoção posterior dependem de autorização futura. Production permanece intacta.
