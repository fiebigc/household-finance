# How to implement Tink (Link + BankID)

This app only contains a **browser scaffold**. Tink **client secrets** and **token exchange** must live on a **server** you control (Cloudflare Worker, Supabase Edge Function, or similar). Swedish banks and BankID are completed inside **Tink’s hosted UI**, not in this React app.

## 1. What the SPA does today

| Piece | Role |
|--------|------|
| `src/lib/tinkService.ts` | Reads public env, `POST`s to your API to get an `authorizationUrl`, parses return query params. |
| `src/hooks/useTinkLinkFlow.ts` | Orchestrates “start connect” and consumes callback params once. |
| `src/components/TinkConnectCard.tsx` | UI: steps, config hints, Connect button. |

Flow:

1. User clicks **Connect bank (BankID via Tink)**.
2. SPA sends `POST {VITE_TINK_CONNECT_API_BASE_URL}/session` with JSON `{ userId, returnUrl, market }`.
3. Your API returns `{ authorizationUrl }` (aliases `authorizeUrl` / `url` also accepted).
4. Browser navigates to `authorizationUrl` (Tink Link).
5. User completes **BankID** in Tink’s flow.
6. Tink redirects back to `returnUrl` (your app URL). Your **backend** should append query params such as `tink_status=success` / `tink_message=…` (see `consumeTinkCallbackFromUrl` in `tinkService.ts`).
7. SPA strips those params from the address bar and shows a short status banner.

## 2. Environment variables

Copy `.env.example` to `.env` locally. For **Cloudflare Pages**, set the same `VITE_*` variables in the project **Settings → Environment variables** (production + preview as needed).

| Variable | Required | Meaning |
|----------|----------|---------|
| `VITE_TINK_CONNECT_API_BASE_URL` | Yes, for a real redirect | Base URL of **your** API only (no trailing slash), e.g. `https://finances-api.example.workers.dev/tink` |
| `VITE_TINK_CLIENT_ID` | Optional | Usually **not** needed in the browser; Tink client id normally stays on the server. |
| `VITE_TINK_DEMO_MODE` | Optional | `"true"` shows demo-oriented copy in the card; you still need the API URL for a real session. |

Never commit `.env`. Never put **Tink client secret** in `VITE_*` variables (they are exposed to the client bundle).

## 3. Backend contract: `POST …/session`

The SPA calls:

```http
POST {VITE_TINK_CONNECT_API_BASE_URL}/session
Content-Type: application/json

{
  "userId": "<Supabase auth user id>",
  "returnUrl": "<current page URL without query, e.g. https://app.example.com/>",
  "market": "sv_SE"
}
```

Expected **200** JSON body (any of these shapes):

```json
{ "authorizationUrl": "https://link.tink.com/..." }
```

or `authorizeUrl` / `url` as the link field name.

**You must:**

- **Authenticate** the caller: e.g. require `Authorization: Bearer <Supabase JWT>` and verify the `userId` matches the token (recommended addition in the SPA + Worker).
- Use Tink’s **server-side** APIs (OAuth / Link) with your **client id + secret** to create a one-time link session.
- Register **redirect URIs** in the Tink developer console to match what you pass as `returnUrl` (and any backend callback URLs Tink requires).

**CORS:** allow your Pages origin for `POST /session` (and `OPTIONS` if you add preflight with custom headers).

## 4. Return URL and query params

After the user finishes in Tink, your Worker should redirect the browser to something like:

```text
https://your-app.pages.dev/?tink_status=success&tink_message=Connected
```

The app recognizes: `tink_status`, `tink_message`, `tink_error`, `credentials_id` (see `TINK_QUERY_KEYS` in `tinkService.ts`). Align naming with your Worker so the banner matches reality.

## 5. Cloudflare Worker sketch

1. Create a Worker with a route, e.g. `POST /tink/session`.
2. Store **TINK_CLIENT_ID** and **TINK_CLIENT_SECRET** as **encrypted secrets** (Wrangler secrets or Cloudflare dashboard), not in frontend env.
3. Verify Supabase JWT (JWKS URL from Supabase project settings) and map `sub` → `userId`.
4. Call Tink’s API to create a **Link** or **OAuth** session; return `authorizationUrl`.
5. Optionally subscribe to Tink **webhooks** on the same Worker for account updates (separate from the redirect flow).

Official Tink docs change over time—use [Tink’s developer documentation](https://docs.tink.com) for exact endpoints and payload fields.

## 6. Optional: send Supabase JWT from the SPA

Today `requestTinkAuthorizationUrl` does not attach `Authorization`. To lock down the Worker:

1. In `useTinkLinkFlow` / `requestTinkAuthorizationUrl`, pass `Authorization: Bearer <access_token>` from `supabase.auth.getSession()`.
2. In the Worker, validate the JWT before creating a Tink session.

## 7. Testing without Tink

- Leave `VITE_TINK_CONNECT_API_BASE_URL` empty: the Connect button surfaces a clear configuration error.
- Point `VITE_TINK_CONNECT_API_BASE_URL` at a **mock** Worker that returns a fake `authorizationUrl` (e.g. `https://example.com`) only in staging.

## 8. Related files

- `src/lib/tinkService.ts` — client API + callback parsing  
- `src/hooks/useTinkLinkFlow.ts` — UI state machine  
- `src/components/TinkConnectCard.tsx` — dashboard card  
- `.env.example` — variable names  
