import type { Database } from '@/lib/banco-mestre/data/database.types';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicConfig } from './configuration';
import { requiresSession } from '@/lib/auth/policy';

export async function updateSession(request: NextRequest) {
  let response=NextResponse.next({request});
  const protectedRoute=requiresSession(request.nextUrl.pathname);
  const config=getSupabasePublicConfig();
  function loginRedirect() {
    const url=request.nextUrl.clone();url.pathname='/auth/login';url.search='';
    const redirect=NextResponse.redirect(url);
    for(const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for(const name of ['cache-control','expires','pragma']) {
      const value=response.headers.get(name);if(value) redirect.headers.set(name,value);
    }
    redirect.headers.set('Cache-Control','private, no-store');
    return redirect;
  }
  // Falha fechada para rotas principais, mesmo sem configuração; callbacks continuam públicos.
  if(!config) return protectedRoute ? loginRedirect() : response;
  const supabase=createServerClient<Database>(config.url,config.key,{
    cookies:{getAll:()=>request.cookies.getAll(),setAll(cookiesToSet,headers){
      for(const {name,value} of cookiesToSet) request.cookies.set(name,value);
      const previous=response;
      response=NextResponse.next({request});
      for(const cookie of previous.cookies.getAll()) response.cookies.set(cookie);
      for(const name of ['cache-control','expires','pragma']) {
        const value=previous.headers.get(name);if(value) response.headers.set(name,value);
      }
      for(const {name,value,options} of cookiesToSet) response.cookies.set(name,value,options);
      for(const [name,value] of Object.entries(headers)) response.headers.set(name,value);
      response.headers.set('Cache-Control','private, no-store');
    }},
  });
  // Mantém a verificação imediatamente após criar o cliente, como no starter SSR.
  try {
    const {data,error}=await supabase.auth.getClaims();
    if(protectedRoute && (error || !data?.claims?.sub)) return loginRedirect();
  } catch {
    if(protectedRoute) return loginRedirect();
  }
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
