export const hasItems = (items: readonly string[]): boolean => !!items.length;
export const isEmpty = (items: readonly string[]): boolean => !items.length;
export const isSingle = (items: readonly string[]): boolean => items.length === 1;
