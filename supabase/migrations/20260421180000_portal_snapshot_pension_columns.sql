-- Extend portal_snapshot: optional `pensionColumns` (array) for one pension block per household member.
-- Optional per-column `ownerAccountRef` (e.g. auth user id) and `displayLabel` (shown in UI). Values belong in DB only.
-- Migrates legacy root `pensionFrom65` / `premiepension` into two columns when `pensionColumns` is absent.

comment on column public.app_household_planning.portal_snapshot is
  'Planning reference JSON: sourceNote, unto, aaro (FK-style child day balances), and pensionColumns[] '
  'where each element has displayLabel, optional ownerAccountRef, pensionFrom65, premiepension. '
  'Legacy shape with root pensionFrom65 + premiepension is still supported by the app parser.';

update public.app_household_planning
set portal_snapshot =
  (portal_snapshot - 'pensionFrom65' - 'premiepension')
  || jsonb_build_object(
    'pensionColumns',
    jsonb_build_array(
      jsonb_build_object(
        'displayLabel',
        'Primary member — set displayLabel and ownerAccountRef in Supabase',
        'pensionFrom65',
        portal_snapshot->'pensionFrom65',
        'premiepension',
        portal_snapshot->'premiepension'
      ),
      jsonb_build_object(
        'displayLabel',
        'Second member — set displayLabel and ownerAccountRef in Supabase',
        'pensionFrom65',
        jsonb_build_object(
          'title',
          'Pension from age 65 (placeholder)',
          'salaryTodaySek',
          0,
          'brackets',
          jsonb_build_array(jsonb_build_object('label', '65+', 'sekPerMonth', 0))
        ),
        'premiepension',
        jsonb_build_object(
          'title',
          'Premium pension (placeholder)',
          'blurb',
          'Replace with values from minpension.se / Pensionsmyndigheten.',
          'totalValueSek',
          0,
          'valueChangeYtdPct',
          0,
          'avgAnnualSinceStartPct',
          0,
          'portfolioFeePct',
          0,
          'avgCustomerFeePct',
          0
        )
      )
    )
  )
where household_id = 'demo-household-se-001'
  and portal_snapshot ? 'pensionFrom65'
  and portal_snapshot ? 'premiepension'
  and not (portal_snapshot ? 'pensionColumns');
