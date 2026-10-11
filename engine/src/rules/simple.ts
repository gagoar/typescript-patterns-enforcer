import { child } from "../ast";
import type { Rule } from "./types";

const CONDITIONAL = "ConditionalExpression";

const LOOP_TYPES: ReadonlySet<string> = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);

// Rules that flag the presence of a node type, and nothing else. The conversion
// (a Record dispatch table, a .map/.filter pipeline, a lookup) is a judgment
// call the SKILL.md prose leaves to the LLM; these only detect.

export const noExplicitAny: Rule = {
  id: "no-explicit-any",
  enter: ({ node }, context) => {
    if (node.type === "TSAnyKeyword") context.report(node, "Unexpected any. Specify a different type.");
  },
};

export const noSwitchStatement: Rule = {
  id: "no-switch-statement",
  enter: ({ node }, context) => {
    if (node.type === "SwitchStatement") {
      context.report(node, "switch statement — convert to a Record dispatch table (see SKILL.md Data Over Logic).");
    }
  },
};

export const noLoopStatements: Rule = {
  id: "no-loop-statements",
  enter: ({ node }, context) => {
    if (LOOP_TYPES.has(node.type)) {
      context.report(node, "raw loop — express as .map()/.filter()/.reduce() (see SKILL.md Data Over Logic).");
    }
  },
};

export const noNestedTernary: Rule = {
  id: "no-nested-ternary",
  enter: ({ node }, context) => {
    if (node.type !== CONDITIONAL) return;
    const nested = ["test", "consequent", "alternate"].some((key) => child(node, key)?.type === CONDITIONAL);
    if (nested) {
      context.report(node, "nested ternary — flatten, or convert to a Record/.find() lookup (see SKILL.md Data Over Logic).");
    }
  },
};
