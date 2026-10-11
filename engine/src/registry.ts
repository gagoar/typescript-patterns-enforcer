import { walk } from "./ast";
import { readSuppressions } from "./directives";
import { parseTypeScript } from "./parse";
import { banTsComment, noNarrativeComment } from "./rules/comments";
import { noMagicNumbers } from "./rules/magic-numbers";
import { createNoParamReassign } from "./rules/param-reassign";
import { preferAwaitToThen } from "./rules/promise";
import { requireRegexExample } from "./rules/regex-comment";
import { noExplicitAny, noLoopStatements, noNestedTernary, noSwitchStatement } from "./rules/simple";
import type { Rule, RuleContext } from "./rules/types";

interface MechanicalCheck {
  readonly id: string;
  readonly skillRule: string; // TRACEABILITY: which SKILL.md rule/section this mechanizes
  readonly pointer: string; // shown in the hook's message back to Claude
  readonly create: () => Rule; // a fresh instance per file, so no state leaks between runs
}

// The traceability document between SKILL.md prose and this mechanical gate:
// every check here should correspond to a one-clause pointer added to the
// matching SKILL.md rule, never a full restatement of it.
export const CHECKS: readonly MechanicalCheck[] = [
  {
    id: "no-explicit-any",
    skillRule: "Core Rule 1 (No any)",
    pointer: "SKILL.md Core Rule 1 — use unknown + narrow, or a precise type",
    create: () => noExplicitAny,
  },
  {
    id: "ban-ts-comment",
    skillRule: "@ts-ignore needs a TODO",
    pointer: "SKILL.md — @ts-ignore needs a follow-up TODO/description",
    create: () => banTsComment,
  },
  {
    // Numbers inside object literals are checked too: config objects and payload
    // literals are the most common home for magic numbers. A numeric literal type
    // (`type X = 1 | 2`) is not a runtime expression and has no "extract to a
    // const" fix path, so it is exempt.
    id: "no-magic-numbers",
    skillRule: "Core Rule 9 (magic numbers half)",
    pointer: "SKILL.md Core Rule 9 — extract to a named const",
    create: () => noMagicNumbers,
  },
  {
    id: "prefer-await-to-then",
    skillRule: "Core Rule 5 (async/await only)",
    pointer: "SKILL.md Core Rule 5 — use async/await, not .then()",
    create: () => preferAwaitToThen,
  },
  {
    id: "no-switch-statement",
    skillRule: "Data Over Logic",
    pointer: "SKILL.md Data Over Logic — convert to a Record dispatch table",
    create: () => noSwitchStatement,
  },
  {
    id: "no-param-reassign",
    skillRule: "Never mutate function parameters",
    pointer: "SKILL.md — return a new value, don't mutate the parameter",
    create: createNoParamReassign,
  },
  {
    id: "no-loop-statements",
    skillRule: "Data Over Logic (pipelines)",
    pointer: "SKILL.md Data Over Logic — express as .map()/.filter()/.reduce()",
    create: () => noLoopStatements,
  },
  {
    // A lexical proxy for a semantic rule: expect both misses and occasional
    // false positives, unlike the near-exact checks above.
    id: "no-narrative-comment",
    skillRule: "Comment Discipline",
    pointer: "SKILL.md Comment Discipline — state a feature or invariant, not history",
    create: () => noNarrativeComment,
  },
  {
    id: "no-nested-ternary",
    skillRule: "Data Over Logic",
    pointer: "SKILL.md Data Over Logic — flatten or convert nested ternaries to a Record/.find() lookup",
    create: () => noNestedTernary,
  },
  {
    // Comment presence is exact; "has an example" and "has a tester link" are
    // lexical proxies (a quoted string and an https:// in the comment).
    id: "require-regex-example",
    skillRule: "Core Rule 11 (every regex carries an example)",
    pointer: "SKILL.md Core Rule 11 — comment above: what it accepts, a quoted match/reject, and a pre-filled tester link",
    create: () => requireRegexExample,
  },
];

const POINTER_BY_ID: Readonly<Record<string, string>> = Object.fromEntries(CHECKS.map((check) => [check.id, check.pointer]));

// ESLint's definition of a line break, so line numbers and columns agree with it.
const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/;

export interface Violation {
  readonly ruleId: string; // bare id, e.g. "no-switch-statement"
  readonly line: number;
  readonly column: number;
  readonly text: string;
  readonly pointer: string;
}

interface Finding {
  readonly ruleId: string;
  readonly line: number;
  readonly column: number; // 1-based
  readonly text: string;
}

const BYTE_ORDER_MARK = "\uFEFF";

// A byte-order mark is not part of the first line: columns count from the first real character.
const withoutBom = (code: string): string => (code.startsWith(BYTE_ORDER_MARK) ? code.slice(BYTE_ORDER_MARK.length) : code);

function analyze(source: string, filename: string): readonly Finding[] {
  const code = withoutBom(source);
  const parsed = parseTypeScript(code, filename);
  if (!parsed) return [];
  const findings: Finding[] = [];
  const lines = code.split(LINE_BREAK);
  const rules = CHECKS.map((check) => check.create());
  const contextFor = (rule: Rule): RuleContext => ({
    program: parsed.program,
    lines,
    comments: parsed.comments,
    report: (at, text) => {
      const { line, column } = at.loc.start;
      findings.push({ ruleId: rule.id, line, column: column + 1, text });
    },
  });
  const contexts = rules.map(contextFor);
  rules.forEach((rule, index) => {
    const context = contexts[index];
    if (context) rule.program?.(context);
  });
  walk(parsed.program, {
    enter: (visit) => rules.forEach((rule, index) => contexts[index] && rule.enter?.(visit, contexts[index])),
    exit: (visit) => rules.forEach((rule, index) => contexts[index] && rule.exit?.(visit, contexts[index])),
  });
  const suppressions = readSuppressions(parsed.comments);
  return findings.filter((finding) => !suppressions.isSuppressed(finding.ruleId, { line: finding.line, column: finding.column - 1 }));
}

export function runChecks(code: string, filename: string): readonly Violation[] {
  // A hook must never break an edit: if the analysis itself fails (a pathological
  // file, a stack overflow on a very deep expression), report nothing.
  const findings = safely(() => analyze(code, filename));
  return [...findings]
    .sort((a, b) => a.line - b.line || a.column - b.column)
    .map((finding) => ({
      ruleId: finding.ruleId,
      line: finding.line,
      column: finding.column,
      text: finding.text,
      pointer: POINTER_BY_ID[finding.ruleId] ?? "",
    }));
}

function safely(run: () => readonly Finding[]): readonly Finding[] {
  try {
    return run();
  } catch {
    return [];
  }
}
