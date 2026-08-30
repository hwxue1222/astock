#!/usr/bin/env python3
"""
五阶段综合分析 v2.0 — 优化流程：先看最近5天生命线，无则停止分析
步骤：
1. 最近5天有生命线？ → 有则继续 / 无则结论=低吸
2. 有生命线 → 判断是否跌破开盘价
3. 未跌破 → 判断是洗盘还是拉升

五阶段：低吸 → 试盘 → 洗盘 → 拉升 → 出货
"""
import os, datetime, pandas as pd, AmazingData as ad

ad.login(username='210600007723', password='19781222', host='101.230.159.234', port=8600)
print("✅ 登录成功\n")

STOCKS = {
    '688155.SH': {'name': '先惠技术', 'industry1': '电力设备', 'industry2': '电池/锂电专用设备', 'hot': True, 'concept': '固态电池'},
    '301662.SZ': {'name': '宏工科技', 'industry1': '电力设备', 'industry2': '电池/锂电专用设备', 'hot': True, 'concept': '固态电池'},
    '000777.SZ': {'name': '中核科技', 'industry1': '机械设备', 'industry2': '通用设备/工业阀门', 'hot': False, 'concept': ''},
    '002332.SZ': {'name': '仙琚制药', 'industry1': '医药生物', 'industry2': '化学制药/甾体激素', 'hot': False, 'concept': ''},
    '000153.SZ': {'name': '丰原药业', 'industry1': '医药生物', 'industry2': '化学制药/动物保健', 'hot': False, 'concept': ''},
}

NEWS_DB = {
    '688155.SH': {
        'positive': ['与宁德时代签订约6.84亿元销售合同', '2025上半年营收12.73亿元+8.6%', '拟定增募资不超11.35亿元扩产', '固态电池概念+海外订单'],
        'negative': ['股东减持股份（2025年）'],
        'risk': '股东减持',
    },
    '301662.SZ': {
        'positive': ['2026年7月股票回购计划（60-90万股）', '2026年Q1营收4.72亿元+82%', '宁德时代/比亚迪头部客户', '固态电池概念'],
        'negative': ['2026年8月大股东减持', '2026年4月减持预披露'],
        'risk': '大股东减持',
    },
    '000777.SZ': {
        'positive': [],
        'negative': ['2025年7月终止收购河南核净（重大资产重组失败）', '股权激励2021、2022年解锁失败'],
        'risk': '收购失败+股权质押4条',
    },
    '002332.SZ': {
        'positive': [],
        'negative': ['股权质押/冻结记录17条'],
        'risk': '股权质押17条',
    },
    '000153.SZ': {
        'positive': [],
        'negative': ['股权质押/冻结记录9条'],
        'risk': '股权质押9条',
    },
}

start_int, end_int = 20260701, 20260829
dates = [int(d.strftime('%Y%m%d')) for d in pd.date_range(start='20260701', end='20260829', freq='D')]
dates = [int(d.strftime('%Y%m%d')) for d in pd.date_range(start='20260301', end='20260829', freq='D')]
md = ad.MarketData(dates)

def get_kline(code):
    result = md.query_kline(code_list=[code], begin_date=start_int, end_date=end_int)
    if code not in result: return None
    df_min = result[code]
    df_min['date'] = pd.to_datetime(df_min['kline_time']).dt.date
    df = df_min.groupby('date').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum'})
    df = df.reset_index()
    df['date'] = pd.to_datetime(df['date'])
    df = df.set_index('date').sort_index()
    return df

abnormal_list = []

