import { child, nameOf } from "../ast";
import type { Rule } from "./types";

// `.length` compared with the zero/non-zero sentinel: `> 0`, `>= 1`, `!== 0`, `=== 0`, `< 1`
// and the loose forms. Only `.length` is matched: on a bare number the comparison can be
// the point (`count === 0` next to a meaningful `0`), and without types a rule cannot tell.
// `.length === 1` and `.length >= 2` ask a real question and are left alone.
const ZERO_TESTS: ReadonlySet<string> = new Set(["> 0", "=== 0", "!== 0", "== 0", "!= 0", ">= 1", "< 1"]);

export const noZeroComparison: Rule = {
  id: "no-zero-comparison",
  enter: ({ node }, context) => {
    if (node.type !== "BinaryExpression") return;
    const left = child(node, "left");
    const right = child(node, "right");
    const isLength = left?.type === "MemberExpression" && !left["computed"] && nameOf(child(left, "property")) === "length";
    if (!isLength || right?.type !== "Literal" || typeof right["value"] !== "number") return;
    if (ZERO_TESTS.has(`${String(node["operator"])} ${right["value"]}`)) {
      context.report(node, "`.length` compared with zero: coerce it (`!!x.length`, `!x.length`) (see SKILL.md Core Rule 10).");
    }
  },
};
