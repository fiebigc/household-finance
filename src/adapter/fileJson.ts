import type { BackendAdapter } from "./index";
import type {
  Household, Entity, Account, Period, PeriodDayOverride,
  Cashflow, Loan, Benefit, Transaction, TaxProfile,
  ProjectionScenario, UserCardLayout,
} from "@/types/schema";
import {
  loadDirectoryHandleFromIdb,
  hasReadWriteDirectoryPermission,
  saveDirectoryHandleToIdb,
  clearDirectoryHandleFromIdb,
  setPersistedDesktopVaultPath,
  getPersistedDesktopVaultPath,
} from "@/lib/fileDirectoryStorage";
import type { VaultFolderPick } from "@/lib/vaultFolder";
import { getIsTauri } from "@/utils/tauriDetection";
import { hydrateCashflow } from "@/utils/cashflowAccounts";
import {
  decryptEnvelope,
  decryptWithKey,
  deriveVaultKey,
  encryptWithKey,
  isEncryptedEnvelope,
  randomSaltB64,
  saltB64ToBytes,
  type EncryptedHouseholdEnvelope,
} from "@/utils/localVaultCrypto";
import { LANG_STORAGE_KEY, setAppLocale, type AppLocale } from "@/i18n/i18n";
import {
  hydrateCardValuesFromVaultSnapshot,
  registerPreferencesPersistNotifier,
  useCardValuesStore,
  type CardValuesForHousehold,
} from "@/stores/cardValuesStore";

const DATA_FILE = "household-finance-data.json";

/** Minimum length for a new local vault encryption password. */
export const MIN_LOCAL_VAULT_PASSWORD_LENGTH = 8;

type SnapshotV1 = {
  version: 1;
  households: Household[];
  entities: Entity[];
  accounts: Account[];
  periods: Period[];
  dayOverrides: PeriodDayOverride[];
  cashflows: Cashflow[];
  loans: Loan[];
  benefits: Benefit[];
  transactions: Transaction[];
  taxProfiles: TaxProfile[];
  scenarios: ProjectionScenario[];
  cardLayouts: UserCardLayout[];
};

/** Persisted next to household rows so card layouts and UI can key off `user_id`. */
export type LocalFileSession = {
  user_id: string;
  email: string | null;
  display_name: string | null;
};

/** Locale + dashboard card numeric prefs, stored inside local vault JSON. */
export type VaultUserPreferencesV1 = {
  locale?: string;
  cardValuesByHousehold?: Record<string, CardValuesForHousehold>;
};

type SnapshotOnDisk = SnapshotV1 & {
  localSession?: LocalFileSession;
  userPreferences?: VaultUserPreferencesV1;
};

const store = {
  households: new Map<string, Household>(),
  entities: new Map<string, Entity>(),
  accounts: new Map<string, Account>(),
  periods: new Map<string, Period>(),
  dayOverrides: new Map<string, PeriodDayOverride>(),
  cashflows: new Map<string, Cashflow>(),
  loans: new Map<string, Loan>(),
  benefits: new Map<string, Benefit>(),
  transactions: new Map<string, Transaction>(),
  taxProfiles: new Map<string, TaxProfile>(),
  scenarios: new Map<string, ProjectionScenario>(),
  cardLayouts: new Map<string, UserCardLayout>(),
};

export type { VaultFolderPick };

let dirHandle: FileSystemDirectoryHandle | null = null;
/** Desktop bundle: filesystem path chosen via Tauri dialog (no FileSystemDirectoryHandle). */
let desktopVaultPath: string | null = null;
let cacheLoadedFromDisk = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let loadChain: Promise<void> = Promise.resolve();

let localVaultCryptoKey: CryptoKey | null = null;
let localVaultSaltB64: string | null = null;
let lastLocalSession: LocalFileSession | null = null;

function byHousehold<T extends { household_id?: string }>(
  map: Map<string, T>,
  hid: string,
  field: keyof T & string = "household_id" as keyof T & string
): T[] {
  return [...map.values()].filter((v) => (v as Record<string, unknown>)[field] === hid);
}

const now = () => new Date().toISOString();

function normalizeHousehold(h: Household): Household {
  return {
    ...h,
    country: h.country || (h.currency === "SEK" ? "SE" : ""),
    city: h.city ?? null,
  };
}

function snapshotWithoutSession(data: SnapshotOnDisk): SnapshotV1 {
  const { localSession: _ls, userPreferences: _up, ...rest } = data;
  return rest as SnapshotV1;
}

