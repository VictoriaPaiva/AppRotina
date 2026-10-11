# Rotina

Aplicação pessoal de organização de rotina, planejamento, projetos, ideias e compromissos.

O **Rotina** está sendo desenvolvido como uma plataforma modular para centralizar atividades do dia a dia, metas, recorrências, projetos, planejamento e futuras extensões, sem transformar automaticamente todo tempo livre em produtividade.

## Status atual

**Fase:** V0.2 — início do primeiro módulo funcional  
**Marco concluído:** V0.1 — fundação visual e estrutural

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

## Próxima etapa

A V0.2 começa pelo **Banco Mestre**.

Sequência planejada:

1. **V0.2.1 — Modelagem do Banco Mestre**
   - campos da atividade;
   - tipo;
   - importância;
   - área;
   - duração;
   - recorrência;
   - metas;
   - janelas e restrições;
   - estados e regras relacionadas.

2. **V0.2.2 — Interface do Banco Mestre com dados fictícios**
   - busca e filtros;
   - listagem;
   - detalhe;
   - formulário;
   - reutilização dos componentes UI existentes.

3. **V0.2.3 — Modelo PostgreSQL/Supabase**
   - tabelas;
   - relacionamentos;
   - migrations;
   - políticas RLS.

4. **V0.2.4 — Primeiro ciclo real**
   - formulário → Supabase → PostgreSQL → leitura no Banco Mestre.

## Por que o Banco Mestre vem antes das demais telas funcionais?

O Banco Mestre será a **fonte de verdade das atividades e regras**.

Planejamento, Calendário e a Tela Hoje dependem de informações como recorrência, duração, metas, janelas e restrições. Implementar essas telas funcionalmente antes do Banco Mestre exigiria simular ou duplicar regras que depois precisariam ser refeitas.

As estruturas visuais das outras telas já existem como protótipos aprovados e rotas placeholder; portanto, não é necessário completar todas as interfaces antes de consolidar o núcleo de dados.

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
Cadastro/configuração das atividades, duração, importância, recorrência, metas, janelas e regras.

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
    ├── types/          # conforme necessidade
    ├── supabase/       # migrations/functions quando iniciado
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
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

## Banco de dados

O banco real ficará no Supabase.

O GitHub armazenará **como o banco é estruturado**, por exemplo:

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
- metas X vezes por período;
- mínimo e ideal;
- quando necessário.

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

Os três devem ser revisados após marcos relevantes.

## Pendências técnicas conhecidas

- Validar manualmente a V0.1 em navegador nos modos claro/escuro, larguras desktop/mobile e navegação por teclado.
- Avaliar futuramente a recomendação de configuração `partialPrefetching` junto de `cacheComponents`; o build atual passa e isso não bloqueia a V0.2.
- Busca, Configurações, ações dos cards e botão `+` permanecem placeholders.
- Autenticação herdada do starter Supabase ainda será validada quando entrar no escopo.

## Estado de retomada

**Último marco:** V0.1 concluída e subida para a branch `desenvolvimento`.

**Próxima ação:** V0.2.1 — modelar o Banco Mestre antes de criar o formulário definitivo e o banco de dados.

---

O Rotina está em desenvolvimento ativo. Estrutura, regras e funcionalidades podem evoluir conforme o uso e a validação do produto.
