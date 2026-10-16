/* Shared Supabase browser client. This file contains no secret keys. */
(function () {
  'use strict';
  const config = window.ENGENE_STUDY_AI_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) {
    console.warn('ENGENEverse cloud features are waiting for the Supabase browser library and public project settings.');
    return;
  }
  if (!window.ENGENE_SUPABASE_CLIENT) {
    window.ENGENE_SUPABASE_CLIENT = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
  }
})();
