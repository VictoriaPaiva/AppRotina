# Auditoria preventiva dos fluxos de criação — 31/10/2026

Auditoria local, sem deploy, acesso ou escrita em Production. Classificação feita
pela leitura de rotas, componentes, actions e fronteiras de persistência, comparada
com a documentação instalada do Next.js 16.4.3. `cacheComponents: true` mantém
rotas ocultas com React Activity: estado e refs sobrevivem; os efeitos são limpos
ao ocultar e recriados ao exibir. Não basta chamar `router.refresh()` para limpar
estado client sem uma mudança de identidade do componente.

A = reproduzido em teste local de ciclo de vida; B = plausível, sem reprodução
completa do fluxo real; C = sem risco aparente dessa classe no código atual.
Os testes simulam ocultação/exibição mantendo os mesmos slots de hooks e refs;
não constituem smoke autenticado de navegador.

| Fluxo | Classe antes desta auditoria | Evidência e decisão |
| --- | --- | --- |
| Finanças: nova transação (`/financas/nova`, com/sem `month`) | A | `saved`, campos, `attemptId`, `navigating` e sucesso sobreviviam à ocultação. Teste falhou antes da correção e passou depois. Corrigido. |
| Finanças: nova conta fixa (`/financas/contas/nova`) | A | Mesmo padrão. Retornava como edição com fieldset bloqueado e ID anterior. Reproduzido antes da correção; corrigido. |
| Banco Mestre: criar área, inclusive primeira área e retorno ao cadastro | A | `AreaCreateForm` sem key variável conserva `saved`, `completed`, nome e ID. Refresh da lista mantém o formulário; só “Criar outra área” limpava. Reproduzido antes da correção; corrigido. |
| Planejamento: adicionar/planejar, inclusive entrada via Banco Mestre | B | `confirmed`, `busy`, `result` e `attempt` dependem de remount após sucesso. `PlanPageContent` usa key com data, itens/updatedAt, pendências e atividades; inclusão confirmada muda a key no SSR seguinte (testado). Sem reprodução de reabertura obsoleta no fluxo completo; não alterado. Risco residual se a atualização SSR não concluir antes de sair/voltar. |
| Hoje: mesmo `PlanningBoard` | B | Não oferece criação no modo Hoje, mas compartilha os bloqueios e o remount por snapshot nas operações de conclusão/reagendamento. Mesmo teste manual recomendado; não alterado. |
| Projetos: adicionar tarefas/subtarefas (`ProjectTasks`) | B, apenas feedback | Após confirmação já limpa título e `attemptId`; não guarda a tarefa como identidade do formulário novo. `success` pode sobreviver ao ocultar. Sem evidência de criação antiga reabrindo ou ID reutilizado; não alterado. Tarefa existente é atualizada por `TaskRow` com snapshot. Não há editor separado de subtarefa persistente. |
| Banco Mestre: nova atividade (`ActivityForm`) | C | Correção anterior limpa criação concluída no cleanup; edição tem key por ID/revision. Regressões existentes preservadas. |
| Projetos: novo projeto (`ProjectEditor`) | C | Correção anterior limpa somente criação concluída; não altera edição. |
| Ideias: nova ideia (`IdeaEditor`) | C | Correção anterior limpa somente criação concluída; edição identificada por ID/updatedAt. |
| Finanças: inicialização mensal de contas fixas | C | Inicialização server/RPC por referência, sem editor client “novo” nem ID de criação em estado React. Não alterada; idempotência e regras de geração existentes preservadas. |
| Finanças: pagamento/desfazer e valor mensal (`BillRow`) | C | Edição do mês existente com snapshot confirmado; despesa vinculada é gerenciada pelo servidor. Não é formulário de nova transação e não reaproveita identidade de cadastro novo. Não alterado. |
| Calendário | C | Consulta server e links para planejamento, sem formulário local de criação. |
| Cadastro de conta de acesso (`sign-up-form`) — adicional ao escopo funcional | B | Após sucesso navega e atualiza, sem ID/saved de entidade; campos locais de credenciais podem sobreviver no cache da rota. Sem smoke de cadastro autenticado nesta auditoria, não alterado. Recomenda-se validar retorno ao formulário após cadastro com/sem sessão e limpeza de credenciais em tarefa própria. |
| Componentes UI, providers e navegação compartilhados | C | Input/Button/Card não guardam resultados de persistência; BancoMestreProvider fornece leitura, não criação local. Links de criação apontam às rotas novas; nenhum query param ou redirect das actions auditadas injeta o último ID salvo. |

