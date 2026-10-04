# Jotter — Style Reference
> A quiet writing desk on warm vellum. A personal, GitHub-backed notes app: near-white pages, hairline rules like ruled notebook paper, and a single ink-blue signal that marks links and the one thing to do next.

**Theme:** light and dark (follows system, user can override)

Jotter is a personal Markdown notes app (Obsidian-style, but its own product). The interface should disappear behind the writing. It keeps a calm, engineered feel: a pale canvas, hairline borders (`#e5e7eb`) doing the structural work that shadows do elsewhere, pill-shaped controls, 8px and 16px corners, and typography set in Inter with Geist Mono for anything technical. One chromatic accent, **Ink Blue** (`#2f54eb`), is rationed: it marks wikilinks, the primary action, focus, and checked states. Everything else is a calibrated gray scale. A dark theme is a first-class citizen, built from the same roles.

This file adapts the Firecrawl style reference. What changed and why:
- **Accent:** ember orange became Ink Blue, so links (the core of a linked-notes app) read as links and the product looks distinct from Obsidian's purple.
- **Font:** Suisse (commercial) became Inter (free), with the same tight-at-display, open-at-caption tracking logic.
- **Dark theme added** (required for a notes app used at night).
- **Marketing components removed** (announcement banner, logo cloud, world map). **App components added**: file tree, note tabs, editor elements, backlinks, command palette, sync status, passphrase unlock, conflict resolver.
- **Placeholder and helper text** now meet WCAG AA (the original used very light grays).

## Tokens — Colors

| Name | Light | Dark | Token | Role |
|------|-------|------|-------|------|
| Ink Blue | `#2f54eb` | `#7c9bff` | `--color-ink-blue` | The only chromatic signal: primary button fill, wikilinks and links, focus ring, checked checkbox, active mode in toggles, sync progress |
| Blue Wash | `#dbe4ff` | `#1f2a55` | `--color-blue-wash` | Text selection, focus halo, soft glow ring behind the primary button |
| Blue Tint | `#eef2ff` | `#182040` | `--color-blue-tint` | Notice bar background, hovered accent items, selected search result row |
| Rule | `#e5e7eb` | `#2e2e2e` | `--color-rule` | The hairline: card outlines, input strokes, dividers, panel edges, table lines. Structural skeleton of every screen |
| Ink | `#262626` | `#ececec` | `--color-ink` | Primary text, headings, icon strokes on hover, text on neutral buttons |
| Canvas | `#ffffff` | `#141414` | `--color-canvas` | The page: editor surface and reading view |
| Vellum | `#f9f9f9` | `#1b1b1b` | `--color-vellum` | Side panels, code blocks, callouts, cards, status bar, inset rings |
| Fog | `#f3f4f6` | `#232323` | `--color-fog` | Hover and selected rows (file tree, menus), inline code, tag chips |
| Slate | `#727272` | `#a0a0a0` | `--color-slate` | Secondary text, placeholders, metadata, inactive icons. Minimum gray allowed for text that must be read (4.8:1 on white) |
| Graphite | `#616161` | `#b5b5b5` | `--color-graphite` | Body text inside panels, supporting paragraphs, blockquote text |
| Ash | `#949494` | `#7a7a7a` | `--color-ash` | Icon strokes, disabled controls, decorative marks. Never for text the user must read |
| Stone | `#c7c7c7` | `#4a4a4a` | `--color-stone` | Disabled borders, grid dots, decorative strokes |
| Highlight | `#fff3bf` | `rgba(250,204,21,0.25)` | `--color-highlight` | `==highlighted==` text in notes only |
| Synced | `#2f9e44` | `#51cf66` | `--color-synced` | 8px sync-status dot and success callout border. Never text or fill |
| Pending | `#e8a317` | `#fcc419` | `--color-pending` | 8px unsynced dot and warning callout border |
| Conflict | `#e03131` | `#ff6b6b` | `--color-conflict` | 8px conflict/error dot, danger callout border, removed-line tint in diffs (at 8% alpha) |

Status colors (Synced, Pending, Conflict) exist only because sync state must be readable at a glance. They always appear as a small dot, a left border or a faint tint, always paired with a text label, and never as button or surface fills.

## Tokens — Typography

