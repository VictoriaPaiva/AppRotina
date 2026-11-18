# Exclusão permanente de ideias — 18/11/2026

Implementação local na branch desenvolvimento. Nenhum commit, push, merge,
deploy ou migration remota executado. Production e Development remotos intactos.

## Mapeamento anterior à implementação

| Camada | Arquitetura encontrada |
| --- | --- |
| Listagem | app/ideias/page.tsx → readIdeas → repository.list → IdeaList |
| Detalhe/edição | app/ideias/[id]/page.tsx → readIdea → IdeaEditor |
| Criação | app/ideias/nova/page.tsx → IdeaEditor sem ideia inicial |
| Actions | createIdea/updateIdea em app/ideias/actions.ts; validação runtime, sessão verificada e revalidatePath |
| Sessão | ideaRepositoryForSession usa cliente SSR e auth.getClaims; owner vem da sessão, não do formulário |
| Repository | lib/ideas/repository.ts; acesso direto via Supabase/PostgREST, sem RPC |
| Concorrência | update usa igualdade exata de updated_at; conflito mantém o rascunho |
| Persistência | public.ideas: id, user_id, title, content, created_at, updated_at |

A migration 20261026000100 exige título de 1–200 caracteres após trim, conteúdo
até 100.000 caracteres, timestamps não nulos e FK user_id → auth.users com cascade
na exclusão da conta. guard_idea protege identidade/owner/criação e atualiza o
timestamp em INSERT/UPDATE. As policies permitem SELECT/INSERT/UPDATE do owner;
DELETE não era concedido. Não existe campo de status nem soft-delete.

Não há FK de outras tabelas para ideas na cadeia versionada. A única relação é
com a conta; Activities, Projetos, Finanças e ocorrências não dependem de uma ideia.
Isso foi confirmado também no catálogo do banco PGlite isolado com a cadeia completa.
Não foi consultado o catálogo de nenhum ambiente remoto nesta tarefa.

## Padrão de confirmação reutilizado

SubitemDefinitionEditor já usa window.confirm antes de exclusões, com texto de
impacto permanente; BillsSection usa confirmação nativa para desfazer pagamento.
Conta possui painel específico com frase digitada para apagar toda a conta.
Não há componente genérico de confirmação a reutilizar nesses fluxos. Foi usado
o padrão window.confirm e Button variant destructive existentes, sem criar dialog
ou componente duplicado. A exclusão aparece somente no detalhe, fora do form de
edição; não aparece na criação nem no card de listagem.

## Implementação e decisões

- deleteIdeaInput aceita somente id e expectedUpdatedAt, validando UUID/timestamp.
  Campos de owner e qualquer campo extra são rejeitados.
- deleteIdea verifica sessão pelo mesmo factory existente. Nenhum service role
  é usado; o cliente recebe apenas resultado ok ou mensagem segura.
- repository.delete executa DELETE com filtros id, user_id da sessão e updated_at
  do snapshot, retornando somente id para comprovar que houve exclusão.
- Sem linha removida: leitura restrita ao owner distingue conflito de snapshot
  de NotFound. ID estrangeiro e inexistente têm o mesmo resultado NotFound.
- Migration nova 20261118000200_idea_deletion.sql concede DELETE a authenticated
  e cria ideas_delete usando user_id=auth.uid(). Sem RPC, soft-delete, novas colunas,
  alteração de CHECKs ou edição de migrations anteriores.
- DELETE direto é suficiente porque não há efeitos entre módulos para coordenar.
  A policy protege também acesso direto ao banco com a sessão do usuário.
- Confirmação: “Excluir permanentemente esta ideia e todo o seu conteúdo? Esta
  ação não pode ser desfeita. Alterações não salvas também serão descartadas.”
- Cancelar não envia requisição, não muda o rascunho e não navega.
- Save e delete compartilham lock de requisição; botões/inputs ficam indisponíveis
  durante a operação. Sucesso invalida lista/detalhe e navega para /ideias somente
  após confirmação do backend, liberando a proteção de rascunho.
- Erros mantêm a tela e o texto. NotFound, conflito, autenticação e resultado de
  rede incerto possuem tratamento seguro; mensagens SQL não são expostas.
- Não há exigência de status “concluída/descartada”: esse campo não existe. O owner
  pode excluir qualquer ideia após confirmar a ação permanente.

## Validação automatizada

