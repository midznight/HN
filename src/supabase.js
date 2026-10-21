import { createClient } from '@supabase/supabase-js';
import { keystoreSessionStorage } from './secure-keys.js';

// Supabase publishable keys are designed for client apps; RLS, not key secrecy,
// must enforce data access. Override these defaults with Vite env vars for other projects.
const DEFAULT_SUPABASE_URL = 'https://sajlpngmpkizwjbarxlj.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_4pnbmFBZ9G4mQapJOxK2Jw_cTjfOa9M';

export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
export const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY
).trim();
export const hasSupabaseConfig = Boolean(
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) &&
  supabasePublishableKey.startsWith('sb_publishable_')
);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: keystoreSessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
      global: { headers: { 'X-Client-Info': 'our-space-android/0.2.0' } },
    })
  : null;
