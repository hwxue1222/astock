#!/usr/bin/env python3
"""五阶段模型详细评估 - v3（生命线支撑位=开盘价，起涨点需站稳生命线收盘价）"""
import os, datetime, pandas as pd, AmazingData as ad

ad.login(username='210600007723', password='19781222', host='101.230.159.234', port=8600)
print("✅ 登录成功\n")

STOCKS = {
    '688155.SH': '先惠技术',
    '301662.SZ': '宏工科技',
    '000777.SZ': '中核科技',
    '002332.SZ': '仙琚制药',
    '000153.SZ': '丰原药业',
}

start_int, end_int = 20260301, 20260829
dates = [int(d.strftime('%Y%m%d')) for d in pd.date_range(start='20260301', end='20260829', freq='D')]
md = ad.MarketData(dates)

for code, name in STOCKS.items():
    print(f"\n{'='*70}")
    print(f"📈 [{code}] {name}")
    print('='*70)
    
    result = md.query_kline(code_list=[code], begin_date=start_int, end_date=end_int)
    if code not in result:
        print("  ❌ 无数据")
        continue
    
    df_min = result[code]
    df_min['date'] = pd.to_datetime(df_min['kline_time']).dt.date
    df = df_min.groupby('date').agg({
        'open':'first','high':'max','low':'min','close':'last','volume':'sum','amount':'sum'
    }).reset_index()
    df['date'] = pd.to_datetime(df['date'])
    df = df.set_index('date').sort_index()
    print(f"  数据: {len(df)} 个交易日  ({df.index[0].date()} ~ {df.index[-1].date()})")
    print(f"  最新: 收{df['close'].iloc[-1]:.2f}  量{int(df['volume'].iloc[-1]):,}")
    
    # 基础计算
    df['is_yang'] = df['close'] >= df['open']
    df['vol_d1'] = df['volume'].shift(1)
    df['vol_d2'] = df['volume'].shift(2)
    df['vol_d3'] = df['volume'].shift(3)
    df['vol_max3'] = df[['vol_d1','vol_d2','vol_d3']].max(axis=1)
    df['vol_ratio'] = df['volume'] / df['vol_max3']
    df['close_ma20'] = df['close'].rolling(20).mean()
    df['close_std20'] = df['close'].rolling(20).std()
    df['cv20'] = df['close_std20'] / df['close_ma20'] * 100
    df['vol_ma20'] = df['volume'].rolling(20).mean()
    
    analysis_df = df.iloc[:-3].copy()
    latest = df.iloc[-1]
    latest_date = df.index[-1].date()
    
    # 1. 低吸
    print(f"\n  📥 【阶段1: 低吸】")
    recent_cv = df['cv20'].tail(20).mean()
    recent_vol_ratio = (df['volume'].tail(20) / df['vol_ma20'].tail(20)).mean()
    print(f"      20日变异系数: {recent_cv:.2f}%  {'→ 横盘' if recent_cv < 3 else '→ 波动较大'}")
    print(f"      近期量/20日均量: {recent_vol_ratio:.2f}x")
    
    # 2. 试盘-生命线
    print(f"\n  🔍 【阶段2: 试盘 - 生命线】")
    ll_mask = analysis_df['is_yang'] & (analysis_df['vol_ratio'] >= 3.0)
    ll_all = analysis_df[ll_mask]
    print(f"      生命线数量: {len(ll_all)}")
    
    if len(ll_all) == 0:
        print(f"      ❌ 未出现生命线")
        near = analysis_df[analysis_df['is_yang'] & (analysis_df['vol_ratio'] >= 2.0)]
        if len(near) > 0:
            n = near.iloc[-1]
            print(f"      ⚡ 最接近: {n.name.date()} 放量{n['vol_ratio']:.2f}x 收{n['close']:.2f}")
        print(f"\n  📋 【结论】📥 低吸阶段（主力尚未试盘）")
        continue
    
    # 取有效生命线（后续未跌破开盘价）
    valid_ll = None
    for i in range(len(ll_all) - 1, -1, -1):
        ll = ll_all.iloc[i]
        after = df.loc[ll.name:].iloc[1:]
        if len(after) > 0:
            # 关键规则：不能跌破生命线的开盘价
            if after['low'].min() >= ll['open'] * 0.98:
                valid_ll = ll
                break
            # 如果跌破了，检查后面是否有新的生命线
            new_ll_after = after[after['is_yang'] & (after['vol_ratio'] >= 3.0)]
            if len(new_ll_after) > 0:
                continue
    
    if valid_ll is None:
        ll = ll_all.iloc[-1]
        ll_date = ll.name.date()
        print(f"      ✅ 生命线: {ll_date} (已失效)")
        print(f"         开{ll['open']:.2f} 收{ll['close']:.2f} 低{ll['low']:.2f} 量{int(ll['volume']):,} 放量{ll['vol_ratio']:.2f}x")
        after = df.loc[ll.name:].iloc[1:]
        if len(after) > 0:
            print(f"         生命线后最低: {after['low'].min():.2f} (跌破开盘价{ll['open']:.2f})")
        print(f"\n  📋 【结论】📥 低吸阶段（生命线已失效，主力重新吸筹）")
        continue
    
    ll = valid_ll
    ll_date = ll.name.date()
    print(f"      ✅ 有效生命线: {ll_date}")
    print(f"         开{ll['open']:.2f} 收{ll['close']:.2f} 低{ll['low']:.2f} 高{ll['high']:.2f}")
    print(f"         标杆量: {int(ll['volume']):,}  放量{ll['vol_ratio']:.2f}x")
    print(f"         ⚠️ 关键支撑: 开盘价 {ll['open']:.2f}（不可跌破）")
    
    # 3. 震仓/洗盘
    print(f"\n  🔄 【阶段3: 震仓/洗盘】")
    after_ll = df.loc[ll.name:].iloc[1:]
    min_low_after = after_ll['low'].min()
    print(f"      生命线后最低: {min_low_after:.2f}")
    print(f"      生命线开盘价: {ll['open']:.2f}")
    print(f"      是否跌破开盘价: {'❌ 是' if min_low_after < ll['open'] * 0.98 else '✅ 否'}")
    
    has_pullback = after_ll['close'].min() < ll['close']
    if has_pullback and min_low_after >= ll['open'] * 0.98:
        pullback_pct = (after_ll['close'].min() - ll['close']) / ll['close'] * 100
        print(f"      ✅ 震仓成立: 回落{pullback_pct:.1f}%，但未破开盘价{ll['open']:.2f}")
    elif not has_pullback:
        print(f"      无震仓，维持在生命线收盘价之上")
    
    # 4. 起涨点（拉升开始）
    print(f"\n  🚀 【阶段4: 起涨点（拉升开始）】")
    print(f"      起涨点标准: 阳线 + 收盘价站稳生命线收盘价({ll['close']:.2f}) + 放量")
    
    # 起涨点：收盘价站稳生命线收盘价之上
    qz_mask = (after_ll['close'] > ll['close']) & after_ll['is_yang'] & (after_ll['vol_ratio'] >= 2.0)
    qz_all = after_ll[qz_mask]
    
    if len(qz_all) == 0:
        weak = after_ll[(after_ll['close'] > ll['close']) & after_ll['is_yang']]
        if len(weak) > 0:
            w = weak.iloc[0]
            print(f"      ⚡ 有阳线突破生命线收盘价({ll['close']:.2f})")
            print(f"         但放量不足: {w.name.date()} 收{w['close']:.2f} 放量{w['vol_ratio']:.2f}x")
        else:
            print(f"      ❌ 未出现起涨点")
        
        if has_pullback and min_low_after >= ll['open'] * 0.98:
            print(f"\n  📋 【结论】🔄 震仓洗盘阶段")
        else:
            print(f"\n  📋 【结论】⏳ 试盘后整理阶段")
        continue
    
    qz = qz_all.iloc[0]
    qz_date = qz.name.date()
    print(f"      ✅ 起涨点: {qz_date}")
    print(f"         收盘价: {qz['close']:.2f} (站稳生命线 {ll['close']:.2f})")
    print(f"         放量: {qz['vol_ratio']:.2f}x")
    
    # 检查是否"站稳"：起涨点后3天维持在生命线收盘价之上
    after_qz_3d = df.loc[qz.name:].iloc[1:4]
    if len(after_qz_3d) >= 2 and (after_qz_3d['close'] >= ll['close']).all():
        print(f"         ✅ 站稳确认: 起涨点后{len(after_qz_3d)}天均维持在生命线收盘价之上")
    elif len(after_qz_3d) > 0:
        stand_days = (after_qz_3d['close'] >= ll['close']).sum()
        print(f"         ⚡ 起涨后{len(after_qz_3d)}天中{stand_days}天站稳")
    
    # 5. 拉升 / 出货
    print(f"\n  ⬆️ 【阶段5: 拉升 / 出货】")
    after_qz = df.loc[qz.name:].iloc[1:]
    if len(after_qz) == 0:
        print(f"      ⏳ 刚刚起涨")
        print(f"\n  📋 【结论】🚀 起涨初期")
        continue
    
    latest_price = latest['close']
    rise_pct = (latest_price - qz['close']) / qz['close'] * 100
    print(f"      从起涨点涨幅: {rise_pct:.1f}%")
    
    # 起涨后的阳线持有信号
    yang_after_qz = after_qz[after_qz['is_yang']]
    if len(yang_after_qz) > 0:
        print(f"      起涨后阳线: {len(yang_after_qz)} 次 → 可持有信号")
    
    # 出货判断: 连续阴线 + 跌破最近阳线最低价
    recent_5 = df.iloc[-5:]
    yin_count = (~recent_5['is_yang']).sum()
    last_yang = df[df['is_yang']].iloc[-1] if (df['is_yang']).any() else None
    
    if last_yang is not None:
        print(f"\n      最近阳线: {last_yang.name.date()} 最低{last_yang['low']:.2f}")
        if latest['close'] < last_yang['low'] and yin_count >= 2:
            print(f"      ❌ 连续阴线({yin_count}天) + 跌破最近阳线最低({last_yang['low']:.2f})")
            print(f"\n  📋 【结论】⚠️ 出货阶段")
            continue
    
    if rise_pct >= 30:
        print(f"\n  📋 【结论】⬆️ 拉升中（涨幅{rise_pct:.1f}%，关注出货信号）")
    elif rise_pct > 10:
        print(f"\n  📋 【结论】⬆️ 拉升初期（涨幅{rise_pct:.1f}%）")
    elif rise_pct > 0:
        print(f"\n  📋 【结论】🚀 刚起涨（涨幅{rise_pct:.1f}%）")
    else:
        min_after_qz = after_qz['low'].min()
        if min_after_qz >= ll['open'] * 0.98:
            print(f"\n  📋 【结论】🔄 起涨后回落震仓（未破生命线开盘价）")
        else:
            print(f"\n  📋 【结论】📥 低吸阶段（起涨失效）")

print("\n" + "="*70)
print("⚠️ 免责声明：本分析仅供学习研究，不构成投资建议。")
print("="*70)
