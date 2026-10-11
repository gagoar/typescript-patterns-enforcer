import { childList } from "../ast";
import type { AstNode, Comment } from "../ast";
import type { Rule } from "./types";

// ---- ban-ts-comment -------------------------------------------------------
// Same behavior as typescript-eslint's rule with the options this plugin used:
// `@ts-ignore` and `@ts-expect-error` need a description, `@ts-nocheck` is
// banned, `@ts-check` is allowed.

const MIN_DESCRIPTION_LENGTH = 3;
const NEEDS_DESCRIPTION: ReadonlySet<string> = new Set(["ignore", "expect-error"]);

// `// @ts-nocheck` and `/// @ts-check`: the file-level pragmas, with the slashes.
// Matches "// @ts-nocheck" → ("nocheck", ""); rejects "// @ts-ignore" and "// note @ts-nocheck".
// https://regex101.com/?flavor=javascript&regex=%5E%5C%2F%5C%2F%5C%2F%3F%5Cs*%40ts-(check%7Cnocheck)(.*)%24&testString=%2F%2F%20%40ts-nocheck%0A%2F%2F%20%40ts-ignore%0A%2F%2F%20note%20%40ts-nocheck
const PRAGMA_LINE = /^\/\/\/?\s*@ts-(?<directive>check|nocheck)(?<description>.*)$/;

// The line-comment form of ignore/expect-error, applied to the text after `//`.
// Matches " @ts-ignore: why" → ("ignore", ": why"); rejects " see @ts-ignore" and " @ts-nocheck".
// https://regex101.com/?flavor=javascript&regex=%5E%5C%2F*%5Cs*%40ts-(expect-error%7Cignore)(.*)&testString=%20%40ts-ignore%3A%20why%0A%20see%20%40ts-ignore%0A%20%40ts-nocheck
const DIRECTIVE_LINE = /^\/*\s*@ts-(?<directive>expect-error|ignore)(?<description>.*)/;

// The same, applied to the last line of a block comment, which may start with `*`.
// Matches " * @ts-expect-error because" → ("expect-error", " because"); rejects " * plain text".
// https://regex101.com/?flavor=javascript&regex=%5E%5Cs*(%3F%3A%5C%2F%7C%5C*)*%5Cs*%40ts-(expect-error%7Cignore)(.*)&testString=%20*%20%40ts-expect-error%20because%0A%20*%20plain%20text
const DIRECTIVE_BLOCK = /^\s*(?:\/|\*)*\s*@ts-(?<directive>expect-error|ignore)(?<description>.*)/;

const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/;

interface Directive {
  readonly directive: string;
  readonly description: string;
}

function execDirective(pattern: RegExp, text: string): Directive | undefined {
  const groups = pattern.exec(text)?.groups;
  const directive = groups?.["directive"];
  const description = groups?.["description"];
  return directive === undefined || description === undefined ? undefined : { directive, description };
}

function findDirective(comment: Comment): Directive | undefined {
  if (comment.type === "CommentLine") {
    return execDirective(PRAGMA_LINE, `//${comment.value}`) ?? execDirective(DIRECTIVE_LINE, comment.value);
  }
  const lines = comment.value.split(LINE_BREAK);
  return execDirective(DIRECTIVE_BLOCK, lines.at(-1) ?? "");
}

// Length in user-perceived characters, so "日本語" and an emoji count as one each.
function graphemeCount(text: string): number {
  return [...new Intl.Segmenter().segment(text)].length;
}

// The first statement decides whether a `@ts-nocheck` is a real file pragma;
// "use strict" style directives count as statements, as they do in ESTree.
function firstStatementLine(program: AstNode): number | undefined {
  const first = [...childList(program, "directives"), ...childList(program, "body")]
    .sort((a, b) => a.start - b.start)
    .at(0);
  return first?.loc.start.line;
}

export const banTsComment: Rule = {
  id: "ban-ts-comment",
  program: (context) => {
    const firstLine = firstStatementLine(context.program);
    context.comments.forEach((comment) => {
      const found = findDirective(comment);
      if (!found) return;
      const { directive, description } = found;
      const pragmaAfterCode = directive === "nocheck" && firstLine !== undefined && firstLine <= comment.loc.start.line;
      if (pragmaAfterCode) return;
      if (directive === "nocheck") {
        context.report(comment, `Do not use "@ts-${directive}" because it alters compilation errors.`);
        return;
      }
      if (NEEDS_DESCRIPTION.has(directive) && graphemeCount(description.trim()) < MIN_DESCRIPTION_LENGTH) {
        context.report(
          comment,
          `Include a description after the "@ts-${directive}" directive to explain why the @ts-${directive} is necessary. The description must be ${MIN_DESCRIPTION_LENGTH} characters or longer.`,
        );
      }
    });
  },
};

// ---- no-narrative-comment -------------------------------------------------
// Case-insensitive, backward-looking phrases that mark a comment as narrating
// how the code came to be (debugging history, a past design, what a prior
// version did) rather than stating what the code does now. A lexical proxy for
// SKILL.md's Comment Discipline: it catches the clearest tells, not every
// violation, and can false-positive on a legitimate comment that uses one of
// these words for another reason. Advisory, not a precise gate.
const NARRATIVE_MARKERS = [
  "adversarial testing",
  "we found",
  "found that",
  "turns out",
  "used to be",
  "previously",
  "originally",
  "discovered",
  "after debugging",
  "the bug was",
  "this used to",
] as const;

function findMarker(text: string): string | undefined {
  const lower = text.toLowerCase();
  return NARRATIVE_MARKERS.find((marker) => lower.includes(marker));
}

export const noNarrativeComment: Rule = {
  id: "no-narrative-comment",
  program: (context) => {
    context.comments.forEach((comment) => {
      const marker = findMarker(comment.value);
      if (marker) {
        context.report(
          comment,
          `comment reads as history ("${marker}") — state the present-tense feature or invariant instead (see SKILL.md Comment Discipline).`,
        );
      }
    });
  },
};
