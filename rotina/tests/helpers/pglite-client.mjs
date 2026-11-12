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
        eq(key,value){filters.push([ident(key),'=',value]);return query;},
        gte(key,value){filters.push([ident(key),'>=',value]);return query;},
        lte(key,value){filters.push([ident(key),'<=',value]);return query;},
        lt(key,value){filters.push([ident(key),'<',value]);return query;},
        is(key,value){assert.equal(value,null);filters.push([ident(key),'is',null]);return query;},
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
            if(filters.length) sql+=' where '+filters.map(([k,op,v])=>op==='is'?k+' is null':k+op+param(v)).join(' and ');
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
        const json=v=>v==null?null:JSON.stringify(v);
        const extra={
          save_activity_checklist:['select public.save_activity_checklist($1,$2,$3) result',[args.p_activity_id,args.p_expected_revision,json(args.p_items)]],
          save_activity_v05:['select public.save_activity_v05($1,$2,$3,$4,$5::uuid[],$6) result',[json(args.p_activity),json(args.p_relations),args.p_expected_revision,json(args.p_tree),args.p_deleted_ids,json(args.p_checklist)]],
          create_daily_plan_v05:['select public.create_daily_plan_v05($1,$2,$3,$4,$5,$6) result',[args.p_id,args.p_activity_id,args.p_planned_date,args.p_planned_time,args.p_revision,json(args.p_configuration)]],
          change_daily_plan_v05:['select public.change_daily_plan_v05($1,$2,$3,$4) result',[args.p_id,json(args.p_expected),args.p_operation,JSON.stringify(args.p_value)]],
          reorder_plan_day:['select public.reorder_plan_day($1,$2) result',[args.p_date,json(args.p_items)]],
          save_activity_with_subitem_deletions:['select public.save_activity_with_subitem_deletions($1::jsonb,$2::jsonb,$3::integer,$4::jsonb,$5::uuid[]) result',[json(args.p_activity),json(args.p_relations),args.p_expected_revision,json(args.p_tree),args.p_deleted_ids]],
          list_activity_subitems:['select public.list_activity_subitems($1) result',[args.p_offset??0]],
          save_activity_with_subitems:['select public.save_activity_with_subitems($1::jsonb,$2::jsonb,$3::integer,$4::jsonb) result',[json(args.p_activity),json(args.p_relations),args.p_expected_revision,json(args.p_tree)]],
          create_plan_with_subitems:['select public.create_plan_with_subitems($1,$2,$3,$4,$5) result',[args.p_id,args.p_activity_id,args.p_planned_date,args.p_revision,json(args.p_configuration)]],
          change_plan_subitems:['select public.change_plan_subitems($1,$2,$3,$4,$5) result',[args.p_id,json(args.p_expected),json(args.p_configuration),args.p_subitem_id??null,args.p_completed??null]],
        };
        if(extra[name]){const [sql,values]=extra[name];return {data:(await db.query(sql,values)).rows[0].result,error:null};}
        assert(['get_activity_aggregate','save_activity_aggregate'].includes(name));
        const result=name==='get_activity_aggregate'
          ? await db.query('select public.get_activity_aggregate($1::uuid) result',[args.p_activity_id])
          : Object.hasOwn(args,'p_expected_revision')
            ? await db.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb,$3::integer) result',[JSON.stringify(args.p_activity),JSON.stringify(args.p_relations),args.p_expected_revision])
            : await db.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb) result',[JSON.stringify(args.p_activity),JSON.stringify(args.p_relations)]);
        return {data:result.rows[0].result,error:null};
      } catch(error) {return {data:null,error};}
    },
  };
}
