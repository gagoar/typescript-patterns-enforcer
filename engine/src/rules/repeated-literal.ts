import { child, nameOf } from "../ast";
import type { AstNode, Visit } from "../ast";
import type { Rule } from "./types";

const MIN_LENGTH = 8;
const MIN_OCCURRENCES = 3;
const PREVIEW_LENGTH = 40;
const PLACEHOLDER = "${}";
// Values that name a language construct and are repeated by nature.
const ALLOWED: ReadonlySet<string> = new Set(["undefined", "function", "anonymous"]);
// A literal in these positions is a module path, a type, a property name or a test title, not a shared value.
const NON_VALUE_PARENTS: ReadonlySet<string> = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
  "ImportAttribute",
  "TSLiteralType",
  "TSImportType",
  "TSExternalModuleReference",
  "JSXAttribute",
  "TaggedTemplateExpression",
]);
const TEST_FUNCTIONS: ReadonlySet<string> = new Set(["it", "test", "describe"]);

function isTestTitle(parent: AstNode | undefined, node: AstNode): boolean {
  if (parent?.type !== "CallExpression") return false;
  const callee = child(parent, "callee");
  const base = callee?.type === "MemberExpression" ? child(callee, "object") : callee;
  const [title] = (parent["arguments"] as readonly AstNode[]) ?? [];
  const name = nameOf(base);
  return title === node && name !== undefined && TEST_FUNCTIONS.has(name);
}

function isPositionalNoise(parent: AstNode | undefined, node: AstNode): boolean {
  if (!parent) return false;
  const isKey = parent.type === "Property" && parent["computed"] === false && child(parent, "key") === node;
  const isDirective = parent.type === "ExpressionStatement" && typeof parent["directive"] === "string";
  return isKey || isDirective || NON_VALUE_PARENTS.has(parent.type) || isTestTitle(parent, node);
}

// A string, or a template with its placeholders replaced by `${}`, so `a/${x}/b` written
// twice with different variables still counts as one skeleton.
function textOf(node: AstNode): string | undefined {
  if (node.type === "Literal") return typeof node["value"] === "string" ? node["value"] : undefined;
  if (node.type !== "TemplateLiteral") return undefined;
  return (node["quasis"] as readonly AstNode[]).map((quasi) => String((quasi["value"] as { readonly cooked?: string }).cooked ?? "")).join(PLACEHOLDER);
}

function literalText({ node, ancestors }: Visit): string | undefined {
  const text = textOf(node);
  if (text === undefined || text.length < MIN_LENGTH || text === PLACEHOLDER || ALLOWED.has(text)) return undefined;
  return isPositionalNoise(ancestors.at(-1), node) ? undefined : text;
}

// The same literal or template in three or more places is a second edit site: export it once
// and compose from it. Reported once, at the first occurrence.
export function createRepeatedLiteral(): Rule {
  const seen = new Map<string, readonly AstNode[]>();
  return {
    id: "repeated-literal",
    enter: (visit) => {
      const text = literalText(visit);
      if (text !== undefined) seen.set(text, [...(seen.get(text) ?? []), visit.node]);
    },
    exit: ({ ancestors }, context) => {
      if (ancestors.length) return;
      seen.forEach((nodes, text) => {
        const [first] = nodes;
        if (!first || nodes.length < MIN_OCCURRENCES) return;
        const preview = text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
        context.report(first, `"${preview}" appears ${nodes.length} times: export one named const and compose from it (see SKILL.md Core Rule 9).`);
      });
    },
  };
}
