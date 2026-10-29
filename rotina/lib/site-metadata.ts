/** Public metadata only. Auth keeps using the actual browser origin, not a fixed host. */
export function siteMetadataBase(): URL | undefined {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const value = process.env.NEXT_PUBLIC_SITE_URL || (host ? `https://${host}` : undefined);
  if (!value) {
    if (process.env.VERCEL_ENV === 'production') throw new Error('Configure uma origem pública válida para os metadados do site.');
    return undefined;
  }
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw Error();
    if (process.env.VERCEL_ENV === 'production' && (local || url.protocol !== 'https:')) throw Error();
    return url;
  } catch { throw new Error('Configure uma origem pública válida para os metadados do site.'); }
}
