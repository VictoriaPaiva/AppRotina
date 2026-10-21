/** Guardas do endpoint técnico: não dependem de dados fornecidos pelo browser para autorizar sessão. */
export function smokeAccessStatus(environment: string | undefined, method: string, origin: string | null, requestUrl: string): number | null {
  if(environment !== 'development') return 404;
  if(method !== 'GET' && method !== 'POST') return 405;
  if(method === 'POST') {
    try {if(origin === null || new URL(origin).origin !== new URL(requestUrl).origin) return 403;}
    catch {return 403;}
  }
  return null;
}
