// ts-patterns engine: the rules in engine/src.
// Generated from this repository's sources by its build; CI rebuilds it and fails if this file
// differs. Readable on purpose, not minified. The licenses are in the notices file at the repository root.
"use strict";

// src/check.ts
var import_node_fs = require("node:fs");

// src/ast.ts
var NON_CHILD_KEYS = /* @__PURE__ */ new Set(["loc"]);
function isNode(value) {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}
function nodesIn(value) {
  if (Array.isArray(value)) return value.filter(isNode);
  return isNode(value) ? [value] : [];
}
function children(node) {
  return Object.entries(node).filter(([key]) => !NON_CHILD_KEYS.has(key)).flatMap(([, value]) => nodesIn(value));
}
function child(node, key) {
  const value = node[key];
  return isNode(value) ? value : void 0;
}
function childList(node, key) {
  return nodesIn(node[key]);
}
function nameOf(node) {
  const name = node?.["name"];
  return typeof name === "string" ? name : void 0;
}
function walk(node, visitor, ancestors = []) {
  const visit = { node, ancestors };
  visitor.enter?.(visit);
  const next = [...ancestors, node];
  children(node).forEach((kid) => walk(kid, visitor, next));
  visitor.exit?.(visit);
}

// src/directives.ts
var NAMESPACE = "ts-patterns/";
var FIRST_LINE_OFFSET = 1;
var DIRECTIVE = /^(eslint-disable-next-line|eslint-disable-line|eslint-disable|eslint-enable)(?:\s+([\s\S]*))?$/;
var REASON_SEPARATOR = /\s-{2,}\s/;
function ruleIdsIn(list) {
  const names = (list ?? "").split(REASON_SEPARATOR)[0]?.split(",").map((name) => name.trim()).filter((name) => name !== "");
  if (names === void 0 || names.length === 0) return void 0;
  return new Set(names.filter((name) => name.startsWith(NAMESPACE)).map((name) => name.slice(NAMESPACE.length)));
}
var covers = (rules, ruleId) => rules === void 0 || rules.has(ruleId);
var isBefore = (a, b) => a.line < b.line || a.line === b.line && a.column <= b.column;
function parseComment(comment) {
  const match = DIRECTIVE.exec(comment.value.trim());
  const none = { lines: [], blocks: [] };
  if (!match) return none;
  const [, kind, list] = match;
  const rules = ruleIdsIn(list);
  const isBlock = comment.type === "Block";
  const singleLine = comment.loc.start.line === comment.loc.end.line;
  if (kind === "eslint-disable-next-line") {
    return { lines: [{ line: comment.loc.end.line + FIRST_LINE_OFFSET, rules }], blocks: [] };
  }
  if (kind === "eslint-disable-line") {
    return singleLine ? { lines: [{ line: comment.loc.start.line, rules }], blocks: [] } : none;
  }
  if (!isBlock) return none;
  const at = { line: comment.loc.end.line, column: comment.loc.end.column };
  return { lines: [], blocks: [{ enable: kind === "eslint-enable", at, rules }] };
}
function blockSuppressed(blocks, ruleId, at) {
  const initial = { all: false, off: /* @__PURE__ */ new Set(), on: /* @__PURE__ */ new Set() };
  const step = (state2, event) => {
    if (event.rules === void 0) {
      return event.enable ? initial : { all: true, off: /* @__PURE__ */ new Set(), on: /* @__PURE__ */ new Set() };
    }
    const named = [...event.rules];
    return event.enable ? { all: state2.all, off: new Set([...state2.off].filter((r) => !event.rules?.has(r))), on: /* @__PURE__ */ new Set([...state2.on, ...named]) } : { all: state2.all, off: /* @__PURE__ */ new Set([...state2.off, ...named]), on: new Set([...state2.on].filter((r) => !event.rules?.has(r))) };
  };
  const state = blocks.filter((event) => isBefore(event.at, at)).reduce(step, initial);
  return state.all && !state.on.has(ruleId) || state.off.has(ruleId);
}
function readSuppressions(comments) {
  const parsed = comments.map(parseComment);
  const lines = parsed.flatMap((p) => p.lines);
  const blocks = parsed.flatMap((p) => p.blocks);
  return {
    isSuppressed: (ruleId, at) => lines.some((directive) => directive.line === at.line && covers(directive.rules, ruleId)) || blockSuppressed(blocks, ruleId, at)
  };
}

