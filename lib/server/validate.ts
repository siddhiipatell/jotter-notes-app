import type { CommitRequest, RepoRef } from "@/lib/types";
import { ApiException } from "./errors";

export const MAX_CHANGES = 500;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_PATH_LEN = 1024;
export const MAX_MESSAGE_LEN = 4000;

const bad = (m: string) => new ApiException("bad_request", m);
const SHA_RE = /^[0-9a-f]{40}$/;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\u0000-\u001f\u007f]/;

export function isSha(s: unknown): s is string {
  return typeof s === "string" && SHA_RE.test(s);
}

export function validateSha(s: unknown, what = "sha"): string {
  if (!isSha(s)) throw bad(`Invalid ${what}`);
  return s;
}

/** Repo-relative path: no traversal, no leading slash, no backslashes, no .git segment. */
export function validatePath(p: unknown): string {
  if (typeof p !== "string" || p.length === 0) throw bad("Path must be a non-empty string");
  if (p.length > MAX_PATH_LEN) throw bad("Path too long");
  if (p.startsWith("/")) throw bad("Path must not start with '/'");
  if (p.includes("\\")) throw bad("Path must not contain backslashes");
  if (CTRL_RE.test(p)) throw bad("Path contains control characters");
  for (const seg of p.split("/")) {
    if (seg === "" || seg === "." || seg === "..") throw bad("Path contains an invalid segment");
    if (seg.toLowerCase() === ".git") throw bad("Path must not touch .git");
  }
  return p;
}

export function validateRepoRef(r: unknown): RepoRef {
  if (!r || typeof r !== "object") throw bad("Invalid repository");
  const { owner, name, branch } = r as Record<string, unknown>;
  if (typeof owner !== "string" || !NAME_RE.test(owner)) throw bad("Invalid owner");
  if (typeof name !== "string" || !NAME_RE.test(name) || name === "." || name === "..") throw bad("Invalid repository name");
  if (
    typeof branch !== "string" || branch.length === 0 || branch.length > 255 ||
    CTRL_RE.test(branch) || branch.includes("..") || branch.startsWith("-") ||
    branch.startsWith("/") || branch.endsWith("/") || branch.endsWith(".lock") || /[\s~^:?*[\\]/.test(branch)
  ) throw bad("Invalid branch");
  return { owner, name, branch };
}

/** Decoded size of a base64 string without decoding it. */
export function base64ByteLength(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length / 4) * 3 - pad;
}

export function validateCommitRequest(body: unknown): CommitRequest {
  if (!body || typeof body !== "object") throw bad("Invalid body");
  const { baseSha, message, changes } = body as Record<string, unknown>;
  validateSha(baseSha, "baseSha");
  if (typeof message !== "string" || message.trim() === "" || message.length > MAX_MESSAGE_LEN) throw bad("Invalid commit message");
  if (!Array.isArray(changes) || changes.length === 0) throw bad("changes must be a non-empty array");
  if (changes.length > MAX_CHANGES) throw bad(`Too many changes (max ${MAX_CHANGES})`);
  const seen = new Set<string>();
  let total = 0;
  for (const c of changes) {
    if (!c || typeof c !== "object") throw bad("Invalid change");
    const { path, contentBase64 } = c as Record<string, unknown>;
    validatePath(path);
    if (seen.has(path as string)) throw bad("Duplicate path in changes");
    seen.add(path as string);
    if (contentBase64 === null) continue;
    if (typeof contentBase64 !== "string") throw bad("contentBase64 must be a string or null");
    if (contentBase64.length % 4 !== 0 || !B64_RE.test(contentBase64)) throw bad("Invalid base64 content");
    const size = base64ByteLength(contentBase64);
    if (size > MAX_FILE_BYTES) throw bad("File exceeds 25MB limit");
    total += size;
    if (total > MAX_TOTAL_BYTES) throw bad("Commit too large");
  }
  return { baseSha: baseSha as string, message, changes: changes as CommitRequest["changes"] };
}
