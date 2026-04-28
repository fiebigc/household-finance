{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Household Finance App — Database Schema",
  "version": "1.1.0",
  "design_conventions": {
    "soft_delete": {
      "strategy": "archived_at timestamp",
      "description": "All mutable domain tables (entities, accounts, periods, cashflows, benefits) use an archived_at nullable timestamp instead of hard deletes. Null = active. Archived rows are excluded from projections and UI by default but preserved for history, audit, and net-worth calculations.",
      "tables_affected": ["entities", "accounts", "periods", "cashflows", "benefits"],
      "query_convention": "Always filter WHERE archived_at IS NULL for active data. Use a dedicated archived view or toggle to show archived rows."
    },
    "scheduling_model": {
      "description": "Period scheduling uses two layers: (1) periods.weekly_pattern defines the recurring weekly structure, (2) period_day_overrides provides single-day exceptions. The projection engine resolves active days as: pattern days MINUS inactive overrides PLUS active overrides.",
      "resolution_order": ["period_day_overrides.override_type = active", "weekly_pattern", "period_day_overrides.override_type = inactive"]
    },
    "ids": "All primary keys are UUIDs (v4). Generated client-side or by the backend.",
    "timestamps": "All created_at/updated_at are UTC ISO 8601. updated_at is maintained by a database trigger or ORM hook."
  },
  "tables": {
    "households": {
      "description": "Top-level container for all household data",
      "primaryKey": "id",
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "name": { "type": "string", "example": "Familie Müller" },
        "currency": { "type": "string", "default": "SEK", "example": "SEK" },
        "country": { "type": "string", "example": "SE" },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "name", "currency", "country"]
    },

    "entities": {
      "description": "A person or company belonging to a household",
      "primaryKey": "id",
      "foreignKeys": {
        "household_id": "households.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "household_id": { "type": "string", "format": "uuid" },
        "type": {
          "type": "string",
          "enum": ["adult", "child", "company"],
          "description": "Determines which period types and benefit types are applicable"
        },
        "name": { "type": "string", "example": "Christian" },
        "birth_date": { "type": "string", "format": "date", "nullable": true },
        "tax_id": { "type": "string", "nullable": true, "description": "Personnummer or org number" },
        "metadata": {
          "type": "object",
          "description": "Arbitrary extra fields (e.g. org_number for company, nationality for adult)",
          "additionalProperties": true
        },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "archived_at": { "type": "string", "format": "date-time", "nullable": true, "description": "Soft-delete. Null = active. Set to timestamp to archive without losing history." }
      },
      "required": ["id", "household_id", "type", "name"]
    },

    "accounts": {
      "description": "A financial account owned by an entity",
      "primaryKey": "id",
      "foreignKeys": {
        "entity_id": "entities.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "entity_id": { "type": "string", "format": "uuid" },
        "type": {
          "type": "string",
          "enum": ["bank", "savings", "investment", "loan", "pension", "credit"]
        },
        "name": { "type": "string", "example": "SEB Privatkonto" },
        "iban": { "type": "string", "nullable": true },
        "currency": { "type": "string", "default": "SEK" },
        "balance_snapshot": {
          "type": "number",
          "description": "Latest known balance, updated on CSV import"
        },
        "balance_snapshot_date": { "type": "string", "format": "date", "nullable": true },
        "bank_name": { "type": "string", "nullable": true },
        "csv_parser_config_id": {
          "type": "string",
          "format": "uuid",
          "nullable": true,
          "description": "References csv_parser_configs for this account's bank format"
        },
        "is_active": { "type": "boolean", "default": true },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "archived_at": { "type": "string", "format": "date-time", "nullable": true, "description": "Soft-delete. Keeps all linked transactions and loans intact." }
      },
      "required": ["id", "entity_id", "type", "name", "currency"]
    },

    "periods": {
      "description": "A span of time during which an entity is in a particular mode (work, leave, care, etc.)",
      "primaryKey": "id",
      "foreignKeys": {
        "entity_id": "entities.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "entity_id": { "type": "string", "format": "uuid" },
        "type": {
          "type": "string",
          "enum": [
            "employed",
            "self_employed",
            "parental_leave",
            "unemployed",
            "unpaid_leave",
            "sick_leave",
            "daycare",
            "home",
            "school",
            "preschool"
          ],
          "description": "For adults: employed/self_employed/parental_leave/unemployed/unpaid_leave/sick_leave. For children: daycare/home/school/preschool."
        },
        "date_from": { "type": "string", "format": "date" },
        "date_to": { "type": "string", "format": "date", "nullable": true, "description": "Null = ongoing" },
        "pct_fte": {
          "type": "number",
          "minimum": 0,
          "maximum": 100,
          "nullable": true,
          "description": "Percentage of full-time equivalent. E.g. 80 for 80% employment. Used when weekly_pattern is not set."
        },
        "weekly_pattern": {
          "type": "object",
          "nullable": true,
          "description": "Which days of the week this period is active. Null = use pct_fte only. When set, overrides pct_fte for scheduling purposes.",
          "properties": {
            "monday":    { "type": "boolean", "default": false },
            "tuesday":   { "type": "boolean", "default": false },
            "wednesday": { "type": "boolean", "default": false },
            "thursday":  { "type": "boolean", "default": false },
            "friday":    { "type": "boolean", "default": false },
            "saturday":  { "type": "boolean", "default": false },
            "sunday":    { "type": "boolean", "default": false }
          },
          "example": { "monday": true, "tuesday": true, "wednesday": false, "thursday": true, "friday": true, "saturday": false, "sunday": false }
        },
        "employer_entity_id": {
          "type": "string",
          "format": "uuid",
          "nullable": true,
          "description": "If employed by own company, references the company entity"
        },
        "notes": { "type": "string", "nullable": true },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "archived_at": { "type": "string", "format": "date-time", "nullable": true, "description": "Soft-delete. Archived periods are excluded from projections but preserved in history." }
      },
      "required": ["id", "entity_id", "type", "date_from"]
    },

    "period_day_overrides": {
      "description": "Single-day exceptions to a period's weekly_pattern. Use to mark holidays, ad-hoc days off, or one-off work days.",
      "primaryKey": "id",
      "foreignKeys": {
        "period_id": "periods.id",
        "entity_id": "entities.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "period_id": { "type": "string", "format": "uuid", "description": "The parent period this override applies to" },
        "entity_id": { "type": "string", "format": "uuid", "description": "Denormalised for fast queries by entity" },
        "date": { "type": "string", "format": "date", "description": "The specific day being overridden" },
        "override_type": {
          "type": "string",
          "enum": ["active", "inactive"],
          "description": "active = work/care on a day the pattern says off. inactive = off on a day the pattern says on."
        },
        "reason": {
          "type": "string",
          "nullable": true,
          "enum": ["public_holiday", "sick", "vacation", "ad_hoc", "other"],
          "description": "Optional label shown in the planner UI"
        },
        "notes": { "type": "string", "nullable": true },
        "created_at": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "period_id", "entity_id", "date", "override_type"]
    },

    "cashflows": {
      "description": "Recurring or one-off income and expense entries linked to an entity",
      "primaryKey": "id",
      "foreignKeys": {
        "entity_id": "entities.id",
        "account_id": "accounts.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "entity_id": { "type": "string", "format": "uuid" },
        "account_id": { "type": "string", "format": "uuid", "nullable": true },
        "direction": {
          "type": "string",
          "enum": ["income", "expense"],
          "description": "Whether this flow adds or subtracts from the entity's cash"
        },
        "category": {
          "type": "string",
          "enum": [
            "salary",
            "dividend",
            "freelance",
            "rent",
            "mortgage",
            "childcare",
            "groceries",
            "transport",
            "insurance",
            "subscription",
            "utility",
            "loan_repayment",
            "savings_transfer",
            "other"
          ]
        },
        "name": { "type": "string", "example": "SEB mortgage payment" },
        "amount": { "type": "number", "description": "Gross amount in account currency" },
        "currency": { "type": "string", "default": "SEK" },
        "frequency": {
          "type": "string",
          "enum": ["daily", "weekly", "biweekly", "monthly", "quarterly", "annually", "one_off"]
        },
        "date_from": { "type": "string", "format": "date" },
        "date_to": { "type": "string", "format": "date", "nullable": true },
        "is_gross": {
          "type": "boolean",
          "default": true,
          "description": "If true, tax is applied by the projection engine"
        },
        "tax_rate_override": {
          "type": "number",
          "nullable": true,
          "description": "Override entity-level tax rate for this specific cashflow"
        },
        "notes": { "type": "string", "nullable": true },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "archived_at": { "type": "string", "format": "date-time", "nullable": true, "description": "Soft-delete. Archived cashflows excluded from projections but visible in history." }
      },
      "required": ["id", "entity_id", "direction", "category", "name", "amount", "currency", "frequency", "date_from"]
    },

    "loans": {
      "description": "A loan linked to an account, with amortization configuration",
      "primaryKey": "id",
      "foreignKeys": {
        "account_id": "accounts.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "account_id": { "type": "string", "format": "uuid" },
        "name": { "type": "string", "example": "Bostadslån SEB" },
        "type": {
          "type": "string",
          "enum": ["mortgage", "car", "student", "personal", "other"]
        },
        "rate_type": {
          "type": "string",
          "enum": ["fixed", "floating"]
        },
        "principal": { "type": "number", "description": "Original loan amount" },
        "outstanding": { "type": "number", "description": "Current remaining balance" },
        "interest_rate": {
          "type": "number",
          "description": "Annual interest rate as decimal, e.g. 0.045 for 4.5%"
        },
        "rate_index": {
          "type": "string",
          "nullable": true,
          "description": "For floating loans: reference rate name, e.g. STIBOR3M"
        },
        "rate_margin": {
          "type": "number",
          "nullable": true,
          "description": "For floating loans: bank margin on top of rate_index"
        },
        "rate_fixed_until": {
          "type": "string",
          "format": "date",
          "nullable": true,
          "description": "For fixed-rate periods on otherwise floating loans"
        },
        "amortization_type": {
          "type": "string",
          "enum": ["annuity", "straight_line", "interest_only", "custom"],
          "default": "annuity"
        },
        "monthly_payment": {
          "type": "number",
          "nullable": true,
          "description": "Fixed monthly payment (annuity). Computed or manually set."
        },
        "start_date": { "type": "string", "format": "date" },
        "end_date": { "type": "string", "format": "date", "nullable": true },
        "currency": { "type": "string", "default": "SEK" },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "account_id", "name", "type", "rate_type", "principal", "outstanding", "interest_rate", "amortization_type", "start_date", "currency"]
    },

    "benefits": {
      "description": "Social benefits received by an entity — either computed from rules or imported from CSV",
      "primaryKey": "id",
      "foreignKeys": {
        "entity_id": "entities.id",
        "period_id": "periods.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "entity_id": { "type": "string", "format": "uuid" },
        "period_id": { "type": "string", "format": "uuid", "nullable": true },
        "type": {
          "type": "string",
          "enum": [
            "parental_leave_pay",
            "unemployment_benefit",
            "child_benefit",
            "housing_allowance",
            "sickness_benefit",
            "pension_supplement",
            "other"
          ]
        },
        "source": {
          "type": "string",
          "enum": ["computed", "csv_import", "manual"],
          "description": "computed = auto-derived from rules, csv_import = from Försäkringskassan CSV, manual = hand-entered"
        },
        "amount": { "type": "number" },
        "currency": { "type": "string", "default": "SEK" },
        "frequency": {
          "type": "string",
          "enum": ["daily", "weekly", "monthly", "one_off"]
        },
        "date_from": { "type": "string", "format": "date" },
        "date_to": { "type": "string", "format": "date", "nullable": true },
        "is_taxable": { "type": "boolean", "default": false },
        "notes": { "type": "string", "nullable": true },
        "import_batch_id": {
          "type": "string",
          "format": "uuid",
          "nullable": true,
          "description": "References the csv_imports batch this was loaded from"
        },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "archived_at": { "type": "string", "format": "date-time", "nullable": true, "description": "Soft-delete. Preserves imported benefit history even if entry is removed from active view." }
      },
      "required": ["id", "entity_id", "type", "source", "amount", "currency", "frequency", "date_from"]
    },

    "transactions": {
      "description": "Individual bank transactions imported from CSV",
      "primaryKey": "id",
      "foreignKeys": {
        "account_id": "accounts.id",
        "import_batch_id": "csv_imports.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "account_id": { "type": "string", "format": "uuid" },
        "import_batch_id": { "type": "string", "format": "uuid", "nullable": true },
        "date": { "type": "string", "format": "date" },
        "amount": { "type": "number", "description": "Negative = debit, positive = credit" },
        "currency": { "type": "string", "default": "SEK" },
        "description": { "type": "string", "description": "Raw bank description text" },
        "category": {
          "type": "string",
          "nullable": true,
          "description": "Auto-categorised or manually overridden"
        },
        "cashflow_id": {
          "type": "string",
          "format": "uuid",
          "nullable": true,
          "description": "If matched to a recurring cashflow"
        },
        "is_reviewed": { "type": "boolean", "default": false },
        "notes": { "type": "string", "nullable": true },
        "created_at": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "account_id", "date", "amount", "currency", "description"]
    },

    "csv_parser_configs": {
      "description": "Per-bank column mapping config for CSV imports",
      "primaryKey": "id",
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "household_id": { "type": "string", "format": "uuid" },
        "bank_name": { "type": "string", "example": "SEB" },
        "file_type": {
          "type": "string",
          "enum": ["bank_statement", "loan_statement", "benefit_payment", "expense_export"]
        },
        "delimiter": { "type": "string", "default": "," },
        "encoding": { "type": "string", "default": "UTF-8" },
        "skip_rows": { "type": "integer", "default": 0, "description": "Number of header rows to skip" },
        "column_map": {
          "type": "object",
          "description": "Maps logical field names to CSV column indices or header names",
          "properties": {
            "date": { "oneOf": [{ "type": "integer" }, { "type": "string" }] },
            "amount": { "oneOf": [{ "type": "integer" }, { "type": "string" }] },
            "description": { "oneOf": [{ "type": "integer" }, { "type": "string" }] },
            "balance": { "oneOf": [{ "type": "integer" }, { "type": "string" }], "nullable": true },
            "debit": { "oneOf": [{ "type": "integer" }, { "type": "string" }], "nullable": true },
            "credit": { "oneOf": [{ "type": "integer" }, { "type": "string" }], "nullable": true }
          }
        },
        "date_format": { "type": "string", "example": "YYYY-MM-DD" },
        "amount_sign_convention": {
          "type": "string",
          "enum": ["negative_is_debit", "positive_is_debit", "separate_columns"],
          "default": "negative_is_debit"
        },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "household_id", "bank_name", "file_type", "column_map", "date_format"]
    },

    "csv_imports": {
      "description": "Log of every CSV file imported",
      "primaryKey": "id",
      "foreignKeys": {
        "account_id": "accounts.id",
        "parser_config_id": "csv_parser_configs.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "account_id": { "type": "string", "format": "uuid", "nullable": true },
        "parser_config_id": { "type": "string", "format": "uuid" },
        "filename": { "type": "string" },
        "imported_at": { "type": "string", "format": "date-time" },
        "row_count": { "type": "integer" },
        "status": {
          "type": "string",
          "enum": ["pending", "complete", "error", "partial"]
        },
        "error_log": { "type": "string", "nullable": true }
      },
      "required": ["id", "parser_config_id", "filename", "imported_at", "status"]
    },

    "tax_profiles": {
      "description": "Tax configuration per entity (Swedish bracket system or flat rate)",
      "primaryKey": "id",
      "foreignKeys": {
        "entity_id": "entities.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "entity_id": { "type": "string", "format": "uuid" },
        "year": { "type": "integer", "example": 2025 },
        "method": {
          "type": "string",
          "enum": ["flat_rate", "brackets"],
          "default": "flat_rate"
        },
        "flat_rate": {
          "type": "number",
          "nullable": true,
          "description": "Effective tax rate as decimal, e.g. 0.32 for 32%"
        },
        "brackets": {
          "type": "array",
          "nullable": true,
          "description": "Used when method = brackets",
          "items": {
            "type": "object",
            "properties": {
              "from": { "type": "number" },
              "to": { "type": "number", "nullable": true },
              "rate": { "type": "number" }
            },
            "required": ["from", "rate"]
          }
        },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "entity_id", "year", "method"]
    },

    "projection_scenarios": {
      "description": "Named planning scenarios used in the Planning tab",
      "primaryKey": "id",
      "foreignKeys": {
        "household_id": "households.id"
      },
      "fields": {
        "id": { "type": "string", "format": "uuid" },
        "household_id": { "type": "string", "format": "uuid" },
        "name": { "type": "string", "example": "Christian back to work Sept 2025" },
        "description": { "type": "string", "nullable": true },
        "is_baseline": { "type": "boolean", "default": false },
        "period_overrides": {
          "type": "array",
          "description": "Scenario-specific period rows that override the base periods",
          "items": {
            "type": "object",
            "properties": {
              "entity_id": { "type": "string", "format": "uuid" },
              "type": { "type": "string" },
              "date_from": { "type": "string", "format": "date" },
              "date_to": { "type": "string", "format": "date", "nullable": true },
              "pct_fte": { "type": "number", "nullable": true }
            },
            "required": ["entity_id", "type", "date_from"]
          }
        },
        "assumption_overrides": {
          "type": "object",
          "description": "Key-value overrides e.g. { 'interest_rate_floating': 0.05 }",
          "additionalProperties": true
        },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "household_id", "name"]
    }
  }
}