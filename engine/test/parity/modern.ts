import type { A } from "./a";
import x = require("x");
export = x;
declare module "m" { export const v: number; }
namespace N { export const n = 1; }
abstract class Q<in out T> { abstract accessor v: number; static { Q.z = 1; } #p = 2; override m(): void {} }
function ov(a: string): void;
function ov(a: number): void;
function ov(a: any): void {}
const enum CE { A = 1 }
const sat = { a: 1 } satisfies Record<string, number>;
type TL = `x-${string}`;
type Tup = [a: string, b?: number, ...c: boolean[]];
function asr(v: unknown): asserts v is string {}
declare const us: unique symbol;
const big = 10n ** 3n;
const top = await Promise.resolve(1);
class D { @dec() prop = 1; @dec method() {} }
function* g() { yield* [1]; }
label: { break label; }
export {};
