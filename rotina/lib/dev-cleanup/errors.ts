export const CLEANUP_CATEGORIES = ['CLI_NOT_FOUND','CLI_NOT_AUTHENTICATED','PROJECT_NOT_LINKED','CLI_QUERY_FAILED','CLI_TIMEOUT','EMPTY_OUTPUT','INVALID_JSON','INVALID_REPORT','UNAUTHORIZED','ENVIRONMENT_BLOCKED','INVALID_REQUEST','PREVIEW_EXPIRED','SESSION_CHECK_FAILED'] as const;
export type CleanupCategory = typeof CLEANUP_CATEGORIES[number];
export class CleanupError extends Error {
  constructor(readonly category:CleanupCategory) {super(category);this.name='CleanupError';}
}
export function cleanupCategory(error:unknown):CleanupCategory {
  return error instanceof CleanupError ? error.category : 'CLI_QUERY_FAILED';
}
export const PREVIEW_FAILURE='Não foi possível gerar a prévia. Nenhum dado foi alterado.';
export const EXECUTE_UNCERTAIN='Não foi possível confirmar o resultado da limpeza. Não repita o envio; gere uma nova prévia para consultar o estado atual.';
export const CLEANUP_GUIDANCE:Record<CleanupCategory,string> = {
  CLI_NOT_FOUND:'Confira a instalação local do Supabase CLI nas dependências do projeto.',
  CLI_NOT_AUTHENTICATED:'Autentique o Supabase CLI no terminal local. Não é necessário refazer o login do app.',
  PROJECT_NOT_LINKED:'Confira o vínculo local do CLI com o projeto de desenvolvimento autorizado.',
  CLI_QUERY_FAILED:'Confira o diagnóstico seguro no terminal do servidor e a conexão com o projeto.',
  CLI_TIMEOUT:'A consulta excedeu o tempo permitido. Confira a conexão antes de tentar novamente.',
  EMPTY_OUTPUT:'O CLI não retornou dados. Confira o diagnóstico seguro no servidor.',
  INVALID_JSON:'A saída do CLI não veio em JSON válido. Confira versão e formato no servidor.',
  INVALID_REPORT:'A resposta não corresponde ao relatório esperado. Confira o diagnóstico seguro no servidor.',
  UNAUTHORIZED:'Sua sessão não está disponível. Entre novamente em outra aba.',
  ENVIRONMENT_BLOCKED:'A ferramenta só funciona no desenvolvimento local autorizado. A execução real continua sujeita ao bloqueio local.',
  INVALID_REQUEST:'Pedido inválido. Gere uma nova prévia pela página de desenvolvimento.',
  PREVIEW_EXPIRED:'A prévia expirou, foi utilizada ou pertence a outra sessão. Gere uma nova prévia.',
  SESSION_CHECK_FAILED:'Não foi possível verificar a sessão pela rede. Confira a conexão e tente novamente.',
};
