import type { AstNode, Comment, Loc, Visit } from "../ast";

// What a rule gets to look at, and how it reports.
export interface RuleContext {
  readonly program: AstNode;
  readonly lines: readonly string[]; // source split on line breaks, 0-based
  readonly comments: readonly Comment[];
  // Reports at the start of `at` (a node or a comment): 1-based line and column.
  readonly report: (at: { readonly loc: Loc }, message: string) => void;
}

// A rule can look at the whole file once (`program`, for comment rules) and/or at
// every node as the tree is walked (`enter`/`exit`). Rules with state build a
// fresh instance per file, so nothing leaks between runs.
export interface Rule {
  readonly id: string;
  readonly program?: (context: RuleContext) => void;
  readonly enter?: (visit: Visit, context: RuleContext) => void;
  readonly exit?: (visit: Visit, context: RuleContext) => void;
}