// src/parse.ts
var import_acorn = require("./acorn.js");
var import_acorn_typescript = require("./acorn-typescript.js");
var TSX_FILE = /\.tsx$/;
var DECLARATION_FILE = /\.d\.[cm]?ts$/;
function keepGoing(base) {
  const Base = base;
  class Lenient extends Base {
    raiseRecoverable() {
    }
    reportReservedArrowTypeParam() {
    }
    tsParseNoneModifiers(node) {
      this.tsParseClassTypeParameterModifiers(node);
    }
    parseExprList(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
      return super.parseExprList(close, allowTrailingComma || close === import_acorn.tokTypes.parenR, allowEmpty, refDestructuringErrors);
    }
  }
  return Lenient;
}
var isLineComment = (comment) => comment.type === "Line";
function attempt(code, filename) {
  const comments = [];
  try {
    const parser = import_acorn.Parser.extend((0, import_acorn_typescript.tsPlugin)({ jsx: TSX_FILE.test(filename), dts: DECLARATION_FILE.test(filename) }), keepGoing);
    const program = parser.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
      allowHashBang: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      onComment: comments
    });
    const found = comments.map((comment) => ({ ...comment, type: isLineComment(comment) ? "Line" : "Block" }));
    return isNode(program) ? { program, comments: found } : void 0;
  } catch {
    return void 0;
  }
}
function parseTypeScript(code, filename) {
  return attempt(code, filename);
}

// src/rules/comments.ts
var MIN_DESCRIPTION_LENGTH = 3;
var NEEDS_DESCRIPTION = /* @__PURE__ */ new Set(["ignore", "expect-error"]);
var PRAGMA_LINE = /^\/\/\/?\s*@ts-(?<directive>check|nocheck)(?<description>.*)$/;
var DIRECTIVE_LINE = /^\/*\s*@ts-(?<directive>expect-error|ignore)(?<description>.*)/;
var DIRECTIVE_BLOCK = /^\s*(?:\/|\*)*\s*@ts-(?<directive>expect-error|ignore)(?<description>.*)/;
var LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/;
function execDirective(pattern, text) {
  const groups = pattern.exec(text)?.groups;
  const directive = groups?.["directive"];
  const description = groups?.["description"];
  return directive === void 0 || description === void 0 ? void 0 : { directive, description };
}
function findDirective(comment) {
  if (comment.type === "Line") {
    return execDirective(PRAGMA_LINE, `//${comment.value}`) ?? execDirective(DIRECTIVE_LINE, comment.value);
  }
  const lines = comment.value.split(LINE_BREAK);
  return execDirective(DIRECTIVE_BLOCK, lines.at(-1) ?? "");
}
function graphemeCount(text) {
  return [...new Intl.Segmenter().segment(text)].length;
}
function firstStatementLine(program) {
  return childList(program, "body").at(0)?.loc.start.line;
}
var banTsComment = {
  id: "ban-ts-comment",
  program: (context) => {
    const firstLine = firstStatementLine(context.program);
    context.comments.forEach((comment) => {
      const found = findDirective(comment);
      if (!found) return;
      const { directive, description } = found;
      const pragmaAfterCode = directive === "nocheck" && firstLine !== void 0 && firstLine <= comment.loc.start.line;
      if (pragmaAfterCode) return;
      if (directive === "nocheck") {
        context.report(comment, `Do not use "@ts-${directive}" because it alters compilation errors.`);
        return;
      }
      if (NEEDS_DESCRIPTION.has(directive) && graphemeCount(description.trim()) < MIN_DESCRIPTION_LENGTH) {
        context.report(
          comment,
          `Include a description after the "@ts-${directive}" directive to explain why the @ts-${directive} is necessary. The description must be ${MIN_DESCRIPTION_LENGTH} characters or longer.`
        );
      }
    });
  }
};
var NARRATIVE_MARKERS = [
  "adversarial testing",
  "we found",
  "found that",
  "turns out",
  "used to be",
  "previously",
  "originally",
  "discovered",
  "after debugging",
  "the bug was",
  "this used to"
];
function findMarker(text) {
  const lower = text.toLowerCase();
  return NARRATIVE_MARKERS.find((marker) => lower.includes(marker));
}
var noNarrativeComment = {
  id: "no-narrative-comment",
  program: (context) => {
    context.comments.forEach((comment) => {
      const marker = findMarker(comment.value);
      if (marker) {
        context.report(
          comment,
          `comment reads as history ("${marker}") \u2014 state the present-tense feature or invariant instead (see SKILL.md Comment Discipline).`
        );
      }
    });
  }
};

// src/rules/lookup-annotation.ts
var RECORD = "Record";
var READONLY = "Readonly";
var typeNameOf = (type) => type?.type === "TSTypeReference" ? nameOf(child(type, "typeName")) : void 0;
function isRecordType(type) {
  if (typeNameOf(type) === RECORD) return true;
  if (!type || typeNameOf(type) !== READONLY) return false;
  const [inner] = childList(child(type, "typeArguments") ?? type, "params");
  return typeNameOf(inner) === RECORD;
}
var noColonAnnotatedLookup = {
  id: "colon-annotated-lookup",
  enter: ({ node }, context) => {
    if (node.type !== "VariableDeclarator") return;
    const id = child(node, "id");
    const init = child(node, "init");
    const declared = child(child(id ?? node, "typeAnnotation") ?? node, "typeAnnotation");
    if (init?.type !== "ObjectExpression" || !childList(init, "properties").length || !isRecordType(declared)) return;
    context.report(node, "lookup object typed with a colon annotation: write `{ ... } as const satisfies Record<K, V>` (see SKILL.md Data Over Logic).");
  }
};

// src/rules/fail-open.ts
var ARITHMETIC = /* @__PURE__ */ new Set(["+", "-", "*", "/", "%", "**"]);
var STRING = "String";
var noFailOpenDefault = {
  id: "fail-open-default",
  enter: ({ node, ancestors }, context) => {
    if (node.type !== "LogicalExpression" || node["operator"] !== "??") return;
    const right = child(node, "right");
    const left = child(node, "left");
    const callee = left?.type === "ChainExpression" ? child(left, "expression") : left;
    if (callee?.type !== "CallExpression") return;
    if (right?.type !== "Literal" || right["value"] !== "" && right["value"] !== 0) return;
    const parent = ancestors.at(-1);
    const isOperand = parent?.type === "BinaryExpression" && ARITHMETIC.has(String(parent["operator"]));
    if (isOperand || parent?.type === "TemplateLiteral") return;
    context.report(node, `\`?? ${String(right["raw"])}\` turns absence or failure into a valid value: return a tagged result or throw (see SKILL.md Make Illegal States Unrepresentable).`);
  }
};
var isOptionalChain = (arg) => arg?.type === "ChainExpression";
var noStringOfOptionalChain = {
  id: "string-of-optional-chain",
  enter: ({ node }, context) => {
    if (node.type !== "CallExpression" || nameOf(child(node, "callee")) !== STRING) return;
    const [first] = node["arguments"] ?? [];
    if (isOptionalChain(first)) {
      context.report(node, '`String()` of an optional chain prints "undefined" when it breaks: narrow first (see SKILL.md Core Rule 1).');
    }
  }
};

