const r1 = /abc/;
// accepts "abc"; rejects "abd"
const r2 = /abc/;
// accepts "abc"; rejects "abd"
// https://regex101.com/?regex=abc
const r3 = /abc/;
/* a block comment with "quotes" and https://example.com */
const r4 = /abc/;
/** doc "q" */
const r5 = /abc/;

// separated by a blank line: "x" https://a.b
const r6 = /abc/;
const r7 = 1; // trailing "x" https://a.b
const r8 = /abc/;
// "x" https://a.b
const r9 = new RegExp("a");
// "x"
const r10 = RegExp("b");
// text only
const r11 = new RegExp(`c${r1}`);
const fn = (
  a,
  // "x" https://a.b
  /re/g,
  /second/
);
export const r12 = {
  k: /abc/,
};
function f() {
  // "x" https://a.b
  return /abc/.test("x");
}
x.replace(/a/g, "b").replace(/c/g, "d");
const notRegex = 4 / 2 / 1;
const s = "/not a regex/";
