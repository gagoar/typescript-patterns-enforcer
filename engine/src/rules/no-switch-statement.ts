import type { Rule } from "eslint";

/**
 * Mechanizes the "no switch" half of SKILL.md's Data Over Logic section:
 * flags presence only. The conversion to a Record dispatch table is a
 * judgment call this rule deliberately leaves to the LLM-enforced prose.
 */
export const noSwitchStatement: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      noSwitch: "switch statement — convert to a Record dispatch table (see SKILL.md Data Over Logic).",
    },
  },
  create(context): Rule.RuleListener {
    return {
      SwitchStatement(node): void {
        context.report({ node, messageId: "noSwitch" });
      },
    };
  },
};
