#!/usr/bin/env node
/**
 * Regenerates src/data/samples/demo-household-snapshot.json (deterministic demo data).
 * Import history: ~36 months of synthetic bank transactions; recurring cashflows aligned in time.
 * Run: npm run demo:data:build — or: node scripts/build-demo-household-snapshot.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "src", "data", "samples", "demo-household-snapshot.json");

const HID = "a1000000-0000-4000-8000-000000000001";
const E_ADULT_A = "a1000000-0000-4000-8000-000000000011";
const E_ADULT_B = "a1000000-0000-4000-8000-000000000012";
const E_CHILD = "a1000000-0000-4000-8000-000000000013";
const E_EMPL = "a1000000-0000-4000-8000-000000000099";
const A_CHECK = "a1000000-0000-4000-8000-000000000021";
const A_SAVE = "a1000000-0000-4000-8000-000000000022";
const A_LOAN = "a1000000-0000-4000-8000-000000000023";
const A_JOINT = "a1000000-0000-4000-8000-000000000024";

const DEM_AUTH = "f0000000-0000-4000-a000-000000000001";

const nowTs = "2026-05-02T09:30:00.000Z";

const HISTORY_MONTHS = 36;

function txId(n) {
  return `b1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * Monthly import-style transactions across joint / savings / personal checking.
 * Narrative: rented → bolån from 2024-03; salary steps; daycare from 2025-09; buffer sweeps from 2024-04.
 */
