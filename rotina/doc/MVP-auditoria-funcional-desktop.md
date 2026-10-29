# Auditoria funcional e UX desktop — 28/10/2026

MVP funcional concluído; preparação para uso oficial. Auditoria de performance anterior preservada. Sem etapa mobile/tablet, redesign, novas regras de negócio, migrations, integrações ou retomada da candidata de progresso.

## Escopo e evidência

Revisados código, rotas, navegação, formulários, estados e testes de `/hoje`, `/planejamento`, `/calendario`, `/projetos`, `/banco-mestre`, `/ideias`, `/financas`, `/conta` e suas criações/edições. Incluídos Áreas, tarefas, lançamentos, contas fixas, login/cadastro/recuperação/logout/exclusão e ferramenta dev.

Chrome real headless em **1440×900**, com perfil novo isolado: telas públicas de login, cadastro, recuperação, nova senha e erro de confirmação. Antes: menu e + indevidos, ausência de heading, altura 1060 px para viewport 900. Depois: navegação do app oculta, h1, labels e altura 900, sem overflow horizontal. Capturas e DOM temporários ficam apenas no cache ignorado do projeto.

Para as telas autenticadas, inspeção visual adicional dos componentes reais com CSS do build e dados **sintéticos somente em memória**, em servidor temporário read-only: oito módulos, estados vazios, Áreas e formulários de item/projeto/ideia/lançamento/conta fixa. Esses fixtures não têm sessão, ações ativas ou conexão ao banco e **não substituem o percurso funcional autenticado no navegador**. Nenhum cookie existente foi acessado, e-mail foi enviado ou conta real foi excluída nesta auditoria. Exclusão já validada pela usuária na etapa anterior.

## Achados classificados

**CRÍTICO:** nenhum novo defeito de persistência/isolamento confirmado. As regressões SQL cobrem rollback, A/B, snapshots, conclusão/remarcação, pagamentos e exclusão transacional. Isso não equivale a garantia de ausência de bugs nem a uma nova execução real de exclusão.

| Classe | Achado | Tratamento |
| --- | --- | --- |
| IMPORTANTE | Links Voltar/menus e Cancelar podiam descartar rascunhos silenciosamente. | Proteção compartilhada para navegação visível, Cancelar do item, logout e reload/fechamento. Confirmação antes de descartar; navegação bloqueada durante salvamento. |
| IMPORTANTE | Formulários de Auth e logout não bloqueavam dois eventos antes da atualização de estado. | Trava imediata por ref, pending/aria-busy e campos desabilitados durante envio; rascunhos preservados em erro. |
| IMPORTANTE | Logout não descartava todo o estado de navegação cliente e não mostrava confirmação ao chegar ao login. | Só após signOut confirmado, navegação completa ao login com mensagem; guarda online e ações autenticadas preservadas. |
| IMPORTANTE | Login/cadastro mostravam navegação funcional e + mesmo sem sessão. | Menu lateral, navegação inferior e + ocultos nas rotas Auth, sem mudar as opções do produto autenticado. |
| IMPORTANTE | Conta fixa podia ser salva sem alterações; valor/dia inválido só desabilitava o botão. | Dirty/snapshot confirmado, bloqueio de no-op e explicação de centavos/vencimento inválidos. |
| IMPORTANTE | Falha inesperada/rota inexistente caía no fallback técnico padrão. | error/not-found em português com ação de recuperação; erro interno nunca é renderizado. |
| MELHORIA | Telas Auth tinham rolagem extra e nenhum título semântico. | Altura desktop corrigida, h1 e link de recuperação direta; nova senha oferece saída para login. |
| MELHORIA | Header global competia com o h1 do conteúdo; Banco Mestre/Planejamento dependiam do título global. | Header vira rótulo visual; h1 no conteúdo e níveis de seções ajustados. |
| MELHORIA | Formulário de item muito largo comparado aos outros editores. | Limite max-w-4xl, preservando identidade e grids existentes. |
| MELHORIA | Falha da seção de contas usava o título genérico Finanças novamente. | Erro local identificado como “Contas do mês”, com heading de seção. |

## Conferência dos módulos

| Rota/fluxo | Conferido |
| --- | --- |
| Hoje / Planejamento | Vazio com caminho para cadastrar/ativar item e planejar; data civil São Paulo; concluir/desfazer/remarcar usam snapshot e confirmação do backend; IDs de tentativa estáveis; sem recorrência automática. |
| Calendário | Intervalo mensal, CTA Planejar nesta data, item/área/status e Activity inativa; ações permanecem em Hoje/Planejamento. |
| Banco Mestre / Áreas | Criar primeira Área antes do primeiro item, reativar Área, editar mantendo associação inativa original; confirmações de desativação/troca de tipo; erros por campo e rascunho retido. |
| Projetos / tarefas | Vazio com Novo projeto, criar/editar, tarefas e progresso 0/parcial/100; dupla submissão e falha não confirmam gravação; links válidos. |
| Ideias | Título obrigatório/conteúdo opcional, limite Unicode, datas São Paulo, preview escapado, snapshots e refresh. |
| Finanças | Receita/despesa, centavos inteiros, mês selecionado, saldo/categorias, edição; vazio com Novo lançamento; rascunho protegido. |
| Contas do mês / fixa | Referência independente, dia 20, padrão versus mensal, próximo/anterior, pagamento confirmado/desfeito e despesa vinculada, histórico/inativas, totais. |
| Conta / Auth | Minha conta/logout acessíveis; frase própria para exclusão; pending e erros seguros; segredo server-only e identidade verificada preservados; sem executar exclusão real. |

