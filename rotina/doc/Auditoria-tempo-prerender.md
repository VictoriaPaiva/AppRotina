# Auditoria de tempo no prerender — Next.js 16.4.3

## Causa e reprodução

As páginas com `Suspense` não eram a origem do relógio instável. O caminho
compartilhado era `lib/supabase/server.ts` → `createServerClient` → tarefas do
SDK de Auth. Com sessão em cookies, `SupabaseAuthClient.__loadSession` lê
`Date.now()` para verificar expiração; isso também ocorre pela notificação
inicial de sessão (`_emitInitialSession`). Verificação de claims/expiração e
cache de JWKS possuem outras leituras legítimas do relógio dentro do SDK.

`await cookies()` já existia, mas não bastava para impedir essas tarefas no
prerender especulativo de Development. Uma sessão sintética reproduziu os
erros, sem banco remoto, em Hoje, Banco Mestre, Planejamento, Calendário,
Projetos, Ideias e Finanças. O controle negativo remove **somente**
`await connection()` da cópia descartável. HTTP 200 não é evidência suficiente:
o Next registra o erro de prerender no log mesmo com resposta 200.

Não há evidência de que a migration V0.4 seja a causa; não foi alterado schema.

## Correção

O factory server de Supabase aguarda `connection()` **antes** de criar o SDK.
Assim, nem a inicialização nem suas tarefas assíncronas de autenticação começam
antes de uma requisição real. Não se cacheia o relógio ou a sessão.

É uma fronteira compartilhada de dados autenticados, abaixo dos `Suspense`
existentes. Não há `connection()` adicional na página inteira, conversão para
Client Component ou reload. `cacheComponents` e `partialPrefetching` continuam
habilitados, com cascas parciais no build. O conteúdo autenticado depois da
fronteira aguarda navegação real, em vez de executar durante prefetch.

Na versão instalada, as referências locais consultadas foram
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`
e `io.md`. `io()` permite prefetch; escolheu-se `connection()` aqui para exigir
requisição real antes das tarefas de sessão e do relógio civil atual.

## Rotas auditadas

| Fluxo | Tempo durante leitura/render | Estratégia |
| --- | --- | --- |
| Hoje | SDK + `planToday()` | Factory com `connection()`, depois data atual |
| Planejamento | SDK + hoje para defaults/pendências | Mesma fronteira antes do helper |
| Calendário | SDK + hoje para mês/data de referência | Mesma fronteira antes do helper |
| Banco Mestre/lista, detalhe, novo, edição e áreas | SDK; sem relógio de negócio na listagem | Fronteira no SDK; sem inventar data na rota |
| Projetos/lista, novo e edição | SDK; datas persistidas na apresentação | Fronteira no SDK; formatação determinística mantida |
| Ideias/lista, novo e edição | SDK; datas persistidas na apresentação | Mesma estratégia |
| Finanças/lista | Mês padrão atual **antes** da sessão | Sessão passa a preceder o cálculo do mês |
| Finanças/contas fixas | Mês de referência atual **antes** da sessão | Sessão passa a preceder o cálculo e a inicialização mensal |
| Finanças/nova transação | Hoje depois da sessão | Factory compartilhado cobre; sem mudança no default |
| Finanças/edição e nova conta fixa | SDK; sem novo relógio de negócio | Factory compartilhado cobre |
| Conta e protected | SDK | Factory compartilhado cobre |
| Auth callback, server actions e APIs de desenvolvimento | Execução por requisição/evento | Leituras de tempo legítimas; sem nova regra de negócio |

## Usos legítimos preservados

- `lib/planning/dates.ts`: `planToday(now = new Date())` é a única fonte de
  data civil atual para leitura server. Chamadores aguardam o factory de sessão.
  `America/Sao_Paulo` permanece explícito, inclusive com regras históricas de DST.
- `new Date(0)` em `planning/dates.ts` e `planning/calendar.ts`: datas base
  determinísticas, depois ajustadas com argumentos de entrada; não são “agora”.
- `banco-mestre/editor.ts`, `finance/bills.ts`, `ideas/presentation.tsx`,
  `ProjectEditor` e `BillsSection`: parse/formatação de datas explícitas ou
  persistidas; não consultam o relógio atual.
- `ActivityForm`: helper `today()` nos eventos de adicionar regra e timestamp
  no envio. Nenhuma dessas leituras acontece ao renderizar o formulário.
- `dev-cleanup/confirmation.ts`: TTL de token em handlers explícitos.
- `banco-mestre/data/smoke.ts` e `rls-smoke.ts`: timestamps de verificações
  disparadas por APIs de desenvolvimento, fora do prerender de páginas.
- Proxy de sessão: roda no ciclo de uma requisição; não é Server Component.
- Clientes Supabase dos formulários de Auth, logout e exclusão de conta:
  criados dentro dos handlers de ação, não durante o render.

## Regressão e validação

`tests/render-time.test.cjs` cobre a suspensão antes de cookies/SDK, leitura de
Hoje e Banco Mestre, Calendário, transações e contas fixas, além de limites de
meia-noite/ano e DST em São Paulo. Uma inspeção AST dos fontes mantém inventário
explícito de leitores diretos de tempo, ignorando comentários e distinguindo
`new Date()` de `new Date(valor)`.

Smoke real, isolado e sem contas/banco externos:

```powershell
node tests/next/render-time-smoke.mjs
```

O script copia os fontes para uma pasta descartável, usa um servidor HTTP local
com sessão e respostas sintéticas e inicia outro Next Development. Verifica as
oito rotas principais e os logs, sem interromper o servidor da IDE. Não valida
RLS, dados reais ou aparência visual. O controle negativo pode ser executado com
`--without-request-boundary`; deve falhar por erros de relógio no log.

Resultados locais em 31/10/2026: 249 testes unitários passaram (8 novos), lint,
TypeScript, build e diff-check passaram. O smoke das oito rotas passou, incluindo
RSC prefetch de Hoje e Banco Mestre, sem erros de relógio no log. O build manteve
as rotas como parcialmente prerenderizadas. Houve o aviso já existente de
`metadataBase` e, no smoke isolado, fallback de fonte Google sem acesso à rede.

Continuam recomendados smoke autenticado com dados reais de Development,
navegação/prefetch no navegador e conferência visual desktop/mobile. Nenhum
deploy ou aplicação de migration faz parte desta correção.
