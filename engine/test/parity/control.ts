declare const a: number, b: boolean, items: number[];
switch (a) { case 1: break; }
for (let i = 0; i < 3; i++) {}
for (const k in items) {}
for (const v of items) {}
async function fa() { for await (const x of []) {} }
while (b) {}
do {} while (b);
const t1 = a ? (b ? 1 : 2) : 3;
const t2 = a ? 1 : b ? 2 : 3;
const t3 = (a ? b : a) ? 1 : 2;
const t4 = a ? 1 : 2;
const t5 = `${a ? (b ? 1 : 2) : 3}`;
type C1<T> = T extends string ? (T extends "a" ? 1 : 2) : 3;
function sw(x: number) { switch (x) { case 1: return 1; default: return 2; } }
class K { m() { for (;;) { break; } } }
label: for (;;) { break label; }