### Inter — interface and note body. Weight 400 for body, 500 for headings and interactive labels, 600 for bold text in notes. Tracking tightens at display sizes (-0.01em at 40px and above) and opens slightly (+0.01em) at 11-12px. · `--font-inter`
- **Fallbacks:** ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto
- **Weights:** 400, 500, 600
- **Sizes:** 11, 12, 13, 14, 16, 18, 22, 28, 40, 52
- **Line height:** 1.2 to 1.7 (see scale)
- **Role:** Everything human-facing: sidebar, tabs, buttons, menus, and the prose inside notes.
- **Note:** Users can switch the note font in Settings (Inter, system UI, a serif such as Newsreader, or Geist Mono). Interface chrome stays Inter.

### Geist Mono — code and technical strings. · `--font-geist-mono`
- **Fallbacks:** ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
- **Weights:** 400, 500
- **Sizes:** 12, 13
- **Line height:** 1.57
- **Role:** Code blocks, inline code, file paths, frontmatter keys, search operators (`tag:`, `path:`), keyboard hints, commit SHAs, counts in the status bar.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| caption | Inter | 400 | 11px | 1.45 | +0.01em | `--text-caption` |
| meta | Inter | 400 | 12px | 1.5 | +0.01em | `--text-meta` |
| ui | Inter | 400/500 | 13px | 1.5 | 0 | `--text-ui` |
| body-ui | Inter | 400 | 14px | 1.5 | 0 | `--text-body-ui` |
| note-body | Inter | 400 | 16px | 1.7 | 0 | `--text-note` |
| note-h4 | Inter | 500 | 16px | 1.4 | 0 | `--text-h4` |
| note-h3 | Inter | 500 | 18px | 1.3 | 0 | `--text-h3` |
| note-h2 | Inter | 500 | 22px | 1.25 | 0 | `--text-h2` |
| note-h1 | Inter | 500 | 28px | 1.2 | -0.005em | `--text-h1` |
| heading-lg | Inter | 500 | 40px | 1.1 | -0.005em | `--text-heading-lg` |
| display | Inter | 500 | 52px | 1.07 | -0.01em | `--text-display` |

Display sizes (40-52px) are used only on the sign-in screen, the empty state and the welcome note.

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable in the editor, compact in chrome (sidebar rows are 28px high).

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 64 | 64px | `--spacing-64` |

### Border Radius (four tiers, never mixed)

| Element | Value |
|---------|-------|
| buttons, tags, chips, note tabs, segmented toggle, status pills | 999px |
| inputs, code blocks, callouts, tree rows, tooltips, panel items | 8px |
| menus, popovers, dropdowns | 12px |
| cards, modals, command palette, unlock card | 16px |

Micro exception: inline code and keyboard keys use 6px. Checkboxes are 16px circles (999px).

### Shadows

| Name | Value (light) | Token |
|------|---------------|-------|
| ring | `0 0 0 6px var(--color-vellum)` | `--shadow-ring` |
| focus | `0 0 0 3px var(--color-blue-wash)` | `--shadow-focus` |
| popover | `rgba(0,0,0,0.03) 0 16px 24px -8px, rgba(0,0,0,0.03) 0 8px 16px -4px, rgba(0,0,0,0.05) 0 0 0 1px` | `--shadow-popover` |
| modal | `rgba(0,0,0,0.02) 0 40px 48px -20px, rgba(0,0,0,0.03) 0 32px 32px -20px, rgba(0,0,0,0.03) 0 16px 24px -12px, rgba(0,0,0,0.05) 0 0 0 1px` | `--shadow-modal` |

In dark theme, separation comes from the 1px Rule border and a dimmed backdrop. Modals may add `rgba(0,0,0,0.6) 0 24px 48px -12px`; this is the only shadow allowed above 5% alpha.

### Layout

- **Content width:** note text max-width 720px, centered (setting "Readable line length", on by default)
- **Page max-width (sign-in, empty state):** 1200px
- **Left sidebar:** 260px, resizable 200 to 420px
- **Right sidebar (backlinks, outline, properties):** 280px, resizable 240 to 420px
- **Tab strip:** 44px high
- **Status bar:** 28px high
- **Mobile bottom bar:** 56px high plus safe-area inset
- **Card padding:** 24px
- **Element gap:** 8px in chrome, 12px in panels
- **Section gap (sign-in, empty state):** 96px

Breakpoints: 1024px and up shows both sidebars; 640 to 1023px shows the left sidebar as an overlay and the right panel as a drawer; below 640px is a single pane with the bottom bar. On touch devices every control has a 44px minimum hit area.

## Components

### Primary Button (Pill)
**Role:** The one main action on a screen (Continue with GitHub, Unlock, Push now).

