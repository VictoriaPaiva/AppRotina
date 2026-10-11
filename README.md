# Rotina

Aplicação pessoal de organização de rotina, planejamento, projetos, ideias e compromissos.

O **Rotina** está sendo desenvolvido como uma plataforma modular para centralizar atividades do dia a dia, metas, recorrências, projetos, planejamento e futuras extensões.

## Status atual

**Fase:** desenvolvimento inicial / fundação técnica  
**Versão de trabalho:** V0.1

Já implementado:
- Next.js rodando localmente
- TypeScript
- Tailwind CSS
- Rotas principais: `/hoje`, `/planejamento`, `/calendario`, `/projetos`, `/banco-mestre`, `/ideias`
- Sidebar desktop
- Navegação inferior mobile
- Botão `+` flutuante
- Tela Hoje inicial com dados fictícios
- Layout responsivo inicial
- Modo claro/escuro com persistência
- Design System visual da V1 definido
- Wireframes e telas de alta fidelidade aprovados para Hoje, Planejamento, Projetos, Calendário, Banco Mestre e Ideias

## Objetivo

Criar uma aplicação pessoal que ajude a organizar a rotina sem tentar preencher automaticamente todo o tempo livre.

O sistema deve permitir:
- cadastrar atividades pontuais e recorrentes;
- organizar compromissos;
- acompanhar metas;
- planejar atividades flexíveis;
- criar e acompanhar projetos;
- registrar sessões de projeto;
- calcular progresso automaticamente;
- capturar e organizar ideias;
- consultar calendário;
- sugerir atividades quando houver tempo disponibilizado;
- manter histórico;
- futuramente gerar insights.

## Princípios do projeto

- O aplicativo deve organizar, não maximizar produtividade.
- Tempo livre não deve ser automaticamente preenchido.
- Atividades podem ser flexíveis e não precisam sempre ter horário.
- Importância e urgência são conceitos diferentes.
- A usuária mantém a decisão final sobre planejamento e sugestões.
- Projetos possuem subtarefas internas, mas o calendário mostra sessões de projeto, não subtarefas individuais.
- A captura de ideias deve ser rápida.
- O sistema deve ser modular e preparado para crescer.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
  - PostgreSQL
  - Auth
  - serviços de backend
- Vercel
- Git + GitHub

Planejado para etapas futuras:
- PWA
- notificações Web Push
- histórico e insights
- integrações externas

## Estrutura funcional da V1

### Hoje
- agenda;
- atividades do dia;
- tarefas flexíveis;
- checklist;
- metas;
- pendências.

### Planejamento
- fechamento do dia;
- planejamento de amanhã;
- contexto semanal;
- pendências;
- sugestões.

### Calendário
- visualização diária, semanal e mensal;
- compromissos;
- atividades;
- sessões de projeto;
- recorrências.

### Projetos
- projetos ativos, pausados e concluídos;
- subtarefas;
- sessões;
- cronômetro;
- progresso automático.

### Banco Mestre
- cadastro e configuração das atividades;
- duração;
- importância;
- recorrência;
- metas;
- janelas de horário;
- regras.

### Ideias
- captura rápida;
- inbox;
- organização;
- transformação em projeto, pesquisa, atividade, estudo ou lista.

## Progresso de projetos

O progresso de um projeto é calculado com base nas subtarefas existentes.

Exemplo:

```text
Projeto: Tarot

Subtarefas:
- Cortar cartas
- Desenhar
- Pintar
- Moldes
- Finalizações
- Pesquisas
```

Subtarefas também podem ter progresso próprio calculado por:
- quantidade;
- etapas;
- checklist;
- conclusão binária.

Exemplo:

```text
Cortar cartas
20 / 78 cartas
≈ 25% concluído
```

A interface pode exibir valores arredondados enquanto o cálculo interno mantém precisão.

## Recorrências

O Rotina deverá suportar:
- diária;
- semanal;
- mensal;
- trimestral;
- a cada X dias;
- dias específicos da semana;
- dia fixo do mês;
- primeira/segunda/etc. ocorrência de um dia da semana no mês;
- recorrência baseada em calendário;
- recorrência baseada na última conclusão;
- metas X vezes por semana;
- mínimo e ideal por período;
- quando necessário.

## Projetos e sessões

Projetos possuem:
- nome;
- descrição;
- status;
- prioridade;
- progresso;
- estimativa;
- sessão mínima;
- sessão ideal;
- subtarefas;
- histórico de sessões.

Uma sessão pode ser iniciada com cronômetro.

Ao encerrar, o tempo efetivamente trabalhado pode ser corrigido manualmente caso o cronômetro tenha ficado aberto por engano.

As subtarefas não precisam ser escolhidas antes da sessão.

## Desenvolvimento local

Pré-requisitos:
- Node.js
- npm
- Git

Executar:

```bash
npm install
npm run dev
```

Abrir:

```text
http://localhost:3000
```

## Git e segurança

### Nunca subir para o GitHub

Não fazer commit de:
- `.env`
- `.env.local`
- `.env.*` com valores reais
- senhas
- tokens
- chaves privadas
- service-role keys
- credenciais de banco
- dumps de banco contendo dados pessoais
- arquivos contendo dados pessoais reais
- certificados privados
- arquivos de configuração com segredos embutidos

Também não é necessário versionar:
- `node_modules/`
- `.next/`
- builds gerados
- caches
- logs locais
- arquivos temporários

Esses itens devem ser controlados pelo `.gitignore`.

### Variáveis de ambiente

Manter um arquivo de exemplo:

```text
.env.example
```

Exemplo:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Sem valores reais.

## Banco de dados

O banco real ficará hospedado no Supabase.

O GitHub armazenará a estrutura e o histórico técnico do banco, como:

```text
supabase/
  migrations/
  functions/
```

Os dados pessoais da aplicação não devem ser armazenados no repositório.

## Organização do repositório

Estrutura esperada:

```text
rotina/
├── app/
├── components/
├── modules/
├── lib/
├── types/
├── public/
├── supabase/
│   ├── migrations/
│   └── functions/
├── docs/
├── .env.example
├── .gitignore
└── README.md
```

A estrutura pode evoluir.

## Documentação viva

O projeto mantém três documentos principais:

1. **README.md**
   - visão geral;
   - instalação;
   - stack;
   - arquitetura;
   - status;
   - instruções técnicas.

2. **Documento Mestre / Template do Projeto**
   - contexto;
   - objetivos;
   - requisitos;
   - decisões;
   - regras;
   - histórico;
   - ponto de retomada.

3. **Backlog**
   - funcionalidades futuras;
   - melhorias;
   - módulos;
   - explorações;
   - status e prioridade.

Esses documentos devem ser atualizados após evoluções relevantes do projeto.

## Próximos passos

- consolidar o layout compartilhado;
- revisar componentes UI existentes e finalizar fundação visual V0.1;
- revisar e reutilizar os componentes UI já existentes;
- finalizar a fundação visual V0.1;
- conectar Supabase;
- estruturar o banco;
- implementar Banco Mestre;
- implementar recorrências e ocorrências;
- alimentar a Tela Hoje com dados reais.

## Observação

O Rotina está em desenvolvimento ativo. Estrutura, funcionalidades e arquitetura podem evoluir conforme novos requisitos forem validados.
