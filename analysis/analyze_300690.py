#!/usr/bin/env python3
"""快速分析单只股票 300690"""
import pandas as pd, AmazingData as ad

ad.login(username='210600007723', password='19781222', host='101.230.159.234', port=8600)
print("✅ 登录成功\n")

CODE = '300690.SZ'
NAME = '双一科技'

start_int, end_int = 20260701, 20260829
dates = [int(d.strftime('%Y%m%d')) for d in pd.date_range(start='20260701', end='20260829', freq='D')]
dates = [int(d.strftime('%Y%m%d')) for d in pd.date_range(start='20260301', end='20260829', freq='D')]
md = ad.MarketData(dates)

print(f"{'='*70}")
print(f"📈 [{CODE}] {NAME}")
print('='*70)

result = md.query_kline(code_list=[CODE], begin_date=start_int, end_date=end_int)
if CODE not in result:
    print("❌ 无数据")
    exit()

df_min = result[CODE]
df_min['date'] = pd.to_datetime(df_min['kline_time']).dt.date
df = df_min.groupby('date').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum'})
df = df.reset_index()
df['date'] = pd.to_datetime(df['date'])
df = df.set_index('date').sort_index()

print(f"\n  📊 数据: {len(df)} 个交易日 ({df.index[0].date()} ~ {df.index[-1].date()})")
print(f"  最新: {df.index[-1].date()} 收{df['close'].iloc[-1]:.2f} 量{int(df['volume'].iloc[-1]):,}")

# 计算
df['is_yang'] = df['close'] >= df['open']
df['vol_d1'] = df['volume'].shift(1)
df['vol_d2'] = df['volume'].shift(2)
df['vol_d3'] = df['volume'].shift(3)
df['vol_max3'] = df[['vol_d1','vol_d2','vol_d3']].max(axis=1)
df['vol_ratio'] = df['volume'] / df['vol_max3']

# Step1: 最近5天生命线
recent5 = df.iloc[-5:].copy()
ll_mask = recent5['is_yang'] & (recent5['vol_ratio'] >= 3.0)
ll_recent = recent5[ll_mask]

print(f"\n  🔍 【Step1】最近5天生命线扫描")

if len(ll_recent) == 0:
    near = recent5[recent5['is_yang'] & (recent5['vol_ratio'] >= 1.5)]
    if len(near) > 0:
        n = near.iloc[-1]
        print(f"     ⚡ 有接近信号: {n.name.date()} 放量{n['vol_ratio']:.2f}x（未达3倍）")
    else:
        print(f"     ❌ 无生命线信号")
    print(f"\n  📋 【结论】📥 低吸阶段（主力尚未试盘）")
else:
    ll = ll_recent.iloc[-1]
    print(f"     ✅ 生命线确认: {ll.name.date()}")
    print(f"        开{ll['open']:.2f} 收{ll['close']:.2f} 低{ll['low']:.2f} 量{int(ll['volume']):,} 放量{ll['vol_ratio']:.2f}x")
    
    # Step2
    print(f"\n  🔍 【Step2】生命线有效性检查")
    after_ll = df.loc[ll.name:].iloc[1:]
    
    if len(after_ll) == 0:
        print(f"     ⏳ 生命线刚出现")
        print(f"\n  📋 【结论】🔍 刚刚试盘")
    else:
        min_low = after_ll['low'].min()
        if min_low < ll['open'] * 0.98:
            print(f"     ❌ 已跌破开盘价: 最低{min_low:.2f} < 开盘价{ll['open']:.2f}")
            print(f"\n  📋 【结论】❌ 生命线失效")
        else:
            print(f"     ✅ 有效: 最低{min_low:.2f} >= 开盘价{ll['open']:.2f}")
            
            # Step3
            print(f"\n  🔍 【Step3】洗盘 or 拉升？")
            qz_mask = (after_ll['close'] > ll['close']) & (after_ll['volume'] > ll['volume']) & after_ll['is_yang']
            qz = after_ll[qz_mask]
            
            if len(qz) > 0:
                qz0 = qz.iloc[0]
                print(f"     ✅ 拉升: {qz0.name.date()}")
                rise = (df.iloc[-1]['close'] - qz0['close']) / qz0['close'] * 100
                print(f"\n  📋 【结论】🚀 拉升确认（涨幅{rise:.1f}%）")
            else:
                weak = after_ll[(after_ll['close'] > ll['close']) & after_ll['is_yang']]
                if len(weak) > 0:
                    print(f"\n  📋 【结论】🔄 洗盘阶段（接近拉升，量不足）")
                else:
                    print(f"\n  📋 【结论】🔄 洗盘阶段")

print(f"\n{'='*70}")
