import { parse } from "@babel/parser";
import type { ParserPlugin } from "@babel/parser";
import { isNode } from "./ast";
import type { AstNode, Comment } from "./ast";

export interface Parsed {
  readonly program: AstNode;
  readonly comments: readonly Comment[];
}

const TSX_FILE = /\.tsx$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

// Syntax that newer TypeScript projects use and Babel gates behind plugins.
// `decorators` is the current proposal; projects on the older experimental
// decorators fall back to `decorators-legacy` below.
const MODERN_SYNTAX: readonly ParserPlugin[] = ["decoratorAutoAccessors", "explicitResourceManagement"];

function pluginsFor(filename: string, decorators: ParserPlugin): readonly ParserPlugin[] {
  const typescript: ParserPlugin = ["typescript", { dts: DECLARATION_FILE.test(filename) }];
  const jsx: readonly ParserPlugin[] = TSX_FILE.test(filename) ? ["jsx"] : [];
  return [typescript, decorators, ...MODERN_SYNTAX, ...jsx];
}

function attempt(code: string, filename: string, decorators: ParserPlugin): Parsed | undefined {
  try {
    const file = parse(code, {
      sourceType: "module",
      plugins: [...pluginsFor(filename, decorators)],
      // A linter reads files the compiler may still reject (an override with no
      // base class, an export of an undeclared name). Babel reports those as
      // recoverable errors; keep the tree and ignore them. A real syntax error
      // still throws, and the file is skipped.
      errorRecovery: true,
      attachComment: false,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      allowSuperOutsideMethod: true,
      allowUndeclaredExports: true,
      allowNewTargetOutsideFunction: true,
    });
    const program = file.program;
    return isNode(program) ? { program, comments: file.comments as unknown as readonly Comment[] } : undefined;
  } catch {
    return undefined;
  }
}

// Returns undefined when the file is not valid TypeScript: the hook then stays
// quiet, as it does for any file it cannot read.
export function parseTypeScript(code: string, filename: string): Parsed | undefined {
  return attempt(code, filename, "decorators") ?? attempt(code, filename, "decorators-legacy");
}
