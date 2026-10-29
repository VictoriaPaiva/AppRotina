# Deploy do MVP — Vercel + Supabase Production

Data: 29/10/2026. **Preparação local; publicação e projeto Production ainda não executados.** Desktop é a prioridade. Não retomar V0.2.5 ou alterar regras do MVP.

## 1. Separação de ambientes e ponto de retomada

| Ambiente | App | Supabase | Git |
|---|---|---|---|
| Development | localhost | projeto atual, preservado | desenvolvimento |
| Production | alias estável HTTPS da Vercel | NOVO projeto, inicialmente vazio | main |
| Preview, se habilitado | URL de preview protegida | somente Development; nunca credenciais Production | PR/branches |

Não copiar banco, contas, dados, `.env.local` ou caches de vínculo de Development. Supabase cria seus schemas gerenciados; **o schema da aplicação vem somente das 12 migrations versionadas**. Não executar SQL de candidates, `db reset`, `db pull` para substituir migrations ou seed em Production.

Ponto de retomada: revisão/commit das mudanças locais, PR para main, criação manual do Supabase Production e configuração manual do Vercel. Nenhum projeto novo, conta, domínio, merge, push ou deploy foi feito pelo agente nesta preparação. A aplicação remota das migrations exige confirmação explícita do projeto/dry-run; a exclusão da conta secundária exige confirmação manual da usuária.

## 2. Auditoria pré-deploy

