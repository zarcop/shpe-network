import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
if (!url || !key) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY (see app/.env.example)');
}

// The publishable key is safe in the client: row level security decides what each user can read.
export const supabase = createClient(url, key, {
  auth: {
    // Web keeps the session in localStorage (supabase-js default); native has no localStorage.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Sign-in is a typed code, never a redirect, so there is nothing to read from the URL.
    detectSessionInUrl: false,
  },
});