// src/rules/magic-numbers.ts
var IGNORED = /* @__PURE__ */ new Set([0, 1, -1]);
var MAX_ARRAY_LENGTH = 4294967295;
var RADIX_ARGUMENT = 1;
var LITERAL = "Literal";
var MEMBER = "MemberExpression";
var CALL = "CallExpression";
var CLASS_FIELD = "PropertyDefinition";
var SIGNS = ["-", "+"];
var ARITHMETIC2 = /* @__PURE__ */ new Set(["+", "-", "*", "/", "%", "**", "<<", ">>"]);
var AS_CONST_PATH = /* @__PURE__ */ new Set(["Property", "ObjectExpression", "ArrayExpression", "UnaryExpression"]);
var PARENT = 1;
var GRANDPARENT = 2;
var GREAT_GRANDPARENT = 3;
var negate = (value) => -value;
var signed = (value, sign) => sign === "-" ? negate(value) : value;
function magnitudeOf(node) {
  const value = node["value"];
  return typeof value === "number" || typeof value === "bigint" ? value : void 0;
}
function rawOf(node) {
  const raw = node["raw"];
  return typeof raw === "string" ? raw : String(node["value"]);
}
function signOf(parent) {
  const operator = parent?.type === "UnaryExpression" ? parent["operator"] : void 0;
  return typeof operator === "string" && SIGNS.includes(operator) ? operator : void 0;
}
function toNumber_(visit) {
  const { node, ancestors } = visit;
  const magnitude = node.type === LITERAL ? magnitudeOf(node) : void 0;
  if (magnitude === void 0) return void 0;
  const sign = signOf(ancestors.at(-PARENT));
  const hasSign = sign !== void 0;
  return {
    node,
    sign,
    full: hasSign ? ancestors.at(-PARENT) ?? node : node,
    above: hasSign ? ancestors.slice(0, -PARENT) : ancestors,
    magnitude
  };
}
function isNumericLiteralType({ above }) {
  if (above.at(-PARENT)?.type !== "TSLiteralType") return false;
  const grandparent = above.at(-GRANDPARENT);
  const inUnionAlias = grandparent?.type === "TSUnionType" && above.at(-GREAT_GRANDPARENT)?.type === "TSTypeAliasDeclaration";
  return grandparent?.type === "TSTypeAliasDeclaration" || inUnionAlias;
}
function isInsideIndexedAccessType({ above }) {
  const climb = (levels) => {
    const type = levels.at(-GRANDPARENT)?.type;
    return type === "TSUnionType" || type === "TSIntersectionType" ? climb(levels.slice(0, -PARENT)) : levels;
  };
  return climb(above).at(-GRANDPARENT)?.type === "TSIndexedAccessType";
}
function isReadonlyClassField({ above }) {
  const parent = above.at(-PARENT);
  return parent?.type === CLASS_FIELD && parent["readonly"] === true;
}
function isParseIntRadix({ above, full }) {
  const call = above.at(-PARENT);
  if (call?.type !== CALL) return false;
  if (childList(call, "arguments")[RADIX_ARGUMENT] !== full) return false;
  const callee = child(call, "callee");
  const isParseInt = callee?.type === "Identifier" && nameOf(callee) === "parseInt";
  const isNumberParseInt = callee?.type === MEMBER && nameOf(child(callee, "object")) === "Number" && nameOf(child(callee, "property")) === "parseInt";
  return isParseInt || isNumberParseInt;
}
var isJsxNumber = ({ above }) => above.at(-PARENT)?.type.startsWith("JSX") ?? false;
function isArrayIndex({ above, full, magnitude, sign }) {
  const access = above.at(-PARENT);
  if (access?.type !== MEMBER || child(access, "property") !== full) return false;
  const value = signed(magnitude, sign);
  const isInteger = typeof value === "bigint" || Number.isInteger(value);
  return isInteger && value >= 0 && value < MAX_ARRAY_LENGTH;
}
function aboveArithmetic(levels) {
  const top = levels.at(-PARENT);
  const isMath = top?.type === "BinaryExpression" && ARITHMETIC2.has(String(top["operator"])) || top?.type === "UnaryExpression";
  return isMath ? aboveArithmetic(levels.slice(0, -PARENT)) : levels;
}
function isNamedConstArithmetic({ above }) {
  const rest = aboveArithmetic(above);
  return rest.at(-PARENT)?.type === "VariableDeclarator" && rest.at(-GRANDPARENT)?.["kind"] === "const";
}
function isInsideAsConst({ above }) {
  const climb = (levels) => {
    const top = levels.at(-PARENT);
    if (top && AS_CONST_PATH.has(top.type)) return climb(levels.slice(0, -PARENT));
    return top?.type === "TSAsExpression" && nameOf(child(child(top, "typeAnnotation") ?? top, "typeName")) === "const";
  };
  return climb(above);
}
var isExempt = (found) => isParseIntRadix(found) || isJsxNumber(found) || isArrayIndex(found);
var noMagicNumbers = {
  id: "no-magic-numbers",
  enter: (visit, context) => {
    const found = toNumber_(visit);
    if (!found) return;
    const { node, sign, full, above, magnitude } = found;
    const report = (at, text) => context.report(at, `No magic number: ${text}.`);
    const minus = sign === "-";
    if (IGNORED.has(signed(magnitude, minus ? "-" : void 0))) return;
    const flaggedHere = () => report(minus ? full : node, `${minus ? "-" : ""}${rawOf(node)}`);
    if (above.at(-PARENT)?.type === "TSEnumMember") return flaggedHere();
    if (isNumericLiteralType(found)) return;
    if (isInsideIndexedAccessType(found) || isReadonlyClassField(found)) return flaggedHere();
    if (IGNORED.has(signed(magnitude, sign)) || isExempt(found)) return;
    if (isNamedConstArithmetic(found) || isInsideAsConst(found)) return;
    if (above.at(-PARENT)?.type !== "VariableDeclarator") report(full, `${sign ?? ""}${rawOf(node)}`);
  }
};

