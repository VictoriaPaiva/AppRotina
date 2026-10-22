const mainRoutes=['/hoje','/planejamento','/calendario','/projetos','/banco-mestre','/ideias','/financas'];
export function requiresSession(path: string): boolean {
  return [...mainRoutes,'/protected'].some(root=>path === root || path.startsWith(root+'/'));
}
/** Não permite URL externa, query de token, barras escapadas ou redirect para callback. */
export function safeAuthRedirect(value: unknown, fallback = '/hoje'): string {
  if(typeof value !== 'string') return fallback;
  if(value === '/auth/update-password') return value;
  return /^\/(hoje|planejamento|calendario|projetos|banco-mestre|ideias|financas)(?:\/[A-Za-z0-9_-]+)*$/.test(value) ? value : fallback;
}
export function isEmailOtpType(value: unknown): value is 'email' | 'signup' | 'recovery' | 'invite' | 'email_change' {
  return typeof value === 'string' && ['email','signup','recovery','invite','email_change'].includes(value);
}
export function authErrorMessage(error: unknown): string {
  const code=typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  switch(code) {
    case 'user_not_found': case 'invalid_credentials': return 'E-mail ou senha incorretos.';
    case 'email_not_confirmed': return 'Confirme seu e-mail antes de entrar.';
    case 'session_expired': case 'session_not_found': case 'refresh_token_not_found': case 'refresh_token_already_used': return 'Sua sessão expirou. Entre novamente.';
    case 'weak_password': return 'Escolha uma senha mais forte.';
    case 'user_already_exists': case 'email_exists': return 'Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.';
    case 'over_request_rate_limit': case 'over_email_send_rate_limit': return 'Aguarde um pouco antes de tentar novamente.';
    case 'otp_expired': return 'Este link expirou. Solicite um novo link.';
    default: return 'Não foi possível concluir a solicitação. Tente novamente.';
  }
}
