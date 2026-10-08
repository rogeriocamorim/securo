/**
 * Per-page memory of the last date range picked (issue #1053), so leaving
 * Transactions or Reports and coming back shows the range the user was on
 * instead of the page's default.
 *
 * Only a convenience: a range in the URL (bookmark, drill-down link) always
 * wins, and storage that is blocked or holds something unreadable falls back
 * to the default. The current month is remembered as "the current month",
 * not as its dates, so a range saved in March doesn't pin the page to March
 * once April starts.
 */
import { currentMonth, monthFromRange, monthRange } from '@/lib/month-utils'

const PREFIX = 'securo.dateRange.'

export type RememberedPage = 'transactions' | 'reports'

function read(page: RememberedPage): unknown {
  try {
    const raw = localStorage.getItem(PREFIX + page)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(page: RememberedPage, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + page, JSON.stringify(value))
  } catch {
    // Private mode or quota: remembering is best-effort.
  }
}

const isDate = (v: unknown): v is string => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v))

/** A from/to range ('' on either side means open-ended). */
export function loadRange(page: RememberedPage): { from: string; to: string } | null {
  const v = read(page) as { kind?: string; from?: unknown; to?: unknown } | null
  if (v?.kind === 'current-month') return monthRange(currentMonth())
  if (v?.kind === 'range' && isDate(v.from) && isDate(v.to)) return { from: v.from, to: v.to }
  return null
}

export function saveRange(page: RememberedPage, from: string, to: string): void {
  write(page, monthFromRange(from, to) === currentMonth() ? { kind: 'current-month' } : { kind: 'range', from, to })
}

/** Reports: a preset key (relative, e.g. "1y") or custom dates, plus the interval. */
export interface ReportsRange {
  rangeKey: string
  from: string
  to: string
  interval: string
}

export function loadReportsRange(): ReportsRange | null {
  const v = read('reports') as Partial<Record<keyof ReportsRange, unknown>> | null
  if (!v || typeof v.rangeKey !== 'string' || typeof v.interval !== 'string') return null
  if (!isDate(v.from) || !isDate(v.to)) return null
  return { rangeKey: v.rangeKey, from: v.from, to: v.to, interval: v.interval }
}

export function saveReportsRange(range: ReportsRange): void {
  write('reports', range)
}
