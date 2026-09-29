export const RC_PATTERN = /^(.+)-rc\.([1-9]\d*)$/;

// digits after -rc.
export const RC_LOOSE = /-rc\.(\d+)$/;

// Matches "v1.2.0-rc.10"; rejects "v1.2.0-rc1".
export const RC_NO_LINK = /-rc\.([1-9]\d*)$/;

export const MAJOR_TAG = new RegExp("^v\\d+$");
