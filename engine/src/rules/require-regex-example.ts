import type { Rule, AST } from "eslint";
import { AST_NODE_TYPES } from "@typescript-eslint/types";

// A line that is empty or only whitespace. Matches "" and "  \t"; rejects " x".
// https://regex101.com/?flavor=javascript&regex=%5E%5Cs%2A%24&flags=gm&testString=%0A%20%20%09%0A%20x
const BLANK_LINE = /^\s*$/;

// The lexical proxy for "the comment gives a concrete input": any quoted
// string. Matches `"v1.2.0"` and `'abc'`; rejects `digits after -rc.` — a
// comment that only paraphrases the pattern has nothing in quotes.
// https://regex101.com/?flavor=javascript&regex=%5B%22%27%60%5D&flags=g&testString=%22v1.2.0%22%0A%27abc%27%0Adigits%20after%20-rc.
const QUOTED_EXAMPLE = /["'`]/;

// The lexical proxy for "the comment links a tester": any absolute URL.
// Whether it is pre-filled with the pattern and examples is the reviewer's call.
const TESTER_LINK = "https://";

const REGEXP_CONSTRUCTOR = "RegExp";

type Comment = AST.Program["comments"][number];

interface Located {
  readonly loc: AST.SourceLocation;
}

function hasLoc<T extends { readonly loc?: AST.SourceLocation | null }>(node: T | null | undefined): node is T & Located {
  return Boolean(node?.loc);
}

// Climbs to the outermost ancestor that starts on the regex's own line, so
// `const X = /re/;` anchors to the declaration and a regex sitting on its
// own line inside a multi-line call anchors to that line only. Recursive
// rather than a loop: it's a parent chain, not a collection.
function anchorLine(node: Rule.Node): number {
  const parent = node.parent as Rule.Node | undefined;
  if (!hasLoc(node)) return 0;
  const sameLineParent =
    hasLoc(parent) &&
    parent.type !== AST_NODE_TYPES.Program &&
    parent.loc.start.line === node.loc.start.line;
  return sameLineParent ? anchorLine(parent) : node.loc.start.line;
}

// 1-based number of the nearest non-blank line strictly above `line`, or 0
// when there is none.
function previousNonBlankLine(lines: readonly string[], line: number): number {
  const candidate = line - 1;
  if (candidate < 1) return 0;
  return BLANK_LINE.test(lines[candidate - 1] ?? "") ? previousNonBlankLine(lines, candidate) : candidate;
}

// A comment "owns" a line when it ends there and nothing but whitespace
// precedes it on the line it starts — a trailing `x = 1; // note` above the
// regex is not a comment about the regex.
function commentEndingOn(comments: readonly Comment[], lines: readonly string[], line: number): (Comment & Located) | undefined {
  return comments.filter(hasLoc).find((comment) => {
    if (comment.loc.end.line !== line) return false;
    const leading = (lines[comment.loc.start.line - 1] ?? "").slice(0, comment.loc.start.column);
    return BLANK_LINE.test(leading);
  });
}

// Collects the contiguous run of comment lines ending at `line` — a
// multi-line `//` block above a regex is one explanation, and the quoted
// example may live on any of its lines.
function commentBlockEndingOn(comments: readonly Comment[], lines: readonly string[], line: number): readonly Comment[] {
  const comment = commentEndingOn(comments, lines, line);
  if (!comment) return [];
  return [...commentBlockEndingOn(comments, lines, comment.loc.start.line - 1), comment];
}

function isRegExpConstruction(node: Rule.Node): boolean {
  const callee = (node as unknown as { callee?: { type: string; name?: string } }).callee;
  return callee?.type === AST_NODE_TYPES.Identifier && callee.name === REGEXP_CONSTRUCTOR;
}

/**
 * Mechanizes SKILL.md Core Rule 11: every regex literal and `RegExp(...)`
 * construction carries a comment directly above it. Presence is exact; the
 * "gives an example" and "links a tester" halves are lexical proxies (a
 * quoted string and an `https://` somewhere in the comment block), so whether
 * the examples exercise the pattern and the link carries them stays with the
 * LLM-enforced prose. Advisory (warn) for that reason.
 */
export const requireRegexExample: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      missingComment:
        "regex with no comment above it — say what it accepts, with a quoted input it matches and one it rejects (see SKILL.md Core Rule 11).",
      missingExample:
        "comment above the regex has no quoted example — add an input it matches and one it rejects (see SKILL.md Core Rule 11).",
      missingLink:
        "comment above the regex has no tester link — add a regex101.com (or equivalent) URL pre-filled with the pattern and the examples (see SKILL.md Core Rule 11).",
    },
  },
  create(context): Rule.RuleListener {
    const { lines } = context.sourceCode;
    const comments = context.sourceCode.getAllComments();

    const check = (node: Rule.Node): void => {
      const above = previousNonBlankLine(lines, anchorLine(node));
      const block = commentBlockEndingOn(comments, lines, above);
      if (!block.length) {
        context.report({ node, messageId: "missingComment" });
        return;
      }
      const text = block.map((comment) => comment.value).join("\n");
      if (!QUOTED_EXAMPLE.test(text)) {
        context.report({ node, messageId: "missingExample" });
        return;
      }
      if (!text.includes(TESTER_LINK)) {
        context.report({ node, messageId: "missingLink" });
      }
    };

    return {
      Literal(node): void {
        if ("regex" in node && node.regex) check(node);
      },
      NewExpression(node): void {
        if (isRegExpConstruction(node)) check(node);
      },
      CallExpression(node): void {
        if (isRegExpConstruction(node)) check(node);
      },
    };
  },
};
