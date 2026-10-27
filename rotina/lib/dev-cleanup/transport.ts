import { execFile } from 'node:child_process';
import { mkdtemp,writeFile,unlink,rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLEANUP_PROJECT_REF,CLEANUP_TABLES,cleanupSql,type CleanupSnapshot,type CleanupReport } from './sql';

// Privileged local CLI transport, NOT a browser/service-role Supabase client.
// The API verifies the current web session before supplying the actor to cleanupSql.
export async function runDevCleanup(verifiedActor:string,expected?:CleanupSnapshot):Promise<CleanupReport> {
  if (process.env.NODE_ENV!=='development' || process.env.DEV_DATA_CLEANUP_ENABLED!=='true'
    || process.env.NEXT_PUBLIC_SUPABASE_URL!==`https://${CLEANUP_PROJECT_REF}.supabase.co`
    || (expected && process.env.DEV_DATA_CLEANUP_ALLOW_EXECUTE!=='true')) throw Error('Cleanup disabled');
  const sql=cleanupSql(verifiedActor,expected),directory=await mkdtemp(join(tmpdir(),'rotina-cleanup-')),file=join(directory,'query.sql');
  try {
    await writeFile(file,sql,{encoding:'utf8',mode:0o600});
    const entry=join(process.cwd(),'node_modules','supabase','dist','supabase.js');
    const output=await new Promise<string>((resolve,reject)=>{
      execFile(process.execPath,[entry,'db','query','--project-ref',CLEANUP_PROJECT_REF,'--file',file,'--output','json'],
        {cwd:process.cwd(),windowsHide:true,timeout:60000,maxBuffer:1024*1024},(error,stdout)=>{
          if (error) {reject(Error('Não foi possível confirmar a consulta. Gere uma nova prévia antes de qualquer nova tentativa.'));return;}
          resolve(stdout);
        });
    });
    const response=JSON.parse(output),report=response?.rows?.[0]?.report as CleanupReport;
    if (!report || typeof report.executed!=='boolean' || !report.accountPreserved || typeof report.structure!=='string') throw Error('Invalid cleanup report');
    for (const table of CLEANUP_TABLES) {
      if (!Number.isSafeInteger(report.counts?.[table]) || report.counts[table]<0 || !Number.isSafeInteger(report.otherCounts?.[table])
        || typeof report.ownerState?.[table]?.digest!=='string') throw Error('Invalid counts');
    }
    if (report.executed!==!!expected || (expected && (!report.allZero || !report.othersUnchanged || !report.structureUnchanged))) throw Error('Cleanup not verified');
    return report;
  } finally {
    // Only the two paths returned by this invocation's mkdtemp; no recursive deletion.
    await unlink(file).catch(()=>{}); await rmdir(directory).catch(()=>{});
  }
}
