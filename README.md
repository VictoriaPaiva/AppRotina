# Rotina

Aplicação pessoal de organização de rotina, planejamento, projetos, ideias e compromissos.

O **Rotina** está sendo desenvolvido como uma plataforma modular para centralizar atividades do dia a dia, metas, recorrências, projetos, planejamento e futuras extensões, sem transformar automaticamente todo tempo livre em produtividade.

## Status atual

**Prioridade atual: MVP utilizável.
A trilha avançada de progresso V0.2.5 está pausada e preservada para retomada futura.**

Atualização oficial em 22/10/2026: entregar funcionalidade prática nos sete módulos — Hoje, Planejamento, Calendário, Projetos, Banco Mestre, Ideias e Finanças. Banco Mestre e gestão de Áreas reais permanecem preservados. Documentos, candidates e testes de progresso permanecem intactos; não continuar preflight/promoção. Os registros de etapas abaixo são históricos e não autorizam retomar essa trilha.

Finanças está acessível em `/financas`, na Sidebar desktop e no menu Mais mobile, com título próprio e a mensagem “Página em construção”. Segue a proteção de sessão das demais rotas principais. Ainda não há operações financeiras.

**Primeira entrega funcional do MVP — Planejamento + Hoje implementados localmente; aguardam aplicação da migration e validação no navegador real.** Banco Mestre oferece Planejar nas Activities ativas; Planejamento permite Hoje/Amanhã/data, consulta por data, conclusão/desfazer e reagendamento; Hoje mostra itens reais, concluídos da data planejada e pendências (data anterior sem conclusão), sem demonstrações. Dados vêm do servidor após gravação confirmada. A conclusão de uma pendência conserva sua data original; consulte essa data em Planejamento para encontrá-la depois.

Migration incremental: `rotina/supabase/migrations/20261022000100_daily_plan_items.sql`. Uma Activity/data por conta; FK composta, RLS, sem DELETE, timestamps do banco e UPDATE condicionado ao snapshot exato (incluindo microssegundos). Activity inativa não admite planejamento novo; planos existentes continuam visíveis, concluíveis e reagendáveis. Concluir/desfazer afeta somente o item planejado. Dia civil: convenção explícita `America/Sao_Paulo`, calculada no servidor ao carregar/atualizar a tela; não há job noturno. Para uma tela aberta durante a virada do dia, recarregue para obter o novo dia. Sem recorrência automática ou alteração de metas/revision da Activity.

O `package-lock.json` vazio da raiz foi removido: não havia package/workspace ali. O lockfile correto em `rotina/` foi preservado. Nenhum db push executado; migrations antigas e candidata de progresso intactas. Calendário permanece placeholder e depende de validação desta entrega pela usuária antes de qualquer implementação.

Validação automatizada local: **118 unitários e 91 SQL/PGlite passaram**, além de lint, `tsc --noEmit`, build e diff-check. A execução SQL paralela excedeu memória ao concorrer com o build; repetida com sucesso com `node --test --test-concurrency=1 tests/db/*.test.mjs`, sem alterar arquitetura/configuração. Build com acesso à fonte externa; permanece o aviso preexistente cacheComponents/partialPrefetching. Esses resultados não substituem a validação no Supabase/navegador reais.

**Validação real pendente:** aplicar somente a nova migration pelo fluxo habitual de migrations do projeto (a candidata de progresso não faz parte dela), reiniciar a aplicação e testar A/B, Hoje/Amanhã/data personalizada, duplicação, concluir/desfazer, data passada como pendência, reagendar, desativar Activity, duas abas com snapshot antigo, logout em outra aba e rede interrompida. Esperado: isolamento, persistência após refresh, conflito sem sobrescrita, rascunho preservado e nenhum falso sucesso. Regenerar tipos oficiais após aplicação remota; a extensão local de `Database` está identificada no arquivo de tipos.

### Mapa funcional atual do MVP

Mapa atualizado em 22/10/2026 após a implementação local de Planejamento + Hoje, ainda sem validação remota dessa entrega. Navegação, tema e autenticação funcionam globalmente; busca/configurações globais e Projeto/Ideia no botão + permanecem desabilitados.

| Tela | Visual e funcional hoje | Fictício/placeholder e ações sem efeito | Persistência necessária | Menor corte utilizável e reuso |
|---|---|---|---|---|
| Hoje | Leitura SSR real; planejados para hoje, concluídos da data, pendências, conclusão/desfazer e reagendamento | Demonstrações removidas; aguarda migration e validação real | daily_plan_items, migration local criada | Fluxo mínimo implementado com PlanningBoard, Card, Button e Input; falta validação remota |
| Planejamento | Escolha de Activity real, Hoje/Amanhã/data, listagem, concluir/desfazer e reagendar | Placeholder removido; aguarda migration e validação real | Mesma daily_plan_items de Hoje | Fluxo mínimo implementado, reutiliza listActivities, repository/actions e PlanningBoard |
| Calendário | Rota e navegação funcionam | Somente “Página em construção”; nenhum botão específico | Reusar itens do planejamento; sem nova entidade exclusiva para o primeiro corte | Navegar mês/dia e consultar itens planejados reais, com acesso ao planejamento/detalhe. Reusar os mesmos dados, Card e Button; sem motor de recorrência |
| Projetos | Rota e navegação funcionam; ProjectCard existe em Hoje | Página placeholder; Tarot/24% em Hoje é fictício. Iniciar sessão/Subtarefas não funcionam; criação global de projeto desabilitada | Projetos e tarefas com conclusão | Criar/editar projeto, adicionar tarefas, concluir tarefas e calcular percentual pelas tarefas. Reusar ProjectCard, Input, Card, Button e Checkbox; sem cronômetro ou sessões |
| Banco Mestre | Lista, busca, filtros, detalhes, criação/edição e Áreas reais; nova ação Planejar em Activities ativas | Nenhum mock participa; Planejar aguarda validação real desta entrega | Cadastro preservado; vínculo em daily_plan_items | Cadastro já utilizável; nova navegação para Planejamento reutiliza BancoMestreList e sessão existentes |
| Ideias | Rota e navegação funcionam | Somente “Página em construção”; criação global de ideia desabilitada | Ideias próprias: título, texto e timestamps | Criar, listar, consultar e editar notas reais. Reusar Input, Card, Button e padrões de formulário/actions; sem conversão automática em projeto |
| Finanças | Rota, menu desktop/mobile e título adicionados | Somente “Página em construção”; nenhum botão financeiro | Lançamentos próprios: receita/despesa, data, valor, descrição e categoria | Cadastro/edição, visão mensal, totais de ganhos/gastos/saldo, agrupamento por categoria e histórico mensal. Reusar Input, Card, Button e formulários autenticados; calcular valores monetários sem ponto flutuante impreciso |

### Ordem curta de implementação recomendada

1. **Planejamento + Hoje implementados localmente:** `daily_plan_items`, repository/actions e telas, sem Occurrence ou engine. Próximo passo imediato: aplicar a migration e validar o fluxo real, sem antecipar Calendário.
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

**Status vigente em 22/10/2026: MVP utilizável.** Planejamento integrado a Hoje implementado localmente, aguardando migration/validação real. Calendário só após aprovação dessa validação. A trilha avançada V0.2.5 está pausada e preservada; as recomendações de progresso abaixo registram o planejamento anterior, superado por esta prioridade.

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
