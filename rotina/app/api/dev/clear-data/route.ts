import { NextResponse,type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cleanupAccess } from '@/lib/dev-cleanup/access';
import { cleanupConfirmations } from '@/lib/dev-cleanup/confirmation';
import { runDevCleanup } from '@/lib/dev-cleanup/transport';
import { CLEANUP_PHRASE,type CleanupReport } from '@/lib/dev-cleanup/sql';
const headers={'Cache-Control':'private, no-store'};
function publicReport(report:CleanupReport) {
  return {counts:report.counts,otherCounts:report.otherCounts,otherAccounts:report.otherAccounts,
    accountPreserved:report.accountPreserved,othersUnchanged:report.othersUnchanged,structureUnchanged:report.structureUnchanged,allZero:report.allZero,executed:report.executed};
}
export async function POST(request:NextRequest) {
  const status=cleanupAccess(process.env.NODE_ENV,process.env.DEV_DATA_CLEANUP_ENABLED,request.headers.get('origin'),request.url,process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (status) return NextResponse.json({ok:false},{status,headers});
  try {
    const body=await request.json();
    if (!body || typeof body!=='object' || Array.isArray(body)
      || !['preview','execute'].includes(body.action)
      || Object.keys(body).some(key=>!(body.action==='preview'?['action']:['action','token','confirmation']).includes(key))) {
      return NextResponse.json({ok:false,message:'Pedido inválido. Não envie identificadores de conta.'},{status:400,headers});
    }
    const client=await createClient(),{data,error}=await client.auth.getUser();
    if (error || !data?.user?.id) return NextResponse.json({ok:false,message:'Entre na sua conta para continuar.'},{status:401,headers});
    const actor=data.user.id;
    if (body.action==='preview') {
      const report=await runDevCleanup(actor);
      const preview=cleanupConfirmations.issue(actor,{counts:report.counts,ownerState:report.ownerState,structure:report.structure});
      return NextResponse.json({ok:true,...publicReport(report),...preview,email:data.user.email??'(conta autenticada)',canExecute:process.env.DEV_DATA_CLEANUP_ALLOW_EXECUTE==='true'},{headers});
    }
    if (process.env.DEV_DATA_CLEANUP_ALLOW_EXECUTE!=='true') return NextResponse.json({ok:false,message:'Execução bloqueada. A limpeza real ainda não foi autorizada neste ambiente.'},{status:403,headers});
    if (typeof body.token!=='string' || body.confirmation!==CLEANUP_PHRASE) return NextResponse.json({ok:false,message:'Confirme a frase e gere uma prévia válida.'},{status:400,headers});
    let expected;
    try {expected=cleanupConfirmations.consume(actor,body.token);} catch {return NextResponse.json({ok:false,message:'Prévia expirada, já utilizada ou de outra sessão. Gere outra prévia.'},{status:409,headers});}
    const report=await runDevCleanup(actor,expected);
    const session=await client.auth.getUser().catch(()=>null);
    return NextResponse.json({ok:true,...publicReport(report),sessionVerified:!session?.error && session?.data?.user?.id===actor},{headers});
  } catch {
    // Do not expose CLI output, SQL, tokens, hashes, account rows or cached developer credentials.
    return NextResponse.json({ok:false,message:'Não foi possível confirmar a operação. Nenhuma nova tentativa será automática. Gere uma nova prévia; se houve perda de conexão após a confirmação, ela mostrará o estado atual.'},{status:500,headers});
  }
}
