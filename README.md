# Jotter

A personal, browser-based Markdown notes app that keeps your notes in **your own GitHub repository**.

Write linked notes from any device. Edits save in your browser first, then go to GitHub as one commit under your name, encrypted with a passphrase only you know (or switch encryption off to keep plain Markdown).

## Features

- **Sign in with GitHub** and pick the repo that holds your notes
- **Editor** with Source, Live Preview and Reading modes
- **Linked notes:** `[[wikilinks]]`, backlinks, embeds, tags and properties
- **Search** and a quick switcher (Ctrl/Cmd+O), plus a command palette (Ctrl/Cmd+P)
- **Sync** to GitHub in batched commits, with conflict handling that never loses a version
- **Encryption** in your browser before notes leave it
- **Light and dark themes**

## Getting started

You need Node.js 20+ and a GitHub repo with at least one commit.

1. Create a GitHub OAuth app with callback URL `http://localhost:3000/api/auth/callback`.
2. Copy the env file and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Value |
   | --- | --- |
   | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | From your OAuth app |
   | `SESSION_SECRET` | Random string, 32+ characters |
   | `APP_URL` | `http://localhost:3000` |

3. Run it:

   ```bash
   npm install
   npm run dev
   ```

Other scripts: `npm run build`, `npm run typecheck`, `npm test`.

## Deploying to Vercel

Import the repo, set the same four variables with `APP_URL` as your production URL, and create a separate GitHub OAuth app whose callback is `https://your-domain/api/auth/callback`.

## Privacy

Notes are never stored or logged on the server, and your GitHub token never reaches client JavaScript. If you lose your passphrase, encrypted notes cannot be recovered.

## Docs

- [docs/FRD.md](docs/FRD.md): requirements
- [docs/DESIGN.md](docs/DESIGN.md): design system
- [docs/CONTRACTS.md](docs/CONTRACTS.md): architecture and API
