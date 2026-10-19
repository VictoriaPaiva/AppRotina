import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from '@/lib/supabase/configuration';
import { smokeAccessStatus } from '@/lib/auth/smoke-access';
import { parseRlsSmokeInput, runRlsSmoke } from '@/lib/banco-mestre/data/rls-smoke';
import { toPersistenceError, PersistenceError } from '@/lib/banco-mestre/data/errors';
import type { Database } from '@/lib/banco-mestre/data/database.types';

const headers={'Cache-Control':'private, no-store'};
export async function POST(request:NextRequest) {
  const access=smokeAccessStatus(process.env.NODE_ENV,request.method,request.headers.get('origin'),request.url);
  if(access) return NextResponse.json({ok:false},{status:access,headers});
  const config=getSupabasePublicConfig();
  if(!config) return NextResponse.json({ok:false},{status:503,headers});
  try {
    let body:unknown;
    try {body=await request.json();} catch {throw new PersistenceError('Validation');}
    const input=parseRlsSmokeInput(body);
    let result;
    if(input.mode==='anon') {
      // Fresh instance, no cookie adapter, storage, session, or Authorization override.
      const anon=createSupabaseClient<Database>(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      result=await runRlsSmoke(anon,null,input);
    } else {
      const client=await createClient();
      const {data,error}=await client.auth.getClaims();
      if(error || !data?.claims?.sub) return NextResponse.json({ok:false},{status:401,headers});
      result=await runRlsSmoke(client,String(data.claims.sub),input);
    }
    return NextResponse.json(result,{status:result.ok?200:409,headers});
  } catch(error) {
    const mapped=toPersistenceError(error);
    const status=mapped.kind==='Unauthorized'?401:mapped.kind==='Validation'?400:mapped.kind==='Conflict'?409:500;
    return NextResponse.json({ok:false,kind:mapped.kind},{status,headers});
  }
}
export async function GET() {
  return NextResponse.json({ok:false},{status:process.env.NODE_ENV==='development'?405:404,headers});
}
