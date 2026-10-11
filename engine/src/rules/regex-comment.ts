import { child, nameOf } from "../ast";
import type { AstNode, Comment } from "../ast";
import type { Rule } from "./types";

// Mechanizes SKILL.md Core Rule 11: every regex literal and `RegExp(...)`
// construction carries a comment directly above it. Presence is exact; the
// "gives an example" and "links a tester" halves are lexical proxies (a quoted
// string and an `https://` somewhere in the comment block), so whether the
// examples exercise the pattern and the link carries them stays with the
// LLM-enforced prose. Advisory for that reason.

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
const CONSTRUCTIONS: ReadonlySet<string> = new Set(["NewExpression", "CallExpression"]);
const FIRST_LINE = 1;

// Climbs to the outermost ancestor that starts on the regex's own line, so
// `const X = /re/;` anchors to the declaration and a regex sitting on its own
// line inside a multi-line call anchors to that line only.
function anchorLine(node: AstNode, ancestors: readonly AstNode[]): number {
  const parent = ancestors.at(-1);
  const sameLineParent = parent !== undefined && parent.type !== "Program" && parent.loc.start.line === node.loc.start.line;
  return sameLineParent ? anchorLine(parent, ancestors.slice(0, -1)) : node.loc.start.line;
}

// 1-based number of the nearest non-blank line strictly above `line`, or 0 when
// there is none.
function previousNonBlankLine(lines: readonly string[], line: number): number {
  const candidate = line - 1;
  if (candidate < FIRST_LINE) return 0;
  return BLANK_LINE.test(lines[candidate - 1] ?? "") ? previousNonBlankLine(lines, candidate) : candidate;
}

// A comment "owns" a line when it ends there and nothing but whitespace precedes
// it on the line it starts: a trailing `x = 1; // note` above the regex is not a
// comment about the regex.
function commentEndingOn(comments: readonly Comment[], lines: readonly string[], line: number): Comment | undefined {
  return comments.find((comment) => {
    if (comment.loc.end.line !== line) return false;
    const leading = (lines[comment.loc.start.line - 1] ?? "").slice(0, comment.loc.start.column);
    return BLANK_LINE.test(leading);
  });
}

// The contiguous run of comment lines ending at `line`: a multi-line `//` block
// above a regex is one explanation, and the quoted example may be on any line.
function commentBlockEndingOn(comments: readonly Comment[], lines: readonly string[], line: number): readonly Comment[] {
  const comment = commentEndingOn(comments, lines, line);
  if (!comment) return [];
  return [...commentBlockEndingOn(comments, lines, comment.loc.start.line - 1), comment];
}

function isRegExpConstruction(node: AstNode): boolean {
  const callee = child(node, "callee");
  return CONSTRUCTIONS.has(node.type) && callee?.type === "Identifier" && nameOf(callee) === REGEXP_CONSTRUCTOR;
}

export const requireRegexExample: Rule = {
  id: "require-regex-example",
  enter: ({ node, ancestors }, context) => {
    if (node.type !== "RegExpLiteral" && !isRegExpConstruction(node)) return;
    const above = previousNonBlankLine(context.lines, anchorLine(node, ancestors));
    const block = commentBlockEndingOn(context.comments, context.lines, above);
    if (!block.length) {
      context.report(
        node,
        "regex with no comment above it — say what it accepts, with a quoted input it matches and one it rejects (see SKILL.md Core Rule 11).",
      );
      return;
    }
    const text = block.map((comment) => comment.value).join("\n");
    if (!QUOTED_EXAMPLE.test(text)) {
      context.report(
        node,
        "comment above the regex has no quoted example — add an input it matches and one it rejects (see SKILL.md Core Rule 11).",
      );
      return;
    }
    if (!text.includes(TESTER_LINK)) {
      context.report(
        node,
        "comment above the regex has no tester link — add a regex101.com (or equivalent) URL pre-filled with the pattern and the examples (see SKILL.md Core Rule 11).",
      );
    }
  },
};
