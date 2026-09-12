import type { Rule } from "eslint";
import { AST_NODE_TYPES } from "@typescript-eslint/types";

type Pattern = Rule.Node;

const FUNCTION_SELECTOR = "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression";

type BindingCollector = (pattern: Pattern, into: Set<string>) => void;

// Dispatch table keyed by the pattern's own discriminant, per SKILL.md's
// Data Over Logic: a switch on `pattern.type` is the same lookup in
// disguise. Each handler reads its own variant's fields directly; the
// generic `Pattern` parameter (not the narrowed member) is the same
// correlated-union limitation the skill's own worked example documents —
// one justified cast per handler, not a hand-rolled switch. Keys are
// AST_NODE_TYPES members (derived from the library, per Core Rule 9/Derive
// Don't Restate), not retyped string literals.
const BINDING_COLLECTORS: Readonly<Record<string, BindingCollector>> = {
  [AST_NODE_TYPES.Identifier]: (pattern, into) => {
    into.add((pattern as unknown as { name: string }).name);
  },
  [AST_NODE_TYPES.AssignmentPattern]: (pattern, into) => {
    collectBindingNames((pattern as unknown as { left: Pattern }).left, into);
  },
  [AST_NODE_TYPES.RestElement]: (pattern, into) => {
    collectBindingNames((pattern as unknown as { argument: Pattern }).argument, into);
  },
  [AST_NODE_TYPES.ObjectPattern]: (pattern, into) => {
    const properties = (pattern as unknown as { properties: readonly Rule.Node[] }).properties;
    properties.forEach((prop) => {
      const value = (prop as unknown as { type: string; argument?: Pattern; value?: Pattern });
      collectBindingNames((value.type === AST_NODE_TYPES.RestElement ? value.argument : value.value) as Pattern, into);
    });
  },
  [AST_NODE_TYPES.ArrayPattern]: (pattern, into) => {
    const elements = (pattern as unknown as { elements: readonly (Pattern | null)[] }).elements;
    elements.filter((element): element is Pattern => element !== null).forEach((element) => {
      collectBindingNames(element, into);
    });
  },
};

// Walks a binding pattern (a function param) and collects every identifier
// it introduces — default values, destructuring, and rest all bind through
// to a name that must not be reassigned or mutated. A pattern type with no
// registered collector (e.g. a bare TS type annotation) contributes nothing.
function collectBindingNames(pattern: Pattern, into: Set<string>): void {
  BINDING_COLLECTORS[pattern.type]?.(pattern, into);
}

// Resolves the root identifier of an assignment/update target — `options`
// for `options = x`, and also `options` for `options.retries = x` (mutating
// a parameter's property is the same invariant break as reassigning it).
// Recursive rather than a loop: there's no collection to iterate, just a
// chain of MemberExpressions to descend until the root binding. Returns
// undefined for anything else; identifiers are never the empty string, so
// callers coerce rather than compare against undefined explicitly.
function rootIdentifierName(target: Rule.Node): string | undefined {
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return rootIdentifierName((target as unknown as { object: Rule.Node }).object);
  }
  return target.type === AST_NODE_TYPES.Identifier
    ? (target as unknown as { name: string }).name
    : undefined;
}

// A destructuring assignment target (`({ retries } = options)`) has no
// single root — walk each nested target instead.
function reportDestructuredTargets(
  pattern: Pattern,
  isParam: (name: string) => boolean,
  context: Rule.RuleContext,
): void {
  if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
    const properties = (pattern as unknown as { properties: readonly Rule.Node[] }).properties;
    properties.forEach((prop) => {
      const value = (prop as unknown as { type: string; argument?: Pattern; value?: Pattern });
      reportDestructuredTargets((value.type === AST_NODE_TYPES.RestElement ? value.argument : value.value) as Pattern, isParam, context);
    });
    return;
  }
  if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
    const elements = (pattern as unknown as { elements: readonly (Pattern | null)[] }).elements;
    elements.filter((element): element is Pattern => element !== null).forEach((element) => {
      reportDestructuredTargets(element, isParam, context);
    });
    return;
  }
  const name = rootIdentifierName(pattern);
  if (name && isParam(name)) {
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
        params.forEach((param) => collectBindingNames(param, names));
        paramStack.push(names);
      },
      [`${FUNCTION_SELECTOR}:exit`](): void {
        paramStack.pop();
      },
      AssignmentExpression(node): void {
        const left = node.left as Pattern;
        if (left.type === AST_NODE_TYPES.ObjectPattern || left.type === AST_NODE_TYPES.ArrayPattern) {
          reportDestructuredTargets(left, isParam, context);
          return;
        }
        const name = rootIdentifierName(left);
        if (name && isParam(name)) {
          context.report({ node: left, messageId: "noParamReassign" });
        }
      },
      UpdateExpression(node): void {
        const name = rootIdentifierName(node.argument as Pattern);
        if (name && isParam(name)) {
          context.report({ node, messageId: "noParamReassign" });
        }
      },
    };
  },
};
