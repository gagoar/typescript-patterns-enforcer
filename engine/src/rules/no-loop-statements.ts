import type { Rule } from "eslint";
import { AST_NODE_TYPES } from "@typescript-eslint/types";

// Derived from the library's own node-type enum (Core Rule 9/Derive Don't
// Restate), not retyped string literals.
const LOOP_TYPES = [
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
] as const;

/**
 * Mechanizes the "prefer pipelines over loops" half of SKILL.md's Data Over
 * Logic section: flags presence only. The conversion to .map/.filter/.reduce
 * is a judgment call this rule deliberately leaves to the LLM-enforced prose.
 */
export const noLoopStatements: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      noLoop: "raw loop — express as .map()/.filter()/.reduce() (see SKILL.md Data Over Logic).",
    },
  },
  create(context): Rule.RuleListener {
    const report = (node: Rule.Node): void => {
      context.report({ node, messageId: "noLoop" });
    };
    // The combined-selector key isn't a named property of RuleListener's
    // mapped type (only single node-type keys are), so it's typed through
    // the listener's generic string index signature instead.
    const listener: Rule.RuleListener = {
      [LOOP_TYPES.join(", ")]: report,
    };
    return listener;
  },
};
