#!/usr/bin/env python3
"""
A股扫描：生命线选股 + 精确换手率检查

选股条件：
1. 最近5天内出现生命线（阳线+成交量≥前3天最高量3倍+涨幅0.1%~7%）
2. 最近3个月（约60个交易日）内，每日换手率大部分 < 2%，允许最多3天例外

换手率计算：调用腾讯财经查询流通市值，精确计算
"""
import pandas as pd
import AmazingData as ad
import json
import os
import sys

# 添加当前目录到路径，以便导入 tencent_api
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tencent_api import get_float_shares_dict, calc_turnover

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

# === 阶段1：获取最近5天数据，筛选生命线候选 ===
recent_start, recent_end = 20260821, 20260829
recent_dates = [int(d.strftime('%Y%m%d')) for d in pd.date_range(start='20260821', end='20260829', freq='D')]
md_recent = ad.MarketData(recent_dates)

# === 阶段2：获取3个月数据，用于换手率检查 ===
# 3个月前日期
three_months_ago = (pd.Timestamp(str(recent_end)) - pd.Timedelta(days=90)).strftime('%Y%m%d')
three_months_ago_int = int(three_months_ago)
full_dates = [int(d.strftime('%Y%m%d')) for d in pd.date_range(start=three_months_ago, end=str(recent_end), freq='D')]
md_full = ad.MarketData(full_dates)

batch_size = 20
found = 0
lifeline_candidates = []  # 生命线候选，等待换手率检查

print(f"📅 数据范围: 生命线检查 {recent_start}~{recent_end}, 换手率检查 {three_months_ago_int}~{recent_end}")
print(f"🎯 开始扫描 {len(scan_list)} 只股票...\n")

for i in range(0, len(scan_list), batch_size):
    batch = scan_list[i:i+batch_size]

    # 获取最近5天数据（生命线筛选）
    try:
        result_recent = md_recent.query_kline(code_list=batch, begin_date=recent_start, end_date=recent_end)
    except Exception as e:
        continue

    for code in batch:
        if code not in result_recent:
            continue
        df_min = result_recent[code]
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
        df['pct_chg'] = (df['close'] - df['open']) / df['open'] * 100

        recent5 = df.iloc[-5:].copy()
        ll_mask = (
            recent5['is_yang']
            & (recent5['vol_ratio'] >= 3.0)
            & (recent5['pct_chg'] >= 0.1)
            & (recent5['pct_chg'] <= 7.0)
        )
        ll_recent = recent5[ll_mask]

        if len(ll_recent) > 0:
            ll = ll_recent.iloc[-1]
            lifeline_candidates.append({
                'code': code,
                'lifeline_date': str(ll.name.date()),
                'lifeline_close': round(ll['close'], 2),
                'lifeline_open': round(ll['open'], 2),
                'lifeline_vol': int(ll['volume']),
                'lifeline_vol_ratio': round(ll['vol_ratio'], 2),
                'lifeline_pct_chg': round(ll['pct_chg'], 2),
            })

    # 每50只报告进度
    current = start_idx + i + len(batch)
    if (i // batch_size + 1) % 5 == 0:
        print(f"   ... 进度: {current}/{len(a_shares)}，生命线候选: {len(lifeline_candidates)} 只")

print(f"\n🔍 生命线筛选完成: {len(lifeline_candidates)} 只候选，开始换手率检查...\n")

# === 阶段2：对候选股票进行换手率检查 ===
# 批量获取流通市值
print("📊 正在查询腾讯财经流通市值...")
candidate_codes = [c['code'] for c in lifeline_candidates]
float_caps = get_float_shares_dict(candidate_codes, batch_size=50)
print(f"   获取到 {len(float_caps)} 只股票的流通市值\n")

# 获取3个月数据并计算换手率
for candidate in lifeline_candidates:
    code = candidate['code']
    float_cap = float_caps.get(code)

    if not float_cap or float_cap <= 0:
        print(f"  ⚠️ {code} 无法获取流通市值，跳过")
        continue

    try:
        result_full = md_full.query_kline(code_list=[code], begin_date=three_months_ago_int, end_date=recent_end)
    except Exception as e:
        print(f"  ⚠️ {code} 获取历史数据失败: {e}")
        continue

    if code not in result_full:
        continue

    df_min = result_full[code]
    if len(df_min) < 30:
        print(f"  ⚠️ {code} 历史数据不足30天，跳过")
        continue

    df_min['date'] = pd.to_datetime(df_min['kline_time']).dt.date
    df_daily = df_min.groupby('date').agg({'close':'last', 'volume':'sum'})
    df_daily = df_daily.reset_index()
    df_daily['date'] = pd.to_datetime(df_daily['date'])
    df_daily = df_daily.set_index('date').sort_index()

    # 计算每日换手率
    df_daily['turnover'] = df_daily.apply(
        lambda row: calc_turnover(row['volume'], row['close'], float_cap),
        axis=1
    )

    # 过滤有效数据
    valid_turnover = df_daily['turnover'].dropna()
    if len(valid_turnover) < 20:
        print(f"  ⚠️ {code} 有效换手率数据不足20天，跳过")
        continue

    # 检查换手率：大部分 < 2%，允许最多3天例外
    high_turnover_days = (valid_turnover >= 2.0).sum()
    total_days = len(valid_turnover)
    max_allowed = 3

    candidate['total_days'] = total_days
    candidate['high_turnover_days'] = int(high_turnover_days)
    candidate['avg_turnover'] = round(valid_turnover.mean(), 4)
    candidate['max_turnover'] = round(valid_turnover.max(), 4)
    candidate['float_cap_yi'] = round(float_cap, 2)

    if high_turnover_days > max_allowed:
        print(f"  ❌ {code} 换手率检查未通过: {high_turnover_days}/{total_days} 天 ≥2% (允许{max_allowed}天), 平均换手率{candidate['avg_turnover']}%")
        continue

    # 通过所有检查
    candidate['pass_turnover'] = True
    results.append(candidate)
    found += 1
    print(f"  ✅ {code} | 生命线:{candidate['lifeline_date']} | 收{candidate['lifeline_close']:.2f} | 涨{candidate['lifeline_pct_chg']:.2f}% | 放量{candidate['lifeline_vol_ratio']:.2f}x | 换手率检查通过 ({high_turnover_days}/{total_days}天≥2%) 平均{candidate['avg_turnover']}%")

# 保存进度和结果
with open(progress_file, 'w') as f:
    json.dump({'last_idx': end_idx}, f)

with open(results_file, 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\n{'='*70}")
print(f"🎯 本次扫描 {start_idx}~{end_idx}")
print(f"🔍 生命线候选: {len(lifeline_candidates)} 只")
print(f"✅ 换手率检查通过: {found} 只")
print(f"📊 累计命中: {len(results)} 只")
print(f"💾 结果已保存到 {results_file}")
print(f"🔄 下次从第 {end_idx} 只继续")
print("="*70)

# 显示结果
if results:
    print(f"\n📈 所有命中股票（按放量倍数排序）：\n")
    results_sorted = sorted(results, key=lambda x: x.get('lifeline_vol_ratio', 0), reverse=True)
    for r in results_sorted:
        print(f"  {r['code']} | {r['lifeline_date']} | 收{r['lifeline_close']:.2f} | 涨{r.get('lifeline_pct_chg', 'N/A')}% | 放量{r['lifeline_vol_ratio']:.2f}x | 换手率检查:{r.get('high_turnover_days', 'N/A')}/{r.get('total_days', 'N/A')}天≥2% | 平均换手率{r.get('avg_turnover', 'N/A')}%")
