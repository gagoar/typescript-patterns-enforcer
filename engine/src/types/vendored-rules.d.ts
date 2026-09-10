// eslint-plugin-promise has no `exports` map (old-style CJS, unrestricted
// deep imports) but also ships no per-rule .d.ts — without this ambient
// declaration the import would silently widen to `any`, the one rule this
// file exists to prevent violating on its own source.
declare module "eslint-plugin-promise/rules/prefer-await-to-then" {
  import type { Rule } from "eslint";
  const rule: Rule.RuleModule;
  export default rule;
}
