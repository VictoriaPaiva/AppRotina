# Auditoria de performance — 28/10/2026

MVP funcional concluído. Conforme informado pela usuária, exclusão definitiva validada com conta secundária. Esta etapa não executou exclusões, não criou dados remotos, não promoveu a candidata de progresso e não alterou Auth, RLS ou comportamento de negócio.

## Método e limites

Antes de editar: build original; inspeção das oito rotas e repositories; medição HTTP dev/produção; benchmark dos readers reais com transporte controlado; auditoria remota READ ONLY dos índices/estimativas. Depois: mesmas sondas e suítes de regressão.

Não há navegador conectado nem sessão autenticada disponibilizada nesta execução. As medições HTTP das oito rotas são **redirecionamentos sem sessão**, não tempos de módulos autenticados. Consultas/concorrência abaixo vêm do código executado por cada reader; não são um trace de tráfego de uma sessão real. Não se copiam cookies da usuária nem se usa segredo administrativo para contornar login.

Benchmark controlado: 40 ms por etapa de consulta, cinco amostras aquecidas, mediana, código original recuperado do HEAD anterior às alterações. Contas fixas modeladas corretamente como initialize seguido de duas leituras paralelas. Instrumentação somente em `tests/helpers/performance-probes.cjs`, sem telemetria de produção ou dados pessoais. Latência absoluta em Supabase/usuária ainda não medida.

## Auditoria por rota

Base: até 499 linhas por consulta de listagem. Cada coleção usa páginas de 500 e consulta adicional quando a última tem exatamente 500 linhas. O guard online `getUser` do proxy permanece em todas as rotas; `getClaims` é uma invocação no reader, não necessariamente uma viagem de rede (depende de JWT/JWKS/SDK).

| Rota | Consultas de dados na base | Ordem/duplicação/crescimento |
| --- | --- | --- |
| /hoje | 3 + 1 getClaims | Dia, pendências anteriores e catálogo de Activities em paralelo. Pendências e catálogo crescem; sem N+1. |
| /planejamento | 3 + 1 getClaims | Mesmo reader de Hoje, data selecionada. Ao selecionar data passada pode haver sobreposição legítima entre dia e pendências. |
| /calendario | 3 + 1 getClaims | Planos somente entre início/fim do mês, catálogo e Áreas em paralelo; não lê histórico inteiro de planos. Catálogo ainda cresce. |
| /projetos | 2 + 1 getClaims | Projetos e projeção mínima de progresso em paralelo. Ainda percorre todas as tarefas para contagens; não traz títulos/detalhes. |
| /banco-mestre | 2 | Áreas e Activities em paralelo, RLS da sessão. Sem RPC individual por item e sem SELECT *. |
| /ideias | 1 + 1 getClaims | Listagem paginada pelo owner, incluindo conteúdo integral para gerar prévia; texto longo é risco de volume. |
| /financas | 4 + 2 getClaims | Transações do mês em paralelo com initialize mensal; depois mês de contas e definições em paralelo. Resumo agora não espera contas. |
| /conta | 0 | getUser no proxy e novamente na página. Duplicação online conservada: página confirma usuário sem confiar em headers enviados pelo cliente. |

Não foram encontrados N+1 nos fluxos principais. Repositories usam colunas explícitas. Layout não busca dados funcionais; navegação e tema precisam de estado no cliente. Os Client Components de formulários, calendário, planejamento e listas interativas têm estado/eventos reais; nenhuma conversão em massa foi feita. Sem cache compartilhado de dados por usuário.

## Gargalos corrigidos e impacto medido

| Ponto | Antes → depois | Significado |
| --- | --- | --- |
| Detalhe de Projeto | 95 → 43 ms no transporte controlado | get e tarefas independentes em Promise.all; uma etapa de rede a menos no caminho crítico. Não reduz número de consultas. |
| Conteúdo principal de Finanças | 92 → 49 ms no transporte controlado | Contas em Suspense próprio. Resumo/lista chegam antes; tempo total das contas e número de consultas não diminuem. |
| Dados de tarefas na lista de Projetos | 450.004 → 123.004 bytes / 1.000 tarefas sintéticas | Redução de 72,7% no payload JSON bruto do transporte, antes de compressão; mesmas 3 páginas. Não é medição de banda real. |
| Agregação na lista de Projetos | O(projetos × tarefas) → O(projetos + tarefas) | Uma passagem para agrupar progresso, sem filtrar toda a lista novamente para cada card. Percentuais 0/parcial/100 preservados. |

`taskProgress()` lê somente user_id, project_id e completed_at. A ordenação por project_id, created_at, id aproveita a ordem do índice existente. O detalhe continua carregando tarefas completas apenas do projeto aberto, com filtro owner/project_id e mesmos erros seguros.

Finanças mantém os dois reads iniciados juntos, mas não usa uma barreira Promise.all para renderizar tudo. Loading “Carregando contas do mês…” só na seção; erro de contas continua local. Não altera regra do dia 20, valores, geração mensal ou pagamentos.

## Banco e índices

