import type { MajorEvent, RiskLevel } from './types.js'

const HIGH_KEYWORDS = [
  /停标|暂停投标|暂停中标|禁止投标|投标资格|中标资格|黑名单|拉黑|失信|暂停中标\s*\d+\s*年/,
  /立案|调查|行政处罚|处罚|处分|监管措施|纪律处分|刑事/,
  /退市|终止上市|风险警示|ST\b|\*ST/,
  /违约|逾期|无法兑付|展期|破产|重整|清算|被执行|冻结/,
]

const MEDIUM_KEYWORDS = [/问询|关注函|警示函|监管函|诉讼|仲裁|质押|担保|减持|下修/]

export function eventRiskLevel(evt: MajorEvent): RiskLevel {
  const title = String(evt.title ?? '')
  const summary = String(evt.summary ?? '')
  const text = `${title} ${summary}`
  for (const re of HIGH_KEYWORDS) {
    if (re.test(text)) return 'HIGH'
  }
  for (const re of MEDIUM_KEYWORDS) {
    if (re.test(text)) return 'MEDIUM'
  }

  if (evt.eventType === 'DEBT_DEFAULT') return 'HIGH'
  if (evt.eventType === 'REGULATORY') return 'HIGH'
  if (evt.eventType === 'SUSPEND_RESUME') return 'HIGH'
  if (evt.eventType === 'LITIGATION') return 'MEDIUM'
  if (evt.eventType === 'EARNINGS') return 'MEDIUM'
  if (evt.eventType === 'MNA') return 'MEDIUM'
  return 'LOW'
}