// src/rules/param-reassign.ts
var MESSAGE = "function parameter mutated \u2014 return a new value instead (see SKILL.md).";
var FUNCTION_TYPES = /* @__PURE__ */ new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression"
]);
var BINDING_COLLECTORS = {
  Identifier: (pattern, into) => {
    const name = nameOf(pattern);
    if (name !== void 0) into.add(name);
  },
  AssignmentPattern: (pattern, into) => collectBindingNames(child(pattern, "left"), into),
  RestElement: (pattern, into) => collectBindingNames(child(pattern, "argument"), into),
  TSParameterProperty: (pattern, into) => collectBindingNames(child(pattern, "parameter"), into),
  ObjectPattern: (pattern, into) => childList(pattern, "properties").forEach((property) => collectBindingNames(valueOf(property), into)),
  ArrayPattern: (pattern, into) => childList(pattern, "elements").forEach((element) => collectBindingNames(element, into))
};
var valueOf = (property) => child(property, property.type === "RestElement" ? "argument" : "value");
function collectBindingNames(pattern, into) {
  if (pattern !== void 0) BINDING_COLLECTORS[pattern.type]?.(pattern, into);
}
function rootIdentifierName(target) {
  if (target === void 0) return void 0;
  if (target.type === "MemberExpression") return rootIdentifierName(child(target, "object"));
  return target.type === "Identifier" ? nameOf(target) : void 0;
}
function reportDestructuredTargets(pattern, isParam, context) {
  if (pattern === void 0) return;
  if (pattern.type === "ObjectPattern") {
    childList(pattern, "properties").forEach((property) => reportDestructuredTargets(valueOf(property), isParam, context));
    return;
  }
  if (pattern.type === "ArrayPattern") {
    childList(pattern, "elements").forEach((element) => reportDestructuredTargets(element, isParam, context));
    return;
  }
  const name = rootIdentifierName(pattern);
  if (name !== void 0 && isParam(name)) context.report(pattern, MESSAGE);
}
function isTrackedParam(frames, name) {
  const nearest = [...frames].reverse().find((frame) => frame.params.has(name) || frame.locals.has(name));
  return nearest?.params.has(name) ?? false;
}
function createNoParamReassign() {
  const frames = [];
  const isParam = (name) => isTrackedParam(frames, name);
  return {
    id: "no-param-reassign",
    enter: ({ node }, context) => {
      if (FUNCTION_TYPES.has(node.type)) {
        const params = /* @__PURE__ */ new Set();
        childList(node, "params").forEach((param) => collectBindingNames(param, params));
        frames.push({ params, locals: /* @__PURE__ */ new Set() });
        return;
      }
      if (node.type === "VariableDeclarator") {
        const frame = frames.at(-1);
        if (frame) collectBindingNames(child(node, "id"), frame.locals);
        return;
      }
      if (node.type === "AssignmentExpression") {
        const left = child(node, "left");
        if (left?.type === "ObjectPattern" || left?.type === "ArrayPattern") {
          reportDestructuredTargets(left, isParam, context);
          return;
        }
        const name = rootIdentifierName(left);
        if (left !== void 0 && name !== void 0 && isParam(name)) context.report(left, MESSAGE);
        return;
      }
      if (node.type === "UpdateExpression") {
        const name = rootIdentifierName(child(node, "argument"));
        if (name !== void 0 && isParam(name)) context.report(node, MESSAGE);
      }
    },
    exit: ({ node }) => {
      if (FUNCTION_TYPES.has(node.type)) frames.pop();
    }
  };
}

