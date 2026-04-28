import { useState } from "react";
import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import { useBackend } from "@/hooks/useBackend";
import { formatSEK } from "@/lib/utils";
import {
  Users, Wallet, ArrowDownUp, Building2, Plus, Archive,
  Upload, FileSpreadsheet, ChevronDown, ChevronUp,
} from "lucide-react";
import type {
  EntityType, AccountType, CashflowDirection, CashflowCategory, Frequency,
} from "@/types/schema";

function FlowDiagramCardContent() {
  const { cashflows } = useAppStore();
  const incomes = cashflows.filter(c => c.direction === "income");
  const expenses = cashflows.filter(c => c.direction === "expense");
  const totalIn = incomes.reduce((s, c) => s + c.amount, 0);
  const totalOut = expenses.reduce((s, c) => s + c.amount, 0);
  const net = totalIn - totalOut;

  const incomeByCat = incomes.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount;
    return acc;
  }, {});
  const expenseByCat = expenses.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total Income</p>
          <p className="text-lg font-bold tabular-nums text-income">{formatSEK(totalIn)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total Cost</p>
          <p className="text-lg font-bold tabular-nums text-expense">{formatSEK(totalOut)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Net Income</p>
          <p className={`text-lg font-bold tabular-nums ${net >= 0 ? "text-income" : "text-expense"}`}>{formatSEK(net)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Income Sources</h4>
          {Object.entries(incomeByCat).sort(([,a],[,b]) => b - a).map(([cat, amt]) => (
            <div key={cat} className="flex justify-between text-xs py-0.5">
              <span className="text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</span>
              <span className="tabular-nums text-income">{formatSEK(amt)}</span>
            </div>
          ))}
          {Object.keys(incomeByCat).length === 0 && <p className="text-xs text-muted-foreground">No income</p>}
        </div>
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Expense Buckets</h4>
          {Object.entries(expenseByCat).sort(([,a],[,b]) => b - a).map(([cat, amt]) => (
            <div key={cat} className="flex justify-between text-xs py-0.5">
              <span className="text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</span>
              <span className="tabular-nums text-expense">{formatSEK(amt)}</span>
            </div>
          ))}
          {Object.keys(expenseByCat).length === 0 && <p className="text-xs text-muted-foreground">No expenses</p>}
        </div>
      </div>
    </div>
  );
}

function EntityManagerCardContent() {
  const { entities, household, refresh } = useAppStore();
  const backend = useBackend();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<EntityType>("adult");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (!name.trim() || !household) return;
    setBusy(true);
    try {
      await backend.upsertEntity({
        id: crypto.randomUUID(),
        household_id: household.id,
        type,
        name: name.trim(),
        birth_date: null,
        tax_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      setName("");
      setAdding(false);
      await refresh();
    } catch (err) {
      console.error("Failed to add entity:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (id: string) => {
    setBusy(true);
    try {
      await backend.archiveEntity(id);
      await refresh();
    } catch (err) {
      console.error("Failed to archive entity:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {entities.map(e => (
          <div key={e.id} className="flex items-center justify-between p-2.5 rounded-bento-inner bg-muted/30">
            <div>
              <span className="text-sm font-medium">{e.name}</span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">{e.type}</span>
            </div>
            <button onClick={() => handleArchive(e.id)} disabled={busy} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
              <Archive className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {entities.length === 0 && <p className="text-xs text-muted-foreground">No entities yet</p>}
      </div>

      {adding ? (
        <div className="p-3 rounded-bento-inner bg-muted/20 space-y-2">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <select value={type} onChange={e => setType(e.target.value as EntityType)} className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border">
            <option value="adult">Adult</option>
            <option value="child">Child</option>
            <option value="company">Company</option>
          </select>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? "Saving..." : "Add"}
            </button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/80">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add entity
        </button>
      )}
    </div>
  );
}

function AccountManagerCardContent() {
  const { accounts, entities, household, refresh } = useAppStore();
  const backend = useBackend();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<AccountType>("bank");
  const [busy, setBusy] = useState(false);

  const byEntity = entities.map(e => ({
    entity: e,
    accounts: accounts.filter(a => a.entity_id === e.id),
  }));

  const handleAddAccount = async (entityId: string) => {
    if (!accName.trim() || !household) return;
    setBusy(true);
    try {
      await backend.upsertAccount({
        id: crypto.randomUUID(),
        entity_id: entityId,
        type: accType,
        name: accName.trim(),
        iban: null,
        currency: household.currency,
        balance_snapshot: 0,
        balance_snapshot_date: null,
        bank_name: null,
        csv_parser_config_id: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      setAccName("");
      setAddingFor(null);
      await refresh();
    } catch (err) {
      console.error("Failed to add account:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveAccount = async (id: string) => {
    setBusy(true);
    try {
      await backend.archiveAccount(id);
      await refresh();
    } catch (err) {
      console.error("Failed to archive account:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {byEntity.map(({ entity, accounts: accts }) => (
        <div key={entity.id}>
          <button
            onClick={() => setExpanded(expanded === entity.id ? null : entity.id)}
            className="flex items-center justify-between w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <span className="text-sm font-medium">{entity.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{accts.length} account{accts.length !== 1 ? "s" : ""}</span>
              {expanded === entity.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>
          {expanded === entity.id && (
            <div className="ml-2 space-y-1.5 mt-1">
              {accts.map(a => (
                <div key={a.id} className="flex items-center justify-between p-2 rounded-bento-inner bg-muted/30 text-xs">
                  <div>
                    <span className="font-medium">{a.name}</span>
                    <span className="ml-2 text-muted-foreground capitalize">{a.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{formatSEK(a.balance_snapshot || 0)}</span>
                    <button onClick={() => handleArchiveAccount(a.id)} disabled={busy} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
                      <Archive className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              {accts.length === 0 && <p className="text-xs text-muted-foreground pl-2">No accounts</p>}

              {addingFor === entity.id ? (
                <div className="p-2 rounded-bento-inner bg-muted/20 space-y-2 mt-2">
                  <input type="text" placeholder="Account name" value={accName} onChange={e => setAccName(e.target.value)} className="w-full px-3 py-1.5 text-xs rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <select value={accType} onChange={e => setAccType(e.target.value as AccountType)} className="w-full px-3 py-1.5 text-xs rounded-lg bg-card border border-border">
                    <option value="bank">Bank</option>
                    <option value="savings">Savings</option>
                    <option value="investment">Investment</option>
                    <option value="loan">Loan</option>
                    <option value="pension">Pension</option>
                    <option value="credit">Credit</option>
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => handleAddAccount(entity.id)} disabled={busy} className="px-3 py-1.5 text-[10px] rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">{busy ? "Saving..." : "Add"}</button>
                    <button onClick={() => setAddingFor(null)} className="px-3 py-1.5 text-[10px] rounded-lg bg-muted text-muted-foreground hover:bg-muted/80">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setAddingFor(entity.id); setAccName(""); }} className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 mt-1 ml-2">
                  <Plus className="w-3 h-3" /> Add account
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {entities.length === 0 && <p className="text-xs text-muted-foreground">Add entities first</p>}
    </div>
  );
}

function CashflowManagerCardContent() {
  const { cashflows, entities, household, refresh } = useAppStore();
  const backend = useBackend();
  const [adding, setAdding] = useState(false);
  const [cfName, setCfName] = useState("");
  const [cfEntityId, setCfEntityId] = useState("");
  const [cfDirection, setCfDirection] = useState<CashflowDirection>("income");
  const [cfCategory, setCfCategory] = useState<CashflowCategory>("salary");
  const [cfAmount, setCfAmount] = useState("");
  const [cfFreq, setCfFreq] = useState<Frequency>("monthly");
  const [busy, setBusy] = useState(false);

  const incomes = cashflows.filter(c => c.direction === "income");
  const expenses = cashflows.filter(c => c.direction === "expense");

  const handleAdd = async () => {
    if (!cfName.trim() || !cfEntityId || !cfAmount || !household) return;
    setBusy(true);
    try {
      await backend.upsertCashflow({
        id: crypto.randomUUID(),
        entity_id: cfEntityId,
        account_id: null,
        direction: cfDirection,
        category: cfCategory,
        name: cfName.trim(),
        amount: Math.abs(Number(cfAmount)),
        currency: household.currency,
        frequency: cfFreq,
        date_from: new Date().toISOString().slice(0, 10),
        date_to: null,
        is_gross: cfDirection === "income",
        tax_rate_override: null,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      setCfName("");
      setCfAmount("");
      setAdding(false);
      await refresh();
    } catch (err) {
      console.error("Failed to add cashflow:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (id: string) => {
    setBusy(true);
    try {
      await backend.archiveCashflow(id);
      await refresh();
    } catch (err) {
      console.error("Failed to archive cashflow:", err);
    } finally {
      setBusy(false);
    }
  };

  const renderGroup = (flows: typeof cashflows, title: string) => (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-2">{title}</h4>
      <div className="space-y-1">
        {flows.map(c => {
          const entity = entities.find(e => e.id === c.entity_id);
          return (
            <div key={c.id} className="flex items-center justify-between p-2 rounded-bento-inner bg-muted/30 text-xs">
              <div className="min-w-0">
                <span className="font-medium truncate">{c.name}</span>
                <span className="ml-1.5 text-muted-foreground">{entity?.name}</span>
                <span className="ml-1.5 text-muted-foreground/60 capitalize">{c.frequency}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className={`tabular-nums ${c.direction === "income" ? "text-income" : "text-expense"}`}>
                  {c.direction === "expense" ? "−" : "+"}{formatSEK(c.amount)}
                </span>
                <button onClick={() => handleArchive(c.id)} disabled={busy} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
                  <Archive className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
        {flows.length === 0 && <p className="text-xs text-muted-foreground">None configured</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {renderGroup(incomes, "Income Streams")}
      {renderGroup(expenses, "Recurring Expenses")}

      {adding ? (
        <div className="p-3 rounded-bento-inner bg-muted/20 space-y-2">
          <input type="text" placeholder="Name (e.g. Salary, Rent)" value={cfName} onChange={e => setCfName(e.target.value)} className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="grid grid-cols-2 gap-2">
            <select value={cfDirection} onChange={e => setCfDirection(e.target.value as CashflowDirection)} className="px-3 py-1.5 text-sm rounded-lg bg-card border border-border">
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select value={cfCategory} onChange={e => setCfCategory(e.target.value as CashflowCategory)} className="px-3 py-1.5 text-sm rounded-lg bg-card border border-border">
              <option value="salary">Salary</option>
              <option value="dividend">Dividend</option>
              <option value="freelance">Freelance</option>
              <option value="rent">Rent</option>
              <option value="mortgage">Mortgage</option>
              <option value="childcare">Childcare</option>
              <option value="groceries">Groceries</option>
              <option value="transport">Transport</option>
              <option value="insurance">Insurance</option>
              <option value="subscription">Subscription</option>
              <option value="utility">Utility</option>
              <option value="loan_repayment">Loan Repayment</option>
              <option value="savings_transfer">Savings Transfer</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="Amount" value={cfAmount} onChange={e => setCfAmount(e.target.value)} className="px-3 py-1.5 text-sm rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <select value={cfFreq} onChange={e => setCfFreq(e.target.value as Frequency)} className="px-3 py-1.5 text-sm rounded-lg bg-card border border-border">
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
              <option value="one_off">One-off</option>
            </select>
          </div>
          <select value={cfEntityId} onChange={e => setCfEntityId(e.target.value)} className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border">
            <option value="">Select entity...</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={busy || !cfEntityId} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">{busy ? "Saving..." : "Add"}</button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/80">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add cashflow
        </button>
      )}
    </div>
  );
}

function LoanManagerCardContent() {
  const { loans } = useAppStore();
  return (
    <div className="space-y-2">
      {loans.map(l => (
        <div key={l.id} className="p-2.5 rounded-bento-inner bg-muted/30 text-xs">
          <div className="flex justify-between mb-1">
            <span className="font-medium">{l.name}</span>
            <span className="tabular-nums text-expense">{formatSEK(l.outstanding)}</span>
          </div>
          <div className="flex gap-3 text-muted-foreground">
            <span>{(l.interest_rate * 100).toFixed(2)}%</span>
            <span className="capitalize">{l.rate_type}</span>
            <span className="capitalize">{l.amortization_type.replace(/_/g, " ")}</span>
          </div>
        </div>
      ))}
      {loans.length === 0 && <p className="text-xs text-muted-foreground">No loans configured</p>}
    </div>
  );
}

function CsvImportCardContent() {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
        <Upload className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium mb-1">Import Bank CSV</p>
      <p className="text-xs text-muted-foreground mb-3">Drag & drop or click to upload a CSV file from your bank</p>
      <button className="px-4 py-2 text-xs rounded-bento-inner bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
        Choose file
      </button>
    </div>
  );
}

export function DataSettingsPage() {
  const cards: BentoCardDefinition[] = [
    {
      id: "flow-diagram",
      title: "Finance Flow",
      defaultSize: "full",
      render: (p) => (
        <Card title="Finance Flow" subtitle="Income → Accounts → Costs" icon={<ArrowDownUp className="w-4 h-4" />} {...p}>
          <FlowDiagramCardContent />
        </Card>
      ),
    },
    {
      id: "entity-manager",
      title: "Entities",
      defaultSize: "small",
      render: (p) => (
        <Card title="Entities" subtitle="People & companies" icon={<Users className="w-4 h-4" />} {...p}>
          <EntityManagerCardContent />
        </Card>
      ),
    },
    {
      id: "account-manager",
      title: "Accounts",
      defaultSize: "small",
      render: (p) => (
        <Card title="Accounts" subtitle="Bank, savings, investments" icon={<Wallet className="w-4 h-4" />} {...p}>
          <AccountManagerCardContent />
        </Card>
      ),
    },
    {
      id: "cashflow-manager",
      title: "Cashflows",
      defaultSize: "medium",
      render: (p) => (
        <Card title="Cashflows" subtitle="Income & recurring expenses" icon={<ArrowDownUp className="w-4 h-4" />} {...p}>
          <CashflowManagerCardContent />
        </Card>
      ),
    },
    {
      id: "loan-manager",
      title: "Loans",
      defaultSize: "small",
      render: (p) => (
        <Card title="Loans" icon={<Building2 className="w-4 h-4" />} {...p}>
          <LoanManagerCardContent />
        </Card>
      ),
    },
    {
      id: "csv-import",
      title: "CSV Import",
      defaultSize: "small",
      render: (p) => (
        <Card title="CSV Import" icon={<FileSpreadsheet className="w-4 h-4" />} {...p}>
          <CsvImportCardContent />
        </Card>
      ),
    },
  ];

  return <BentoGrid tab="data" cards={cards} />;
}
