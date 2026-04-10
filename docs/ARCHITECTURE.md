# Architecture

## Goal
Build a scenario-driven family and business finance dashboard that handles multiple income and cost sources with affordability and runway logic.

## System Design (v1)

- Frontend: Vite + React + TypeScript
- Backend: Supabase Postgres + Row Level Security
- Optional: Supabase Edge Functions for server-side affordability checks
- Deployment: Cloudflare Pages (frontend) + Supabase (backend)

## Core Modules

1. Data ingestion (manual transactions)
2. Classification (income/cost categories)
3. Scenario engine (work time, parental leave days, unemployment level, subsidies)
4. Affordability engine (`canAfford`)
5. Dashboard and mobile-first UI

## Data Domains

- Household profiles (adults, children)
- Optional business entities (side business / company)
- Accounts and transactions
- Income states and components
- Costs and recurring obligations
- Goals and buffer constraints

## Recommended Boundary

- Frontend owns interaction, charts, and simulation controls.
- Backend owns persistence, auth, and policy rules.
- Affordability logic can start client-side, then move to Edge Functions if needed.

## Non-Functional Requirements

- Mobile-first responsive layout
- Fast page loads for dashboard summaries
- Traceable calculations (explain why affordability passes/fails)
- Monthly locking for accounting correctness