Background Ink Blue, text `#ffffff`, Inter 14px weight 500, letter-spacing +0.01em. Padding 8px 16px (10px 20px on sign-in). Radius 999px. No border. On the sign-in screen and the unlock card only, add a Blue Wash halo (`0 0 0 4px`); elsewhere no glow. Hover: darken 6%. Disabled: Ash fill at 40% with white text.

### Ghost Button and Icon Button
**Role:** Secondary and toolbar actions.

Transparent background, text Ink, Inter 13-14px weight 500, padding 6px 12px, radius 999px. Icon buttons are 32px circles (44px on touch) with a 20px stroke icon in Slate. Hover: Fog background, icon turns Ink. Active or toggled-on: icon in Ink Blue.

### Mode Toggle (Segmented Pill)
**Role:** Switch a note between Source, Live Preview and Reading.

Container pill with 1px Rule border, 2px inner padding, Vellum background. Segments: Inter 12px weight 500, padding 4px 12px, radius 999px, text Slate. Active segment: Ink background, white text (the same treatment as the code tab in the source system). Hotkey hint shown in the tooltip, in Geist Mono.

### App Shell
**Role:** The frame around every note.

Left and right sidebars use Vellum with a 1px Rule border on their inner edge. The editor area is Canvas. The tab strip sits on Canvas with a 1px Rule bottom border. The status bar is Vellum with a 1px Rule top border. Panels never use drop shadows.

### File Tree Row
**Role:** A note, folder or attachment in the left sidebar.

Height 28px, padding 0 8px, radius 8px, Inter 13px weight 400, text Ink for notes and Graphite for folders. 16px stroke icon in Slate, 8px gap to the label, 12px indentation per level, chevron rotates 90 degrees when open. Hover: Fog background. Selected (open note): Fog background and weight 500. Unsynced file: 6px Pending dot at the row's right edge. Drag target: 1px Ink Blue outline on the folder row.

### Note Tab (Pill)
**Role:** An open note in the tab strip.

Height 28px, padding 0 12px, radius 999px, Inter 13px weight 500. Inactive: transparent, text Slate. Active: Vellum fill, 1px Rule border, text Ink. Close icon (12px) appears on hover and on the active tab. An unsynced note shows a 6px Pending dot in place of the close icon until hovered. Tabs sit 4px apart and scroll horizontally on overflow.

### Editor Surface
**Role:** Where notes are written and read.

Canvas background, content centered at 720px, padding 32px 48px (16px on mobile). Note title (the filename) is note-h1 at the top, editable in place. Body is note-body (Inter 16px, 1.7). Paragraph gap 12px. Caret and selection use Ink Blue and Blue Wash. In Live Preview, Markdown syntax characters render in Ash and are revealed only at the cursor.

Inline and block elements:
- **Wikilink** `[[Note]]`: Ink Blue text, no underline; 1px underline at 30% alpha on hover. **Unresolved link:** Slate text with a dashed underline.
- **Tag** `#tag`: pill, Fog background, Inter 12px weight 500, Slate text, padding 1px 8px; hover turns text Ink Blue.
- **Highlight** `==text==`: Highlight background, 2px vertical padding, radius 4px.
- **Inline code and keys:** Fog background, Geist Mono 13px, padding 1px 6px, radius 6px.
- **Blockquote:** 2px Rule left border, 16px left padding, Graphite text.
- **Task checkbox:** 16px circle, 1.5px Ash border; checked: Ink Blue fill with a white check, and the label turns Slate with a strikethrough.
- **Table:** 1px Rule borders, header row on Vellum with weight 500, cell padding 8px 12px, Inter 14px.
- **Horizontal rule:** 1px Rule.
- **Embedded note:** Vellum background, 1px Rule border, radius 8px, 16px padding, with a small Geist Mono title bar showing the source note and heading.

### Callout
**Role:** `> [!note]` style call-out blocks.

Vellum background, 1px Rule border, radius 8px, padding 12px 16px, with a 3px colored left border. Title row: 16px stroke icon plus Inter 14px weight 500. Types and left-border colors: note (Ink Blue), tip and success (Synced), warning (Pending), danger (Conflict). Foldable callouts show a chevron on the right. Text stays Ink on Vellum for every type.

### Code Block
**Role:** Fenced code in notes.

Vellum background, 1px Rule border, radius 8px. Optional 36px header with the language label (Geist Mono 12px, Slate) on the left and a copy button on the right. Body: Geist Mono 13px, line-height 1.57, padding 16px, horizontal scroll. Syntax colors stay neutral: Ink for code, Graphite for comments, Ink Blue for keywords and strings. No other hues.

