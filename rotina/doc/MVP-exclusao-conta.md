# Exclusão definitiva de conta — 28/10/2026

MVP funcional concluído. Preparação para uso oficial: exclusão permanente em `/conta`, acessível pelo link “Minha conta” no cabeçalho. A ferramenta `/dev/limpar-dados` continua separada e com execução bloqueada.

## Auditoria real antes da implementação

Consulta READ ONLY ao projeto de desenvolvimento linked confirmou 11 migrations aplicadas, de `20261011000100` a `20261027000300`, e exatamente estas 16 tabelas funcionais. Todas possuem `user_id → auth.users(id) ON DELETE CASCADE`, com RLS owner:

| Tabela | Dependências funcionais |
| --- | --- |
| areas | Pai de activities |
| activities | area por owner, RESTRICT |
| reminder_configs | activity por owner, CASCADE |
| commitment_configs | activity por owner, CASCADE |
| planning_contexts | activity por owner, CASCADE |
| fixed_schedules | activity por owner, CASCADE |
| goals | activity por owner, CASCADE |
| recurrence_rules | activity por owner, CASCADE |
| time_windows | activity CASCADE; recurrence_rule por owner RESTRICT |
| daily_plan_items | activity por owner RESTRICT |
| ideas | Sem FK funcional |
| projects | Pai de project_tasks |
| project_tasks | project por owner CASCADE |
| financial_transactions | Conta mensal por owner, NO ACTION |
| fixed_expenses | Pai de fixed_expense_months |
| fixed_expense_months | Conta fixa e lançamento por owner, NO ACTION |

As duas FKs financeiras formam um ciclo. Auth possui `sessions.user_id → users CASCADE` e `refresh_tokens.session_id → sessions CASCADE`, além de identities, fatores e outras tabelas gerenciadas. Não se altera nenhuma tabela técnica de Auth diretamente no código da aplicação.

Storage: **não aplicável no estado atual**. Zero buckets e zero objetos no projeto; nenhum upload/uso de Storage no MVP. Adicionar Storage exige rever esta exclusão antes de permitir propriedade de objetos, pois objetos podem impedir a remoção do Auth.

A candidata avançada de progresso está ausente do schema aplicado e não foi promovida nem utilizada pela funcionalidade.

## Decisão transacional

A cascata pura funciona sob o proprietário das tabelas, mas falha com o papel gerenciado do Auth: os triggers invoker `touch_parent`/`validate_aggregate` precisam de privilégios funcionais que `supabase_auth_admin` não tem. Isso foi reproduzido em PostgreSQL 17 e confirmado no catálogo remoto: sem UPDATE em activities e sem USAGE em routine_private.

Migration `20261028000100_account_deletion.sql`: função privada de trigger SECURITY DEFINER, search_path restrito a pg_catalog, EXECUTE revogado de PUBLIC/anon/authenticated, sem argumentos e sem RPC pública. Trigger BEFORE DELETE em auth.users usa exclusivamente `OLD.id`. Não concede privilégios ao papel do Auth nem muda as policies existentes.

Ordem: daily_plan_items; desvincular pagamento mensal; financial_transactions; fixed_expense_months; fixed_expenses; ideas; projects (tarefas por cascata); activities (sete tabelas filhas por cascata); areas. Executa verificações diferidas dentro do contexto privilegiado antes de retornar ao Auth. O catálogo de tabelas por usuário é conferido: dependência nova não revisada bloqueia a exclusão.

A única chamada destrutiva do endpoint é `auth.admin.deleteUser(actor, false)`. O trigger e as cascatas de Auth/sessões/refresh tokens participam da mesma transação dessa chamada. Falha em qualquer etapa reverte tudo: não existe a janela “dados apagados, Auth mantido” de duas chamadas independentes. Não desabilita constraints nem triggers.

## Identidade, segredo e rede

`POST /api/account/delete` aceita apenas `{confirmation: "EXCLUIR MINHA CONTA"}`, com Origin igual à origem da aplicação, sem query, ID, e-mail ou UUID alvo. Não há GET destrutivo. `getClaims` verifica o sujeito, seguido de `getUser` online imediatamente antes da remoção. Sessão expirada/revogada não pode iniciar exclusão.

Cliente administrativo criado por requisição em módulo `server-only`, sem cookies ou persistência/renovação de sessão. Configurar **SUPABASE_SECRET_KEY** no servidor do mesmo projeto (compatibilidade com SUPABASE_SERVICE_ROLE_KEY). Nunca usar NEXT_PUBLIC, versionar ou informar seu valor em chat, logs ou browser. A configuração pública permanece separada. Sem segredo, a operação falha fechada.

Auth pode retornar corpo vazio na exclusão: uma resposta de sucesso da API administrativa confirma o commit e não exige um payload de usuário. Esse sucesso não é convertido em falha se houver problema posterior no logout. Quando há perda da resposta ou retry, o endpoint confirma ausência pelo `getUserById` somente do próprio sujeito verificado: ausência confirmada significa conta excluída; falha de confirmação permanece explicitamente incerta, nunca sucesso. Não recria conta nem dados. Falha antes da remoção mantém acesso para tentar novamente.

