# typescript-patterns-enforcer

A Claude Code plugin that enforces TypeScript best practices and patterns — available as both a lightweight **inline skill** and a heavyweight **subagent** for delegated reviews.

## What's included

| Component | When to use |
|-----------|-------------|
| **Skill** `typescript-patterns` | Automatically active while writing or editing `.ts`/`.tsx` files. Provides inline guidance on type safety, patterns, and anti-patterns. |
| **Agent** `typescript-patterns-enforcer` | Spawn via the Agent tool for full PR reviews, large refactors, or converting JavaScript to TypeScript. |

## Install

Via the [gago-plugins](https://github.com/gagoar/gago-plugins) marketplace:

```
/plugin marketplace add github:gagoar/gago-plugins
/plugin install typescript-patterns-enforcer@gago-plugins
```

Or standalone:

```
/plugin marketplace add github:gagoar/typescript-patterns-enforcer
/plugin install typescript-patterns-enforcer@typescript-patterns-enforcer
```

## Core principles enforced

- **No `any`** — use `unknown` and narrow, or precise types
- **Explicit return types** on all public APIs
- **`readonly` by default** — immutability unless required
- **`async/await` only** — no callbacks or `.then()` chains
- **Typed errors** — custom error classes or discriminated-union results
- **Composition over inheritance**

## License

MIT — see [LICENSE](./LICENSE).
