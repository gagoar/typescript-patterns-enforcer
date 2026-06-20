# typescript-patterns-enforcer

A Claude Code plugin that enforces TypeScript best practices and patterns — available as both a lightweight **inline skill** and a heavyweight **subagent** for delegated reviews.

**Webpage:** [gagoar.github.io/typescript-patterns-enforcer](https://gagoar.github.io/typescript-patterns-enforcer)

## What's included

| Component | When to use |
|-----------|-------------|
| **Skill** `/ts-patterns:check` | Automatically active while writing or editing `.ts`/`.tsx` files. Provides inline guidance on type safety, patterns, and anti-patterns. |
| **Agent** `ts-patterns:review` | Spawn via the Agent tool for full PR reviews, large refactors, or converting JavaScript to TypeScript. |

## Install

Via the [gago-plugins](https://gagoar.github.io/gago-plugins) marketplace:

```
/plugin marketplace add gagoar/gago-plugins
/plugin install ts-patterns@gago-plugins
/reload-plugins
```

Or standalone:

```
/plugin marketplace add gagoar/typescript-patterns-enforcer
/plugin install ts-patterns@ts-patterns
/reload-plugins
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
