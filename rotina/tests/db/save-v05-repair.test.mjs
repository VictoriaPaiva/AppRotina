import {PGlite} from '@electric-sql/pglite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installSaveV05Repair,verifySaveV05Repair} from '../helpers/save-v05-repair.mjs';

test('02000200 CRLF partial patch reproduces 23514; explicit repair restores both modes, pre-save tokens, sync and ACLs',async()=>{
  const broken=new PGlite(),healthy=new PGlite();
  try {
    const installed=await installSaveV05Repair(broken);
    const reference=await installSaveV05Repair(healthy,{broken:false});
    assert.deepEqual(installed.catalog,reference.catalog,'same final contract from broken and healthy databases');
    await verifySaveV05Repair(broken,installed);
    await verifySaveV05Repair(healthy,reference);
  }finally{await broken.close();await healthy.close();}
});