### Backlinks and Outline Panel Items
**Role:** Linked mentions and heading outline in the right sidebar.

Each backlink item is a compact card: 1px Rule border, radius 8px, padding 12px, 8px gap between items. Header row: note title in Inter 13px weight 500 Ink and a count in Geist Mono 12px Slate. Context snippet: Inter 13px Graphite, line-height 1.5, with the link text in Ink Blue. Hover: Fog background. Section headers use the numbered style below. Outline rows are 28px tree-row style, indented per heading level, current heading in weight 500.

### Command Palette and Quick Switcher
**Role:** Ctrl/Cmd+P (commands) and Ctrl/Cmd+O (go to note).

Modal at 640px wide, radius 16px, Canvas background, 1px Rule border, modal shadow, centered 15% from the top, over a backdrop of Ink at 24% alpha. Input row: 56px high, no border, Inter 16px, placeholder in Slate, a 20px search icon in Slate on the left, Esc hint in a kbd chip on the right, 1px Rule bottom border. Result rows: 40px high, padding 0 16px, radius 8px with 8px outer inset; title Inter 14px weight 500 Ink, path or description Geist Mono 12px Slate on the right. Selected row: Blue Tint background with a small return-key hint in Ink Blue. Operators typed in search (`tag:`, `path:`) render as Geist Mono 12px Ink Blue chips on Fog. Footer: 36px, hints for arrows, enter and esc as kbd chips (Fog, radius 6px, Geist Mono 12px).

### Search Input Bar (Sidebar and Search Panel)
**Role:** Find text across the vault.

Pill input: Canvas background, 1px Rule border, radius 999px, height 36px, padding 0 16px 0 40px, Inter 14px, placeholder Slate. Search icon 16px in Slate inside the left padding. Focus: 1px Ink Blue border plus the focus halo. Toggles at the right (case, regex) are 24px pill icon buttons; on = Ink fill with white icon.

### Properties Panel (Frontmatter)
**Role:** Edit YAML properties as a form.

Rows are 32px high: key on the left (Geist Mono 12px, Slate, 96px column), value on the right (Inter 14px). Text values sit in an 8px-radius input that appears as plain text until hovered or focused (Fog on hover, Ink Blue border on focus). List values (tags, aliases) are pill chips. Date values open a popover calendar (12px radius).

### Sync Status (Status Bar)
**Role:** Always-visible state of the GitHub sync.

Status bar items are Inter 12px, Slate, 12px apart. Sync item: an 8px dot plus a label. Synced: Synced dot, "Synced". Unsynced: Pending dot, "3 unsynced" with the count in Geist Mono. Syncing: a 12px Ink Blue spinner, "Syncing". Offline: Ash dot, "Offline". Conflict: Conflict dot, "Conflict", rendered as a clickable pill with Fog hover that opens the resolver. The label always accompanies the dot. Right side shows word count and, when encryption is on, a 12px lock icon in Slate.

### Notice Bar
**Role:** A one-line state message above the editor (offline, unsynced changes, conflict found).

Full width of the editor, height 36px, Blue Tint background, 1px Rule bottom border, text Ink Blue Inter 13px weight 500, centered, with one inline action link underlined (for example "Push now"). Used one at a time. Offline and conflict states add the matching 8px status dot before the text.

### Passphrase Unlock Card
**Role:** Unlock an encrypted vault.

Centered card on the empty-state grid, width 400px, Canvas background, 1px Rule border, radius 16px, padding 32px 24px, text centered, modal shadow. A 24px stroke lock icon in Ink Blue inside a 40px Vellum circle. Title Inter 20px weight 500 Ink. Password field: pill input as above, full width. Primary button below. A 13px Slate note: "Your passphrase never leaves this device. If you lose it, your notes cannot be recovered." Wrong passphrase: Conflict-colored 8px dot and a short message under the field; the field border stays Rule (color is never the only signal).

### Conflict Resolver
**Role:** Show both versions when a note changed in two places.

Two code-block panels side by side (stacked on mobile), headed by pills "Mine" and "Theirs" (Fog background, Inter 12px weight 500). Changed lines use a faint tint: removed lines Conflict at 8% alpha, added lines Synced at 8% alpha, plus a gutter marker (minus, plus) so color is never the only cue. Footer actions: Ghost buttons "Keep mine" and "Keep theirs", and a Primary button "Edit merged result". Nothing is discarded until the user confirms.

