type Mode = "check" | "bump";
export const modes = { check: () => undefined, bump: () => undefined } as const satisfies Record<Mode, () => void>;
export const counts: Record<string, number> = {};
