# Multi-Token Access Control — Design Plan

## Overview

Add scoped access tokens so the portal owner can share limited access to specific sessions without exposing the full primary token. Targeted for **v0.3.0**.

## Token Model

```json
// data/tokens.json
{
  "tokens": [
    {
      "id": "tok_primary",
      "token": "a1b2c3...",
      "label": "Primary",
      "role": "primary",
      "sessions": "*",
      "created": "2026-03-19T04:00:00Z"
    },
    {
      "id": "tok_abc123",
      "token": "d4e5f6...",
      "label": "Ryan's phone",
      "role": "scoped",
      "sessions": ["a6c41537-...", "fb85d2e5-..."],
      "created": "2026-03-19T04:05:00Z"
    }
  ]
}
```

- **primary** — full access: all sessions, can create/manage tokens
- **scoped** — access only to listed sessions; cannot manage tokens

## Migration

On first start after upgrade, if `data/token.txt` exists and `data/tokens.json` does not:
- Read the existing token from `token.txt`
- Create `tokens.json` with that token as the primary
- Delete `token.txt`
- Existing URLs continue to work without interruption

## Server Changes

### 1. TokenStore (`src/tokens.ts` — new file)

```
class TokenStore {
  load(): TokenRecord[]
  save(): void
  resolve(token: string): TokenRecord | null
  create(label: string, role: string, sessions: string[]): TokenRecord
  revoke(id: string): void
  update(id: string, patch: Partial<TokenRecord>): void
  getPrimary(): TokenRecord
}
```

Persists to `data/tokens.json`. Cached in memory, reloaded on change.

### 2. Auth check refactor (`src/server.ts`)

Current:
```ts
private checkToken(url, req): boolean
```

New:
```ts
private resolveToken(url, req): TokenRecord | null
```

Returns the full token record (or null if invalid). Callers use the record to check session access.

### 3. Session scoping

Each request path that touches a session needs a scope check:

| Path | Current | Change |
|------|---------|--------|
| `verifyClient` (WS) | token === this.token | `resolveToken()` — store record on ws |
| WS session connect | any session | reject if session not in token.sessions |
| `GET /api/sessions` | all sessions | filter by token.sessions |
| `POST /api/sessions` | allowed | primary only (scoped tokens can't create) |
| `GET /api/models` | allowed | no change (model list is not session-specific) |
| `GET /api/info` | allowed | no change |

### 4. Token management API (primary only)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/tokens` | — | `TokenRecord[]` (token field redacted except for primary) |
| `POST` | `/api/tokens` | `{ label, sessions }` | new `TokenRecord` (includes token for display once) |
| `DELETE` | `/api/tokens/:id` | — | 204 |
| `PATCH` | `/api/tokens/:id` | `{ label?, sessions? }` | updated `TokenRecord` |

Creating a token returns the full token string once — it's not retrievable after that (similar to GitHub PATs).

### 5. `--new-token` flag update

With multi-token, `--new-token` should regenerate the **primary** token specifically (not wipe all tokens).

## Frontend Changes

### Drawer tabs

The existing drawer (Sessions button) gets two tabs:

```
┌─────────────┬────────┐
│  Sessions   │ Tokens │
└─────────────┴────────┘
```

**Sessions tab** — unchanged, current behavior.

**Tokens tab** (visible only to primary token holders):
- List of tokens: label, role, created date, session count
- "New Token" button → label input + session multi-select → shows the token URL once
- Revoke button per token (with confirmation)
- Edit sessions (tap to open session picker)
- QR code button per token (generates QR for that token's URL)

Scoped token holders see no Tokens tab — they only see their allowed sessions.

### Token detection

The frontend already has the token in the URL. Add a field to the `/api/info` response:

```json
{ "role": "primary" | "scoped", "label": "Primary" }
```

Frontend uses this to conditionally show the Tokens tab and session creation button.

## Implementation Order

1. **TokenStore** — new file, unit-testable in isolation
2. **Migration** — token.txt → tokens.json on startup
3. **resolveToken** — refactor checkToken, attach record to WS connections
4. **Session scoping** — filter sessions by token record
5. **Token management API** — CRUD endpoints, primary-only guard
6. **Frontend: Tokens tab** — UI for create/revoke/edit
7. **QR per token** — generate shareable QR codes for scoped tokens

Steps 1–4 are backend-only and can be tested with curl. Steps 5–7 add the UI.

## Security Considerations

- Scoped tokens cannot escalate: no session creation, no token management
- **Update and restart endpoints are primary-only** — scoped tokens must not be able to trigger `npm update`, rebuild, or server restart
- Token strings are only shown once at creation time
- Primary token can always revoke any scoped token
- `--new-token` regenerates primary only; scoped tokens survive
- Tokens are stored in plaintext in `data/tokens.json` (same trust model as current `token.txt` — local machine access)

## Data Directory Considerations

When multi-token is implemented, `data/` contents need scoping:

| Path | Current | Multi-token |
|------|---------|-------------|
| `data/token.txt` | Single token | → `data/tokens.json` (migration) |
| `data/contexts/*.md` | All users see all | Consider public vs private contexts |
| `data/rules/<session>.json` | Per-session | Inherits session access control |
| `data/session-shields.json` | Admin-only | Primary token only |
| `data/workspaces/default/` | Shared CWD | Per-user CWD (future) |

Key decisions to make:
- Should contexts be visible to all tokens, or only primary?
- Should scoped tokens be able to set context on their allowed sessions?
- Should private contexts (with credentials) be separated from shared ones?

Possible structure:
```
data/
  tokens.json            # all tokens
  contexts/              # shared contexts (visible to all tokens)
  contexts-private/      # primary-only contexts (credentials, etc.)
  rules/                 # per-session (inherits session scoping)
  workspaces/            # per-user CWDs (future)
```
