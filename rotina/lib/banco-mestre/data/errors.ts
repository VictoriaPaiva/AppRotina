export type PersistenceErrorKind = 'Unauthorized' | 'NotFound' | 'Conflict' | 'Validation' | 'Unknown';
const messages: Record<PersistenceErrorKind, string> = {
  Unauthorized: 'Entre na sua conta para continuar.',
  NotFound: 'Este item não está disponível.',
  Conflict: 'Este item foi alterado em outra sessão. Recarregue os dados mais recentes antes de salvar novamente.',
  Validation: 'Revise os dados do item antes de continuar.',
  Unknown: 'Não foi possível concluir a operação. Tente novamente.',
};
/** message é segura para UI; cause guarda o diagnóstico técnico, sem logging automático. */
export class PersistenceError extends Error {
  readonly kind: PersistenceErrorKind;
  declare readonly cause: unknown;
  constructor(kind: PersistenceErrorKind, cause?: unknown) {
    super(messages[kind]);
    this.name = 'PersistenceError'; this.kind = kind;
    Object.defineProperty(this, 'cause', { value: cause, enumerable: false });
  }
}
export class MapperError extends Error {
  constructor(readonly field: string) { super('Invalid persistence field: ' + field); this.name = 'MapperError'; }
}
export function toPersistenceError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) return error;
  if (error instanceof MapperError) return new PersistenceError('Validation', error);
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'PT404') return new PersistenceError('NotFound', error);
  if (code === 'PT409') return new PersistenceError('Conflict', error);
  // Preserve the existing policy for genuine serialization failures and deadlocks.
  if (['40001','40P01'].includes(code)) return new PersistenceError('Conflict', error);
  if (['42501','PGRST301','PGRST302','PGRST303'].includes(code)) return new PersistenceError('Unauthorized', error);
  // PGRST116 também pode representar mais de uma linha: não tratar genericamente como NotFound.
  if (/^(22|23)/.test(code)) return new PersistenceError('Validation', error);
  return new PersistenceError('Unknown', error);
}
