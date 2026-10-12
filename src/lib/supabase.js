import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lhrkdygethotrlifmpov.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocmtkeWdldGhvdHJsaWZtcG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MjIzNDksImV4cCI6MjEwNzE5ODM0OX0.XJiOvJhoACH-_uW_MagBgQM1mZZFBoSAlWAtEyd5xzs';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Key is missing.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export default supabase;
