// server/services/supabaseAdmin.js — CargoChain Supabase Admin Client
// Provides a server-side Supabase client using SUPABASE_SERVICE_ROLE_KEY.
// Strictly used by the backend API to execute validated database operations.
// Secrets are never exposed to the frontend.

const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/environment');

let supabaseAdminClient = null;

function getSupabaseAdmin() {
  if (supabaseAdminClient) return supabaseAdminClient;

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || config.supabaseUrl;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || config.supabaseServiceRoleKey;

  if (!url || !key) {
    throw new Error('[supabaseAdmin error] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in environment');
  }

  supabaseAdminClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdminClient;
}

module.exports = {
  getSupabaseAdmin,
};