function applyLoadedUserPreferences(raw: VaultUserPreferencesV1 | undefined): void {
  if (!raw) return;
  if (raw.cardValuesByHousehold && typeof raw.cardValuesByHousehold === "object") {
    hydrateCardValuesFromVaultSnapshot(raw.cardValuesByHousehold as Record<string, unknown>);
  }
  if (typeof raw.locale === "string" && ["en", "fi", "de", "sv"].includes(raw.locale)) {
    setAppLocale(raw.locale as AppLocale, { skipPreferencesPersist: true });
  }
}

export function collectVaultUserPreferencesSnapshot(): VaultUserPreferencesV1 {
  let locale: string | undefined;
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(LANG_STORAGE_KEY);
      if (v === "en" || v === "fi" || v === "de" || v === "sv") locale = v;
    }
  } catch {
    /* ignore */
  }
  return {
    locale,
    cardValuesByHousehold: { ...useCardValuesStore.getState().byHousehold },
  };
}

function ensureLocalSession(profile: { display_name: string; email: string | null }) {
  if (!lastLocalSession) {
    lastLocalSession = {
      user_id: crypto.randomUUID(),
      email: profile.email?.trim() ? profile.email.trim() : null,
      display_name: profile.display_name.trim() || "Local user",
    };
  }
}

function hydrateFromSnapshot(data: SnapshotV1) {
  store.households.clear();
  store.entities.clear();
  store.accounts.clear();
  store.periods.clear();
  store.dayOverrides.clear();
  store.cashflows.clear();
  store.loans.clear();
  store.benefits.clear();
  store.transactions.clear();
  store.taxProfiles.clear();
  store.scenarios.clear();
  store.cardLayouts.clear();
  for (const h of data.households) store.households.set(h.id, normalizeHousehold(h));
  for (const e of data.entities) store.entities.set(e.id, e);
  for (const a of data.accounts) store.accounts.set(a.id, a);
  for (const p of data.periods) store.periods.set(p.id, p);
  for (const o of data.dayOverrides) store.dayOverrides.set(o.id, o);
  for (const c of data.cashflows) store.cashflows.set(c.id, hydrateCashflow(c as Cashflow));
  for (const l of data.loans) store.loans.set(l.id, l);
  for (const b of data.benefits) store.benefits.set(b.id, b);
  for (const t of data.transactions) store.transactions.set(t.id, t);
  for (const t of data.taxProfiles) store.taxProfiles.set(t.id, t);
  for (const s of data.scenarios) store.scenarios.set(s.id, s);
  for (const cl of data.cardLayouts) {
    store.cardLayouts.set(`${cl.user_id}:${cl.tab}`, cl);
  }
}

function toSnapshot(): SnapshotOnDisk {
  const base: SnapshotV1 = {
    version: 1,
    households: [...store.households.values()],
    entities: [...store.entities.values()],
    accounts: [...store.accounts.values()],
    periods: [...store.periods.values()],
    dayOverrides: [...store.dayOverrides.values()],
    cashflows: [...store.cashflows.values()],
    loans: [...store.loans.values()],
    benefits: [...store.benefits.values()],
    transactions: [...store.transactions.values()],
    taxProfiles: [...store.taxProfiles.values()],
    scenarios: [...store.scenarios.values()],
    cardLayouts: [...store.cardLayouts.values()],
  };
  const prefs = collectVaultUserPreferencesSnapshot();
  if (lastLocalSession) return { ...base, localSession: lastLocalSession, userPreferences: prefs };
  return { ...base, userPreferences: prefs };
}

async function readFileFromDirectory(handle: FileSystemDirectoryHandle): Promise<string> {
  const fh = await handle.getFileHandle(DATA_FILE, { create: true });
  const file = await fh.getFile();
  return file.text();
}

async function writeFileToDirectory(handle: FileSystemDirectoryHandle, json: string): Promise<void> {
  const fh = await handle.getFileHandle(DATA_FILE, { create: true });
  const writable = await fh.createWritable();
  await writable.write(json);
  await writable.close();
}

function hasVaultFolder(): boolean {
  return desktopVaultPath !== null || dirHandle !== null;
}

async function readVaultDisk(): Promise<string> {
  if (desktopVaultPath) {
    const { tauriReadVaultFile } = await import("@/lib/tauriVaultIo");
    return tauriReadVaultFile(desktopVaultPath);
  }
  if (!dirHandle) return "";
  return readFileFromDirectory(dirHandle);
}

async function writeVaultDisk(json: string): Promise<void> {
  if (desktopVaultPath) {
    const { tauriWriteVaultFile } = await import("@/lib/tauriVaultIo");
    await tauriWriteVaultFile(desktopVaultPath, json);
    return;
  }
  if (!dirHandle) throw new Error("No folder linked for file storage.");
  await writeFileToDirectory(dirHandle, json);
}

