**Estado atual — 29/10/2026:** MVP funcional, performance, UX desktop, responsividade e exclusão de conta concluídos/validados conforme confirmação da usuária. Preparação de publicação local concluída; novo Supabase Production, Vercel e smoke público ainda pendentes. Development preservado. Os registros antigos abaixo documentam a evolução, não o status vigente.

# Rotina

Aplicação pessoal de organização de rotina, planejamento, projetos, ideias e compromissos.

O **Rotina** está sendo desenvolvido como uma plataforma modular para centralizar atividades do dia a dia, metas, recorrências, projetos, planejamento e futuras extensões, sem transformar automaticamente todo tempo livre em produtividade.

## Status atual

**Próximo passo: publicação controlada.** [Checklist Vercel + Supabase Production](rotina/doc/MVP-deploy-producao.md), com 12 migrations em ordem, Auth/SMTP, variáveis, revisão de branches, smoke e rollback. Código verificado com Node 24.x, `npm ci`, 206 unitários, 123 SQL/PGlite, lint, TypeScript, build e 17 checks HTTP locais de produção. Marcador administrativo ausente dos 33 assets de navegador inspecionados; ferramentas dev retornaram 404 mesmo com flags habilitadas no processo de teste. Isso não substitui validar o novo projeto/deploy reais.

Produção requer `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` (somente servidor, Secret no Vercel). `NEXT_PUBLIC_SITE_URL` é opcional para metadata; cadastro/reset já usam a origem real do navegador. No Vercel: Root Directory `rotina`, Next.js, Node `24.x`, build `npm run build`, output padrão e branch Production `main`. Não copiar `.env.local`, dados de teste, secrets ou vínculo CLI Development.

Após atualizar referências: main e desenvolvimento divergem (4/9 commits exclusivos), mas a simulação dos commits não teve conflito. Revisar/commitar mudanças locais e promover por PR, sem rebase/force-push. Nove caches CLI da raiz foram retirados do índice e ignorados, preservando arquivos locais; nenhum segredo administrativo/senha foi detectado nesses arquivos atuais. Não houve merge, push, criação de projeto, conta ou deploy. Publicação depende desses passos manuais e do SMTP/Auth corretos. Audit de runtime sem avisos; um moderado apenas na cadeia de build CSS permanece documentado como manutenção.

**Prioridade atual: MVP utilizável.
A trilha avançada de progresso V0.2.5 está pausada e preservada para retomada futura.**

**Desktop/computador é a prioridade do MVP.** Manter responsividade mobile básica quando simples, sem atrasar funcionalidades. A rodada específica de responsividade fica para depois de todas as telas do MVP funcionarem.

### Histórico de implementação — registros anteriores

Atualização oficial em 22/10/2026: entregar funcionalidade prática nos sete módulos — Hoje, Planejamento, Calendário, Projetos, Banco Mestre, Ideias e Finanças. Banco Mestre e gestão de Áreas reais permanecem preservados. Documentos, candidates e testes de progresso permanecem intactos; não continuar preflight/promoção. Os registros de etapas abaixo são históricos e não autorizam retomar essa trilha.

Finanças está acessível em `/financas`, na Sidebar desktop e no menu Mais mobile, com título próprio e a mensagem “Página em construção”. Segue a proteção de sessão das demais rotas principais. Ainda não há operações financeiras.

**Primeira entrega funcional do MVP — Planejamento + Hoje implementados; migration aplicada no Supabase de desenvolvimento, aguardando validação funcional no navegador desktop.** Banco Mestre oferece Planejar nas Activities ativas; Planejamento permite Hoje/Amanhã/data, consulta por data, conclusão/desfazer e reagendamento; Hoje mostra itens reais, concluídos da data planejada e pendências (data anterior sem conclusão), sem demonstrações. Dados vêm do servidor após gravação confirmada. A conclusão de uma pendência conserva sua data original; consulte essa data em Planejamento para encontrá-la depois.

Migration incremental: `rotina/supabase/migrations/20261022000100_daily_plan_items.sql`. Uma Activity/data por conta; FK composta, RLS, sem DELETE, timestamps do banco e UPDATE condicionado ao snapshot exato (incluindo microssegundos). Activity inativa não admite planejamento novo; planos existentes continuam visíveis, concluíveis e reagendáveis. Concluir/desfazer afeta somente o item planejado. Dia civil: convenção explícita `America/Sao_Paulo`, calculada no servidor ao carregar/atualizar a tela; não há job noturno. Para uma tela aberta durante a virada do dia, recarregue para obter o novo dia. Sem recorrência automática ou alteração de metas/revision da Activity.

O `package-lock.json` vazio da raiz foi removido: não havia package/workspace ali. O lockfile correto em `rotina/` foi preservado. Na aplicação remota autorizada em 22/10/2026, confirmou-se o projeto vinculado **Rotina - Desenvolvimento**; `db push --linked --dry-run --skip-vault` apontou somente `20261022000100_daily_plan_items.sql`, então `db push --linked --skip-vault --yes` aplicou exclusivamente essa migration, sem seeds, roles ou Vault. `migration list --linked` confirmou as sete versões alinhadas. Migrations antigas e candidata de progresso intactas. Calendário depende de validação desta entrega pela usuária antes de qualquer implementação.

Tipos oficiais regenerados com CLI 2.120.0, `gen types typescript --linked --schema public`, primeiro em arquivo temporário ignorado. Comparação estrutural das dez tabelas, Row/Insert/Update, nullable/defaults, relacionamentos, RPCs e demais estruturas: sem divergências. Incorporado somente o bloco gerado de `daily_plan_items` e seu comentário de origem, preservando os demais tipos/aliases. Consulta remota READ ONLY confirmou RLS, três policies, grants restritos, ausência de DELETE/SELECT anon, FK composta, UNIQUE, índice e trigger invoker; as seis tabelas da candidata de progresso não existem no remoto. Nenhuma credencial foi adicionada ao código/documentação.

Validação automatizada local: **118 unitários e 91 SQL/PGlite passaram**, além de lint, `tsc --noEmit`, build e diff-check. A execução SQL paralela excedeu memória ao concorrer com o build; repetida com sucesso com `node --test --test-concurrency=1 tests/db/*.test.mjs`, sem alterar arquitetura/configuração. Build com acesso à fonte externa; permanece o aviso preexistente cacheComponents/partialPrefetching. Esses resultados não substituem a validação no Supabase/navegador reais.

**Validação funcional real pendente:** reiniciar a aplicação e testar no computador A/B, Hoje/Amanhã/data personalizada, duplicação, concluir/desfazer, data passada como pendência, reagendar, desativar Activity, duas abas com snapshot antigo, logout em outra aba e rede interrompida. Esperado: isolamento, persistência após refresh, conflito sem sobrescrita, rascunho preservado e nenhum falso sucesso. A migration e os tipos oficiais já estão aplicados/adotados; verificações de catálogo não substituem esses testes de navegador.

### Mapa funcional atual do MVP

Mapa atualizado em 22/10/2026 após implementação de Planejamento + Hoje, com migration remota aplicada e validação funcional de navegador ainda pendente. Navegação, tema e autenticação funcionam globalmente; busca/configurações globais e Projeto/Ideia no botão + permanecem desabilitados.

