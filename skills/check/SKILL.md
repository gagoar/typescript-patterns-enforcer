---
name: check
description: >
  /ts-patterns:check — Enforce TypeScript best practices inline while writing or editing
  .ts/.tsx files: no any, explicit return types, readonly by default, async/await only.

  Trigger automatically when:
  - Writing new TypeScript files or modules
  - Reviewing or editing existing .ts / .tsx files
  - Converting JavaScript to TypeScript
  - Asked to refactor or improve TypeScript code quality
  - Implementing features in a TypeScript project

  Natural language triggers: "write this in TypeScript", "review my TypeScript", "refactor
  this TS file", "enforce patterns", "check type safety", "improve types".

  This skill applies inline. For full PR reviews or large multi-file refactors, the
  ts-patterns agent is available for deeper delegated work.
---

# TypeScript Pattern Enforcement

Apply these principles to every TypeScript file you write or edit.

## Core Rules

1. **No `any`** — use `unknown` and narrow, or define a precise type. Justify every `as` cast with a comment. (Bare `any` is also caught mechanically by the bundled hook; unguarded `as` casts remain your judgment call.)
2. **Explicit return types** — annotate public functions; let inference handle private/internal one-liners only.
3. **Prefer `interface` for extendable shapes; `type` for unions, intersections, and mapped/conditional types.**
4. **`readonly` by default** — mark properties and arrays immutable unless mutation is required.
5. **`async/await` only** — no raw `.then()` chains (also caught mechanically by the hook), no callbacks. Return `Promise<T>` explicitly.
6. **Typed errors** — custom classes extending `Error`, or discriminated-union result types. Never silently swallow.
7. **Generics with constraints** — `<TEntity extends BaseEntity>` not just `<T>`. Use descriptive names.
8. **Composition over inheritance** — classes only when necessary; prefer plain functions and utility types.
9. **No magic strings/numbers in comparisons or branching** — extract a repeated or semantically-meaningful literal (a URL scheme like `"https:"`, a sentinel path segment, a fixed error code) into a named `const`. For a small closed set of mutually-exclusive tags, prefer a string-literal union type (`type Kind = "a" | "b"`) or a `const` object/enum over scattered inline comparisons, so the compiler can narrow exhaustively. (Magic **numbers** are also flagged mechanically by the bundled hook; magic strings and the literal-union preference remain your judgment call.)
10. **Coerce over compare for truthy/falsy intent** — check truthiness directly (`if (!value)` / `if (items.length)` / `if (!errorCount)`) instead of comparing against the falsy sentinel (`.length === 0`, `.length > 0`, `=== ""`, `!== undefined`, `count === 0`, `count > 0`) when the intent is "does this exist," "is this empty," or "is this non-zero" — any number used only for its zero/non-zero-ness gets the same treatment as `.length`. Exception: when a falsy-but-meaningful value (`0`, `""`, `false`) must be distinguished from genuine absence, name the explicit check for what it tests (`value === undefined`) rather than coercing the distinction away.

## Core Rule Examples

Concrete Bad/Good pairs for the core rules and flagged anti-patterns that
don't already get a dedicated section below.

**No `any` / unguarded `as`**

```ts
// Bad
function parseConfig(raw: any): any {
  return raw as SomeConfig;
}

// Good
function parseConfig(raw: unknown): SomeConfig {
  if (!isSomeConfig(raw)) throw new Error("invalid config");
  return raw;
}
```

**No raw `.then()`/`.catch()` chains**

```ts
// Bad
function loadUser(id: string): Promise<User> {
  return fetchUser(id)
    .then((user) => enrichUser(user))
    .catch((err) => { console.error(err); throw err; });
}

// Good
async function loadUser(id: string): Promise<User> {
  try {
    const user = await fetchUser(id);
    return await enrichUser(user);
  } catch (err) {
    logger.error("loadUser failed", err);
    throw err;
  }
}
```

**No magic strings/numbers in comparisons or branching**

```ts
// Bad
if (url.startsWith("https:")) { /* ... */ }
const suffix = path.slice(-".test.ts".length);

// Good
const HTTPS_SCHEME = "https:";
if (url.startsWith(HTTPS_SCHEME)) { /* ... */ }
const TEST_SUFFIX = ".test.ts";
const suffix = path.slice(-TEST_SUFFIX.length);
```

