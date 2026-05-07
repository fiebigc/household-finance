import { useEffect, useState, useRef, type ReactNode } from "react";
import { X, FolderOpen, Download, Lock, Upload, ChevronDown } from "lucide-react";
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
import { BuyMeCoffeeLink } from "@/components/BuyMeCoffeeButton";
import { pickAndReadHouseholdBackupJson } from "@/lib/readBackupJsonFile";

const normalizeAppLocale = (lang: string): AppLocale => {
  if (lang.startsWith("fi")) return "fi";
  if (lang.startsWith("de")) return "de";
  if (lang.startsWith("sv")) return "sv";
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

function SettingsCategoryCard({
  id,
  title,
  titleTooltip,
  openMobileId,
  setOpenMobileId,
  children,
}: {
  id: string;
  title: string;
  titleTooltip: string;
  openMobileId: string | null;
  setOpenMobileId: (next: string | null) => void;
  children: ReactNode;
}) {
  const open = openMobileId === id;
  return (
    <section className="rounded-bento-inner border border-border/55 bg-muted/10 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left sm:hidden"
        onClick={() => setOpenMobileId(open ? null : id)}
        aria-expanded={open}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-help"
          title={titleTooltip}
        >
          {title}
        </h3>
        <ChevronDown
          className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <div className="hidden sm:block px-3 pt-3 pb-0 border-b border-border/35">
        <h3
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-help pb-2"
          title={titleTooltip}
        >
          {title}
        </h3>
      </div>
      <div className={cn("px-3 pb-3 pt-2 space-y-2", open ? "block" : "hidden sm:block")}>{children}</div>
    </section>
  );
}

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
  const [mobileSectionId, setMobileSectionId] = useState<string | null>(null);

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
    setMobileSectionId(null);
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
          "relative z-10 flex w-full max-w-md sm:max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-bento shadow-bento",
          "border border-border/50 bg-card"
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2
              id="account-settings-title"
              className="text-base font-semibold cursor-help"
              title={t("settings.accountTitle_tooltip")}
            >
              {t("settings.accountTitle")}
            </h2>
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
        <div className="space-y-3 pr-1">
          <SettingsCategoryCard
            id="sign-in"
            title={t("settings.signInHeading")}
            titleTooltip={t("settings.tooltip_sign_in")}
            openMobileId={mobileSectionId}
            setOpenMobileId={setMobileSectionId}
          >
            <div className="rounded-bento-inner bg-muted/30 px-3 py-2 text-sm">
              <p className="text-muted-foreground text-xs mb-0.5">{t("settings.emailLabel")}</p>
              <p className="font-medium truncate">{user?.email ?? "—"}</p>
            </div>
          </SettingsCategoryCard>

          <SettingsCategoryCard
            id="language"
            title={t("settings.language_heading")}
            titleTooltip={t("settings.tooltip_language")}
            openMobileId={mobileSectionId}
            setOpenMobileId={setMobileSectionId}
          >
            <select
              value={normalizeAppLocale(i18n.language)}
              onChange={(ev) => setAppLocale(ev.target.value as AppLocale)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="en">{t("settings.lang_en")}</option>
              <option value="fi">{t("settings.lang_fi")}</option>
              <option value="de">{t("settings.lang_de")}</option>
              <option value="sv">{t("settings.lang_sv")}</option>
            </select>
          </SettingsCategoryCard>

          <SettingsCategoryCard
            id="profile"
            title={t("settings.yourProfile")}
            titleTooltip={t("settings.tooltip_profile")}
            openMobileId={mobileSectionId}
            setOpenMobileId={setMobileSectionId}
          >
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
          </SettingsCategoryCard>

          <SettingsCategoryCard
            id="household"
            title={t("settings.householdHeading")}
            titleTooltip={t("settings.tooltip_household")}
            openMobileId={mobileSectionId}
            setOpenMobileId={setMobileSectionId}
          >
            <label className="block text-xs text-muted-foreground">{t("settings.household_name")}</label>
            <input
              type="text"
              value={householdName}
              onChange={(ev) => setHouseholdName(ev.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <label className="block text-xs text-muted-foreground">{t("settings.country")}</label>
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
            <label className="block text-xs text-muted-foreground">{t("settings.city")}</label>
            <input
              type="text"
              value={householdCity}
              onChange={(ev) => setHouseholdCity(ev.target.value)}
              placeholder="e.g. Stockholm"
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {household && (
              <p className="text-[11px] text-muted-foreground">{t("settings.currencyNote", { currency: household.currency })}</p>
            )}
          </SettingsCategoryCard>

          {user && (household || dataStorageMode === "file" || dataStorageMode === "demo") && (
            <SettingsCategoryCard
              id="backup"
              title={t("settings.cat_backup")}
              titleTooltip={t("settings.tooltip_backup", { file: t("fs.vault_file") })}
              openMobileId={mobileSectionId}
              setOpenMobileId={setMobileSectionId}
            >
              {household ? (
                <button
                  type="button"
                  disabled={plainExportBusy || !user}
                  onClick={() => void handleDownloadPlaintextBackup()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border bg-background text-card-foreground hover:bg-muted/40 disabled:opacity-50"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {plainExportBusy ? t("settings.backup_preparing") : t("settings.backup_download_btn")}
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">{t("settings.backup_no_household_hint")}</p>
              )}

              {dataStorageMode === "file" && (
                <div className="pt-2 space-y-2 border-t border-border/40 mt-2">
                  <label className="block text-[10px] text-muted-foreground">{t("settings.restore_pw_label")}</label>
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
                    {restoreBusy ? t("settings.restore_restoring") : t("settings.restore_backup_btn")}
                  </button>
                </div>
              )}
              {restoreNotice && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
                  {restoreNotice}
                </p>
              )}
            </SettingsCategoryCard>
          )}

          {dataStorageMode === "file" && isSupabaseConfigured() && !IS_WEBKIT_STANDALONE && (
            <SettingsCategoryCard
              id="sync"
              title={t("settings.cat_sync")}
              titleTooltip={t("settings.tooltip_sync")}
              openMobileId={mobileSectionId}
              setOpenMobileId={setMobileSectionId}
            >
              <label className="block text-xs text-muted-foreground">{t("settings.sync_email")}</label>
              <input
                type="email"
                autoComplete="email"
                value={syncEmail}
                onChange={(ev) => setSyncEmail(ev.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <label className="block text-xs text-muted-foreground">{t("settings.sync_password")}</label>
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
                {syncBusy ? t("settings.sync_btn_busy") : t("settings.sync_btn")}
              </button>
            </SettingsCategoryCard>
          )}

          <SettingsCategoryCard
            id="storage"
            title={t("settings.cat_storage")}
            titleTooltip={t("settings.tooltip_storage", { file: t("fs.vault_file") })}
            openMobileId={mobileSectionId}
            setOpenMobileId={setMobileSectionId}
          >
            {dataStorageMode === "demo" ? (
              <p
                className="text-[11px] leading-relaxed rounded-bento-inner border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-amber-950 dark:text-amber-50 cursor-help"
                title={t("settings.tooltip_demo_storage")}
              >
                {t("settings.demo_mode_storage_note")}
              </p>
            ) : (
              <>
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
                      <span className="text-sm font-medium cursor-help" title={t("settings.storage_cloud_title")}>
                        {t("settings.storage_cloud_label")}
                      </span>
                    </label>
                  )}

                  <div
                    className={cn(
                      "rounded-bento-inner border px-3 py-2.5 transition-colors",
                      dataStorageMode === "file" ? "border-primary/40 bg-primary/5" : "border-border",
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
                      <span
                        className="text-sm font-medium flex-1 min-w-0 cursor-help"
                        title={t("settings.storage_file_title", { file: t("fs.vault_file") })}
                      >
                        {t("settings.storage_file_label")}
                      </span>
                    </label>
                    {dataStorageMode === "file" && (
                      <div className="mt-3 pl-7 space-y-2">
                        <p className="text-[11px] text-muted-foreground">{t("settings.storage_live_encrypted")}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {t("settings.folder_label_short")}:{" "}
                            <span className="font-medium text-card-foreground">{fileStorageFolderName ?? "—"}</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={storageBusy || !canPickVaultFolder()}
                            onClick={() => void pickFileFolder()}
                            className="px-2.5 py-1.5 text-xs rounded-lg bg-muted text-card-foreground hover:bg-muted/80 disabled:opacity-50"
                          >
                            {t("settings.pick_folder_btn")}
                          </button>
                          <button
                            type="button"
                            disabled={storageBusy}
                            onClick={() => void handleForgetFileFolder()}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted/30"
                          >
                            {IS_WEBKIT_STANDALONE
                              ? t("settings.forget_folder_desktop_btn")
                              : t("settings.forget_folder_cloud_btn")}
                          </button>
                        </div>

                        <div className="pt-3 border-t border-border/40 space-y-2">
                          <h4
                            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-help"
                            title={t("settings.tooltip_encryption")}
                          >
                            <Lock className="w-3 h-3" />
                            {t("settings.encryption_heading")}
                          </h4>
                          <label className="block text-[10px] text-muted-foreground">{t("settings.encryption_current")}</label>
                          <input
                            type="password"
                            autoComplete="current-password"
                            value={vaultPwCurrent}
                            onChange={(ev) => setVaultPwCurrent(ev.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <label className="block text-[10px] text-muted-foreground">{t("settings.encryption_new")}</label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={vaultPwNew}
                            onChange={(ev) => setVaultPwNew(ev.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <label className="block text-[10px] text-muted-foreground">{t("settings.encryption_confirm")}</label>
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
                            {vaultPwBusy ? t("settings.encryption_updating") : t("settings.encryption_update")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </SettingsCategoryCard>

          <SettingsCategoryCard
            id="notifications"
            title={t("settings.cat_notifications")}
            titleTooltip={t("settings.tooltip_notifications")}
            openMobileId={mobileSectionId}
            setOpenMobileId={setMobileSectionId}
          >
            <p className="text-xs text-muted-foreground">{t("settings.placeholder_soon")}</p>
          </SettingsCategoryCard>

          <SettingsCategoryCard
            id="privacy"
            title={t("settings.cat_privacy")}
            titleTooltip={t("settings.tooltip_privacy")}
            openMobileId={mobileSectionId}
            setOpenMobileId={setMobileSectionId}
          >
            <p className="text-xs text-muted-foreground">{t("settings.placeholder_soon")}</p>
          </SettingsCategoryCard>

          <SettingsCategoryCard
            id="about"
            title={t("settings.about_heading")}
            titleTooltip={t("settings.tooltip_about")}
            openMobileId={mobileSectionId}
            setOpenMobileId={setMobileSectionId}
          >
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground">
                {t("settings.app_version_label", { version: import.meta.env.VITE_APP_VERSION ?? "—" })}
              </p>
              <BuyMeCoffeeLink />
            </div>
          </SettingsCategoryCard>

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
