# Rotina

Aplicação pessoal de organização de rotina, planejamento, projetos, ideias e compromissos.

O **Rotina** está sendo desenvolvido como uma plataforma modular para centralizar atividades do dia a dia, metas, recorrências, projetos, planejamento e futuras extensões, sem transformar automaticamente todo tempo livre em produtividade.

## Status atual

**Etapa atual:** V0.2.3B.2B.2B — criação e edição reais integradas; validação da escrita na UI pendente

**Marco concluído:** V0.2.2 — interface local do Banco Mestre e fluxo de Item da Rotina, consolidada na V0.2.2D e aprovada após teste manual.

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

O Banco Mestre é a **biblioteca e administração dos itens reutilizáveis da rotina**. Já possui listagem, busca, filtros, detalhe único, criação, edição, ativação/desativação e validações. A troca de tipo mantém a identidade e pede confirmação antes de limpar dados específicos. Dados locais são compartilhados durante a navegação; recarregar restaura os mocks.

| Tipo | Comportamento do cadastro atual |
|---|---|
| Lembrete | Data de referência, aviso opcional e repetição opcional |
| Compromisso | Data/início/fim, local, preparação/transporte e repetição opcional |
| Atividade fixa | Grupos de dias com horários compartilhados |
| Atividade variável | Metas e janelas preferenciais, sem criar dias obrigatórios |
| Meta / Checklist | Vezes, quantidade ou tempo por dia/semana/mês |

Os literais técnicos são reminder, commitment, fixedActivity, variableActivity e checklistGoal. trackingMode foi removido por redundância. Importância continua independente; novos itens são ativos e status aparece na edição. Duração aceita Desconhecida, Fixa e Mínima + ideal, com horas/minutos convertidos em minutos totais. Preparação, ida e volta são estimativas locais, não reservas de agenda.

As demais telas mantêm sua estrutura visual inicial. Não há calendário/planejamento funcional, motor de recorrência, progresso real, notificações ou persistência dos itens no Supabase.

## Meta / Checklist e progresso diário futuro

Meta / Checklist ficará em um card próprio, **fora da grade principal do Calendário**. Os quadradinhos representam registros de execução/progresso de uma data ou período, não subtarefas permanentes no cadastro.

Exemplo: escovar dentes ideal 3 vezes/dia, duas execuções em 11/10 → 2/3. Em 12/10, a apresentação considera os registros do novo dia; não zera nem recria a Activity e não gera dívida. Quantidade será registrada na unidade configurada; tempo será registrado por sessões/minutos. O código atual cadastra metas, mas ainda não implementa esses registros nem calcula progresso.

Metas e recorrências permanecem separadas: uma meta 3x/semana não cria dias ou horários fixos. Atividade variável só ocupará um horário depois de planejamento futuro; compromisso e atividade fixa já possuem configurações de horário.

## Etapa atual e próxima etapa

**V0.2.3B.2B.2B — criação e edição pelo repository existente, com revisão otimista e sessão normal.**

O documento [Modelo relacional V0.2.3A](rotina/doc/V0.2.3A-modelo-relacional.md) descreve tabelas, colunas, PKs/FKs, integridade por tipo, ownership, RLS, datas, índices, mapeamento TypeScript e fronteiras futuras de Occurrence/ProgressLog. A ressalva aprovada exige minutos inteiros. As nove tabelas agora estão implementadas em migrations locais; detalhes em [Banco local B.1](rotina/doc/V0.2.3B.1-banco-local.md).

Sequência:

1. B.1 aprovada: nove tabelas, constraints, RLS e escrita agregada.
2. **B.2A:** tipos Database provisórios derivados das migrations, DTOs/mappers, metadata revision, repository browser/server injetável, RPC segura de leitura e testes. Consulte [Camada de dados B.2A](rotina/doc/V0.2.3B.2A-camada-dados.md). Mocks/provider continuam sendo a fonte da interface.
3. **B.2A.1:** migration incremental revoga grants genéricos e USAGE de routine_private; mantém get/save públicas invoker e apenas EXECUTE técnico dos três CHECK validators. Defaults por owner foram ajustados, com alcance global documentado. Consulte [Hardening no guia de banco](rotina/doc/V0.2.3B.1-banco-local.md).
4. **B.2B.1 e B.2B.2A concluídas:** Auth/sessão, seis migrations, PT409, repository, RLS A/B/anon e leitura nas telas validados remotamente pela usuária; tipos oficiais adotados. **B.2B.2B atual:** criação/edição no formulário existente via Server Action autenticada e saveActivity, com revisão obrigatória na edição. Consulte a [escrita real](rotina/doc/V0.2.3B.2B.2B-escrita-banco-mestre.md).
5. **V0.2.4:** primeiro ciclo de persistência, formulário → Supabase → PostgreSQL → leitura, em etapa posterior autorizada.
6. Planejamento, Calendário, Occurrence e registros de progresso terão etapas próprias; não entram implicitamente na primeira migration.