async function flushPersist(): Promise<void> {
  if (!hasVaultFolder()) return;
  try {
    // Never plaintext-write without an unlock key while the file is still encrypted — that wipes the vault
    // (happens after "choose folder" / refresh without going through bootstrapUnlockLocalVault).
    if (!localVaultCryptoKey || !localVaultSaltB64) {
      const raw = (await readVaultDisk()).trim();
      if (raw) {
        try {
          const peek: unknown = JSON.parse(raw);
          if (isEncryptedEnvelope(peek)) return;
        } catch {
          /* allow overwrite path for unreadable blobs */
        }
      }
    }
    const snap = toSnapshot();
    const inner = JSON.stringify(snap, null, 2);
    if (localVaultCryptoKey && localVaultSaltB64) {
      const { iv, ciphertext } = await encryptWithKey(inner, localVaultCryptoKey);
      const wrapped: EncryptedHouseholdEnvelope = {
        format: "encrypted-household-v1",
        salt: localVaultSaltB64,
        iv,
        ciphertext,
      };
      await writeVaultDisk(JSON.stringify(wrapped, null, 2));
    } else {
      await writeVaultDisk(inner);
    }
  } catch (e) {
    console.error("Failed to persist household JSON:", e);
  }
}

function schedulePersist(): void {
  if (!hasVaultFolder()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersist();
  }, 120);
}