| Tela | Visual e funcional hoje | Fictício/placeholder e ações sem efeito | Persistência necessária | Menor corte utilizável e reuso |
|---|---|---|---|---|
| Hoje | Leitura SSR real; planejados para hoje, concluídos da data, pendências, conclusão/desfazer e reagendamento | Demonstrações removidas; aguarda validação funcional real | daily_plan_items aplicada no desenvolvimento | Fluxo mínimo implementado com PlanningBoard, Card, Button e Input; falta validação no navegador |
| Planejamento | Escolha de Activity real, Hoje/Amanhã/data, listagem, concluir/desfazer e reagendar | Placeholder removido; aguarda validação funcional real | Mesma daily_plan_items de Hoje | Fluxo mínimo implementado, reutiliza listActivities, repository/actions e PlanningBoard |
| Calendário | Rota e navegação funcionam | Somente “Página em construção”; nenhum botão específico | Reusar itens do planejamento; sem nova entidade exclusiva para o primeiro corte | Navegar mês/dia e consultar itens planejados reais, com acesso ao planejamento/detalhe. Reusar os mesmos dados, Card e Button; sem motor de recorrência |
| Projetos | Rota e navegação funcionam; ProjectCard existe em Hoje | Página placeholder; Tarot/24% em Hoje é fictício. Iniciar sessão/Subtarefas não funcionam; criação global de projeto desabilitada | Projetos e tarefas com conclusão | Criar/editar projeto, adicionar tarefas, concluir tarefas e calcular percentual pelas tarefas. Reusar ProjectCard, Input, Card, Button e Checkbox; sem cronômetro ou sessões |
| Banco Mestre | Lista, busca, filtros, detalhes, criação/edição e Áreas reais; nova ação Planejar em Activities ativas | Nenhum mock participa; Planejar aguarda validação real desta entrega | Cadastro preservado; vínculo em daily_plan_items | Cadastro já utilizável; nova navegação para Planejamento reutiliza BancoMestreList e sessão existentes |
| Ideias | Rota e navegação funcionam | Somente “Página em construção”; criação global de ideia desabilitada | Ideias próprias: título, texto e timestamps | Criar, listar, consultar e editar notas reais. Reusar Input, Card, Button e padrões de formulário/actions; sem conversão automática em projeto |
| Finanças | Rota, menu desktop/mobile e título adicionados | Somente “Página em construção”; nenhum botão financeiro | Lançamentos próprios: receita/despesa, data, valor, descrição e categoria | Cadastro/edição, visão mensal, totais de ganhos/gastos/saldo, agrupamento por categoria e histórico mensal. Reusar Input, Card, Button e formulários autenticados; calcular valores monetários sem ponto flutuante impreciso |

### Ordem curta de implementação recomendada

1. **Planejamento + Hoje implementados, migration aplicada:** `daily_plan_items`, repository/actions e telas, sem Occurrence ou engine. Próximo passo imediato: validar o fluxo real no desktop, sem antecipar Calendário.
2. **Calendário simples:** mostrar os mesmos itens por mês/dia e navegar ao detalhe/planejamento. Reusar a persistência da primeira entrega, sem recorrência automática nem calendário completo.
3. **Ideias:** notas persistidas, independentes dos demais módulos; corte menor que Projetos e útil imediatamente.
4. **Projetos:** cadastro e tarefas com conclusão; percentual calculado a partir das tarefas, sem depender da arquitetura de progresso pausada.
5. **Finanças:** lançamentos manuais e resumos mensais por categoria. Independe de Projetos/Ideias e pode ser antecipada por prioridade de uso; fica depois para preservar o foco inicial no cotidiano e introduzir cálculos monetários com testes próprios.

**Próximo módulo recomendado após validação da entrega: Calendário simples**, reutilizando os mesmos itens planejados. Não iniciado nem autorizado antes da validação da usuária. Infraestrutura somente quando necessária à funcionalidade visível, sem engines genéricas, event sourcing ou abstrações futuras.

Finanças futura no MVP: receitas/ganhos, despesas/gastos, data, valor, descrição, categoria, visão mensal, totais e saldo do mês, identificação de onde o dinheiro está sendo gasto, agrupamento por categoria e histórico mensal. Fora deste MVP inicial: integração bancária/Open Finance, importação automática, cartão/fatura sofisticada, investimentos, previsões e IA financeira. Nenhuma dessas funções foi implementada nesta tarefa.

### Histórico de status anterior à repriorização

**V0.2.4 concluída — Gestão real de Áreas.** A auditoria V0.2.4D confirmou o escopo final aprovado, com C.1/C.2 validadas no navegador real. Conta nova usa o Banco Mestre do zero sem SQL manual, seed ou área técnica pré-criada. [Fechamento formal](rotina/doc/V0.2.4D-fechamento-gestao-areas.md), apoiado pela [auditoria detalhada](rotina/doc/V0.2.4D-auditoria-fechamento-areas.md). V0.2.5 iniciada somente em definição: [proposta formal V0.2.5A](rotina/doc/V0.2.5A-definicao-escopo.md), apoiada pela [comparação dos candidatos](rotina/doc/V0.2.5-definicao-proximo-marco.md). Recomendação para revisão: Metas e progresso diário, com primeiro corte em contagens diárias reais na tela Hoje. B.1 concluída como [contrato conceitual de progresso](rotina/doc/V0.2.5B.1-contrato-progresso.md), consolidando tempo, histórico e persistência. B.2 não iniciada. Implementação não iniciada; nenhuma migration/RPC/UI nova.

**Última etapa concluída:** V0.2.4D — auditoria e fechamento formal em 20/10/2026. V0.2.3 e V0.2.4 concluídas no escopo aprovado.

**Verificação global V0.2.4D:** 105 testes unitários, 61 SQL, lint, TypeScript, build e diff-check passaram. C.1/C.2 validadas remotamente pela usuária; nenhum novo smoke remoto nesta auditoria. Resíduos não bloqueantes permanecem no backlog: aviso visual Unauthorized após recuperar sessão e recomendação cacheComponents/partialPrefetching.

**Marco encerrado:** V0.2.4 — listar, criar, renomear, ativar/desativar Áreas reais, com sessão normal, RLS, snapshot e primeiro uso integrado ao ActivityForm. Sem DELETE/reorder, mocks/seed ou nova migration. Relatórios A/B/C preservam o histórico; D consolida o estado atual.

**Marco histórico concluído:** V0.2.2 — interface local do Banco Mestre e fluxo de Item da Rotina, consolidada na V0.2.2D e aprovada após teste manual.

### V0.1 concluída

- Next.js + React + TypeScript + Tailwind CSS
- Seis rotas principais:
  - `/hoje`
  - `/planejamento`
  - `/calendario`
  - `/projetos`
  - `/banco-mestre`
  - `/ideias`
- Sidebar para desktop
- Bottom Navigation mobile
- Menu `Mais` com acesso a Planejamento, Banco Mestre e Ideias
- TopBar compartilhado
- Botão `+` flutuante
- Tema claro/escuro com persistência
- Fonte Geist aplicada
- Layout responsivo inicial
- Tela Hoje com dados fictícios
- Componentes reutilizáveis existentes do shadcn/ui/Radix reaproveitados
- Acessibilidade básica e semântica de progresso
- Lint, TypeScript e build validados

As demais telas principais existem como rotas e placeholders. Seus protótipos de alta fidelidade já foram aprovados.

## V0.2.2 concluída — Item da Rotina

O fluxo global é **+ → Item da rotina / Projeto / Ideia**. Item da rotina abre o mesmo formulário de **Novo item** do Banco Mestre; Projeto e Ideia estão desabilitados como “Em breve”. A usuária não precisa escolher um módulo técnico antes de criar um item.

O Banco Mestre é a **biblioteca e administração dos itens reutilizáveis da rotina**. Já possui listagem, busca, filtros, detalhe único, criação, edição, ativação/desativação e validações. A troca de tipo mantém a identidade e pede confirmação antes de limpar dados específicos. Na V0.2.2, dados locais eram compartilhados durante a navegação e recarregar restaurava os mocks. Esse comportamento é histórico: desde a V0.2.3 concluída, leitura, criação e edição do Banco Mestre usam Supabase real e persistem após refresh.

