import type { Area } from '@/types/banco-mestre';

export type ManagedArea = Area & { sortPosition: number; updatedAt: string };
export type AreaSnapshot = Pick<ManagedArea, 'name' | 'active' | 'sortPosition' | 'updatedAt'>;
export type CreateAreaInput = { id: string; name: string };
export type RenameAreaInput = { id: string; name: string; expected: AreaSnapshot };
export type SetAreaActiveInput = { id: string; active: boolean; expected: AreaSnapshot };
export interface AreaRepository {
  listManagedAreas(): Promise<ManagedArea[]>;
  createArea(input: CreateAreaInput): Promise<ManagedArea>;
  renameArea(input: RenameAreaInput): Promise<ManagedArea>;
  setAreaActive(input: SetAreaActiveInput): Promise<ManagedArea>;
}
