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
/** Only allowlisted technical metadata: never log payloads, SQL messages,
 * details, hints, credentials, account IDs or the original Error object. */
export function saveFailureDiagnostic(error:unknown) {
  let cause=error;
  for(let depth=0;depth<5&&cause instanceof PersistenceError&&cause.cause;depth++)cause=cause.cause;
  const rawCode=typeof cause==='object'&&cause!==null&&'code' in cause?String(cause.code):'';
  const code=/^(?:[A-Z0-9]{5}|PGRST\d{3}|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(rawCode)?rawCode:undefined;
  const missingRpc=code==='PGRST202'||code==='42883';
  const category=missingRpc||code?.startsWith('PGRST20')?'rpc'
    :['PT409','40001','40P01'].includes(code??'')?'conflict'
    :code==='42501'?'permission'
    :code?.startsWith('PGRST30')?'authentication'
    :code?.startsWith('23')?'constraint'
    :cause instanceof MapperError||code?.startsWith('22')?'validation'
    :code?.startsWith('ECONN')||code==='ETIMEDOUT'||(cause instanceof TypeError&&cause.message==='fetch failed')?'network'
    :'unexpected';
  const field=cause instanceof MapperError&&/^[A-Za-z0-9_.\[\]]{1,80}$/.test(cause.field)?cause.field:undefined;
  return {category,...(code?{code}:{}),...(field?{field}:{}),missingRpc};
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
