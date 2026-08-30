#!/usr/bin/env python3
"""
五阶段模型分析脚本 - 含异常评估机制
低吸 → 试盘(生命线) → 震仓 → 起涨点 → 拉升/出货

异常评估触发条件：
- 低吸期：放量但不足3倍阳线（1.5x~2.5x）→ 异常A：试盘还是反弹？
- 生命线后：跌破开盘价 → 异常B：洗盘还是破位？
- 起涨点：量不足标杆量 → 异常C：真突破还是诱多？
- 震仓>10天无起涨 → 异常D：主力是否失去控盘？
"""
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

# 异常标记列表
abnormal_list = []

def get_daily_kline(stock_code):
    result = md.query_kline(code_list=[stock_code], begin_date=start_int, end_date=end_int)
    if stock_code not in result:
        return None
    df_min = result[stock_code]
    df_min['date'] = pd.to_datetime(df_min['kline_time']).dt.date
    df = df_min.groupby('date').agg({
        'open':'first','high':'max','low':'min','close':'last','volume':'sum'
    }).reset_index()
    df['date'] = pd.to_datetime(df['date'])
    df = df.set_index('date').sort_index()
    return df

def analyze_stock(code, name):
    print(f"\n{'='*70}")
    print(f"📈 [{code}] {name}")
    print('='*70)
    
    df = get_daily_kline(code)
    if df is None or len(df) < 20:
        print("  ❌ 数据不足")
        return {'code': code, 'name': name, 'stage': '数据不足'}
    
    print(f"  数据: {len(df)} 个交易日  ({df.index[0].date()} ~ {df.index[-1].date()})")
    print(f"  最新: 收{df['close'].iloc[-1]:.2f}")
    
    # 基础计算
    df['is_yang'] = df['close'] >= df['open']
    df['vol_d1'] = df['volume'].shift(1)
    df['vol_d2'] = df['volume'].shift(2)
    df['vol_d3'] = df['volume'].shift(3)
    df['vol_max3'] = df[['vol_d1','vol_d2','vol_d3']].max(axis=1)
    df['vol_ratio'] = df['volume'] / df['vol_max3']
    
    analysis_df = df.iloc[:-3].copy() if len(df) > 3 else df.copy()
    latest = df.iloc[-1]
    
    result = {'code': code, 'name': name}
    
    # ========== 阶段1: 低吸期 ==========
    print(f"\n  📥 【阶段1: 低吸】")
    
    # 检查是否有接近生命线的信号（1.5x~2.5x）
    near_ll = analysis_df[analysis_df['is_yang'] & (analysis_df['vol_ratio'] >= 1.5) & (analysis_df['vol_ratio'] < 3.0)]
    if len(near_ll) > 0:
        n = near_ll.iloc[-1]
        print(f"      ⚡ 发现接近生命线信号: {n.name.date()} 放量{n['vol_ratio']:.2f}x")
        print(f"         收{n['close']:.2f} 量{int(n['volume']):,}")
        
        # 触发异常评估
        abnormal = {
            'stock': name,
            'code': code,
            'stage': '低吸期',
            'type': '接近生命线但未达标',
            'date': str(n.name.date()),
            'data': f"放量{n['vol_ratio']:.2f}x (需≥3x)",
            'question': '这是主力试盘还是普通反弹？',
            'option_a': '试盘 → 持续观察，等待3倍放量确认',
            'option_b': '普通反弹 → 放弃，主力尚未动手',
            'observe': f"观察后续3天: 1)是否出现3倍放量阳线 2)是否跌破{n['open']:.2f}"
        }
        abnormal_list.append(abnormal)
        print(f"      🚨 【异常评估触发】接近生命线但未达标！")
    
    # ========== 阶段2: 生命线 ==========
    ll_mask = analysis_df['is_yang'] & (analysis_df['vol_ratio'] >= 3.0)
    ll_all = analysis_df[ll_mask]
    
    if len(ll_all) == 0:
        print(f"      无生命线")
        result['stage'] = '低吸'
        return result
    
    # 取最近生命线
    ll = ll_all.iloc[-1]
    ll_date = ll.name.date()
    print(f"\n  🔍 【阶段2: 生命线】")
    print(f"      ✅ 生命线: {ll_date}")
    print(f"         开{ll['open']:.2f} 收{ll['close']:.2f} 量{int(ll['volume']):,} 放量{ll['vol_ratio']:.2f}x")
    
    after_ll = df.loc[ll.name:].iloc[1:]
    if len(after_ll) == 0:
        print(f"      ⏳ 刚刚出现生命线")
        result['stage'] = '刚刚试盘'
        return result
    
    # 检查是否跌破开盘价
    min_low = after_ll['low'].min()
    if min_low < ll['open'] * 0.98:
        print(f"      ❌ 跌破生命线开盘价: 最低{min_low:.2f} < 开盘价{ll['open']:.2f}")
        
        # 触发异常评估
        abnormal = {
            'stock': name,
            'code': code,
            'stage': '生命线后',
            'type': '跌破生命线开盘价',
            'date': str(ll_date),
            'data': f"生命线后最低{min_low:.2f}，跌破开盘价{ll['open']:.2f}",
            'question': '是震仓洗盘还是生命线失效？',
            'option_a': '震仓 → 3天内收复开盘价则保留',
            'option_b': '生命线失效 → 放弃，主力可能已出货',
            'observe': f"观察: 1)3天内是否收复{ll['open']:.2f} 2)是否出现新生命线"
        }
        abnormal_list.append(abnormal)
        print(f"      🚨 【异常评估触发】跌破生命线开盘价！")
        result['stage'] = '生命线失效（待评估）'
        return result
    
    print(f"      ✅ 未跌破开盘价: 最低{min_low:.2f} >= 开盘价{ll['open']:.2f}")
    
    # ========== 阶段3: 震仓/洗盘 ==========
    print(f"\n  🔄 【阶段3: 震仓/洗盘】")
    has_pullback = after_ll['close'].min() < ll['close']
    days_after = len(after_ll)
    
    if has_pullback:
        pullback_pct = (after_ll['close'].min() - ll['close']) / ll['close'] * 100
        print(f"      出现回调: 最大回落 {pullback_pct:.1f}%")
    
    if days_after > 10:
        print(f"      ⚠️ 生命线后已整理 {days_after} 天")
        
        # 触发异常评估
        abnormal = {
            'stock': name,
            'code': code,
            'stage': '震仓期',
            'type': '震仓时间过长',
            'date': str(ll_date),
            'data': f"生命线后已整理{days_after}天，无起涨点",
            'question': '主力是否失去控盘或已放弃拉升？',
            'option_a': '洗盘充分 → 继续等待起涨点',
            'option_b': '主力放弃 → 放弃，时间成本过高',
            'observe': f"观察: 1)是否出现放量突破{ll['close']:.2f} 2)成交量是否持续萎缩"
        }
        abnormal_list.append(abnormal)
        print(f"      🚨 【异常评估触发】震仓时间超过10天！")
    
    # ========== 阶段4: 起涨点 ==========
    print(f"\n  🚀 【阶段4: 起涨点】")
    qz_mask = (after_ll['close'] > ll['close']) & after_ll['is_yang']
    qz_candidates = after_ll[qz_mask]
    
    if len(qz_candidates) == 0:
        print(f"      ❌ 无阳线突破生命线收盘价")
        result['stage'] = '震仓洗盘' if has_pullback else '试盘后整理'
        return result
    
    # 检查是否满足起涨点条件（量>标杆量）
    qz_full = qz_candidates[qz_candidates['volume'] > ll['volume']]
    
    if len(qz_full) == 0:
        # 有突破但量不足
        w = qz_candidates.iloc[0]
        print(f"      ⚡ 有阳线突破生命线收盘价({ll['close']:.2f}): {w.name.date()}")
        print(f"         但量不足: {int(w['volume']):,} < 标杆量{int(ll['volume']):,}")
        
        # 触发异常评估
        abnormal = {
            'stock': name,
            'code': code,
            'stage': '起涨点附近',
            'type': '突破但量不足标杆量',
            'date': str(w.name.date()),
            'data': f"成交量{int(w['volume']):,} < 标杆量{int(ll['volume']):,}",
            'question': '是真起涨还是诱多假突破？',
            'option_a': '真起涨 → 次日补量确认后买入',
            'option_b': '诱多 → 放弃，可能回落震仓',
            'observe': f"观察: 1)次日是否补量(>{int(ll['volume']):,}) 2)是否站稳{ll['close']:.2f}"
        }
        abnormal_list.append(abnormal)
        print(f"      🚨 【异常评估触发】突破但量不足标杆量！")
        result['stage'] = '突破待确认（量不足）'
        return result
    
    qz = qz_full.iloc[0]
    print(f"      ✅ 起涨点: {qz.name.date()}")
    print(f"         收{qz['close']:.2f}(>{ll['close']:.2f}) 量{int(qz['volume']):,}(>{int(ll['volume']):,})")
    
    # ========== 阶段5: 拉升/出货 ==========
    print(f"\n  ⬆️ 【阶段5: 拉升/出货】")
    after_qz = df.loc[qz.name:].iloc[1:]
    if len(after_qz) == 0:
        print(f"      ⏳ 刚刚起涨")
        result['stage'] = '起涨初期'
        return result
    
    latest_price = latest['close']
    rise_pct = (latest_price - qz['close']) / qz['close'] * 100
    print(f"      从起涨点涨幅: {rise_pct:.1f}%")
    
    # 检查最近3天是否有连续阴线+破阳线最低
    recent_3 = df.iloc[-3:]
    yin_count = (~recent_3['is_yang']).sum()
    last_yang = df[df['is_yang']].iloc[-1] if (df['is_yang']).any() else None
    
    if last_yang is not None and latest['close'] < last_yang['low'] and yin_count >= 2:
        print(f"      ❌ 连续阴线({yin_count}天) + 跌破最近阳线最低({last_yang['low']:.2f})")
        print(f"      ⚠️ 出货信号出现！")
        result['stage'] = '出货'
    elif rise_pct >= 30:
        print(f"      ⬆️ 拉升中，涨幅{rise_pct:.1f}%，关注出货信号")
        result['stage'] = '拉升中'
    elif rise_pct > 0:
        print(f"      🚀 起涨初期，涨幅{rise_pct:.1f}%")
        result['stage'] = '起涨初期'
    else:
        # 起涨后回落
        print(f"      🔄 起涨后回落")
        result['stage'] = '起涨后回落'
    
    return result