function cancelDebouncedPersistWithoutSaving(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

async function peekDiskEnvelopeEncrypted(): Promise<boolean> {
  try {
    const raw = (await readVaultDisk()).trim();
    if (!raw) return false;
    return isEncryptedEnvelope(JSON.parse(raw));
  } catch {
    return false;
  }
}

/** Fill missing arrays so older backups or partial exports still hydrate cleanly. */
function snapshotArraysFromImported(data: SnapshotOnDisk): SnapshotV1 {
  return {
    version: 1,
    households: Array.isArray(data.households) ? data.households : [],
    entities: Array.isArray(data.entities) ? data.entities : [],
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    periods: Array.isArray(data.periods) ? data.periods : [],
    dayOverrides: Array.isArray(data.dayOverrides) ? data.dayOverrides : [],
    cashflows: Array.isArray(data.cashflows) ? data.cashflows : [],
    loans: Array.isArray(data.loans) ? data.loans : [],
    benefits: Array.isArray(data.benefits) ? data.benefits : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    taxProfiles: Array.isArray(data.taxProfiles) ? data.taxProfiles : [],
    scenarios: Array.isArray(data.scenarios) ? data.scenarios : [],
    cardLayouts: Array.isArray(data.cardLayouts) ? data.cardLayouts : [],
  };
}

/** Must run before re-reading JSON from disk (e.g. refresh), or debounced writes can be lost. */
async function flushPendingPersistence(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await flushPersist();
}

/** Wait for debounced writes — call before sync/migration off-disk reads. */
export async function flushFileJsonPersistence(): Promise<void> {
  await flushPendingPersistence();
}

/**
 * Folder is linked and vault file exists encrypted, but this session never derived the vault key
 * (`bootstrapUnlockLocalVault` did not succeed). Persist must not plaintext-overwrite disk in this state.
 */
export async function isLocalVaultLockedOnDisk(): Promise<boolean> {
  if (!hasVaultFolder()) return false;
  if (localVaultCryptoKey && localVaultSaltB64) return false;
  const text = (await readVaultDisk()).trim();
  const t = text.trim();
  if (!t) return false;
  try {
    const p: unknown = JSON.parse(t);
    return isEncryptedEnvelope(p);
  } catch {
    return false;
  }
}

export function patchLocalFileSession(patch: Partial<Pick<LocalFileSession, "display_name" | "email">>): void {
  if (!lastLocalSession) return;
  lastLocalSession = { ...lastLocalSession, ...patch };
  schedulePersist();
}

export function getBoundLocalFileSession(): LocalFileSession | null {
  return lastLocalSession ? { ...lastLocalSession } : null;
}

/** All tax profiles for entities in this household (file backing store only). */
export async function listTaxProfilesForHouseholdFileStore(householdId: string): Promise<TaxProfile[]> {
  await ensureLoaded();
  const eids = new Set(byHousehold(store.entities, householdId).map((e) => e.id));
  return [...store.taxProfiles.values()].filter((t) => eids.has(t.entity_id));
}

function queueLoad(): Promise<void> {
  loadChain = loadChain.then(() => doLoad());
  return loadChain;
}

async function doLoad(): Promise<void> {
  if (!hasVaultFolder()) {
    cacheLoadedFromDisk = true;
    return;
  }
  try {
    const text = (await readVaultDisk()).trim();
    if (!text) {
      hydrateFromSnapshot(emptySnapshot());
      lastLocalSession = null;
      cacheLoadedFromDisk = true;
      return;
    }
    const parsed: unknown = JSON.parse(text);
    if (isEncryptedEnvelope(parsed)) {
      if (!localVaultCryptoKey || !localVaultSaltB64 || parsed.salt !== localVaultSaltB64) {
        hydrateFromSnapshot(emptySnapshot());
        lastLocalSession = null;
        cacheLoadedFromDisk = true;
        return;
      }
      const inner = await decryptWithKey(parsed.ciphertext, parsed.iv, localVaultCryptoKey);
      const root = JSON.parse(inner) as SnapshotOnDisk;
      if (root?.version !== 1 || !Array.isArray(root.households)) {
        hydrateFromSnapshot(emptySnapshot());
        lastLocalSession = null;
      } else {
        hydrateFromSnapshot(snapshotWithoutSession(root));
        lastLocalSession = root.localSession ?? null;
        applyLoadedUserPreferences(root.userPreferences);
      }
      cacheLoadedFromDisk = true;
      return;
    }
    const plain = parsed as SnapshotOnDisk;
    if (plain?.version !== 1 || !Array.isArray(plain.households)) {
      hydrateFromSnapshot(emptySnapshot());
      lastLocalSession = null;
    } else {
      hydrateFromSnapshot(snapshotWithoutSession(plain));
      lastLocalSession = plain.localSession ?? null;
      applyLoadedUserPreferences(plain.userPreferences);
    }
  } catch {
    hydrateFromSnapshot(emptySnapshot());
    lastLocalSession = null;
  }
  cacheLoadedFromDisk = true;
}

function emptySnapshot(): SnapshotV1 {
  return {
    version: 1,
    households: [],
    entities: [],
    accounts: [],
    periods: [],
    dayOverrides: [],
    cashflows: [],
    loans: [],
    benefits: [],
    transactions: [],
    taxProfiles: [],
    scenarios: [],
    cardLayouts: [],
  };
}

export function setFileStorageDirectory(handle: FileSystemDirectoryHandle | null): void {
  desktopVaultPath = null;
  setPersistedDesktopVaultPath(null);
  dirHandle = handle;
  cacheLoadedFromDisk = false;
  if (!handle) {
    localVaultCryptoKey = null;
    localVaultSaltB64 = null;
    lastLocalSession = null;
    hydrateFromSnapshot(emptySnapshot());
    cacheLoadedFromDisk = true;
  }
}

/** Point file storage at an absolute desktop path (Tauri) without a DirectoryHandle. */
export function attachDesktopVaultDirectory(path: string): void {
  dirHandle = null;
  desktopVaultPath = path.trim();
  cacheLoadedFromDisk = false;
}

/** Clear crypto + in-memory rows after local sign-out; keeps folder handle for next unlock. */
export function lockLocalVaultForSignOut(): void {
  localVaultCryptoKey = null;
  localVaultSaltB64 = null;
  lastLocalSession = null;
  hydrateFromSnapshot(emptySnapshot());
  cacheLoadedFromDisk = true;
}

/** Drop in-memory file backend state (e.g. when switching to cloud). IndexedDB handle is kept. */
export function clearFileStorageSession(): void {
  desktopVaultPath = null;
  setPersistedDesktopVaultPath(null);
  dirHandle = null;
  cacheLoadedFromDisk = false;
  localVaultCryptoKey = null;
  localVaultSaltB64 = null;
  lastLocalSession = null;
  hydrateFromSnapshot(emptySnapshot());
  cacheLoadedFromDisk = true;
}

export function getFileStorageDirectoryName(): string | null {
  if (dirHandle) return dirHandle.name;
  if (desktopVaultPath) {
    const norm = desktopVaultPath.replace(/\\/g, "/").replace(/\/$/, "");
    const parts = norm.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? desktopVaultPath;
  }
  return null;
}

export function hasFileStorageDirectory(): boolean {
  return desktopVaultPath !== null || dirHandle !== null || getPersistedDesktopVaultPath() !== null;
}

async function ensureLoaded(): Promise<void> {
  if (cacheLoadedFromDisk) return;
  await queueLoad();
}

export async function restoreFileStorageFromDisk(): Promise<boolean> {
  await flushPendingPersistence();

  const rememberedPath = getPersistedDesktopVaultPath();
  if (rememberedPath && getIsTauri()) {
    desktopVaultPath = rememberedPath;
    cacheLoadedFromDisk = false;
    await queueLoad();
    return true;
  }

  if (dirHandle || desktopVaultPath) {
    // Re-read household-finance-data.json so CLI imports (e.g. akassa, parental leave) show up after refresh.
    cacheLoadedFromDisk = false;
    await queueLoad();
    return true;
  }
  const h = await loadDirectoryHandleFromIdb();
  if (!h) return false;
  // Do not call requestPermission() here — it requires user activation (e.g. folder picker settings).
  // If permission was only "prompt", user must re-open Account settings and choose the folder again.
  const ok = await hasReadWriteDirectoryPermission(h);
  if (!ok) return false;
  setFileStorageDirectory(h);
  cacheLoadedFromDisk = false;
  await queueLoad();
  return true;
}

export async function readVaultFileRaw(handle: FileSystemDirectoryHandle): Promise<string> {
  try {
    return (await readFileFromDirectory(handle)).trim();
  } catch {
    return "";
  }
}

/** Bound folder + raw file text (encrypted envelope or plaintext JSON). */
export async function readBoundVaultFile(): Promise<
  | { kind: "browser"; handle: FileSystemDirectoryHandle; text: string }
  | { kind: "desktop"; path: string; text: string }
  | null
> {
  const persisted = getPersistedDesktopVaultPath();
  if (persisted && getIsTauri()) {
    if (!desktopVaultPath) desktopVaultPath = persisted;
    const text = (await readVaultDisk()).trim();
    return { kind: "desktop", path: persisted, text };
  }
  if (!dirHandle) return null;
  const text = await readVaultFileRaw(dirHandle);
  return { kind: "browser", handle: dirHandle, text };
}

export async function bootstrapNewLocalVault(
  pick: VaultFolderPick,
  password: string,
  profile: { display_name: string; email: string | null },
): Promise<LocalFileSession> {
  if (password.length < MIN_LOCAL_VAULT_PASSWORD_LENGTH) {
    throw new Error(`Vault password must be at least ${MIN_LOCAL_VAULT_PASSWORD_LENGTH} characters.`);
  }
  await flushPendingPersistence();
  const session: LocalFileSession = {
    user_id: crypto.randomUUID(),
    email: profile.email?.trim() ? profile.email.trim() : null,
    display_name: profile.display_name.trim() || "Local user",
  };
  lastLocalSession = session;
  const saltB64 = randomSaltB64();
  localVaultSaltB64 = saltB64;
  localVaultCryptoKey = await deriveVaultKey(password, saltB64ToBytes(saltB64));

  if (pick.kind === "desktop") {
    desktopVaultPath = pick.path;
    dirHandle = null;
    setPersistedDesktopVaultPath(pick.path);
    await clearDirectoryHandleFromIdb().catch(() => {});
  } else {
    desktopVaultPath = null;
    setPersistedDesktopVaultPath(null);
    dirHandle = pick.handle;
    await saveDirectoryHandleToIdb(pick.handle);
  }

  cacheLoadedFromDisk = false;
  hydrateFromSnapshot(emptySnapshot());
  cacheLoadedFromDisk = true;
  await flushPersist();
  return session;
}

export async function bootstrapUnlockLocalVault(
  pick: VaultFolderPick,
  password: string,
  fileText: string,
  profileFallback: { display_name: string; email: string | null },
): Promise<LocalFileSession> {
  await flushPendingPersistence();

  const trimmed = fileText.trim();
  if (!trimmed) {
    return bootstrapNewLocalVault(pick, password, profileFallback);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Could not parse household JSON.");
  }

  if (pick.kind === "desktop") {
    desktopVaultPath = pick.path;
    dirHandle = null;
    setPersistedDesktopVaultPath(pick.path);
    await clearDirectoryHandleFromIdb().catch(() => {});
  } else {
    desktopVaultPath = null;
    setPersistedDesktopVaultPath(null);
    dirHandle = pick.handle;
    await saveDirectoryHandleToIdb(pick.handle);
  }

  if (isEncryptedEnvelope(parsed)) {
    let inner: string;
    try {
      inner = await decryptEnvelope(parsed, password);
    } catch {
      localVaultCryptoKey = null;
      localVaultSaltB64 = null;
      throw new Error("Wrong password or unreadable vault.");
    }
    localVaultSaltB64 = parsed.salt;
    localVaultCryptoKey = await deriveVaultKey(password, saltB64ToBytes(parsed.salt));
    const root = JSON.parse(inner) as SnapshotOnDisk;
    if (root?.version !== 1 || !Array.isArray(root.households)) {
      localVaultCryptoKey = null;
      localVaultSaltB64 = null;
      throw new Error("Invalid vault data.");
    }
    hydrateFromSnapshot(snapshotWithoutSession(root));
    lastLocalSession = root.localSession ?? null;
    ensureLocalSession(profileFallback);
    applyLoadedUserPreferences(root.userPreferences);
    cacheLoadedFromDisk = true;
    await flushPersist();
    return lastLocalSession!;
  }

  localVaultSaltB64 = null;
  localVaultCryptoKey = null;

  const root = parsed as SnapshotOnDisk;
  if (root?.version !== 1 || !Array.isArray(root.households)) {
    throw new Error("Invalid household JSON.");
  }
  hydrateFromSnapshot(snapshotWithoutSession(root));
  lastLocalSession = root.localSession ?? null;
  ensureLocalSession(profileFallback);
  applyLoadedUserPreferences(root.userPreferences);

  if (!password.trim()) {
    cacheLoadedFromDisk = true;
    return lastLocalSession!;
  }

  const saltB64 = randomSaltB64();
  localVaultSaltB64 = saltB64;
  localVaultCryptoKey = await deriveVaultKey(password, saltB64ToBytes(saltB64));
  cacheLoadedFromDisk = true;
  await flushPersist();
  return lastLocalSession!;
}

/**
 * Replace in-memory vault + `household-finance-data.json` from a plaintext export or encrypted envelope backup file.
 *
 * Does **not** call `flushPendingPersistence` first — that would write stale in-memory rows over the live file before
 * import completes.
 */
export async function restoreLocalVaultFromBackup(
  backupText: string,
  opts: {
    profile: { display_name: string; email: string | null };
    /** Needed to decrypt encrypted backups; needed to encrypt when disk is encrypted without an in-session key or to opt into encryption after restore. */
    vaultPassword?: string;
  },
): Promise<void> {
  cancelDebouncedPersistWithoutSaving();

  if (!hasVaultFolder()) {
    throw new Error("Choose your Finances folder (Data storage) before restoring.");
  }

  const trimmed = backupText.trim();
  if (!trimmed) {
    throw new Error("Backup file is empty.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Could not parse backup as JSON.");
  }

  const vaultPassword = opts.vaultPassword?.trim() ?? "";

  let root: SnapshotOnDisk;
  if (isEncryptedEnvelope(parsed)) {
    if (!vaultPassword) {
      throw new Error(
        "This backup is encrypted. Enter its vault password in the restore field below and try again.",
      );
    }
    let inner: string;
    try {
      inner = await decryptEnvelope(parsed as EncryptedHouseholdEnvelope, vaultPassword);
    } catch {
      throw new Error("Could not decrypt this backup — wrong vault password?");
    }
    try {
      const innerParsed = JSON.parse(inner) as SnapshotOnDisk;
      if (
        typeof innerParsed !== "object" ||
        innerParsed === null ||
        innerParsed.version !== 1 ||
        !Array.isArray(innerParsed.households)
      ) {
        throw new Error("Bad inner");
      }
      root = innerParsed;
    } catch {
      throw new Error(
        "Decrypted backup is not valid household data (expected top-level \"version\": 1 and \"households\" array).",
      );
    }
  } else {
    root = parsed as SnapshotOnDisk;
    if (root.version !== 1 || !Array.isArray(root.households)) {
      throw new Error(
        "This file is not a household snapshot (expected \"version\": 1 and a \"households\" array).",
      );
    }
  }

  const snap = snapshotArraysFromImported(root);

  const preservedSession = lastLocalSession;
  hydrateFromSnapshot(snap);
  lastLocalSession = preservedSession ?? root.localSession ?? null;
  ensureLocalSession(opts.profile);
  applyLoadedUserPreferences(root.userPreferences);

  const diskEnc = await peekDiskEnvelopeEncrypted();

  const hadKey = !!(localVaultCryptoKey && localVaultSaltB64);
  if (!hadKey && diskEnc) {
    if (vaultPassword.length < MIN_LOCAL_VAULT_PASSWORD_LENGTH) {
      throw new Error(
        `Cannot save restored data yet: linked file is encrypted. Enter your vault password (at least ${MIN_LOCAL_VAULT_PASSWORD_LENGTH} characters).`,
      );
    }
    const rawDisk = (await readVaultDisk()).trim();
    let diskParsed: unknown;
    try {
      diskParsed = JSON.parse(rawDisk);
    } catch {
      throw new Error("Could not read the encrypted vault file on disk.");
    }
    if (!isEncryptedEnvelope(diskParsed)) {
      throw new Error("Could not read encryption metadata from the vault file on disk.");
    }
    const env = diskParsed as EncryptedHouseholdEnvelope;
    try {
      await decryptEnvelope(env, vaultPassword);
    } catch {
      throw new Error("That password does not unlock the current vault file on disk.");
    }
    localVaultSaltB64 = env.salt;
    localVaultCryptoKey = await deriveVaultKey(vaultPassword, saltB64ToBytes(env.salt));
  } else if (!hadKey && !diskEnc && vaultPassword.length >= MIN_LOCAL_VAULT_PASSWORD_LENGTH) {
    const saltB64 = randomSaltB64();
    localVaultSaltB64 = saltB64;
    localVaultCryptoKey = await deriveVaultKey(vaultPassword, saltB64ToBytes(saltB64));
  } else if (
    !hadKey &&
    !diskEnc &&
    vaultPassword.length > 0 &&
    vaultPassword.length < MIN_LOCAL_VAULT_PASSWORD_LENGTH
  ) {
    throw new Error(`Vault password must be at least ${MIN_LOCAL_VAULT_PASSWORD_LENGTH} characters when provided.`);
  }

  cacheLoadedFromDisk = true;
  await flushPersist();
}

/**
 * Re-encrypt the vault file with a new password. Verifies the current password against the file;
 * only works when the on-disk format is encrypted-household-v1.
 */
export async function changeLocalVaultPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!hasVaultFolder()) throw new Error("No folder linked for file storage.");
  if (!localVaultCryptoKey || !localVaultSaltB64) throw new Error("Unlock the vault before changing the password.");
  if (newPassword.length < MIN_LOCAL_VAULT_PASSWORD_LENGTH) {
    throw new Error(`New password must be at least ${MIN_LOCAL_VAULT_PASSWORD_LENGTH} characters.`);
  }
  if (currentPassword === newPassword) {
    throw new Error("New password must be different from the current one.");
  }

  await flushPendingPersistence();

  const raw = (await readVaultDisk()).trim();
  if (!raw) throw new Error("Vault file is empty or missing.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Could not read the vault file.");
  }
  if (!isEncryptedEnvelope(parsed)) {
    throw new Error(
      "Password change applies to encrypted vault files only. Export a backup, sign out, and create a new encrypted vault if needed.",
    );
  }
  try {
    await decryptEnvelope(parsed, currentPassword);
  } catch {
    throw new Error("Current vault password is incorrect.");
  }

  const inner = JSON.stringify(toSnapshot(), null, 2);
  const newSaltB64 = randomSaltB64();
  const newKey = await deriveVaultKey(newPassword, saltB64ToBytes(newSaltB64));
  const { iv, ciphertext } = await encryptWithKey(inner, newKey);

  localVaultSaltB64 = newSaltB64;
  localVaultCryptoKey = newKey;

  const wrapped: EncryptedHouseholdEnvelope = {
    format: "encrypted-household-v1",
    salt: newSaltB64,
    iv,
    ciphertext,
  };
  await writeVaultDisk(JSON.stringify(wrapped, null, 2));
}