### Settings Group Card
**Role:** A group of settings.

Vellum background, 1px Rule border, radius 16px, padding 24px. Rows inside are separated by 1px Rule lines. Row label Inter 14px weight 500 Ink, description Inter 13px Slate, control on the right (toggle: 36 x 20px pill, Ink Blue when on; select: 8px-radius input).

### Numbered Section Header
**Role:** Label settings groups and panel sections (for example "01 / EDITOR").

A 4px Ink Blue dot, then Geist Mono 12px Slate "01", a "/" separator and an uppercase label in Geist Mono 12px Slate, left-aligned. Used in Settings, and optionally above the backlinks and outline sections. The large heading beneath (when used on sign-in) is heading-lg, Ink, with at most one phrase in Ink Blue.

### Sign-in Screen
**Role:** First screen for a signed-out user.

A centered stack on the dot-grid background, with the content on a Canvas surface (never loose text on the grid): wordmark and mark, a display headline with one Ink Blue phrase (for example "Your notes, in your own repo."), a 16px Slate subhead of two lines, and a Primary button "Continue with GitHub" with the GitHub mark. Below, three Feature Cards in a row (24px gap): Local-first, Encrypted, Plain Markdown.

### Feature Card
**Role:** Short value statements on sign-in and the empty state.

Vellum background, 1px Rule border, radius 16px, padding 32px 24px, text centered. An Ink Blue 24px stroke icon inside a 40px Canvas circle. Title Inter 16px weight 500 Ink, description Inter 14px weight 400 Slate.

### Mobile Bottom Bar
**Role:** Primary navigation on phones.

56px high plus safe-area inset, Canvas background, 1px Rule top border. Five 44px icon buttons (files, search, new note, backlinks, settings), 24px stroke icons in Slate; the active one in Ink Blue with a 4px Ink Blue dot beneath. Swipe from the left edge opens the file tree sheet; swipe from the right opens the right panel.

### Menus, Popovers and Tooltips
**Role:** Context menus, dropdowns, hover previews.

Menus and popovers: Canvas background, 1px Rule border, radius 12px, padding 4px, popover shadow. Menu items: 32px high, radius 8px, Inter 13px, hover Fog; destructive items in Conflict text with a leading icon. Hover preview of a linked note: a popover 420px wide with the note rendered at 14px. Tooltips: Ink background, white Inter 12px, radius 8px, padding 4px 8px.

### Empty State
**Role:** No note open.

The editor area shows the dot-grid pattern (Rule dots, 1px, 16px spacing) behind a centered Canvas card with a short list of actions: "Create new note" (Primary), "Go to note" with its kbd hint, "Open daily note". Text never sits directly on the grid.

## States and Motion

- **Focus:** every interactive element shows a 2px Ink Blue outline with a 2px offset on keyboard focus (focus-visible). The halo (`--shadow-focus`) is used on inputs.
- **Hover:** Fog background on neutral controls; no color change on text links beyond the underline.
- **Selected text:** Blue Wash background.
- **Disabled:** Ash at 40% opacity, no hover.
- **Motion:** 120ms ease-out for hover, 160ms for panels and popovers, 200ms for sheets. Under `prefers-reduced-motion: reduce`, transitions are removed and the spinner becomes a static dot.
- **Color is never the only signal:** status, diffs and errors always add a label, icon or marker.

## Do's and Don'ts

### Do
- Use Ink Blue only for functional emphasis: wikilinks, the primary button, focus, checked states and the active mode.
- Use 1px Rule borders as the main structure; depth comes from layering Canvas, Vellum and Fog.
- Keep the four radius tiers: 999px for buttons, tags and tabs; 8px for inputs, code and callouts; 12px for menus; 16px for cards and modals.
- Put technical strings (paths, code, operators, SHAs, shortcuts) in Geist Mono and everything else in Inter.
- Keep note text at 16px with a 1.7 line height and a 720px measure, so long notes stay comfortable to read.
- Design both themes together: every token has a light and a dark value, and every component works in both.
- Make placeholders and helper text at least Slate (`#727272` in light) so contrast meets WCAG AA.
- Pair every status color with a text label or marker.
- Keep shadows at 2 to 5% black in light theme; in dark theme use borders instead.

