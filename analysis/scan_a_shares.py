#!/usr/bin/env python3
"""
A股扫描：最近3天生命线选股
每批20只，先扫前1000只
筛选条件：阳线+放量≥3倍+当天涨幅0.1%~7%
"""
import pandas as pd, AmazingData as ad, json, os

ad.login(username='210600007723', password='19781222', host='101.230.159.234', port=8600)
print("✅ 登录成功\n")

bd = ad.BaseData()
a_shares = bd.get_code_list()
print(f"📋 A股总数: {len(a_shares)}")

# 进度文件
progress_file = 'scan_progress.json'
results_file = 'scan_results.json'

# 读取已有进度
start_idx = 0
if os.path.exists(progress_file):
    with open(progress_file, 'r') as f:
        progress = json.load(f)
    start_idx = progress.get('last_idx', 0)
    print(f"🔄 从第 {start_idx} 只继续扫描\n")
else:
    print(f"🔍 开始新扫描（先扫前1000只）\n")

# 读取已有结果
results = []
if os.path.exists(results_file):
    with open(results_file, 'r') as f:
        results = json.load(f)
    print(f"📁 已有结果: {len(results)} 只\n")

# 只扫描前1000只或从上次进度继续
end_idx = min(start_idx + 1000, len(a_shares))
scan_list = a_shares[start_idx:end_idx]

start_int, end_int = 20260821, 20260829
dates = [int(d.strftime('%Y%m%d')) for d in pd.date_range(start='20260821', end='20260829', freq='D')]
md = ad.MarketData(dates)

batch_size = 20
found = 0

for i in range(0, len(scan_list), batch_size):
    batch = scan_list[i:i+batch_size]
    try:
        result = md.query_kline(code_list=batch, begin_date=start_int, end_date=end_int)
    except Exception as e:
        continue
    
    for code in batch:
        if code not in result:
            continue
        df_min = result[code]
        if len(df_min) < 10:
            continue
        
        df_min['date'] = pd.to_datetime(df_min['kline_time']).dt.date
        df = df_min.groupby('date').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum'})
        df = df.reset_index()
        df['date'] = pd.to_datetime(df['date'])
        df = df.set_index('date').sort_index()
        
        if len(df) < 4:
            continue
        
        df['is_yang'] = df['close'] >= df['open']
        df['vol_d1'] = df['volume'].shift(1)
        df['vol_d2'] = df['volume'].shift(2)
        df['vol_d3'] = df['volume'].shift(3)
        df['vol_max3'] = df[['vol_d1','vol_d2','vol_d3']].max(axis=1)
        df['vol_ratio'] = df['volume'] / df['vol_max3']
        # 当天涨幅
        df['pct_chg'] = (df['close'] - df['open']) / df['open'] * 100
        
        recent3 = df.iloc[-3:].copy()
        ll_mask = (
            recent3['is_yang']
            & (recent3['vol_ratio'] >= 3.0)
            & (recent3['pct_chg'] >= 0.1)
            & (recent3['pct_chg'] <= 7.0)
        )
        ll_recent = recent3[ll_mask]
        
        if len(ll_recent) > 0:
            ll = ll_recent.iloc[-1]
            pct_chg = round(ll['pct_chg'], 2)
            r = {
                'code': code,
                'date': str(ll.name.date()),
                'open': round(ll['open'], 2),
                'close': round(ll['close'], 2),
                'low': round(ll['low'], 2),
                'volume': int(ll['volume']),
                'vol_ratio': round(ll['vol_ratio'], 2),
                'pct_chg': pct_chg,
            }
            results.append(r)
            found += 1
            print(f"✅ {code} | {r['date']} | 收{r['close']:.2f} | 涨{pct_chg:.2f}% | 放量{r['vol_ratio']:.2f}x | 量{r['volume']:,}")
    
    # 每50只报告进度
    current = start_idx + i + len(batch)
    if (i // batch_size + 1) % 5 == 0:
        print(f"   ... 进度: {current}/{len(a_shares)}，本段命中 {found} 只，累计 {len(results)} 只")

# 保存进度和结果
with open(progress_file, 'w') as f:
    json.dump({'last_idx': end_idx}, f)

with open(results_file, 'w') as f:
    json.dump(results, f, indent=2)

print(f"\n{'='*70}")
print(f"🎯 本次扫描 {start_idx}~{end_idx}，命中 {found} 只")
print(f"📊 累计命中: {len(results)} 只")
print(f"💾 结果已保存到 {results_file}")
print(f"🔄 下次从第 {end_idx} 只继续")
print("="*70)

# 显示结果
if results:
    print(f"\n📈 所有命中股票（按放量倍数排序）：\n")
    results_sorted = sorted(results, key=lambda x: x['vol_ratio'], reverse=True)
    for r in results_sorted:
        print(f"  {r['code']} | {r['date']} | 收{r['close']:.2f} | 涨{r.get('pct_chg', 'N/A')}% | 放量{r['vol_ratio']:.2f}x | 量{r['volume']:,}")
