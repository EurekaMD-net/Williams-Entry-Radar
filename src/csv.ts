/**
 * csv.ts — minimal RFC 4180-ish CSV escaping.
 *
 * Wraps a field in double quotes if it contains comma, double quote,
 * or newline. Embedded double quotes are doubled. Numbers and bare
 * alphanumerics pass through untouched.
 */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(fields: unknown[]): string {
  return fields.map(csvEscape).join(",");
}