**Coerce over compare for truthy/falsy intent**

```ts
// Bad — .length is only one case; any zero/non-zero check reads the same way
if (identity.acrName === "") { return failMissingAcrName(input); }
if (items.length > 0) { process(items); }
if (rules.length === 0) { return; }
if (pendingJobs.length > 0) { drainQueue(pendingJobs); }
if (errorCount === 0) { markHealthy(); }

// Good
if (!identity.acrName) { return failMissingAcrName(input); }
if (items.length) { process(items); }
if (!rules.length) { return; }
if (pendingJobs.length) { drainQueue(pendingJobs); }
if (!errorCount) { markHealthy(); }

// Exception — 0 is a meaningful value here, distinct from "not set";
// coercing would treat a real zero retry count as absent
if (retryCount === undefined) { retryCount = DEFAULT_RETRIES; }
```

**Never mutate function parameters** *(also enforced mechanically by the bundled hook)*

```ts
// Bad
function addDefaults(options: Options): Options {
  options.retries ??= 3;
  return options;
}

// Good
function addDefaults(options: Options): Options {
  return { retries: 3, ...options };
}
```

**Never swallow errors in `async` functions**

```ts
// Bad
async function saveDraft(draft: Draft): Promise<void> {
  try {
    await api.save(draft);
  } catch {
    // ignored
  }
}

// Good
async function saveDraft(draft: Draft): Promise<void> {
  try {
    await api.save(draft);
  } catch (err) {
    throw new DraftSaveError(draft.id, { cause: err });
  }
}
```

**Classes only when they hold private state**

```ts
// Bad — no private state; this is a namespace wearing a `this` nobody needs
class MathUtils {
  add(a: number, b: number): number { return a + b; }
}

// Good — a plain function; reach for a class only once there's state to encapsulate
function add(a: number, b: number): number { return a + b; }
```

**`@ts-ignore` needs a follow-up TODO** *(also enforced mechanically by the bundled hook)*

```ts
// Bad
// @ts-ignore
const legacy = require("./legacy-untyped-module");

// Good
// @ts-ignore — TODO(TICKET-123): remove once @types/legacy-module ships
const legacy = require("./legacy-untyped-module");
```

## Single Source of Truth for Fixed Sets

Represent a fixed, closed set of values in **one** declaration. Never author a
literal-union type and a separate set of `const`s that repeat the same strings.
Two hand-written copies drift silently: rename one member, and `tsc` stays quiet
because the stale `const`'s annotation still satisfies the now-wrong type.

Bad — the two strings are authored twice:

```ts
export type HandlerPosture = "opt-in" | "opt-out";
const OPT_IN: HandlerPosture = "opt-in";
const OPT_OUT: HandlerPosture = "opt-out";
```

Good — the type is derived from the values:

```ts
export const HandlerPosture = { OptIn: "opt-in", OptOut: "opt-out" } as const;
export type HandlerPosture = (typeof HandlerPosture)[keyof typeof HandlerPosture];
```

A `const` and a `type` may share a name (separate namespaces), so
`HandlerPosture` reads as both the value bag and its type.

Don't reach for this as "just use a TS `enum`." Match what the surrounding
module already does with its other fixed sets. If it uses plain literal unions
and has no `enum`, use the `as const` object above rather than introduce the
first `enum`. Consistency with the existing convention wins.

### Derive, Don't Restate

Once a canonical value exists — an enum, an `as const` object, a third-party
type — every other type describing "one of those" must be *derived* from it,
never retyped by hand. A hand-copied shape is a second edit site: rename a
field on the source and the copy silently goes stale.

**A consumer field is the key set itself** — write `keyof typeof`, don't
enumerate the keys again:

```ts
const RuleActions = { comment: "comment", review: "review", status: "status" } as const;
type RuleActions = (typeof RuleActions)[keyof typeof RuleActions];

// Bad — the action names are retyped
interface Rule { action: "comment" | "review" | "status"; }

// Good — the field's type *is* the canonical set's key type
interface Rule { action: keyof typeof RuleActions; }
```

