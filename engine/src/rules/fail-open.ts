import { child, nameOf } from "../ast";
import type { AstNode } from "../ast";
import type { Rule } from "./types";

const ARITHMETIC: ReadonlySet<string> = new Set(["+", "-", "*", "/", "%", "**"]);
const STRING = "String";

// A default that is also a valid value stands in for absence or failure: an unreadable
// file becomes "", a missing status becomes 0, and the reader then treats it as a real
// answer. Without types the rule sees only syntax, so it narrows to the shape the audit
// found: a call on the left (`files.get(path) ?? ""`, `statusOf(error) ?? 0`). A property
// default (`node.raw ?? ""`) is left alone, and so are the two uses where the default is
// the point: an operand of arithmetic or string concatenation (`(counts.get(k) ?? 0) + 1`)
// and a template placeholder (`${name ?? ""}`).
export const noFailOpenDefault: Rule = {
  id: "fail-open-default",
  enter: ({ node, ancestors }, context) => {
    if (node.type !== "LogicalExpression" || node["operator"] !== "??") return;
    const right = child(node, "right");
    const left = child(node, "left");
    const callee = left?.type === "ChainExpression" ? child(left, "expression") : left;
    if (callee?.type !== "CallExpression") return;
    if (right?.type !== "Literal" || (right["value"] !== "" && right["value"] !== 0)) return;
    const parent = ancestors.at(-1);
    const isOperand = parent?.type === "BinaryExpression" && ARITHMETIC.has(String(parent["operator"]));
    if (isOperand || parent?.type === "TemplateLiteral") return;
    context.report(node, `\`?? ${String(right["raw"])}\` turns absence or failure into a valid value: return a tagged result or throw (see SKILL.md Make Illegal States Unrepresentable).`);
  },
};

const isOptionalChain = (arg: AstNode | undefined): boolean => arg?.type === "ChainExpression";

// `String(a?.b)` prints the word "undefined" when the chain breaks.
export const noStringOfOptionalChain: Rule = {
  id: "string-of-optional-chain",
  enter: ({ node }, context) => {
    if (node.type !== "CallExpression" || nameOf(child(node, "callee")) !== STRING) return;
    const [first] = (node["arguments"] as readonly AstNode[]) ?? [];
    if (isOptionalChain(first)) {
      context.report(node, "`String()` of an optional chain prints \"undefined\" when it breaks: narrow first (see SKILL.md Core Rule 1).");
    }
  },
};