| Tipo | Comportamento do cadastro atual |
|---|---|
| Lembrete | Data de referência, aviso opcional e repetição opcional |
| Compromisso | Data/início/fim, local, preparação/transporte e repetição opcional |
| Atividade fixa | Grupos de dias com horários compartilhados |
| Atividade variável | Metas e janelas preferenciais, sem criar dias obrigatórios |
| Meta / Checklist | Vezes, quantidade ou tempo por dia/semana/mês |

Os literais técnicos são reminder, commitment, fixedActivity, variableActivity e checklistGoal. trackingMode foi removido por redundância. Importância continua independente; novos itens são ativos e status aparece na edição. Duração aceita Desconhecida, Fixa e Mínima + ideal, com horas/minutos convertidos em minutos totais. Preparação, ida e volta são estimativas locais, não reservas de agenda.

As demais telas mantêm sua estrutura visual inicial. Não há calendário/planejamento funcional, motor de recorrência, progresso real ou notificações. A persistência dos itens do Banco Mestre no Supabase já foi implementada e validada na V0.2.3.

## Meta / Checklist e progresso diário futuro

Meta / Checklist ficará em um card próprio, **fora da grade principal do Calendário**. Os quadradinhos representam registros de execução/progresso de uma data ou período, não subtarefas permanentes no cadastro.

Exemplo: escovar dentes ideal 3 vezes/dia, duas execuções em 11/10 → 2/3. Em 12/10, a apresentação considera os registros do novo dia; não zera nem recria a Activity e não gera dívida. Quantidade será registrada na unidade configurada; tempo será registrado por sessões/minutos. O código atual cadastra metas, mas ainda não implementa esses registros nem calcula progresso.

Metas e recorrências permanecem separadas: uma meta 3x/semana não cria dias ou horários fixos. Atividade variável só ocupará um horário depois de planejamento futuro; compromisso e atividade fixa já possuem configurações de horário.

## Etapa atual e próxima etapa

**Status vigente em 22/10/2026: MVP utilizável, desktop primeiro.** Planejamento integrado a Hoje com migration aplicada no desenvolvimento e tipos oficiais adotados; falta validação funcional no navegador. Calendário só após aprovação dessa validação. A trilha avançada V0.2.5 está pausada e preservada; as recomendações de progresso abaixo registram o planejamento anterior, superado por esta prioridade.

**V0.2.4 concluída — Gestão real de Áreas, incluindo primeiro uso sem preparação manual.**

O documento [Modelo relacional V0.2.3A](rotina/doc/V0.2.3A-modelo-relacional.md) descreve tabelas, colunas, PKs/FKs, integridade por tipo, ownership, RLS, datas, índices, mapeamento TypeScript e fronteiras futuras de Occurrence/ProgressLog. A ressalva aprovada exige minutos inteiros. As nove tabelas agora estão implementadas em migrations locais; detalhes em [Banco local B.1](rotina/doc/V0.2.3B.1-banco-local.md).

Sequência:

1. B.1 aprovada: nove tabelas, constraints, RLS e escrita agregada.
2. **B.2A:** tipos Database provisórios derivados das migrations, DTOs/mappers, metadata revision, repository browser/server injetável, RPC segura de leitura e testes. Consulte [Camada de dados B.2A](rotina/doc/V0.2.3B.2A-camada-dados.md). Naquela entrega, mocks/provider ainda eram a fonte da interface; isso foi substituído pela leitura/escrita reais e validadas da B.2B.2A/B.2B.2B.
3. **B.2A.1:** migration incremental revoga grants genéricos e USAGE de routine_private; mantém get/save públicas invoker e apenas EXECUTE técnico dos três CHECK validators. Defaults por owner foram ajustados, com alcance global documentado. Consulte [Hardening no guia de banco](rotina/doc/V0.2.3B.1-banco-local.md).
4. **B.2B.1 e B.2B.2A concluídas:** Auth/sessão, seis migrations, PT409, repository, RLS A/B/anon e leitura nas telas validados remotamente pela usuária; tipos oficiais adotados. **B.2B.2B concluída e validada no navegador real:** criação/edição no formulário existente via Server Action autenticada e saveActivity, com revisão obrigatória na edição. Consulte a [escrita real](rotina/doc/V0.2.3B.2B.2B-escrita-banco-mestre.md).
5. **V0.2.4 — Gestão real de Áreas concluída:** A especificou; B.1/B.2 implementaram dados/actions; C.1/C.2 entregaram gestão e primeiro uso com validação real; D auditou e consolidou o fechamento. O primeiro ciclo de persistência previsto originalmente já havia sido atendido pela B.2B.2B; o escopo final de Áreas foi entregue sem nova migration.
6. Planejamento, Calendário, Occurrence e registros de progresso terão etapas próprias; não entram implicitamente na primeira migration.

**Definição V0.2.5 (21/10/2026):** Calendário/Occurrences, Planejamento, Metas/progresso e a alternativa de agenda somente de leitura foram comparados. Recomenda-se um primeiro ciclo manual de contagem diária, independente de Occurrence, antes de ampliar métricas/períodos ou implementar planejador completo. Fechar fuso/data civil, histórico de metas/tipo, correções e idempotência antes de qualquer persistência nova. A [proposta formal V0.2.5A](rotina/doc/V0.2.5A-definicao-escopo.md) registra escopo, alternativas, subetapas, critérios de conclusão e necessidades de persistência. Após aprovação do escopo, a primeira etapa recomendada é B.1: contrato temporal, histórico e persistência, antes de SQL/código. Atualização: B.1 iniciada por solicitação explícita, apenas na definição temporal; recomenda fuso IANA confirmado da conta, relógio do banco e data congelada na aceitação, com conflito de contexto na virada do dia. O [contrato histórico](rotina/doc/V0.2.5B.1-contrato-historico-progresso.md) recomenda versões imutáveis de metas, snapshot da medição e anulação auditada, sem cascata destrutiva. O [fechamento B.1](rotina/doc/V0.2.5B.1-contrato-progresso.md) recomenda tentativas idempotentes por conta, logs imutáveis, versões/associações e anulações via RPC transacional. Integração com save e DML direto, segurança e rollout são gates da futura migration; B.2 não iniciada.

No MVP atual, a persistência necessária é entregue junto às telas funcionais, em cortes pequenos. Metas/recorrências avançadas não bloqueiam o planejamento manual. O detalhe real da Activity permanece o destino reutilizado pelos itens planejados.

## Princípios do projeto

- Organizar sem maximizar produtividade.
- Tempo livre não deve ser automaticamente preenchido.
- Atividades podem ser flexíveis e não precisam sempre ter horário.
- Importância e urgência são conceitos diferentes.
- A usuária mantém a decisão final sobre planejamento e sugestões.
- Projetos possuem subtarefas internas; o calendário mostra sessões de projeto, não subtarefas individuais.
- A captura de ideias deve ser rápida.
- O sistema deve crescer de forma incremental e modular.
- Antes de criar componentes novos, verificar e reutilizar os componentes existentes quando adequados.

## Stack oficial

- **Next.js**
- **React**
- **TypeScript**
- **Tailwind CSS**
- **Supabase**
  - PostgreSQL
  - Auth
- **Vercel**
- **Git + GitHub**

Futuro:
- PWA
- Web Push
- histórico e insights
- integrações externas

## Estrutura funcional da V1

### Hoje
Agenda, atividades do dia, tarefas flexíveis, checklist, metas e pendências.

### Planejamento
Fechamento do dia, amanhã, contexto semanal, metas, pendências e sugestões.

### Calendário
Visões diária/semanal/mensal, compromissos, atividades, sessões de projeto e recorrências.

