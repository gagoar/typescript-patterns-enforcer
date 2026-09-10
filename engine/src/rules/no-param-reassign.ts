import type { Rule } from "eslint";

type Pattern = Rule.Node;

const FUNCTION_SELECTOR = "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression";

// Walks a binding pattern (a function param) and collects every identifier
// it introduces — default values, destructuring, and rest all bind through
// to a name that must not be reassigned or mutated.
function collectBindingNames(pattern: Pattern, into: Set<string>): void {
  switch (pattern.type) {
    case "Identifier":
      into.add(pattern.name);
      return;
    case "AssignmentPattern":
      collectBindingNames(pattern.left as Pattern, into);
      return;
    case "RestElement":
      collectBindingNames(pattern.argument as Pattern, into);
      return;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        const value = prop.type === "RestElement" ? prop.argument : prop.value;
        collectBindingNames(value as Pattern, into);
      }
      return;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (element !== null) collectBindingNames(element as Pattern, into);
      }
      return;
    default:
      return; // other patterns (e.g. TS type-annotated identifiers) fall through their own Identifier node
  }
}

// Resolves the root identifier of an assignment/update target — `options`
// for `options = x`, and also `options` for `options.retries = x` (mutating
// a parameter's property is the same invariant break as reassigning it).
function rootIdentifierName(target: Rule.Node): string | undefined {
  let node = target;
  while (node.type === "MemberExpression") node = node.object as Rule.Node;
  return node.type === "Identifier" ? node.name : undefined;
}

// A destructuring assignment target (`({ retries } = options)`) has no
// single root — walk each nested target instead.
function reportDestructuredTargets(
  pattern: Pattern,
  isParam: (name: string) => boolean,
  context: Rule.RuleContext,
): void {
  if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      const value = prop.type === "RestElement" ? prop.argument : prop.value;
      reportDestructuredTargets(value as Pattern, isParam, context);
    }
    return;
  }
  if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) {
      if (element !== null) reportDestructuredTargets(element as Pattern, isParam, context);
    }
    return;
  }
  const name = rootIdentifierName(pattern);
  if (name !== undefined && isParam(name)) {
    context.report({ node: pattern, messageId: "noParamReassign" });
  }
}

/**
 * Mechanizes "never mutate function parameters": both a direct reassignment
 * (`options = {...}`) and a property mutation (`options.retries ??= 3`, the
 * SKILL.md example) break the same invariant, so both are flagged.
 *
 * Known limitation, documented rather than hidden: tracking is lexical, not
 * scope-resolved — a local variable that happens to shadow a parameter name
 * is not distinguished from the parameter itself. Acceptable for a backstop
 * whose prose (SKILL.md) remains the authority for edge cases.
 */
export const noParamReassign: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      noParamReassign: "function parameter mutated — return a new value instead (see SKILL.md).",
    },
  },
  create(context): Rule.RuleListener {
    const paramStack: Set<string>[] = [];
    const isParam = (name: string): boolean => paramStack.some((set) => set.has(name));

    return {
      [FUNCTION_SELECTOR](node: Rule.Node): void {
        const params = (node as unknown as { params: Pattern[] }).params;
        const names = new Set<string>();
        for (const param of params) collectBindingNames(param, names);
        paramStack.push(names);
      },
      [`${FUNCTION_SELECTOR}:exit`](): void {
        paramStack.pop();
      },
      AssignmentExpression(node): void {
        const left = node.left as Pattern;
        if (left.type === "ObjectPattern" || left.type === "ArrayPattern") {
          reportDestructuredTargets(left, isParam, context);
          return;
        }
        const name = rootIdentifierName(left);
        if (name !== undefined && isParam(name)) {
          context.report({ node: left, messageId: "noParamReassign" });
        }
      },
      UpdateExpression(node): void {
        const name = rootIdentifierName(node.argument as Pattern);
        if (name !== undefined && isParam(name)) {
          context.report({ node, messageId: "noParamReassign" });
        }
      },
    };
  },
};
