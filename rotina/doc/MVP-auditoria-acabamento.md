# Auditoria de acabamento do MVP — 27/10/2026

**MVP funcional concluído; etapa atual: acabamento e responsividade.** Finanças validado no navegador real pela usuária. Banco Mestre/Áreas, Hoje, Planejamento, Calendário, Ideias, Projetos e Finanças concluídos funcionalmente.

Escopo: listas, criação/edição/detalhe dos sete módulos, navegação desktop/mobile, autenticação, raiz e página técnica de sessão. Inspeção do código, renderização offline e testes; sem navegador autenticado disponível nesta execução. A validação funcional anterior permanece válida; a aparência das correções ainda precisa de conferência no navegador, em claro/escuro e com textos longos.

## A. Corrigir agora — implementado

- **Controles sem função:** removidos Buscar/Configurações desabilitados do cabeçalho e Configurações do menu Mais. A busca real do Banco Mestre permanece.
- **Placeholders:** removidos tutorial/Deploy do template da entrada e do layout de `/protected`; `/` abre Hoje, com autenticação existente. Removidas seções “Itens relacionados — em breve” do Banco Mestre. Avisos honestos sobre recursos sem execução automática permanecem.
- **Navegação:** cabeçalho/Sair passam a aparecer nas subrotas dos módulos. Confirmação de cadastro e recuperação de senha oferecem retorno ao login. Links internos literais conferidos contra as rotas: nenhum destino ausente identificado; testes existentes cobrem URLs dinâmicas dos fluxos.
- **Estados de erro:** leitura de Calendário/Ideias/Projetos/Finanças oferece Tentar novamente, recarregando a URL atual e preservando mês/data. Erros de autenticação têm anúncio acessível. Login após falha de gravação no Banco Mestre/Áreas abre outra aba para preservar o rascunho.
- **Desktop e quebra básica:** espaço inferior para o botão flutuante; ações do Banco Mestre e cabeçalhos de listas podem quebrar linha; textos longos em projetos, ideias, planejamento, calendário e categorias/totais financeiros recebem contenção de largura.
- **Textos:** “Activity desativada” virou “Atividade desativada”; instruções de planejamento refletem o fluxo manual atual. Data de atualização de Projetos usa America/Sao_Paulo, como Ideias.
- **Dados fictícios:** nenhum mock encontrado nas dependências alcançadas pelas páginas atuais. Cards antigos com exemplos e fixtures continuam sem uso nas telas; não foram convertidos em novas funcionalidades.

## B. Pode esperar a rodada de responsividade

- Conferir tabela financeira com rolagem horizontal, calendário de sete colunas e formulários longos em 360/390/768 px, teclado virtual e zoom de 200%; ajustar áreas de toque e posição dos menus conforme medição real.
- Uniformizar densidade, raios de cards, espaços, títulos repetidos entre cabeçalho/conteúdo e apresentação dos estados vazio/loading/erro. Banco Mestre tem formulário mais denso; Ideias/Projetos/Finanças usam formulários mais simples.
- Revisar larguras com sidebar em notebooks pequenos, contraste dos status do Calendário no tema escuro e enquadramento das telas de autenticação dentro do layout global.

## C. Backlog futuro

- Busca/configurações globais somente com escopo próprio; foram retiradas da interface enquanto não existem.
- Melhorar saída com alterações não salvas, recuperação visual da sessão sem reload e validação de campos/limites mais uniforme. Categorias financeiras continuam agrupadas pelo nome exato; padronização assistida pode ser discutida depois.
- Limpar componentes do starter/cards demonstrativos sem uso, preservando fixtures de testes; avaliar aviso preexistente cacheComponents/partialPrefetching em tarefa técnica separada.
- Progresso avançado, Occurrence, recorrência automática e integrações externas permanecem fora desta etapa.

## Verificação

153 unitários e 104 SQL/PGlite; lint, TypeScript, build Webpack e diff-check aprovados. Sem migration, alteração de schema, dependência ou operação remota nesta auditoria.

Conferência visual recomendada: navegar pelos sete módulos e seus editores, testar Sair nas subrotas, entrada `/`, retorno do cadastro/recuperação e recarga após falha de leitura; rolar até a última ação e experimentar nomes longos. Reconfirmar login em outra aba sem perder rascunho no Banco Mestre/Áreas.
