import { requireSupabasePublicConfig } from './configuration';
import type { Database } from '@/lib/banco-mestre/data/database.types';
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const config = requireSupabasePublicConfig();
  return createBrowserClient<Database>(
    config.url,
    config.key,
  );
}