### Projetos
Projetos, subtarefas, sessões, cronômetro e progresso calculado.

### Banco Mestre
Biblioteca e administração dos itens reutilizáveis: busca, filtros, detalhe e edição. A criação também pode partir do botão global +.

### Ideias
Captura rápida, Inbox, organização e transformação em projeto, pesquisa, atividade, estudo ou lista.

## Arquitetura do repositório

Estrutura atual/esperada:

```text
AppRotina/
├── README.md
├── .gitattributes
└── rotina/
    ├── app/
    ├── components/
    ├── lib/
    ├── types/          # domínio atual
    ├── tests/          # testes de domínio do Banco Mestre
    ├── doc/            # especificações e documentos do projeto
    ├── supabase/       # previsto: migrations/functions, ainda não criado
    ├── public/
    ├── .env.example
    ├── .gitignore
    └── package.json
```

## Fluxo Git

O projeto utiliza duas branches principais:

- `main` — versão estável;
- `desenvolvimento` — alterações em construção, integração e testes.

Fluxo esperado:

```text
desenvolvimento
    ↓
implementação
    ↓
testes/validação
    ↓
merge para main
```

Branches temporárias por funcionalidade podem ser adotadas futuramente se o volume de desenvolvimento justificar.

## Desenvolvimento local

Pré-requisitos:

- Node.js
- npm
- Git

Na pasta `rotina`:

```bash
npm install
npm run dev
```

Validações disponíveis na aplicação:

```bash
npm run lint
npm test
npm run build
```

Abrir:

```text
http://localhost:3000
```

## Git e segurança

### Nunca versionar

- `.env`
- `.env.local`
- `.env.*` com valores reais
- senhas
- tokens
- chaves privadas
- Supabase service-role keys
- credenciais de banco
- certificados privados
- dumps contendo dados pessoais
- dados pessoais reais exportados da aplicação

Também não é necessário versionar:

- `node_modules/`
- `.next/`
- builds gerados
- caches
- logs
- arquivos temporários

O `.gitignore` deve proteger esses itens.

### Variáveis de ambiente

Versionar apenas um exemplo sem segredos:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

## Banco de dados

O banco real ficará no Supabase.

Lista e detalhe leem dados reais do Supabase. Na B.2B.2B, o formulário existente passou a criar/editar via repository e RPC agregada, sem estado local simulando persistência. As seis migrations e RLS permanecem inalteradas; o GitHub armazena a estrutura e o código, nunca dados pessoais reais:

```text
supabase/
├── migrations/
└── functions/
```

Os dados reais da usuária não devem ser armazenados no repositório.

## Recorrências previstas

- diária;
- semanal;
- mensal;
- trimestral;
- intervalo;
- dias específicos;
- dia fixo do mês;
- posição do dia da semana;
- recorrência baseada em calendário;
- recorrência baseada na última conclusão;

Metas X vezes por período, mínimo/ideal e atividades sem repetição automática são conceitos separados da recorrência. Anual é representada atualmente por intervalo de 12 meses; não há motor de geração.

## Projetos e sessões

Projetos terão subtarefas internas e progresso derivado da estrutura.

Uma sessão registra tempo dedicado ao projeto. Ao encerrar, o tempo efetivamente trabalhado poderá ser corrigido manualmente, e as subtarefas trabalhadas poderão ser registradas sem exigir seleção antecipada.

## Documentação viva

O projeto mantém três documentos oficiais:

1. **README.md**
   - visão geral;
   - instalação;
   - stack;
   - arquitetura;
   - status técnico;
   - fluxo Git.

2. **Documento Mestre / Template do Projeto**
   - contexto;
   - objetivo;
   - requisitos;
   - decisões;
   - regras;
   - histórico;
   - ponto de retomada.

3. **Backlog**
   - módulos;
   - funcionalidades;
   - melhorias;
   - dívida técnica;
   - status e prioridades.

O Markdown versionado principal é este README. Documento Mestre e Backlog estão presentes em DOCX em rotina/doc/, com atualizações datadas de decisão e fechamento. A especificação Markdown V0.2.3A registra as decisões técnicas atuais e o planejamento dos próximos marcos.

## Pendências técnicas conhecidas

- V0.2.4 encerrada conforme [auditoria D](rotina/doc/V0.2.4D-auditoria-fechamento-areas.md). Reorder/drag-and-drop/mover para cima-baixo permanecem evolução futura com novo contrato; DELETE não faz parte da gestão. Sem pendência funcional bloqueante identificada no escopo aprovado. DELETE, reorder/drag-and-drop, fusão, hierarquia, cores/ícones e áreas compartilhadas ficam explicitamente fora do escopo; detalhes no [fechamento formal](rotina/doc/V0.2.4D-fechamento-gestao-areas.md).

- Avaliar futuramente a recomendação de configuração `partialPrefetching` junto de `cacheComponents`; o build atual passa e isso não bloqueia a V0.2.
- Busca e Configurações globais e ações fictícias da tela Hoje ainda são preparatórias. Busca/filtros do Banco Mestre e botão + para Item da rotina já funcionam localmente.
- Melhoria não bloqueante da B.2B.2B: após recuperar a sessão, uma instância antiga do formulário pode manter visualmente Unauthorized até reload/F5. Melhorar a atualização do aviso preservando o rascunho; registrada também no backlog DOCX.
- Tipos oficiais do schema public gerados e adotados na B.2B.1.3, preservando aliases e validações de transporte. O teste de catálogo confere os contratos contra as migrations em PostgreSQL em memória.
- PostgREST/GoTrue, concorrência entre sessões e isolamento A/B validados na stack real. `.env.*` permanece protegido, com exceção de `.env.example`.

## Estado de retomada

**Pré-requisito B.2B.1 concluído:** Auth/sessão, seis migrations, PT409, POST, RLS de leitura/escrita cruzada, UPDATE/INSERTs cruzados, verify e anon confirmados remotamente pela usuária. Tipos oficiais adotados com aliases compatíveis e revisão omitida na criação usando o default SQL. Sem divergência E identificada.

**Último marco funcional:** V0.2.4 concluída — gestão real de Áreas e criação do primeiro item por conta nova sem preparação manual; C.1/C.2 validadas no navegador real e auditoria global D concluída.

**Ponto atual:** Banco Mestre com leitura/criação/edição reais e gestão própria de Áreas. Snapshot/updated_at confirmado via PostgREST; conflitos não sobrescrevem; sessão expirada e rede preservam rascunhos. Escopo auditado em D; nenhum novo marco iniciado.

**UX atual:** Novo/Editar habilitados, áreas e snapshots reais. Envio com loading e trava contra duplo submit; navegação somente após confirmação do banco. Conflito mantém o rascunho e exige recarga explícita, sem sobrescrita automática. Provider restrito a `/banco-mestre`, sem escrita local; leitura preservada.

**Verificação B.2B.2B:** 69 testes unitários, 54 testes SQL, lint, TypeScript, build e diff-check passaram. Escrita pela UI validada no navegador real; registro em [escrita real](rotina/doc/V0.2.3B.2B.2B-escrita-banco-mestre.md).

**Correção de sessão expirada:** POSTs de Server Actions nas rotas do editor chegam à verificação de sessão da action e retornam Unauthorized, preservando o rascunho e oferecendo “Entrar novamente”. GET sem sessão continua redirecionando para login. Logout em outra aba antes de salvar validado no navegador real; regressão automatizada incluída. Melhoria visual residual de Unauthorized após recuperar a sessão permanece não bloqueante.

**Verificação histórica B.2B.2A:** 57 testes unitários, 50 testes SQL, lint, TypeScript, build e diff-check passaram; os cinco cenários de navegador relatados pela usuária estão concluídos. Resultados e roteiro da escrita ficam na documentação B.2B.2B.

