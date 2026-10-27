import { execFile } from 'node:child_process';
import { access,mkdtemp,readFile,writeFile,unlink,rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLEANUP_PROJECT_REF,CLEANUP_TABLES,cleanupSql,type CleanupSnapshot,type CleanupReport } from './sql';
import { CleanupError,type CleanupCategory } from './errors';

type Phase='preview'|'execute';
interface Diagnostic {phase:Phase;category:CleanupCategory|null;exitCode:number|string|null;signal:string|null;timeout:boolean;stdoutBytes:number;stderrBytes:number;jsonParseFailed:boolean;topLevelType:string;topKeys:string[]}
const safeKeys=new Set(['boundary','rows','warning','report','ok','data','result','error','message']);
function diagnostic(value:Diagnostic) {
  // Temporary local metadata only. Never log error.message, SQL, paths, arguments or output contents.
  if (process.env.NODE_ENV==='development') console.info('[dev-cleanup]',JSON.stringify(value));
}
function environmentAllowed(phase:Phase) {
  if (process.env.NODE_ENV!=='development' || process.env.DEV_DATA_CLEANUP_ENABLED!=='true'
    || process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://'+CLEANUP_PROJECT_REF+'.supabase.co'
    || (phase==='execute' && process.env.DEV_DATA_CLEANUP_ALLOW_EXECUTE!=='true')) throw new CleanupError('ENVIRONMENT_BLOCKED');
}
function rowsFromOutput(output:string,meta:Diagnostic):Record<string,unknown>[] {
  if (!output.trim()) throw new CleanupError('EMPTY_OUTPUT');
  let parsed:unknown;
  try {parsed=JSON.parse(output);} catch {meta.jsonParseFailed=true;throw new CleanupError('INVALID_JSON');}
  meta.topLevelType=Array.isArray(parsed)?'array':parsed===null?'null':typeof parsed;
  meta.topKeys=parsed && typeof parsed==='object' && !Array.isArray(parsed)?[...new Set(Object.keys(parsed).map(key=>safeKeys.has(key)?key:'[unknown-key]'))].slice(0,10):[];
  let rows:unknown;
  if (Array.isArray(parsed)) rows=parsed;
  else if (parsed && typeof parsed==='object') {
    const envelope=parsed as Record<string,unknown>;
    if (Object.keys(envelope).some(key=>!['boundary','rows','warning'].includes(key))
      || ('boundary' in envelope && typeof envelope.boundary!=='string') || ('warning' in envelope && typeof envelope.warning!=='string')) throw new CleanupError('INVALID_REPORT');
    rows=envelope.rows;
  }
  if (!Array.isArray(rows) || rows.length!==1 || !rows[0] || typeof rows[0]!=='object' || Array.isArray(rows[0])) throw new CleanupError('INVALID_REPORT');
  return rows as Record<string,unknown>[];
}
function processCategory(error:Error & {code?:number|string|null;signal?:string|null;killed?:boolean},stderr:string):CleanupCategory {
  if (error.code==='ENOENT' || /cannot find module|module_not_found/i.test(stderr)) return 'CLI_NOT_FOUND';
  if (error.killed && error.code!=='ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'CLI_TIMEOUT';
  if (/access token not provided|not logged in|not authenticated|unauthorized|invalid access token|please.+login|login.+first/i.test(stderr)) return 'CLI_NOT_AUTHENTICATED';
  if (/cannot find project ref|project.+not linked|have you run supabase link|no linked project/i.test(stderr)) return 'PROJECT_NOT_LINKED';
  return 'CLI_QUERY_FAILED';
}
async function queryCli(sql:string,phase:Phase):Promise<{rows:Record<string,unknown>[];meta:Diagnostic}> {
  const meta:Diagnostic={phase,category:null,exitCode:null,signal:null,timeout:false,stdoutBytes:0,stderrBytes:0,jsonParseFailed:false,topLevelType:'unparsed',topKeys:[]};
  let directory:string|undefined,file:string|undefined;
  try {
    environmentAllowed(phase);
    let linked:string;
    try {linked=(await readFile(join(process.cwd(),'supabase','.temp','project-ref'),'utf8')).trim();} catch {throw new CleanupError('PROJECT_NOT_LINKED');}
    if (linked!==CLEANUP_PROJECT_REF) throw new CleanupError('PROJECT_NOT_LINKED');
    const entry=join(process.cwd(),'node_modules','supabase','dist','supabase.js');
    try {await access(entry);} catch {throw new CleanupError('CLI_NOT_FOUND');}
    directory=await mkdtemp(join(tmpdir(),'rotina-cleanup-'));file=join(directory,'query.sql');
    await writeFile(file,sql,{encoding:'utf8',mode:0o600});
    const output=await new Promise<string>((resolve,reject)=>{
      // 2.120.0 requires --linked WITH --project-ref. Agent mode makes the JSON envelope deterministic.
      execFile(process.execPath,[entry,'db','query','--linked','--project-ref',CLEANUP_PROJECT_REF,'--file',file!,'--output','json','--agent','yes'],
        {cwd:process.cwd(),windowsHide:true,timeout:60000,maxBuffer:1024*1024,encoding:'utf8'},(error,stdout,stderr)=>{
          meta.exitCode=0;meta.stdoutBytes=Buffer.byteLength(stdout);meta.stderrBytes=Buffer.byteLength(stderr);
          if (error) {
            meta.exitCode=typeof error.code==='number'?error.code:['ENOENT','EACCES','EPERM','ERR_CHILD_PROCESS_STDIO_MAXBUFFER'].includes(String(error.code))?String(error.code):'OTHER';
            meta.signal=error.signal && /^SIG[A-Z0-9]{1,12}$/.test(error.signal)?error.signal:null;
            meta.timeout=!!error.killed && error.code!=='ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
            reject(new CleanupError(processCategory(error,stderr+'\n'+stdout)));return;
          }
          resolve(stdout);
        });
    });
    const rows=rowsFromOutput(output,meta);return {rows,meta};
  } catch (error) {
    const safe=error instanceof CleanupError?error:new CleanupError('CLI_QUERY_FAILED');meta.category=safe.category;diagnostic(meta);throw safe;
  } finally {
    if (file) await unlink(file).catch(()=>{});
    if (directory) await rmdir(directory).catch(()=>{});
  }
}
function validateReport(value:unknown,executed:boolean):CleanupReport {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new CleanupError('INVALID_REPORT');
  const report=value as CleanupReport;
  const keys=['counts','otherCounts','otherAccounts','ownerState','structure','accountPreserved','othersUnchanged','structureUnchanged','allZero','executed'];
  if (Object.keys(report).length!==keys.length || Object.keys(report).some(key=>!keys.includes(key))
    || !/^[a-f0-9]{32}$/.test(report.structure) || !Number.isSafeInteger(report.otherAccounts) || report.otherAccounts<0) throw new CleanupError('INVALID_REPORT');
  for (const field of ['counts','otherCounts','ownerState'] as const) {
    const record=report[field];
    if (!record || typeof record!=='object' || Array.isArray(record) || Object.keys(record).length!==CLEANUP_TABLES.length || Object.keys(record).some(key=>!CLEANUP_TABLES.includes(key as typeof CLEANUP_TABLES[number]))) throw new CleanupError('INVALID_REPORT');
  }
  for (const field of ['executed','accountPreserved','othersUnchanged','structureUnchanged','allZero'] as const) if (typeof report[field]!=='boolean') throw new CleanupError('INVALID_REPORT');
  for (const table of CLEANUP_TABLES) {
    const state=report.ownerState[table];
    if (!Number.isSafeInteger(report.counts[table]) || report.counts[table]<0 || !Number.isSafeInteger(report.otherCounts[table]) || report.otherCounts[table]<0
      || !state || state.count!==report.counts[table] || typeof state.digest!=='string' || !/^[a-f0-9]{32}$/.test(state.digest)) throw new CleanupError('INVALID_REPORT');
  }
  if (!report.accountPreserved || report.executed!==executed || report.allZero!==CLEANUP_TABLES.every(table=>report.counts[table]===0)
    || (executed && (!report.allZero || !report.othersUnchanged || !report.structureUnchanged))) throw new CleanupError('INVALID_REPORT');
  return report;
}
// Privileged local CLI transport. Actor still comes exclusively from the verified web session.
export async function runDevCleanup(verifiedActor:string,expected?:CleanupSnapshot):Promise<CleanupReport> {
  const phase=expected?'execute':'preview';environmentAllowed(phase);
  const {rows,meta}=await queryCli(cleanupSql(verifiedActor,expected),phase);
  try {
    if (Object.keys(rows[0]).length!==1 || !('report' in rows[0])) throw new CleanupError('INVALID_REPORT');
    const report=validateReport(rows[0].report,!!expected);diagnostic(meta);return report;
  } catch {
    meta.category='INVALID_REPORT';diagnostic(meta);
    throw new CleanupError('INVALID_REPORT');
  }
}
// Terminal-only, fixed READ ONLY probes. No actor selection and no cleanup SQL.
export async function runDevCleanupDiagnostics() {
  const firstQuery=await queryCli('SELECT 1 AS ok;','preview'),first=firstQuery.rows[0];diagnostic(firstQuery.meta);
  if (Object.keys(first).length!==1 || first.ok!==1) throw new CleanupError('INVALID_REPORT');
  const catalogQuery=await queryCli("begin read only;select count(*)::int as functional_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped);commit;",'preview');
  const catalog=catalogQuery.rows[0];diagnostic(catalogQuery.meta);
  if (Object.keys(catalog).length!==1 || catalog.functional_tables!==CLEANUP_TABLES.length) throw new CleanupError('INVALID_REPORT');
  return {selectOne:1,functionalTables:catalog.functional_tables};
}