## Correções pontuais

`TransactionEditor`, `FixedExpenseEditor` e `AreaCreateForm` agora usam cleanup de
`useLayoutEffect` para retirar uma criação **confirmada** ao ocultar. A condição é
o marcador de confirmação existente (`navigating` ou `completed`), não apenas
um campo preenchido ou uma tentativa iniciada. O sucesso continua visível até sair.

São limpos resultado salvo, UUID da tentativa, bloqueios, erros, sucesso e campos.
Transação restaura tipo despesa e `initialDate` fornecida pela rota (mês selecionado
ou dia normal); conta fixa restaura dia 1, categoria “Contas fixas” e ativa; área
restaura nome vazio. Defaults úteis são preservados, não substituídos por vazios.

Editores com entidade inicial não são limpos. Tentativas com falha ou resposta
incerta conservam texto e UUID para consulta/repetição segura. Não houve alteração
de actions, regras de negócio, schema, migrations, RLS, dados, estilos ou layouts.
Não foi introduzido reload forçado nem mecanismo global de reset.

## Testes e limites

`tests/creation-lifecycle.test.cjs`: para cada um dos três fluxos corrigidos,
criar A, manter confirmação visível, ocultar/exibir a mesma instância, conferir
defaults e ausência de feedback antigo, criar B com outro ID, preservar A e
não gravar/navegar automaticamente. Também cobre rascunhos e tentativa incerta
com UUID estável, edição financeira com snapshot confirmado, rascunho de renomeação
de área e mudança da key SSR do planejamento após inclusão.

Os harnesses de finance/bills/area-ui foram adaptados ao novo hook; seus testes
existentes continuam cobrindo edição, conflitos, sessão, cliques duplicados,
“Criar outra área”, primeiro uso e retorno para novo item.

Smoke autenticado manual ainda necessário (desktop e mobile):

- Transação A → detalhe → Finanças → novo lançamento, e entrada com mês diferente;
  conferir defaults, criar B e verificar A intacta. Repetir via URL direta.
- Conta fixa A → Finanças → nova conta fixa → B; conferir estado ativo, dia/categoria
  padrão e preservação dos meses/pagamentos existentes.
- Área A → novo item/Banco Mestre → gerenciar áreas → área B; repetir primeira área,
  botão “Criar outra área”, renomeação e cancelamento da saída com rascunho.
- Planejamento: criar A em data atual e outra data; voltar por link e histórico,
  inclusive entrada `?activity=...`. Interromper atualização SSR depois de confirmar
  a gravação, sair e voltar: verificar se locks/resultado antigos sobrevivem.
  Não repetir uma tentativa incerta sem consultar antes o item salvo.
- Tarefas: criar A → sair/voltar ao projeto → título vazio → criar B; observar
  mensagem de sucesso antiga. Repetir com rascunho e edição existente.
- Cadastro Auth: retorno ao formulário após sucesso com confirmação por e-mail e
  sessão imediata; usar ambiente de teste autorizado, não Production.

## Validação local

- Testes relevantes: 70/70 passaram.
- Suíte unitária completa (`npm.cmd test`): 222/222 passaram, incluindo dez novos
  testes neste trabalho. Os três casos A falharam antes das correções e passaram depois.
- Lint (`npm.cmd run lint`): passou.
- TypeScript (`npx.cmd tsc --noEmit`): passou.
- Build (`npm.cmd run build`): passou; aviso de `metadataBase` ausente permanece.
- `git diff --check`: passou.

Arquivos alterados: `components/finance/TransactionEditor.tsx`,
`components/finance/FixedExpenseEditor.tsx`,
`components/banco-mestre/AreaManagement.tsx`, `tests/finance.test.cjs`,
`tests/bills.test.cjs`, `tests/area-ui.test.cjs`; adicionados
`tests/creation-lifecycle.test.cjs` e este relatório.