for code, info in STOCKS.items():
    name = info['name']
    print(f"\n{'='*70}")
    print(f"📈 [{code}] {name}")
    print('='*70)
    
    # 宏观/利好利空（始终显示）
    print(f"\n  🏭 行业: {info['industry1']} / {info['industry2']}")
    print(f"     热度: {'🔥 热门' if info['hot'] else '⚪ 一般'}  概念: {info['concept'] or '无'}")
    
    news = NEWS_DB.get(code, {'positive':[], 'negative':[], 'risk':''})
    if news['positive']:
        print(f"  ✅ 利好: {', '.join(news['positive'][:2])}{'...' if len(news['positive'])>2 else ''}")
    if news['negative']:
        print(f"  ⚠️ 利空: {', '.join(news['negative'][:2])}{'...' if len(news['negative'])>2 else ''}")
    if news['risk']:
        print(f"  🔴 风险: {news['risk']}")
    
    # 获取数据
    df = get_kline(code)
    if df is None or len(df) < 4:
        print(f"\n  ❌ 数据不足")
        continue
    
    print(f"\n  📊 最新: {df.index[-1].date()} 收{df['close'].iloc[-1]:.2f} 量{int(df['volume'].iloc[-1]):,}")
    
    # 计算放量倍数
    df['is_yang'] = df['close'] >= df['open']
    df['vol_d1'] = df['volume'].shift(1)
    df['vol_d2'] = df['volume'].shift(2)
    df['vol_d3'] = df['volume'].shift(3)
    df['vol_max3'] = df[['vol_d1','vol_d2','vol_d3']].max(axis=1)
    df['vol_ratio'] = df['volume'] / df['vol_max3']
    
    # ========== 第一步：最近5天有生命线？ ==========
    recent5 = df.iloc[-5:].copy()
    ll_mask = recent5['is_yang'] & (recent5['vol_ratio'] >= 3.0)
    ll_recent = recent5[ll_mask]
    
    print(f"\n  🔍 【Step1】最近5天生命线扫描")
    
    if len(ll_recent) == 0:
        # 无生命线 → 停止分析
        near = recent5[recent5['is_yang'] & (recent5['vol_ratio'] >= 1.5)]
        if len(near) > 0:
            n = near.iloc[-1]
            print(f"     ⚡ 有接近信号: {n.name.date()} 放量{n['vol_ratio']:.2f}x（未达3倍）")
        else:
            print(f"     ❌ 无生命线信号")
        print(f"\n  📋 【结论】📥 低吸阶段（主力尚未试盘）")
        continue
    
    # ========== 有生命线 → 继续分析 ==========
    ll = ll_recent.iloc[-1]
    ll_date = ll.name.date()
    print(f"     ✅ 生命线确认: {ll_date}")
    print(f"        开{ll['open']:.2f} 收{ll['close']:.2f} 低{ll['low']:.2f} 量{int(ll['volume']):,} 放量{ll['vol_ratio']:.2f}x")
    
    # ========== 第二步：生命线是否有效？（未跌破开盘价） ==========
    print(f"\n  🔍 【Step2】生命线有效性检查")
    after_ll = df.loc[ll.name:].iloc[1:]
    
    if len(after_ll) == 0:
        print(f"     ⏳ 生命线刚出现，尚无后续走势")
        print(f"\n  📋 【结论】🔍 刚刚试盘（观察期）")
        continue
    
    min_low = after_ll['low'].min()
    if min_low < ll['open'] * 0.98:
        print(f"     ❌ 已跌破开盘价: 最低{min_low:.2f} < 开盘价{ll['open']:.2f}")
        print(f"\n  📋 【结论】❌ 生命线失效（主力可能已出货）")
        abnormal_list.append({
            'stock': name, 'code': code, 'type': '生命线跌破开盘价',
            'question': '洗盘还是失效？', 'option_a': '3天内收复则保留', 'option_b': '放弃'
        })
        continue
    
    print(f"     ✅ 有效: 最低{min_low:.2f} >= 开盘价{ll['open']:.2f}")
    
    # ========== 第三步：判断是洗盘还是拉升 ==========
    print(f"\n  🔍 【Step3】洗盘 or 拉升？")
    
    # 找拉升：收盘>生命线收盘 + 量>标杆量 + 阳线
    qz_mask = (after_ll['close'] > ll['close']) & (after_ll['volume'] > ll['volume']) & after_ll['is_yang']
    qz = after_ll[qz_mask]
    
    if len(qz) > 0:
        qz0 = qz.iloc[0]
        print(f"     ✅ 拉升: {qz0.name.date()}")
        print(f"        收{qz0['close']:.2f}(>{ll['close']:.2f}) 量{int(qz0['volume']):,}(>{int(ll['volume']):,})")
        
        # 计算涨幅
        latest = df.iloc[-1]
        rise = (latest['close'] - qz0['close']) / qz0['close'] * 100
        print(f"\n  📋 【结论】🚀 拉升确认（从拉升点涨幅{rise:.1f}%）")
        
        if rise >= 30:
            print(f"        ⬆️ 已进入拉升后期，关注出货信号")
        elif rise > 0:
            print(f"        🚀 拉升初期，阳线持有")
    else:
        # 检查是否有突破但量不足
        weak = after_ll[(after_ll['close'] > ll['close']) & after_ll['is_yang']]
        if len(weak) > 0:
            w = weak.iloc[0]
            print(f"     ⚡ 有阳线突破生命线收盘价: {w.name.date()}")
            print(f"        但量{int(w['volume']):,} < 标杆量{int(ll['volume']):,}，拉升未确认")
            print(f"\n  📋 【结论】🔄 洗盘阶段（接近拉升，量不足）")
        else:
            has_pullback = after_ll['close'].min() < ll['close']
            if has_pullback:
                print(f"     🔄 生命线后回落整理，未破开盘价")
                print(f"\n  📋 【结论】🔄 洗盘阶段")
            else:
                print(f"     ➖ 生命线后横盘整理")
                print(f"\n  📋 【结论】➖ 试盘后整理阶段")

# 异常汇总
if abnormal_list:
    print(f"\n{'='*70}")
    print(f"🚨 异常评估（{len(abnormal_list)}处）")
    print('='*70)
    for i, ab in enumerate(abnormal_list, 1):
        print(f"\n  【异常{i}】[{ab['code']}] {ab['stock']}")
        print(f"  类型: {ab['type']}")
        print(f"  ❓ {ab['question']}")
        print(f"  【A】{ab['option_a']}  【B】{ab['option_b']}")

print(f"\n{'='*70}")
print("⚠️ 免责声明：本分析仅供学习研究，不构成投资建议。")
print("="*70)
