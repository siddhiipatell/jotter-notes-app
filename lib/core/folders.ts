import type { FileNode } from "../types";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function visible(path: string): boolean {
  const segs = path.split("/");
  if (segs.some((s) => s.startsWith("."))) return false; // .jotter, dotfolders, dotfiles
  return true;
}

/**
 * Build the file tree. Folders first then files, natural sort (`note 2` < `note 10`).
 * Hides anything under a dot-prefixed segment (.jotter, .git, ...). Shows `.md` notes and
 * attachments (any other non-dot file). Folder nodes are `unsynced` if any descendant is.
 */
export function buildTree(paths: string[], unsynced: Set<string> = new Set()): FileNode[] {
  const root: FileNode = { path: "", name: "", type: "folder", children: [] };
  const folders = new Map<string, FileNode>([["", root]]);
  const folder = (p: string): FileNode => {
    let f = folders.get(p);
    if (f) return f;
    const i = p.lastIndexOf("/");
    const parent = folder(i < 0 ? "" : p.slice(0, i));
    f = { path: p, name: p.slice(i + 1), type: "folder", children: [] };
    parent.children!.push(f);
    folders.set(p, f);
    return f;
  };
  for (const path of paths) {
    if (!path || path.endsWith("/") || !visible(path)) continue;
    const i = path.lastIndexOf("/");
    const parent = folder(i < 0 ? "" : path.slice(0, i));
    const node: FileNode = { path, name: path.slice(i + 1), type: "file" };
    if (unsynced.has(path)) {
      node.unsynced = true;
      for (let p = parent; ; ) {
        if (p === root) break;
        p.unsynced = true;
        const j = p.path.lastIndexOf("/");
        p = folders.get(j < 0 ? "" : p.path.slice(0, j))!;
      }
    }
    parent.children!.push(node);
  }
  const sort = (n: FileNode) => {
    n.children!.sort((a, b) => (a.type === b.type ? collator.compare(a.name, b.name) : a.type === "folder" ? -1 : 1));
    for (const c of n.children!) if (c.type === "folder") sort(c);
  };
  sort(root);
  return root.children!;
}