# 执行分析
results = []
for code, name in STOCKS.items():
    try:
        r = analyze_stock(code, name)
        results.append(r)
    except Exception as e:
        print(f"  ❌ 分析失败: {e}")
        results.append({'code': code, 'name': name, 'stage': '分析异常'})

# 输出异常评估汇总
print(f"\n{'='*70}")
print(f"🚨 异常评估汇总（需您人工判断）")
print(f"共发现 {len(abnormal_list)} 处异常")
print('='*70)

if len(abnormal_list) == 0:
    print("\n  ✅ 未发现异常，所有股票均符合五阶段标准路径")
else:
    for i, ab in enumerate(abnormal_list, 1):
        print(f"\n  【异常{i}】[{ab['code']}] {ab['stock']}")
        print(f"  触发阶段: {ab['stage']}")
        print(f"  异常类型: {ab['type']}")
        print(f"  相关日期/数据: {ab['date']} | {ab['data']}")
        print(f"  ❓ 问题: {ab['question']}")
        print(f"  【A】{ab['option_a']}")
        print(f"  【B】{ab['option_b']}")
        print(f"  👁️ 观察指标: {ab['observe']}")

# 正常结论汇总
print(f"\n{'='*70}")
print(f"📋 正常路径结论汇总")
print('='*70)
for r in results:
    stage = r.get('stage', '未知')
    icon = {'低吸':'📥','刚刚试盘':'🔍','震仓洗盘':'🔄','试盘后整理':'➖',
            '起涨初期':'🚀','拉升中':'⬆️','出货':'⚠️'}.get(stage, '❓')
    print(f"  {icon} [{r['code']}] {r['name']} → {stage}")

print(f"\n{'='*70}")
print("⚠️ 免责声明：本分析仅供学习研究，不构成投资建议。")
print("="*70)
