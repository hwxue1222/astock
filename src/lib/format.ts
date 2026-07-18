import type { RiskLevel } from '@/types/stock'

export function formatIsoToLocal(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCompactNumber(n: number | undefined): string {
  if (n === undefined) return '—'
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`
  return n.toFixed(2)
}

export function formatYiFromYuan(yuan: number | undefined): string {
  if (yuan === undefined) return '—'
  if (!Number.isFinite(yuan)) return '—'
  return `${(yuan / 1e8).toFixed(2)}亿`
}

export function formatRatio(value: number, unitHint: '%' | 'x'): string {
  if (!Number.isFinite(value)) return '数据不足'
  if (unitHint === '%') return `${(value * 100).toFixed(1)}%`
  return `${value.toFixed(3)}x`
}

export function riskLevelLabel(level: RiskLevel): string {
  if (level === 'HIGH') return '高风险'
  if (level === 'MEDIUM') return '中风险'
  return '低风险'
}

export function riskLevelClass(level: RiskLevel): string {
  if (level === 'HIGH') return 'bg-red-500/20 text-red-200 ring-1 ring-red-500/30'
  if (level === 'MEDIUM') return 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30'
  return 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30'
}
