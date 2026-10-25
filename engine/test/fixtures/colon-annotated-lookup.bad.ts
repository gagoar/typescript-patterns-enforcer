type Mode = "check" | "bump";
export const modes: Readonly<Record<Mode, () => void>> = { check: () => undefined, bump: () => undefined };