### Don't
- Don't add any other chromatic color. The only hues are Ink Blue and the three status dots (plus the highlight tint inside notes).
- Don't fill large areas with color. Blue is for small interactive elements, never section or sidebar backgrounds.
- Don't use sharp corners (0 to 4px) on buttons, tabs or tags.
- Don't use Ash or Stone for text the user must read.
- Don't use color alone to convey sync state, errors or diffs.
- Don't use drop shadows on side panels or the tab strip.
- Don't place text directly on the dot-grid background; always put it on a card or surface.
- Don't use weight 600 in headings (headings are 500; 600 is for bold text in notes).
- Don't copy Obsidian's name, logo, purple or icon set.

## Surfaces

| Level | Name | Light | Dark | Purpose |
|-------|------|-------|------|---------|
| 0 | Canvas | `#ffffff` | `#141414` | Editor, tab strip, menus, modals |
| 1 | Vellum | `#f9f9f9` | `#1b1b1b` | Sidebars, status bar, cards, code blocks, callouts |
| 2 | Fog | `#f3f4f6` | `#232323` | Hover and selected rows, inline code, tag chips |
| 3 | Rule | `#e5e7eb` | `#2e2e2e` | Hairlines, grid dots, dividers |
| 4 | Blue Tint | `#eef2ff` | `#182040` | Notice bar, selected search result |

## Elevation

- **Flat (default):** sidebars, tab strip, status bar, cards. A 1px Rule border only.
- **Ring:** `0 0 0 6px var(--color-vellum)` around the focused search bar and the unlock card input.
- **Focus halo:** `0 0 0 3px var(--color-blue-wash)` on focused inputs.
- **Popover:** menus, dropdowns and hover previews (see Shadows).
- **Modal:** command palette, unlock card, dialogs (see Shadows), over a backdrop of Ink at 24% alpha.

## Imagery

Jotter has no photography or illustration. The visual language is text, hairlines and UI. Graphical elements are limited to:
1. A dot grid in Rule (1px dots, 16px spacing) on the sign-in screen and empty state, reading as graph or notebook paper.
2. The Jotter mark: a minimal, single-stroke "J" with a dot, in Ink Blue at 20px, beside a wordmark in Inter 15px weight 600 Ink. (Placeholder direction; final mark to be designed.)
3. Stroke icons (Lucide style): 1.5px stroke, 16px in the sidebar, 20px in toolbars, 24px in cards. Default Slate, Ink on hover, Ink Blue when active.

All imagery is single-color. No gradients and no multicolor illustrations. Attachments and images the user embeds in notes are shown as they are, with radius 8px and a 1px Rule border.

## Layout

Desktop is a three-pane shell: left sidebar (files, search, bookmarks), center editor with tabs and optional split panes, right sidebar (backlinks, outline, properties). Panes are separated by 1px Rule lines and can be dragged to resize. The editor column holds the 720px reading measure centered within the pane. The sign-in screen and the empty state use a centered vertical stack with a 1200px max width and 96px section gaps. Tablets collapse the right panel into a drawer; phones use a single pane with the bottom bar.

## Agent Prompt Guide

### Quick Color Reference (light)
- Page: `#ffffff`
- Panels and cards: `#f9f9f9`
- Hover and selected rows: `#f3f4f6`
- Primary text: `#262626`
- Secondary text: `#727272`
- Border: `#e5e7eb`
- Accent: `#2f54eb`
- Accent wash: `#dbe4ff`

### 5 Example Component Prompts

1. **Primary button:** Ink Blue `#2f54eb` background, white text, Inter 14px weight 500, letter-spacing 0.01em, padding 10px 20px, radius 999px, no border. On the sign-in screen add `box-shadow: 0 0 0 4px #dbe4ff`. Label: "Continue with GitHub" with the GitHub mark at 16px.

2. **File tree row and note tab:** Row height 28px, padding 0 8px, radius 8px, Inter 13px, 16px Slate stroke icon, 8px gap; hover and selected background `#f3f4f6`, selected weight 500; unsynced rows show a 6px `#e8a317` dot at the right. Note tab: height 28px, padding 0 12px, radius 999px, Inter 13px weight 500; inactive text `#727272`, active background `#f9f9f9` with a 1px `#e5e7eb` border and Ink text.

3. **Command palette:** 640px modal, radius 16px, white background, 1px `#e5e7eb` border, shadow `rgba(0,0,0,0.02) 0 40px 48px -20px, rgba(0,0,0,0.03) 0 32px 32px -20px, rgba(0,0,0,0.03) 0 16px 24px -12px, rgba(0,0,0,0.05) 0 0 0 1px`. 56px input row (Inter 16px, placeholder `#727272`, search icon, Esc kbd chip). Result rows 40px, radius 8px, title Inter 14px weight 500, path in Geist Mono 12px `#727272`; selected row background `#eef2ff`. Footer with kbd hints.