function buildTransactions() {
  const txs = [];
  let id = 1;
  function push(t) {
    txs.push({
      ...t,
      id: txId(id++),
      import_batch_id: null,
      category: null,
      cashflow_id: null,
    });
  }
  const pad = (n) => String(n).padStart(2, "0");
  const start = new Date(2023, 5, 1);

  /** Deterministic “noise” matching month index seed. */
  const varAmt = (mi, salt) =>
    Math.round((((mi * 7919 + salt * 5039) % 997) / 17) % 520);

  for (let mi = 0; mi < HISTORY_MONTHS; mi++) {
    const d0 = new Date(start.getFullYear(), start.getMonth() + mi, 1);
    const y = d0.getFullYear();
    const m = d0.getMonth() + 1;
    const ym = `${y}-${pad(m)}`;

    const mortgageStarted = ym >= "2024-03";
    const daycareMonth = ym >= "2025-09";
    const bufferSweep = ym >= "2024-04";
    const pocketMonth = ym >= "2023-08";

    const salaryBase =
      y >= 2025 ? 45_980 : y >= 2024 ? 44_200 : 42_800;
    const salary = Math.round(salaryBase + (mi % 4) * 180 + varAmt(mi, 0));

    push({
      account_id: A_JOINT,
      date: `${ym}-25`,
      amount: salary,
      currency: "SEK",
      description: mortgageStarted ? `Lön netsalary ${ym}` : `Salary ${ym}`,
      is_reviewed: true,
      notes: null,
      created_at: `${ym}-25T07:05:00.000Z`,
    });

    if (!mortgageStarted) {
      push({
        account_id: A_JOINT,
        date: `${ym}-28`,
        amount: -Math.round(13_950 + varAmt(mi, 1)),
        currency: "SEK",
        description: `Hyra ${ym}`,
        is_reviewed: true,
        notes: null,
        created_at: `${ym}-28T08:05:00.000Z`,
      });
    } else {
      push({
        account_id: A_JOINT,
        date: `${ym}-26`,
        amount: -Math.round(13_050 + varAmt(mi, 2) + (y >= 2025 ? 180 : 0)),
        currency: "SEK",
        description: `Bolån + avgift BR ${ym}`,
        is_reviewed: true,
        notes: null,
        created_at: `${ym}-26T08:00:00.000Z`,
      });
    }

    if (daycareMonth) {
      push({
        account_id: A_JOINT,
        date: `${ym}-03`,
        amount: -Math.round(1540 + (mi % 3) * 90 + varAmt(mi, 11)),
        currency: "SEK",
        description: `Förskola faktura ${ym}`,
        is_reviewed: true,
        notes: null,
        created_at: `${ym}-03T09:00:00.000Z`,
      });
    }

    const winterBump = [11, 12, 1, 2].includes(m) ? 1.08 : 1;
    const g1 = Math.round((1950 + varAmt(mi, 3)) * winterBump);
    const g2 = Math.round((1780 + varAmt(mi, 4)) * winterBump);
    const g3 = Math.round((880 + varAmt(mi, 5)) * winterBump);
    push({
      account_id: A_JOINT,
      date: `${ym}-06`,
      amount: -g1,
      currency: "SEK",
      description: `Mat ICA ${ym}-1`,
      is_reviewed: true,
      notes: null,
      created_at: `${ym}-06T16:20:00.000Z`,
    });
    push({
      account_id: A_JOINT,
      date: `${ym}-16`,
      amount: -g2,
      currency: "SEK",
      description: `Mat Coop/Kvantum ${ym}-2`,
      is_reviewed: true,
      notes: null,
      created_at: `${ym}-16T18:10:00.000Z`,
    });
    push({
      account_id: A_JOINT,
      date: `${ym}-24`,
      amount: -g3,
      currency: "SEK",
      description: `Livs fill-up ${ym}-3`,
      is_reviewed: mi % 4 === 0,
      notes: null,
      created_at: `${ym}-24T19:00:00.000Z`,
    });

    if (mi % 2 === 0) {
      push({
        account_id: A_JOINT,
        date: `${ym}-11`,
        amount: -Math.round(289 + varAmt(mi, 21)),
        currency: "SEK",
        description: `Pressbyrån / deli ${ym}`,
        is_reviewed: false,
        notes: null,
        created_at: `${ym}-11T12:45:00.000Z`,
      });
    }

    push({
      account_id: A_JOINT,
      date: `${ym}-14`,
      amount: -Math.round(659 + varAmt(mi, 6)),
      currency: "SEK",
      description: `Bredband/mobil autogiro ${ym}`,
      is_reviewed: true,
      notes: null,
      created_at: `${ym}-14T07:05:00.000Z`,
    });

    push({
      account_id: A_JOINT,
      date: `${ym}-07`,
      amount: -Math.round(1185 + varAmt(mi, 7)),
      currency: "SEK",
      description: `Bensin Circle K ${ym}`,
      is_reviewed: mi % 3 !== 1,
      notes: null,
      created_at: `${ym}-07T17:30:00.000Z`,
    });

    push({
      account_id: A_JOINT,
      date: `${ym}-09`,
      amount: -Math.round(940 + varAmt(mi, 22)),
      currency: "SEK",
      description: `El (förbrukning debiterad BR) ${ym}`,
      is_reviewed: true,
      notes: null,
      created_at: `${ym}-09T11:00:00.000Z`,
    });

    push({
      account_id: A_JOINT,
      date: `${ym}-08`,
      amount: Math.round(mi % 5 === 0 ? 612 : mi % 5 === 3 ? -215 : -85),
      currency: "SEK",
      description: mi % 5 === 0 ? `Återbet. autogiro korr ${ym}` : `Variabel avgiftsrad ${ym}`,
      is_reviewed: false,
      notes: null,
      created_at: `${ym}-08T13:02:00.000Z`,
    });

    const qMonth = [1, 4, 7, 10].includes(m);
    if (qMonth && ym >= "2024-01") {
      push({
        account_id: A_JOINT,
        date: `${ym}-18`,
        amount: -Math.round(2040 + varAmt(mi, 8)),
        currency: "SEK",
        description: `Motorförsäkring (kvartal) ${ym}`,
        is_reviewed: true,
        notes: null,
        created_at: `${ym}-18T09:02:00.000Z`,
      });
    }

    if (bufferSweep) {
      const saveAmt = Math.round(4200 + (mi % 6) * 260 + varAmt(mi, 9));
      push({
        account_id: A_JOINT,
        date: `${ym}-27`,
        amount: -saveAmt,
        currency: "SEK",
        description: `Överföring till buffert ${ym}`,
        is_reviewed: true,
        notes: null,
        created_at: `${ym}-27T10:00:00.000Z`,
      });
      push({
        account_id: A_SAVE,
        date: `${ym}-27`,
        amount: saveAmt,
        currency: "SEK",
        description: `Insättning buffertspar ${ym}`,
        is_reviewed: true,
        notes: null,
        created_at: `${ym}-27T10:05:00.000Z`,
      });
    }

    if (pocketMonth) {
      const pocket = Math.round(1280 + (mi % 4) * 95 + varAmt(mi, 10));
      push({
        account_id: A_JOINT,
        date: `${ym}-05`,
        amount: -pocket,
        currency: "SEK",
        description: `Intern överf. privata utgifterna ${ym}`,
        is_reviewed: true,
        notes: null,
        created_at: `${ym}-05T07:40:00.000Z`,
      });
      push({
        account_id: A_CHECK,
        date: `${ym}-05`,
        amount: pocket,
        currency: "SEK",
        description: `Privatkonto löpande månad ${ym}`,
        is_reviewed: true,
        notes: null,
        created_at: `${ym}-05T07:41:00.000Z`,
      });
    }

    if (mi % 3 === 0) {
      push({
        account_id: A_CHECK,
        date: `${ym}-21`,
        amount: -Math.round(329 + varAmt(mi, 31)),
        currency: "SEK",
        description: `Apotek Hjärtat`,
        is_reviewed: true,
        notes: null,
        created_at: `${ym}-21T15:05:00.000Z`,
      });
    }

    if (mi % 2 === 1) {
      push({
        account_id: A_CHECK,
        date: `${ym}-12`,
        amount: -Math.round(179 + varAmt(mi, 34)),
        currency: "SEK",
        description: `Reskassa SL top-up`,
        is_reviewed: false,
        notes: null,
        created_at: `${ym}-12T08:05:00.000Z`,
      });
    }
  }

  push({
    account_id: A_CHECK,
    date: "2026-05-03",
    amount: -189.45,
    currency: "SEK",
    description: "ICA Maxi kiosk",
    is_reviewed: true,
    notes: null,
    created_at: "2026-05-04T09:00:00.000Z",
  });
  push({
    account_id: A_SAVE,
    date: "2026-05-06",
    amount: -1200,
    currency: "SEK",
    description: "Flytt till mäklardepå (demo)",
    is_reviewed: false,
    notes: null,
    created_at: "2026-05-06T14:00:00.000Z",
  });

  return txs;
}

