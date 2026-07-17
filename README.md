# Stock Risk Dashboard

本项目是一个“股票风险分析看板”，包含：
- 重大事件（公告）流 → 风险信号
- 财务比率面板（4 个比率）：
  - 净资产/总资产
  - 营收/总市值
  - 总资产/总市值
  - 货币资金/总市值

## Run

```bash
pnpm install
pnpm dev
```

- Frontend: `http://localhost:5173/`
- Backend: `http://localhost:3001/api/health`

## Real Data (默认强制)

后端默认 **强制真实数据**：如果真实数据源不可用，会返回 `502`，不会回退到 mock。

真实数据源：
- 股票列表（Universe）：优先读取本地 `scripts/ashare/_cache/ashare_spot_sina.json`，不存在时会尝试拉取并缓存在 `stock-risk-dashboard/.cache/ashare_spot_sina.json`
- 公告（Events）：东方财富公告接口 `np-anotice-stock.eastmoney.com`
- 财务字段（Ratios）：东方财富 datacenter 报表接口（资产负债表/利润表）

环境变量：
- `REAL_DATA_REQUIRED`：默认 `true`（缺省即强制真实）
- `MOCK_DATA`：仅在 `REAL_DATA_REQUIRED=false` 时才允许使用 mock
- `ASHARE_SINA_CACHE_PATH`：指定本地新浪缓存文件绝对路径（可选）