4. **Note page:** Canvas background, 720px centered column, Inter 16px / 1.7. H1 28px weight 500. A wikilink in `#2f54eb`, a `#tag` pill (`#f3f4f6` background, Inter 12px weight 500, `#727272`), a note callout (background `#f9f9f9`, 1px `#e5e7eb` border, radius 8px, 3px `#2f54eb` left border, title row with 16px icon), and a fenced code block (`#f9f9f9`, 1px border, radius 8px, Geist Mono 13px / 1.57).

5. **Sync status bar and unlock card:** Status bar 28px, `#f9f9f9`, 1px `#e5e7eb` top border, Inter 12px `#727272`; items: 8px dot plus label ("Synced", "3 unsynced" with the count in Geist Mono), word count, 12px lock icon. Unlock card: 400px wide, radius 16px, padding 32px 24px, centered; 40px `#f9f9f9` circle holding a 24px Ink Blue lock icon, title Inter 20px weight 500, pill password input, primary button, and a 13px `#727272` note that the passphrase never leaves the device and cannot be recovered.

### Accent Discipline

Ink Blue is rationed. In the interface chrome it appears on the primary button, focus, checked states and the active mode or icon. Inside notes it marks links and nothing else. It never fills large surfaces, tints sidebars, or decorates illustrations. When in doubt, use Ink (`#262626`).

### Typography Pairing Logic

Inter carries all prose and chrome: sidebar labels, tabs, buttons, menus and the text inside notes. Geist Mono takes over the moment a string is technical: code, file paths, frontmatter keys, search operators, keyboard shortcuts, commit SHAs and counts. If it could appear in a README, it is mono. If it could appear in a letter, it is Inter.

### Similar Products

- **Obsidian:** same linked-notes model, but Jotter uses a quiet near-white palette with one blue accent instead of purple, and must not reuse Obsidian branding.
- **Linear:** the same hairline-border, flat-component discipline and tight chrome.
- **Bear:** a calm, writing-first editor surface with generous line height.
- **Notion:** comfortable reading measure and soft panel surfaces, without block-based chrome.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors — light */
  --color-ink-blue: #2f54eb;
  --color-blue-wash: #dbe4ff;
  --color-blue-tint: #eef2ff;
  --color-rule: #e5e7eb;
  --color-ink: #262626;
  --color-canvas: #ffffff;
  --color-vellum: #f9f9f9;
  --color-fog: #f3f4f6;
  --color-slate: #727272;
  --color-graphite: #616161;
  --color-ash: #949494;
  --color-stone: #c7c7c7;
  --color-highlight: #fff3bf;
  --color-synced: #2f9e44;
  --color-pending: #e8a317;
  --color-conflict: #e03131;

  /* Typography — families */
  --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-geist-mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — scale */
  --text-caption: 11px;   --leading-caption: 1.45; --tracking-caption: 0.01em;
  --text-meta: 12px;      --leading-meta: 1.5;     --tracking-meta: 0.01em;
  --text-ui: 13px;        --leading-ui: 1.5;       --tracking-ui: 0;
  --text-body-ui: 14px;   --leading-body-ui: 1.5;  --tracking-body-ui: 0;
  --text-note: 16px;      --leading-note: 1.7;     --tracking-note: 0;
  --text-h4: 16px;        --leading-h4: 1.4;       --tracking-h4: 0;
  --text-h3: 18px;        --leading-h3: 1.3;       --tracking-h3: 0;
  --text-h2: 22px;        --leading-h2: 1.25;      --tracking-h2: 0;
  --text-h1: 28px;        --leading-h1: 1.2;       --tracking-h1: -0.005em;
  --text-heading-lg: 40px; --leading-heading-lg: 1.1; --tracking-heading-lg: -0.005em;
  --text-display: 52px;   --leading-display: 1.07; --tracking-display: -0.01em;

  /* Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;

  /* Layout */
  --note-measure: 720px;
  --page-max-width: 1200px;
  --sidebar-left-width: 260px;
  --sidebar-right-width: 280px;
  --tab-strip-height: 44px;
  --status-bar-height: 28px;
  --bottom-bar-height: 56px;
  --card-padding: 24px;
  --section-gap: 96px;

  /* Radius */
  --radius-pill: 999px;
  --radius-input: 8px;
  --radius-menu: 12px;
  --radius-card: 16px;
  --radius-micro: 6px;

  /* Shadows */
  --shadow-ring: 0 0 0 6px var(--color-vellum);
  --shadow-focus: 0 0 0 3px var(--color-blue-wash);
  --shadow-popover: rgba(0, 0, 0, 0.03) 0 16px 24px -8px, rgba(0, 0, 0, 0.03) 0 8px 16px -4px, rgba(0, 0, 0, 0.05) 0 0 0 1px;
  --shadow-modal: rgba(0, 0, 0, 0.02) 0 40px 48px -20px, rgba(0, 0, 0, 0.03) 0 32px 32px -20px, rgba(0, 0, 0, 0.03) 0 16px 24px -12px, rgba(0, 0, 0, 0.05) 0 0 0 1px;

  /* Motion */
  --motion-fast: 120ms ease-out;
  --motion-panel: 160ms ease-out;
  --motion-sheet: 200ms ease-out;
}

