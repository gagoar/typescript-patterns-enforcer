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
- Magic strings/numbers (extract to `const` or `enum`)
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