// src/rules/promise.ts
var PROMISE_METHODS = /* @__PURE__ */ new Set(["then", "catch", "finally"]);
var CALL2 = "CallExpression";
var MEMBER2 = "MemberExpression";
var AWAIT_OR_YIELD = /* @__PURE__ */ new Set(["AwaitExpression", "YieldExpression"]);
var CYPRESS = "cy";
var SCOPE_TYPES = /* @__PURE__ */ new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression",
  "StaticBlock",
  "BlockStatement",
  "SwitchStatement",
  "CatchClause",
  "TSModuleBlock",
  "TSEnumDeclaration"
]);
var FOR_HEADERS = {
  ForStatement: "init",
  ForInStatement: "left",
  ForOfStatement: "left"
};
function declaresLexically(node) {
  const header = FOR_HEADERS[node.type];
  const declaration = header === void 0 ? void 0 : child(node, header);
  return declaration?.type === "VariableDeclaration" && declaration["kind"] !== "var";
}
var opensScope = (node) => SCOPE_TYPES.has(node.type) || declaresLexically(node);
var isConstructor = (node) => node.type === "MethodDefinition" && node["kind"] === "constructor";
function isCypressCall(call) {
  const callee = child(call, "callee");
  if (call.type !== CALL2 || callee?.type !== MEMBER2) return false;
  const object = child(callee, "object");
  return nameOf(object) === CYPRESS || object !== void 0 && isCypressCall(object);
}
var preferAwaitToThen = {
  id: "prefer-await-to-then",
  enter: ({ node, ancestors }, context) => {
    if (node.type !== CALL2) return;
    const callee = child(node, "callee");
    if (callee?.type !== MEMBER2) return;
    const property = child(callee, "property");
    const method = property?.type === "Identifier" ? nameOf(property) : void 0;
    if (property === void 0 || method === void 0 || !PROMISE_METHODS.has(method)) return;
    const around = [...ancestors, node];
    const skipped = !around.some(opensScope) || around.some((above) => AWAIT_OR_YIELD.has(above.type)) || around.some(isConstructor) || isCypressCall(node);
    if (!skipped) context.report(property, "Prefer await to then()/catch()/finally().");
  }
};

