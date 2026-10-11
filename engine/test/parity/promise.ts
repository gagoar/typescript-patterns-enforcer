declare const p: Promise<number>;
declare const cy: { get(s: string): Promise<number> };
p.then((x) => x);
p.catch(() => 0).finally(() => 1);
if (p) { p.then((x) => x); }
for (const i of [1, 2]) { p.then(() => i); }
try { p.then(() => 1); } catch { p.catch(() => 2); }
switch (1) { default: p.then(() => 3); }
{ p.then(() => 4); }
async function inAwait() { await p.then((x) => x); const v = await foo(() => p.then(() => 5)); return v; }
function* gen() { yield p.then((x) => x); }
class C {
  constructor() { p.then(() => 6); }
  m() { return p.then(() => 7); }
  static { p.then(() => 8); }
  field = p.then(() => 9);
}
const arrow = () => p.then((x) => x);
(async () => { p.then(() => 10); })();
cy.get("a").then((x) => x);
p["then"]((x) => x);
p?.then((x) => x);
const o = { m() { return p.then(() => 11); } };
function outer() { return [1].map(() => p.then((x) => x)).catch(() => 12); }
label: p.then(() => 13);
while (false) p.finally(() => 14);
export {};
