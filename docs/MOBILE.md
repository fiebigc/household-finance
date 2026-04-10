# Mobile Requirements

## Principle

Mobile-first design is required. Desktop expands the same information density.

## Breakpoints

- Base: 360px
- Sm: 480px
- Md: 768px
- Lg: 1024px+

## UX Requirements

- Dashboard KPIs always visible without horizontal scrolling
- Scenario controls usable via touch inputs/selects
- Transaction entry supports quick-add flow in under 20 seconds
- Goal cards stack vertically on small screens
- Tables become cards at small widths

## Performance

- Keep initial bundle lean
- Defer non-critical charts/components
- Optimize dashboard render path for low-end mobile devices

## Acceptance Checks

- Works on iPhone Safari and Android Chrome
- No clipped content at 360px width
- All primary actions reachable with one thumb in portrait mode
