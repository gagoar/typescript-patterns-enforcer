const a = 42;
let b = 7;
var c = -9;
const ok0 = 0, ok1 = 1, okNeg = -1, okPos = +1, okZero = -0;
let d: number;
d = 13;
d += 3;
const obj = { x: 5, 8: "k", nested: { y: 11 }, [21]: 1 };
const arr = [4, 5, 6];
arr[0]; arr[2]; arr[-1]; arr[2.5]; arr[4294967295]; arr[0xAB]; arr[1e1]; arr[12n];
arr?.[3]; arr?.[0];
function f(x = 5, { y = 6 } = {}, ...rest: number[]) { return x * 99 + y; }
const g = (z = 17) => z > 30 ? 31 : 32;
class K {
  field = 100;
  static s = 200;
  readonly r = 300;
  private readonly pr = 400;
  m(n = 3) { return n + 500; }
}
enum E { A = 5, B = -3, C, D = 1 }
type T1 = 1 | 2 | -3;
type T2 = { k: 4 };
type T3 = Foo[4] | Bar[1 | 6];
let p: 5 = 5;
function h(q: 8): 9 { return 9; }
parseInt("1", 10); Number.parseInt("2", 16); parseInt("3", 8, 9);
const big = [0n, 5n, 1_000, 1e3, 0b101, 0o17, 0xff, .5, 5.];
switch (a) { case 3: break; default: break; }
delete (arr as any)[7];
new Array(8);
`${7}`;
const t = `x${a + 12}y`;
if (a > 18) { throw 19; }
export default 77;
