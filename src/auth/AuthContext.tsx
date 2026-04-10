import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { defaultUserKeyFromEmail, resolveUserProfile } from "@/auth/userProfiles";
import { supabase } from "@/lib/supabase";

export type AppUser = {
  id: string;
  email: string;
  displayName: string;
  userKey: string;
};

function sessionToAppUser(session: Session | null): AppUser | null {
  const u = session?.user;
  if (!u?.id) return null;
  const email = u.email ?? "";
  const profile = resolveUserProfile(email);
  const userKey = profile?.userKey ?? defaultUserKeyFromEmail(email);
  const displayName = profile?.displayName ?? u.user_metadata?.full_name ?? email.split("@")[0] ?? "User";
  return { id: u.id, email, displayName, userKey };
}

export type AuthState = {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) {
        setSession(s);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const user = useMemo(() => sessionToAppUser(session), [session]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message ?? null };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      logout,
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
