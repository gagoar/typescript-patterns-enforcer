function a(x: number, y: number) { x = 1; x += 2; x++; --y; y *= 3; return x + y; }
function b(opts: { n: number }) { opts.n = 1; opts.n++; opts.n ??= 3; }
function c({ n, m }: { n: number; m: number }, [p, q]: number[]) { n = 1; [m] = [2]; ({ q } = { q: 3 }); p++; }
function d(v = 5, ...rest: number[]) { v = 6; rest = []; rest.length = 0; }
function e(x: number) { const f = (x: number) => { x = 2; }; let g = x; { let x = 3; x = 4; } return f; }
function h(x: number) { function inner() { var x = 1; x = 2; } x = 5; }
class K {
  constructor(private a: number, public b = 2) { a = 1; this.b = 3; b = 4; }
  m(z: number) { z = 1; }
  get g() { return 1; }
  set s(val: number) { val = 2; }
  static sm(w: number) { w++; }
}
const o = { m(k: number) { k = 1; }, n: (k: number) => { k = 2; }, async am(k: number) { k = 3; } };
function i(n: number) { try { n = 1; } catch (n) { n = 2; } for (n = 0; n < 3; n++) {} }
function j(x: { y: { z: number } }) { x.y.z = 1; x.y = { z: 2 }; delete x.y; }
function k(x: number[]) { x[0] = 1; x.push(1); [x[1]] = [2]; ({ a: x[2] } = { a: 3 }); }
function l(x?: { y: number }) { x!.y = 1; (x as any).y = 2; x = undefined; x?.y; }
async function* m(x: number) { x = 1; yield x; }
const n = function named(x: number) { x = 1; };
function o2(x: number) { let x2 = x; x2 = 2; var y = 1; y = 2; }
function p2(x: number) { { const x = 5; } x = 6; }
export {};
