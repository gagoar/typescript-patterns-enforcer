# Audit: what the skill missed in a real agent-written TypeScript module

Status: working notes, meant to be picked up later and turned into skill changes. Section 7 records what three further audit rounds on the fixed code showed.
Source: a TypeScript GitHub Action of roughly a thousand lines written by an agent session with this skill installed, then audited by an independent `typescript-patterns-enforcer:review` run. `tsc --strict` and ESLint (`typescript-eslint` recommended + `no-explicit-any` + `explicit-function-return-type`) were green before the audit and after the first patch round. Examples below are generalised from that code.

## 1. Summary

The code passed every automated check and still broke more than a dozen distinct rules. Almost none of them are of the kind a linter or the current hook sees. Four causes, in order of weight:

1. **The skill was loaded, never applied.** The Review Checklist was not walked at the end, and the agent then reported the skill "ran". Nothing in the skill makes "applied" checkable.
2. **The mechanical hook never fired.** Its matcher is `Edit|Write|MultiEdit|NotebookEdit`. The agent wrote files with shell heredocs and a Python script, so the hook saw nothing.
3. **The hook covers the easy rules only.** Run by hand over the finished files, it reported two findings, both arguably false positives (numbers inside named constants). The real misses are judgment rules: derive-don't-restate, illegal states, `as const satisfies`, coercion, repeated constants.
4. **The repo's own conventions competed.** The repo's guidance said "pure core, injected I/O client". A hand-written client interface looked consistent with that, and the skill gave no sentence saying "the seam is fine, its data types must still derive from the library".

## 2. Findings with examples

Each entry: the rule, what was written, the fix, why tools missed it, and the skill change it suggests.

### F1. Re-declaring a library's shapes (Derive, Don't Restate)

Written:

```ts
export interface Pull {
  readonly number: number;
  readonly htmlUrl: string;
  readonly baseRef: string;
  readonly headSha: string;
  readonly commits: number;
  readonly userLogin: string;
  readonly labels: readonly string[];
  readonly mergeCommitSha: string | null;
}
// ...plus PullFile, Comment, NewPull, TreeFile, and a mapper that renamed every field from Octokit's response.
```

Fix: narrow the library type, do not copy it. A real response is assignable to the narrowed view, so the mapper disappears.

```ts
type Rest = ReturnType<typeof getOctokit>["rest"];
type RawPull = Awaited<ReturnType<Rest["pulls"]["get"]>>["data"];
export type Pull = Pick<RawPull, "number" | "html_url" | "commits" | "merge_commit_sha"> & {
  readonly base: Pick<RawPull["base"], "ref">;
  readonly head: Pick<RawPull["head"], "sha">;
  readonly user: Pick<NonNullable<RawPull["user"]>, "login"> | null;
  readonly labels: readonly Pick<RawPull["labels"][number], "name">[];
};
```

