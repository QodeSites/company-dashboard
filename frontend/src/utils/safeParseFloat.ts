// utils/safeParseFloat.ts
export const safeParseFloat = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseFloat(value as string);
    return isNaN(parsed) ? null : parsed;
  };