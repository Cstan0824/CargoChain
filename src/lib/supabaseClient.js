// src/lib/supabaseClient.js — CargoChain Frontend Supabase Browser Client
// Initialized strictly with public VITE_ environment variables.
// Configured to dynamically supply the SIWE wallet-authenticated JWT via accessToken callback for RLS.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in environment.');
}

export const CHAT_TOKEN_STORAGE_KEY = 'cargochain_chat_token';

/**
 * Browser Supabase client instance.
 * Attaches the current chat JWT from sessionStorage to all REST requests so RLS can read auth.jwt() ->> 'wallet_address'.
 */
export const supabase = createClient(supabaseUrl || '', supabasePublishableKey || '', {
  accessToken: async () => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(CHAT_TOKEN_STORAGE_KEY) || null;
      }
    } catch {
      // Return null on storage error
    }
    return null;
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
