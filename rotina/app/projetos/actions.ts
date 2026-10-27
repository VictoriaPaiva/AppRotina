'use server';
import { revalidatePath } from 'next/cache';
import { projectRepositoryForSession } from '@/lib/projects/server';
import { createProjectInput, updateProjectInput } from '@/lib/projects/validation';
import type { ProjectRepository, ProjectResult, Project } from '@/lib/projects/contracts';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import { createTaskInput, updateTaskInput } from '@/lib/projects/validation';
import type { ProjectTask } from '@/lib/projects/contracts';
type TaskResult = {ok: true; task: ProjectTask} | Extract<ProjectResult, {ok: false}>;
async function taskMutation<T>(input: unknown, validate: (input: unknown) => T, save: (repo: ProjectRepository, value: T) => Promise<ProjectTask>): Promise<TaskResult> {
  try {
    const value = validate(input), repo = await projectRepositoryForSession();
    const task = await save(repo, value);
    revalidatePath('/projetos'); revalidatePath(`/projetos/${task.projectId}`);
    return {ok: true, task};
  } catch (error) {
    const failure = readFailure(error);
    return {ok: false, kind: failure.kind, message: failure.message};
  }
}
export async function createTask(input: unknown): Promise<TaskResult> { return taskMutation(input, createTaskInput, (repo, value) => repo.createTask(value)); }
export async function updateTask(input: unknown): Promise<TaskResult> { return taskMutation(input, updateTaskInput, (repo, value) => repo.updateTask(value)); }
async function mutate<T>(input: unknown, validate: (input: unknown) => T, save: (repo: ProjectRepository, value: T) => Promise<Project>): Promise<ProjectResult> {
  try {
    const value = validate(input), repo = await projectRepositoryForSession();
    const project = await save(repo, value);
    revalidatePath('/projetos'); revalidatePath(`/projetos/${project.id}`);
    return {ok: true, project};
  } catch (error) {
    const failure = readFailure(error);
    return {ok: false, kind: failure.kind, message: failure.message};
  }
}
export async function createProject(input: unknown): Promise<ProjectResult> { return mutate(input, createProjectInput, (repo, value) => repo.create(value)); }
export async function updateProject(input: unknown): Promise<ProjectResult> { return mutate(input, updateProjectInput, (repo, value) => repo.update(value)); }