**A shape that already exists on a library type is extracted, not
retyped** — reach for `NonNullable`, `Pick`, `Required`, `typeof`, and
`InstanceType` before writing a fresh `interface`:

```ts
// Bad — every field of the API's file object is retyped by hand and drifts
// the moment the API adds or renames a field
interface RepoFile { filename: string; blob_url: string; status: string; }

// Good — the shape is extracted from the SDK's own response type
type OctokitFile = NonNullable<
  RestEndpointMethodTypes["repos"]["compareCommits"]["response"]["data"]["files"]
>[number];
type RepoFile = Pick<OctokitFile, "filename" | "blob_url" | "status">;
```

**Consume the same declaration everywhere it's needed** — validation,
whitelists, and user-facing text should all read off the one canonical set
instead of repeating its members:

```ts
// Bad — the supported list is retyped in the error string
if (!SUPPORTED_EVENTS.includes(event)) {
  throw new Error(`event must be one of: pull_request, push, repository_dispatch`);
}

// Good — the message is derived from the same set that validates
if (!SUPPORTED_EVENTS.includes(event)) {
  throw new Error(`event must be one of: ${SUPPORTED_EVENTS.join(", ")}`);
}
```

**Type the source object with `as const satisfies`, not a colon
annotation** — `const x: T = {...}` widens each property to its declared
type and erases the literals the rules above depend on. `as const satisfies T`
validates the object against `T` while keeping every property at its
narrowest literal type:

```ts
type RouteConfig = Record<string, { method: "GET" | "POST"; auth: boolean }>;

// Bad — the annotation widens `method` to "GET" | "POST" at every call site
const routes: RouteConfig = {
  list: { method: "GET", auth: false },
};

// Good — `method` stays the literal "GET"; `keyof typeof routes` still works
const routes = {
  list: { method: "GET", auth: false },
} as const satisfies RouteConfig;
```

A `const`-modified generic type parameter (`function f<const T>(x: T)`, TS
5.0) is the same idea from the author side of a helper that accepts a config
object — it infers the argument as `const` without the caller writing
`as const` themselves. Reach for it when you're writing the function that
takes the config, not just consuming one.

**Derive a family of string types from data with template literal types**
instead of hand-listing each member:

```ts
const model = { firstName: "", lastName: "" } as const;

// Bad — every event name is retyped
type EventName = "firstNameChanged" | "lastNameChanged";

// Good — computed from the same field set
type EventName = `${keyof typeof model & string}Changed`;
```

**Freeze an exported constant table at runtime** — `readonly` and `as const`
are compile-time only and are erased from the emitted JS; a module that ships
a canonical data table for others to import should also protect it against
runtime mutation:

```ts
export const HTTP_STATUS = Object.freeze({ ok: 200, notFound: 404 } as const);
```

## Data Over Logic

The bundled hook mechanically flags the *presence* of a `switch` or a raw
loop; the *conversion* below — to a `Record` dispatch table, or to a
pipeline — is the judgment call this section exists to teach, and stays
yours.

A `switch` — and an `if`/`else if` chain, and a `while` that dispatches — is
control-flow *logic*: a hand-rolled matcher whose cases grow by editing the
chain. Replace it with a *data structure* keyed by the value being matched: a
lookup scales by adding an entry, not by editing every site that already
branches on that set. **Do not keep a `switch`** — convert it. There is no
exhaustiveness or "distinct branches" exception: a total `Record` over a closed
key set is itself exhaustive (a missing key is a compile error), so
exhaustiveness is never a reason to reach back for the `switch`.

**Dispatch table** — replace an `if`/`else if` (or `switch`) chain keyed on a
closed set with a `Record` from the set to a handler:

```ts
// Bad
function performAction(role: Role): void {
  if (role === "admin") { grantAdminAccess(); }
  else if (role === "user") { grantUserAccess(); }
  else { grantGuestAccess(); }
}

// Good
const actionByRole: Readonly<Record<Role, () => void>> = {
  admin: grantAdminAccess,
  user: grantUserAccess,
  guest: grantGuestAccess,
};
function performAction(role: Role): void {
  actionByRole[role]();
}
```

