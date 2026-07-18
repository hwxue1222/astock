import type { MajorEvent, RiskLevel, RiskSignal, RiskSignalsResponse } from './types.js'

function riskScore(level: RiskLevel): number {
  if (level === 'HIGH') return 3
  if (level === 'MEDIUM') return 2
  return 1
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 3) return 'HIGH'
  if (score === 2) return 'MEDIUM'
  return 'LOW'
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime())
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function levelByRecency(base: RiskLevel, publishedAtIso: string, now = new Date()): RiskLevel {
  const d = new Date(publishedAtIso)
  const days = daysBetween(now, d)

  if (days <= 7) return base
  if (days <= 30) {
    if (base === 'HIGH') return 'MEDIUM'
    return 'LOW'
  }
  return 'LOW'
}

function titleForEventType(eventType: MajorEvent['eventType']): string {
  const map: Record<MajorEvent['eventType'], string> = {
    REGULATORY: '监管/合规重大事件',
    LITIGATION: '诉讼/纠纷重大事件',
    EARNINGS: '财报/指引重大事件',
    MNA: '并购/重组重大事件',
    SUSPEND_RESUME: '停复牌/交易异常',
    DEBT_DEFAULT: '债务违约/流动性风险',
    OTHER: '其他重大事件',
  }
  return map[eventType]
}

function baseLevelForEventType(eventType: MajorEvent['eventType']): RiskLevel {
  if (eventType === 'DEBT_DEFAULT') return 'HIGH'
  if (eventType === 'REGULATORY') return 'HIGH'
  if (eventType === 'LITIGATION') return 'MEDIUM'
  if (eventType === 'SUSPEND_RESUME') return 'HIGH'
  if (eventType === 'MNA') return 'MEDIUM'
  if (eventType === 'EARNINGS') return 'MEDIUM'
  return 'LOW'
}

function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  const score = (x: RiskLevel) => (x === 'HIGH' ? 3 : x === 'MEDIUM' ? 2 : 1)
  return score(a) >= score(b) ? a : b
}

function maxRiskLevel(levels: Array<RiskLevel | undefined>): RiskLevel | null {
  let best: RiskLevel | null = null
  for (const l of levels) {
    if (!l) continue
    best = best ? maxLevel(best, l) : l
  }
  return best
}

export function buildRiskSignals(input: {
  symbol: string
  events: MajorEvent[]
  now?: Date
}): RiskSignalsResponse {
  const now = input.now ?? new Date()
  const symbol = input.symbol.toUpperCase()

  const byType = new Map<MajorEvent['eventType'], MajorEvent[]>()
  for (const evt of input.events) {
    const list = byType.get(evt.eventType) ?? []
    list.push(evt)
    byType.set(evt.eventType, list)
  }

  const signals: RiskSignal[] = []
  for (const [eventType, list] of byType.entries()) {
    const sorted = [...list].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    const latest = sorted[0]
    if (!latest) continue

    const explicitMax = maxRiskLevel(sorted.map((e) => e.riskLevel))
    const chosen = explicitMax ? sorted.find((e) => e.riskLevel === explicitMax) ?? latest : latest

    const base = baseLevelForEventType(eventType)
    const base2 = chosen.riskLevel ? maxLevel(base, chosen.riskLevel) : base
    const level = explicitMax ? maxLevel(levelByRecency(base2, chosen.publishedAt, now), explicitMax) : levelByRecency(base2, chosen.publishedAt, now)

    const relatedEventIds = sorted.slice(0, 6).map((e) => e.id)
    const reason = `${chosen.title}（${chosen.sourceName}）`

    signals.push({
      id: `sig_${symbol}_${eventType}`,
      symbol,
      level,
      title: titleForEventType(eventType),
      reason,
      relatedEventIds,
      occurredAt: chosen.publishedAt,
      direction: eventType === 'MNA' ? 'UNCERTAIN' : 'NEGATIVE',
    })
  }

  signals.sort((a, b) => {
    const scoreDiff = riskScore(b.level) - riskScore(a.level)
    if (scoreDiff !== 0) return scoreDiff
    return a.occurredAt < b.occurredAt ? 1 : -1
  })

  const anyHighEvent = input.events.some((e) => e.riskLevel === 'HIGH')
  const overallScore = Math.max(
    signals.reduce((m, s) => Math.max(m, riskScore(s.level)), 1),
    anyHighEvent ? riskScore('HIGH') : 1,
  )
  const overallLevel = levelFromScore(overallScore)

  return {
    symbol,
    updatedAt: now.toISOString(),
    overallLevel,
    signals,
  }
}
