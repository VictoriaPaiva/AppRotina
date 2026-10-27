import type { PersistenceErrorKind } from '@/lib/banco-mestre/data/errors';
export interface Project { id: string; title: string; description: string; createdAt: string; updatedAt: string }
export interface ProjectTask { id: string; projectId: string; title: string; completedAt: string | null; createdAt: string; updatedAt: string }
export interface CreateTaskInput { id: string; projectId: string; title: string }
export interface UpdateTaskInput extends CreateTaskInput { expectedUpdatedAt: string; completed: boolean }
export interface CreateProjectInput { id: string; title: string; description: string }
export interface UpdateProjectInput extends CreateProjectInput { expectedUpdatedAt: string }
export interface ProjectRepository {
  tasks(projectId?: string): Promise<ProjectTask[]>;
  createTask(input: CreateTaskInput): Promise<ProjectTask>;
  updateTask(input: UpdateTaskInput): Promise<ProjectTask>;
  list(): Promise<Project[]>;
  get(id: string): Promise<Project>;
  create(input: CreateProjectInput): Promise<Project>;
  update(input: UpdateProjectInput): Promise<Project>;
}
export type ProjectResult = {ok: true; project: Project} | {ok: false; kind: PersistenceErrorKind; message: string};
