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

1. **No `any`** — use `unknown` and narrow, or define a precise type. Justify every `as` cast with a comment.
2. **Explicit return types** — annotate public functions; let inference handle private/internal one-liners only.
3. **Prefer `interface` for extendable shapes; `type` for unions, intersections, and mapped/conditional types.**
4. **`readonly` by default** — mark properties and arrays immutable unless mutation is required.
5. **`async/await` only** — no raw `.then()` chains, no callbacks. Return `Promise<T>` explicitly.
6. **Typed errors** — custom classes extending `Error`, or discriminated-union result types. Never silently swallow.
7. **Generics with constraints** — `<TEntity extends BaseEntity>` not just `<T>`. Use descriptive names.
8. **Composition over inheritance** — classes only when necessary; prefer plain functions and utility types.
9. **No magic strings/numbers in comparisons or branching** — extract a repeated or semantically-meaningful literal (a URL scheme like `"https:"`, a sentinel path segment, a fixed error code) into a named `const`. For a small closed set of mutually-exclusive tags, prefer a string-literal union type (`type Kind = "a" | "b"`) or a `const` object/enum over scattered inline comparisons, so the compiler can narrow exhaustively. Never hardcode a literal a second time when it could instead be derived from an existing named constant — e.g. slicing by the length of a duplicated literal instead of deriving it from that constant.

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

## Comment Discipline

A comment must do one of two things: name the **feature** a piece of code
enables (why it exists), or state an **invariant a future edit could
silently break** — a hidden constraint, a subtle ordering requirement, the
reason a guard exists, the regression a test specifically catches. Never
restate what the adjacent code already says in plain English.

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

## Utility Types to Reach For

`Partial<T>` · `Required<T>` · `Readonly<T>` · `Pick<T, K>` · `Omit<T, K>` · `ReturnType<F>` · `Parameters<F>` · `Record<K, V>` · discriminated unions with `never` for exhaustive checks.

## Anti-Patterns to Flag

- `any` / unguarded `as` casts
- Mutating function parameters
- Deeply nested `.then().catch()` chains
- Magic strings/numbers, especially in comparisons or branching — extract to a named `const`, or a literal-union type when there's a closed set of them
- A fixed value set declared twice — a literal-union type plus separate `const`s holding the same strings (derive one from the other via `as const`)
- Missing error handling in `async` functions
- Classes with no private state (use plain functions instead)
- `@ts-ignore` without a follow-up TODO

## Review Checklist

Before finalising:
- [ ] All public APIs have explicit types
- [ ] `any` is absent or justified
- [ ] Errors are typed and handled
- [ ] Immutability enforced where possible
- [ ] Complex types have JSDoc comments
- [ ] TypeScript compiles without errors (`tsc --noEmit`)
