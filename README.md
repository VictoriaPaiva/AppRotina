# Rotina

Aplicação pessoal de organização de rotina, planejamento, projetos, ideias e compromissos.

O **Rotina** está sendo desenvolvido como uma plataforma modular para centralizar atividades do dia a dia, metas, recorrências, projetos, planejamento e futuras extensões, sem transformar automaticamente todo tempo livre em produtividade.

## Status atual

**Etapa atual:** V0.2.3B.2A.1 — hardening de permissões internas; UI em mocks

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

**V0.2.3B.2A.1 — permissões internas restringidas, sem integração da interface.**

O documento [Modelo relacional V0.2.3A](rotina/doc/V0.2.3A-modelo-relacional.md) descreve tabelas, colunas, PKs/FKs, integridade por tipo, ownership, RLS, datas, índices, mapeamento TypeScript e fronteiras futuras de Occurrence/ProgressLog. A ressalva aprovada exige minutos inteiros. As nove tabelas agora estão implementadas em migrations locais; detalhes em [Banco local B.1](rotina/doc/V0.2.3B.1-banco-local.md).

Sequência:

1. B.1 aprovada: nove tabelas, constraints, RLS e escrita agregada.
2. **B.2A:** tipos Database provisórios derivados das migrations, DTOs/mappers, metadata revision, repository browser/server injetável, RPC segura de leitura e testes. Consulte [Camada de dados B.2A](rotina/doc/V0.2.3B.2A-camada-dados.md). Mocks/provider continuam sendo a fonte da interface.
3. **B.2A.1:** migration incremental revoga grants genéricos e USAGE de routine_private; mantém get/save públicas invoker e apenas EXECUTE técnico dos três CHECK validators. Defaults por owner foram ajustados, com alcance global documentado. Consulte [Hardening no guia de banco](rotina/doc/V0.2.3B.1-banco-local.md).
4. **B.2B, após aprovação:** validar stack local/tipos oficiais e definir a integração da UI com o repository/autenticação. Nenhuma conexão da UI foi feita nesta entrega.
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

A etapa atual mantém o cadastro em memória. Os clientes Supabase/Auth do starter já existem, mas não persistem itens do Banco Mestre. O GitHub armazenará **como o banco será estruturado**, por exemplo:

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
- Autenticação do starter adaptada ao Rotina; falta validar login, confirmação, recuperação, refresh e isolamento entre contas no Supabase real. Veja [V0.2.3B.2B.1](rotina/doc/V0.2.3B.2B.1-auth-smoke.md).
- Gerar Database types oficialmente quando a stack Supabase/Docker estiver disponível; os tipos B.2A são provisórios e conferidos contra o catálogo PostgreSQL.
- Validar PostgREST/GoTrue e concorrência entre sessões na stack completa. `.env.*` já está protegido, com exceção de `.env.example`.

## Estado de retomada

**Último marco funcional:** V0.2.2D aprovada, concluindo a V0.2.2 com cinco tipos de Item da Rotina.

**Ponto atual:** preparação V0.2.3B.2B.1 de autenticação e smoke implementada; validação no Supabase real pendente. UI do Banco Mestre permanece local, com mocks.

**Próxima ação:** configurar e autorizar um projeto Supabase de desenvolvimento e executar o [roteiro de autenticação e smoke](rotina/doc/V0.2.3B.2B.1-auth-smoke.md). Não houve conexão ou alteração remota nesta etapa.

---

O Rotina está em desenvolvimento ativo. Estrutura, regras e funcionalidades podem evoluir conforme o uso e a validação do produto.