**Config array + `.reduce()`** — replace a sequence of independent `if`
blocks that each fold into the same accumulator with an array of
`[test, transform]` tuples reduced over:

```ts
type Rule<T> = readonly [test: (input: T) => boolean, transform: (input: T) => T];
const rules: readonly Rule<Payload>[] = [
  [(p) => p.role === "user", addUserFields],
  [(p) => isAllowlisted(p), addAllowlistFields],
];
const payload = rules.reduce((acc, [test, transform]) => (test(acc) ? transform(acc) : acc), initial);
```

**Config array + `.find()`** — same shape, but for "stop at the first match"
instead of "apply every match":

```ts
const matched = rules.find(([test]) => test(input));
matched?.[1](input);
```

**Comparison chains** — replace repeated `===`/`&&`/`||` against the same
variable with a named array and `.includes()`:

```ts
// Bad
if (role === "user" || role === "admin") { /* ... */ }

// Good
const ROLES_ALLOWED_FOR_X: readonly Role[] = ["user", "admin"];
if (ROLES_ALLOWED_FOR_X.includes(role)) { /* ... */ }
```

**A `switch` on a discriminated union's tag** is the same dispatch table in
disguise, even when each arm reads that variant's own fields. Key the `Record`
by the tag and let each handler receive the union member, so an arm reads the
fields it needs off its own parameter:

```ts
// Bad — a switch on the union tag
function applyDecision(decision: Decision, deps: Deps): boolean {
  switch (decision.outcome) {
    case "push":
      return true;
    case "skip":
      deps.notice(decision.notice);
      return false;
    case "fail":
      for (const line of decision.errors) { deps.error(line); }
      deps.setFailed(decision.errors[0]);
      return false;
  }
}

// Good — a total Record keyed by the tag; a new variant that misses a key is a
// compile error, the same coverage the switch's return type gave. Each handler
// takes its own narrowed variant, so it reads that variant's fields directly.
const decisionHandlers: Readonly<{
  [K in Decision["outcome"]]: (d: Extract<Decision, { outcome: K }>, deps: Deps) => boolean;
}> = {
  push: () => true,
  skip: (d, deps) => {
    deps.notice(d.notice);
    return false;
  },
  fail: (d, deps) => {
    d.errors.forEach((line) => deps.error(line));
    deps.setFailed(d.errors[0]);
    return false;
  },
};

const applyDecision = (decision: Decision, deps: Deps): boolean => {
  // The one justified cast (rule 1): TypeScript can't correlate the looked-up
  // handler's parameter with `decision`'s own variant across an index access,
  // so the call is typed as `never` without it. The Record above is what makes
  // this safe — every key maps to a handler for exactly that variant.
  const handle = decisionHandlers[decision.outcome] as (d: Decision, deps: Deps) => boolean;
  return handle(decision, deps);
};
```

No pattern-matching library is needed here — a plain `Record` plus one
documented cast suffices; a project may add `.exhaustive()` matching on its
own, but this skill's rule is only "no `switch`."

**Prefer pipelines over loops** — express a transform over a collection as
`.map()`/`.filter()`/`.reduce()`/`Promise.all()`, not a `for`/`while` loop that
accumulates by mutation. A pipeline reads as "what the data becomes"; a loop
reads as "what steps run":

```ts
// Bad
const ids: string[] = [];
for (const rule of rules) {
  if (rule.matched) ids.push(rule.id);
}

// Good
const ids = rules.filter((rule) => rule.matched).map((rule) => rule.id);
```

### Configuring: relaxed exhaustiveness via `switch`

The no-`switch` rule above is this skill's **default**. A project that wants
the TypeScript handbook's own exhaustiveness idiom instead — a `switch` on a
discriminated union's tag, whose arms are each too distinct to collapse into a
per-variant handler function, closed off by a `default` that calls
`assertNever` — may opt in explicitly. Look for a line such as
`ts-patterns: allow exhaustive switch` in the project's `CLAUDE.md`. Only when
that line is present does a `switch` pass review; without it, the default
above still applies and every `switch` is converted to a dispatch table.

```ts
function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}

// Permitted only under the opt-in above
function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle": return Math.PI * shape.r ** 2;
    case "square": return shape.side ** 2;
    default: return assertNever(shape); // a new variant is a compile error here
  }
}
```