Why missed: tsc and ESLint cannot know two shapes describe the same thing. Skill change: add this exact Octokit example (the skill's current example is a `compareCommits` file). State that a **hand-written interface that is later filled by mapping a library response field by field is the tell**, and that an injected interface (the seam) stays but its data types derive.

### F2. Illegal states representable

Written:

```ts
interface BumpResult { outcome: "held" | "nothing" | "dry-run" | "opened" | "merged"; summary: string; prNumber: number | null }
// "opened" always has a number, the rest never do. A consumer printed String(r.prNumber).

interface Verdict { status: "current" | "bump" | "breaking"; violations: readonly string[]; moveShas: ReadonlySet<string>; /* ... */ }
// { status: "current", violations: ["x"] } type-checks, and status is derived from violations anyway.

interface BumpInput { manual: boolean; dryRun: boolean; mergeEnabled: boolean; only: string /* "" = all */ }
```

Fix:

```ts
type BumpResult =
  | { readonly outcome: "opened" | "merged"; readonly prNumber: number; readonly summary: string }
  | { readonly outcome: "held" | "nothing" | "dry-run"; readonly summary: string };

type Verdict = Base & (
  | { readonly status: "current" }
  | { readonly status: "bump"; readonly moveShas: ReadonlySet<string> }
  | { readonly status: "breaking"; readonly violations: readonly [string, ...string[]] }
);

interface BumpInput { readonly trigger: "push" | "manual"; readonly only: string | null; /* ... */ }
```

Why missed: no tool models "these fields imply each other". Skill change: the section exists, but its triggers are "boolean soup" and "branded IDs". Add three more smells the agent hit: **a nullable field that is non-null for some variants** (`x: T | null` next to a tag), **a stored value derivable from other stored values** (`status` from `violations`), and **an empty-string/zero sentinel meaning "all"/"none"**.

### F3. Zero/non-zero written as a comparison (Rule 10)

```ts
[violations.length > 0, Status.Breaking]          // -> [!!violations.length, ...]
unreadable.length > 0 || verdicts.some(...)       // -> !!unreadable.length || ...
guard(changes > 0 && !!file.patch, ...)           // -> !!changes && !!file.patch
guard(files.length >= 1 && files.length <= MAX)   // -> !!files.length && files.length <= MAX
if (next === undefined) return seen;              // -> if (!next)  (next is a non-empty path)
```

Correctly left explicit, and worth keeping as examples of the exception: `newText === null` where an empty file `""` is a meaningful value, and `commits === 1`.

Why missed: ESLint's `strict-boolean-expressions` pushes the opposite way, and no standard rule enforces coercion. Skill change: this one is mechanically checkable (see section 4). `> 0`, `>= 1`, `!== 0`, `=== 0` on `.length` or on a number used only for zero-ness.

### F4. One canonical value restated across files

```ts
// evaluate.ts builds `.github/actions/${action}` three times and the identical action.yml path twice,
// watched.ts builds the folder again, SCRIPTS_DIR is declared in both, ".mjs" restates SCRIPT_EXTENSION,
// guard.ts hard-codes "main" twice while bump.ts has BASE_BRANCH,
// the pin regex fragment pdds\/\.github\/...@([0-9a-f]{40}) appears in three files.
```

Fix: export `actionDir(action)`, `manifestPath(action)`, `SCRIPTS_DIR`, `BASE_BRANCH` and the regex source fragments from one module, and compose.

Also found in the same pass: a dead export (`updateStickyIfPresent`) that a caller had re-implemented by hand, and the `${marker}\n${body}` format written three times.

Why missed: the hook flags numbers, not strings, and not repetition across files. Skill change: extend rule 9 from "magic string in a comparison" to **"the same literal or template in two or more places"**. Mechanically: a string literal (or template skeleton) of length ≥ 8 occurring in 3+ places across the diff.

### F5. Lookup objects typed with a colon annotation (rule: `as const satisfies`)

```ts
const modes: Readonly<Record<Mode, () => Promise<void>>> = { check, bump };
const bumpHeadlines: Readonly<Record<Outcome, (r: BumpResult) => string>> = { /* ... */ };
const reasons: Readonly<Record<number, string>> = { [Failure.Forbidden]: "...", [Failure.Conflict]: "..." };
// reasons is keyed by `number`, so its keys are not derived from the Failure object it is indexed with.
```

Fix: `{ ... } as const satisfies Record<Outcome, (r: BumpResult) => string>`, and key the reasons table by `(typeof Failure)[keyof typeof Failure]`.

Why missed: both forms compile. Skill change: the rule is listed under Anti-Patterns but not under the Data Over Logic section that tells people to build these tables. **Put `as const satisfies` into the dispatch-table example itself**, so the pattern that is taught is the correct one. (The skill's own `actionByRole` example uses a colon annotation.)

### F6. Casts and `String()` used to launder a type

```ts
sliceOf(source, job as Node)                       // narrow with `if (!isMap(job)) return []` first
guard(match !== null, "...");                      // guard returns void, so it does not narrow...
return [String(match?.[1]), String(match?.[2])];   // ...hence String(undefined) === "undefined" if wrong
compareAt(String(oldText()), String(newText), c);  // String(null) === "null" would be compared as text
```

Fix: declare `guard(condition: boolean, message: string): asserts condition`, use named capture groups or a `capturesOf(match)` helper that throws, and make the last rule in a first-match list receive already-narrowed values.

Why missed: `String(x)` is not a cast, so `consistent-type-assertions` never sees it. Skill change: add `String(x)` / `${x}` on a value whose type includes `null | undefined` to the "unguarded cast" family, with the `asserts condition` guard as the fix.

### F7. External input reaching a process boundary unchecked

```ts
const target = getInput("target-sha");   // used as `${ref}:${path}`, `${ref}^` and in `git diff --quiet <from> <to>`
const only   = getInput("only-action");  // free text from a manual trigger
```

A value starting with `-` is read by git as an option. Fix: validate at the boundary (`/^[0-9a-f]{40}$/`, `/^[A-Za-z0-9_-]+$/`) and return a branded type.

Why missed: the skill's Validate at the Boundary section talks about `JSON.parse` and env vars as `unknown`, and about casts. Action inputs are typed `string`, so nothing looks unsafe. Skill change: add **"a `string` that is passed to a subprocess, a path, a URL or a query"** as a boundary even when it is already typed `string`.

### F8. Tests

- Three test cases with the same body (`build files; expect verdict.violations[0] to match X`) written as three `it` blocks instead of `it.each`.
- Test literals that duplicate exported constants (`"pdds-loop[bot]"`, a label name, `"Bot"`, `"3".repeat(40)`, a workflow path used eight times).
- Bare regex literals in assertions (`/base is dev/`) that the regex-comment rule technically covers. Fix: plain strings, so the rule does not apply.

Skill change: say that **test files are in scope for rules 9 and 11**, and that a regex used only as a substring match should be a string.

### F9. Smaller items

- A bare `Error` thrown in a module whose other failures are typed (`ContractParseError`, `GuardError`).
- A JSDoc placed above the wrong constant after a later insert.
- A swallowed HTTP 422 (`label already exists`) with no comment. This is the case Comment Discipline says a comment is owed: an invariant a future edit could break.
- `moveBranch(branch, sha, exists: boolean)`: a boolean flag argument that selects between two operations.
- A comparison chain `endsWith(".yml") || endsWith(".yaml")`.
- A regex that drives `.replace` whose comment says "keeps the prefix, swaps the rest" instead of quoting input → output.
- Two exported-but-file-local helpers, and a shared error class living in the module of one consumer.

### F10. Did get right, for contrast

No `any`, no `switch`, no loops, no `.then()`, no if/else dispatch chains (a first-match rule list instead), `as const` objects with derived types, `Pick`/`NonNullable` derivation after the fix, `unknown` narrowed at the YAML boundary, typed errors, parameters never mutated. The skill's mechanical and prose rules for these worked.

## 3. How the miss happened (timeline)

1. First draft written as plain `.mjs`, copying the nearest sibling in the repo. The repo's guidance already said "logic belongs in a TypeScript action"; the skill was not loaded.
2. User objected. Skill loaded, code ported to TypeScript. Files written through shell heredocs and a Python script, so the hook did not fire.
3. `tsc`, ESLint and jest green. The agent told the user the skill "ran on this code".
4. Two independent reviews (security, functional) found real bugs and the agent fixed them. A patterns-focused pass was never requested.
5. User spotted one violation by eye (hand-written library types). A follow-up independent audit then found the rest of the families listed above.

## 4. Proposed changes to the skill

Ordered by value for effort.

**P0. A completion gate.** Add to SKILL.md: before saying a TypeScript change is done, list each Anti-Patterns item and mark it checked or not applicable. A Stop hook can print the checklist when the transcript contains `.ts` edits and the checklist has not been shown. The goal is that "applied" becomes something a reviewer can read.

**P0. Cover shell-written files.** Two options. (a) A Stop hook that runs the checker over `git diff --name-only HEAD -- '*.ts' '*.tsx'` plus untracked `.ts` files. (b) A PreToolUse hook on Bash that detects redirections into `.ts` paths. (a) is simpler and also catches files edited by other tools.

**P1. New mechanical checks** (all feasible with the TypeScript compiler API the engine already uses):

| Check | Detects | Example from this audit |
|---|---|---|
| `no-zero-comparison` | `x.length > 0`, `>= 1`, `!== 0`, `=== 0` on a number | F3 |
| `repeated-literal` | same string literal / template skeleton, length ≥ 8, in 3+ places | F4 |
| `colon-annotated-lookup` | `const x: Record<K, V> = {...}` or `: readonly T[] = [...]` where the initialiser is an object/array literal of functions or tuples | F5 |
| `string-of-nullable` | `String(x)` / template literal on a value typed `T \| null \| undefined` | F6 |
| `void-guard` | a function named `guard`/`assert*` returning `void` whose caller reads a captured value afterwards | F6 |
| `nullable-beside-tag` | interface with a string-literal-union field and a `T \| null` field | F2 |
| `unexported-dead-export` | exported symbol with no importer in the diff's package | F4 |

Rule 9's current "magic number" check should skip a number that is already the initialiser of a named `const`, or a property of an `as const` object, or an operand of arithmetic assigned to a named `const` (`const MAX = 16 * 1024 * 1024`). Those were the only two things the hook reported, and both were arguably fine.

**P1. Prose changes in SKILL.md**

- Derive, Don't Restate: add the Octokit `Pick`/`NonNullable` example and the "mapper that renames every field" tell (F1). State that an injected interface is fine; its data types derive.
- Data Over Logic: make the dispatch-table examples use `as const satisfies` (F5).
- Make Illegal States Unrepresentable: add the three smells in F2.
- Validate at the Boundary: add subprocess/path/URL arguments typed `string` (F7).
- Rule 9: extend from comparisons to any repeated literal (F4); say tests are in scope (F8).
- Core rule on casts: add `String(x)` on a nullable and `asserts condition` guards (F6).

**P2. Agent-side guidance** (`agents/`): the review agent already reports well. Give it the F1-F9 list as its checklist order, and make it report "violations a linter would not catch" explicitly, as this audit did.

**P2. Skill-trigger text.** The description says it triggers when writing TypeScript. Add: "also load before the first line of a new module, and before porting a script to TypeScript". The first draft in the timeline was avoidable because the skill was not in play at all.

## 5. Acceptance fixtures for the checker

Suggested layout: `engine/test/fixtures/agent-written/`, one small `.ts` file per finding, each expected to produce at least one finding of the named rule. A few lines each:

```ts
// no-zero-comparison.ts
export const a = (items: readonly string[]): boolean => items.length > 0;

// repeated-literal.ts
export const p1 = (a: string): string => `.github/actions/${a}/action.yml`;
export const p2 = (a: string): string => `.github/actions/${a}/action.yml`;
export const p3 = (a: string): string => `.github/actions/${a}/action.yml`;

// colon-annotated-lookup.ts
type Mode = "a" | "b";
export const modes: Readonly<Record<Mode, () => void>> = { a: () => undefined, b: () => undefined };

// string-of-nullable.ts
export const s = (m: RegExpExecArray | null): string => String(m?.[1]);

// void-guard.ts
export function guard(condition: boolean, message: string): void { if (!condition) throw new Error(message); }
export const use = (m: RegExpExecArray | null): string => { guard(m !== null, "x"); return m![1] ?? ""; };
```

And negative fixtures that must stay clean: `const MAX = 16 * 1024 * 1024;`, `if (newText === null)` where `""` is meaningful (comment-marked), a `Record` typed lookup that already uses `as const satisfies`.

## 6. Open questions

- Should the completion gate be advisory (print the checklist) or blocking (exit 2 until the checklist is shown)? Blocking risks loops on trivial edits; scope it to diffs above N changed TypeScript lines.
- The skill is installed under two names in the wild (`ts-patterns` and `typescript-patterns-enforcer`). Confirm both resolve to the same hook, so a repo that enables one is covered.
- Is `repeated-literal` useful on its own, or does it need a project-level allowlist (`"main"`, `"utf8"`, status strings)?

## 7. Follow-up: three audit rounds on the same code

After the first audit, the agent fixed the findings, this time writing every file through the Write/Edit tools so the hook ran, and then asked for a second and a third independent audit of the result. What happened is as useful for the skill as the first audit.

### 7.1 The audits did not converge to zero

| Round | Run on | Findings | Mostly |
|---|---|---|---|
| 1 | the original code | about 28 items in 10 families | rules the skill states but nothing enforces |
| 2 | the code after round 1's fixes | 28 items | repeated constants, illegal states, typed errors, test hygiene |
| 3 | the code after round 2's fixes | 20 items | fail-open sentinels, mutable shapes, regex-comment flags, test literals |

Each round was a fresh reviewer with no knowledge of the previous report, and each round still found real violations, with a falling share of serious ones. A reviewer asked to "assume violations remain" will always find something, so "audited clean" cannot mean zero findings.

**Suggested stopping rule for the skill and the review agent:** a change is done when a review returns no finding in the correctness group (fail-open sentinels, illegal states, unvalidated boundary input, swallowed errors, unreadable-means-pass) and every remaining finding is style. Have the agent label each finding `correctness` or `style` so the rule is checkable.

### 7.2 Families that only appeared in rounds 2 and 3

These were absent from section 2 and are worth their own checks or prose, because they changed behaviour rather than style.

**F11. Fail-open sentinels** (Make Illegal States Unrepresentable, applied to *absence*).

```ts
const source = git.show(ref, path) ?? "";           // a file that cannot be read becomes "no pins"
return git(["show", `${ref}:${path}`]);             // ...and every exit status 128 was treated as "path absent"
if (oldText === null || newText === null) return MOVABLE;   // an unreadable manifest passed
const range = node.range; return range ? source.slice(...) : "";  // a missing range hid every output a caller reads
const key = text(pair.key); return key === null ? [] : [key];     // a non-string key silently dropped
```

Fix: absence and failure are different. Return a tagged result or throw, and make the reader fail closed (an unreadable thing is a break, not a pass). The `?? ""` form is the tell: a default that is also a valid value.

**F12. A fake status for a non-HTTP failure.**

```ts
new GitHubError(message, numericStatus(error) ?? 0, body)  // a DNS failure becomes "status 0"
```

A later `status < 500` check then reads it as a client error and does not retry. Fix: rethrow errors that carry no status; do not invent one.

**F13. `String(x)` printing the word "undefined".**

```ts
throw new Error(`not valid YAML: ${String(doc.errors[0]?.message)}`);
```

Fix: `const [first] = doc.errors; if (first) throw new Error(\`...${first.message}\`)`. Already listed under F6 as a cast family; the sharper tell is `String(a?.[0]?.b)`.

**F14. A collection that may be empty typed as always non-empty.**

```ts
readonly moveShas: ReadonlySet<string>   // an empty set was "a bump with nothing to move"
```

Fix: `readonly [string, ...string[]]`, built through one `nonEmpty()` helper that returns null for empty, so the empty case chooses a different variant.

**F15. Pick-derived shapes are mutable.** `Pick<LibraryType, "a" | "b">` keeps the library's writable fields even when the surrounding code wraps the rest in `readonly`. Fix: `Readonly<Pick<...>>`.

**F16. A returned value only tests read.** `rewrite()` returned `{ text, count }` where `count` always equalled a number the function had already checked. The caller read only `text`. Fix: return the text.

**F17. Boundary: a number that must be positive.** `pr-number` accepted `0` and `-5` because the check was "is an integer". Fix: name the range.

### 7.3 A contradiction inside the skill

Rule 11 says to link a regex tester pre-filled with the examples, one per line, and notes that an anchored pattern needs the `m` flag in the link so each line is tried. The code has no `m`. A reviewer then flags the mismatch between the link's flags and the code's flags in every such regex. The two instructions cannot both be satisfied silently.

Proposed resolution, either of which removes the noise:
- Say in the skill that the link's `g`/`m` flags exist only so the tester tries each example line, and require one extra comment line saying so; or
- Link one example per URL and use the code's own flags.

The same rule asks for a "quoted input". Placeholders such as `<40 hex>` do not count; the reviewer flagged them. The skill should say a literal input, shortened with a repeated character if long.

### 7.4 What the hook did when it ran

Once files were written through Write/Edit, the hook fired on every save. Over the rewrite it reported:

- magic numbers in **test files**, for example a count of pins, a line number in an assertion, an HTTP status in a fixture (about a dozen, every one fixed by naming the value, none changed behaviour);
- a missing tester link on three regexes (correct and useful);
- magic numbers inside an object literal that *is* the named constant table of HTTP statuses (a false positive; the agent moved to one `const` per status, which the hook accepts).

Two points for the skill. First, the hook is cheap and fast when it fires, so the P0 item in section 4 (make sure it fires for files written any way) matters more than any new check. Second, whether numbers in test files should be flagged deserves a decision: the agent complied, but a project may prefer to exempt `test/**`.

### 7.5 Fixture additions

Add to section 5, each expected to produce a finding:

```ts
// fail-open-default.ts
export const read = (m: Map<string, string>, k: string): string => m.get(k) ?? "";

// fake-status.ts
export const status = (e: { status?: number }): number => e.status ?? 0;

// string-of-optional-chain.ts
export const msg = (errors: readonly { message: string }[]): string => String(errors[0]?.message);

// possibly-empty-set-as-state.ts
export interface Bump { readonly moveShas: ReadonlySet<string>; }
```

Negative fixture that must stay clean: `const names = new Set(keys); const [first] = names; if (first) { ... }` (narrowing instead of defaulting).
