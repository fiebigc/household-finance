# Out of Scope (v1)

Explicitly **avoid** in the first version:

| Area | Reason |
|------|--------|
| **Bank sync** | Manual entry only for v1. |
| **Investment performance** | Investments are read-only; no tracking of returns or valuations. |
| **Tax optimization** | Sweden net income only; no tax logic. |
| **Long forecasts** | No forecasts &gt; 12 months. |

---

## In Scope for v1

- Liquidity and buffer runway.
- Income states and scenario-based affordability.
- Goals (one-off, recurring, bucket) with priority and source.
- Monthly transactions and month lock.
- canAfford engine with explanation.
- Minimal UI: dashboard, goals, transactions, scenario controls.
