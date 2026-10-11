import { Parser, tokTypes } from "acorn";
import type { Comment as AcornComment, Options } from "acorn";
import { tsPlugin } from "@sveltejs/acorn-typescript";
import { isNode } from "./ast";
import type { AstNode, Comment } from "./ast";

export interface Parsed {
  readonly program: AstNode;
  readonly comments: readonly Comment[];
}

// Matches "App.tsx" and "src/View.tsx"; rejects "a.ts" and "App.tsx.bak".
// https://regex101.com/?flavor=javascript&regex=%5C.tsx%24&testString=App.tsx%0Asrc%2FView.tsx%0Aa.ts%0AApp.tsx.bak
const TSX_FILE = /\.tsx$/;

// Matches "global.d.ts" and "types.d.mts"; rejects "a.ts" and "d.ts.bak".
// https://regex101.com/?flavor=javascript&regex=%5C.d%5C.%5Bcm%5D%3Fts%24&testString=global.d.ts%0Atypes.d.mts%0Aa.ts%0Ad.ts.bak
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

// The parser's own methods that the subclass below changes; acorn's types do not list them.
interface ParserInternals {
  parseExprList(close: unknown, allowTrailingComma: boolean, allowEmpty?: boolean, refDestructuringErrors?: unknown): unknown;
  tsParseNoneModifiers(node: unknown): void;
  tsParseClassTypeParameterModifiers(node: unknown): void;
}
type InternalParser = new (options: Options, input: string) => Parser & ParserInternals;

// A linter reads files the compiler may still reject, so the parser is made lenient
// where TypeScript is:
//  - Acorn reports a few mistakes it can step over (an export of an undeclared
//    name, a duplicate declaration) with `raiseRecoverable`, and by default stops
//    at them. Those are skipped and the tree is kept. A real syntax error still throws.
//  - The plugin rejects `<T extends X>(p) => p` in a .tsx file, which TypeScript accepts.
//  - The plugin accepts no modifiers on the type parameters of a function type or a method
//    signature, so `type F = <const T extends X>(a: T) => T` fails. TypeScript 5 allows `const` there.
//  - The plugin parses a decorator's arguments without allowing a trailing comma, which
//    Prettier adds to every multi-line decorator call (`@UseInterceptors(\n  a,\n)`).
function keepGoing(base: typeof Parser): typeof Parser {
  const Base = base as unknown as InternalParser;
  class Lenient extends Base {
    raiseRecoverable(): void {}
    reportReservedArrowTypeParam(): void {}
    override tsParseNoneModifiers(node: unknown): void {
      this.tsParseClassTypeParameterModifiers(node);
    }
    override parseExprList(close: unknown, allowTrailingComma: boolean, allowEmpty?: boolean, refDestructuringErrors?: unknown): unknown {
      return super.parseExprList(close, allowTrailingComma || close === tokTypes.parenR, allowEmpty, refDestructuringErrors);
    }
  }
  return Lenient as unknown as typeof Parser;
}

const isLineComment = (comment: AcornComment): boolean => comment.type === "Line";

// A linter reads files the compiler may still reject. The parser is told to
// allow the positions TypeScript allows (a top-level `await`, a `return` outside
// a function); a real syntax error throws, and the file is skipped.
function attempt(code: string, filename: string): Parsed | undefined {
  const comments: AcornComment[] = [];
  try {
    const parser = Parser.extend(tsPlugin({ jsx: TSX_FILE.test(filename), dts: DECLARATION_FILE.test(filename) }), keepGoing);
    const program: unknown = parser.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
      allowHashBang: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      onComment: comments,
    });
    const found = comments.map((comment) => ({ ...comment, type: isLineComment(comment) ? "Line" : "Block" }) as unknown as Comment);
    return isNode(program) ? { program, comments: found } : undefined;
  } catch {
    return undefined;
  }
}

// Returns undefined when the file is not valid TypeScript: the hook then stays
// quiet, as it does for any file it cannot read.
export function parseTypeScript(code: string, filename: string): Parsed | undefined {
  return attempt(code, filename);
}
