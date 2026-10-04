# FRD: Jotter (GitHub-backed, personal use)

Oct 1, 2026 · @Siddhi

## 1. What we are building

Jotter is a personal note-taking app that runs in the browser and saves your notes as Markdown files in your own GitHub repository. You can write linked notes from any device, and your notes are encrypted before they reach GitHub (switch this off to keep plain Markdown that desktop Obsidian can open).

- **Who it is for:** one person, you. No teams, sharing or public features.
- **What you need:** a GitHub account and a web browser.
- **Where notes live:** your GitHub repo. The app keeps no copy of its own.

## 2. What the app does

| Feature | What you can do | Phase |
| --- | --- | --- |
| Sign in | Log in with GitHub and pick the repo that holds your notes | MVP |
| Files | Browse folders; create, rename, move and delete notes; add images and files | MVP |
| Editor | Write Markdown with a live preview: checklists, tables, code blocks, callouts | MVP |
| Links | Link notes with `[[double brackets]]`, see backlinks, embed notes and images | MVP |
| Search | Find any note by text, title or tag; jump to a note with Ctrl/Cmd+O | MVP |
| Tags and properties | Use #tags and a simple form for note properties | MVP |
| Commands | Command palette (Ctrl/Cmd+P) and keyboard shortcuts | MVP |
| Save to GitHub | Edits save in your browser first, then go to GitHub as one commit; changes made elsewhere are pulled in; if both sides changed, you see both versions and nothing is lost | MVP |
| Encryption | Notes are encrypted in your browser with a passphrase you choose before they go to GitHub; you can switch it off to keep plain Markdown | MVP |
| Themes | Light and dark mode, font size, line width | MVP |
| Offline | Install it as an app, read and edit offline, sync when you are back online | Next |
| History | See earlier versions of a note and restore one | Next |
| Templates and daily notes | Reusable templates and a note for each day | Next |
| Math and diagrams | Write formulas and Mermaid diagrams | Next |
| Export and import | Export notes as Markdown, HTML or PDF, or the whole vault as a ZIP; open any existing Markdown repo | Next |
| Custom CSS | Restyle the app with your own CSS | Next |
| Plugins | Add your own small extensions | Later |
| Canvas | Free-form boards of notes and images | Later |

**Not included:** graph view, real-time collaboration, sharing or publishing, community themes or plugins, native mobile apps.

## 3. How it works

The browser does the heavy work and keeps a working copy; Vercel only serves the app and brokers authenticated GitHub calls; GitHub is the single system of record.

&#91;embedded content: architecture · 3 tiers, 3 connections\]

The highlighted box is the source of truth: the sync engine commits batched changes through Vercel route handlers, which call the GitHub API using the signed-in user's token.

In plain terms:

1. You edit, and every change is saved in your browser straight away.
2. After a short pause (about a minute), your changes are encrypted and go to GitHub as one commit under your name.
3. The app regularly checks GitHub for changes made elsewhere and merges them in.
4. If the same note changed in both places, you choose which version to keep.

**Built with:** Next.js, React, TypeScript, CodeMirror 6 (editor), IndexedDB (browser storage) and the GitHub API.

## 4. Rules the app must follow

- **Fast:** opens a 1,000-note vault in under 5 seconds, and typing feels instant.
- **Safe:** no edit is ever lost, and the app warns you before you close the tab with unsaved changes.
- **Private:** notes are encrypted in your browser before they leave it, the passphrase never leaves your device, and nothing is stored on a server.
- **Secure:** sign-in is through GitHub only, with the least access needed, and note content is cleaned before it is shown.
- **Works everywhere:** latest Chrome, Edge, Firefox and Safari, on desktop and phone, usable by keyboard and screen reader.
- **Compatible:** decrypted notes are standard Markdown, and with encryption off desktop Obsidian reads the repo without surprises.
- **Original:** its own name and look, with no Obsidian code or branding.

## 5. Build order

1. **MVP:** sign in, files, editor, links, search, tags, commands, themes, encryption and saving to GitHub.
2. **Next:** offline use, history, templates and daily notes, math and diagrams, export and import, custom CSS.
3. **Later:** plugins, canvas, Vim mode, a properties table view, instant refresh from GitHub and an encrypted local cache.

## 6. Decisions and open questions

- **Public computer mode:** not needed. The app is for your own devices.
- **Encryption:** decided. Notes are encrypted inside the repo, using a passphrase you choose. The passphrase never leaves your device, and if you lose it the notes cannot be recovered.
- **Name:** Jotter (working name).
- **Still open:** should file and folder names be hidden too? Default: no, so the file tree loads fast and links keep working.

## 7. Done when (MVP)

1. You sign in with GitHub, pick a repo, and see your notes within 5 seconds (for 1,000 notes).
2. A new note with links, a tag and properties survives a reload, with its backlinks showing.
3. Renaming a note updates every link to it, and only those files change in the commit.
4. After you edit five notes, one commit appears on GitHub under your name.
5. A change made on github.com shows up in the open app within a minute, and clashing edits show both versions.
6. With encryption on, files on github.com are unreadable without your passphrase; with it off, notes open in desktop Obsidian with no surprise changes.
7. Search returns results in under 200 ms for 5,000 notes.
8. Closing the tab with unsaved changes shows a warning.
