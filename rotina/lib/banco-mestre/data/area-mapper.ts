import type { ManagedArea } from './area-contracts';
import { areaFromDatabase } from './mapper';
import { integer, record, timestamp } from './validation';

export function managedAreaFromDatabase(value: unknown): ManagedArea {
  const row=record(value,'area');
  return {...areaFromDatabase(row),sortPosition:integer(row.sort_position,'area.sort_position'),
    // Preserve PostgreSQL precision: never round-trip through Date.
    updatedAt:timestamp(row.updated_at,'area.updated_at')};
}