`assertNever` itself is not gated by the opt-in — reach for it any time a
narrowing chain (an `if`/`else if` over `typeof`/`instanceof`, not a dispatch
table) needs a final exhaustiveness check on its `else` branch.

## Validate at the Boundary

External input — `JSON.parse`, `process.env`, an HTTP response body, a CLI
argument — enters the program as `unknown`. Narrow it exactly once, at the
point it crosses into the codebase, through a user-defined type guard or a
schema. Never cast it (`as SomeType`) and let the assumed shape flow inward
uninspected — a cast makes a claim the compiler doesn't check, right where the
data is least trustworthy.

**A user-defined type guard** narrows `unknown` into a precise type the
compiler can verify at every call site:

```ts
const isString = (x: unknown): x is string => typeof x === "string";

const isRule = (x: unknown): x is Rule =>
  typeof x === "object" && x !== null &&
  "action" in x && isString((x as Record<string, unknown>).action);
```

**A schema library** (zod, envalid, or similar) makes the same boundary
declarative and derives its type from the schema itself — one declaration
gives both the runtime check and the static type:

```ts
const RuleSchema = z.object({ action: z.enum(["comment", "review", "status"]) });
type Rule = z.infer<typeof RuleSchema>; // the type IS the schema, never retyped
const rule = RuleSchema.parse(JSON.parse(raw)); // throws on bad input, typed on success
```

Bad — the parsed JSON is asserted into shape instead of checked:

```ts
interface Package { maintainers: any[]; }
const pkg = JSON.parse(raw) as Package; // unverified; `any[]` defeats the point
```

This is "parse, don't validate": a boundary function should hand back a typed
value that's provably correct, not a boolean the caller might ignore.

## Make Illegal States Unrepresentable

Model state so an invalid combination cannot be constructed, rather than
guarding against it after the fact. Two concrete signals:

**Boolean-soup state** — several optional/boolean fields whose combinations
imply a state, some of which are nonsensical — becomes a discriminated union
where only the valid combinations type-check:

```ts
// Bad — `loading: true, data: {...}, error: "x"` all type-checks
interface FetchState<T> { loading: boolean; data?: T; error?: string; }

// Good — each variant carries only the fields that make sense for it
type FetchState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: T };
```

**Primitive obsession on identity or units** — a bare `string`/`number` used
for an ID, a money amount, or another value where mixing up two same-typed but
distinct things is a real bug — gets a narrowly-scoped branded type. Reserve
this for genuine identity/unit confusion; don't brand every primitive, or the
rule generates noise instead of catching bugs:

```ts
type UserId = string & { readonly __brand: "UserId" };
type OrderId = string & { readonly __brand: "OrderId" };

const asUserId = (raw: string): UserId => raw as UserId; // the one gate that mints one

function loadUser(id: UserId): User { /* ... */ }
loadUser(orderId); // compile error — an OrderId can't pass as a UserId
```

## Comment Discipline

A comment must do one of two things: name the **feature** a piece of code
enables (why it exists), or state an **invariant a future edit could
silently break** — a hidden constraint, a subtle ordering requirement, the
reason a guard exists, the regression a test specifically catches. Never
restate what the adjacent code already says in plain English. (The bundled
hook advisorily flags a specific list of narrative-sounding phrases; it's a
lexical proxy, not a substitute for actually applying this judgment.)

- Bad: `// loop over the array and push each item` above a `.forEach(...)`.
- Bad: `// assert the result is 2` above `expect(x).toBe(2)`.
- Good: `// must never call X directly — Y already owns that, calling it here
  double-fires` above a guard clause.
- Good: `// this count would be 3 if a future edit added a direct call — the
  guard below is what catches that` above an assertion.

Don't re-narrate the whole PR/feature design inline — that belongs in the PR
description or a top-of-file one-liner, not repeated above every function or
test case. If removing a comment wouldn't cost a future reader anything, cut
it.

## File Layout

```
// 1. Types and interfaces (exported first)
// 2. Constants
// 3. Implementation (private helpers, then public exports)
// 4. Barrel re-exports in index.ts
```

