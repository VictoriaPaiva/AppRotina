# Responsividade mobile e tablet — 29/10/2026

## Ajuste posterior: FAB mobile — 29/10/2026

A pedido da usuária, o + saiu da barra inferior e voltou a ser flutuante no canto direito, acima da barra, em telas abaixo de 1280 px. Este ajuste substitui a decisão anterior de integrar o + à barra. Mantidos os três destinos, um único componente/menu e as dimensões/posição desktop. Margens incluem safe area inferior/direita; alvo de 56 px, z-index 40 abaixo dos modais, colisão de dropdown com margem de 16 px e altura limitada à viewport. O espaço inferior de conteúdo já existente permite rolar o último campo/ação acima do FAB. Durante foco em inputs/textarea/editor, o FAB estreito é ocultado junto da navegação para não disputar espaço com o teclado.

Finalização do ajuste: a regra global de botões estreitos agora exclui o FAB, preservando seu alvo de 56 × 56 px; `app/layout.tsx` declara `viewportFit: cover` para habilitar safe areas sem bloquear zoom. Mantidos o componente/menu existentes, as três rotas e a apresentação desktop. Sem mudanças de regra, banco, dependências ou redesenho da navegação.

**Validação final concluída em 29/10/2026:** Chrome isolado, sem cookies reais, com componentes reais e fixtures sintéticos temporários: **25 vistas** de Hoje, Calendário, Finanças, ActivityForm e formulário financeiro em **320×800, 390×844, 768×1024, 1024×768 e 1440×900**. Sem overflow horizontal; o conteúdo e as últimas ações podem ser rolados acima do FAB. Abaixo de 1280 px, o FAB fica fora e acima da barra inferior, com 56 px e z-index 40; em 1440 px, continuam a posição de 24 px, tamanho e z-index 50 do desktop. Modal nativo permanece acima do FAB.

Menu testado por clique e Enter nos cinco tamanhos: dentro da viewport, três links corretos, Escape fecha e devolve o foco ao botão. As três ações iniciaram suas rotas originais (`/banco-mestre/nova`, `/projetos/nova`, `/ideias/nova`) e chegaram ao login esperado na sessão isolada sem autenticação. Gravações e requisições externas do navegador bloqueadas; nenhuma submissão ou dado remoto alterado. Emulação de teclado por foco e redução de viewport confirmou ocultação do FAB durante edição e retorno após blur nas quatro larguras estreitas. Safe area emulada de 34 px inferior/20 px direita resultou nas margens esperadas de 106/36 px. Isso não equivale a um teste de teclado virtual em dispositivo iOS/Android real.

Evidências desta finalização: [relatório dos cinco tamanhos](screenshots/responsividade/fab-final-20261029/report.json), [320 Hoje](screenshots/responsividade/fab-final-20261029/320-hoje.png), [390 Finanças](screenshots/responsividade/fab-final-20261029/390-financas.png), [768 formulário](screenshots/responsividade/fab-final-20261029/768-activity.png), [1024 Calendário](screenshots/responsividade/fab-final-20261029/1024-calendario.png) e [1440 desktop](screenshots/responsividade/fab-final-20261029/1440-calendario.png). Os screenshots e medições das seções antigas abaixo pertencem à rodada anterior, com + integrado.

Checks finais: **204 unitários**, lint, TypeScript, build de produção e diff-check aprovados. O erro inicial de referência obsoleta do Turbopack foi resolvido reiniciando somente o servidor de validação com cache de desenvolvimento novo; o cache anterior foi preservado dentro de `.next`. Servidor/Chrome isolados encerrados e as duas fixtures temporárias removidas antes do build. Nenhuma rota de fixture no build final. Backlog/Documento Mestre não alterados nesta finalização pontual; mudanças anteriores do diretório de trabalho preservadas.

MVP funcional preservado. Revisão de apresentação, sem mudanças de banco, regras, dependências ou arquitetura pausada. As alterações de performance e UX desktop já presentes no diretório foram preservadas.

## Cobertura e evidências

Chrome isolado, sem cookies da usuária: **126 vistas**, em 320×800, 360×800, 390×844, 768×1024, 1024×768, 1280×800 e 1440×900. Componentes reais com fixtures sintéticos para Hoje, Planejamento, Calendário, Projetos, Banco Mestre, Ideias, Finanças, Conta, Áreas, formulário de Activity, projeto/tarefas, ideia, lançamento e conta fixa. Login, cadastro, recuperação e atualização de senha acessados nas rotas públicas reais. Estados vazios, erros e pending também revisados no código e nas suítes existentes.

Foram usados títulos longos, palavras sem espaços, valor máximo em centavos, conta mensal variável e tarefas concluídas/pendentes. Os oito módulos protegidos não foram autenticados com a conta principal: fixtures não comprovam CRUD remoto ou sessão real. Requisições de escrita bloqueadas no navegador: **zero tentativas**, zero alteração de dados. Página e componente temporários de fixtures removidos antes do build final; cópias locais em `node_modules/.cache/responsive/fixture-source/`.

Medições em [medicoes.json](screenshots/responsividade/medicoes.json): nenhum overflow horizontal da página e nenhum erro JavaScript capturado. Menus +/Mais permaneceram dentro da viewport em todos os tamanhos aplicáveis. A medição de foco programático não demonstrou abertura de teclado; não equivale a teste de teclado virtual. Teclado, safe areas e seletores nativos precisam de aparelho real.

## Achados e correções

