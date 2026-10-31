import type { PersistenceErrorKind } from '@/lib/banco-mestre/data/errors';
export type ProgressMode = 'tasks' | 'manual' | 'hybrid';
export type ProgressStage = 'not_started' | 'started' | 'early_progress' | 'in_progress' | 'advanced' | 'finishing' | 'completed';
export interface Project { id: string; title: string; description: string; progressMode: ProgressMode; manualProgressPercent: number; createdAt: string; updatedAt: string }
export interface ProjectTask { id: string; projectId: string; title: string; parentTaskId: string | null; progressStage: ProgressStage; progressWeight: number; completedAt: string | null; createdAt: string; updatedAt: string }
export type ProjectTaskProgress = Pick<ProjectTask,'id'|'projectId'|'parentTaskId'|'progressStage'|'progressWeight'|'completedAt'>;
export interface CreateTaskInput { id: string; projectId: string; title: string; parentTaskId?: string | null; progressStage?: ProgressStage; progressWeight?: number }
export interface UpdateTaskInput extends Omit<CreateTaskInput, 'parentTaskId'> { expectedUpdatedAt: string; completed: boolean }
export interface CreateProjectInput { id: string; title: string; description: string; progressMode?: ProgressMode; manualProgressPercent?: number }
export interface UpdateProjectInput extends CreateProjectInput { expectedUpdatedAt: string }
export interface ProjectRepository {
  taskProgress(): Promise<ProjectTaskProgress[]>;
  tasks(projectId?: string): Promise<ProjectTask[]>;
  createTask(input: CreateTaskInput): Promise<ProjectTask>;
  updateTask(input: UpdateTaskInput): Promise<ProjectTask>;
  list(): Promise<Project[]>;
  get(id: string): Promise<Project>;
  create(input: CreateProjectInput): Promise<Project>;
  update(input: UpdateProjectInput): Promise<Project>;
}
export type ProjectResult = {ok: true; project: Project} | {ok: false; kind: PersistenceErrorKind; message: string};