O núcleo de dados vem antes das telas funcionais porque elas dependerão de tipos, metas, recorrências e preferências consistentes. O detalhe de um item permanece um destino único reutilizável, mesmo quando futuramente aberto a partir de outras telas.

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

O Markdown versionado principal é este README. Documento Mestre e Backlog estão presentes em DOCX em rotina/doc/; foram preservados nesta etapa. A especificação Markdown V0.2.3A registra as decisões técnicas atuais e o planejamento dos próximos marcos.

## Pendências técnicas conhecidas

- Avaliar futuramente a recomendação de configuração `partialPrefetching` junto de `cacheComponents`; o build atual passa e isso não bloqueia a V0.2.
- Busca e Configurações globais e ações fictícias da tela Hoje ainda são preparatórias. Busca/filtros do Banco Mestre e botão + para Item da rotina já funcionam localmente.
- B.2B.1 e leitura da B.2B.2A confirmadas no Supabase/navegador real. Pendente validar criação/edição e conflito em duas abas pela UI da [B.2B.2B](rotina/doc/V0.2.3B.2B.2B-escrita-banco-mestre.md).
- Tipos oficiais do schema public gerados e adotados na B.2B.1.3, preservando aliases e validações de transporte. O teste de catálogo confere os contratos contra as migrations em PostgreSQL em memória.
- Validar PostgREST/GoTrue e concorrência entre sessões na stack completa. `.env.*` já está protegido, com exceção de `.env.example`.

## Estado de retomada

**Pré-requisito B.2B.1 concluído:** Auth/sessão, seis migrations, PT409, POST, RLS de leitura/escrita cruzada, UPDATE/INSERTs cruzados, verify e anon confirmados remotamente pela usuária. Tipos oficiais adotados com aliases compatíveis e revisão omitida na criação usando o default SQL. Sem divergência E identificada.

**Último marco funcional:** V0.2.2D aprovada, concluindo a V0.2.2 com cinco tipos de Item da Rotina.

**Ponto atual:** B.2B.2A validada no navegador real (lista, detalhe direto, inexistente, escrita bloqueada e isolamento visual A/B). B.2B.2B integra criação/edição com saveActivity e revisão, sem mocks ou save local no provider. Sem migration, db push ou alteração de schema/RLS/Auth. A escrita pela nova UI ainda precisa de validação real.

**UX atual:** Novo/Editar habilitados, áreas e snapshots reais. Envio com loading e trava contra duplo submit; navegação somente após confirmação do banco. Conflito mantém o rascunho e exige recarga explícita, sem sobrescrita automática. Provider restrito a `/banco-mestre`, sem escrita local; leitura preservada.

**Verificação B.2B.2B:** 69 testes unitários, 54 testes SQL, lint, TypeScript, build e diff-check passaram. Nova escrita pela UI ainda pendente de validação no navegador real; roteiro em [escrita real](rotina/doc/V0.2.3B.2B.2B-escrita-banco-mestre.md).

**Correção de sessão expirada:** POSTs de Server Actions nas rotas do editor chegam à verificação de sessão da action e retornam Unauthorized, preservando o rascunho e oferecendo “Entrar novamente”. GET sem sessão continua redirecionando para login. Repetir no navegador o logout em outra aba antes de salvar; regressão automatizada incluída.

**Verificação histórica B.2B.2A:** 57 testes unitários, 50 testes SQL, lint, TypeScript, build e diff-check passaram; os cinco cenários de navegador relatados pela usuária estão concluídos. Resultados e roteiro da escrita ficam na documentação B.2B.2B.

**Verificação da adoção:** 47 testes unitários, 48 testes SQL, lint, TypeScript, build e diff-check passaram. Camada de persistência tecnicamente pronta para liberar B.2B.2, considerando também as validações remotas confirmadas pela usuária. Nenhum segredo exposto; sem migration, db push ou alteração de Auth nesta adoção.

**Próxima ação:** executar o roteiro manual de criação/edição, refresh e conflito em duas abas da B.2B.2B no projeto de desenvolvimento, com dados técnicos. Nenhuma etapa posterior foi iniciada.

---

O Rotina está em desenvolvimento ativo. Estrutura, regras e funcionalidades podem evoluir conforme o uso e a validação do produto.
