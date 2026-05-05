import { useEffect, useState, useRef } from "react";
import { X, FolderOpen, Download, Lock, Upload } from "lucide-react";
import { supabase, getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAppStore } from "@/stores/appStore";
import { useBackend } from "@/hooks/useBackend";
import { cn } from "@/lib/utils";
import {
  saveDirectoryHandleToIdb,
  clearAllVaultFolderPersistence,
  ensureDirectoryPermission,
} from "@/lib/fileDirectoryStorage";
import {
  pickVaultFolder,
  canPickVaultFolder,
  readVaultRawFromPick,
} from "@/lib/vaultFolder";
import {
  setFileStorageDirectory,
  attachDesktopVaultDirectory,
  patchLocalFileSession,
  getBoundLocalFileSession,
  changeLocalVaultPassword,
  clearFileStorageSession,
  restoreLocalVaultFromBackup,
  MIN_LOCAL_VAULT_PASSWORD_LENGTH,
} from "@/adapter/fileJson";
import { setPersistedDesktopVaultPath } from "@/lib/fileDirectoryStorage";
import { buildHouseholdSnapshotExportJson } from "@/utils/buildHouseholdSnapshotExport";
import { localSessionToPseudoUser } from "@/utils/localSessionUser";
import { syncLocalHouseholdToSupabase } from "@/utils/syncLocalHouseholdToCloud";
import { setAppLocale, type AppLocale } from "@/i18n/i18n";
import { useTranslation } from "react-i18next";
import { IS_WEBKIT_STANDALONE } from "@/constants/buildTarget";
import { BuyMeCoffeeButton } from "@/components/BuyMeCoffeeButton";
import { pickAndReadHouseholdBackupJson } from "@/lib/readBackupJsonFile";

const normalizeAppLocale = (lang: string): AppLocale => {
  if (lang.startsWith("fi")) return "fi";
  if (lang.startsWith("de")) return "de";
  return "en";
};

