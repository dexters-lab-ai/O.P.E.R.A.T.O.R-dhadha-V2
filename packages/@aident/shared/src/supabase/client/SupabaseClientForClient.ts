'use client';

import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { getDockerFriendlyUrl } from '~shared/env/environment';

// see supabase document @ https://supabase.com/docs/guides/auth/auth-helpers/nextjs
export class SupabaseClientForClient {
  public static createForClientComponent(token?: string): SupabaseClient {
    return createBrowserClient(
      getDockerFriendlyUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
      token || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
}