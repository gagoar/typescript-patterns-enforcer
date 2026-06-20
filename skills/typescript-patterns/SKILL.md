---
name: typescript-patterns
description: >
  Use when writing, reviewing, or refactoring TypeScript code to enforce type-safety,
  project conventions, and established best practices.

  Trigger automatically when:
  - Writing new TypeScript files or modules
  - Reviewing or editing existing .ts / .tsx files
  - Converting JavaScript to TypeScript
  - Asked to refactor or improve TypeScript code quality
  - Implementing features in a TypeScript project

  Natural language triggers: "write this in TypeScript", "review my TypeScript", "refactor
  this TS file", "enforce patterns", "check type safety", "improve types".

  For deeper delegated work (full PR review, large refactors), spawn the
  typescript-patterns-enforcer subagent via the Agent tool instead.
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
