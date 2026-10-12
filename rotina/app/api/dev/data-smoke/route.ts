import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabasePublicConfig } from '@/lib/supabase/configuration';
import { runRepositorySmoke } from '@/lib/banco-mestre/data/smoke';
import { smokeAccessStatus } from '@/lib/auth/smoke-access';
import { toPersistenceError } from '@/lib/banco-mestre/data/errors';

async function handle(request: NextRequest) {
  const access=smokeAccessStatus(process.env.NODE_ENV,request.method,request.headers.get('origin'),request.url);
  const headers={'Cache-Control':'private, no-store'};
  if(access) return NextResponse.json({ok:false}, {status:access,headers});
  if(!getSupabasePublicConfig()) return NextResponse.json({ok:false,message:'A conexão de autenticação não está disponível.'},{status:503,headers});
  try {
    const client=await createClient();
    const {data,error}=await client.auth.getClaims();
    if(error || !data?.claims?.sub) return NextResponse.json({ok:false,message:'Entre na sua conta para continuar.'},{status:401,headers});
    const actor=String(data.claims.sub);
    const report=await runRepositorySmoke(client,actor,request.method === 'POST' ? {write:true} : {write:false,activityId:request.nextUrl.searchParams.get('activityId') ?? undefined});
    return NextResponse.json({ok:true,...report},{headers});
  } catch(error) {
    const mapped=toPersistenceError(error);
    const status=mapped.kind==='Unauthorized'?401:mapped.kind==='Validation'?400:mapped.kind==='Conflict'?409:500;
    return NextResponse.json({ok:false,kind:mapped.kind,message:mapped.message},{status,headers});
  }
}
export const GET=handle;
export const POST=handle;
