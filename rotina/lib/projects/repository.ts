import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/banco-mestre/data/database.types';
import { PersistenceError, toPersistenceError } from '@/lib/banco-mestre/data/errors';
import { fail, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { Project, ProjectTask, ProjectRepository, ProjectTaskProgress } from './contracts';
import { createProjectInput, updateProjectInput, projectText, PROJECT_TITLE_LIMIT, PROJECT_DESCRIPTION_LIMIT, progressMode, progressStage, progressInteger } from './validation';
import { createTaskInput, updateTaskInput } from './validation';
const COLUMNS = 'id,user_id,title,description,progress_mode,manual_progress_percent,created_at,updated_at';
const PROGRESS_COLUMNS = 'id,user_id,project_id,parent_task_id,progress_stage,progress_weight,completed_at';
const TASK_COLUMNS = PROGRESS_COLUMNS + ',title,created_at,updated_at';
export function createProjectRepository(client: Pick<SupabaseClient<Database>, 'from'>, verifiedUserId: string): ProjectRepository {
  const owner = uuid(verifiedUserId, 'owner');
  async function operation<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new PersistenceError('Conflict', error);
      throw toPersistenceError(error);
    }
  }
  function rows(data: unknown): Project[] {
    if (!Array.isArray(data)) fail('projects.response');
    return data.map(value => {
      const v = record(value, 'project');
      if (uuid(v.user_id) !== owner) fail('project.owner');
      return {id: uuid(v.id), title: projectText(v.title, 'title', PROJECT_TITLE_LIMIT, true), description: projectText(v.description, 'description', PROJECT_DESCRIPTION_LIMIT),
        progressMode: progressMode(v.progress_mode), manualProgressPercent: progressInteger(v.manual_progress_percent,100),
        createdAt: timestamp(v.created_at, 'createdAt'), updatedAt: timestamp(v.updated_at, 'updatedAt')};
    });
  }
  async function get(id: string): Promise<Project> {
    const {data, error} = await client.from('projects').select(COLUMNS).eq('user_id', owner).eq('id', uuid(id)).limit(1);
    if (error) throw error;
    const result = rows(data);
    if (!result.length) throw new PersistenceError('NotFound');
    return result[0];
  }
  function taskRows(data: unknown): ProjectTask[] {
    if (!Array.isArray(data)) fail('tasks.response');
    return data.map(value => {
      const v = record(value, 'task');
      if (uuid(v.user_id) !== owner) fail('task.owner');
      return {id: uuid(v.id), projectId: uuid(v.project_id), title: projectText(v.title, 'title', PROJECT_TITLE_LIMIT, true),
        parentTaskId: v.parent_task_id === null ? null : uuid(v.parent_task_id), progressStage: progressStage(v.progress_stage), progressWeight: progressInteger(v.progress_weight,2147483647,1),
        completedAt: v.completed_at === null ? null : timestamp(v.completed_at, 'completedAt'),
        createdAt: timestamp(v.created_at, 'createdAt'), updatedAt: timestamp(v.updated_at, 'updatedAt')};
    });
  }
  return {
    taskProgress: () => operation(async () => {
      const result: ProjectTaskProgress[] = [];
      for(let offset=0;;offset+=500) {
        const {data,error}=await client.from('project_tasks').select(PROGRESS_COLUMNS).eq('user_id',owner)
          .order('project_id').order('created_at').order('id').range(offset,offset+499);
        if(error) throw error;
        if(!Array.isArray(data)) fail('tasks.response');
        for(const value of data) {
          const v=record(value,'task');
          if(uuid(v.user_id)!==owner) fail('task.owner');
          result.push({id:uuid(v.id),projectId:uuid(v.project_id),parentTaskId:v.parent_task_id===null?null:uuid(v.parent_task_id),progressStage:progressStage(v.progress_stage),progressWeight:progressInteger(v.progress_weight,2147483647,1),completedAt:v.completed_at===null?null:timestamp(v.completed_at,'completedAt')});
        }
        if(data.length<500) return result;
      }
    }),
    tasks: projectId => operation(async () => {
      const result: ProjectTask[] = [];
      for (let offset = 0;; offset += 500) {
        let query = client.from('project_tasks').select(TASK_COLUMNS).eq('user_id', owner);
        if (projectId !== undefined) query = query.eq('project_id', uuid(projectId));
        const {data, error} = await query.order('created_at').order('id').range(offset, offset + 499);
        if (error) throw error;
        const page = taskRows(data); result.push(...page);
        if (page.length < 500) return result;
      }
    }),
    createTask: input => operation(async () => {
      const v = createTaskInput(input);
      await get(v.projectId);
      const {data, error} = await client.from('project_tasks').insert({id: v.id, user_id: owner, project_id: v.projectId, title: v.title, parent_task_id: v.parentTaskId, progress_stage: v.progressStage, progress_weight: v.progressWeight}).select(TASK_COLUMNS);
      if (error) throw error;
      const result = taskRows(data);
      if (result.length !== 1 || result[0].id !== v.id || result[0].projectId !== v.projectId) fail('task.create');
      return result[0];
    }),
    updateTask: input => operation(async () => {
      const v = updateTaskInput(input);
      // Non-null is a completion request; the trigger assigns the actual database time.
      const {data, error} = await client.from('project_tasks').update({title: v.title, progress_stage: v.progressStage, progress_weight: v.progressWeight})
        .eq('user_id', owner).eq('project_id', v.projectId).eq('id', v.id).eq('updated_at', v.expectedUpdatedAt).select(TASK_COLUMNS);
      if (error) throw error;
      const result = taskRows(data);
      if (result.length === 1) return result[0];
      if (result.length !== 0) fail('task.update');
      const current = await client.from('project_tasks').select(TASK_COLUMNS).eq('user_id', owner).eq('project_id', v.projectId).eq('id', v.id).limit(1);
      if (current.error) throw current.error;
      throw new PersistenceError(taskRows(current.data).length ? 'Conflict' : 'NotFound');
    }),
    list: () => operation(async () => {
      const result: Project[] = [];
      for (let offset = 0;; offset += 500) {
        const {data, error} = await client.from('projects').select(COLUMNS).eq('user_id', owner)
          .order('created_at', {ascending: false}).order('id').range(offset, offset + 499);
        if (error) throw error;
        const page = rows(data); result.push(...page);
        if (page.length < 500) return result;
      }
    }),
    get: id => operation(() => get(id)),
    create: input => operation(async () => {
      const v = createProjectInput(input);
      const {data, error} = await client.from('projects').insert({id: v.id, user_id: owner, title: v.title, description: v.description, progress_mode: v.progressMode, manual_progress_percent: v.manualProgressPercent}).select(COLUMNS);
      if (error) throw error;
      const result = rows(data);
      if (result.length !== 1 || result[0].id !== v.id) fail('projects.create');
      return result[0];
    }),
    update: input => operation(async () => {
      const v = updateProjectInput(input);
      const {data, error} = await client.from('projects').update({title: v.title, description: v.description, progress_mode: v.progressMode, manual_progress_percent: v.manualProgressPercent})
        .eq('id', v.id).eq('user_id', owner).eq('updated_at', v.expectedUpdatedAt).select(COLUMNS);
      if (error) throw error;
      const result = rows(data);
      if (result.length === 1) return result[0];
      if (result.length !== 0) fail('projects.update');
      await get(v.id);
      throw new PersistenceError('Conflict');
    }),
  };
}