const UEMP_A = {
  version: 1,
  programs: [
    {
      id: "e1000000-0000-4000-8000-0000000000a1",
      name: "Income insurance (demo)",
      source: "manual",
      imported_at: null,
      days_used: 14,
      notes: "Illustrative tiers for the Planning unemployment card.",
      tiers: [
        {
          id: "e1000000-0000-4000-8000-0000000000a2",
          order: 0,
          label: "Initial tier",
          duration_days: 150,
          compensation_per_day: 918,
        },
        {
          id: "e1000000-0000-4000-8000-0000000000a3",
          order: 1,
          label: "Reduced tier",
          duration_days: 250,
          compensation_per_day: 661,
        },
      ],
    },
  ],
};

const UEMP_B = {
  version: 1,
  programs: [
    {
      id: "e1000000-0000-4000-8000-0000000000b1",
      name: "Supplementary coverage (demo)",
      source: "manual",
      imported_at: null,
      days_used: 0,
      notes: "Unused quota illustration for second adult.",
      tiers: [
        {
          id: "e1000000-0000-4000-8000-0000000000b2",
          order: 0,
          label: "Standard tier",
          duration_days: 300,
          compensation_per_day: 880,
        },
      ],
    },
  ],
};

const dayOverridesBase = [
  ["2025-04-17", "public_holiday"],
  ["2025-05-01", "public_holiday"],
  ["2025-05-29", "public_holiday"],
  ["2025-06-06", "public_holiday"],
  ["2025-12-24", "public_holiday"],
  ["2025-12-31", "public_holiday"],
  ["2026-01-01", "public_holiday"],
  ["2026-01-06", "public_holiday"],
  ["2025-07-14", "vacation"],
  ["2025-07-15", "vacation"],
  ["2025-07-16", "vacation"],
  ["2025-07-17", "vacation"],
  ["2025-07-18", "vacation"],
  ["2025-09-03", "sick"],
  ["2025-09-04", "sick"],
  ["2025-11-10", "ad_hoc"],
];

