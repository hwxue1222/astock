import os
import datetime
import pandas as pd
import AmazingData as ad

ad.login(
    username='210600007723',
    password='19781222',
    host='101.230.159.234',
    port=8600,
)

print("✅ 登录成功\n")

# 分析剩余3只
STOCKS = {
    '000777.SZ': '中核科技',
    '002332.SZ': '仙琚制药',
    '000153.SZ': '丰原药业',
}

start_date_int = 20260301
end_date_int = 20260829

dates = []
for d in pd.date_range(start='20260301', end='20260829', freq='D'):
    dates.append(int(d.strftime('%Y%m%d')))

for code, name in STOCKS.items():
    print(f"\n{'='*60}")
    print(f"🔍 [{code}] {name}")
    
    md = ad.MarketData(dates)
    result = md.query_kline(code_list=[code], begin_date=start_date_int, end_date=end_date_int)
    
    if code not in result:
        print("  ❌ 无数据")
        continue
    
    df_min = result[code]
    df_min['date'] = pd.to_datetime(df_min['kline_time']).dt.date
    daily = df_min.groupby('date').agg({
        'open': 'first', 'high': 'max', 'low': 'min',
        'close': 'last', 'volume': 'sum', 'amount': 'sum',
    }).reset_index()
    daily['date'] = pd.to_datetime(daily['date'])
    daily = daily.set_index('date').sort_index()
    
    print(f"  日K线: {len(daily)} 条")
    
    # 新生命线定义
    daily['is_yang'] = daily['close'] >= daily['open']
    daily['vol_d1'] = daily['volume'].shift(1)
    daily['vol_d2'] = daily['volume'].shift(2)
    daily['vol_d3'] = daily['volume'].shift(3)
    daily['vol_max3'] = daily[['vol_d1', 'vol_d2', 'vol_d3']].max(axis=1)
    daily['vol_ratio'] = daily['volume'] / daily['vol_max3']
    
    analysis_df = daily.iloc[:-3].copy()
    ll_mask = analysis_df['is_yang'] & (analysis_df['vol_ratio'] >= 3.0)
    ll = analysis_df[ll_mask]
    
    print(f"  生命线数量: {len(ll)}")
    
    if len(ll) == 0:
        near = analysis_df[analysis_df['is_yang'] & (analysis_df['vol_ratio'] >= 2.0)]
        print(f"  2倍以上阳线数量: {len(near)}")
        if len(near) > 0:
            print(f"  最近接近生命线: {near.index[-1].date()}, 放量{near.iloc[-1]['vol_ratio']:.2f}x")
        print(f"  📥 结论: 低吸阶段，未出现生命线")
    else:
        latest_ll = ll.iloc[-1]
        ll_date = latest_ll.name.date()
        print(f"  最近生命线: {ll_date}")
        print(f"    开:{latest_ll['open']:.2f} 收:{latest_ll['close']:.2f} 低:{latest_ll['low']:.2f} 高:{latest_ll['high']:.2f}")
        print(f"    量:{int(latest_ll['volume']):,} 放量:{latest_ll['vol_ratio']:.2f}x")
        
        after = daily.loc[latest_ll.name:].iloc[1:]
        if len(after) > 0:
            min_low = after['low'].min()
            breakdown = min_low < latest_ll['low'] * 0.98
            print(f"    生命线后最低: {min_low:.2f}, 跌破: {'是' if breakdown else '否'}")
            
            qz_mask = (after['close'] > latest_ll['close']) & after['is_yang'] & (after['vol_ratio'] >= 2.0)
            qz = after[qz_mask]
            if len(qz) > 0:
                qz0 = qz.iloc[0]
                print(f"    起涨点: {qz0.name.date()}, 收:{qz0['close']:.2f}, 放量:{qz0['vol_ratio']:.2f}x")
                rise = (daily.iloc[-1]['close'] - qz0['close']) / qz0['close'] * 100
                print(f"    从起涨点涨幅: {rise:.1f}%")
                if rise >= 30:
                    print(f"    ⚠️ 拉升超30%，关注是否出货")
                else:
                    print(f"    ⬆️ 拉升中")
            else:
                if after['close'].min() < latest_ll['close'] and min_low >= latest_ll['low'] * 0.98:
                    print(f"    🔄 结论: 洗盘震仓中（未破生命线）")
                else:
                    print(f"    ⏳ 结论: 试盘后整理")
        else:
            print(f"    🔍 刚刚试盘")

print("\n✅ 分析完成")