**Verificação da adoção:** 47 testes unitários, 48 testes SQL, lint, TypeScript, build e diff-check passaram. Camada de persistência tecnicamente pronta para liberar B.2B.2, considerando também as validações remotas confirmadas pela usuária. Nenhum segredo exposto; sem migration, db push ou alteração de Auth nesta adoção.

**V0.2.4C.1 concluída — VALIDADA NO NAVEGADOR REAL.** A usuária confirmou criação/renomeação reais, persistência após refresh, conflito em duas abas com rascunho preservado e sem sobrescrita automática, desativação/reativação reais, sessão expirada com Unauthorized/“Entrar novamente” e rascunho preservado, falha de rede sem falso sucesso ou perda do rascunho e snapshot/updated_at através do PostgREST real. Registro em [V0.2.4C.1](rotina/doc/V0.2.4C.1-tela-areas.md). V0.2.4C.2 concluída e validada no navegador real: ActivityForm sem áreas oferece Criar primeira área; com todas inativas oferece Criar ou reativar área, ambos para /banco-mestre/areas?returnTo=/banco-mestre/nova, sem criação/seleção automática. O retorno aceita somente /banco-mestre/nova e oferece Voltar para criar item após criação/reativação confirmada, sem redirect automático; gestão sem contexto continua normal. Edição com área original inativa preservada. [Registro C.2](rotina/doc/V0.2.4C.2-primeira-area-activity-form.md); validação real da C.2 concluída. Objetivo central da V0.2.4 atendido: uso do zero sem SQL manual, seed ou área técnica. V0.2.4D concluída: escopo auditado e fechamento global consolidado. Sem alteração funcional, migration ou db push neste fechamento.

---

O Rotina está em desenvolvimento ativo. Estrutura, regras e funcionalidades podem evoluir conforme o uso e a validação do produto.

**V0.2.5B.2 — desenho técnico documental iniciado:** [schema e RPCs propostos](rotina/doc/V0.2.5B.2-desenho-tecnico-persistencia.md). Mantém as seis estruturas da B.1, DDL, RLS/grants e captura histórica via triggers compatível com save invoker. Nenhuma migration/código/RPC foi criada ou aplicada; sem db push. Corpos SQL, preflight de privilégios e testes locais/concorrentes ainda necessários antes da implementação.

**B.2 — detalhamento das RPCs:** [assinaturas e algoritmos SQL de record, void e preferência temporal](rotina/doc/V0.2.5B.2-rpcs-transacionais-progresso.md). Replay por tentativa antes de validar contexto atual, locks transacionais, anulação serializada e PT409 separado de falhas técnicas. Somente documentação; sem funções, migrations ou db push.

**B.2 — candidata local de compatibilidade:** [schema/RPCs e captura histórica](rotina/doc/V0.2.5B.2-desenho-schema-rpcs.md). SQL isolado em supabase/candidates, fora de migrations, validado por 15 novos testes PGlite (76 SQL totais) e 105 unitários. Save invoker/PT409/revision e grants existentes de goals preservados; novos triggers cobrem save e DML direto. **Não pronta para db push**: privilégios de instalação no Supabase, bordas temporais e política de eliminação de conta ainda pendentes; concorrência PostgreSQL local validada em 22/10/2026, conforme registro abaixo. Sem UI/Hoje/C ou alteração remota.

**V0.2.5B.2.1 — preflight local de privilégios:** [papel técnico e limites da confirmação](rotina/doc/V0.2.5B.2.1-preflight-papel-tecnico.md). Corrigidos SET/INHERIT e CREATE temporários para ownership e policy de backfill somente do instalador; teste sem superuser/BYPASSRLS. Acesso efetivo a Auth verificado antes de prosseguir. Catálogos remotos ainda pendentes; candidata segue fora de migrations e não pronta para db push.

**B.2 — concorrência PostgreSQL nativo local (22/10/2026):** [validação multi-sessão](rotina/doc/V0.2.5B.2-validacao-postgresql-multissessao.md), 14/14 em PostgreSQL 17.11, com blockers observados e cluster descartável encerrado. `npm run test:pg:local` usa conexões locais independentes; sem ajuste adicional na candidata para os fluxos suportados. Erros reais 40P01/40001 preservados nos limites documentados. Supabase remoto, bordas temporais e política de eliminação seguem pendentes; sem promoção/db push/UI/C.

**B.2.1 — auditoria final de promoção (22/10/2026):** [decisão e evidências](rotina/doc/V0.2.5B.2.1-preflight-promocao.md). Candidata reforçada com validação recíproca em logs/associações/voids e seleção histórica pela revision aceita, sem depender da ordem do relógio. Promoção **ainda bloqueada** por preflight Supabase efetivo, política operacional de eliminação e bordas temporais/rollout pendentes. Nenhum db push/UI/Hoje/C.

## Calendário — entrega de 26/10/2026

Hoje e Planejamento validados no navegador pela usuária. Calendário implementado sobre daily_plan_items: mês com segunda a domingo, navegação anterior/próximo/hoje, contagem por dia, seleção persistida em `?date=YYYY-MM-DD`, lista com Área e status, detalhe reutilizado da Activity e Planejar nesta data. Consulta paginada por intervalo inclusivo, Activities e Áreas em lote; mantém Activities desativadas nos planos antigos. Sem tabela, migration, Occurrence, recorrência ou progresso avançado.

Esta atualização substitui os estados anteriores de Calendário em construção e de validação pendente de Hoje/Planejamento. Validação manual do Calendário ainda pendente: mês vazio e vários dias, vários itens/data, pendentes/concluídos, virada mês/ano, hoje, detalhe, Planejamento com data, refresh, contas A/B e Activity desativada. Não iniciar Ideias/Projetos/Finanças antes dessa validação. Após aprovação, recomenda-se Projetos em um corte manual mínimo, a definir.

Verificações desta entrega: suíte unitária inicial 120/120; após ajuste de invalidação e teste de leitura autenticada, calendário/planejamento 12/12; banco em execução sequencial 92/92 (execução paralela excedeu memória). Lint, TypeScript e diff-check aprovados. Build Webpack compilou, validou tipos e gerou as páginas; a primeira execução terminou com alerta de segurança da versão instalada do Next.js. Repetição do build Webpack aprovada (exit 0); alerta de atualização do Next.js permanece. Nenhuma dependência alterada. Validação no navegador real continua pendente.

## Ideias — entrega de 26/10/2026

Calendário validado pela usuária e concluído para o MVP. Ideias entrega lista real com prévia e atualização, criação em `/ideias/nova` e detalhe editável em `/ideias/[id]`. O botão global + → Ideia reutiliza a criação. Uma tabela `ideas`, owner RLS, grants por coluna e timestamps do banco; sem RPC. Repository/actions verificam sessão e usam `updated_at` exato para conflito seguro. Falha/sessão expirada mantêm rascunho; sucesso somente após confirmação. Título obrigatório até 200 caracteres; conteúdo opcional até 100.000, preservando linhas. Sem conversão, tags, anexos, IA ou histórico. Validação desktop pendente: criar, editar, refresh, vazio/várias ideias, texto longo, A/B, expiração e falha de rede. Não iniciar Projetos ou Finanças antes dessa validação.

Persistência remota: aplicada somente `20261026000100_ideas.sql` no projeto vinculado Rotina - Desenvolvimento, após dry-run; oito versões alinhadas. Sem seeds, roles ou Vault. Verificações: suíte unitária 128/128 e 8/8 testes de Ideias após teste adicional; SQL/PGlite completo 95/95, lint, TypeScript e diff-check aprovados. Build Webpack aprovado na repetição (exit 0); mantém o alerta de segurança da versão instalada do Next.js. Nenhuma dependência alterada.

