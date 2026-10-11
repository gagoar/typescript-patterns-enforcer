type Pick1 = <const T extends readonly string[]>(keys: T) => T;
interface Api {
  call<const A extends object, const B = A>(arg: A): B;
}
export type Factory<Bag extends object> = <
  const Screen extends Bag,
>(
  config: Screen,
) => Screen;
export const wait = (ms: number) => ms + 360;
