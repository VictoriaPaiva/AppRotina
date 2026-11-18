import {PGlite} from '@electric-sql/pglite';
import {test} from 'node:test';
import {calendarStandaloneRegression} from '../helpers/calendar-standalone.mjs';
test('calendar avulsos: upgrade/history, real repository CRUD boundary, completion, chronology, sync isolation and RLS',async()=>{
  const db=new PGlite();try{await calendarStandaloneRegression(db);}finally{await db.close();}
});