/* Dark theme: explicit choice */
[data-theme="dark"] {
  --color-ink-blue: #7c9bff;
  --color-blue-wash: #1f2a55;
  --color-blue-tint: #182040;
  --color-rule: #2e2e2e;
  --color-ink: #ececec;
  --color-canvas: #141414;
  --color-vellum: #1b1b1b;
  --color-fog: #232323;
  --color-slate: #a0a0a0;
  --color-graphite: #b5b5b5;
  --color-ash: #7a7a7a;
  --color-stone: #4a4a4a;
  --color-highlight: rgba(250, 204, 21, 0.25);
  --color-synced: #51cf66;
  --color-pending: #fcc419;
  --color-conflict: #ff6b6b;
  --shadow-popover: 0 0 0 1px var(--color-rule);
  --shadow-modal: rgba(0, 0, 0, 0.6) 0 24px 48px -12px, 0 0 0 1px var(--color-rule);
}

/* Dark theme: follow system when no explicit choice */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-ink-blue: #7c9bff;
    --color-blue-wash: #1f2a55;
    --color-blue-tint: #182040;
    --color-rule: #2e2e2e;
    --color-ink: #ececec;
    --color-canvas: #141414;
    --color-vellum: #1b1b1b;
    --color-fog: #232323;
    --color-slate: #a0a0a0;
    --color-graphite: #b5b5b5;
    --color-ash: #7a7a7a;
    --color-stone: #4a4a4a;
    --color-highlight: rgba(250, 204, 21, 0.25);
    --color-synced: #51cf66;
    --color-pending: #fcc419;
    --color-conflict: #ff6b6b;
    --shadow-popover: 0 0 0 1px var(--color-rule);
    --shadow-modal: rgba(0, 0, 0, 0.6) 0 24px 48px -12px, 0 0 0 1px var(--color-rule);
  }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}

:focus-visible {
  outline: 2px solid var(--color-ink-blue);
  outline-offset: 2px;
}

::selection {
  background: var(--color-blue-wash);
}
```

### Tailwind v4

Use together with the CSS Custom Properties block above, so theme switching works through the variables.

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

@theme {
  /* Colors (values come from the CSS variables, so they follow the theme) */
  --color-ink-blue: var(--color-ink-blue);
  --color-blue-wash: var(--color-blue-wash);
  --color-blue-tint: var(--color-blue-tint);
  --color-rule: var(--color-rule);
  --color-ink: var(--color-ink);
  --color-canvas: var(--color-canvas);
  --color-vellum: var(--color-vellum);
  --color-fog: var(--color-fog);
  --color-slate: var(--color-slate);
  --color-graphite: var(--color-graphite);
  --color-ash: var(--color-ash);
  --color-stone: var(--color-stone);
  --color-highlight: var(--color-highlight);
  --color-synced: var(--color-synced);
  --color-pending: var(--color-pending);
  --color-conflict: var(--color-conflict);

  /* Fonts */
  --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-geist-mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Type scale */
  --text-caption: 11px;
  --text-meta: 12px;
  --text-ui: 13px;
  --text-body-ui: 14px;
  --text-note: 16px;
  --text-h3: 18px;
  --text-h2: 22px;
  --text-h1: 28px;
  --text-heading-lg: 40px;
  --text-display: 52px;

  /* Radius */
  --radius-pill: 999px;
  --radius-input: 8px;
  --radius-menu: 12px;
  --radius-card: 16px;
  --radius-micro: 6px;

  /* Shadows */
  --shadow-ring: 0 0 0 6px var(--color-vellum);
  --shadow-focus: 0 0 0 3px var(--color-blue-wash);
}
```