Após confirmação: signOut local, limpeza dos cookies do projeto, limpeza da sessão no browser e navegação completa para `/auth/login?account=deleted`, com “Conta excluída com sucesso.” A frase fica preservada em falhas e o formulário bloqueia cliques concorrentes.

JWTs já emitidos podem continuar criptograficamente válidos até expirar; logout não revoga sua assinatura. O proxy passou a consultar `getUser` online e rejeita usuário removido, inclusive em Server Actions. RLS continua isolando os usuários, e todas as 16 FKs exigem um usuário Auth existente para novas gravações. Sem aumentar TTL. Tokens não dão acesso aos dados de B nem permitem recriar linhas órfãs de A.

Referências: [Supabase: gerenciamento de usuários e JWT/Storage](https://supabase.com/docs/guides/auth/managing-user-data), [API administrativa e transação de hard delete](https://github.com/supabase/auth/blob/master/internal/api/admin.go), [getUser online](https://supabase.com/docs/reference/javascript/auth-getuser).

## Validação

Testes offline cobrem frase exata, campos injetados, autenticação ausente/expirada, identidade exclusiva da sessão, falha de rede, retry, ausência Auth confirmada, cookies, UI pending/erro/sucesso e rejeição de outra origem. SQL/PGlite cobre todas as tabelas populadas, FKs/ciclo, A/B, sessões/refresh tokens, JWT antigo sem escrita e rollback integral em falha induzida. PostgreSQL 17 descartável testa o papel do Auth sem privilégios funcionais, rollback e B byte-equivalente. Esses fixtures não substituem a validação de login pela API Auth real.

Migration aplicada exclusivamente no desenvolvimento após dry-run: apenas `20261028000100_account_deletion.sql`, sem seeds, roles ou Vault. Nenhuma conta real excluída. Validação Auth real/navegador depende do segredo administrativo configurado e de **conta secundária descartável**, nunca a conta principal.

Resultado automatizado: **188 unitários, 123 SQL/PGlite e 26 PostgreSQL local** (1 específico + 25 existentes), lint, TypeScript e build Turbopack aprovados. Inspeção de `.next/static` sem `createAccountAdmin`, SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY. Conferência remota READ ONLY pós-migration: trigger habilitado, função com proprietário postgres, zero argumentos, search_path pg_catalog, SECURITY DEFINER, EXECUTE negado a authenticated/anon; Storage e progresso continuam ausentes. Aviso preexistente de cacheComponents/partialPrefetching mantido. Sem alteração das tabelas/policies funcionais, TTL de JWT ou tipos públicos.

Smoke HTTP do build de produção em localhost, sem autenticação: `/conta` redireciona ao login (307), GET destrutivo inexistente (405), POST sem sessão (401), outra origem (403) e mensagem pública de sucesso renderizada (200). Payload de erro contém somente `ok` e categoria segura. Corrigida validação de origem para o Host real, pois Next pode normalizar request.url para localhost; teste adicional cobre HTTPS encaminhado por proxy. `git diff --check` aprovado. Ferramenta de limpeza continua com `DEV_DATA_CLEANUP_ALLOW_EXECUTE=false`.

Roteiro: manter B logada em outro perfil; criar dados em A secundária; acessar Minha conta; testar frase errada e cancelar; confirmar com a frase exata; verificar mensagem pública, login/refresh de A rejeitados, 16 tabelas sem linhas de A e sessões/tokens removidos; conferir dados e sessão B intactos. Simular offline antes da confirmação: nenhum sucesso. Em resposta perdida, tentar novamente para conciliar. Não apagar a conta principal.

## Arquivos desta etapa

- Produto: `app/conta/page.tsx`, `components/account/DeleteAccountPanel.tsx`, `app/api/account/delete/route.ts`, `lib/account-deletion/{contract,admin,delete-account}.ts`.
- Acesso e sessão: `components/layout/TopBar.tsx`, `app/auth/login/page.tsx`, `lib/auth/policy.ts`, `lib/supabase/proxy.ts`, `.env.example`.
- Banco: `supabase/migrations/20261028000100_account_deletion.sql`.
- Testes novos: `tests/account-deletion.test.cjs`, `tests/db/account-deletion.test.mjs`, `tests/postgres/account-deletion.test.mjs`, `tests/helpers/account-fixtures.mjs`. Runner local aceita `--account-deletion`, sem candidata nesse fluxo.
- Testes existentes ajustados: stubs do proxy/getUser e link do cabeçalho; assertions reconhecem somente o novo trigger privado como exceção SECURITY DEFINER. Fixtures de instalação não-superuser receberam TRIGGER apenas sobre auth.users para carregar a nova migration; nenhuma alteração na candidata.
- Documentação: README, este relatório, Backlog_Projeto_Rotina_v0.2.docx e Template_Projeto_Rotina_v0.2.docx (Documento Mestre).

Comandos: `npm test`; `node --test --test-concurrency=1 tests/db/*.test.mjs`; `npm run test:pg:local -- --account-deletion`; `npm run test:pg:local`; `npm run lint`; `npx tsc --noEmit`; `npm run build`; `git diff --check`. PostgreSQL local usa somente cluster descartável em loopback; não usa credenciais remotas.