| Classe | Achado | Correção |
|---|---|---|
| IMPORTANTE | Sidebar de 256 px desde 768 px comprimia conteúdo e valores financeiros | Sidebar preservada a partir de 1280 px; navegação inferior compartilhada abaixo disso |
| IMPORTANTE | + flutuante cobria células do calendário e campos no celular | Mesmo menu integrado à barra inferior; flutuante mantido no desktop |
| IMPORTANTE | Controles de 32–36 px e tarefas com ações espremidas | Controles de 44 px nas telas estreitas/toque, campos de 16 px, tarefas empilhadas e checkbox com área de toque maior |
| IMPORTANTE | Tabela financeira desconfortável e textos longos | Uma única tabela semântica, apresentada como cards abaixo de 1024 px, com labels, quebra de texto e moeda inteira |
| IMPORTANTE | Calendário e conta mensal ocupavam espaço excessivo | Células compactas, cabeçalho empilhado e formulário de conta mensal empilhado até tablet |
| IMPORTANTE | Padding acumulado reduzia largura dos formulários Auth | Padding fluido sem modificar largura desktop |

Não foi confirmado defeito CRÍTICO de regra/persistência nesta rodada. A referência anterior já não tinha overflow global: os problemas eram sobreposição e conforto, sem esconder overflow artificialmente.

Navegação estreita mantém acesso às sete áreas, Minha conta, logout e tema. Tema fica em Mais; o + reutiliza o componente e destinos existentes. Inputs e botões quebram/empilham sem reduzir tipografia para caber. Navegação reserva espaço inferior e tem proteção de foco por CSS; validar comportamento com teclado físico e virtual no aparelho.

## Desktop e screenshots

Em 1280/1440 px: Sidebar de 256 px e + flutuante preservados; tabela financeira e organização desktop de contas mensais mantidas. Em 1440 px foram comparadas capturas antes/depois; ajustes estreitos não substituem o layout desktop. Dispositivos com ponteiro de toque recebem alvos maiores intencionalmente.

Comparação SHA-256 das capturas de 1440×900: imagens idênticas antes/depois em Hoje, Planejamento, Calendário, Projetos, Banco Mestre, Ideias, Finanças e Conta, usando os mesmos fixtures. Isso verifica esses estados desktop, sem prometer ausência universal de regressões.

Capturas selecionadas em [screenshots/responsividade](screenshots/responsividade): calendário 320/1024, lançamentos 390, Finanças 768/1440 e login 360. Série completa antes/depois e runner CDP local em `node_modules/.cache/responsive/` (ignorado pelo Git). Screenshots mostram somente dados sintéticos. O runner bloqueou POST/PUT/PATCH/DELETE; não executou logout, pagamento ou exclusão.

## Arquivos desta etapa

- `app/globals.css`, `app/layout.tsx` e as seis páginas de `app/auth/*/page.tsx`.
- `components/navigation/{Sidebar,BottomNavigation,FloatingAddButton}.tsx`, `components/layout/TopBar.tsx`, `components/theme/ThemeToggle.tsx`.
- `components/ui/{button,input}.tsx`, `components/calendar/CalendarBoard.tsx`, `components/projects/ProjectTasks.tsx`, `components/finance/{FinanceOverview,BillsSection}.tsx`.
- `tests/responsive.test.cjs`; stubs ajustados em `tests/{mvp-audit,finance-navigation,desktop-ux}.test.cjs`.
- README, Backlog, Documento Mestre, este relatório e screenshots/medições.

Os demais arquivos já modificados pertencem às etapas anteriores; não atribuir todo o diff do diretório a esta rodada.

## Validação e backlog

Fechamento automatizado registrado abaixo após execução dos checks. Sem migrations novas ou conexão com dados reais. Backlog de MELHORIAS: refinamento de densidade de listas extensas, revisão assistiva formal e proteção de histórico nativo de rascunho já documentada na rodada desktop. Validação física de teclado, rotação, safe area e seletores de data/moeda permanece necessária; sem PWA ou novas funcionalidades.

Checks aprovados: **203 unitários**, **123 SQL/PGlite**, **1 PostgreSQL 17 local** (cluster descartável, cascata/rollback/isolamento), `npm run lint`, `npx tsc --noEmit` e `npm run build` (Next 16.4.3/Turbopack). Três testes novos cobrem navegação completa/+ compartilhado, tema no menu e uma única lista financeira sem duplicação de centavos/linhas. Build final não inclui a rota temporária de fixtures. Sem warning novo de aplicação no build; Git informa a conversão LF→CRLF já configurada no Windows.

`diff --check` e whitespace dos novos textos aprovados. Smoke HTTP de produção local: quatro telas Auth 200; oito módulos protegidos 307 sem sessão; `/dev/responsivo` e `/dev/limpar-dados` 404. GET da API de limpeza retorna 405 (método não suportado); nenhuma requisição destrutiva foi enviada. Servidor de produção temporário usado somente para leitura.

Roteiro curto em celular/tablet: abrir os sete módulos; em Mais acessar tema e Conta; usar os três destinos do +; criar/editar um item, área, projeto/tarefa e ideia com conta de teste; navegar no calendário; criar/editar lançamento, trocar mês e conferir conta variável/pagamento/desfazer. Repetir com teclado aberto e títulos longos. Conferir login/recuperação e confirmação de exclusão sem excluir a conta principal. Por fim repetir o percurso em desktop ≥1280 px e verificar sidebar/tabela/+.
