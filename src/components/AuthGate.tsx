import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/stores/appStore";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAppStore();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, [setUser]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="animate-pulse text-muted-foreground text-lg">Loading...</div>
      </div>
    );
  }

  if (user) return <>{children}</>;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-bento shadow-bento p-8">
          <div className="text-center mb-8">
            <div className="text-3xl mb-2">💰</div>
            <h1 className="text-xl font-semibold tracking-tight">Finance Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your household</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPw ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-card-foreground"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-bento-inner bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
