export const DELETE_ACCOUNT_PHRASE = 'EXCLUIR MINHA CONTA';
export type DeletionCategory = 'INVALID_CONFIRMATION' | 'UNAUTHORIZED' | 'UNAVAILABLE' | 'NETWORK_ERROR' | 'DELETE_FAILED' | 'RESULT_UNCONFIRMED';
export type DeletionResult = {ok:true;alreadyDeleted:boolean} | {ok:false;category:DeletionCategory};

export function validDeletionInput(value:unknown):boolean {
  return !!value && typeof value==='object' && !Array.isArray(value)
    && Object.keys(value).length===1
    && (value as Record<string,unknown>).confirmation===DELETE_ACCOUNT_PHRASE;
}
export function deletionMessage(category:DeletionCategory):string {
  switch(category) {
    case 'INVALID_CONFIRMATION': return 'Digite exatamente EXCLUIR MINHA CONTA para confirmar.';
    case 'UNAUTHORIZED': return 'Sua sessão expirou. Entre novamente antes de excluir sua conta.';
    case 'UNAVAILABLE': return 'A exclusão de conta está indisponível neste momento. Tente mais tarde.';
    case 'NETWORK_ERROR': return 'Falha de conexão. Não foi possível confirmar a exclusão. Tente novamente para verificar o resultado.';
    case 'RESULT_UNCONFIRMED': return 'Não foi possível confirmar o resultado. Tente novamente para verificar se a conta já foi excluída.';
    default: return 'Não foi possível excluir sua conta. Ela continua disponível; tente novamente.';
  }
}
