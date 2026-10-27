import { NextResponse,type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cleanupAccess } from '@/lib/dev-cleanup/access';
import { cleanupConfirmations } from '@/lib/dev-cleanup/confirmation';
import { runDevCleanup } from '@/lib/dev-cleanup/transport';
import { CLEANUP_PHRASE,type CleanupReport } from '@/lib/dev-cleanup/sql';
import { CleanupError,cleanupCategory,PREVIEW_FAILURE,EXECUTE_UNCERTAIN,type CleanupCategory } from '@/lib/dev-cleanup/errors';
const headers={'Cache-Control':'private, no-store'};
function publicReport(report:CleanupReport) {
  return {counts:report.counts,otherCounts:report.otherCounts,otherAccounts:report.otherAccounts,
    accountPreserved:report.accountPreserved,othersUnchanged:report.othersUnchanged,structureUnchanged:report.structureUnchanged,allZero:report.allZero,executed:report.executed};
}
function failure(action:'preview'|'execute',category:CleanupCategory,status:number,resultUncertain=false) {
  return NextResponse.json({ok:false,category,resultUncertain,
    message:action==='preview'?PREVIEW_FAILURE:resultUncertain?EXECUTE_UNCERTAIN:'Não foi possível iniciar a limpeza. A execução não foi enviada.'},{status,headers});
}
function unauthorized(error:unknown) {
  if (!error || typeof error!=='object') return false;
  const value=error as {status?:number;code?:string;name?:string};
  return value.status===401 || value.status===403 || value.name==='AuthSessionMissingError'
    || ['bad_jwt','session_not_found','session_expired','refresh_token_not_found','refresh_token_already_used','user_not_found'].includes(value.code??'');
}
export async function POST(request:NextRequest) {
  const status=cleanupAccess(process.env.NODE_ENV,process.env.DEV_DATA_CLEANUP_ENABLED,request.headers.get('origin'),request.url,process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (status) return failure('preview','ENVIRONMENT_BLOCKED',status);
  let action:'preview'|'execute'='preview',executionSent=false;
  try {
    let body;
    try {body=await request.json();} catch {return failure('preview','INVALID_REQUEST',400);}
    if (!body || typeof body!=='object' || Array.isArray(body)
      || !['preview','execute'].includes(body.action)
      || Object.keys(body).some(key=>!(body.action==='preview'?['action']:['action','token','confirmation']).includes(key))) {
      return failure('preview','INVALID_REQUEST',400);
    }
    action=body.action;
    const client=await createClient(),{data,error}=await client.auth.getUser();
    if (error) return failure(action,unauthorized(error)?'UNAUTHORIZED':'SESSION_CHECK_FAILED',unauthorized(error)?401:503);
    if (!data?.user?.id) return failure(action,'UNAUTHORIZED',401);
    const actor=data.user.id;
    if (body.action==='preview') {
      const report=await runDevCleanup(actor);
      const preview=cleanupConfirmations.issue(actor,{counts:report.counts,ownerState:report.ownerState,structure:report.structure});
      return NextResponse.json({ok:true,...publicReport(report),...preview,email:data.user.email??'(conta autenticada)',canExecute:process.env.DEV_DATA_CLEANUP_ALLOW_EXECUTE==='true'},{headers});
    }
    if (process.env.DEV_DATA_CLEANUP_ALLOW_EXECUTE!=='true') return failure('execute','ENVIRONMENT_BLOCKED',403);
    if (typeof body.token!=='string' || body.confirmation!==CLEANUP_PHRASE) return failure('execute','INVALID_REQUEST',400);
    let expected;
    try {expected=cleanupConfirmations.consume(actor,body.token);} catch {return failure('execute','PREVIEW_EXPIRED',409);}
    executionSent=true;
    const report=await runDevCleanup(actor,expected);
    const session=await client.auth.getUser().catch(()=>null);
    return NextResponse.json({ok:true,...publicReport(report),sessionVerified:!session?.error && session?.data?.user?.id===actor},{headers});
  } catch (error) {
    // Do not expose CLI output, SQL, tokens, hashes, account rows or cached developer credentials.
    return failure(action,error instanceof CleanupError?cleanupCategory(error):'CLI_QUERY_FAILED',500,action==='execute' && executionSent);
  }
}
