# Design system — Bento dashboard (Household Finance Planner)

This document describes the visual language for the app, derived from the **bento-box dashboard** reference: white tiles on a soft gray canvas, generous corner radius, airy spacing, and a calm “productivity OS” feel (similar to Apple-style planner UIs). Use the user-provided reference screenshot as the primary visual anchor when evolving the shell.

---

## 1) Layout philosophy — Bento grid

- **Canvas**: A neutral, slightly cool gray background frames the grid (not pure white page chrome).
- **Tiles**: Primary content lives in **floating cards** with **large corner radius** and **soft, diffuse elevation** (no harsh borders as the main cue).
- **Grid**: On large viewports (`lg+`, ≥1024px), **Current Finances** and **Scenarios** use a **12-column CSS grid** with ~**16px gutters** (`gap-4`).
- **Spans**:
  - **Feature width** (~8/12 cols): time-series charts, wide tables.
  - **Side stack** (~4/12 cols): KPI tiles and compact controls read as a vertical column of smaller bento cells.
  - **Full bleed** (`span 12`): health modules, account groupings, recurring lanes, projection tables.
- **Mobile**: Single column; order matches the previous vertical stack so **no information is removed**—only reflowed.

### Mapping (reference UI → this app)

| Bento role (reference) | Household Finance surface |
|------------------------|---------------------------|
| Large hero tile | **Current Finances** CSV trend chart (+ macOS-style account toggle) |
| Medium / stacked tiles | **House value**, **Total loans**, **LTV** KPIs |
| Full-width summary strip | **Modeled cash flow** summary |
| Wide insight panel | **Household barometer** + **Pain points** (`DashboardHealthSection`) |
| Two medium tiles side-by-side | **Current household snapshot** + **Adult + company editable values** |
| Wide list / board | **All bank accounts** (grouped tables) |
| Wide interactive board | **Recurring cash flows** (lanes + drag/drop) |
| Small action tiles | **Tink** scaffold, **Save**, **Loans** |

Scenarios tab mirrors the same idea: **chart = feature tile**, **scenario picker + KPIs = side stack**, tables and forms **full width**.

---

## 2) Color and surfaces

- **Cards**: Near-white (`--card`), high clarity for numbers.
- **Canvas**: Light gray (`--background`), slightly separated from card white.
- **Semantic finance colors** (unchanged): income, expense, runway — use for **meaning**, not decoration.
- **Accents** (icons, toggles, primary actions): saturated but restrained blues/greens; avoid neon unrelated to data.

Dark mode: keep existing CSS variable hooks; cards remain elevated via shadow + subtle border.

---

## 3) Typography

- **System sans** stack (SF Pro / system-ui) per Tailwind theme.
- **Tile titles**: Semibold, tight tracking; primary headline in app header slightly larger.
- **Supporting copy**: `text-muted-foreground`, smaller where appropriate (KPI labels, hints).
- **Numbers**: Prefer tabular alignment where KPIs align in a column.

---

## 4) Shape, depth, and motion

- **Corner radius**: **~22–24px** on cards (bento “soft tile”); inner controls can stay slightly tighter (`rounded-[10px]` for inputs/tables).
- **Elevation**: Soft **bento shadow** (diffuse, low contrast)—see `shadow-bento` in Tailwind.
- **Borders**: Light hairline for separation; shadow carries most of the “float.”
- **Motion**: Prefer **short, ease-out** transitions on toggles and hover; no ornamental animation on data reads.

---

## 5) Components

- **Tabs**: Segmented control on a **muted pill track** (`rounded-2xl`), active trigger reads as a **raised chip**.
- **Buttons**: Clear hierarchy—primary actions solid; secondary/outline for Settings; ghost for table edits.
- **macOS-style switch**: Pill track + thumb for boolean preferences (e.g. show per-account series).
- **Settings**: Modal panel, not a tab—keeps the main surface uncluttered like the reference.
- **Dashboard card controls**: Overview cards must remain user-configurable. Each card should expose keyboard/touch controls to move up/down in the bento order, hide the card, and restore hidden cards from a compact dashboard control strip.

---

## 6) Data density and accessibility

- **Do** keep recurring help text, disclaimers, and CSV debug hints where they already exist.
- **Do** preserve horizontal scroll on wide tables on small screens.
- **Don’t** hide series or KPIs behind hover-only affordances without a tap/keyboard path.
- **Contrast**: Legend and small labels must remain readable on the light card surface.

---

## 7) Responsive breakpoints

- **360px+**: Usable single column; chart height capped via `.chart-wrap`.
- **`lg` (1024px+)**: Bento 12-column grid activates; chart + KPI column appear side-by-side.
- **Max width**: `page-shell` continues to cap overall width for readability on ultrawide displays.

---

## 8) Agent / implementation checklist

When changing UI:

1. Prefer **`finance-bento`** + **`bento-span-*`** utilities in `src/index.css` over ad-hoc flex hacks for main dashboard sections.
2. Use **`Card`** from `src/components/ui/Card.tsx` for surfaces (radius + shadow centralized).
3. Keep **financial logic** out of components—only layout and presentation here.
4. After layout changes, verify **both tabs** and **mobile + lg** viewports.

---

## 9) Doodle mapping

The `ui/` doodles refine the app surfaces:

- **Overview**: hero account chart spans the main row, with compact KPI cards for household health, total loan, fixed costs, net, income, investments, and account focus. Cards are movable, hidable, and re-addable.
- **Planning**: calendar is the feature tile; account/entity chips and planning activity controls form the side stack; benefit/leave/unemployment cards use compact gauges and KPI rows.
- **Data & Settings**: top overview reads as a finance flow diagram from income streams into accounts/cost buckets, followed by grouped account/entity edit cards.

---

## 10) Changelog note

Earlier drafts of this file referenced a dark Supabase-style baseline. **The product direction for the dashboard shell is now the bento reference above**; semantic finance colors and accessibility rules remain in force.
