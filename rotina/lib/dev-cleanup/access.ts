import { CLEANUP_PROJECT_REF } from './sql';
export function cleanupAccess(environment:string|undefined,enabled:string|undefined,origin:string|null,urlValue:string,publicUrl:string|undefined): number | null {
  if (environment!=='development' || enabled!=='true') return 404;
  try {
    const url=new URL(urlValue);
    if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || origin===null || new URL(origin).origin!==url.origin) return 403;
    if (publicUrl!==`https://${CLEANUP_PROJECT_REF}.supabase.co`) return 403;
    return null;
  } catch {return 403;}
}
