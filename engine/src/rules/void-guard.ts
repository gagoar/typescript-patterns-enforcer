import { child, nameOf } from "../ast";
import type { AstNode } from "../ast";
import type { Rule } from "./types";

const GUARD = "guard";
const ASSERT_PREFIX = "assert";

const isGuardName = (name: string | undefined): boolean => name === GUARD || (name?.startsWith(ASSERT_PREFIX) ?? false);
const returnsVoid = (fn: AstNode | undefined): boolean => child(child(fn ?? ({} as AstNode), "returnType") ?? ({} as AstNode), "typeAnnotation")?.type === "TSVoidKeyword";

// A guard declared `: void` throws on failure but tells the compiler nothing, so the caller
// still holds a possibly-null value and reaches for `!`, `as` or `String()`.
// `: asserts condition` makes the narrowing stick.
export const noVoidGuard: Rule = {
  id: "void-guard",
  enter: ({ node }, context) => {
    const declared = node.type === "FunctionDeclaration" ? node : undefined;
    const init = node.type === "VariableDeclarator" ? child(node, "init") : undefined;
    const isFunctionInit = init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression";
    const name = declared ? nameOf(child(declared, "id")) : nameOf(child(node, "id"));
    const fn = declared ?? (isFunctionInit ? init : undefined);
    if (fn && isGuardName(name) && returnsVoid(fn)) {
      context.report(node, `\`${String(name)}\` returns void: declare \`asserts condition\` so the narrowing reaches the caller (see SKILL.md Core Rule 1).`);
    }
  },
};
