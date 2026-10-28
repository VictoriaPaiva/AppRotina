import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireSupabasePublicConfig } from '@/lib/supabase/configuration';
import { createClient } from '@/lib/supabase/server';
import { createAccountAdmin } from '@/lib/account-deletion/admin';
import { deleteCurrentAccount } from '@/lib/account-deletion/delete-account';
import { validDeletionInput } from '@/lib/account-deletion/contract';

function reply(body:unknown,status:number) {
  return NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request) {
  // Cookie authentication requires same-origin POST; no GET, target ID or URL parameters.
  const origin=request.headers.get('origin');
  let sameOrigin=false;
  try {
    const source=new URL(origin!);
    const protocol=request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || new URL(request.url).protocol.slice(0,-1);
    // Next can normalize request.url to localhost; Host retains the actual browser authority.
    sameOrigin=origin===source.origin && source.host===request.headers.get('host') && source.protocol===protocol+':';
  } catch { /* Missing or malformed Origin fails closed. */ }
  if(!sameOrigin || new URL(request.url).search)
    return reply({ok:false,category:'UNAUTHORIZED'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))
    return reply({ok:false,category:'INVALID_CONFIRMATION'},400);
  try {
    const text=await request.text();
    if(text.length>256 || !validDeletionInput(JSON.parse(text))) return reply({ok:false,category:'INVALID_CONFIRMATION'},400);
  } catch {return reply({ok:false,category:'INVALID_CONFIRMATION'},400);}
  try {
    const client=await createClient();
    const result=await deleteCurrentAccount(client.auth,createAccountAdmin);
    if(!result.ok) return reply(result,result.category==='UNAUTHORIZED'?401:503);
    // SSR removes cookies even if the deleted session is no longer accepted by Auth.
    await client.auth.signOut({scope:'local'}).catch(()=>{});
    // A network failure during signOut must not retain SSR credentials after confirmed deletion.
    try {
      const store=await cookies();
      const prefix='sb-'+new URL(requireSupabasePublicConfig().url).hostname.split('.')[0]+'-auth-token';
      for(const cookie of store.getAll()) {
        if(cookie.name===prefix || cookie.name.startsWith(prefix+'.') || cookie.name.startsWith(prefix+'-'))
          store.set(cookie.name,'',{path:'/',maxAge:0,sameSite:'lax'});
      }
    } catch { /* The Auth deletion is confirmed; never turn it into a false failure. */ }
    return reply(result,200);
  } catch {return reply({ok:false,category:'NETWORK_ERROR'},503);}
}