## Projetos — entrega de 27/10/2026

Ideias validado no navegador real pela usuária e concluído para o MVP. Projetos substitui o placeholder: lista com descrição resumida e progresso, criação em `/projetos/nova`, detalhe em `/projetos/[id]`, edição de nome/descrição e tarefas, conclusão/desfazer. O botão global + → Projeto reutiliza a criação real. Progresso = concluídas/total, arredondado para exibição; sem tarefas = 0%. Ordem por criação e ID, sem campo de ordenação. Sem sessões, cronômetro, subtarefas, dependências, Kanban, comentários, anexos, compartilhamento, IA, versões ou automações.

Persistência: `projects` e `project_tasks`, RLS por owner, FK composta `(user_id, project_id)`, grants por coluna e timestamps/conclusão do banco, sem RPC. UPDATE exige `updated_at` exato; conflitos e falhas mantêm o rascunho e nunca indicam sucesso sem confirmação. UUID da tentativa mantido em falha de criação para evitar duplicação em reenvio incerto. POSTs das rotas explícitas de Projetos e Ideias chegam à autenticação da action mesmo após expiração; GET continua protegido.

Aplicada somente `20261027000100_projects.sql` no projeto vinculado **Rotina - Desenvolvimento**, após confirmação do destino e dry-run exclusivo; nove versões alinhadas, sem seeds, roles ou Vault. Tipos oficiais gerados em temporário ignorado e comparados estruturalmente: zero divergências. Verificações: **141 unitários, 100 SQL/PGlite**, lint, TypeScript, build Webpack e diff-check aprovados. Aviso preexistente de cacheComponents/partialPrefetching permanece.

**Validação desktop real pendente:** criar/abrir/editar projeto, descrição vazia e longa, projeto sem tarefas (0%), várias tarefas, editar título da tarefa, concluir parcialmente e chegar a 100%, desfazer, refresh da lista/detalhe, contas A/B, conflito em duas abas, expirar sessão e interromper rede durante cada gravação. Conferir rascunho preservado, ausência de falso sucesso e checkbox/progresso alterados somente após confirmação. Testes offline cobrem esses contratos, mas não substituem navegador/PostgREST reais; esta execução não teve ferramenta de navegador autenticado disponível. **Não iniciar Finanças antes da validação de Projetos.**

## Finanças — entrega de 27/10/2026

Projetos validado no navegador real pela usuária e concluído para o MVP. Finanças substitui o placeholder: consulta mensal em `/financas?month=YYYY-MM`, seletor de mês, cards Receitas/Despesas/Saldo, lista com tipo/descrição/categoria/data/valor e edição; novo em `/financas/nova`, edição em `/financas/[id]`. Despesas agrupadas por nome exato da categoria, sem espaços nas pontas, em ordem decrescente de gasto. Receita não entra nesse agrupamento. Mês sem lançamentos mostra totais zero e estado vazio. Mês atual usa America/Sao_Paulo; datas são civis, sem conversão de fuso. Alterar a data de um lançamento transfere seus valores entre os meses.

Uma tabela `financial_transactions`, RLS por owner, grants restritos por coluna, timestamps do banco e UPDATE com `updated_at` exato. Sem RPC. Valores positivos em `amount_cents INTEGER`, entre 1 e 2.147.483.647 centavos (R$ 0,01 a R$ 21.474.836,47 por lançamento); receita/despesa definida pelo tipo. Entrada aceita vírgula ou ponto decimal e até duas casas, sem separador de milhar; conversão decimal e soma de totais usam inteiros/BigInt, sem multiplicação de valor monetário em ponto flutuante. Listagem paginada busca o mês completo antes de calcular totais. Falha/sessão expirada/conflito preservam rascunho; sucesso e navegação somente após confirmação, com UUID estável em tentativa incerta. POSTs das rotas explícitas do editor chegam à autenticação da action após expiração; GET permanece protegido.

Aplicada somente `20261027000200_financial_transactions.sql` no **Rotina - Desenvolvimento**, após confirmação do destino e dry-run exclusivo, sem seeds/roles/Vault; dez versões alinhadas. Tipos gerados em temporário ignorado e comparados estruturalmente: zero divergências. **150 unitários e 104 SQL/PGlite**, lint, TypeScript, build Webpack e diff-check aprovados; permanece o aviso preexistente cacheComponents/partialPrefetching. README, Backlog e Documento Mestre atualizados. Sem integração bancária/Open Finance, cartões/faturas, parcelas avançadas, investimentos, metas financeiras, previsão, IA ou importação automática.

**Validação desktop real pendente:** criar receita e despesa com centavos, editar todos os campos (inclusive tipo, categoria e data entre meses), mês vazio, vários lançamentos, trocar mês, conferir totais e saldos positivo/negativo, conferir categorias em ordem decrescente e persistência após refresh da lista/detalhe. Testar contas A/B (inclusive URL de outro owner), sessão expirada antes de salvar, rede interrompida e conflito entre abas: rascunho preservado, nenhum falso sucesso/duplicação e consulta da tentativa incerta em outra aba. Não houve navegador autenticado disponível nesta execução; SQL/PGlite e testes de interface offline não substituem essa validação. **Não iniciar refinamentos gerais ou responsividade avançada antes da validação de Finanças.**

Telas funcionais e já validadas para o MVP: **Banco Mestre/Áreas, Hoje, Planejamento, Calendário, Ideias e Projetos**. **Finanças funcionalmente implementado, aguardando validação real para fechamento do MVP.**

## Fechamento funcional e auditoria de acabamento — 27/10/2026

Finanças validado no navegador real pela usuária. **MVP funcional concluído; etapa atual: acabamento e responsividade.** Os sete módulos estão concluídos funcionalmente. [Relatório curto A/B/C](rotina/doc/MVP-auditoria-acabamento.md): retirados controles sem ação e trechos do template/“em breve”, cabeçalho nas subrotas corrigido, nova tentativa de leitura, retorno ao login e pequenos ajustes de largura/espaço inferior. Sem mock nas dependências alcançadas pelas páginas; links internos literais sem destinos ausentes identificados.

Validação: **153 unitários e 104 SQL/PGlite**, lint, TypeScript, build Webpack e diff-check aprovados. TypeScript repetido após o build para evitar concorrência sobre arquivos gerados em `.next`; aviso preexistente cacheComponents/partialPrefetching mantido. Auditoria por código/renderização offline, sem navegador autenticado nesta execução: conferir visualmente as correções, temas e textos longos. Próxima rodada: responsividade medida em dispositivos, uniformidade visual e áreas de toque. Sem nova migration, dependência, operação remota, Occurrence, integração ou retomada do progresso avançado.

## Finanças — Contas fixas / Contas do mês (27/10/2026)

Cadastro permanente de contas, valor padrão, dia de vencimento (1–31), categoria e ativação/desativação. Seção Contas do mês em `/financas`, com anterior/próximo/referência atual, valor mensal editável, pago/desfazer e totais previsto/pago/restante. Cadastro em `/financas/contas/nova` e edição em `/financas/contas/[id]`; desativados continuam disponíveis para consulta/reativação. A alteração do padrão não modifica estados mensais existentes.

**Virada financeira fixa no dia 20:** `billReferenceMonth` recebe a data civil de America/Sao_Paulo; dias 1–19 usam o mês anterior, dias 20–31 usam o atual (19/11 → outubro; 20/11 → novembro). Esta referência destaca somente o checklist; o resumo de lançamentos continua por mês calendário e data real do pagamento. Há uma implementação SQL equivalente para a criação do cadastro, com testes comparando as duas. Vencimento mostra o dia cadastrado; em meses curtos, considera-se o último dia disponível, sem motor de agenda/notificação.

