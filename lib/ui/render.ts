"use client";
import { Marked, type Tokens, type TokenizerAndRendererExtension } from "marked";
import DOMPurify from "dompurify";
import { stripFrontmatter, parseWikiInner, isImagePath, findAttachment, extractSection, noteTitle } from "./wikilink";
import { parseCalloutText } from "./callouts";
import { vault } from "./vault";

/* Reading-mode renderer: marked -> DOMPurify (raw HTML is dropped, never rendered) -> DOM hydration. */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface WikiToken extends Tokens.Generic { embed: boolean; target: string; heading?: string; block?: string; alias?: string }

const wikilink: TokenizerAndRendererExtension = {
  name: "wikilink",
  level: "inline",
  start: (src) => { const i = src.search(/!?\[\[/); return i < 0 ? undefined : i; },
  tokenizer(src) {
    const m = /^(!?)\[\[([^\[\]\r\n|]+?)(?:\|([^\[\]\r\n]*?))?\]\]/.exec(src);
    if (!m) return undefined;
    const parts = parseWikiInner(m[3] !== undefined ? `${m[2]}|${m[3]}` : m[2]);
    return { type: "wikilink", raw: m[0], embed: !!m[1], ...parts } as WikiToken;
  },
  renderer(tok) {
    const t = tok as WikiToken;
    const data = `data-target="${esc(t.target)}"${t.heading ? ` data-heading="${esc(t.heading)}"` : ""}${t.block ? ` data-block="${esc(t.block)}"` : ""}`;
    if (t.embed) {
      if (isImagePath(t.target)) return `<img class="embed-image" data-attachment="${esc(t.target)}" alt="${esc(t.alias ?? t.target)}">`;
      return `<div class="embed" ${data}></div>`;
    }
    const label = t.alias ?? (t.heading ? `${t.target} > ${t.heading}` : t.target);
    return `<a class="wikilink" href="#" ${data}>${esc(label)}</a>`;
  },
};

const tag: TokenizerAndRendererExtension = {
  name: "tag",
  level: "inline",
  start: (src) => { const i = src.search(/(?<![\p{L}\p{N}_&/#])#[\p{L}\p{N}_/-]*[\p{L}_/-]/u); return i < 0 ? undefined : i; },
  tokenizer(src) {
    const m = /^#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/u.exec(src);
    return m ? ({ type: "tag", raw: m[0], tag: m[1] } as Tokens.Generic) : undefined;
  },
  renderer: (tok) => `<a class="tag" href="#" data-tag="${esc(String(tok.tag))}">#${esc(String(tok.tag))}</a>`,
};

const highlight: TokenizerAndRendererExtension = {
  name: "highlight",
  level: "inline",
  start: (src) => { const i = src.indexOf("=="); return i < 0 ? undefined : i; },
  tokenizer(src) {
    const m = /^==(?=\S)([^\n]+?)(?<=\S)==/.exec(src);
    if (!m) return undefined;
    return { type: "highlight", raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) } as Tokens.Generic;
  },
  renderer(tok) { return `<mark>${this.parser.parseInline(tok.tokens ?? [])}</mark>`; },
};

const md = new Marked({ gfm: true, breaks: true });
md.use({
  extensions: [wikilink, tag, highlight],
  renderer: {
    html: () => "", // raw HTML is off: strip it
    image({ href, title, text }: Tokens.Image) {
      const t = title ? ` title="${esc(title)}"` : "";
      if (/^(https?:|data:image\/)/i.test(href)) return `<img src="${esc(href)}" alt="${esc(text)}"${t}>`;
      return `<img class="embed-image" data-attachment="${esc(decodeURI(href))}" alt="${esc(text)}"${t}>`;
    },
  },
});

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? "";
      if (/^https?:/i.test(href)) { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
    }
    if (node.tagName === "INPUT" && node.getAttribute("type") === "checkbox") node.classList.add("task-checkbox");
  });
}

/** Markdown to sanitised HTML. Frontmatter is not rendered. */
export function renderMarkdown(src: string): string {
  ensureHooks();
  const html = md.parse(stripFrontmatter(src), { async: false }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "iframe", "object", "embed", "script"],
    FORBID_ATTR: ["style", "srcset"],
    ADD_ATTR: ["data-target", "data-heading", "data-block", "data-attachment", "data-tag"],
  });
}

/** Render inline Markdown only (table cells, titles). */
export function renderInline(src: string): string {
  ensureHooks();
  return DOMPurify.sanitize(md.parseInline(src, { async: false }) as string, { USE_PROFILES: { html: true }, FORBID_ATTR: ["style"] });
}

export interface HydrateContext { path: string; depth?: number }

const ICON_TYPES = new Set(["note", "tip", "success", "warning", "danger"]);

export function buildCallout(kind: string, type: string, title: string, fold: "+" | "-" | null): { root: HTMLElement; body: HTMLElement } {
  const k = ICON_TYPES.has(kind) ? kind : "note";
  const root = document.createElement(fold ? "details" : "div");
  root.className = `callout callout-${k}`;
  root.dataset.callout = type;
  if (fold === "+") (root as HTMLDetailsElement).open = true;
  const head = document.createElement(fold ? "summary" : "div");
  head.className = "callout-title";
  const icon = document.createElement("span");
  icon.className = "callout-icon";
  icon.dataset.icon = k;
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "callout-title-text";
  label.textContent = title;
  head.append(icon, label);
  if (fold) {
    const chev = document.createElement("span");
    chev.className = "callout-chevron";
    chev.setAttribute("aria-hidden", "true");
    head.append(chev);
  }
  const body = document.createElement("div");
  body.className = "callout-body";
  root.append(head, body);
  return { root, body };
}

