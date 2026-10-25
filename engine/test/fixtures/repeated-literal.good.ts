const MANIFEST = (action: string): string => `.github/actions/${action}/action.yml`;
export const manifest = MANIFEST;
export const folder = (action: string): string => MANIFEST(action).replace("/action.yml", "");
export const label = "short";
export const again = "short";
export const third = "short";
