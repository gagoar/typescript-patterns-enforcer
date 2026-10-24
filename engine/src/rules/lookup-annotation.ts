import { child, childList, nameOf } from "../ast";
import type { AstNode } from "../ast";
import type { Rule } from "./types";

const RECORD = "Record";
const READONLY = "Readonly";

const typeNameOf = (type: AstNode | undefined): string | undefined =>
  type?.type === "TSTypeReference" ? nameOf(child(type, "typeName")) : undefined;

// `Record<K, V>` or `Readonly<Record<K, V>>` as the declared type.
function isRecordType(type: AstNode | undefined): boolean {
  if (typeNameOf(type) === RECORD) return true;
  if (!type || typeNameOf(type) !== READONLY) return false;
  const [inner] = childList(child(type, "typeArguments") ?? type, "params");
  return typeNameOf(inner) === RECORD;
}

// `const x: Record<K, V> = { ... }` widens every value to V and drops the literals that
// `keyof typeof x` and narrowing depend on. `{ ... } as const satisfies Record<K, V>` keeps
// both. An empty `{}` is an accumulator, not a lookup table, so it is left alone.
export const noColonAnnotatedLookup: Rule = {
  id: "colon-annotated-lookup",
  enter: ({ node }, context) => {
    if (node.type !== "VariableDeclarator") return;
    const id = child(node, "id");
    const init = child(node, "init");
    const declared = child(child(id ?? node, "typeAnnotation") ?? node, "typeAnnotation");
    if (init?.type !== "ObjectExpression" || !childList(init, "properties").length || !isRecordType(declared)) return;
    context.report(node, "lookup object typed with a colon annotation: write `{ ... } as const satisfies Record<K, V>` (see SKILL.md Data Over Logic).");
  },
};
