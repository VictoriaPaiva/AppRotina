# Atualização restrita do Next.js para 16.4.6

Data: 18/11/2026. Branch confirmada antes da alteração: `desenvolvimento`.
Working tree inicialmente limpo. Sem commit, push, merge em main ou deploy.

## Escopo e compatibilidade

Atualização exata de `next: 16.4.3` para `next: 16.4.6`, usando
`npm.cmd install next@16.4.6 --save-exact --no-audit --no-fund`.
Não foi usado npm audit fix, force, codemod ou atualização geral.

Consultadas as notas oficiais de [16.4.4](https://github.com/vercel/next.js/releases/tag/v16.4.4),
[16.4.5](https://github.com/vercel/next.js/releases/tag/v16.4.5) e
[16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6).
16.4.5 contém as correções de segurança intermediárias; 16.4.6 acrescenta
correções de bugs. Não foi identificada migração de código necessária para este projeto.

Os metadados oficiais do npm para next@16.4.6 mantêm Node >=20.9.0 e peers
React/React DOM compatíveis com ^19.0.0. O projeto usa Node 24.20.0, npm 11.19.0
e React/React DOM 19.3.0. A documentação instalada de 16.4.6 continua descrevendo
`cacheComponents: true` junto de `partialPrefetching: true`, como já configurado.

| Pacote | Antes | Depois |
| --- | --- | --- |
| next | 16.4.3 | 16.4.6 |
| @next/env | 16.4.3 | 16.4.6 |
| @next/swc-* (todos os alvos no lockfile) | 16.4.3 | 16.4.6 |
| react / react-dom | 19.3.0 | 19.3.0 |
| @types/react / @types/react-dom | 19.3.0 | 19.3.0 |
| next-themes | 0.4.6 | 0.4.6 |
| eslint-config-next / @next/eslint-plugin-next | 15.3.1 | 15.3.1 |
| eslint | 9.39.5 | 9.39.5 |
| typescript | 5.9.3 | 5.9.3 |
| styled-jsx | 5.1.6 | 5.1.6 |
| @swc/helpers | 0.5.23 | 0.5.23 |
| sharp | 0.35.5 | 0.35.5 |

Comparação estrutural do lockfile com a cópia anterior confirmou que somente
next, @next/env e @next/swc-* mudaram, além da referência next na raiz do lockfile.
O desalinhamento preexistente de versão major de eslint-config-next foi preservado;
não exigiu ajuste para esta atualização, conforme lint e testes executados.

Nenhuma alteração de código, testes, next.config.ts, Cache Components, Partial
Prefetching, migrations, Supabase ou Vercel. Nenhum acesso a banco remoto.

## Validação

- `npx.cmd tsc --noEmit`: passou.
- `npm.cmd run lint`: passou.
- `npm.cmd test`: 281/281 passaram, incluindo renderização, Banco Mestre e V0.5.
- `node --test --test-concurrency=2 tests/db/*.test.mjs`: 161/161 passaram em PGlite
  isolado, incluindo checklist modes, quantity, sync e subitems.
- `npm.cmd run build`: passou com Turbopack, Next 16.4.6, Cache Components e
  Partial Prefetching; 39 páginas geradas. O aviso de vulnerabilidade anterior
  não apareceu. O download da fonte Geist exigiu acesso à rede no build local.
- `npm.cmd audit --omit=dev --json`: zero vulnerabilidades de runtime informadas
  pelo registro no momento da consulta. Nenhuma correção automática aplicada.
- `node tests/next/render-time-smoke.mjs --v05-authenticated`: passou com
  Turbopack padrão, sem fallback webpack e sem alteração do runner. Nove rotas
  HTTP 200, dois checks RSC/prefetch, sem erros de relógio/prerender no log.
  Chrome com identidade sintética e PGlite localhost validou criação Beber água,
  foco/validação mobile, edição quantity 2→3 e sync, checklist textual, snapshots,
  conclusão/reabertura, viewports 360/768/1440, merge A/B→A/B/C e 20 ocorrências
  mistas com backlog e refresh. Servidor/browser encerrados e fixture removida.
- `git diff --check`: passou. Branch desenvolvimento preservada; o diff contém
  somente os três arquivos listados abaixo. Verificação estrutural do lockfile:
  11 entradas alteradas (raiz, next, @next/env e oito alvos @next/swc-*).

O build mantém o aviso de metadataBase ausente para resolver imagens sociais,
usando localhost como fallback. Essa configuração não foi alterada neste escopo.
A instalação também avisou sobre postinstall não aprovado de unrs-resolver já
existente; nenhuma autorização adicional de scripts foi concedida e o lint passou.

## Arquivos e limites

- `package.json`: versão exata de next.
- `package-lock.json`: referências, integridades e pacotes internos do Next.
- `doc/Manutencao-next-16.4.6.md`: auditoria de compatibilidade e resultados.

A validação local não substitui uma futura validação do ambiente publicado.
Production permanece intacta. Sem commit, push, merge ou deploy.
Nenhuma incompatibilidade ou pendência bloqueante foi identificada nos testes locais.
