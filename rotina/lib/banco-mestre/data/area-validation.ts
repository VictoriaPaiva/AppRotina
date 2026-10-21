import type { AreaSnapshot, CreateAreaInput, RenameAreaInput, SetAreaActiveInput } from './area-contracts';
import { bool, fail, integer, record, text, timestamp, uuid } from './validation';

function exact(value: unknown, keys: readonly string[], field: string) {
  const object=record(value,field);
  if(Object.keys(object).some(key=>!keys.includes(key))) fail(field);
  return object;
}
export function areaSnapshot(value: unknown): AreaSnapshot {
  const v=exact(value,['name','active','sortPosition','updatedAt'],'expected');
  return {name:text(v.name,'expected.name'),active:bool(v.active,'expected.active'),
    sortPosition:integer(v.sortPosition,'expected.sortPosition'),updatedAt:timestamp(v.updatedAt,'expected.updatedAt')};
}
export function createAreaInput(value: unknown): CreateAreaInput {
  const v=exact(value,['id','name'],'createArea');
  return {id:uuid(v.id),name:text(v.name,'name').trim()};
}
export function renameAreaInput(value: unknown): RenameAreaInput {
  const v=exact(value,['id','name','expected'],'renameArea');
  return {id:uuid(v.id),name:text(v.name,'name').trim(),expected:areaSnapshot(v.expected)};
}
export function setAreaActiveInput(value: unknown): SetAreaActiveInput {
  const v=exact(value,['id','active','expected'],'setAreaActive');
  return {id:uuid(v.id),active:bool(v.active,'active'),expected:areaSnapshot(v.expected)};
}
