let a: any;
function f(x: any, ...rest: any[]): any { return x; }
const g = (y: any) => y as any;
const h = <any>5;
interface I { p: any; [k: string]: any; m(z: any): any; }
type T1 = keyof any;
type T2 = Array<any> | ReadonlyArray<any> | readonly any[] | Promise<any>;
type T3 = (...args: any[]) => any;
type T4 = { [K in keyof I]: any };
declare function d(...a: any[]): void;
abstract class A { abstract m(...x: any[]): void; p: any = 1; }
class B<T = any> {}
const s = {} satisfies Record<string, any>;
const any = 5;
let u: unknown; let nv: never;
function g2<T extends any>(x: T) {}
let t: [any, ...any[]];
export {};
