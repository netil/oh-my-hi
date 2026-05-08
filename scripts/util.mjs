// @ts-check
// Shared utility functions used across scripts/ and scripts/parsers/

/** Format a year + 1-based month as "YYYY-MM". */
export const toMonthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