Persistência: `fixed_expenses` e `fixed_expense_months`; UNIQUE owner/conta/referência, FKs compostas e RLS por owner. Estados mensais guardam cópia de nome/categoria/vencimento e valor, `paid_at` e vínculo com a despesa. `starts_on` evita inventar meses anteriores à criação da conta. Inicialização lazy de somente a referência consultada, idempotente, sem cron/worker; uma conta nova também inicia a referência financeira atual. Desativação impede novos estados; todos os já criados, inclusive meses futuros consultados antes, são preservados. Reativação permite novas referências. Centavos INTEGER compatíveis com os lançamentos atuais (R$ 0,01 a R$ 21.474.836,47 por conta); totais em BigInt.

**Integração atômica:** três RPCs pequenas (cadastro, inicialização e gravação mensal), com owner verificado no banco, search_path fixo, privilégios restritos e lock da linha. Pagar cria uma única despesa na data real atual de São Paulo; editar valor pago atualiza a mesma despesa, preservando a data. Desfazer limpa o vínculo e remove exclusivamente aquela despesa gerada, na mesma transação. Lançamentos manuais não são removidos. Despesas geradas direcionam a edição para Contas do mês e são protegidas contra UPDATE manual no banco. Retry do mesmo estado retorna o resultado confirmado; pedido diferente com snapshot antigo retorna conflito. UI preserva rascunho e estado confirmado em falha/sessão expirada e pede confirmação antes de pagar/desfazer.

Migration `20261027000300_fixed_expenses.sql` aplicada exclusivamente no **Rotina - Desenvolvimento**, após dry-run, sem seeds/roles/Vault; onze versões alinhadas. Tipos oficiais comparados com zero divergências. **161 unitários e 112 SQL/PGlite aprovados**, incluindo rollback em falhas de INSERT/UPDATE/DELETE da despesa, retry, A/B e vínculo seguro. Lint, TypeScript, build Webpack e diff-check aprovados; permanece o aviso preexistente cacheComponents/partialPrefetching. Sem integrações, pagamento automático, notificações, gráficos ou responsividade avançada.

**Validar no navegador:** criar Aluguel dia 27 e conferir referência atual; pagar com valor confirmado, refresh e uma única despesa; avançar mês (não pago) e voltar (histórico pago); Luz padrão 180, mês 213,47 sem alterar padrão; editar valor pago e conferir despesa; desfazer/repagar sem duplicar nem atingir lançamento manual; totais; desativar e abrir referência ainda não criada; reativar; contas A/B; logout em outra aba, rede interrompida e conflito em duas abas sem falso sucesso ou perda do valor. Virada 19/20 e transição dezembro/janeiro cobertas por testes automatizados. Sem navegador autenticado disponível nesta execução. **Fechamento final desta extensão de Finanças pendente; não iniciar responsividade avançada ou outras funcionalidades grandes.**

## Preparação para uso oficial — limpeza segura (27/10/2026)

**Mecanismo preparado; nenhuma limpeza real executada.** Auditoria remota READ ONLY confirmou as 16 tabelas funcionais com owner/RLS e ausência da candidata pausada. [Auditoria, dependências, ordem e procedimento de confirmação](rotina/doc/MVP-limpeza-dados-teste.md). Página temporária local `/dev/limpar-dados`, sem link nos menus: obter prévia de contagens por ação explícita, revisar conta/e-mail e linhas por tabela, aguardar autorização e só depois confirmar a frase exata. Abrir a página não consulta nem apaga dados.

Execução restrita a desenvolvimento local e ao projeto auditado; sessão verificada por `getUser`, sem user_id arbitrário e sem service_role. CLI local já autenticado fornece o privilégio necessário sem alterar grants/RLS; SQL usa exclusivamente `auth.uid()` derivado da sessão e roda em uma transação. Desfaz o vínculo circular financeiro, remove dados na ordem de FKs, exige zero em todas as tabelas e compara hashes/contagens de outros owners, Auth e estrutura/migrations antes do COMMIT. Prévia de uso único com validade de 10 minutos; dados alterados, catálogo inesperado, sessão trocada ou falha abortam sem retry automático.

Ambiente local ignorado: `DEV_DATA_CLEANUP_ENABLED=true` e **`DEV_DATA_CLEANUP_ALLOW_EXECUTE=false`**; somente prévia está habilitada. Exemplo versionado deixa ambas false. Nenhum schema, migration, função ou policy foi modificado/aplicado nesta preparação. Contagens reais da sessão ainda devem ser obtidas pela usuária na página; não foi escolhido UUID de conta pelo agente.

Verificação: **171 unitários e 118 SQL/PGlite aprovados**, lint, TypeScript, build Webpack e diff-check aprovados. HTTP de produção conferido: página dev e POST de prévia retornam 404. Permanece o aviso preexistente cacheComponents/partialPrefetching. Testes locais cobrem A/B, preservação de Auth/hash de senha e estrutura, retorno ao Banco Mestre vazio e primeiros cadastros nos módulos, rollback e bloqueio em produção. Login real/estado inicial e conta B reais serão conferidos após a execução autorizada, não nesta preparação. Após o uso, desativar/remover a ferramenta temporária. **Aguardando confirmação da usuária para qualquer limpeza real; exclusão definitiva de conta fica para a próxima tarefa.**

## Correção da prévia de limpeza — 27/10/2026

Sem limpeza, habilitação destrutiva ou alteração de migrations/schema. Causa reproduzida com o CLI instalado 2.120.0: `node node_modules/supabase/dist/supabase.js db query --project-ref <ref> --file <arquivo> --output json` termina com exit code 1, stdout vazio e erro de combinação de flags. `--project-ref` precisa de `--linked` para consultar o projeto vinculado. O vínculo local foi conferido com o projeto autorizado.

Transporte corrigido: `db query --linked --project-ref <ref> --file <arquivo> --output json --agent yes`. A ajuda instalada confirma `-f/--file`, `--output`, `--output-format` e `--agent`; testes reais de leitura mostraram array de linhas com `--agent no` e envelope `{boundary, rows, warning}` com `--agent yes`. Parser aceita somente esses formatos verificados e valida estritamente o relatório. Antes de cleanupSql, o mesmo transporte corrigido executou `SELECT 1 AS ok` → **1**, depois contagem READ ONLY do catálogo → **16 tabelas funcionais**.

Preview agora retorna sempre “Não foi possível gerar a prévia. Nenhum dado foi alterado.” em falha, com categoria segura; resultado incerto fica restrito a EXECUTE após confirmação. Relogin aparece somente em UNAUTHORIZED, não em falhas de CLI/rede/formato. Diagnóstico temporário só no servidor de desenvolvimento: exit code/signal/timeout, tamanhos de stdout/stderr, categoria, falha de parse e tipo/chaves superiores sanitizadas. Nunca grava saída bruta, SQL, credenciais, UUID/e-mail ou conteúdo do ambiente.

Validação: **175 unitários e 6 SQL/PGlite aplicáveis**, lint, TypeScript, build Webpack e diff-check aprovados. HTTP de produção confirmou página dev e POST de prévia bloqueados com 404/ENVIRONMENT_BLOCKED. A usuária confirmou que a prévia real exibiu 16 linhas de tabelas diferentes; a igualdade das contagens da mesma tabela entre duas consultas ainda não foi confirmada. Nenhuma identidade foi escolhida pelo agente para contornar a sessão. Zero dados funcionais excluídos nesta correção; execução destrutiva permanece bloqueada.

## Limpeza autorizada concluída — 28/10/2026

