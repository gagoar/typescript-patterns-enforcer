import { dirname } from "node:path";
import { Linter } from "eslint";
import type { Rule, Linter as LinterNS } from "eslint";
import { parse, parseForESLint, meta as parserMeta } from "@typescript-eslint/parser";
// The package's `exports` map blocks arbitrary internal paths — this is its
// real, declared (if "use-at-your-own-risk") public surface for raw rule
// objects, keyed by rule name.
import tsEslintRules from "@typescript-eslint/eslint-plugin/use-at-your-own-risk/rules";
import preferAwaitToThen from "eslint-plugin-promise/rules/prefer-await-to-then";
import { noSwitchStatement } from "./rules/no-switch-statement";
import { noParamReassign } from "./rules/no-param-reassign";
import { noLoopStatements } from "./rules/no-loop-statements";
import { noNarrativeComment } from "./rules/no-narrative-comment";
import { noNestedTernary } from "./rules/no-nested-ternary";

// Justified cast (Core Rule 1): typescript-eslint's rule objects are typed
// against its own @typescript-eslint/utils RuleContext (extra fields like
// parserPath/parserOptions that plain ESLint's RuleContext doesn't declare),
// not raw ESLint's Rule.RuleModule — nominally incompatible, structurally
// identical: these are ordinary ESLint rule objects at runtime, executed by
// the same Linter as the hand-rolled ones below.
const noExplicitAny = tsEslintRules["no-explicit-any"] as unknown as Rule.RuleModule;
const banTsComment = tsEslintRules["ban-ts-comment"] as unknown as Rule.RuleModule;
const noMagicNumbers = tsEslintRules["no-magic-numbers"] as unknown as Rule.RuleModule;

type Severity = "error" | "warn";
type Origin = "reuse" | "hand-rolled";

interface MechanicalCheck {
  readonly id: string;
  readonly skillRule: string; // TRACEABILITY: which SKILL.md rule/section this mechanizes
  readonly origin: Origin;
  readonly rule: Rule.RuleModule;
  readonly options: readonly unknown[];
  readonly severity: Severity;
  readonly pointer: string; // shown in the hook's message back to Claude
}

// The traceability document between SKILL.md prose and this mechanical
// gate: every check here should correspond to a one-clause pointer added to
// the matching SKILL.md rule, never a full restatement of it.
export const CHECKS = [
  {
    id: "no-explicit-any",
    skillRule: "Core Rule 1 (No any)",
    origin: "reuse",
    rule: noExplicitAny,
    options: [],
    severity: "error",
    pointer: "SKILL.md Core Rule 1 — use unknown + narrow, or a precise type",
  },
  {
    id: "ban-ts-comment",
    skillRule: "@ts-ignore needs a TODO",
    origin: "reuse",
    rule: banTsComment,
    options: [
      { "ts-ignore": "allow-with-description", "ts-expect-error": "allow-with-description" },
    ],
    severity: "error",
    pointer: "SKILL.md — @ts-ignore needs a follow-up TODO/description",
  },
  {
    id: "no-magic-numbers",
    skillRule: "Core Rule 9 (magic numbers half)",
    origin: "reuse",
    rule: noMagicNumbers,
    // detectObjects: without this, every numeric value inside an object
    // literal is exempt — config objects and payload literals are the most
    // common home for magic numbers, so this option carries most of the
    // rule's real coverage.
    // ignoreNumericLiteralTypes: a TS literal-type union (`type X = 1 | 2`)
    // isn't a runtime expression and has no "extract to a const" fix path.
    options: [{
      ignore: [0, 1, -1],
      ignoreArrayIndexes: true,
      ignoreNumericLiteralTypes: true,
      detectObjects: true,
      enforceConst: false,
    }],
    severity: "warn",
    pointer: "SKILL.md Core Rule 9 — extract to a named const",
  },
  {
    id: "prefer-await-to-then",
    skillRule: "Core Rule 5 (async/await only)",
    origin: "reuse",
    rule: preferAwaitToThen,
    options: [],
    severity: "error",
    pointer: "SKILL.md Core Rule 5 — use async/await, not .then()",
  },
  {
    id: "no-switch-statement",
    skillRule: "Data Over Logic",
    origin: "hand-rolled",
    rule: noSwitchStatement,
    options: [],
    severity: "error",
    pointer: "SKILL.md Data Over Logic — convert to a Record dispatch table",
  },
  {
    id: "no-param-reassign",
    skillRule: "Never mutate function parameters",
    origin: "hand-rolled",
    rule: noParamReassign,
    options: [],
    severity: "error",
    pointer: "SKILL.md — return a new value, don't mutate the parameter",
  },
  {
    id: "no-loop-statements",
    skillRule: "Data Over Logic (pipelines)",
    origin: "hand-rolled",
    rule: noLoopStatements,
    options: [],
    severity: "warn",
    pointer: "SKILL.md Data Over Logic — express as .map()/.filter()/.reduce()",
  },
  {
    id: "no-narrative-comment",
    skillRule: "Comment Discipline",
    origin: "hand-rolled",
    rule: noNarrativeComment,
    options: [],
    // Lexical proxy for a semantic rule — expect both misses and occasional
    // false positives, unlike the near-exact checks above.
    severity: "warn",
    pointer: "SKILL.md Comment Discipline — state a feature or invariant, not history",
  },
  {
    id: "no-nested-ternary",
    skillRule: "Data Over Logic",
    origin: "hand-rolled",
    rule: noNestedTernary,
    options: [],
    severity: "error",
    pointer: "SKILL.md Data Over Logic — flatten or convert nested ternaries to a Record/.find() lookup",
  },
] as const satisfies readonly MechanicalCheck[];

