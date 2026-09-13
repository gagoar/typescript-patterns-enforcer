import type { Rule } from "eslint";
import { AST_NODE_TYPES } from "@typescript-eslint/types";

/**
 * Mechanizes the "nested ternaries" half of SKILL.md's Data Over Logic
 * section: flags presence only. The conversion to a Record/.find() lookup
 * is a judgment call this rule deliberately leaves to the LLM-enforced prose.
 */
export const noNestedTernary: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      noNestedTernary:
        "nested ternary — flatten, or convert to a Record/.find() lookup (see SKILL.md Data Over Logic).",
    },
  },
  create(context): Rule.RuleListener {
    return {
      ConditionalExpression(node): void {
        const { test, consequent, alternate } = node as unknown as {
          test: Rule.Node;
          consequent: Rule.Node;
          alternate: Rule.Node;
        };
        const isNested = [test, consequent, alternate].some(
          (child) => child.type === AST_NODE_TYPES.ConditionalExpression,
        );
        if (isNested) {
          context.report({ node, messageId: "noNestedTernary" });
        }
      },
    };
  },
};
