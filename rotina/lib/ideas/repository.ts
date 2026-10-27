import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/banco-mestre/data/database.types';
import { PersistenceError, toPersistenceError } from '@/lib/banco-mestre/data/errors';
import { fail, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { Idea, IdeaRepository } from './contracts';
import { createIdeaInput, updateIdeaInput, ideaText, IDEA_TITLE_LIMIT, IDEA_CONTENT_LIMIT } from './validation';
const COLUMNS = 'id,user_id,title,content,created_at,updated_at';
export function createIdeaRepository(client: Pick<SupabaseClient<Database>, 'from'>, verifiedUserId: string): IdeaRepository {
  const owner = uuid(verifiedUserId, 'owner');
  async function operation<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new PersistenceError('Conflict', error);
      throw toPersistenceError(error);
    }
  }
  function rows(data: unknown): Idea[] {
    if (!Array.isArray(data)) fail('ideas.response');
    return data.map(value => {
      const v = record(value, 'idea');
      if (uuid(v.user_id) !== owner) fail('idea.owner');
      return {id: uuid(v.id), title: ideaText(v.title, 'title', IDEA_TITLE_LIMIT, true), content: ideaText(v.content, 'content', IDEA_CONTENT_LIMIT),
        createdAt: timestamp(v.created_at, 'createdAt'), updatedAt: timestamp(v.updated_at, 'updatedAt')};
    });
  }
  async function get(id: string): Promise<Idea> {
    const {data, error} = await client.from('ideas').select(COLUMNS).eq('user_id', owner).eq('id', uuid(id)).limit(1);
    if (error) throw error;
    const result = rows(data);
    if (!result.length) throw new PersistenceError('NotFound');
    return result[0];
  }
  return {
    list: () => operation(async () => {
      const result: Idea[] = [];
      for (let offset = 0;; offset += 500) {
        const {data, error} = await client.from('ideas').select(COLUMNS).eq('user_id', owner)
          .order('updated_at', {ascending: false}).order('id').range(offset, offset + 499);
        if (error) throw error;
        const page = rows(data); result.push(...page);
        if (page.length < 500) return result;
      }
    }),
    get: id => operation(() => get(id)),
    create: input => operation(async () => {
      const v = createIdeaInput(input);
      const {data, error} = await client.from('ideas').insert({id: v.id, user_id: owner, title: v.title, content: v.content}).select(COLUMNS);
      if (error) throw error;
      const result = rows(data);
      if (result.length !== 1 || result[0].id !== v.id) fail('ideas.create');
      return result[0];
    }),
    update: input => operation(async () => {
      const v = updateIdeaInput(input);
      const {data, error} = await client.from('ideas').update({title: v.title, content: v.content})
        .eq('id', v.id).eq('user_id', owner).eq('updated_at', v.expectedUpdatedAt).select(COLUMNS);
      if (error) throw error;
      const result = rows(data);
      if (result.length === 1) return result[0];
      if (result.length !== 0) fail('ideas.update');
      await get(v.id);
      throw new PersistenceError('Conflict');
    }),
  };
}