function hydrateCallouts(root: HTMLElement) {
  for (const bq of Array.from(root.querySelectorAll("blockquote"))) {
    const p = bq.firstElementChild;
    if (!p || p.tagName !== "P") continue;
    const m = /^\s*\[!([A-Za-z][\w-]*)\]([+-])?[ \t]*([^\n]*?)(?:<br\s*\/?>|\n|$)/.exec(p.innerHTML);
    if (!m) continue;
    const titleEl = document.createElement("span");
    titleEl.innerHTML = m[3];
    const header = parseCalloutText(`[!${m[1]}]${m[2] ?? ""} ${titleEl.textContent ?? ""}`);
    if (!header) continue;
    const { root: box, body } = buildCallout(header.kind, header.type, header.title, header.fold);
    p.innerHTML = p.innerHTML.slice(m[0].length);
    if (!p.textContent?.trim() && !p.querySelector("img")) p.remove();
    while (bq.firstChild) body.append(bq.firstChild);
    bq.replaceWith(box);
  }
}

function hydrateCode(root: HTMLElement) {
  for (const pre of Array.from(root.querySelectorAll("pre"))) {
    if (pre.parentElement?.classList.contains("codeblock")) continue;
    const code = pre.querySelector("code");
    const lang = /language-([\w+-]+)/.exec(code?.className ?? "")?.[1] ?? "";
    const wrap = document.createElement("div");
    wrap.className = "codeblock";
    const head = document.createElement("div");
    head.className = "codeblock-head";
    const label = document.createElement("span");
    label.className = "codeblock-lang";
    label.textContent = lang;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "codeblock-copy";
    btn.textContent = "Copy";
    btn.setAttribute("aria-label", "Copy code");
    btn.addEventListener("click", () => {
      void navigator.clipboard?.writeText(code?.textContent ?? "").then(() => {
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 1500);
      });
    });
    head.append(label, btn);
    pre.replaceWith(wrap);
    wrap.append(head, pre);
  }
}

async function hydrateAttachments(root: HTMLElement, ctx: HydrateContext, selector = "img[data-attachment]") {
  const v = vault();
  const paths = v.listPaths();
  await Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>(selector)).map(async (img) => {
    const target = img.dataset.attachment ?? "";
    const p = findAttachment(target, ctx.path, paths);
    const url = p ? await v.readAttachmentUrl(p).catch(() => null) : null;
    if (url) { img.src = url; img.classList.remove("embed-missing"); } else img.classList.add("embed-missing");
  }));
}

async function hydrateEmbeds(root: HTMLElement, ctx: HydrateContext, selector = "div.embed") {
  const v = vault();
  const depth = ctx.depth ?? 0;
  await Promise.all(Array.from(root.querySelectorAll<HTMLElement>(selector)).map(async (el) => {
    el.classList.remove("embed-missing");
    const target = el.dataset.target ?? "";
    const heading = el.dataset.heading;
    const block = el.dataset.block;
    const resolved = v.resolve(target, ctx.path);
    const bar = document.createElement("div");
    bar.className = "embed-title";
    bar.textContent = `${target}${heading ? ` › ${heading}` : ""}`;
    el.replaceChildren(bar);
    if (!resolved || depth >= 3) {
      el.classList.add("embed-missing");
      const msg = document.createElement("div");
      msg.className = "embed-empty";
      msg.textContent = resolved ? "Embed depth limit reached" : "Note not found";
      el.append(msg);
      return;
    }
    el.dataset.path = resolved;
    const text = await v.read(resolved).catch(() => null);
    const body = document.createElement("div");
    body.className = "embed-body md-render";
    el.append(body);
    body.innerHTML = renderMarkdown(extractSection(text ?? "", heading, block));
    await hydrate(body, { path: resolved, depth: depth + 1 });
  }));
}

function markLinks(root: HTMLElement, ctx: HydrateContext) {
  const v = vault();
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>("a.wikilink"))) {
    const target = a.dataset.target ?? "";
    a.classList.toggle("unresolved", target !== "" && !v.resolve(target, ctx.path));
  }
}

/** Link resolution is asynchronous inside the vault (first lookups return null); re-check when the index changes. */
const watchers = new WeakMap<HTMLElement, () => void>();
function watchResolution(root: HTMLElement, ctx: HydrateContext) {
  watchers.get(root)?.();
  const v = vault();
  const check = () => {
    if (!root.isConnected) { off(); return; }
    markLinks(root, ctx);
    const missing = Array.from(root.querySelectorAll<HTMLElement>("div.embed.embed-missing")).some((el) => v.resolve(el.dataset.target ?? "", ctx.path));
    if (missing) void hydrateEmbeds(root, ctx, "div.embed.embed-missing");
    if (root.querySelector("img.embed-missing[data-attachment]")) void hydrateAttachments(root, ctx, "img.embed-missing[data-attachment]");
  };
  const offs = [v.subscribe("index", check), v.subscribe("tree", check)];
  const off = () => { offs.forEach((o) => o()); watchers.delete(root); };
  watchers.set(root, off);
}

/** Post-process rendered HTML: callouts, code headers, link state, images, embeds. Safe to call repeatedly. */
export async function hydrate(root: HTMLElement, ctx: HydrateContext): Promise<void> {
  hydrateCallouts(root);
  hydrateCode(root);
  markLinks(root, ctx);
  root.querySelectorAll<HTMLInputElement>("input.task-checkbox").forEach((el, i) => {
    el.disabled = false;
    el.dataset.taskIndex = String(i);
    el.setAttribute("aria-label", "Toggle task");
  });
  watchResolution(root, ctx);
  await Promise.all([hydrateAttachments(root, ctx), hydrateEmbeds(root, ctx)]);
}

export function titleOf(path: string) { return noteTitle(path); }
