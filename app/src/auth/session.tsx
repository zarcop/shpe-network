import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
  full_name: string;
  headline: string | null;
  linkedin_url: string | null;
  grad_year: number | null;
  avatar_url: string | null;
};

// signed-out → (code) → needs-profile → (create profile) → ready
export type AuthStatus = 'loading' | 'signed-out' | 'needs-profile' | 'ready' | 'error';

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Remembers whose profile was loaded: right after sign-in (or a reload) the session is known before
  // the profile query returns, and an earlier "no profile" must not be read as this user's.
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const userId = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // supabase-js warns against awaiting other Supabase calls inside this callback, so it only
    // records the session; the effect below loads the profile.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const reloadProfile = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, headline, linkedin_url, grad_year, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    setFailed(!!error);
    if (!error) setLoaded({ userId, profile: data });
  }, [userId]);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  const profile = loaded && loaded.userId === userId ? loaded.profile : undefined;

  const status: AuthStatus =
    session === undefined ? 'loading'
    : session === null ? 'signed-out'
    : failed ? 'error'
    : profile === undefined ? 'loading'
    : profile === null ? 'needs-profile'
    : 'ready';

  return (
    <AuthContext.Provider value={{ status, session: session ?? null, profile: profile ?? null, reloadProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside AuthProvider');
  return state;
}
