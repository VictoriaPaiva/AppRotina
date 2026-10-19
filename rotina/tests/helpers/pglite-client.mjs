import assert from 'node:assert/strict';
// Test-only adapter. No network/config/session tokens; all values are parameters.
export function pgliteClient(db,tables) {
  const ident=value=>{assert(/^[a-z_]+$/.test(value));return value;};
  return {
    from(table) {
      assert(tables.includes(table));
      let columns='*',operation='select',payload,orders=[],filters=[],count,offset=0,single=false;
      const query={
        select(value){columns=value.split(',').map(ident).join(',');return query;},
        insert(value){operation='insert';payload=value;return query;},
        update(value){operation='update';payload=value;return query;},
        eq(key,value){filters.push([ident(key),value]);return query;},
        order(key,{ascending=true}={}){orders.push(ident(key)+(ascending?' asc':' desc'));return query;},
        range(start,end){offset=start;count=end-start+1;return query;},
        limit(value){count=value;return query;},
        single(){single=true;return query;},
        async then(resolve,reject) {
          try {
            const values=[];
            const param=v=>{values.push(v);return '$'+values.length;};
            let sql;
            if(operation==='insert') {
              const keys=Object.keys(payload).map(ident);
              sql=`insert into public.${table} (${keys.join(',')}) values (${keys.map(k=>param(payload[k])).join(',')})`;
            } else if(operation==='update') sql=`update public.${table} set ${Object.entries(payload).map(([k,v])=>ident(k)+'='+param(v)).join(',')}`;
            else sql=`select ${columns} from public.${table}`;
            if(filters.length) sql+=' where '+filters.map(([k,v])=>k+'='+param(v)).join(' and ');
            if(operation!=='select') sql+=' returning '+columns;
            else {
              if(orders.length)sql+=' order by '+orders.join(',');
              if(count!==undefined)sql+=' limit '+param(count)+' offset '+param(offset);
            }
            const rows=JSON.parse(JSON.stringify((await db.query(sql,values)).rows));
            resolve({data:single?rows[0]:rows,error:null});
          } catch(error) {try {resolve({data:null,error});} catch(e) {reject(e);}}
        },
      };
      return query;
    },
    async rpc(name,args) {
      try {
        assert(['get_activity_aggregate','save_activity_aggregate'].includes(name));
        const result=name==='get_activity_aggregate'
          ? await db.query('select public.get_activity_aggregate($1::uuid) result',[args.p_activity_id])
          : await db.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb,$3::integer) result',[JSON.stringify(args.p_activity),JSON.stringify(args.p_relations),args.p_expected_revision]);
        return {data:result.rows[0].result,error:null};
      } catch(error) {return {data:null,error};}
    },
  };
}
