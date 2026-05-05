import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { IS_WEBKIT_STANDALONE } from "@/constants/buildTarget";
import { useAppStore } from "@/stores/appStore";
import { useTranslation } from "react-i18next";
import {
  bootstrapUnlockLocalVault,
  bootstrapNewLocalVault,
  MIN_LOCAL_VAULT_PASSWORD_LENGTH,
  readBoundVaultFile,
  restoreFileStorageFromDisk,
  hasFileStorageDirectory,
} from "@/adapter/fileJson";
import { localSessionToPseudoUser } from "@/utils/localSessionUser";
import { ensureDirectoryPermission } from "@/lib/fileDirectoryStorage";
import { pickVaultFolder, canPickVaultFolder, readVaultRawFromPick } from "@/lib/vaultFolder";
import { hydrateMockAdapterFromBundledDemo } from "@/adapter/mock";
import { demoPreviewPseudoUser } from "@/constants/demoMode";
import { Lock, Mail, Eye, EyeOff, FolderOpen, Wallet, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type LoginMode = "cloud" | "local";
type LocalVaultIntent = "unlock" | "create";

function readPreferredLoginMode(): LoginMode {
  if (IS_WEBKIT_STANDALONE) return "local";
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("fin:data-storage-mode") : null;
    if (v === "supabase") return "cloud";
  } catch {
    /* ignore */
  }
  return "local";
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const dataStorageMode = useAppStore((s) => s.dataStorageMode);
  const setDataStorageMode = useAppStore((s) => s.setDataStorageMode);
  const clearFinanceData = useAppStore((s) => s.clearFinanceData);

  const [checking, setChecking] = useState(
    () => !IS_WEBKIT_STANDALONE && dataStorageMode === "supabase" && isSupabaseConfigured(),
  );
  const [mode, setMode] = useState<LoginMode>(readPreferredLoginMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [localDisplayName, setLocalDisplayName] = useState("");
  const [localEmail, setLocalEmail] = useState("");
  const [localIntent, setLocalIntent] = useState<LocalVaultIntent>("unlock");
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rememberedFolder, setRememberedFolder] = useState(false);

  useEffect(() => {
    if (dataStorageMode !== "supabase" || !isSupabaseConfigured()) {
      setChecking(false);
      return;
    }
    const client = supabase!;
    let cancelled = false;
    void client.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setUser(data.session?.user ?? null);
        setChecking(false);
      }
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [dataStorageMode, setUser]);

  useEffect(() => {
    if (mode !== "local") {
      setRememberedFolder(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      await restoreFileStorageFromDisk();
      if (!cancelled) setRememberedFolder(hasFileStorageDirectory());
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="animate-pulse text-muted-foreground text-lg">{t("loading")}</div>
      </div>
    );
  }

  if (user) return <>{children}</>;

  const cloudAvailable = isSupabaseConfigured() && !!supabase;

  const handleCloudLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!cloudAvailable) {
      setError(t("auth.cloud_not_configured"));
      return;
    }
    setSubmitting(true);
    try {
      setDataStorageMode("supabase");
      const { error: err } = await supabase!.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const profileFallback = () => ({
    display_name: localDisplayName.trim() || "Local user",
    email: localEmail.trim() ? localEmail.trim() : null,
  });

  const profileForCreate = () => ({
    display_name: localDisplayName.trim(),
    email: localEmail.trim() ? localEmail.trim() : null,
  });

  const validateCreatePasswords = (): boolean => {
    if (password.length < MIN_LOCAL_VAULT_PASSWORD_LENGTH) {
      setError(t("auth.encryption_pw_short", { count: MIN_LOCAL_VAULT_PASSWORD_LENGTH }));
      return false;
    }
    if (password !== passwordConfirm) {
      setError(t("auth.pw_mismatch"));
      return false;
    }
    return true;
  };

  const handlePickFolderAndCreate = async () => {
    setError("");
    if (!canPickVaultFolder()) {
      setError(t("auth.folder_pick_unavailable"));
      return;
    }
    if (!localDisplayName.trim()) {
      setError(t("auth.display_name_needed"));
      return;
    }
    if (!validateCreatePasswords()) return;

    setSubmitting(true);
    try {
      const pick = await pickVaultFolder();
      if (!pick) return;
      if (pick.kind === "browser") {
        const ok = await ensureDirectoryPermission(pick.handle);
        if (!ok) {
          setError(t("auth.folder_denied"));
          return;
        }
      }
      const raw = await readVaultRawFromPick(pick);
      if (raw.trim().length > 0) {
        setError(t("auth.folder_nonempty"));
        return;
      }
      setDataStorageMode("file");
      const session = await bootstrapNewLocalVault(pick, password, profileForCreate());
      clearFinanceData();
      setUser(localSessionToPseudoUser(session));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : t("auth.vault_create_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickFolderAndUnlock = async () => {
    setError("");
    if (!canPickVaultFolder()) {
      setError(t("auth.folder_pick_unavailable"));
      return;
    }
    if (!password.trim()) {
      setError(t("auth.vault_pw_needed"));
      return;
    }
    setSubmitting(true);
    try {
      const pick = await pickVaultFolder();
      if (!pick) return;
      if (pick.kind === "browser") {
        const ok = await ensureDirectoryPermission(pick.handle);
        if (!ok) {
          setError(t("auth.folder_denied"));
          return;
        }
      }
      const raw = await readVaultRawFromPick(pick);
      if (!raw.trim()) {
        if (password.length < MIN_LOCAL_VAULT_PASSWORD_LENGTH) {
          setError(t("auth.vault_empty_pw_short", { count: MIN_LOCAL_VAULT_PASSWORD_LENGTH }));
          return;
        }
      }
      setDataStorageMode("file");
      const session = await bootstrapUnlockLocalVault(pick, password, raw, profileFallback());
      clearFinanceData();
      setUser(localSessionToPseudoUser(session));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : t("auth.vault_open_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlockRememberedFolder = async () => {
    setError("");
    if (!password.trim()) {
      setError(t("auth.vault_pw_needed"));
      return;
    }
    if (localIntent === "create") {
      setError(t("auth.create_wrong_screen"));
      return;
    }
    setSubmitting(true);
    try {
      const bound = await readBoundVaultFile();
      if (!bound) {
        setError(t("auth.no_linked_folder"));
        setRememberedFolder(false);
        return;
      }
      setDataStorageMode("file");
      const pick =
        bound.kind === "browser"
          ? ({ kind: "browser", handle: bound.handle } as const)
          : ({ kind: "desktop", path: bound.path } as const);
      const session = await bootstrapUnlockLocalVault(pick, password, bound.text, profileFallback());
      clearFinanceData();
      setUser(localSessionToPseudoUser(session));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.unlock_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnterDemoHousehold = () => {
    setError("");
    setSubmitting(true);
    try {
      hydrateMockAdapterFromBundledDemo();
      clearFinanceData();
      setDataStorageMode("demo");
      setUser(demoPreviewPseudoUser());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.demo_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-bento shadow-bento p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <div className="rounded-full bg-primary/12 p-3 ring-1 ring-border/60 shadow-sm">
                <Wallet className="w-8 h-8 text-primary" aria-hidden />
              </div>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{t("auth.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {IS_WEBKIT_STANDALONE ? t("auth.subtitle_desktop") : t("auth.subtitle_web")}
            </p>
          </div>

          {mode === "local" && (
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLocalIntent("unlock");
                    setError("");
                    setPasswordConfirm("");
                  }}
                  className={cn(
                    "rounded-bento-inner border px-3 py-2 text-xs font-medium transition-colors",
                    localIntent === "unlock"
                      ? "border-primary bg-primary/10 text-card-foreground"
                      : "border-border hover:bg-muted/40 text-muted-foreground",
                  )}
                >
                  {t("auth.unlock_existing")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocalIntent("create");
                    setError("");
                    setPasswordConfirm("");
                  }}
                  className={cn(
                    "rounded-bento-inner border px-3 py-2 text-xs font-medium transition-colors",
                    localIntent === "create"
                      ? "border-primary bg-primary/10 text-card-foreground"
                      : "border-border hover:bg-muted/40 text-muted-foreground",
                  )}
                >
                  {t("auth.create_new")}
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {localIntent === "create"
                  ? t("auth.create_help", { file: t("fs.vault_file") })
                  : t("auth.unlock_help")}
              </p>

              <label className="block space-y-1">
                <span className="text-[10px] text-muted-foreground">
                  {localIntent === "create" ? t("auth.display_name_create") : t("auth.display_name_optional")}{" "}
                  <span className="text-muted-foreground/90">
                    {localIntent === "create" ? t("auth.required") : t("auth.optional")}
                  </span>
                </span>
                <input
                  type="text"
                  value={localDisplayName}
                  onChange={(e) => setLocalDisplayName(e.target.value)}
                  placeholder={
                    localIntent === "create" ? t("auth.placeholder_create") : t("auth.placeholder_unlock")
                  }
                  className="w-full px-3 py-2 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] text-muted-foreground">{t("auth.email_optional")}</span>
                <input
                  type="email"
                  value={localEmail}
                  onChange={(e) => setLocalEmail(e.target.value)}
                  placeholder={t("auth.email_placeholder")}
                  className="w-full px-3 py-2 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete={localIntent === "create" ? "new-password" : "current-password"}
                  placeholder={
                    localIntent === "create" ? t("auth.password_encrypt") : t("auth.password_vault")
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-card-foreground"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {localIntent === "create" && (
                <>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showPwConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={t("auth.confirm_pw")}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwConfirm(!showPwConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-card-foreground"
                    >
                      {showPwConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {t("auth.pw_length_note", { count: MIN_LOCAL_VAULT_PASSWORD_LENGTH })}
                  </p>
                </>
              )}

              {localIntent === "unlock" && (
                <p className="text-[10px] text-muted-foreground">
                  {t("auth.unlock_empty_hint", { count: MIN_LOCAL_VAULT_PASSWORD_LENGTH })}
                </p>
              )}

              {error && mode === "local" && <p className="text-destructive text-sm">{error}</p>}

              {rememberedFolder && localIntent === "unlock" ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleUnlockRememberedFolder()}
                  className="w-full py-2.5 rounded-bento-inner bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  {t("auth.unlock_saved")}
                </button>
              ) : null}

              {localIntent === "unlock" ? (
                <button
                  type="button"
                  disabled={submitting || !canPickVaultFolder()}
                  onClick={() => void handlePickFolderAndUnlock()}
                  className="w-full py-2.5 rounded-bento-inner border border-border bg-muted/30 text-sm font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  {rememberedFolder ? t("auth.pick_different") : t("auth.pick_unlock")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting || !canPickVaultFolder()}
                  onClick={() => void handlePickFolderAndCreate()}
                  className="w-full py-2.5 rounded-bento-inner border border-border bg-muted/30 text-sm font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  {t("auth.pick_create")}
                </button>
              )}

              {!canPickVaultFolder() && (
                <p className="text-[11px] text-muted-foreground">{t("auth.folder_pick_hint")}</p>
              )}
            </div>
          )}

          {!IS_WEBKIT_STANDALONE && (
            <div className="mb-6 rounded-bento-inner border border-border px-3 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-card-foreground leading-snug">{t("auth.cloud_storage")}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={mode === "cloud"}
                  aria-label={mode === "cloud" ? t("auth.cloud_on") : t("auth.cloud_off")}
                  onClick={() => {
                    const next = mode === "cloud" ? "local" : "cloud";
                    setMode(next);
                    setError("");
                  }}
                  className={cn(
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    mode === "cloud" ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 left-1 h-5 w-5 rounded-full bg-background shadow transition-[transform] duration-200 ease-out",
                      mode === "cloud" ? "translate-x-6" : "translate-x-0",
                    )}
                    aria-hidden
                  />
                </button>
              </div>
            </div>
          )}

          {!IS_WEBKIT_STANDALONE && mode === "cloud" && (
            <>
              {!cloudAvailable && (
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{t("auth.cloud_disabled")}</p>
              )}
              <form onSubmit={handleCloudLogin} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder={t("auth.login_email_placeholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                    disabled={!cloudAvailable}
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPw ? "text" : "password"}
                    placeholder={t("auth.login_password_placeholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                    disabled={!cloudAvailable}
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
                  disabled={submitting || !cloudAvailable}
                  className="w-full py-2.5 rounded-bento-inner bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submitting ? t("auth.signing_in") : t("auth.sign_in")}
                </button>
              </form>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-border/50 space-y-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleEnterDemoHousehold()}
              className="w-full py-2.5 rounded-bento-inner border border-dashed border-primary/35 bg-primary/5 text-sm font-medium text-card-foreground hover:bg-primary/10 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden />
              {t("auth.try_demo")}
            </button>
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">{t("auth.try_demo_hint")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
