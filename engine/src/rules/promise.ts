import { child, nameOf } from "../ast";
import type { AstNode } from "../ast";
import type { Rule } from "./types";

// Same behavior as eslint-plugin-promise's `prefer-await-to-then`, non-strict:
// a `.then()`, `.catch()` or `.finally()` call is reported unless it sits
//   - at the top level, where `await` is not available,
//   - inside an `await` or `yield` expression,
//   - inside a constructor, or
//   - in a Cypress `cy` chain.

const PROMISE_METHODS: ReadonlySet<string> = new Set(["then", "catch", "finally"]);
const CALL_TYPES: ReadonlySet<string> = new Set(["CallExpression", "OptionalCallExpression"]);
const MEMBER_TYPES: ReadonlySet<string> = new Set(["MemberExpression", "OptionalMemberExpression"]);
const AWAIT_OR_YIELD: ReadonlySet<string> = new Set(["AwaitExpression", "YieldExpression"]);
const CYPRESS = "cy";

// Node types that open their own scope. "Top level" means no scope but the
// Program's: a promise chain directly in the file is skipped, while one inside
// an `if` block, a loop body or a function is not. A `for` loop only opens a
// scope when it declares with let/const.
const SCOPE_TYPES: ReadonlySet<string> = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
  "ClassPrivateMethod",
  "ClassDeclaration",
  "ClassExpression",
  "StaticBlock",
  "BlockStatement",
  "SwitchStatement",
  "CatchClause",
  "TSModuleBlock",
  "TSEnumDeclaration",
]);
const FOR_HEADERS: Readonly<Record<string, string>> = {
  ForStatement: "init",
  ForInStatement: "left",
  ForOfStatement: "left",
};

function declaresLexically(node: AstNode): boolean {
  const header = FOR_HEADERS[node.type];
  const declaration = header === undefined ? undefined : child(node, header);
  return declaration?.type === "VariableDeclaration" && declaration["kind"] !== "var";
}

const opensScope = (node: AstNode): boolean => SCOPE_TYPES.has(node.type) || declaresLexically(node);
const isConstructor = (node: AstNode): boolean => node.type === "ClassMethod" && node["kind"] === "constructor";

// `cy.get(...).then(...)`: a call chain that starts at the identifier `cy`.
function isCypressCall(call: AstNode): boolean {
  const callee = child(call, "callee");
  if (!CALL_TYPES.has(call.type) || callee === undefined || !MEMBER_TYPES.has(callee.type)) return false;
  const object = child(callee, "object");
  return nameOf(object) === CYPRESS || (object !== undefined && isCypressCall(object));
}

export const preferAwaitToThen: Rule = {
  id: "prefer-await-to-then",
  enter: ({ node, ancestors }, context) => {
    if (!CALL_TYPES.has(node.type)) return;
    const callee = child(node, "callee");
    if (callee === undefined || !MEMBER_TYPES.has(callee.type)) return;
    const property = child(callee, "property");
    const method = property?.type === "Identifier" ? nameOf(property) : undefined;
    if (property === undefined || method === undefined || !PROMISE_METHODS.has(method)) return;
    const around = [...ancestors, node]; // what encloses the member expression
    const skipped =
      !around.some(opensScope) ||
      around.some((above) => AWAIT_OR_YIELD.has(above.type)) ||
      around.some(isConstructor) ||
      isCypressCall(node);
    if (!skipped) context.report(property, "Prefer await to then()/catch()/finally().");
  },
};
