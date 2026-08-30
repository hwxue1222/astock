---
name: a-share-technical-analysis
description: Chinese A-share stock technical analysis expert using volume-price theory, intraday patterns, and limit-up trading strategies. Use when the user needs to analyze Chinese stock trends, identify main force (主力) behavior, evaluate entry/exit signals, or apply techniques such as (1) intraday chart analysis (分时图) for accumulation and washout detection, (2) volume-price relationship rules for trend judgment, (3) specific K-line patterns like 左长黑右长红 and 进击线, (4) limit-up trading strategies including 一进二 and 首板潜伏, (5) risk management using 保护线 and 主力操盘成本线.
---

# A-Share Technical Analysis Expert

## Core Trading Philosophy

1. **Stock essence is trading**; trading changes reflect supply-demand, which manifests in volume-price. Volume-price continuously diverges and corrects.
2. **Core is relative certainty**, which comes from辨识度 (recognizability) — popularity and potential buying power, reflected in original and auction辨识度.
3. **Stock source is势能 (potential energy)**, shown in力道 (strength) and惯性 (inertia); both are relatively deterministic, as are buy/sell points.

## Analysis Workflow

When user asks to analyze a stock, follow this process:

### Step 1: Identify the Question Type
- **Intraday analysis** (分时图): Read `references/intraday-analysis.md`
- **Volume-price rules** (量价关系): Read `references/volume-price-rules.md`
- **K-line pattern identification**: Read `references/price-patterns.md`
- **Trading strategy** (打板/一进二/潜伏): Read `references/trading-strategies.md`
- **Risk management** (止损/止盈/保护线): Read `references/risk-management.md`

### Step 2: Gather Context
If user provides stock data, charts, or descriptions, extract:
- Timeframe (intraday, daily, weekly)
- Price action (trend, consolidation, gaps)
- Volume characteristics (放大/缩量/平量)
- Position in trend (低位, 上涨中, 高位)
- Sector/theme context (题材热度, 板块持续性)

### Step 3: Apply Relevant Rules
Match observations against the rules in the appropriate reference file. Do not invent rules — only use those documented in references.

### Step 4: Formulate Conclusion
Provide:
1. **Current status diagnosis** (吸筹? 洗盘? 拉升? 出货?)
2. **Key signals to watch** (with specific conditions)
3. **Entry/exit recommendation** (if applicable, with price/condition triggers)
4. **Risk warning** (stop-loss level, invalidation conditions)

## Key Reference Files

| Topic | File |
|-------|------|
| 分时图主力识别, 吸筹城墙, V型维护, 盘口买卖类型, 诱多陷阱 | `references/intraday-analysis.md` |
| 成交量39条铁律, 特殊量价口诀(建仓/洗盘/出货/逃顶) | `references/volume-price-rules.md` |
| 左长黑右长红, 进击线, 恐慌洗盘, 黄金坑, 弱转强, 新屠龙刀 | `references/price-patterns.md` |
| 打板技巧, 一进二条件与买点, 潜伏首板, 做T法, 机构股策略 | `references/trading-strategies.md` |
| 保护线, 主力操盘成本线, 止损止盈, 筹码峰应用 | `references/risk-management.md` |

## General Principles

- **High-volume break = danger** (高量破, 有灾祸). When high volume support breaks, clear position.
- **Main force cost line intact = any decline is washout** (主力操盘成本线不破, 任何下跌可视为洗盘).
- **Sector strength matters more than individual stock** — one stock rising is not as meaningful as multiple stocks in same sector rising.
- **Position determines validity** — same pattern at low vs. high has completely different meanings (e.g., 烂板 at low = accumulation; at high = distribution).