Busca explícita em app/components/lib/migrations/configuração por `localhost`, `127.0.0.1`, `192.168.`, `DEV_`, `service_role`, `SUPABASE_SECRET_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, sem exibir valores de arquivos privados.

| Achado | Classificação e decisão |
|---|---|
| Loopback em `supabase/config.toml`, testes e guards de limpeza | Desenvolvimento legítimo; não é configuração do Auth hospedado. Não aplicar config local ao projeto Production |
| `lib/supabase/configuration.ts` aceita HTTP apenas em loopback | Desenvolvimento legítimo; URLs remotas exigem HTTPS, chave pública validada e nenhuma credencial de URL |
| `lib/dev-cleanup/*` tem vínculo fixo ao projeto Development | Restrição legítima dessa ferramenta. Guards exigem NODE_ENV development, flags locais e loopback; nunca habilitar DEV_* no Vercel |
| Tutorial `components/tutorial/sign-up-user-steps.tsx` menciona localhost | Componente antigo sem imports nas rotas atuais; não participa dos redirects do app |
| `192.168.` | Nenhuma ocorrência no código de produto pesquisado |
| Metadados usavam fallback explícito localhost | Corrigido: origem pública opcional ou hosts Vercel; sem fallback explícito. Produção Vercel rejeita origem local/HTTP configurada |
| Cadastro/reset usam `window.location.origin` | Já dinâmicos e consistentes. Mantidos: respeitam a origem realmente visitada, autorizada no Auth. Callback só redireciona para destinos internos permitidos |
| `SUPABASE_SECRET_KEY`, fallback legado `SUPABASE_SERVICE_ROLE_KEY` | Somente `lib/account-deletion/admin.ts`, protegido por `import 'server-only'`; cliente administrativo sem persistência de sessão. Configurar somente o nome novo em Production |
| Exclusão de conta | Alvo vem de claims verificados + consulta Auth online; body só aceita a confirmação, sem user_id/email. Same-origin, sem logs de credenciais e sem sucesso após resposta incerta não reconciliada |
| Caches CLI versionados em `supabase/.temp` na raiz | Risco de publicação de metadados/vínculo. Nove arquivos retirados do índice, preservados no disco e ignorados globalmente. URL de conexão sem senha detectada; nenhum JWT/chave administrativa/senha embutida detectado nesses arquivos atuais. Histórico não foi reescrito |
| `package.json` / lock | Next 16.4.3 preservado; Node `24.x` fixado, compatível com o ambiente local e Vercel. Lock alterado somente na metadata de engines; nenhuma versão de dependência alterada |
| Variáveis públicas compiladas com valores Development | Risco operacional: o deploy Git deve reconstruir com valores Production. Nunca publicar o `.next` local já compilado nem achar que trocar env de runtime troca chaves NEXT_PUBLIC do bundle |

`next.config.ts` preservado, sem export estático, rewrites, `env` com segredos ou configuração Vercel adicional. APIs, actions e SSR usam o runtime Node padrão. Com Cache Components nesta versão, **não adicionar `runtime='edge'` nem export `runtime='nodejs'`**; a documentação instalada orienta manter o padrão.

## 3. Verificações locais

- `npm ci`, instalação reproduzível pelo lockfile. Foi necessário parar apenas o Next local que prendia o binário SWC; caches de testes/Postgres foram preservados e restaurados. Para desenvolvimento local, reiniciar com `npm run dev` ao concluir a preparação.
- `npm test`: 206 unitários aprovados.
- `node --test --test-concurrency=1 tests/db/*.test.mjs`: 123 SQL/PGlite aprovados, incluindo bootstrap das migrations, RLS A/B/anon e exclusão atômica das 16 tabelas. Testes já existentes da candidata continuam apenas regressão local, sem promoção.
- Lint e `npx tsc --noEmit`: aprovados.
- `node tests/helpers/production-preflight.cjs`: **npm run build aprovado**, 33 assets de navegador inspecionados sem marcador/chave administrativa e 17 checks HTTP aprovados. Login 200, oito rotas protegidas 307 para login, página/API dev 404 mesmo com flags verdadeiras no processo de teste, exclusão sem sessão 401 e cross-origin 403. Sem cookies/JWT ou operações autenticadas. Relatório local ignorado em `node_modules/.cache/deploy/production-preflight.json`.
- O smoke confere login, oito rotas protegidas, 404 de ferramentas dev mesmo com flags ativadas no processo de teste, exclusão sem sessão/cross-origin e ausência do marcador/chaves administrativas no JS do navegador. Não autentica nem altera contas/dados reais.

`npm audit --omit=dev`: zero avisos. O audit completo aponta um moderado em `postcss-selector-parser@6.1.4`, transitivo de Tailwind/postcss-nested; fix disponível em 6.1.5. O app não processa seletores CSS de usuárias em requests. Uso de build com fontes confiáveis não está exposto segundo o advisory; registrar atualização de manutenção, sem executar `npm audit fix` amplo nesta etapa. ESLint 9 também emitiu aviso de fim de suporte. Esses pontos não equivalem a uma certificação geral de segurança.

Sem SITE_URL/hosts Vercel no build local, o Next emite aviso de metadataBase e usa seu próprio localhost para imagens sociais. É fallback **local do framework**, não destino de Auth. Em Vercel Production a origem pública ausente/inválida falha explicitamente; a origem deve vir da variável opcional ou dos hosts do Vercel. Não publicar este `.next` local: Vercel deve reconstruir com as variáveis Production.

## 4. Git: promoção controlada

Após `git fetch origin`, snapshot desta auditoria: `origin/main=14ec561`, `desenvolvimento=dc6d110`; **4 commits só em main e 9 só em desenvolvimento**. A main local ainda é antiga. `git merge-tree --write-tree origin/main desenvolvimento` terminou sem conflitos dos commits; não alterou branch ou árvore de trabalho. Não inclui mudanças ainda não commitadas.

1. Revisar todas as alterações locais de UX/performance/responsividade e desta preparação, incluindo untracked. Não versionar `.env`, `.temp`, `.vercel`, dumps ou logs. As remoções do índice dos caches precisam entrar no commit de limpeza.
2. Commitar em desenvolvimento somente arquivos revisados; não usar `git add .` sem revisão. Nenhum commit automático foi feito.
3. Fazer push de desenvolvimento quando aprovado. Abrir PR **desenvolvimento → main**, revisar arquivos e repetir checks para o SHA final.
4. Usar merge normal pelo PR, preservando os dois históricos. Não force-push, reset/rebase destrutivo ou substituição de main. Reavaliar conflitos após os novos commits; a simulação anterior não garante o merge futuro.
5. Anotar o SHA aprovado em main. Esse SHA deve fornecer tanto o app quanto as migrations usadas em Production.

## 5. Criar Supabase Production — manual

1. Criar um novo projeto, nome explícito `Rotina - Produção`, na organização correta. Escolher região próxima ao uso e à função Vercel. Guardar senha do banco em gerenciador de senhas; não enviar ao chat, código ou logs.
2. Aguardar projeto ativo. Não restaurar backup de Development, importar dados ou cadastrar conta oficial. Conferir URL/ref no Dashboard e nome antes de qualquer comando de escrita.
3. Copiar URL pública, publishable key e secret key do **mesmo novo projeto** diretamente aos campos de ambiente do Vercel. A secret key não é senha do banco nem token da CLI.
4. Usar worktree separada para não sobrescrever o vínculo Development atual. Depois da promoção aprovada, exemplo PowerShell na raiz do repositório:

```powershell
git fetch origin
git worktree add --detach ..\RotinaProducao origin/main
Set-Location ..\RotinaProducao\rotina
npm.cmd ci
npx.cmd supabase login
npx.cmd supabase projects list
npx.cmd supabase link --project-ref <REF_DO_NOVO_PROJETO_PRODUCTION>
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --dry-run --skip-vault
```

O login da CLI pode usar seu armazenamento protegido; senha, se solicitada, apenas no prompt local. Não usar `--db-url` ou `--password` com credenciais literais em histórico de comandos. Não executar esses comandos em `AppRotina/rotina` vinculada a Development.

O dry-run do banco novo deve apresentar **exatamente** a lista abaixo e nenhum seed/role. Qualquer objeto de progresso ou migration extra exige parar. Depois de conferir nome/ref e receber confirmação:

```powershell
npx.cmd supabase db push --linked --skip-vault
npx.cmd supabase migration list --linked
npx.cmd supabase gen types typescript --linked --schema public
```

Gerar tipos primeiro em arquivo separado por redirecionamento UTF-8 no terminal; nunca sobrescrever automaticamente `database.types.ts`. Comparar todos os contratos, preservando aliases. Sem divergência, não há motivo para trocar tipos iguais. Divergência inesperada: parar, sem editar migrations aplicadas. Não usar `--include-seed`, `--include-roles`, candidates, `db reset`, `config push` ou restauração de dados.

### Migrations Production, nesta ordem

1. `20261011000100_master_schema.sql`
2. `20261011000200_master_integrity.sql`
3. `20261011000300_master_rpc.sql`
4. `20261012000100_master_read_rpc.sql`
5. `20261012000200_private_permissions_hardening.sql`
6. `20261019000100_revision_conflict_http_409.sql`
7. `20261022000100_daily_plan_items.sql`
8. `20261026000100_ideas.sql`
9. `20261027000100_projects.sql`
10. `20261027000200_financial_transactions.sql`
11. `20261027000300_fixed_expenses.sql`
12. `20261028000100_account_deletion.sql`

### Schema esperado e conferência sem dados pessoais

16 tabelas de aplicação em public: areas, activities, reminder_configs, commitment_configs, planning_contexts, fixed_schedules, goals, recurrence_rules, time_windows, daily_plan_items, ideas, projects, project_tasks, financial_transactions, fixed_expenses, fixed_expense_months. Todas com owner e RLS. Sem user_temporal_preferences, progress_attempts, activity_progress_logs, activity_goal_versions, progress_log_goal_versions ou activity_progress_voids.

RPCs da aplicação: get_activity_aggregate, save_activity_aggregate, save_fixed_expense, initialize_fixed_expense_month e save_fixed_expense_month. Helpers privados sem EXECUTE de browser. Conferir triggers de auditoria/integridade, CAS e ownership, unicidades/FKs compostas e PT409 da RPC mestre. **Exclusão depende da migration 12**, do trigger `routine_before_account_delete` em auth.users e da função privada `before_account_delete`, SECURITY DEFINER com search_path pg_catalog e sem EXECUTE para PUBLIC/anon/authenticated.

Rodar consultas de catálogo READ ONLY no novo projeto; não há necessidade de listar dados ou claims:

```sql
begin read only;
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped)
order by c.relname; -- exatamente as 16 tabelas acima, todas true
select tablename, cmd, roles, qual, with_check from pg_policies where schemaname='public' order by tablename, policyname;
select tgname, tgenabled from pg_trigger where tgrelid='auth.users'::regclass and tgname='routine_before_account_delete';
select prosecdef, proconfig,
  has_function_privilege('anon',oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',oid,'EXECUTE') as browser_execute
from pg_proc where oid='routine_private.before_account_delete()'::regprocedure;
-- true; search_path=pg_catalog; false; false
commit;
```

Conferir também grants por coluna e negação de anon nas tabelas/RPCs conforme migrations. Estes checks não substituem o smoke com sessões reais.

## 6. Vercel — importar GitHub sem configurações extras

Depois de aprovar o commit de main e preparar o novo Supabase:

- Importar `VictoriaPaiva/AppRotina` pelo GitHub. **Root Directory: rotina**.
- Framework: Next.js; Node: **24.x**, também fixado no package.json.
- Install: `npm ci`; Build: `npm run build` (ou padrões detectados equivalentes).
- Output: padrão Next.js (`.next`); não usar `out`, export estático ou rewrite SPA.
- Production Branch: **main**. Não ligar deploy Production a desenvolvimento.
- Sem vercel.json, CI/CD adicional ou domínio customizado neste corte.
- Em Production, cadastrar variáveis abaixo antes do deploy. Não copiar envs de Development automaticamente para Production. Proteger previews; não compartilhar credenciais Production com Preview/Development.
- O primeiro deploy serve para obter/verificar o alias estável `https://SEU-APP.vercel.app`. Não cadastrar conta oficial. Usar esse alias, não a URL única de um deployment, nos testes de Auth.

### Variáveis exatas

| Variável | Obrigatória | Tipo/escopo e origem |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Sim | Config pública, Production; URL do novo Supabase |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Sim | Config pública, Production; publishable key do novo Supabase |
| SUPABASE_SECRET_KEY | Sim, exclusão de conta | **Secret**, somente Production/servidor; secret key administrativa do mesmo Supabase |
| NEXT_PUBLIC_SITE_URL | Opcional, recomendado após obter alias | Config pública, Production; origem HTTPS estável, sem caminho/query; apenas metadata canônica |

Na ausência de SITE_URL, metadata usa `VERCEL_PROJECT_PRODUCTION_URL` ou `VERCEL_URL`, fornecidas pelo Vercel; não criar essas variáveis manualmente. **Auth não depende de NEXT_PUBLIC_SITE_URL:** cadastro/reset já usam a origem real do browser. A segurança/funcionamento depende do Site URL e allowlist corretos no Supabase. Não definir NODE_ENV manualmente. Não configurar DEV_*, SUPABASE_SERVICE_ROLE_KEY (fallback legado desnecessário), senha do banco ou token CLI no Vercel. Nunca criar NEXT_PUBLIC_SUPABASE_SECRET_KEY.

Após mudar variáveis, executar novo deploy; variáveis NEXT_PUBLIC ficam fixadas no build. Conferir Settings → Environments e o SHA implantado, sem capturar/expor secret em screenshot ou logs. O tipo Secret do Vercel protege sua gestão, mas o `server-only` continua obrigatório no código.

## 7. Supabase Auth Production — depois da URL Vercel

No novo projeto, Authentication → URL Configuration:

- Site URL: `https://SEU-APP.vercel.app`.
- Redirect URLs: o callback `https://SEU-APP.vercel.app/auth/confirm` e as duas URLs solicitadas pelo app:
  - `https://SEU-APP.vercel.app/auth/confirm?next=/hoje`
  - `https://SEU-APP.vercel.app/auth/confirm?next=/auth/update-password`
- Sem localhost, IP local, origem Development ou wildcard global `*.vercel.app` em Production. Development mantém suas URLs atuais separadamente.
- Manter confirmação de e-mail. Não desabilitá-la para fazer o smoke parecer aprovado.
- Configurar **SMTP próprio** antes de testar com e-mail secundário: o remetente padrão Supabase é limitado a endereços da equipe, sujeito a limites e não serve como envio de produção. Credenciais SMTP entram no Dashboard Supabase, não no código/chat/Vercel. Verificação do domínio do remetente não exige configurar domínio customizado do app.

Configurar templates de e-mail SSR no Dashboard Production. Exemplos de href (adaptar apresentação):

```html
<!-- Confirm signup -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;next=/hoje">Confirmar cadastro</a>
<!-- Reset password -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=/auth/update-password">Redefinir senha</a>
```

O callback já aceita OTP/token_hash e PKCE/code, grava sessão por cookies, descarta tokens da URL seguinte e limita destino a rotas internas. Recovery força update-password. Templates são configuração do Auth, não schema da aplicação. Não copiar tokens de links recebidos para chat/logs. Não usar URL de preview ou localhost nesses templates Production.

## 8. Smoke do primeiro deploy — conta secundária, sem conta oficial

Usar janela/perfil separado e e-mail secundário acessível. Dados sintéticos apenas como entradas manuais desse smoke, **não seed**. Anotar aprovação por item, sem dados pessoais:

- [ ] Sem sessão: páginas protegidas redirecionam ao login; `/dev/limpar-dados` e POST `/api/dev/clear-data` retornam 404. Confirmar ausência de flags DEV no Vercel.
- [ ] Cadastro secundário, recebimento/confirmação por SMTP e login; sessão persiste após refresh.
- [ ] Criar Área e Activity, editar e recarregar, conferir UUID/revision.
- [ ] Planejar Hoje/Amanhã/data; duplicação retorna conflito; concluir/desfazer; pendência e reagendamento.
- [ ] Calendário mostra os mesmos itens nas datas corretas.
- [ ] Projeto/tarefas, Ideia, receita/despesa e totais de Finanças persistem.
- [ ] Conta fixa: mês financeiro, pagamento, despesa vinculada, desfazer e ausência de duplicação.
- [ ] Logout remove acesso; recuperar senha pelo e-mail, callback correto e atualização/login com nova senha.
- [ ] Duas abas: conflito sem sobrescrita; falha de rede/sessão sem falso sucesso e com rascunho preservado.
- [ ] Se usar duas contas secundárias, conferir isolamento A/B antes de removê-las. Não compartilhar JWT manualmente.
- [ ] **Com confirmação manual da usuária**, excluir apenas a conta secundária pelo fluxo Minha conta e frase exata. Conferir logout, login antigo negado, remoção de dados funcionais e preservação da estrutura. Não usar SQL/admin API para escolher arbitrariamente alvo.
- [ ] Network/JS do browser sem chave administrativa; nenhuma credencial em logs da Vercel/Supabase.

Somente depois de tudo aprovado criar/usar a conta oficial. Se falhar, parar a adoção; não mover dados oficiais para Development como contorno.

## 9. Rollback e continuidade

- Anotar deployment ID/SHA e projeto Production antes de cada mudança. Em falha de app, promover deployment anterior compatível pelo Vercel; se não houver anterior, suspender o uso até corrigir.
- Não apontar Production para Development, excluir projetos, rodar reset ou desfazer schema com SQL destrutivo. Reverter app não reverte migrations.
- Após dados oficiais, exigir backup/recuperação disponíveis no plano e migration incremental revisada antes de alterar schema. Não presumir PITR em plano sem esse recurso.
- Em falha de configuração, corrigir env/Auth e redeploy; em falha de migration, revisar status/catalog e propor correção incremental, sem editar arquivos já aplicados.
- Manter worktree/link Production separado. Antes de qualquer comando remoto futuro, conferir qual diretório/projeto está vinculado.
- Pendências atuais: commit/PR aprovados, criação de Production, SMTP, variáveis e importação Vercel, aplicação confirmada das 12 migrations, configuração Auth e smoke. Nenhuma funcionalidade avançada liberada por este checklist.

## Fontes oficiais consultadas

- [Vercel: Node.js e engines](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel: ambientes](https://vercel.com/docs/environment-variables) e [Config/Secret](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: Next.js SSR e template](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)
- [Supabase: SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Advisory do parser CSS](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)
- Runtime/env: documentação instalada em `node_modules/next/dist/docs`, correspondente ao Next 16.4.3.
