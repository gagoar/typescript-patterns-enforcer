import type { Comment } from "./ast";

// `eslint-disable` style comments, which the previous engine honored because it
// ran on ESLint. They are matched against the rule ids this plugin reports
// ("ts-patterns/no-magic-numbers"); comments naming other rules, such as the
// project's own ESLint rules, change nothing here.
//
//   // eslint-disable-next-line ts-patterns/no-magic-numbers
//   const x = 42; // eslint-disable-line ts-patterns/no-magic-numbers
//   /* eslint-disable ts-patterns/no-switch-statement */ ... /* eslint-enable */
//
// With no rule list, a directive covers every rule. A ` -- reason` suffix is allowed.

const NAMESPACE = "ts-patterns/";
const FIRST_LINE_OFFSET = 1; // the line after a comment

// Matches "eslint-disable-next-line a, b -- why" → ("eslint-disable-next-line", "a, b -- why"); rejects "eslint-disabled" and "note: eslint-disable".
// https://regex101.com/?flavor=javascript&regex=%5E(eslint-disable-next-line%7Ceslint-disable-line%7Ceslint-disable%7Ceslint-enable)(%3F%3A%5Cs%2B(%5B%5Cs%5CS%5D*))%3F%24&testString=eslint-disable-next-line%20a%2C%20b%20--%20why%0Aeslint-disabled%0Anote%3A%20eslint-disable
const DIRECTIVE = /^(eslint-disable-next-line|eslint-disable-line|eslint-disable|eslint-enable)(?:\s+([\s\S]*))?$/;

// Matches " -- because" in "a, b -- because" → splits the rule list from the reason; rejects "a-b".
// https://regex101.com/?flavor=javascript&regex=%5Cs-%7B2%2C%7D%5Cs&testString=a%2C%20b%20--%20because%0Aa-b
const REASON_SEPARATOR = /\s-{2,}\s/;

interface Spot {
  readonly line: number;
  readonly column: number; // 0-based
}

interface BlockEvent {
  readonly enable: boolean;
  readonly at: Spot; // where the comment ends
  readonly rules: ReadonlySet<string> | undefined; // undefined: every rule
}

interface LineDirective {
  readonly line: number;
  readonly rules: ReadonlySet<string> | undefined;
}

export interface Suppressions {
  readonly isSuppressed: (ruleId: string, at: Spot) => boolean;
}

// The rule ids a directive names, or undefined when it names none (every rule).
// A list that names only other plugins' rules yields an empty set: it covers nothing here.
function ruleIdsIn(list: string | undefined): ReadonlySet<string> | undefined {
  const names = (list ?? "")
    .split(REASON_SEPARATOR)[0]
    ?.split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (names === undefined || names.length === 0) return undefined;
  return new Set(names.filter((name) => name.startsWith(NAMESPACE)).map((name) => name.slice(NAMESPACE.length)));
}

const covers = (rules: ReadonlySet<string> | undefined, ruleId: string): boolean => rules === undefined || rules.has(ruleId);

const isBefore = (a: Spot, b: Spot): boolean => a.line < b.line || (a.line === b.line && a.column <= b.column);

interface Parsed {
  readonly lines: readonly LineDirective[];
  readonly blocks: readonly BlockEvent[];
}

function parseComment(comment: Comment): Parsed {
  const match = DIRECTIVE.exec(comment.value.trim());
  const none: Parsed = { lines: [], blocks: [] };
  if (!match) return none;
  const [, kind, list] = match;
  const rules = ruleIdsIn(list);
  const isBlock = comment.type === "Block";
  const singleLine = comment.loc.start.line === comment.loc.end.line;
  if (kind === "eslint-disable-next-line") {
    return { lines: [{ line: comment.loc.end.line + FIRST_LINE_OFFSET, rules }], blocks: [] };
  }
  if (kind === "eslint-disable-line") {
    return singleLine ? { lines: [{ line: comment.loc.start.line, rules }], blocks: [] } : none;
  }
  // eslint-disable / eslint-enable are only valid in block comments.
  if (!isBlock) return none;
  const at = { line: comment.loc.end.line, column: comment.loc.end.column };
  return { lines: [], blocks: [{ enable: kind === "eslint-enable", at, rules }] };
}

// Tracks which rules are off at a position, replaying the block directives in
// order: `disable` turns rules off, `enable` turns them back on, and a bare
// `disable` can have specific rules re-enabled while the rest stay off.
function blockSuppressed(blocks: readonly BlockEvent[], ruleId: string, at: Spot): boolean {
  interface State {
    readonly all: boolean;
    readonly off: ReadonlySet<string>;
    readonly on: ReadonlySet<string>;
  }
  const initial: State = { all: false, off: new Set(), on: new Set() };
  const step = (state: State, event: BlockEvent): State => {
    if (event.rules === undefined) {
      return event.enable ? initial : { all: true, off: new Set(), on: new Set() };
    }
    const named = [...event.rules];
    return event.enable
      ? { all: state.all, off: new Set([...state.off].filter((r) => !event.rules?.has(r))), on: new Set([...state.on, ...named]) }
      : { all: state.all, off: new Set([...state.off, ...named]), on: new Set([...state.on].filter((r) => !event.rules?.has(r))) };
  };
  const state = blocks.filter((event) => isBefore(event.at, at)).reduce(step, initial);
  return (state.all && !state.on.has(ruleId)) || state.off.has(ruleId);
}

export function readSuppressions(comments: readonly Comment[]): Suppressions {
  const parsed = comments.map(parseComment);
  const lines = parsed.flatMap((p) => p.lines);
  const blocks = parsed.flatMap((p) => p.blocks);
  return {
    isSuppressed: (ruleId, at) =>
      lines.some((directive) => directive.line === at.line && covers(directive.rules, ruleId)) ||
      blockSuppressed(blocks, ruleId, at),
  };
}
