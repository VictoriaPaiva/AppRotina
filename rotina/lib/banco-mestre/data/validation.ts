import type { Weekday } from '@/types/banco-mestre';
import { MapperError } from './errors';

export const INT_MAX = 2147483647;
export const weekdays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;
export function fail(field: string): never { throw new MapperError(field); }
export function record(v: unknown, f: string): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : fail(f);
}
export function text(v: unknown, f: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v : fail(f);
}
export function optionalText(v: unknown, f: string): string | undefined { return v === null ? undefined : text(v,f); }
export function uuid(v: unknown, f = 'id'): string {
  const s = text(v,f);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s.toLowerCase() : fail(f);
}
export function choice<const T extends readonly string[]>(v: unknown, values: T, f: string): T[number] {
  return typeof v === 'string' && values.includes(v) ? v as T[number] : fail(f);
}
export function bool(v: unknown, f: string): boolean { return typeof v === 'boolean' ? v : fail(f); }
/** Valida antes de Number(): strings fora do teto não podem arredondar para um valor válido. */
export function parseDatabaseNumber(v: unknown, f = 'numeric', integer = false, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v === 'string') {
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v) || v.length > 10000) fail(f);
    const unsigned = v.replace(/^[+-]/,'');
    const [whole = '0', fraction = ''] = unsigned.split('.');
    const scale = BigInt('1' + '0'.repeat(fraction.length));
    if (BigInt((whole || '0') + fraction) > BigInt(max) * scale || (integer && /[1-9]/.test(fraction))) fail(f);
  } else if (typeof v !== 'number') fail(f);
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > max || (integer && !Number.isSafeInteger(n))) fail(f);
  return n;
}
export function integer(v: unknown, f: string, min = 0, max = INT_MAX): number {
  // PostgreSQL integer/smallint são números; strings só são aceitas nos campos numeric.
  if (typeof v !== 'number') fail(f);
  const n = parseDatabaseNumber(v,f,true,max); return n >= min ? n : fail(f);
}
export function localDate(v: unknown, f: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(f);
  const [y,m,d] = v.split('-').map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= days[m-1] ? v : fail(f);
}
export function localTime(v: unknown, f: string): string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(v) ? v.slice(0,5) : fail(f);
}
export function timestamp(v: unknown, f: string): string {
  const s = text(v,f);
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(s)) fail(f);
  localDate(s.slice(0,10),f); return s;
}
export function fromIsoWeekdays(v: unknown, f = 'weekdays'): Weekday[] {
  if (!Array.isArray(v) || !v.length || v.length > 7) fail(f);
  let last = 0;
  return v.map((day: unknown) => { const n = integer(day,f,1,7); if (n <= last) fail(f); last = n; return weekdays[n-1]; });
}
/** Canoniza ordem sem descartar duplicatas inválidas. */
export function toIsoWeekdays(v: readonly Weekday[], f = 'weekdays'): number[] {
  if (!Array.isArray(v) || !v.length || v.length > 7) fail(f);
  const result = v.map(day => weekdays.indexOf(choice(day,weekdays,f)) + 1).sort((a,b)=>a-b);
  if (new Set(result).size !== result.length) fail(f); return result;
}
