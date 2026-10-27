import { randomUUID } from 'node:crypto';
import type { CleanupSnapshot } from './sql';

// Ephemeral, single-use confirmations. A restart deliberately invalidates pending previews.
export function createCleanupConfirmations() {
  const pending = new Map<string,{actor:string; snapshot:CleanupSnapshot; expires:number}>();
  return {
    issue(actor:string,snapshot:CleanupSnapshot,now=Date.now()) {
      for (const [key,value] of pending) if (value.expires<=now || value.actor===actor) pending.delete(key);
      if (pending.size>=100) throw Error('Too many previews');
      const token=randomUUID(),expires=now+10*60*1000;
      pending.set(token,{actor,snapshot,expires}); return {token,expires};
    },
    consume(actor:string,token:string,now=Date.now()) {
      const record=pending.get(token);
      if (!record || record.actor!==actor || record.expires<=now) throw Error('Invalid preview');
      pending.delete(token); return record.snapshot;
    },
  };
}
export const cleanupConfirmations=createCleanupConfirmations();