const PER_EMPLOYED = "a1000000-0000-4000-8000-000000000031";

const dayOverrides = dayOverridesBase.map(([date, reason], i) => ({
  id: `c1000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  period_id: PER_EMPLOYED,
  entity_id: E_ADULT_A,
  date,
  override_type: "inactive",
  reason,
  notes: null,
  created_at: nowTs,
}));

const snapshot = {
  version: 1,
  households: [
    {
      id: HID,
      name: "Two-adult demo household",
      currency: "SEK",
      country: "SE",
      city: "Stockholm",
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
    },
  ],
  entities: [
    {
      id: E_ADULT_A,
      household_id: HID,
      type: "adult",
      name: "Adult A — employed",
      birth_date: "1989-04-12",
      tax_id: null,
      metadata: {
        auth_user_id: DEM_AUTH,
        unemployment_benefits: UEMP_A,
      },
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: E_ADULT_B,
      household_id: HID,
      type: "adult",
      name: "Adult B — parental leave",
      birth_date: "1991-09-03",
      tax_id: null,
      metadata: {
        annual_sgi: 502_000,
        modeled_parental_benefit_routing_v1: {
          from_account_id: null,
          to_account_id: A_JOINT,
        },
        unemployment_benefits: UEMP_B,
      },
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: E_CHILD,
      household_id: HID,
      type: "child",
      name: "Child C",
      birth_date: "2024-06-01",
      tax_id: null,
      metadata: {
        parental_leave_snapshot: {
          source: "demo_seed",
          imported_at: "2026-04-20T12:00:00.000Z",
          days_total_allowance: 480,
          days_remaining_total: 165,
          days_remaining_du: 72,
          days_remaining_annan_foralder: 93,
          portal_du_adult: { entity_id: E_ADULT_A, name: "Adult A — employed" },
          portal_annan_foralder_adults: [{ entity_id: E_ADULT_B, name: "Adult B — parental leave" }],
        },
      },
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: E_EMPL,
      household_id: HID,
      type: "company",
      name: "Sample employer AB",
      birth_date: null,
      tax_id: null,
      metadata: {},
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
  ],
  accounts: [
    {
      id: A_CHECK,
      entity_id: E_ADULT_A,
      type: "bank",
      name: "Personal checking",
      iban: null,
      currency: "SEK",
      balance_snapshot: 28_450,
      balance_snapshot_date: "2026-05-01",
      bank_name: "Demo Bank",
      csv_parser_config_id: null,
      is_active: true,
      metadata: {},
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: A_SAVE,
      entity_id: E_ADULT_A,
      type: "savings",
      name: "Household buffer",
      iban: null,
      currency: "SEK",
      balance_snapshot: 192_400,
      balance_snapshot_date: "2026-05-01",
      bank_name: "Demo Bank",
      csv_parser_config_id: null,
      is_active: true,
      metadata: {},
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: A_JOINT,
      entity_id: E_ADULT_A,
      type: "bank",
      name: "Joint operating account",
      iban: null,
      currency: "SEK",
      balance_snapshot: 58_900,
      balance_snapshot_date: "2026-05-01",
      bank_name: "Demo Bank",
      csv_parser_config_id: null,
      is_active: true,
      metadata: { shared: true, co_entity_ids: [E_ADULT_A, E_ADULT_B] },
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: A_LOAN,
      entity_id: E_ADULT_A,
      type: "loan",
      name: "Home mortgage",
      iban: null,
      currency: "SEK",
      balance_snapshot: -2_622_000,
      balance_snapshot_date: "2026-05-01",
      bank_name: "Demo Bank",
      csv_parser_config_id: null,
      is_active: true,
      metadata: {},
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
  ],
  periods: [
    {
      id: PER_EMPLOYED,
      entity_id: E_ADULT_A,
      type: "employed",
      date_from: "2023-06-01",
      date_to: null,
      pct_fte: 100,
      weekly_pattern: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      },
      employer_entity_id: E_EMPL,
      notes: "Full-time sample employment",
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000032",
      entity_id: E_ADULT_B,
      type: "parental_leave",
      date_from: "2025-08-01",
      date_to: "2026-12-31",
      pct_fte: null,
      weekly_pattern: null,
      employer_entity_id: E_EMPL,
      notes: "Parental leave — benefit modeled from SGI metadata",
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000033",
      entity_id: E_CHILD,
      type: "daycare",
      date_from: "2025-09-01",
      date_to: null,
      pct_fte: null,
      weekly_pattern: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      },
      employer_entity_id: null,
      notes: "Daycare weekdays",
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
  ],
  dayOverrides,
  cashflows: [
    {
      id: "a1000000-0000-4000-8000-000000000041",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: null,
      to_account_id: A_JOINT,
      direction: "income",
      category: "salary",
      name: "Salary (gross)",
      amount: 45_900,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-06-01",
      date_to: null,
      is_gross: true,
      tax_rate_override: null,
      notes: "Paid into joint account",
      employment_active_from: "2023-06-01",
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000042",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "mortgage",
      name: "Mortgage & housing association",
      amount: 13_250,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2024-03-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: "BRF avgift + lånekostnad",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000043",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "childcare",
      name: "Daycare fee",
      amount: 1620,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2025-09-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: null,
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000044",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "groceries",
      name: "Groceries",
      amount: 9050,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-06-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: null,
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000045",
      entity_id: E_ADULT_A,
      account_id: null,
      from_account_id: A_JOINT,
      to_account_id: A_SAVE,
      direction: "expense",
      category: "savings_transfer",
      name: "Monthly buffer sweep",
      amount: 5200,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2024-04-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: "Joint → personal savings (internal move)",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000046",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: A_CHECK,
      direction: "expense",
      category: "savings_transfer",
      name: "Personal spending transfer",
      amount: 1500,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-08-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: "Joint → personal checking pocket money",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000047",
      entity_id: E_ADULT_A,
      account_id: A_CHECK,
      from_account_id: A_CHECK,
      to_account_id: null,
      direction: "expense",
      category: "transport",
      name: "Commute & transit",
      amount: 890,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-06-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: null,
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000048",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "utility",
      name: "Utilities (district heat + grid)",
      amount: 2390,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-06-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: null,
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000049",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "insurance",
      name: "Home contents & umbrella liability",
      amount: 1085,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-06-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: null,
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000070",
      entity_id: E_ADULT_A,
      account_id: A_CHECK,
      from_account_id: A_CHECK,
      to_account_id: null,
      direction: "expense",
      category: "subscription",
      name: "Streaming & software",
      amount: 418,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-06-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: null,
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000071",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "rent",
      name: "Rent (prior tenancy)",
      amount: 13_950,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-06-01",
      date_to: "2024-02-29",
      is_gross: false,
      tax_rate_override: null,
      notes: "Historik innan lägenhetsbyte / bolån",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000072",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "subscription",
      name: "Broadband + mobile family bundle",
      amount: 679,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-06-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: "Fiber + två mobilabonnemang (autogiro)",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000073",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "insurance",
      name: "Motor insurance (quarterly)",
      amount: 2040,
      currency: "SEK",
      frequency: "quarterly",
      date_from: "2024-01-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: "Autogiro varje kvartal",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000074",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "other",
      name: "Pharmacy & health recurring",
      amount: 298,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2023-06-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: "Läkemedelsavgifter, hälsokost",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000075",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: null,
      to_account_id: A_JOINT,
      direction: "income",
      category: "dividend",
      name: "Equity dividends (custody)",
      amount: 1120,
      currency: "SEK",
      frequency: "quarterly",
      date_from: "2024-06-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: "Likvid från depå först till gemensamt konto",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000076",
      entity_id: E_ADULT_A,
      account_id: A_CHECK,
      from_account_id: A_CHECK,
      to_account_id: null,
      direction: "expense",
      category: "other",
      name: "Gym & swim card",
      amount: 429,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2024-01-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: null,
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000077",
      entity_id: E_ADULT_A,
      account_id: A_JOINT,
      from_account_id: A_JOINT,
      to_account_id: null,
      direction: "expense",
      category: "other",
      name: "Kids clothing & outings",
      amount: 548,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2025-03-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: "Snitt inkl. leksaker/småköp snitt över månaden",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
    {
      id: "a1000000-0000-4000-8000-000000000078",
      entity_id: E_ADULT_A,
      account_id: A_CHECK,
      from_account_id: A_CHECK,
      to_account_id: null,
      direction: "expense",
      category: "transport",
      name: "Fuel & parking — personal car",
      amount: 1180,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2024-02-01",
      date_to: null,
      is_gross: false,
      tax_rate_override: null,
      notes: "Privat bilekonomi (kompletterar pendel på reskassa)",
      employment_active_from: null,
      employment_active_until: null,
      metadata: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
  ],
  loans: [
    {
      id: "a1000000-0000-4000-8000-000000000051",
      account_id: A_LOAN,
      name: "Home mortgage",
      type: "mortgage",
      rate_type: "floating",
      principal: 2_790_000,
      outstanding: 2_622_000,
      interest_rate: 4.78,
      rate_index: "STIBOR 3M",
      rate_margin: 0.86,
      rate_fixed_until: null,
      amortization_type: "annuity",
      monthly_payment: 13_850,
      start_date: "2024-03-01",
      end_date: "2054-03-01",
      currency: "SEK",
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
    },
  ],
  /** Explicit rows only — parental leave compensation is modeled in projection from SE rules + metadata.annual_sgi. */
  benefits: [
    {
      id: "a1000000-0000-4000-8000-000000000062",
      entity_id: E_CHILD,
      period_id: null,
      type: "child_benefit",
      source: "manual",
      amount: 1870,
      currency: "SEK",
      frequency: "monthly",
      date_from: "2024-07-01",
      date_to: null,
      is_taxable: false,
      notes: "Child allowance (demo)",
      import_batch_id: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
      archived_at: null,
    },
  ],
  transactions: buildTransactions(),
  taxProfiles: [
    {
      id: "a1000000-0000-4000-8000-000000000081",
      entity_id: E_ADULT_A,
      year: 2026,
      method: "flat_rate",
      flat_rate: 0.31,
      brackets: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
    },
    {
      id: "a1000000-0000-4000-8000-000000000082",
      entity_id: E_ADULT_B,
      year: 2026,
      method: "flat_rate",
      flat_rate: 0.28,
      brackets: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
    },
  ],
  scenarios: [
    {
      id: "a1000000-0000-4000-8000-000000000091",
      household_id: HID,
      name: "Baseline (demo)",
      description: "Sample projection assumptions",
      is_baseline: true,
      period_overrides: [],
      assumption_overrides: {},
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: nowTs,
    },
  ],
  cardLayouts: [],
  /**
   * Applied when hydrating demo mock — seeds Planning gauges (browser local card values store).
   * Parental FK snapshot above still drives the leave card unless the user edits manual fields.
   */
  cardValuesSeed: {
    planning: {
      parentalByChild: {
        [E_CHILD]: {
          available: 390,
          used: 285,
          adultUsed: { [E_ADULT_A]: 118, [E_ADULT_B]: 167 },
          benefitLevel: 502_000,
        },
      },
      holidayByAdult: {
        [E_ADULT_A]: { available: 32, used: 11 },
        [E_ADULT_B]: { available: 34, used: 8 },
      },
    },
    overview: { accountBalanceMonthlyDrift: 0.04, cashflowBarSpreadPct: 0.12 },
  },
};

writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.warn(`Wrote ${outPath}`);