- tests/ideas.test.cjs cobre validação da action, revalidação somente em sucesso,
  cancelamento, ausência do botão na criação, confirmação, lock save/delete,
  redirecionamento /ideias e preservação do rascunho em falhas.
- tests/db/idea-deletion.test.mjs aplica o upgrade sobre o schema anterior e
  verifica exclusão física, listagem atualizada, CRUD preservado, ID inexistente,
  repetição, owner A/B, owner falsificado no repository, SQL direto, anon e CAS.
- Os testes originais de Ideias continuam cobrindo o schema anterior e o fluxo
  de criação/edição/listagem. O adapter PGlite recebeu somente suporte a DELETE.
- O smoke existente Next/Chrome foi estendido para criar/editar uma ideia,
  cancelar o dialog nativo, simular falha de persistência, confirmar exclusão,
  verificar redirecionamento/lista e revisitar o detalhe apagado. Usa API sintética
  localhost sobre PGlite com RLS real; nenhuma conta/banco remoto é acessado.

Resultados finais:

| Verificação | Resultado |
| --- | --- |
| npm.cmd test | 285/285 passaram |
| node --test --test-concurrency=2 tests/db/*.test.mjs | 166/166 passaram |
| npx.cmd tsc --noEmit | Passou |
| npm.cmd run lint | Passou |
| Lint direcionado ao runner após ajuste final | Passou |
| npm.cmd run build | Passou com Next 16.4.6/Turbopack, Cache Components e Partial Prefetching |
| node tests/next/render-time-smoke.mjs --v05-authenticated --webpack | Passou no smoke completo |
| git diff --check | Passou |

O smoke confirmou a edição persistida em detalhe recarregado antes de iniciar
um novo rascunho para testar a exclusão. Essa espera evita disputar com a
revalidação do snapshot pós-save. A primeira execução expôs essa corrida no
runner; o comportamento de edição da aplicação não foi alterado.

O erro XX000 registrado pela API sintética foi injetado intencionalmente para
verificar a falha de exclusão, e foi tratado pela UI com rascunho preservado.
A repetição confirmou remoção física, redirecionamento e detalhe indisponível.
O restante do smoke passou em nove rotas HTTP, prefetch RSC, viewports mobile/
tablet/desktop, checklist, quantity, sync, histórico e 20 ocorrências mistas.
Servidor/browser de teste encerrados e cópia temporária removida.

## Roteiro manual e backlog da entrega

- [x] Auditoria de rotas, persistência, constraints, dependências e confirmações.
- [x] Exclusão no detalhe com confirmação, mensagens seguras e CAS.
- [x] Policy/grant local de DELETE por owner e testes de isolamento.
- [x] TypeScript, lint, unitários, SQL/PGlite, build e smoke autenticado local.
- [ ] Revisar o dry-run e aplicar a migration em Development, quando autorizado.
  Conferir também outras migrations pendentes; não promover a lista cegamente.
- [ ] Validar manualmente em Development antes de qualquer promoção.
- [ ] Promover migration/código somente após autorização; nada publicado aqui.

Após aplicar a migration em ambiente autorizado:

1. Criar ideia com título e conteúdo, editar e salvar; confirmar a listagem.
2. No detalhe, clicar Excluir ideia e cancelar: ideia/rascunho devem permanecer.
3. Confirmar a exclusão: deve abrir /ideias sem o card; revisitar a URL antiga
   deve mostrar indisponibilidade. A exclusão é permanente.
4. Abrir a mesma ideia em duas abas; salvar uma edição em uma delas e tentar
   excluir pela outra: deve haver conflito, sem apagar a nova versão.
5. Em conta B, tentar acessar/excluir a ideia de A: indisponível e não removida.

## Arquivos e limites

- app/ideias/actions.ts
- components/ideas/IdeaEditor.tsx
- lib/ideas/contracts.ts, validation.ts e repository.ts
- supabase/migrations/20261118000200_idea_deletion.sql
- tests/ideas.test.cjs e tests/db/idea-deletion.test.mjs
- tests/helpers/pglite-client.mjs
- tests/next/v05-local-api.mjs e tests/next/v05-browser-smoke.mjs
- ../README.md e doc/MVP-ideias-exclusao.md

A migration deve preceder a disponibilização da UI no ambiente de destino;
sem ela, o banco não concede DELETE. Dependências documentadas são as da cadeia
versionada/local, não uma certificação do schema real de Production. Não há undo,
histórico ou recuperação de ideias excluídas nesta entrega.
