# Module contracts

Source of truth for shapes: [lib/types.ts](../lib/types.ts). Requirements: [FRD.md](FRD.md). Visual spec: [DESIGN.md](DESIGN.md).

## HTTP broker (app/api, owned by server module). All JSON, stateless, never log/store note content.
Session = encrypted httpOnly cookie (jose JWE) holding GitHub token + selected repo. Token never returned to client.

| Route | Purpose |
| --- | --- |
| GET /api/auth/login | redirect to GitHub OAuth (state cookie) |
| GET /api/auth/callback | exchange code, set session, redirect `/` |
| POST /api/auth/logout | clear session |
| GET /api/session | `SessionInfo` |
| GET /api/github/repos | `RepoSummary[]` |
| POST /api/session/repo | body `RepoRef`, validates access, stores in cookie |
| GET /api/github/head | `{headSha}` (cheap poll; supports If-None-Match/ETag) |
| GET /api/github/tree | `TreeResponse` (recursive, blobs only) |
| GET /api/github/blob?sha= | `{contentBase64}` |
| POST /api/github/commit | `CommitRequest` -> `CommitResponse`; one commit via Git Data API; non-force ref update; 409 `stale` if head != baseSha |

Errors: `ApiError` JSON with matching HTTP status (401/400/404/409/429/502).

## Encrypted file format
File text = `JOTTER-ENC1\n` + base64(iv[12] || AES-256-GCM ciphertext+tag) (single line). Key = PBKDF2-SHA256(passphrase, salt, iterations>=600000). Paths stay plaintext. `.jotter/config.json` ([VaultConfig]) is always plaintext. Attachments are encrypted as bytes with the same scheme when encryption is on.

## Ownership
- server: `app/api/**`, `lib/server/**`
- core: `lib/core/**`, `workers/**`
- storage+sync+vault facade: `lib/storage/**`, `lib/sync/**`, `lib/vault/**`
- ui: `app/layout.tsx`, `app/page.tsx`, `components/**`, `lib/ui/**`