const COUNTRY_OPTIONS = [
  { value: "SE", label: "Sweden" },
  { value: "DK", label: "Denmark" },
  { value: "NO", label: "Norway" },
  { value: "FI", label: "Finland" },
  { value: "DE", label: "Germany" },
  { value: "OTHER", label: "Other" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AccountSettingsModal({ open, onClose }: Props) {
  const {
    user,
    household,
    entities,
    refresh,
    dataStorageMode,
    setDataStorageMode,
    setUser,
    fileStorageFolderName,
    setFileStorageFolderName,
  } = useAppStore();
  const { t, i18n } = useTranslation();
  const backend = useBackend();
  const [storageBusy, setStorageBusy] = useState(false);

  const adults = entities.filter((e) => e.type === "adult");

  const [linkedEntityId, setLinkedEntityId] = useState<string>("");
  const [profileName, setProfileName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [householdCountry, setHouseholdCountry] = useState("SE");
  const [householdCity, setHouseholdCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [syncEmail, setSyncEmail] = useState("");
  const [syncPassword, setSyncPassword] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [plainExportBusy, setPlainExportBusy] = useState(false);
  const [vaultPwCurrent, setVaultPwCurrent] = useState("");
  const [vaultPwNew, setVaultPwNew] = useState("");
  const [vaultPwNew2, setVaultPwNew2] = useState("");
  const [vaultPwBusy, setVaultPwBusy] = useState(false);
  const [vaultPwNotice, setVaultPwNotice] = useState<string | null>(null);
  const [restoreBackupPw, setRestoreBackupPw] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  const prevOpenRef = useRef(false);

  /** Snapshot store into the form only on open transition — avoids wiping edits on parent re-render or entity refresh. */
  useEffect(() => {
    const opening = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!opening) return;

    const adultsNow = entities.filter((e) => e.type === "adult");
    const linked = adultsNow.find((e) => e.metadata?.auth_user_id === user?.id);
    setLinkedEntityId(linked?.id ?? "");
    let display = linked?.name;
    if (!display && dataStorageMode === "file") display = getBoundLocalFileSession()?.display_name ?? undefined;
    if (!display && typeof user?.user_metadata?.display_name === "string")
      display = user.user_metadata.display_name;
    setProfileName(display ?? "");
    setHouseholdName(household?.name ?? "");
    setHouseholdCountry(household?.country ?? "SE");
    setHouseholdCity(household?.city ?? "");
    setError(null);
    setSyncNotice(null);
    setVaultPwNotice(null);
    setRestoreBackupPw("");
    setRestoreNotice(null);
    setVaultPwCurrent("");
    setVaultPwNew("");
    setVaultPwNew2("");
  }, [open, entities, user, household, dataStorageMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pickFileFolder = async () => {
    if (!canPickVaultFolder()) {
      setError(t("settings.folder_pick_error"));
      return;
    }
    setStorageBusy(true);
    setError(null);
    try {
      const pick = await pickVaultFolder();
      if (!pick) return;
      if (pick.kind === "browser") {
        const ok = await ensureDirectoryPermission(pick.handle);
        if (!ok) {
          setError(t("settings.folder_denied_short"));
          return;
        }
        await saveDirectoryHandleToIdb(pick.handle);
        setFileStorageDirectory(pick.handle);
        setFileStorageFolderName(pick.handle.name);
      } else {
        setPersistedDesktopVaultPath(pick.path);
        attachDesktopVaultDirectory(pick.path);
        setFileStorageFolderName(
          pick.path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? pick.path,
        );
      }
      setDataStorageMode("file");
      await refresh();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : t("settings.could_not_use_folder"));
    } finally {
      setStorageBusy(false);
    }
  };

  const handleSupabaseMode = async () => {
    if (dataStorageMode === "supabase") return;
    if (!isSupabaseConfigured()) {
      setError(t("auth.cloud_not_configured"));
      return;
    }
    setStorageBusy(true);
    setError(null);
    try {
      setDataStorageMode("supabase");
      await refresh();
    } finally {
      setStorageBusy(false);
    }
  };

  const handleForgetFileFolder = async () => {
    setStorageBusy(true);
    setError(null);
    try {
      await clearAllVaultFolderPersistence();
      clearFileStorageSession();
      setFileStorageFolderName(null);
      if (IS_WEBKIT_STANDALONE) {
        await refresh();
        return;
      }
      setDataStorageMode("supabase");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear file storage.");
    } finally {
      setStorageBusy(false);
    }
  };

  const handleChangeVaultEncryptionPassword = async () => {
    setError(null);
    setVaultPwNotice(null);
    if (!vaultPwCurrent.trim() || !vaultPwNew.trim()) {
      setError("Enter your current vault password and a new password.");
      return;
    }
    if (vaultPwNew.length < MIN_LOCAL_VAULT_PASSWORD_LENGTH) {
      setError(`New vault password must be at least ${MIN_LOCAL_VAULT_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (vaultPwNew !== vaultPwNew2) {
      setError("New password and confirmation do not match.");
      return;
    }
    setVaultPwBusy(true);
    try {
      await changeLocalVaultPassword(vaultPwCurrent, vaultPwNew);
      setVaultPwCurrent("");
      setVaultPwNew("");
      setVaultPwNew2("");
      setVaultPwNotice("Encryption password updated for your local file.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update vault password.");
    } finally {
      setVaultPwBusy(false);
    }
  };

  const handleDownloadPlaintextBackup = async () => {
    if (!user || !household) return;
    setPlainExportBusy(true);
    setError(null);
    try {
      const json = await buildHouseholdSnapshotExportJson({
        dataStorageMode,
        userId: user.id,
      });
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `household-finance-data-plain-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export plaintext snapshot.");
    } finally {
      setPlainExportBusy(false);
    }
  };

  const handleRestoreFromBackupFile = async () => {
    if (!user || dataStorageMode !== "file") return;
    setRestoreBusy(true);
    setError(null);
    setRestoreNotice(null);
    try {
      const raw = await pickAndReadHouseholdBackupJson();
      if (!raw) return;
      const sess = getBoundLocalFileSession();
      const profile = {
        display_name:
          sess?.display_name?.trim() ||
          profileName.trim() ||
          (typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "") ||
          "Local user",
        email: sess?.email?.trim()
          ? sess.email.trim()
          : typeof user?.email === "string" && user.email
            ? user.email
            : null,
      };
      await restoreLocalVaultFromBackup(raw, {
        profile,
        vaultPassword: restoreBackupPw,
      });
      setRestoreNotice(
        `Restored data was written to ${t("fs.vault_file")} in your linked folder. Your local profile/session id was kept where possible.`,
      );
      await refresh();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not restore from backup.");
    } finally {
      setRestoreBusy(false);
    }
  };

  const handleSave = async () => {
    if (!user || !household) {
      setError("Not signed in or no household loaded.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();

      const cityTrim = householdCity.trim();
      await backend.upsertHousehold({
        ...household,
        name: householdName.trim() || household.name,
        country: householdCountry,
        city: cityTrim ? cityTrim : null,
        updated_at: now,
      });

      if (linkedEntityId) {
        const selected = adults.find((a) => a.id === linkedEntityId);
        if (!selected) {
          setError("Selected profile no longer exists.");
          setSaving(false);
          return;
        }

        const othersWithMyAuth = adults.filter(
          (a) => a.id !== linkedEntityId && a.metadata?.auth_user_id === user.id
        );
        for (const o of othersWithMyAuth) {
          const meta = { ...(o.metadata ?? {}) };
          delete meta.auth_user_id;
          await backend.upsertEntity({
            ...o,
            metadata: meta,
            updated_at: now,
          });
        }

        const meta = { ...(selected.metadata ?? {}), auth_user_id: user.id };
        await backend.upsertEntity({
          ...selected,
          name: profileName.trim() || selected.name,
          metadata: meta,
          updated_at: now,
        });

        if (supabase && dataStorageMode === "supabase") {
          await supabase.auth.updateUser({
            data: { display_name: profileName.trim() || selected.name },
          });
        }
      }

      if (dataStorageMode === "file") {
        patchLocalFileSession({
          display_name:
            profileName.trim() ||
            getBoundLocalFileSession()?.display_name ||
            "Local user",
        });
        const sess = getBoundLocalFileSession();
        if (sess) setUser(localSessionToPseudoUser(sess));
      }

      await refresh();
      onClose();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleSyncToCloud = async () => {
    if (!household || !user) {
      setError("No household loaded.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("Cloud needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    const email = syncEmail.trim();
    if (!email || !syncPassword) {
      setError("Enter the cloud account email and password to sync.");
      return;
    }
    setSyncBusy(true);
    setError(null);
    setSyncNotice(null);
    const sb = getSupabase();
    let signedIn = false;
    try {
      const { data: signData, error: signErr } = await sb.auth.signInWithPassword({
        email,
        password: syncPassword,
      });
      if (signErr || !signData.session) throw signErr ?? new Error("Sign-in failed.");
      signedIn = true;

      const res = await syncLocalHouseholdToSupabase({
        localUserId: user.id,
        cloudUserId: signData.session.user.id,
        householdId: household.id,
      });
      if (!res.ok) throw new Error(res.error);

      setUser(signData.session.user);
      setDataStorageMode("supabase");
      setSyncPassword("");
      setSyncNotice("Synced to cloud storage. This session now uses cloud storage.");
      await refresh();
    } catch (e) {
      if (signedIn) await sb.auth.signOut();
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncBusy(false);
    }
  };

  if (!open) return null;

  const profileNameDisabled = dataStorageMode === "supabase" && !linkedEntityId;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 z-0 bg-card-foreground/20 backdrop-blur-sm"
        aria-label={t("settings.close")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        className={cn(
          "relative z-10 flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-bento shadow-bento",
          "border border-border/50 bg-card"
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 id="account-settings-title" className="text-base font-semibold">
              {t("settings.accountTitle")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("settings.accountSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-card-foreground"
            aria-label={t("settings.close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={cn(
            "account-settings-modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain",
            "px-5 pb-2 pr-3"
          )}
        >
        <div className="space-y-4 pr-1">
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("settings.signInHeading")}
            </h3>
            <div className="rounded-bento-inner bg-muted/30 px-3 py-2 text-sm">
              <p className="text-muted-foreground text-xs mb-0.5">{t("settings.emailLabel")}</p>
              <p className="font-medium truncate">{user?.email ?? "—"}</p>
            </div>
            {dataStorageMode === "supabase" ? (
              <p className="text-[11px] text-muted-foreground">{t("settings.cloudPwNote")}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {IS_WEBKIT_STANDALONE ? t("settings.localPwNote_desktop") : t("settings.localPwNote_web")}
              </p>
            )}
          </section>

          <section className="space-y-2 border-t border-border/50 pt-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("settings.language_heading")}
            </h3>
            <p className="text-[11px] text-muted-foreground">{t("settings.language_hint")}</p>
            <select
              value={normalizeAppLocale(i18n.language)}
              onChange={(ev) => setAppLocale(ev.target.value as AppLocale)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="en">{t("settings.lang_en")}</option>
              <option value="fi">{t("settings.lang_fi")}</option>
              <option value="de">{t("settings.lang_de")}</option>
            </select>
          </section>

          <section className="space-y-2 border-t border-border/50 pt-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("settings.about_heading")}
            </h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t("settings.about_blurb")}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("settings.app_version_label", { version: import.meta.env.VITE_APP_VERSION ?? "—" })}
            </p>
            <BuyMeCoffeeButton className="[&_a]:inline-flex" />
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("settings.yourProfile")}
            </h3>
            {adults.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("settings.no_adults_hint")}</p>
            ) : (
              <>
                <label className="block text-xs text-muted-foreground">{t("settings.adult_entity")}</label>
                <select
                  value={linkedEntityId}
                  onChange={(ev) => {
                    const id = ev.target.value;
                    setLinkedEntityId(id);
                    const picked = adults.find((a) => a.id === id);
                    if (picked) setProfileName(picked.name);
                    else if (dataStorageMode === "file")
                      setProfileName(getBoundLocalFileSession()?.display_name ?? "");
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">{t("settings.not_linked")}</option>
                  {adults.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.metadata?.auth_user_id === user?.id ? ` ${t("settings.current_marker")}` : ""}
                    </option>
                  ))}
                </select>
                <label className="block text-xs text-muted-foreground">{t("settings.display_name")}</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(ev) => setProfileName(ev.target.value)}
                  disabled={profileNameDisabled}
                  placeholder={
                    profileNameDisabled ? "Select an adult entity first" : "Name shown in the app header"
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
              </>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Household</h3>
            <label className="block text-xs text-muted-foreground">Household name</label>
            <input
              type="text"
              value={householdName}
              onChange={(ev) => setHouseholdName(ev.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <label className="block text-xs text-muted-foreground">Country</label>
            <select
              value={householdCountry}
              onChange={(ev) => setHouseholdCountry(ev.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.value} value={country.value}>
                  {country.label}
                </option>
              ))}
            </select>
            <label className="block text-xs text-muted-foreground">City or locality</label>
            <input
              type="text"
              value={householdCity}
              onChange={(ev) => setHouseholdCity(ev.target.value)}
              placeholder="e.g. Stockholm"
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Together with country, this chooses illustrative tax-withholding defaults for gross income in projections
              when you have not set a tax profile for the person. It is not used for legal tax filing.
            </p>
            {household && (
              <p className="text-[11px] text-muted-foreground">
                Currency: {household.currency}
              </p>
            )}
          </section>

          {user && (household || dataStorageMode === "file" || dataStorageMode === "demo") && (
            <section className="space-y-2 border-t border-border/50 pt-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Household JSON backup
              </h3>
              {household ? (
                <>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Downloads the same data the app loads from your current storage (
                    {dataStorageMode === "file"
                      ? IS_WEBKIT_STANDALONE
                        ? "local encrypted JSON folder on this device"
                        : "local encrypted JSON folder"
                      : dataStorageMode === "demo"
                        ? t("settings.demo_backup_source_label")
                        : "cloud storage"}
                    ). Use for CLI imports or your
                    own backups — plain JSON, treat as sensitive.
                  </p>
                  <button
                    type="button"
                    disabled={plainExportBusy || !user}
                    onClick={() => void handleDownloadPlaintextBackup()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border bg-background text-card-foreground hover:bg-muted/40 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    {plainExportBusy ? "Preparing…" : "Download snapshot (plaintext JSON)"}
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  No household loaded yet. You can still restore from a plaintext or encrypted backup below if you use
                  local file storage.
                </p>
              )}

              {dataStorageMode === "file" && (
                <div className="pt-2 space-y-2 border-t border-border/40 mt-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Pick a backup file (same format as the download, or a plain copy of your data). The app writes it
                    to <code className="text-[10px] bg-muted/50 px-1 rounded">{t("fs.vault_file")}</code> in your{" "}
                    <span className="font-medium text-card-foreground">linked folder</span> — not wherever the backup
                    file lives (e.g. a <code className="text-[10px] bg-muted/50 px-1 rounded">backup</code>{" "}
                    subfolder).
                  </p>
                  <label className="block text-[10px] text-muted-foreground">
                    Vault password (needed if the backup file is encrypted; or to save when the live vault file is
                    encrypted but this session has no key; optional if the live file is plain-text and you skip
                    encryption)
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={restoreBackupPw}
                    onChange={(ev) => setRestoreBackupPw(ev.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    disabled={restoreBusy || !user || storageBusy || !fileStorageFolderName}
                    onClick={() => void handleRestoreFromBackupFile()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border bg-background text-card-foreground hover:bg-muted/40 disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4 shrink-0" />
                    {restoreBusy ? "Restoring…" : "Restore from backup file…"}
                  </button>
                </div>
              )}
              {restoreNotice && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
                  {restoreNotice}
                </p>
              )}
            </section>
          )}

          {dataStorageMode === "file" && isSupabaseConfigured() && !IS_WEBKIT_STANDALONE && (
            <section className="space-y-2 border-t border-border/50 pt-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sync to cloud</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Upload this household to cloud storage using your cloud email and password. After a successful sync, this
                session uses cloud storage. Your local JSON file is not deleted (unless you overwrite it).
              </p>
              <label className="block text-xs text-muted-foreground">Cloud account email</label>
              <input
                type="email"
                autoComplete="email"
                value={syncEmail}
                onChange={(ev) => setSyncEmail(ev.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <label className="block text-xs text-muted-foreground">Cloud password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={syncPassword}
                onChange={(ev) => setSyncPassword(ev.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                disabled={syncBusy || !household || storageBusy}
                onClick={() => void handleSyncToCloud()}
                className="w-full px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {syncBusy ? "Syncing…" : "Sign in & sync to cloud"}
              </button>
            </section>
          )}

          <section className="space-y-2 border-t border-border/50 pt-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data storage</h3>
            {dataStorageMode === "demo" ? (
              <div className="space-y-2">
                <p className="text-[11px] leading-relaxed rounded-bento-inner border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-amber-950 dark:text-amber-50">
                  {t("settings.demo_mode_storage_note")}
                </p>
                <p className="text-[11px] text-muted-foreground">{t("settings.demo_mode_storage_hint")}</p>
              </div>
            ) : (
              <>
            <p className="text-[11px] text-muted-foreground">
              {IS_WEBKIT_STANDALONE
                ? "Household data is kept in an encrypted JSON file in a folder you choose."
                : "Household data can live in cloud storage or in an encrypted JSON file in a folder you choose. Sign-in picks cloud (email) or local (vault password and folder)."}
            </p>
            <div className="flex flex-col gap-2">
              {!IS_WEBKIT_STANDALONE && (
                <label
                  className={cn(
                    "flex items-start gap-2.5 rounded-bento-inner border px-3 py-2.5 cursor-pointer transition-colors",
                    dataStorageMode === "supabase"
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-muted/30",
                  )}
                >
                  <input
                    type="radio"
                    name="data-storage"
                    className="mt-0.5"
                    checked={dataStorageMode === "supabase"}
                    disabled={storageBusy || !isSupabaseConfigured()}
                    onChange={() => void handleSupabaseMode()}
                  />
                  <span className="text-sm">
                    <span className="font-medium">Cloud storage</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Synced backend for signing in across devices (when configured).
                    </span>
                  </span>
                </label>
              )}

              <div
                className={cn(
                  "rounded-bento-inner border px-3 py-2.5 transition-colors",
                  dataStorageMode === "file" ? "border-primary/40 bg-primary/5" : "border-border"
                )}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="data-storage"
                    className="mt-0.5"
                    checked={IS_WEBKIT_STANDALONE || dataStorageMode === "file"}
                    disabled={storageBusy || IS_WEBKIT_STANDALONE}
                    onChange={() => {
                      if (IS_WEBKIT_STANDALONE) return;
                      if (dataStorageMode !== "file") void pickFileFolder();
                    }}
                  />
                  <span className="text-sm flex-1 min-w-0">
                    <span className="font-medium">JSON file in a folder</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      All data is read and written to{" "}
                      <code className="text-[10px] bg-muted/50 px-1 rounded">{t("fs.vault_file")}</code> in the folder you
                      pick. The folder choice is remembered in this browser until you forget it.
                    </span>
                  </span>
                </label>
                {dataStorageMode === "file" && (
                  <div className="mt-3 pl-7 space-y-2">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Live data is encrypted in{" "}
                      <code className="text-[10px] bg-muted/50 px-1 rounded">{t("fs.vault_file")}</code>.
                      Use <span className="font-medium text-card-foreground">Household JSON backup</span> above for a
                      readable export.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        Folder: <span className="font-medium text-card-foreground">{fileStorageFolderName ?? "—"}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={storageBusy || !canPickVaultFolder()}
                        onClick={() => void pickFileFolder()}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-muted text-card-foreground hover:bg-muted/80 disabled:opacity-50"
                      >
                        Choose or change folder…
                      </button>
                      <button
                        type="button"
                        disabled={storageBusy}
                        onClick={() => void handleForgetFileFolder()}
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted/30"
                      >
                        {IS_WEBKIT_STANDALONE ? "Forget linked folder…" : "Forget folder & use cloud"}
                      </button>
                    </div>

                    <div className="pt-3 border-t border-border/40 space-y-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        <Lock className="w-3 h-3" />
                        File encryption password
                      </h4>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        For encrypted vault files only (not plain JSON). Requires your current vault password; use a backup
                        first if unsure.
                      </p>
                      <label className="block text-[10px] text-muted-foreground">Current vault password</label>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={vaultPwCurrent}
                        onChange={(ev) => setVaultPwCurrent(ev.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <label className="block text-[10px] text-muted-foreground">New password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={vaultPwNew}
                        onChange={(ev) => setVaultPwNew(ev.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <label className="block text-[10px] text-muted-foreground">Confirm new password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={vaultPwNew2}
                        onChange={(ev) => setVaultPwNew2(ev.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        type="button"
                        disabled={vaultPwBusy || storageBusy}
                        onClick={() => void handleChangeVaultEncryptionPassword()}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-muted text-card-foreground hover:bg-muted/80 disabled:opacity-50"
                      >
                        {vaultPwBusy ? "Updating…" : "Update encryption password"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
              </>
            )}
          </section>

          {syncNotice && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
              {syncNotice}
            </p>
          )}
          {vaultPwNotice && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
              {vaultPwNotice}
            </p>
          )}
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/40 px-5 py-4 bg-card">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted/50"
          >
            {t("settings.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !household}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t("settings.saving_btn") : t("settings.save_btn")}
          </button>
        </div>
      </div>
    </div>
  );
}