Fluxo Banco Mestre → Planejamento → Hoje → Calendário continua usando os mesmos registros. Activity inativa não pode ser planejada de novo, mas seus itens existentes continuam visíveis e podem ser concluídos/desfeitos. Nada de recurrence engine, Occurrence ou progresso avançado foi adicionado.

Estados vazios já oferecem próximos passos nas telas auditadas. Não foram adicionados CTAs redundantes quando Novo projeto/Nova ideia/Novo lançamento/Nova conta fixa já estão visíveis. Loading e sucesso continuam separados; só a resposta confirmada altera os snapshots/totais locais e invalida as telas pertinentes.

## Restos de desenvolvimento e ferramentas

Busca de “Página em construção”, “Em breve”, TODO/FIXME, placeholder, mock/demo/teste/temporário: nenhum placeholder/mock alcançável nos módulos normais. Placeholders de input são dicas legítimas; fixtures/testes/documentação e helpers de smoke são técnicos. Cards/starter/mocks não importados pelos fluxos reais não foram apagados. Os avisos de recursos fora do MVP são honestos: não há notificações/repetição automática/progresso avançado.

Decisão: manter `/dev/limpar-dados` somente em development, atrás de flag e sem link de produto. Execução continua separada da exclusão permanente; não foi habilitada nem executada. Guards de produção mantidos e cobertos por testes; HTTP de produção verificado no fechamento. Nenhum DELETE/API destrutivo autenticado enviado.

## Backlog explícito

- **IMPORTANTE, escopo maior:** proteger também Voltar/Avançar nativos em navegações SPA. beforeunload não cobre toda navegação interna do App Router. Não se interceptou history/popstate nem se prometeu proteção universal. Até solução própria e teste em browser, salvar antes de usar o histórico do navegador; links visíveis e Cancelar estão protegidos.
- Persistência opcional de rascunho requer desenho por conta e privacidade, especialmente em Finanças; não usar localStorage genérico nesta rodada.
- Rodada autenticada real com dados representativos e duas abas; confirmar aparência/scroll em tabelas longas e tema escuro, retorno após logout, rede lenta e foco de diálogos.
- Responsividade mobile/tablet continua em etapa futura, após a validação desktop. Sem alterações específicas de layout mobile nesta rodada.

## Arquivos desta auditoria

- `lib/forms/draft-protection.ts`; editores `ActivityForm`, `AreaManagement`, `ProjectEditor`, `ProjectTasks`, `IdeaEditor`, `TransactionEditor`, `FixedExpenseEditor`, `BillsSection`.
- Auth: quatro formulários, `logout-button`, `lib/auth/policy.ts`, seis páginas em `app/auth`; navegação `Sidebar`, `BottomNavigation`, `FloatingAddButton`, `TopBar` e wrapper Suspense em `app/layout.tsx`.
- Estados/semântica: `app/error.tsx`, `app/not-found.tsx`, `BancoMestreList`, `ActivityDetail`, `PlanningBoard`, `FinanceReadError` e erro de seção em `app/financas/page.tsx`.
- Testes: novo `tests/desktop-ux.test.cjs`, `tests/bills.test.cjs`, ajuste semântico de `tests/finance-navigation.test.cjs`, fixture comum em `tests/helpers/load-with-stubs.cjs` (guard DOM testado separadamente).
- Documentação: este relatório, README, Backlog e Documento Mestre (DOCX). Alterações anteriores de performance já presentes no workspace foram preservadas.

## Validação e roteiro desktop

**Aprovados: 200 unitários, 123 SQL/PGlite e 1 teste PostgreSQL 17 local de conta**, lint, TypeScript, build Turbopack e diff-check. HTTP de produção confirmou redirecionamento sem sessão nas oito rotas, login/mensagem de logout 200, página inexistente 404 em português e página/API de limpeza dev bloqueadas com 404. Flag local de execução da limpeza segue false. Sem migrations, dependências, alteração do banco real ou promoção de candidatas.

1. Entrar/cadastrar/recuperar senha; conferir headings, foco, pending e mensagens. Não enviar repetidamente e-mails reais.
2. Conta vazia: criar Área, item, planejar para hoje/amanhã; conferir Hoje/Calendário; concluir, desfazer, reagendar; inativar e verificar histórico.
3. Criar Projeto/Ideia; editar texto, tentar Voltar/Sidebar/Cancelar/logout e recusar descarte; conferir que fica no formulário. Salvar e retornar. Projeto vazio 0%, tarefas parcial/100%.
4. Receita/despesa com centavos e mês vazio; alterar mês e saldo/categoria. Conta fixa padrão 180, mensal 213,47; pagar/desfazer e conferir lançamento único/totais/histórico. Edição sem mudanças fica desabilitada.
5. Rede offline e sessão expirada em outra aba: nenhum falso sucesso nem texto apagado. Confirmar que logout bloqueia novas leituras/gravações protegidas e retorna ao login.
6. Exclusão somente com conta secundária descartável, se for necessário repetir a validação anterior; nunca a principal. Ferramenta dev deve continuar 404 em produção.
