import type { DeletionResult } from './contract';

// Narrow interfaces: there is no table client and no API for selecting a target.
type AuthError = {code?:string;status?:number;name?:string};
type UserResponse = {data:{user:{id:string}|null};error:AuthError|null};
export interface DeletionSession {
  getClaims():Promise<{data:{claims:{sub?:string}}|null;error:AuthError|null}>;
  getUser():Promise<UserResponse>;
}
export interface AccountAdmin {
  deleteUser(id:string,softDelete:boolean):Promise<UserResponse>;
  getUserById(id:string):Promise<UserResponse>;
}
function missing(error:AuthError|null) {return error?.code==='user_not_found' && error.status===404;}
function network(error:AuthError|null) {return error?.name==='AuthRetryableFetchError' || error?.status===0;}

export async function deleteCurrentAccount(session:DeletionSession,adminFactory:()=>AccountAdmin):Promise<DeletionResult> {
  let actor:string;
  try {
    // A cryptographically verified subject also lets a retry check its OWN deleted account.
    const claims=await session.getClaims();
    if(claims.error || !claims.data?.claims.sub) return {ok:false,category:network(claims.error)?'NETWORK_ERROR':'UNAUTHORIZED'};
    actor=claims.data.claims.sub;
  } catch {return {ok:false,category:'NETWORK_ERROR'};}
  let admin:AccountAdmin;
  try {admin=adminFactory();} catch {return {ok:false,category:'UNAVAILABLE'};}
  async function reconcile(uncertain=false):Promise<DeletionResult> {
    try {
      const result=await admin.getUserById(actor);
      if(missing(result.error)) return {ok:true,alreadyDeleted:true};
      if(!result.error && result.data.user?.id===actor) return {ok:false,category:uncertain?'RESULT_UNCONFIRMED':'DELETE_FAILED'};
    } catch { /* No success without confirmation from Auth. */ }
    return {ok:false,category:'RESULT_UNCONFIRMED'};
  }
  // Online Auth check immediately before deletion; getClaims alone is insufficient.
  try {
    const current=await session.getUser();
    if(current.error || current.data.user?.id!==actor) {
      if(network(current.error) || (current.error?.status ?? 0)>=500) return {ok:false,category:'NETWORK_ERROR'};
      // Expired/revoked sessions cannot initiate deletion. Only a missing user may reconcile.
      return current.error?.code==='user_not_found' ? reconcile() : {ok:false,category:'UNAUTHORIZED'};
    }
  } catch {return {ok:false,category:'NETWORK_ERROR'};}
  try {
    // Hard delete. Auth and functional FK cascades commit or roll back together.
    const result=await admin.deleteUser(actor,false);
    // Successful hard-delete confirms commit, even with Auth's empty response body.
    // Do not turn a subsequent lookup/logout outage into failure after confirmed deletion.
    if(!result.error) return {ok:true,alreadyDeleted:false};
    return reconcile(network(result.error) || (result.error?.status ?? 0)>=500);
  } catch {return reconcile(true);}
}
