// src/services/auth.service.js
// Authentication service using Supabase Auth

import { supabase } from '../lib/supabase.js';

export const authService = {

  /** Sign in with email and password */
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  /** Sign out */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /** Get current session */
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  /** Get current user's profile (with role) */
  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  /** Listen to auth state changes */
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  },

  /** Owner creates a new user (via Supabase Admin - requires service role) */
  /** This is documented in setup.md - done via Supabase dashboard */
};

export default authService;