Auditoria remota confirmou índices existentes: `daily_plan_items_owner_date_idx(user_id,planned_date)`, `financial_transactions_owner_date_idx(user_id,date DESC,id)`, `fixed_expense_months_owner_reference_idx(user_id,reference_month,due_day,id)`, `project_tasks_owner_project_idx(user_id,project_id,created_at,id)`, além dos índices de listagem de Activities/Áreas/Ideias/Projetos.

Calendário filtra user_id e intervalo mensal; lançamentos filtram user_id e limites do mês; contas filtram user_id/reference_month. Nenhuma dessas telas lê todo o histórico financeiro ou de calendário. Estatísticas remotas mostraram estimativas de linhas zero; isso não substitui contagem real nem EXPLAIN sob carga representativa. Não há evidência para novos índices, principalmente duplicatas dos existentes. **Zero migrations e zero índices criados/aplicados.**

## Cache Components / Partial Prefetching

Mantido `cacheComponents: true` e habilitado `partialPrefetching: true`. Documentação instalada consultada: `node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md` e referência `partialPrefetching.md` da versão 16.4.3. Não foi instalado skill ou dependência.

As rotas já resolvem searchParams/dados autenticados atrás de Suspense, assim como usePathname dos elementos globais. Não há links com prefetch completo explícito a preservar. Partial Prefetching compartilha a casca por rota, em vez de trabalho por cada link com parâmetros; dados dinâmicos continuam resolvidos no servidor, sem introduzir use cache para dados sensíveis. false manteria o comportamento legado; remover Cache Components exigiria revisão desnecessária das rotas já construídas para esse modo.

Build e dev confirmaram a configuração aceita e ausência do warning anterior. Ainda é necessário validar a navegação autenticada/prefetch no browser; testes instant/Playwright não estão disponíveis neste projeto/ambiente.

## Dev versus produção

HTTP localhost, sem cookies, uma amostra de aquecimento descartada e mediana de três respostas completas por rota. Todos os valores abaixo são 307 de acesso não autenticado; diferenças de poucos ms não provam ganho nos módulos.

| Rota | Dev antes/depois ms | Produção antes/depois ms |
| --- | --- | --- |
| /hoje | 16 / 15 | 16 / 15 |
| /planejamento | 16 / 13 | 14 / 10 |
| /calendario | 11 / 16 | 18 / 16 |
| /projetos | 17 / 16 | 16 / 11 |
| /banco-mestre | 17 / 16 | 16 / 8 |
| /ideias | 18 / 14 | 2 / 17 |
| /financas | 17 / 16 | 17 / 17 |
| /conta | 11 / 29 | 13 / 9 |

Controle público `/auth/login`, resposta 200: mediana dev 96 ms, produção 24 ms após as mudanças. Produção elimina trabalho de desenvolvimento, mas esses números não permitem afirmar melhora percebida das telas autenticadas. Ready do processo não é tempo de renderização. Dev ainda informa filesystem lento (286 ms no benchmark interno); localização/antivírus/disco podem influenciar compilação. Não se alterou configuração do computador.

## Revalidação e trabalho futuro

Mantidas invalidações atuais: após pagamento é necessário atualizar resumo/lista de transações e outras telas de Finanças; reduzir o escopo sem rastrear todas as dependências arriscaria saldo desatualizado. Não há evidência nesta rodada para mexer nisso. getUser online, getClaims e isolamento por owner preservados.

Próximos candidatos, somente com volume/trace autenticado: agregar contagens de tarefas no banco; prévia de Ideias sem transferir conteúdo integral; paginação visível de listas longas; catálogo mínimo para calendário/planejamento; plano de pendências sob histórico grande; verificar se definitions de contas podem ser reduzidas; avaliar memoização estritamente por request do cliente/claims duplicados de Finanças. Não adicionar índice ou cache antes de medir.

## Validação, arquivos e próxima etapa

Aprovados: **192 unitários, 123 SQL/PGlite**, teste PostgreSQL 17 local de regressão de conta em cluster descartável, lint, TypeScript e build Turbopack. SQL cobre equivalência de contagens e isolamento A/B da projeção nova; unitários verificam concorrência sem depender de tempos, streaming e paginação/payload de 1.000 tarefas. `npm run dev` e `npm run start` iniciaram corretamente. Diff-check registrado ao finalizar.

Arquivos: `next.config.ts`; `app/financas/page.tsx`; `app/projetos/page.tsx`; `lib/projects/{contracts,repository,server,progress}.ts`; `tests/projects.test.cjs`; `tests/db/projects.test.mjs`; novos `tests/performance.test.cjs` e `tests/helpers/performance-probes.cjs`; este relatório e README. Sem novas dependências, alterações de migrations, Auth, RLS, TTL ou candidata pausada.

Próxima etapa recomendada: validação desktop autenticada do build de produção, sem novas funcionalidades. DevTools Network/Performance: comparar entrada direta e navegação entre as oito telas, mês anterior/atual, detalhe de Projeto e progresso; rede lenta para confirmar resumo antes de contas; pagar/desfazer e conferir saldo; logout/conta A/B; medir tempo até conteúdo útil e requests duplicados. Só então escolher outra otimização com evidência ou seguir acabamento/responsividade básica.
