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
import { Lock, Mail, Eye, EyeOff, FolderOpen, Wallet, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type LoginMode = "cloud" | "local";
type LocalUiStep = "welcome" | "unlock" | "create";
type CloudUiStep = "welcome" | "password";

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

function AuthSheet({
  children,
  backLabel,
  backdropAriaLabel,
  onBack,
}: {
  children: React.ReactNode;
  backLabel: string;
  backdropAriaLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-card-foreground/25 backdrop-blur-sm"
        aria-label={backdropAriaLabel}
        onClick={onBack}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex w-full max-w-sm flex-col max-h-[min(92vh,640px)] overflow-hidden",
          "rounded-t-2xl border border-border bg-card shadow-bento sm:rounded-bento",
        )}
      >
        <div className="flex shrink-0 items-center border-b border-border/50 px-3 py-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-card-foreground"
          >
            ← {backLabel}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </div>
  );
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
  const [localUiStep, setLocalUiStep] = useState<LocalUiStep>("welcome");
  const [cloudUiStep, setCloudUiStep] = useState<CloudUiStep>("welcome");
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

  useEffect(() => {
    setLocalUiStep("welcome");
    setCloudUiStep("welcome");
    setPassword("");
    setPasswordConfirm("");
    setError("");
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

  const goLocalWelcome = () => {
    setLocalUiStep("welcome");
    setPassword("");
    setPasswordConfirm("");
    setError("");
  };

  const goCloudWelcome = () => {
    setCloudUiStep("welcome");
    setPassword("");
    setError("");
  };

  const localUnlockSheet = localUiStep === "unlock" && (
    <AuthSheet backLabel={t("auth.back")} backdropAriaLabel={t("settings.close")} onBack={goLocalWelcome}>
      <div className="space-y-4">
        <p className="text-sm font-medium text-card-foreground">{t("auth.step_unlock_title")}</p>

        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            placeholder={t("auth.password_vault")}
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

        {error && <p className="text-destructive text-sm">{error}</p>}

        {rememberedFolder ? (
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

        <button
          type="button"
          disabled={submitting || !canPickVaultFolder()}
          onClick={() => void handlePickFolderAndUnlock()}
          className="w-full py-2.5 rounded-bento-inner border border-border bg-muted/30 text-sm font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <FolderOpen className="w-4 h-4" />
          {rememberedFolder ? t("auth.pick_different") : t("auth.pick_unlock")}
        </button>

        {!canPickVaultFolder() && (
          <p className="text-[11px] text-muted-foreground">{t("auth.folder_pick_hint")}</p>
        )}

        <button
          type="button"
          onClick={() => {
            setLocalUiStep("create");
            setPasswordConfirm("");
            setError("");
          }}
          className="w-full py-2 text-sm text-primary font-medium hover:underline"
        >
          {t("auth.new_vault_link")}
        </button>
      </div>
    </AuthSheet>
  );

  const localCreateSheet = localUiStep === "create" && (
    <AuthSheet
      backLabel={t("auth.back")}
      backdropAriaLabel={t("settings.close")}
      onBack={() => {
        setLocalUiStep("unlock");
        setPasswordConfirm("");
        setError("");
      }}
    >
      <div className="space-y-4">
        <p className="text-sm font-medium text-card-foreground">{t("auth.step_create_title")}</p>

        <label className="block space-y-1">
          <span className="text-[10px] text-muted-foreground">
            {t("auth.display_name_create")} <span className="text-muted-foreground/90">{t("auth.required")}</span>
          </span>
          <input
            type="text"
            value={localDisplayName}
            onChange={(e) => setLocalDisplayName(e.target.value)}
            placeholder={t("auth.placeholder_create")}
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
            autoComplete="new-password"
            placeholder={t("auth.password_encrypt")}
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

        <p className="text-[10px] text-muted-foreground">{t("auth.pw_length_note", { count: MIN_LOCAL_VAULT_PASSWORD_LENGTH })}</p>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <button
          type="button"
          disabled={submitting || !canPickVaultFolder()}
          onClick={() => void handlePickFolderAndCreate()}
          className="w-full py-2.5 rounded-bento-inner bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
        >
          <FolderOpen className="w-4 h-4" />
          {t("auth.pick_create")}
        </button>

        {!canPickVaultFolder() && (
          <p className="text-[11px] text-muted-foreground">{t("auth.folder_pick_hint")}</p>
        )}
      </div>
    </AuthSheet>
  );

  const cloudPasswordSheet = mode === "cloud" && cloudUiStep === "password" && (
    <AuthSheet backLabel={t("auth.back")} backdropAriaLabel={t("settings.close")} onBack={goCloudWelcome}>
      <form onSubmit={handleCloudLogin} className="space-y-4">
        <p className="text-sm font-medium text-card-foreground">{t("auth.step_cloud_password_title")}</p>
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
            autoComplete="current-password"
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
    </AuthSheet>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-bento shadow-bento p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <div className="rounded-full bg-primary/12 p-3 ring-1 ring-border/60 shadow-sm">
                <Wallet className="w-8 h-8 text-primary" aria-hidden />
              </div>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{t("auth.title")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-snug">
              {IS_WEBKIT_STANDALONE ? t("auth.subtitle_desktop_short") : t("auth.subtitle_web_short")}
            </p>
          </div>

          {mode === "local" && localUiStep === "welcome" && (
            <div className="space-y-4 mb-4">
              <label className="block space-y-1">
                <span className="text-[10px] text-muted-foreground">{t("auth.username_label")}</span>
                <input
                  type="text"
                  value={localDisplayName}
                  onChange={(e) => setLocalDisplayName(e.target.value)}
                  placeholder={t("auth.placeholder_unlock")}
                  className="w-full px-3 py-2.5 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoComplete="username"
                />
              </label>

              {error && mode === "local" && <p className="text-destructive text-sm">{error}</p>}

              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setError("");
                  setPassword("");
                  setLocalUiStep("unlock");
                }}
                className="w-full py-2.5 rounded-bento-inner bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {t("auth.log_in")}
              </button>

              {!IS_WEBKIT_STANDALONE && (
                <button
                  type="button"
                  className="w-full py-2 text-sm text-muted-foreground hover:text-card-foreground flex items-center justify-center gap-1"
                  onClick={() => {
                    setMode("cloud");
                    setError("");
                  }}
                >
                  {t("auth.use_cloud_instead")}
                  <ChevronDown className="w-4 h-4 -rotate-90" aria-hidden />
                </button>
              )}
            </div>
          )}

          {!IS_WEBKIT_STANDALONE && mode === "cloud" && cloudUiStep === "welcome" && (
            <div className="space-y-4 mb-4">
              {!cloudAvailable && (
                <p className="text-sm text-muted-foreground leading-relaxed">{t("auth.cloud_disabled")}</p>
              )}
              <label className="block space-y-1">
                <span className="text-[10px] text-muted-foreground">{t("auth.username_label_cloud")}</span>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder={t("auth.login_email_placeholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-bento-inner bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required={false}
                    disabled={!cloudAvailable}
                    autoComplete="email"
                  />
                </div>
              </label>

              {error && <p className="text-destructive text-sm">{error}</p>}

              <button
                type="button"
                disabled={submitting || !cloudAvailable || !email.trim()}
                onClick={() => {
                  setError("");
                  setPassword("");
                  setCloudUiStep("password");
                }}
                className="w-full py-2.5 rounded-bento-inner bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {t("auth.log_in")}
              </button>

              <button
                type="button"
                className="w-full py-2 text-sm text-muted-foreground hover:text-card-foreground flex items-center justify-center gap-1"
                onClick={() => {
                  setMode("local");
                  setError("");
                }}
              >
                <ChevronDown className="w-4 h-4 rotate-90" aria-hidden />
                {t("auth.use_local_instead")}
              </button>
            </div>
          )}

          {(mode !== "local" || localUiStep === "welcome") &&
            (!IS_WEBKIT_STANDALONE ? mode === "local" || cloudUiStep === "welcome" : true) && (
              <div className="mt-2 pt-4 border-t border-border/50 space-y-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleEnterDemoHousehold()}
                  className="w-full py-2.5 rounded-bento-inner border border-dashed border-primary/35 bg-primary/5 text-sm font-medium text-card-foreground hover:bg-primary/10 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden />
                  {t("auth.try_demo")}
                </button>
              </div>
            )}
        </div>
      </div>

      {mode === "local" && localUnlockSheet}
      {mode === "local" && localCreateSheet}
      {cloudPasswordSheet}
    </div>
  );
}
