import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";

interface Props {
  children: (user: User) => JSX.Element;
}

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /** Stored on the Supabase user as `user_metadata.display_name` after a successful password sign-in. */
  const [preferredDisplayName, setPreferredDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const isRecoveryFromUrl =
      hashParams.get("type") === "recovery" ||
      queryParams.get("type") === "recovery" ||
      queryParams.get("mode") === "recovery";

    if (isRecoveryFromUrl) setIsRecoveryFlow(true);

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveryFlow(true);
        setStatus("Set a new password to finish account recovery.");
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!hasSupabaseEnv || !supabase) {
    return (
      <main className="page-shell">
        <Card>
          <CardHeader>
            <CardTitle>Supabase not configured</CardTitle>
            <CardDescription>
              Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const client = supabase;

  if (isRecoveryFlow) {
    return (
      <main className="page-shell">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Set New Password</CardTitle>
            <CardDescription>
              You are in password recovery mode. Choose a new password for your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={async () => {
                if (!newPassword || newPassword !== confirmPassword) {
                  setStatus("Passwords do not match.");
                  return;
                }
                if (!session) {
                  setStatus(
                    "Recovery session missing. Please open the latest reset link again.",
                  );
                  return;
                }
                const { error } = await client.auth.updateUser({
                  password: newPassword,
                });
                if (error) {
                  setStatus(error.message);
                  return;
                }
                setStatus("Password updated. You can continue to the app.");
                setIsRecoveryFlow(false);
                window.history.replaceState({}, document.title, window.location.pathname);
              }}
            >
              Save new password
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={async () => {
                await client.auth.signOut();
                setIsRecoveryFlow(false);
                setStatus("Signed out. You can login with the new password.");
              }}
            >
              Sign out
            </Button>
          </CardFooter>
          {status ? (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">{status}</p>
            </CardContent>
          ) : null}
        </Card>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="page-shell">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>Sign in with email and password or a magic link.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="auth-display-name">Display name (optional)</Label>
              <Input
                id="auth-display-name"
                value={preferredDisplayName}
                onChange={(e) => setPreferredDisplayName(e.target.value)}
                autoComplete="name"
                placeholder="Saved to your Supabase profile after sign-in"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <div className="grid w-full gap-2 sm:grid-cols-3">
              <Button
                type="button"
                className="w-full"
                onClick={async () => {
                  const { error } = await client.auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (error) {
                    setStatus(error.message);
                    return;
                  }
                  const name = preferredDisplayName.trim();
                  if (name.length > 0) {
                    const { error: metaError } = await client.auth.updateUser({
                      data: { display_name: name },
                    });
                    if (metaError) {
                      setStatus(`Signed in, but display name was not saved: ${metaError.message}`);
                      return;
                    }
                  }
                  setStatus("Signed in.");
                }}
              >
                Sign in
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={async () => {
                  const { error } = await client.auth.signInWithOtp({
                    email,
                  });
                  setStatus(error ? error.message : "Magic link sent.");
                }}
              >
                Send magic link
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={async () => {
                  const { error } = await client.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/?mode=recovery`,
                  });
                  setStatus(error ? error.message : "Password reset email sent.");
                }}
              >
                Reset password
              </Button>
            </div>
            {status ? <p className="w-full text-sm text-muted-foreground">{status}</p> : null}
          </CardFooter>
        </Card>
      </main>
    );
  }

  return children(session.user);
}
