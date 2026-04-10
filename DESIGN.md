# DESIGN.md

This file defines the visual system for the Household Finance App.

Baseline inspiration: Supabase preset from the awesome-design-md collection:
https://github.com/VoltAgent/awesome-design-md

## 1) Visual Theme and Atmosphere

- Dark, calm, data-focused interface.
- Dense enough for financial information, but not cluttered.
- Emphasis on trust and clarity over decorative motion.

## 2) Color Palette and Roles

- `--background`: deep slate base for focus.
- `--card`: slightly elevated surface for modules.
- `--primary`: emerald action color for confirmations and positive outcomes.
- `--finance-income`: semantic positive metric.
- `--finance-expense`: semantic negative metric.
- `--finance-runway`: warning/attention metric for runway and risk.

## 3) Typography Rules

- Sans-serif stack with strong legibility at small sizes.
- Headings: semibold with tight spacing.
- Body: regular with muted secondary text for metadata.

## 4) Component Stylings

- Buttons: rounded medium corners, high-contrast states.
- Cards: subtle borders and low-elevation shadows.
- Inputs/selects: restrained outlines and clear focus rings.
- Tabs: compact segmented control for feature-level navigation.
- Dialogs: minimal modal with clear outcome summary.

## 5) Layout Principles

- Container-based layout with consistent spacing scale.
- Mobile-first stacking; multi-column only at larger breakpoints.
- Keep critical health metrics visible near top of dashboard.

## 6) Depth and Elevation

- Two primary surface layers: background and card.
- Use border contrast first; shadow second.

## 7) Do and Don't

- Do use semantic finance colors only for meaning, not decoration.
- Do keep forms and controls compact and direct.
- Don't introduce neon accents unrelated to data semantics.
- Don't rely on color alone; pair with labels/text.

## 8) Responsive Behavior

- 360px support is required for v1.
- Tabs collapse naturally to a compact multi-row layout on small viewports.
- Table container must remain horizontally scrollable when needed.

## 9) Agent Prompt Guide

If generating UI:

- Use Tailwind CSS with CSS variables from `src/index.css`.
- Use shadcn-style primitives from `src/components/ui`.
- Prefer dashboard cards, compact tables, and clear status badges.
