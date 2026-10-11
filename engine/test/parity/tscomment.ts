// @ts-ignore
const a1 = 1;
// @ts-ignore: because of reasons
const a2 = 2;
//@ts-expect-error
const a3 = 3;
// @ts-expect-error ok
const a4 = 4;
// @ts-expect-error legit reason here
const a5 = 5;
/* @ts-ignore */
const a6 = 6;
/*
 * some text
 * @ts-ignore
 */
const a7 = 7;
/* @ts-ignore: valid long description */
const a8 = 8;
/// @ts-nocheck
// @ts-nocheck
// @ts-check
// @ts-ignore    
const a9 = 9;
// @ts-expect-error -- ok
const a10 = 10;
// @ts-ignore 😀😀
const a11 = 11;
// @ts-ignore 日本語
const a12 = 12;
// not a directive @ts-ignore in the middle
const a13 = 13;
