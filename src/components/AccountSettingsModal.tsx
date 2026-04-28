import { useEffect, useState, useCallback } from "react";
import { X, FolderOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/stores/appStore";
import { useBackend } from "@/hooks/useBackend";
import { cn } from "@/lib/utils";
import {
  supportsFileSystemAccess,
  saveDirectoryHandleToIdb,
  clearDirectoryHandleFromIdb,
  ensureDirectoryPermission,
} from "@/lib/fileDirectoryStorage";
import { setFileStorageDirectory } from "@/adapter/fileJson";

const JSON_FILE_NAME = "household-finance-data.json";

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
    fileStorageFolderName,
    setFileStorageFolderName,
  } = useAppStore();
  const backend = useBackend();
  const [storageBusy, setStorageBusy] = useState(false);

  const adults = entities.filter((e) => e.type === "adult");

  const [linkedEntityId, setLinkedEntityId] = useState<string>("");
  const [profileName, setProfileName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetFromStore = useCallback(() => {
    const linked = adults.find((e) => e.metadata?.auth_user_id === user?.id);
    setLinkedEntityId(linked?.id ?? "");
    setProfileName(linked?.name ?? "");
    setHouseholdName(household?.name ?? "");
    setError(null);
  }, [adults, user?.id, household?.name]);

  useEffect(() => {
    if (open) resetFromStore();
  }, [open, resetFromStore]);

  useEffect(() => {
    if (!open) return;
    const e = adults.find((a) => a.id === linkedEntityId);
    if (e) setProfileName(e.name);
  }, [linkedEntityId, adults, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pickFileFolder = async () => {
    if (!supportsFileSystemAccess()) {
      setError(
        "This browser cannot pick a folder for file storage. Use a recent Chrome, Edge, or another Chromium-based browser."
      );
      return;
    }
    setStorageBusy(true);
    setError(null);
    try {
      const handle = await (
        window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker();
      const ok = await ensureDirectoryPermission(handle);
      if (!ok) {
        setError("Read/write permission for that folder was denied.");
        return;
      }
      await saveDirectoryHandleToIdb(handle);
      setFileStorageDirectory(handle);
      setFileStorageFolderName(handle.name);
      setDataStorageMode("file");
      await refresh();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not use that folder.");
    } finally {
      setStorageBusy(false);
    }
  };

  const handleSupabaseMode = async () => {
    if (dataStorageMode === "supabase") return;
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
      await clearDirectoryHandleFromIdb();
      setDataStorageMode("supabase");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear file storage.");
    } finally {
      setStorageBusy(false);
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

      await backend.upsertHousehold({
        ...household,
        name: householdName.trim() || household.name,
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

        await supabase.auth.updateUser({
          data: { display_name: profileName.trim() || selected.name },
        });
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-card-foreground/20 backdrop-blur-sm"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        className={cn(
          "relative flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-bento shadow-bento",
          "border border-border/50 bg-card"
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 id="account-settings-title" className="text-base font-semibold">
              Account & household
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Link your sign-in to an adult profile and edit household name.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-card-foreground"
            aria-label="Close"
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
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sign-in</h3>
            <div className="rounded-bento-inner bg-muted/30 px-3 py-2 text-sm">
              <p className="text-muted-foreground text-xs mb-0.5">Email</p>
              <p className="font-medium truncate">{user?.email ?? "—"}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Password and email changes use your Supabase auth flow (e.g. reset link from the login screen).
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your profile</h3>
            {adults.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No adults in this household yet. Add one under Data & Settings → Entities, then return here to link your account.
              </p>
            ) : (
              <>
                <label className="block text-xs text-muted-foreground">Adult entity for this login</label>
                <select
                  value={linkedEntityId}
                  onChange={(ev) => setLinkedEntityId(ev.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Not linked — choose…</option>
                  {adults.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.metadata?.auth_user_id === user?.id ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                <label className="block text-xs text-muted-foreground">Display name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(ev) => setProfileName(ev.target.value)}
                  disabled={!linkedEntityId}
                  placeholder={linkedEntityId ? "Name shown in the app" : "Select an entity first"}
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
            {household && (
              <p className="text-[11px] text-muted-foreground">
                Currency: {household.currency} · {household.country}
              </p>
            )}
          </section>

          <section className="space-y-2 border-t border-border/50 pt-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data storage</h3>
            <p className="text-[11px] text-muted-foreground">
              Household data (entities, cashflows, card layouts, etc.) can live in Supabase or in a JSON file inside a folder you choose. Sign-in always uses Supabase.
            </p>
            <div className="flex flex-col gap-2">
              <label
                className={cn(
                  "flex items-start gap-2.5 rounded-bento-inner border px-3 py-2.5 cursor-pointer transition-colors",
                  dataStorageMode === "supabase" ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/30"
                )}
              >
                <input
                  type="radio"
                  name="data-storage"
                  className="mt-0.5"
                  checked={dataStorageMode === "supabase"}
                  disabled={storageBusy}
                  onChange={() => void handleSupabaseMode()}
                />
                <span className="text-sm">
                  <span className="font-medium">Supabase (cloud)</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Shared Postgres backend for all your devices.
                  </span>
                </span>
              </label>

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
                    checked={dataStorageMode === "file"}
                    disabled={storageBusy}
                    onChange={() => {
                      if (dataStorageMode !== "file") void pickFileFolder();
                    }}
                  />
                  <span className="text-sm flex-1 min-w-0">
                    <span className="font-medium">JSON file in a folder</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      All data is read and written to{" "}
                      <code className="text-[10px] bg-muted/50 px-1 rounded">{JSON_FILE_NAME}</code> in the folder you
                      pick. The folder choice is remembered in this browser until you forget it.
                    </span>
                  </span>
                </label>
                {dataStorageMode === "file" && (
                  <div className="mt-3 pl-7 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        Folder: <span className="font-medium text-card-foreground">{fileStorageFolderName ?? "—"}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={storageBusy || !supportsFileSystemAccess()}
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
                        Forget folder &amp; use cloud
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

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
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !household}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