const PLUGIN_NS = "ts-patterns";

// ESLint's own numeric severity codes, named rather than repeated as magic
// numbers at the one call site that needs them. Justified suppression: this
// object *is* the canonical named definition Core Rule 9 asks for — the
// values are ESLint's own external convention, not arbitrary.
// eslint-disable-next-line ts-patterns/no-magic-numbers
const ESLINT_SEVERITY = { error: 2, warn: 1 } as const;

// Justified cast (Core Rule 1): typescript-eslint's own AST/token types are
// structurally close to, but not nominally identical to, ESLint core's
// `AST.Token`/`ESLintParseResult` types (e.g. its BlockComment token type
// vs. core's Token type) — a well-known friction point between the two
// type packages. We never inspect `ast.tokens` ourselves; the object is
// ESLint's own standard, widely-used TypeScript parser at runtime.
const tsParser = { parse, parseForESLint, meta: parserMeta } as LinterNS.Parser;

const flatConfig: LinterNS.Config = {
  // Non-universal on purpose: ESLint's flat config treats a `files` list
  // containing only a universal pattern (e.g. "**/*") as never sufficient
  // by itself — it requires a separate, extension-specific config to also
  // match before applying (a deliberate safety net against a catch-all
  // config silently linting everything). "**/*.ts"/"**/*.tsx" are the
  // extension-specific patterns that satisfy that requirement on their own.
  files: ["**/*.ts", "**/*.tsx"],
  languageOptions: {
    parser: tsParser,
    // Justified suppression: an ECMAScript edition year, not an arbitrary
    // magic number — its meaning is exactly its literal value.
    // eslint-disable-next-line ts-patterns/no-magic-numbers
    ecmaVersion: 2023,
    sourceType: "module",
  },
  plugins: {
    [PLUGIN_NS]: { rules: Object.fromEntries(CHECKS.map((c) => [c.id, c.rule])) },
  },
  rules: Object.fromEntries(
    CHECKS.map((c) => [`${PLUGIN_NS}/${c.id}`, [ESLINT_SEVERITY[c.severity], ...c.options]]),
  ),
};

const POINTER_BY_ID: Readonly<Record<string, string>> = Object.fromEntries(
  CHECKS.map((c) => [c.id, c.pointer]),
);

export interface Violation {
  readonly ruleId: string; // bare id, e.g. "no-switch-statement" — the "ts-patterns/" namespace is stripped
  readonly line: number;
  readonly column: number;
  readonly text: string;
  readonly pointer: string;
}

export function runChecks(code: string, filename: string): readonly Violation[] {
  // cwd is set per call to the target file's own directory — flat config
  // treats any path resolving outside the Linter's cwd as "external" and
  // skips config matching entirely (learned the hard way: a mismatched cwd
  // silently produces zero violations, not an error). Anchoring cwd to the
  // file itself means it's never external, regardless of which directory
  // the hook process happens to be invoked from.
  const linter = new Linter({ configType: "flat", cwd: dirname(filename) });
  const messages = linter.verify(code, flatConfig, filename);
  return messages
    .filter((m): m is typeof m & { ruleId: string } => !m.fatal && Boolean(m.ruleId))
    .map((m) => {
      const id = m.ruleId.startsWith(`${PLUGIN_NS}/`) ? m.ruleId.slice(PLUGIN_NS.length + 1) : m.ruleId;
      return { ruleId: id, line: m.line, column: m.column, text: m.message, pointer: POINTER_BY_ID[id] ?? "" };
    });
}
