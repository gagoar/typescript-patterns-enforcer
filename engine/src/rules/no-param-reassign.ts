import type { Rule } from "eslint";
import { AST_NODE_TYPES } from "@typescript-eslint/types";

type Pattern = Rule.Node;

const FUNCTION_SELECTOR = "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression";

type BindingCollector = (pattern: Pattern, into: Set<string>) => void;

// Dispatch table keyed by pattern.type — do not convert this back to a
// switch. Each handler casts its generic `Pattern` parameter to read its
// own variant's fields: TS can't correlate a Record's looked-up value with
// the key that selected it, so the cast is required, not optional. Keys
// are AST_NODE_TYPES members so they can't drift from the real node names.
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
  // `constructor(private x: number)` wraps an ordinary parameter binding
  // one level down — without this entry the wrapped name is never
  // registered, and a reassignment inside the constructor goes untracked.
  [AST_NODE_TYPES.TSParameterProperty]: (pattern, into) => {
    collectBindingNames((pattern as unknown as { parameter: Pattern }).parameter, into);
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

// Walks a binding pattern (a function param, or a `let`/`const`/`var`
// declarator's id) and collects every identifier it introduces — default
// values, destructuring, rest, and parameter properties all bind through to
// a name. A pattern type with no registered collector (e.g. a bare TS type
// annotation) contributes nothing.
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

// One stack frame per enclosing function: `params` are the names this rule
// flags on reassignment; `locals` are same-scope `let`/`const`/`var`
// declarations that shadow an outer parameter without being one themselves.
// A name must resolve against the nearest frame that declares it at all —
// treating every enclosing frame's params as live everywhere below them
// would flag an inner function's own unrelated local for merely sharing an
// outer parameter's name.
interface Frame {
  readonly params: Set<string>;
  readonly locals: Set<string>;
}

// Searches innermost frame outward. A name found as a *param* is the
// parameter being tracked. A name found as a *local* first means some
// nearer scope has shadowed whatever binding exists further out — stop
// there rather than falsely attributing it to an outer parameter. Residual,
// documented imprecision: `let`/`const` are block-scoped, but a shadow
// recorded anywhere in a function is treated as shadowing for that whole
// function body, not just the block it's actually declared in — narrower
// than perfect scope resolution, but the safe direction (a missed detection
// in a rare nested-block case, not a false positive on ordinary code).
function isTrackedParam(stack: readonly Frame[], name: string): boolean {
  const nearestMatch = [...stack].reverse().find((frame) => frame.params.has(name) || frame.locals.has(name));
  return nearestMatch?.params.has(name) ?? false;
}

/**
 * Mechanizes "never mutate function parameters": both a direct reassignment
 * (`options = {...}`) and a property mutation (`options.retries ??= 3`, the
 * SKILL.md example) break the same invariant, so both are flagged.
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
    const frames: Frame[] = [];
    const isParam = (name: string): boolean => isTrackedParam(frames, name);

    return {
      [FUNCTION_SELECTOR](node: Rule.Node): void {
        const params = (node as unknown as { params: Pattern[] }).params;
        const paramNames = new Set<string>();
        params.forEach((param) => collectBindingNames(param, paramNames));
        frames.push({ params: paramNames, locals: new Set() });
      },
      [`${FUNCTION_SELECTOR}:exit`](): void {
        frames.pop();
      },
      VariableDeclarator(node): void {
        const frame = frames[frames.length - 1];
        if (!frame) return; // top-level declaration; nothing to shadow
        collectBindingNames(node.id as Pattern, frame.locals);
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
