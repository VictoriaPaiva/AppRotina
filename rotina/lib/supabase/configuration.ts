/** Somente configuração pública; nunca retorna valores em mensagens de erro. */
export function parseSupabasePublicConfig(urlValue: unknown, keyValue: unknown): { url: string; key: string } | null {
  if(typeof urlValue !== 'string' || typeof keyValue !== 'string') return null;
  try {
    const url=new URL(urlValue);
    if(url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if(url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) return null;
    let publicKey=/^sb_publishable_[A-Za-z0-9_-]+$/.test(keyValue);
    if(!publicKey && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(keyValue)) {
      // Classifica apenas a chave de API legada. A sessão é verificada com getClaims.
      const payload=JSON.parse(atob(keyValue.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      publicKey=payload !== null && typeof payload === 'object' && payload.role === 'anon';
    }
    return publicKey ? {url:url.origin,key:keyValue} : null;
  } catch {return null;}
}
export function getSupabasePublicConfig() {
  return parseSupabasePublicConfig(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export function requireSupabasePublicConfig() {
  const config=getSupabasePublicConfig();
  if(!config) throw new Error('A conexão de autenticação não está disponível neste ambiente.');
  return config;
}