A usuária revisou a nova prévia, realizou a confirmação destrutiva na interface e confirmou o relatório OK e uma nova prévia com as **16 tabelas em zero**. A conta Auth e sua estrutura foram preservadas; outras contas permaneceram intactas (activities 1, areas 1, demais tabelas 0; outras contas Auth 2). O servidor registrou execução confirmada com exit code 0/HTTP 200. O Codex não enviou a confirmação destrutiva.

Após esse retorno, `DEV_DATA_CLEANUP_ALLOW_EXECUTE=false` foi restaurado no ambiente local ignorado pelo Git e o servidor foi reiniciado. Prévia local continua disponível; execução real bloqueada. Nenhuma alteração em código de produção, migrations, schema ou auth.users nesta etapa. Exclusão definitiva de conta não iniciada.

## Exclusão definitiva de conta — 28/10/2026

MVP funcional concluído; preparação para uso oficial. `/conta`, acessível por **Minha conta**, exige a frase **EXCLUIR MINHA CONTA**. Endpoint permanente no servidor, com Origin verificada, sem alvo informado pelo browser, identidade derivada de JWT verificado e `getUser` online imediatamente antes da exclusão. Segredo **SUPABASE_SECRET_KEY** somente no servidor do mesmo projeto, em módulo `server-only`; sem NEXT_PUBLIC, logs ou persistência administrativa. Ausência do segredo bloqueia a operação.

Auditoria real: 11 migrations anteriores e 16 tabelas funcionais com FK Auth CASCADE; três vínculos RESTRICT e ciclo financeiro. O papel do Auth não consegue executar sozinho os triggers invoker existentes. A migration **20261028000100_account_deletion.sql**, aplicada somente no desenvolvimento após dry-run exclusivo, instala trigger privado BEFORE DELETE usando apenas `OLD.id`, sem RPC pública. Dados, Auth, sessões e refresh tokens são removidos na mesma transação de `auth.admin.deleteUser(..., false)`; falha reverte tudo. Nenhuma conta real foi excluída durante a implementação.

Retries confirmam ausência do próprio Auth antes de mostrar sucesso. Após confirmação, logout/limpeza de cookies e retorno ao login. JWT antigo pode continuar com assinatura válida até expirar: proxy usa `getUser` online e FKs impedem recriar dados órfãos. **Storage não aplicável no estado atual** (zero buckets/objetos e sem uploads). `/dev/limpar-dados` não foi reutilizada e sua execução continua bloqueada. Candidata de progresso não foi alterada nem promovida.

[Auditoria, arquitetura, limites e roteiro manual](rotina/doc/MVP-exclusao-conta.md). Validação real de exclusão/login/refresh pela API Auth e navegador depende do segredo administrativo e de **conta secundária descartável**, com B preservada em outro perfil. Nunca testar na conta principal.

Validação automatizada: **188 unitários, 123 SQL/PGlite e 26 PostgreSQL local** (1 específico de exclusão + 25 existentes), lint, TypeScript e build Turbopack aprovados. Bundles públicos sem módulo/variáveis administrativas; nenhuma alteração de schema público/tipos de dados. Aviso preexistente de cacheComponents/partialPrefetching mantido. O teste real de Auth/navegador permanece pendente; sem afirmar que login/refresh reais foram validados por fixtures SQL.

## Auditoria de performance — 28/10/2026

Contexto atualizado pela usuária: exclusão definitiva validada com conta secundária. MVP funcional concluído; preparação para uso oficial. [Relatório por rota, medições, limitações e próximos passos](rotina/doc/MVP-auditoria-performance.md).

Correções pequenas: detalhe de Projeto com leituras paralelas; lista com projeção mínima de tarefas e agrupamento linear do progresso; resumo de Finanças independente do carregamento das contas mensais. Em transporte controlado de 40 ms por etapa, medianas de cinco amostras: Projeto 95→43 ms e conteúdo principal de Finanças 92→49 ms. Projeção de 1.000 tarefas: JSON bruto 450.004→123.004 bytes (−72,7%). São medições sintéticas, não tempos de uso autenticado no Supabase.

Mantido Cache Components; `partialPrefetching: true` após revisão da documentação instalada, links e Suspense. Build/dev aceitos, warning anterior removido; sem cache compartilhado de dados pessoais. Auditoria remota somente leitura confirmou índices necessários de mês/data/owner; **nenhuma migration/índice ou dependência criada**. Auth online, RLS, revalidações e candidata de progresso preservados.

Aprovados **192 unitários, 123 SQL/PGlite**, regressão PostgreSQL local de conta, lint, TypeScript, build, dev/start e diff-check. HTTP local público de login: mediana 96 ms dev / 24 ms produção; nas oito rotas principais, sem sessão, mediu-se apenas redirect 307. **Desempenho autenticado e navegação/prefetch no navegador ainda precisam de validação desktop em produção**; não concluir que produção resolve todos os gargalos.

## Auditoria funcional e UX desktop — 28/10/2026

[Relatório por rota, classificação, arquivos e roteiro manual](rotina/doc/MVP-auditoria-funcional-desktop.md). Revisados os oito módulos, criações/edições, Áreas, tarefas, contas mensais e Auth. Nenhum novo defeito crítico de persistência/isolamento confirmado. Corrigidos riscos de descarte silencioso por links/Cancelar/logout, duplo envio em Auth, save sem mudanças/validação de conta fixa, logout com navegação completa e mensagem, títulos/erros em português e largura do formulário de item. Telas públicas não mostram mais a navegação do app/+; Chrome real 1440×900 confirmou h1, labels e remoção da rolagem extra (1060→900 px).

Proteção de rascunhos cobre navegação visível e reload/fechamento; **Voltar/Avançar nativos em navegações SPA permanecem como backlog**, sem alteração de history do Next. Inspeção das telas autenticadas usou componentes reais com fixtures sintéticos read-only; não substitui o percurso funcional autenticado no navegador. Ferramenta `/dev/limpar-dados` mantida somente em development e isolada do produto, sem habilitar execução. Sem novas migrations/dependências ou mudança de regras de negócio; performance anterior preservada.

Backlog e Documento Mestre atualizados. Fechamento automatizado e limitações no relatório; **não iniciar mobile/tablet antes da validação desktop**.

Fechamento desta rodada: **200 unitários, 123 SQL/PGlite e 1 regressão PostgreSQL local**, lint, TypeScript, build Turbopack e diff-check aprovados. HTTP de produção: oito módulos protegidos redirecionam sem sessão, mensagem de logout 200, página inexistente 404 em português e página/API de limpeza dev bloqueadas com 404. Nenhuma conta/dado real removido; execução da limpeza segue desabilitada.

## Mobile e tablet — 29/10/2026

[Relatório, arquivos, evidências e roteiro manual](rotina/doc/MVP-responsividade.md). Ajustados navegação/+ compartilhados, alvos de toque, calendário, tarefas, Finanças/contas mensais e formulários Auth, preservando sidebar e layout desktop a partir de 1280 px. Chrome isolado: 126 vistas entre 320 e 1440 px, sem overflow horizontal da página ou erros JavaScript capturados. Fixtures sintéticos removidos do app antes do build; nenhuma escrita em dados reais. Backlog e Documento Mestre atualizados. Teclado virtual, safe areas, rotação e percurso autenticado ainda devem ser conferidos em aparelho físico. Sem migrations, novas dependências ou mudanças de regras de negócio.

Fechamento: 203 unitários, 123 SQL/PGlite, 1 PostgreSQL local, lint, TypeScript, build e diff-check aprovados. Oito capturas desktop 1440×900 idênticas às referências anteriores; screenshots selecionados no relatório. Produção local confirmou Auth público, redirects sem sessão e bloqueio das páginas dev.
