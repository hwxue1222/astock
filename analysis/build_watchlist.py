#!/usr/bin/env python3
"""获取26只命中股票的基本信息并生成自选股+监控页面"""
import json, pandas as pd, AmazingData as ad

ad.login(username='210600007723', password='19781222', host='101.230.159.234', port=8600)
print("✅ 登录成功\n")

# 读取扫描结果
with open('scan_results.json', 'r') as f:
    results = json.load(f)

codes = [r['code'] for r in results]
print(f"📋 共 {len(codes)} 只命中股票")

# 批量获取基本信息
print("🔍 获取股票基本信息...")
info = ad.InfoData().get_stock_basic(codes)
print(f"   获取到 {len(info)} 条信息\n")

# 合并数据
stocks_data = []
for r in results:
    code = r['code']
    row = info[info['MARKET_CODE'] == code]
    name = row['SECURITY_NAME'].values[0] if len(row) > 0 else code
    
    stocks_data.append({
        'code': code,
        'name': name,
        'll_date': r['date'],
        'll_close': r['close'],
        'll_vol_ratio': r['vol_ratio'],
        'll_volume': r['volume'],
        'll_open': r['open'],
        'll_low': r['low'],
    })

# 保存自选股JSON
with open('watchlist_lifeline.json', 'w', encoding='utf-8') as f:
    json.dump(stocks_data, f, indent=2, ensure_ascii=False)
print(f"💾 自选股已保存到 watchlist_lifeline.json\n")

# 生成HTML监控页面
html = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>生命线选股监控 - 最近3天</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
h1 { text-align: center; margin-bottom: 10px; color: #38bdf8; }
.subtitle { text-align: center; color: #94a3b8; margin-bottom: 30px; font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.card { background: #1e293b; border-radius: 12px; padding: 16px; border-left: 4px solid #38bdf8; transition: transform 0.2s; }
.card:hover { transform: translateY(-2px); }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.code { font-size: 18px; font-weight: bold; color: #38bdf8; }
.name { font-size: 14px; color: #94a3b8; }
.badge { background: #0ea5e9; color: white; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
.badge-strong { background: #f59e0b; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.stat { background: #334155; padding: 10px; border-radius: 8px; text-align: center; }
.stat-label { font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
.stat-value { font-size: 16px; font-weight: bold; color: #e2e8f0; }
.stat-value.up { color: #4ade80; }
.stat-value.high { color: #fbbf24; }
.footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 12px; }
.filter-bar { text-align: center; margin-bottom: 20px; }
.filter-bar button { background: #334155; color: #e2e8f0; border: none; padding: 8px 20px; margin: 0 5px; border-radius: 20px; cursor: pointer; font-size: 13px; }
.filter-bar button.active { background: #0ea5e9; }
</style>
</head>
<body>
<h1>🎯 生命线选股监控</h1>
<p class="subtitle">最近3天出现生命线（阳线+放量≥3倍）| 共 ''' + str(len(stocks_data)) + ''' 只 | 数据日期: 2026-08-28</p>
<div class="grid">
'''

for s in sorted(stocks_data, key=lambda x: x['ll_vol_ratio'], reverse=True):
    ratio_class = 'badge-strong' if s['ll_vol_ratio'] >= 5 else ''
    html += f'''
<div class="card">
  <div class="card-header">
    <div>
      <div class="code">{s['code']}</div>
      <div class="name">{s['name']}</div>
    </div>
    <span class="badge {ratio_class}">放量 {s['ll_vol_ratio']:.2f}x</span>
  </div>
  <div class="stats">
    <div class="stat">
      <div class="stat-label">生命线日期</div>
      <div class="stat-value">{s['ll_date']}</div>
    </div>
    <div class="stat">
      <div class="stat-label">收盘价</div>
      <div class="stat-value up">{s['ll_close']:.2f}</div>
    </div>
    <div class="stat">
      <div class="stat-label">开盘价</div>
      <div class="stat-value">{s['ll_open']:.2f}</div>
    </div>
    <div class="stat">
      <div class="stat-label">成交量</div>
      <div class="stat-value high">{s['ll_volume']:,}</div>
    </div>
  </div>
</div>
'''

html += '''
</div>
<p class="footer">⚠️ 本页面仅供学习研究，不构成投资建议。</p>
</body>
</html>
'''

with open('lifeline_monitor.html', 'w', encoding='utf-8') as f:
    f.write(html)

print(f"📊 监控页面已生成: lifeline_monitor.html")
print(f"   路径: C:\\Users\\user\\Documents\\Kimi\\Workspaces\\stock\\lifeline_monitor.html")
print(f"\n📁 自选股数据: watchlist_lifeline.json")
print(f"   路径: C:\\Users\\user\\Documents\\Kimi\\Workspaces\\stock\\watchlist_lifeline.json")
