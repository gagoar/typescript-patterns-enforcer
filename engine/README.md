# Mechanical engine

A self-contained checker for ten of the plugin's rules, invoked by
`hooks/hooks.json` after every `.ts`/`.tsx` edit. It never reads or writes
whatever ESLint/tsconfig setup exists in the repo Claude is editing: it parses
the file itself with acorn (plus its TypeScript plugin) and runs its own rules, in total isolation.

## What's checked, and why these 10

| Check | Where the behavior comes from | Mechanizes |
|---|---|---|
| `no-explicit-any` | matches typescript-eslint | Core Rule 1 |
| `ban-ts-comment` | matches typescript-eslint | `@ts-ignore` needs a TODO |
| `no-magic-numbers` | matches typescript-eslint (and the ESLint rule it extends) | Core Rule 9 (numbers half) |
| `prefer-await-to-then` | matches eslint-plugin-promise | Core Rule 5 |
| `no-switch-statement` | written here | Data Over Logic (presence only) |
| `no-param-reassign` | written here | parameter mutation |
| `no-loop-statements` | written here | Data Over Logic pipelines (presence only) |
| `no-narrative-comment` | written here, advisory | Comment Discipline |
| `no-nested-ternary` | written here | Data Over Logic (presence only) |
| `require-regex-example` | written here, advisory | Core Rule 11 (comment above every regex) |

The first four reimplement rules that used to run on ESLint, with the same
options, positions and message text; `test/parity` pins that (see Tests below).
See `src/registry.ts` for the full traceability map back to `SKILL.md`. The
mechanical layer detects *presence*; the *conversion* (switch→`Record`,
loop→pipeline, nested ternary→`Record`/`.find()`) is a judgment call that
stays in `SKILL.md`'s prose. A checker can ban a `switch`, but it can't
rewrite one well.

`no-narrative-comment` is a different kind of check from the other 8: it's
a lexical proxy for a semantic rule (does a comment state an invariant, or
narrate how the code came to be), not a precise AST match. It flags a
specific list of backward-looking phrases (`src/rules/comments.ts`)
and will both miss real violations that avoid those words and occasionally
flag a legitimate comment that happens to use one for another reason. It is
advisory, like the other heuristic-shaped checks (`no-magic-numbers`,
`no-loop-statements`).

`require-regex-example` is half of each: the presence of a comment block
directly above a regex literal / `RegExp(...)` call is an exact check, but
"gives an example" and "links a tester" are lexical proxies (a quoted string
and an `https://` in that block). It can't tell whether the quoted inputs
exercise the pattern or the link is pre-filled with them; that stays with
the prose, so it's advisory too.

## Layout

| File | Role |
|---|---|
| `src/check.ts` | the hook entry point: reads the payload, runs the checks, prints violations |
| `src/parse.ts` | acorn with the TypeScript plugin; the only place the parser is called |
| `src/ast.ts` | a small view of the AST: node types, child links, a tree walk |
| `src/registry.ts` | the list of checks, and the run: parse, walk, apply suppressions, sort |
| `src/directives.ts` | `eslint-disable` comments (see below) |
| `src/rules/*.ts` | the ten rules |

Syntax the parser cannot read (or a file that is not TypeScript) produces no
violations, the same as any file the hook cannot read. Mistakes the compiler
would report but the parser can step over, such as an `override` with no base
class or an export of an undeclared name, are ignored: this is a linter, not a
compiler. `src/parse.ts` also turns off one check the TypeScript plugin gets
wrong, a generic arrow like `<T extends X>(p: T) => p` in a `.tsx` file.

### Suppressing a check

`eslint-disable` comments work, matched against ids like `ts-patterns/no-magic-numbers`:

```ts
// eslint-disable-next-line ts-patterns/no-magic-numbers
const retries = 3; // eslint-disable-line ts-patterns/no-magic-numbers
/* eslint-disable ts-patterns/no-switch-statement */ ... /* eslint-enable */
```

A directive with no rule list covers every check. Comments naming other rules
(your own ESLint setup) change nothing here.

## Release: rebuild dist

`dist/` is the **only checked-in build artifact**: plugins install via git clone
with no guaranteed build step, so end users get zero install/build of their own.
It is three files with zero runtime dependencies, about 0.45 MiB together:

| File | Contents | Size |
|---|---|---|
| `check.js` | `src/`, the hook entry point; loads the other two with a relative `require` | ~26 KiB |
| `acorn.js` | the acorn parser | ~211 KiB |
| `acorn-typescript.js` | acorn's TypeScript plugin | ~211 KiB |

**The files are readable on purpose, and each stays under 256 KiB.** None is
minified, so the plugin directory's validator and any reviewer can read exactly
what runs on every edit. The validator reads a script only up to 256 KiB and
holds the plugin for review beyond that, which is why the parser and its plugin
are separate files: together they would not fit. The build fails if any file
reaches 256 KiB, and `scripts/check-plugin-safety.ts` fails any PR with a script
or document that size. The build also drops URLs from the parsers' comments
(the validator pairs a hostname with words like `key` anywhere in a file).
Everything under `node_modules/` is build-time-only and gitignored.

Rebuilding is a release-time task, not something to hand-edit:

```sh
cd engine
npm ci              # exact, pinned deps + lockfile
npm run typecheck   # tsc --noEmit, strict — the dogfood gate
npm run build       # esbuild -> dist/*.js (readable; fails at 256 KiB per file)
npm test            # fixtures and the parity suite, against the BUILT artifact
```

Then commit the resulting `dist/*.js`; CI rebuilds it on every PR and fails
if it differs. Before committing, sanity-check:

```sh
git status --short engine/dist   # shows as new/changed
echo '{}' | node engine/dist/check.js; echo $?   # confirm it still runs (exits 0 on no file_path)
```

## Tests

- `test/fixtures`: one bad and one good file per rule. The bad file must be
  flagged with its rule id (exit 2); the good file must pass (exit 0).
- `test/parity`: edge cases for every rule (numbers in every position, directive
  comments, promise chains in each scope, parameter shadowing, regex comments,
  modern syntax, CRLF and Unicode). Each file's output must match
  `test/parity/golden/<file>.txt` exactly. The goldens were recorded from the
  previous, ESLint-based engine, so they pin every quirk the reimplemented rules
  carry. The one deliberate difference is `disable.ts`: the old engine also
  reported "Definition for rule '@typescript-eslint/...' was not found" for
  `eslint-disable` comments naming another plugin's rules; this one ignores them.

## Updating the parser

`acorn` and `@sveltejs/acorn-typescript` are pinned exactly in `package.json`.
Bumping either can change what parses, so rerun `npm test` and review any diff in
the parity suite before shipping. After a bump, check that each file in `dist/`
is still under 256 KiB. Syntax the plugin does not support yet is skipped, never
reported as a violation.
