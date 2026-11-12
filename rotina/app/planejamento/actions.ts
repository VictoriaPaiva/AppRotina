'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import { createPlanRepository } from '@/lib/planning/repository';
import { createPlanInput, completePlanInput, reschedulePlanInput, configurePlanInput, completeSubitemInput,quantityPlanInput,timePlanInput,checkPlanInput,reorderPlanInput } from '@/lib/planning/validation';
import type { DailyPlanItem, PlanRepository, PlanResult } from '@/lib/planning/contracts';

async function mutate<T>(input: unknown, validate: (input: unknown) => T, save: (repository: PlanRepository, input: T) => Promise<DailyPlanItem|void>): Promise<PlanResult> {
  try {
    const value = validate(input), client = await createClient();
    const {data, error} = await client.auth.getClaims();
    if (error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
    await save(createPlanRepository(client, data.claims.sub), value);
    revalidatePath('/planejamento'); revalidatePath('/hoje'); revalidatePath('/calendario');
    return {ok: true};
  } catch (error) {
    const failure = readFailure(error);
    const message = failure.kind === 'Conflict'
      ? 'Já existe um planejamento dessa atividade na data escolhida, ou este item mudou em outra aba. Atualize os dados antes de tentar novamente.'
      : failure.kind === 'NotFound' ? 'O item não está disponível. Para um novo planejamento, escolha uma atividade ativa da sua conta.'
      : failure.kind === 'Unknown' ? 'Não foi possível confirmar a operação. Verifique os dados salvos antes de tentar novamente.' : failure.message;
    return {ok: false, kind: failure.kind, message};
  }
}
export async function createDailyPlan(input: unknown): Promise<PlanResult> {
  return mutate(input, createPlanInput, (repository, value) => repository.create(value));
}
export async function setDailyPlanCompleted(input: unknown): Promise<PlanResult> {
  return mutate(input, completePlanInput, (repository, value) => repository.setCompleted(value));
}
export async function rescheduleDailyPlan(input: unknown): Promise<PlanResult> {
  return mutate(input, reschedulePlanInput, (repository, value) => repository.reschedule(value));
}
export async function configureDailyPlanSubitems(input:unknown):Promise<PlanResult>{return mutate(input,configurePlanInput,(repository,value)=>repository.configureSubitems(value));}
export async function completeDailyPlanSubitem(input:unknown):Promise<PlanResult>{return mutate(input,completeSubitemInput,(repository,value)=>repository.completeSubitem(value));}
export async function setDailyPlanTime(input:unknown):Promise<PlanResult>{return mutate(input,timePlanInput,(repository,value)=>repository.setTime(value));}
export async function completeDailyPlanChecklist(input:unknown):Promise<PlanResult>{return mutate(input,checkPlanInput,(repository,value)=>repository.completeChecklist(value));}
export async function reorderDailyPlan(input:unknown):Promise<PlanResult>{return mutate(input,reorderPlanInput,(repository,value)=>repository.reorder(value));}

export async function setDailyPlanQuantity(input:unknown):Promise<PlanResult>{return mutate(input,quantityPlanInput,(repository,value)=>repository.setQuantity(value));}