export const fileJsonAdapter: BackendAdapter = {
  async getHousehold(id) {
    await ensureLoaded();
    return store.households.get(id) ?? null;
  },
  async getHouseholdForUser(_userId) {
    await ensureLoaded();
    return [...store.households.values()][0] ?? null;
  },
  async upsertHousehold(h) {
    await ensureLoaded();
    const full = { ...store.households.get(h.id), ...h, updated_at: now() } as Household;
    store.households.set(h.id, full);
    schedulePersist();
    return full;
  },

  async listEntities(hid) {
    await ensureLoaded();
    return byHousehold(store.entities, hid);
  },
  async upsertEntity(e) {
    await ensureLoaded();
    const full = { ...store.entities.get(e.id), ...e, updated_at: now() } as Entity;
    store.entities.set(e.id, full);
    schedulePersist();
    return full;
  },
  async archiveEntity(id) {
    await ensureLoaded();
    const e = store.entities.get(id);
    if (e) {
      e.archived_at = now();
      schedulePersist();
    }
  },

  async listAccounts(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    return [...store.accounts.values()].filter((a) => eids.has(a.entity_id));
  },
  async upsertAccount(a) {
    await ensureLoaded();
    const full = { ...store.accounts.get(a.id), ...a, updated_at: now() } as Account;
    store.accounts.set(a.id, full);
    schedulePersist();
    return full;
  },
  async archiveAccount(id) {
    await ensureLoaded();
    const a = store.accounts.get(id);
    if (a) {
      a.archived_at = now();
      schedulePersist();
    }
  },

  async listPeriods(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    return [...store.periods.values()].filter((p) => eids.has(p.entity_id));
  },
  async upsertPeriod(p) {
    await ensureLoaded();
    const full = { ...store.periods.get(p.id), ...p, updated_at: now() } as Period;
    store.periods.set(p.id, full);
    schedulePersist();
    return full;
  },
  async archivePeriod(id) {
    await ensureLoaded();
    const p = store.periods.get(id);
    if (p) {
      p.archived_at = now();
      schedulePersist();
    }
  },

  async listDayOverrides(periodId) {
    await ensureLoaded();
    return [...store.dayOverrides.values()].filter((o) => o.period_id === periodId);
  },
  async upsertDayOverride(o) {
    await ensureLoaded();
    const full = { ...store.dayOverrides.get(o.id), ...o } as PeriodDayOverride;
    store.dayOverrides.set(o.id, full);
    schedulePersist();
    return full;
  },
  async deleteDayOverride(id) {
    await ensureLoaded();
    store.dayOverrides.delete(id);
    schedulePersist();
  },

  async listCashflows(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    return [...store.cashflows.values()].filter((c) => eids.has(c.entity_id));
  },
  async upsertCashflow(c) {
    await ensureLoaded();
    const full = { ...store.cashflows.get(c.id), ...c, updated_at: now() } as Cashflow;
    store.cashflows.set(c.id, full);
    schedulePersist();
    return full;
  },
  async archiveCashflow(id) {
    await ensureLoaded();
    const c = store.cashflows.get(id);
    if (c) {
      c.archived_at = now();
      schedulePersist();
    }
  },

  async listLoans(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    const aids = new Set(
      [...store.accounts.values()].filter((a) => eids.has(a.entity_id)).map((a) => a.id)
    );
    return [...store.loans.values()].filter((l) => aids.has(l.account_id));
  },
  async upsertLoan(l) {
    await ensureLoaded();
    const full = { ...store.loans.get(l.id), ...l, updated_at: now() } as Loan;
    store.loans.set(l.id, full);
    schedulePersist();
    return full;
  },

  async listBenefits(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    return [...store.benefits.values()].filter((b) => eids.has(b.entity_id));
  },
  async upsertBenefit(b) {
    await ensureLoaded();
    const full = { ...store.benefits.get(b.id), ...b, updated_at: now() } as Benefit;
    store.benefits.set(b.id, full);
    schedulePersist();
    return full;
  },
  async archiveBenefit(id) {
    await ensureLoaded();
    const b = store.benefits.get(id);
    if (b) {
      b.archived_at = now();
      schedulePersist();
    }
  },

  async listTransactions(accountId, opts) {
    await ensureLoaded();
    let txs = [...store.transactions.values()]
      .filter((t) => t.account_id === accountId)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (opts?.offset) txs = txs.slice(opts.offset);
    if (opts?.limit) txs = txs.slice(0, opts.limit);
    return txs;
  },
  async listTransactionsForHousehold(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    const aids = new Set(
      [...store.accounts.values()]
        .filter((a) => !a.archived_at && eids.has(a.entity_id))
        .map((a) => a.id)
    );
    return [...store.transactions.values()]
      .filter((t) => aids.has(t.account_id))
      .sort((a, b) => b.date.localeCompare(a.date));
  },
  async insertTransactions(txs) {
    await ensureLoaded();
    txs.forEach((t) => store.transactions.set(t.id, { ...t, created_at: now() } as Transaction));
    schedulePersist();
    return txs.length;
  },

  async getTaxProfile(entityId, year) {
    await ensureLoaded();
    return (
      [...store.taxProfiles.values()].find((t) => t.entity_id === entityId && t.year === year) ?? null
    );
  },
  async upsertTaxProfile(t) {
    await ensureLoaded();
    const full = { ...store.taxProfiles.get(t.id), ...t, updated_at: now() } as TaxProfile;
    store.taxProfiles.set(t.id, full);
    schedulePersist();
    return full;
  },

  async listScenarios(hid) {
    await ensureLoaded();
    return byHousehold(store.scenarios, hid);
  },
  async upsertScenario(s) {
    await ensureLoaded();
    const full = { ...store.scenarios.get(s.id), ...s, updated_at: now() } as ProjectionScenario;
    store.scenarios.set(s.id, full);
    schedulePersist();
    return full;
  },
  async deleteScenario(id) {
    await ensureLoaded();
    store.scenarios.delete(id);
    schedulePersist();
  },

  async getCardLayout(userId, tab) {
    await ensureLoaded();
    return store.cardLayouts.get(`${userId}:${tab}`) ?? null;
  },
  async saveCardLayout(layout) {
    await ensureLoaded();
    store.cardLayouts.set(`${layout.user_id}:${layout.tab}`, layout);
    schedulePersist();
    await flushFileJsonPersistence();
  },
};

registerPreferencesPersistNotifier(schedulePersist);
