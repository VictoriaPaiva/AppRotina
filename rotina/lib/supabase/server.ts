import { requireSupabasePublicConfig } from './configuration';
import type { Database } from '@/lib/banco-mestre/data/database.types';
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from 'next/server';

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  // Auth recovery/expiry checks in the SDK read Date.now(). Keep those reads
  // out of speculative prerendering, including when request cookies are available.
  await connection();
  const cookieStore = await cookies();
  const config = requireSupabasePublicConfig();

  return createServerClient<Database>(
    config.url,
    config.key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have proxy refreshing
            // user sessions.
          }
        },
      },
    },
  );
}