**Colocate a type with the module that mainly consumes it** — a `Rule` type
lives in `rules.ts` beside the code that builds and reads `Rule` values, not
in a project-wide `types.ts`. A standalone `types.ts` accumulates unrelated
shapes with no owner and nothing forcing it to stay in sync with the code
that actually uses each one. Barrel re-exports in `index.ts` are still the
right way to expose a type publicly — the rule is about where a type is
*defined*, not where it's re-exported from.

```ts
// Bad — types.ts, disconnected from anything that uses it
export interface Rule { action: string; matched: boolean; }

// Good — rules.ts, beside the code that builds and reads Rule values
export interface Rule { action: string; matched: boolean; }
export function sanitize(raw: unknown): Rule { /* ... */ }
// index.ts re-exports it for external consumers:
export type { Rule } from "./rules";
```

## Compiler Baseline

The patterns above assume a strict compiler; enable at minimum:

```json
{
  "strict": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true
}
```

Without these, a dispatch table's total `Record` and a discriminated union's
narrowing can silently stop being exhaustive.

## Testing

**Table-driven tests** — when several test cases share one assertion body and
differ only in inputs/expected output, express them as a data table driving
`test.each`/`it.each` (or Vitest's `test.for`), not copy-pasted `it(...)`
blocks. Adding a case becomes adding a row, not writing a new test:

```ts
test.each([
  { a: 1, b: 2, sum: 3 },
  { a: 0, b: 0, sum: 0 },
  { a: -1, b: 1, sum: 0 },
])("add($a, $b) = $sum", ({ a, b, sum }) => {
  expect(add(a, b)).toBe(sum);
});
```

## Utility Types to Reach For

`Partial<T>` · `Required<T>` · `Readonly<T>` · `Pick<T, K>` · `Omit<T, K>` · `ReturnType<F>` · `Parameters<F>` · `Record<K, V>` · discriminated unions with `never` for exhaustive checks.

## Anti-Patterns to Flag

- `any` / unguarded `as` casts
- Mutating function parameters
- Deeply nested `.then().catch()` chains
- Magic strings/numbers, especially in comparisons or branching — extract to a named `const`, or a literal-union type when there's a closed set of them
- An explicit comparison against the falsy sentinel (`.length === 0`, `.length > 0`, `=== ""`, `!== undefined`, `count === 0`, `count > 0`) for truthy/falsy intent instead of coercing to boolean directly — `.length` is only one case of this, any zero/non-zero check on a number reads the same way — unless a falsy-but-meaningful value (`0`, `""`, `false`) must be told apart from genuine absence
- A fixed value set declared twice — a literal-union type plus separate `const`s holding the same strings (derive one from the other via `as const`)
- **Any `switch`**, and any `if`/`else if` chain that dispatches on a closed set of values — convert to a data structure (a `Record` dispatch table, or a config array reduced/found over). This is the default; a `switch` only survives review when the project's `CLAUDE.md` carries the `ts-patterns: allow exhaustive switch` opt-in, and even then only for a discriminated-union tag closed off by `assertNever`
- Missing error handling in `async` functions
- Classes with no private state (use plain functions instead)
- `@ts-ignore` without a follow-up TODO
- A shape re-declared by hand instead of derived (`keyof typeof`, or `Pick`/`NonNullable`/`typeof` off an existing type)
- Unverified external input — `JSON.parse(...) as T`, an `any[]` on parsed data, or a cast standing in for a type guard/schema at a boundary
- A config/lookup/dispatch object typed with a colon annotation (`const x: T = {...}`) instead of `as const satisfies T`
- Boolean-soup state (several optional/boolean fields implying a state) instead of a discriminated union
- A project-wide `types.ts` instead of colocating a type with its consumer
- A `for`/`while` loop accumulating into an array/object where `.map()`/`.filter()`/`.reduce()` fits
- Copy-pasted `it(...)`/`test(...)` blocks that differ only by input/expected value instead of `test.each`
- Missing strict compiler flags (`strict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`)

## Review Checklist

Before finalising: re-scan the diff against every item in Anti-Patterns to
Flag above, plus three checks that list doesn't cover — explicit types on
every public API, JSDoc on complex types, and a clean `tsc --noEmit`.