// src/rules/regex-comment.ts
var BLANK_LINE = /^\s*$/;
var QUOTED_EXAMPLE = /["'`]/;
var TESTER_LINK = "https://";
var REGEXP_CONSTRUCTOR = "RegExp";
var CONSTRUCTIONS = /* @__PURE__ */ new Set(["NewExpression", "CallExpression"]);
var FIRST_LINE = 1;
function anchorLine(node, ancestors) {
  const parent = ancestors.at(-1);
  const sameLineParent = parent !== void 0 && parent.type !== "Program" && parent.loc.start.line === node.loc.start.line;
  return sameLineParent ? anchorLine(parent, ancestors.slice(0, -1)) : node.loc.start.line;
}
function previousNonBlankLine(lines, line) {
  const candidate = line - 1;
  if (candidate < FIRST_LINE) return 0;
  return BLANK_LINE.test(lines[candidate - 1] ?? "") ? previousNonBlankLine(lines, candidate) : candidate;
}
function commentEndingOn(comments, lines, line) {
  return comments.find((comment) => {
    if (comment.loc.end.line !== line) return false;
    const leading = (lines[comment.loc.start.line - 1] ?? "").slice(0, comment.loc.start.column);
    return BLANK_LINE.test(leading);
  });
}
function commentBlockEndingOn(comments, lines, line) {
  const comment = commentEndingOn(comments, lines, line);
  if (!comment) return [];
  return [...commentBlockEndingOn(comments, lines, comment.loc.start.line - 1), comment];
}
var isRegExpLiteral = (node) => node.type === "Literal" && node["regex"] !== void 0;
function isRegExpConstruction(node) {
  const callee = child(node, "callee");
  return CONSTRUCTIONS.has(node.type) && callee?.type === "Identifier" && nameOf(callee) === REGEXP_CONSTRUCTOR;
}
var requireRegexExample = {
  id: "require-regex-example",
  enter: ({ node, ancestors }, context) => {
    if (!isRegExpLiteral(node) && !isRegExpConstruction(node)) return;
    const above = previousNonBlankLine(context.lines, anchorLine(node, ancestors));
    const block = commentBlockEndingOn(context.comments, context.lines, above);
    if (!block.length) {
      context.report(
        node,
        "regex with no comment above it \u2014 say what it accepts, with a quoted input it matches and one it rejects (see SKILL.md Core Rule 11)."
      );
      return;
    }
    const text = block.map((comment) => comment.value).join("\n");
    if (!QUOTED_EXAMPLE.test(text)) {
      context.report(
        node,
        "comment above the regex has no quoted example \u2014 add an input it matches and one it rejects (see SKILL.md Core Rule 11)."
      );
      return;
    }
    if (!text.includes(TESTER_LINK)) {
      context.report(
        node,
        "comment above the regex has no tester link \u2014 add a regex101.com (or equivalent) URL pre-filled with the pattern and the examples (see SKILL.md Core Rule 11)."
      );
    }
  }
};

// src/rules/repeated-literal.ts
var MIN_LENGTH = 8;
var MIN_OCCURRENCES = 3;
var PREVIEW_LENGTH = 40;
var PLACEHOLDER = "${}";
var ALLOWED = /* @__PURE__ */ new Set(["undefined", "function", "anonymous"]);
var NON_VALUE_PARENTS = /* @__PURE__ */ new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
  "ImportAttribute",
  "TSLiteralType",
  "TSImportType",
  "TSExternalModuleReference",
  "JSXAttribute",
  "TaggedTemplateExpression"
]);
var TEST_FUNCTIONS = /* @__PURE__ */ new Set(["it", "test", "describe"]);
function isTestTitle(parent, node) {
  if (parent?.type !== "CallExpression") return false;
  const callee = child(parent, "callee");
  const base = callee?.type === "MemberExpression" ? child(callee, "object") : callee;
  const [title] = parent["arguments"] ?? [];
  const name = nameOf(base);
  return title === node && name !== void 0 && TEST_FUNCTIONS.has(name);
}
function isPositionalNoise(parent, node) {
  if (!parent) return false;
  const isKey = parent.type === "Property" && parent["computed"] === false && child(parent, "key") === node;
  const isDirective = parent.type === "ExpressionStatement" && typeof parent["directive"] === "string";
  return isKey || isDirective || NON_VALUE_PARENTS.has(parent.type) || isTestTitle(parent, node);
}
function textOf(node) {
  if (node.type === "Literal") return typeof node["value"] === "string" ? node["value"] : void 0;
  if (node.type !== "TemplateLiteral") return void 0;
  return node["quasis"].map((quasi) => String(quasi["value"].cooked ?? "")).join(PLACEHOLDER);
}
function literalText({ node, ancestors }) {
  const text = textOf(node);
  if (text === void 0 || text.length < MIN_LENGTH || text === PLACEHOLDER || ALLOWED.has(text)) return void 0;
  return isPositionalNoise(ancestors.at(-1), node) ? void 0 : text;
}
function createRepeatedLiteral() {
  const seen = /* @__PURE__ */ new Map();
  return {
    id: "repeated-literal",
    enter: (visit) => {
      const text = literalText(visit);
      if (text !== void 0) seen.set(text, [...seen.get(text) ?? [], visit.node]);
    },
    exit: ({ ancestors }, context) => {
      if (ancestors.length) return;
      seen.forEach((nodes, text) => {
        const [first] = nodes;
        if (!first || nodes.length < MIN_OCCURRENCES) return;
        const preview = text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}\u2026` : text;
        context.report(first, `"${preview}" appears ${nodes.length} times: export one named const and compose from it (see SKILL.md Core Rule 9).`);
      });
    }
  };
}

// src/rules/simple.ts
var CONDITIONAL = "ConditionalExpression";
var LOOP_TYPES = /* @__PURE__ */ new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement"
]);
var noExplicitAny = {
  id: "no-explicit-any",
  enter: ({ node }, context) => {
    if (node.type === "TSAnyKeyword") context.report(node, "Unexpected any. Specify a different type.");
  }
};
var noSwitchStatement = {
  id: "no-switch-statement",
  enter: ({ node }, context) => {
    if (node.type === "SwitchStatement") {
      context.report(node, "switch statement \u2014 convert to a Record dispatch table (see SKILL.md Data Over Logic).");
    }
  }
};
var noLoopStatements = {
  id: "no-loop-statements",
  enter: ({ node }, context) => {
    if (LOOP_TYPES.has(node.type)) {
      context.report(node, "raw loop \u2014 express as .map()/.filter()/.reduce() (see SKILL.md Data Over Logic).");
    }
  }
};
var noNestedTernary = {
  id: "no-nested-ternary",
  enter: ({ node }, context) => {
    if (node.type !== CONDITIONAL) return;
    const nested = ["test", "consequent", "alternate"].some((key) => child(node, key)?.type === CONDITIONAL);
    if (nested) {
      context.report(node, "nested ternary \u2014 flatten, or convert to a Record/.find() lookup (see SKILL.md Data Over Logic).");
    }
  }
};

// src/rules/void-guard.ts
var GUARD = "guard";
var ASSERT_PREFIX = "assert";
var isGuardName = (name) => name === GUARD || (name?.startsWith(ASSERT_PREFIX) ?? false);
var returnsVoid = (fn) => child(child(fn ?? {}, "returnType") ?? {}, "typeAnnotation")?.type === "TSVoidKeyword";
var noVoidGuard = {
  id: "void-guard",
  enter: ({ node }, context) => {
    const declared = node.type === "FunctionDeclaration" ? node : void 0;
    const init = node.type === "VariableDeclarator" ? child(node, "init") : void 0;
    const isFunctionInit = init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression";
    const name = declared ? nameOf(child(declared, "id")) : nameOf(child(node, "id"));
    const fn = declared ?? (isFunctionInit ? init : void 0);
    if (fn && isGuardName(name) && returnsVoid(fn)) {
      context.report(node, `\`${String(name)}\` returns void: declare \`asserts condition\` so the narrowing reaches the caller (see SKILL.md Core Rule 1).`);
    }
  }
};

