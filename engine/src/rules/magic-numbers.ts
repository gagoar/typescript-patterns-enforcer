import { child, childList, nameOf } from "../ast";
import type { AstNode, Visit } from "../ast";
import type { Rule } from "./types";

// Same behavior as typescript-eslint's `no-magic-numbers` (which extends ESLint's)
// with the options this plugin used:
//   ignore: [0, 1, -1]        ignoreArrayIndexes: true
//   ignoreNumericLiteralTypes: true     detectObjects: true     enforceConst: false
// Every other option is at its default (off). So a number is reported unless it is
// 0/1/-1, an array index, a parseInt radix, a JSX prop, a numeric literal type in a
// type alias, or the initial value of a variable declaration.

type Num = number | bigint;

const IGNORED: ReadonlySet<Num> = new Set([0, 1, -1]);
const MAX_ARRAY_LENGTH = 4_294_967_295; // 2 ** 32 - 1: no array index reaches it
const RADIX_ARGUMENT = 1; // parseInt(text, radix)
const NUMERIC_TYPES: ReadonlySet<string> = new Set(["NumericLiteral", "BigIntLiteral"]);
const MEMBER_TYPES: ReadonlySet<string> = new Set(["MemberExpression", "OptionalMemberExpression"]);
const CALL_TYPES: ReadonlySet<string> = new Set(["CallExpression", "OptionalCallExpression"]);
const CLASS_FIELD_TYPES: ReadonlySet<string> = new Set(["ClassProperty", "ClassPrivateProperty"]);
const SIGNS: readonly string[] = ["-", "+"];

// How far above the number a node sits, counted from the number's full form
// (the sign included): `above.at(-PARENT)` is what the whole number belongs to.
const PARENT = 1;
const GRANDPARENT = 2;
const GREAT_GRANDPARENT = 3;

interface Number_ {
  readonly node: AstNode; // the literal itself
  readonly sign: string | undefined; // "-" or "+" when a unary sign applies to it
  readonly full: AstNode; // the sign when present, else the literal
  readonly above: readonly AstNode[]; // everything above `full`, root first
  readonly magnitude: Num; // the literal's own value
}

const negate = (value: Num): Num => -value;
const signed = (value: Num, sign: string | undefined): Num => (sign === "-" ? negate(value) : value);

function magnitudeOf(node: AstNode): Num | undefined {
  const value = node["value"];
  if (node.type === "NumericLiteral") return typeof value === "number" ? value : undefined;
  return typeof value === "string" ? BigInt(value) : undefined;
}

function rawOf(node: AstNode): string {
  const extra = node["extra"];
  const raw = typeof extra === "object" && extra !== null && "raw" in extra ? extra.raw : undefined;
  return typeof raw === "string" ? raw : String(node["value"]);
}

function signOf(parent: AstNode | undefined): string | undefined {
  const operator = parent?.type === "UnaryExpression" ? parent["operator"] : undefined;
  return typeof operator === "string" && SIGNS.includes(operator) ? operator : undefined;
}

function toNumber_(visit: Visit): Number_ | undefined {
  const { node, ancestors } = visit;
  const magnitude = NUMERIC_TYPES.has(node.type) ? magnitudeOf(node) : undefined;
  if (magnitude === undefined) return undefined;
  const sign = signOf(ancestors.at(-PARENT));
  const hasSign = sign !== undefined;
  return {
    node,
    sign,
    full: hasSign ? (ancestors.at(-PARENT) ?? node) : node,
    above: hasSign ? ancestors.slice(0, -PARENT) : ancestors,
    magnitude,
  };
}

// `type Id = 1 | 2` and `type N = -1`: a number that is a type, not a runtime value.
function isNumericLiteralType({ above }: Number_): boolean {
  if (above.at(-PARENT)?.type !== "TSLiteralType") return false;
  const grandparent = above.at(-GRANDPARENT);
  const inUnionAlias = grandparent?.type === "TSUnionType" && above.at(-GREAT_GRANDPARENT)?.type === "TSTypeAliasDeclaration";
  return grandparent?.type === "TSTypeAliasDeclaration" || inUnionAlias;
}

// `Foo[4]` and `Foo[1 | 2]`: a number inside an indexed-access type. Climbs out of
// any union or intersection first.
function isInsideIndexedAccessType({ above }: Number_): boolean {
  const climb = (levels: readonly AstNode[]): readonly AstNode[] => {
    const type = levels.at(-GRANDPARENT)?.type;
    return type === "TSUnionType" || type === "TSIntersectionType" ? climb(levels.slice(0, -PARENT)) : levels;
  };
  return climb(above).at(-GRANDPARENT)?.type === "TSIndexedAccessType";
}

function isReadonlyClassField({ above }: Number_): boolean {
  const parent = above.at(-PARENT);
  return parent !== undefined && CLASS_FIELD_TYPES.has(parent.type) && parent["readonly"] === true;
}

function isParseIntRadix({ above, full }: Number_): boolean {
  const call = above.at(-PARENT);
  if (call === undefined || !CALL_TYPES.has(call.type)) return false;
  if (childList(call, "arguments")[RADIX_ARGUMENT] !== full) return false;
  const callee = child(call, "callee");
  const isParseInt = callee?.type === "Identifier" && nameOf(callee) === "parseInt";
  const isNumberParseInt =
    callee !== undefined &&
    MEMBER_TYPES.has(callee.type) &&
    nameOf(child(callee, "object")) === "Number" &&
    nameOf(child(callee, "property")) === "parseInt";
  return isParseInt || isNumberParseInt;
}

const isJsxNumber = ({ above }: Number_): boolean => above.at(-PARENT)?.type.startsWith("JSX") ?? false;

// An integer index that fits in an array: a[0], a[2], a[0xAB]; not a[-1] or a[2.5].
function isArrayIndex({ above, full, magnitude, sign }: Number_): boolean {
  const access = above.at(-PARENT);
  if (access === undefined || !MEMBER_TYPES.has(access.type) || child(access, "property") !== full) return false;
  const value = signed(magnitude, sign);
  const isInteger = typeof value === "bigint" || Number.isInteger(value);
  return isInteger && value >= 0 && value < MAX_ARRAY_LENGTH;
}

const isExempt = (found: Number_): boolean => isParseIntRadix(found) || isJsxNumber(found) || isArrayIndex(found);

export const noMagicNumbers: Rule = {
  id: "no-magic-numbers",
  enter: (visit, context) => {
    const found = toNumber_(visit);
    if (!found) return;
    const { node, sign, full, above, magnitude } = found;
    const report = (at: AstNode, text: string): void => context.report(at, `No magic number: ${text}.`);

    // typescript-eslint's layer: it only knows `-` as part of a number.
    const minus = sign === "-";
    if (IGNORED.has(signed(magnitude, minus ? "-" : undefined))) return;
    const flaggedHere = (): void => report(minus ? full : node, `${minus ? "-" : ""}${rawOf(node)}`);
    if (above.at(-PARENT)?.type === "TSEnumMember") return flaggedHere();
    if (isNumericLiteralType(found)) return;
    if (isInsideIndexedAccessType(found) || isReadonlyClassField(found)) return flaggedHere();

    // ESLint's base rule: `+` is a sign too, and a variable's initial value is fine.
    if (IGNORED.has(signed(magnitude, sign)) || isExempt(found)) return;
    if (above.at(-PARENT)?.type !== "VariableDeclarator") report(full, `${sign ?? ""}${rawOf(node)}`);
  },
};
