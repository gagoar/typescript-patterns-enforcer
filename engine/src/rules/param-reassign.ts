import { child, childList, nameOf } from "../ast";
import type { AstNode } from "../ast";
import type { Rule, RuleContext } from "./types";

// Mechanizes "never mutate function parameters": both a direct reassignment
// (`options = {...}`) and a property mutation (`options.retries ??= 3`, the
// SKILL.md example) break the same invariant, so both are flagged.

const MESSAGE = "function parameter mutated — return a new value instead (see SKILL.md).";

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
  "ClassPrivateMethod",
]);

type BindingCollector = (pattern: AstNode, into: Set<string>) => void;

// Dispatch table keyed by pattern.type — do not convert this back to a switch.
// Each entry reads the fields of its own pattern variant. `constructor(private
// x: number)` wraps an ordinary parameter one level down in a TSParameterProperty;
// without that entry the wrapped name is never registered and a reassignment in
// the constructor goes untracked.
const BINDING_COLLECTORS: Readonly<Record<string, BindingCollector>> = {
  Identifier: (pattern, into) => {
    const name = nameOf(pattern);
    if (name !== undefined) into.add(name);
  },
  AssignmentPattern: (pattern, into) => collectBindingNames(child(pattern, "left"), into),
  RestElement: (pattern, into) => collectBindingNames(child(pattern, "argument"), into),
  TSParameterProperty: (pattern, into) => collectBindingNames(child(pattern, "parameter"), into),
  ObjectPattern: (pattern, into) => childList(pattern, "properties").forEach((property) => collectBindingNames(valueOf(property), into)),
  ArrayPattern: (pattern, into) => childList(pattern, "elements").forEach((element) => collectBindingNames(element, into)),
};

// The pattern a property of an object pattern binds: `{ a: x }` binds x, `{ ...x }` binds x.
const valueOf = (property: AstNode): AstNode | undefined =>
  child(property, property.type === "RestElement" ? "argument" : "value");

// Walks a binding pattern (a function param, or a declarator's id) and collects
// every identifier it introduces: default values, destructuring, rest and
// parameter properties all bind through to a name.
function collectBindingNames(pattern: AstNode | undefined, into: Set<string>): void {
  if (pattern !== undefined) BINDING_COLLECTORS[pattern.type]?.(pattern, into);
}

// Resolves the root identifier of an assignment/update target: `options` for
// `options = x`, and for `options.retries = x` too (mutating a property of a
// parameter is the same invariant break). Anything else has no single root.
function rootIdentifierName(target: AstNode | undefined): string | undefined {
  if (target === undefined) return undefined;
  if (target.type === "MemberExpression") return rootIdentifierName(child(target, "object"));
  return target.type === "Identifier" ? nameOf(target) : undefined;
}

// A destructuring assignment target (`({ retries } = options)`) has no single
// root; check each nested target instead.
function reportDestructuredTargets(pattern: AstNode | undefined, isParam: (name: string) => boolean, context: RuleContext): void {
  if (pattern === undefined) return;
  if (pattern.type === "ObjectPattern") {
    childList(pattern, "properties").forEach((property) => reportDestructuredTargets(valueOf(property), isParam, context));
    return;
  }
  if (pattern.type === "ArrayPattern") {
    childList(pattern, "elements").forEach((element) => reportDestructuredTargets(element, isParam, context));
    return;
  }
  const name = rootIdentifierName(pattern);
  if (name !== undefined && isParam(name)) context.report(pattern, MESSAGE);
}

// One frame per enclosing function: `params` are the names this rule flags on
// reassignment; `locals` are let/const/var declarations that shadow an outer
// parameter without being one. A name resolves against the nearest frame that
// declares it at all, so an inner function's own unrelated local is not flagged
// for sharing an outer parameter's name. Residual imprecision, the safe
// direction: a block-scoped shadow counts for the whole function body.
interface Frame {
  readonly params: Set<string>;
  readonly locals: Set<string>;
}

function isTrackedParam(frames: readonly Frame[], name: string): boolean {
  const nearest = [...frames].reverse().find((frame) => frame.params.has(name) || frame.locals.has(name));
  return nearest?.params.has(name) ?? false;
}

export function createNoParamReassign(): Rule {
  const frames: Frame[] = [];
  const isParam = (name: string): boolean => isTrackedParam(frames, name);
  return {
    id: "no-param-reassign",
    enter: ({ node }, context) => {
      if (FUNCTION_TYPES.has(node.type)) {
        const params = new Set<string>();
        childList(node, "params").forEach((param) => collectBindingNames(param, params));
        frames.push({ params, locals: new Set() });
        return;
      }
      if (node.type === "VariableDeclarator") {
        const frame = frames.at(-1);
        if (frame) collectBindingNames(child(node, "id"), frame.locals); // no frame: top level, nothing to shadow
        return;
      }
      if (node.type === "AssignmentExpression") {
        const left = child(node, "left");
        if (left?.type === "ObjectPattern" || left?.type === "ArrayPattern") {
          reportDestructuredTargets(left, isParam, context);
          return;
        }
        const name = rootIdentifierName(left);
        if (left !== undefined && name !== undefined && isParam(name)) context.report(left, MESSAGE);
        return;
      }
      if (node.type === "UpdateExpression") {
        const name = rootIdentifierName(child(node, "argument"));
        if (name !== undefined && isParam(name)) context.report(node, MESSAGE);
      }
    },
    exit: ({ node }) => {
      if (FUNCTION_TYPES.has(node.type)) frames.pop();
    },
  };
}