// src/rules/zero-comparison.ts
var ZERO_TESTS = /* @__PURE__ */ new Set(["> 0", "=== 0", "!== 0", "== 0", "!= 0", ">= 1", "< 1"]);
var noZeroComparison = {
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
  }
};

// src/registry.ts
var CHECKS = [
  {
    id: "no-explicit-any",
    skillRule: "Core Rule 1 (No any)",
    pointer: "SKILL.md Core Rule 1 \u2014 use unknown + narrow, or a precise type",
    create: () => noExplicitAny
  },
  {
    id: "ban-ts-comment",
    skillRule: "@ts-ignore needs a TODO",
    pointer: "SKILL.md \u2014 @ts-ignore needs a follow-up TODO/description",
    create: () => banTsComment
  },
  {
    // Numbers inside object literals are checked too: config objects and payload
    // literals are the most common home for magic numbers. A numeric literal type
    // (`type X = 1 | 2`) is not a runtime expression and has no "extract to a
    // const" fix path, so it is exempt.
    id: "no-magic-numbers",
    skillRule: "Core Rule 9 (magic numbers half)",
    pointer: "SKILL.md Core Rule 9 \u2014 extract to a named const",
    create: () => noMagicNumbers
  },
  {
    id: "prefer-await-to-then",
    skillRule: "Core Rule 5 (async/await only)",
    pointer: "SKILL.md Core Rule 5 \u2014 use async/await, not .then()",
    create: () => preferAwaitToThen
  },
  {
    id: "no-switch-statement",
    skillRule: "Data Over Logic",
    pointer: "SKILL.md Data Over Logic \u2014 convert to a Record dispatch table",
    create: () => noSwitchStatement
  },
  {
    id: "no-param-reassign",
    skillRule: "Never mutate function parameters",
    pointer: "SKILL.md \u2014 return a new value, don't mutate the parameter",
    create: createNoParamReassign
  },
  {
    id: "no-loop-statements",
    skillRule: "Data Over Logic (pipelines)",
    pointer: "SKILL.md Data Over Logic \u2014 express as .map()/.filter()/.reduce()",
    create: () => noLoopStatements
  },
  {
    // A lexical proxy for a semantic rule: expect both misses and occasional
    // false positives, unlike the near-exact checks above.
    id: "no-narrative-comment",
    skillRule: "Comment Discipline",
    pointer: "SKILL.md Comment Discipline \u2014 state a feature or invariant, not history",
    create: () => noNarrativeComment
  },
  {
    id: "no-nested-ternary",
    skillRule: "Data Over Logic",
    pointer: "SKILL.md Data Over Logic \u2014 flatten or convert nested ternaries to a Record/.find() lookup",
    create: () => noNestedTernary
  },
  {
    // Comment presence is exact; "has an example" and "has a tester link" are
    // lexical proxies (a quoted string and an https:// in the comment).
    id: "require-regex-example",
    skillRule: "Core Rule 11 (every regex carries an example)",
    pointer: "SKILL.md Core Rule 11 \u2014 comment above: what it accepts, a quoted match/reject, and a pre-filled tester link",
    create: () => requireRegexExample
  },
  {
    // Matches `.length` only: on a bare number the comparison can be the point, and the
    // engine has no types to tell the two apart.
    id: "no-zero-comparison",
    skillRule: "Core Rule 10 (coerce over compare), the `.length` case",
    pointer: "SKILL.md Core Rule 10 \u2014 coerce: `!!x.length` / `!x.length`",
    create: () => noZeroComparison
  },
  {
    // A lexical proxy for "the same value restated": counts identical strings and template
    // skeletons per file, so it cannot see a repeat across files.
    id: "repeated-literal",
    skillRule: "Core Rule 9 (repeated literals)",
    pointer: "SKILL.md Core Rule 9 \u2014 export one named const and compose from it",
    create: createRepeatedLiteral
  },
  {
    id: "colon-annotated-lookup",
    skillRule: "Derive, Don't Restate (`as const satisfies`) and Data Over Logic",
    pointer: "SKILL.md Data Over Logic \u2014 `{ ... } as const satisfies Record<K, V>`",
    create: () => noColonAnnotatedLookup
  },
  {
    // Lexical: sees the literal after `??`, not the type, so arithmetic and template
    // operands are skipped as the intended uses.
    id: "fail-open-default",
    skillRule: "Make Illegal States Unrepresentable (fail-open defaults)",
    pointer: "SKILL.md Make Illegal States Unrepresentable \u2014 return a tagged result or throw",
    create: () => noFailOpenDefault
  },
  {
    id: "string-of-optional-chain",
    skillRule: "Core Rule 1 (`String(x)` on a possibly missing value)",
    pointer: 'SKILL.md Core Rule 1 \u2014 narrow first; `String(undefined)` is "undefined"',
    create: () => noStringOfOptionalChain
  },
  {
    id: "void-guard",
    skillRule: "Core Rule 1 (`asserts condition` guards)",
    pointer: "SKILL.md Core Rule 1 \u2014 declare `asserts condition`",
    create: () => noVoidGuard
  }
];
var POINTER_BY_ID = Object.fromEntries(CHECKS.map((check) => [check.id, check.pointer]));
var LINE_BREAK2 = /\r\n|[\r\n\u2028\u2029]/;
var BYTE_ORDER_MARK = "\uFEFF";
var withoutBom = (code) => code.startsWith(BYTE_ORDER_MARK) ? code.slice(BYTE_ORDER_MARK.length) : code;
function analyze(source, filename) {
  const code = withoutBom(source);
  const parsed = parseTypeScript(code, filename);
  if (!parsed) return [];
  const findings = [];
  const lines = code.split(LINE_BREAK2);
  const rules = CHECKS.map((check) => check.create());
  const contextFor = (rule) => ({
    program: parsed.program,
    lines,
    comments: parsed.comments,
    report: (at, text) => {
      const { line, column } = at.loc.start;
      findings.push({ ruleId: rule.id, line, column: column + 1, text });
    }
  });
  const contexts = rules.map(contextFor);
  rules.forEach((rule, index) => {
    const context = contexts[index];
    if (context) rule.program?.(context);
  });
  walk(parsed.program, {
    enter: (visit) => rules.forEach((rule, index) => contexts[index] && rule.enter?.(visit, contexts[index])),
    exit: (visit) => rules.forEach((rule, index) => contexts[index] && rule.exit?.(visit, contexts[index]))
  });
  const suppressions = readSuppressions(parsed.comments);
  return findings.filter((finding) => !suppressions.isSuppressed(finding.ruleId, { line: finding.line, column: finding.column - 1 }));
}
function runChecks(code, filename) {
  const findings = safely(() => analyze(code, filename));
  return [...findings].sort((a, b) => a.line - b.line || a.column - b.column).map((finding) => ({
    ruleId: finding.ruleId,
    line: finding.line,
    column: finding.column,
    text: finding.text,
    pointer: POINTER_BY_ID[finding.ruleId] ?? ""
  }));
}
function safely(run) {
  try {
    return run();
  } catch {
    return [];
  }
}

// src/report.ts
var violationLines = (violations) => violations.map((v) => `  L${v.line}:${v.column}  ${v.ruleId}  ${v.text}  \u2192 ${v.pointer}`);

// src/check.ts
var EXIT_OK = 0;
var EXIT_BLOCK = 2;
var TS_FILE = /\.tsx?$/;
function format(filePath, violations) {
  return [
    `ts-patterns: ${violations.length} mechanical violation(s) in ${filePath}:`,
    ...violationLines(violations),
    "Fix these to satisfy the TypeScript patterns before continuing.",
    ""
  ].join("\n");
}
function main() {
  const raw = (0, import_node_fs.readFileSync)(0, "utf8");
  const payload = JSON.parse(raw);
  const filePath = payload.tool_input?.file_path;
  if (!filePath || !TS_FILE.test(filePath)) {
    process.exit(EXIT_OK);
  }
  let code;
  try {
    code = (0, import_node_fs.readFileSync)(filePath, "utf8");
  } catch {
    process.exit(EXIT_OK);
  }
  const violations = runChecks(code, filePath);
  if (violations.length === 0) {
    process.exit(EXIT_OK);
  }
  process.stderr.write(format(filePath, violations));
  process.exit(EXIT_BLOCK);
}
main();
