// A dependency-free view of the Babel AST: just enough structure for the rules
// to read node types, child links and source positions. The parser itself is
// the only runtime dependency (see parse.ts).

export interface Position {
  readonly line: number; // 1-based
  readonly column: number; // 0-based, in UTF-16 code units
}

export interface Loc {
  readonly start: Position;
  readonly end: Position;
}

export interface AstNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly loc: Loc;
  readonly [key: string]: unknown;
}

export interface Comment {
  readonly type: "CommentBlock" | "CommentLine";
  readonly value: string;
  readonly loc: Loc;
}

// A node plus the chain of nodes above it, root first. `ancestors.at(-1)` is
// the parent; a node with no ancestors is the root.
export interface Visit {
  readonly node: AstNode;
  readonly ancestors: readonly AstNode[];
}

export interface Visitor {
  readonly enter?: (visit: Visit) => void;
  readonly exit?: (visit: Visit) => void;
}

// Keys that hold bookkeeping, not syntax: following them would walk comments
// twice or leave the tree.
const NON_CHILD_KEYS: ReadonlySet<string> = new Set([
  "loc",
  "extra",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "comments",
  "errors",
]);

export function isNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

function nodesIn(value: unknown): readonly AstNode[] {
  if (Array.isArray(value)) return (value as readonly unknown[]).filter(isNode);
  return isNode(value) ? [value] : [];
}

export function children(node: AstNode): readonly AstNode[] {
  return Object.entries(node)
    .filter(([key]) => !NON_CHILD_KEYS.has(key))
    .flatMap(([, value]) => nodesIn(value));
}

// The single child under `key`, or undefined when it is absent or not a node.
export function child(node: AstNode, key: string): AstNode | undefined {
  const value = node[key];
  return isNode(value) ? value : undefined;
}

// The child nodes under `key`. Array holes (`[, a] = x`) are dropped.
export function childList(node: AstNode, key: string): readonly AstNode[] {
  return nodesIn(node[key]);
}

export function nameOf(node: AstNode | undefined): string | undefined {
  const name = node?.["name"];
  return typeof name === "string" ? name : undefined;
}

export function walk(node: AstNode, visitor: Visitor, ancestors: readonly AstNode[] = []): void {
  const visit: Visit = { node, ancestors };
  visitor.enter?.(visit);
  const next = [...ancestors, node];
  children(node).forEach((kid) => walk(kid, visitor, next));
  visitor.exit?.(visit);
}

export const parentOf = (visit: Visit): AstNode | undefined => visit.ancestors.at(-1);
