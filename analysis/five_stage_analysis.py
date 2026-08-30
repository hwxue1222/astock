#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
五阶段交易模型分析脚本
低吸(横盘/缩量) → 试盘(生命线/标杆量) → 洗盘(震仓) → 起涨点 → 出货

规则定义：
1. 低吸：长期处于横盘或缓慢下降，缩量（换手<1.5%，用成交量替代判断）
2. 生命线（试盘）：第一次阳线，成交量≥前3天均量3倍，这天为生命线，成交量为标杆量
3. 震仓（洗盘）：回调不低于上一个阳线的最低价（不跌破生命线）
4. 起涨点：放量且收盘价位于生命线之上
5. 出货：拉升30%以上，放量超过标杆量3倍以上
"""

import os
import sys
import datetime
import pandas as pd
import numpy as np

import AmazingData as ad

# 账号配置
AD_USERNAME = os.environ.get('AD_USERNAME', '210600007723')
AD_PASSWORD = os.environ.get('AD_PASSWORD', '19781222')
AD_HOST = os.environ.get('AD_HOST', '101.230.159.234')
AD_PORT = int(os.environ.get('AD_PORT', '8600'))

# 待分析股票
STOCKS = {
    '688155.SH': '先惠技术',
    '301662.SZ': '宏工科技',
    '000777.SZ': '中核科技',
    '002332.SZ': '仙琚制药',
    '000153.SZ': '丰原药业',
}


def login():
    """登录 AmazingData"""
    ad.login(
        username=AD_USERNAME,
        password=AD_PASSWORD,
        host=AD_HOST,
        port=AD_PORT,
    )
    print(f"✅ 登录成功: {AD_USERNAME}@{AD_HOST}:{AD_PORT}")


def get_daily_kline(stock_code, start_date_int, end_date_int):
    """获取日K线数据（通过分钟数据聚合）"""
    # 生成日期列表作为 calendar
    start_dt = pd.Timestamp(str(start_date_int))
    end_dt = pd.Timestamp(str(end_date_int))
    dates = []
    for d in pd.date_range(start=start_dt, end=end_dt, freq='D'):
        dates.append(int(d.strftime('%Y%m%d')))

    md = ad.MarketData(dates)

    # 获取分钟K线数据
    result = md.query_kline(
        code_list=[stock_code],
        begin_date=start_date_int,
        end_date=end_date_int,
    )

    if stock_code not in result:
        return None

    df_min = result[stock_code]
    if len(df_min) == 0:
        return None

    # 聚合成日K线
    df_min['date'] = pd.to_datetime(df_min['kline_time']).dt.date

    daily = df_min.groupby('date').agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum',
        'amount': 'sum',
    }).reset_index()

    daily['date'] = pd.to_datetime(daily['date'])
    daily = daily.set_index('date')
    daily = daily.sort_index()

    return daily


def analyze_five_stage(df, stock_code, stock_name):
    """
    分析五阶段模型
    """
    if df is None or len(df) < 20:
        return {'error': '数据不足（需至少20个交易日）', 'stage': '数据异常'}

    df = df.copy()

    # 基本计算
    df['is_yang'] = df['close'] >= df['open']
    df['pct_chg'] = df['close'].pct_change() * 100
    df['zhenfu'] = (df['high'] - df['low']) / df['low'] * 100  # 振幅%

    # 成交量均线和放量倍数
    # 生命线定义：成交量 >= 前3天中最高成交量的3倍
    df['vol_d1'] = df['volume'].shift(1)
    df['vol_d2'] = df['volume'].shift(2)
    df['vol_d3'] = df['volume'].shift(3)
    df['vol_max3'] = df[['vol_d1', 'vol_d2', 'vol_d3']].max(axis=1)
    df['vol_ratio'] = df['volume'] / df['vol_max3']  # 当日量/前3天最高量
    df['vol_ma3'] = df['volume'].rolling(window=3).mean()
    df['vol_ratio'] = df['volume'] / df['vol_ma3'].shift(1)  # 当日量/前3日均量

    # 20日价格变异系数（判断横盘）
    df['close_ma20'] = df['close'].rolling(window=20).mean()
    df['close_std20'] = df['close'].rolling(window=20).std()
    df['cv20'] = df['close_std20'] / df['close_ma20'] * 100

    # 20日成交量均值（判断缩量）
    df['vol_ma20'] = df['volume'].rolling(window=20).mean()
    df['vol_ratio_to_ma20'] = df['volume'] / df['vol_ma20']

    latest = df.iloc[-1]
    latest_date = str(df.index[-1].date()) if hasattr(df.index[-1], 'date') else str(df.index[-1])

    result = {
        'stock_code': stock_code,
        'stock_name': stock_name,
        'data_count': len(df),
        'date_range': f"{df.index[0].date()} ~ {df.index[-1].date()}" if hasattr(df.index[0], 'date') else f"{df.index[0]} ~ {df.index[-1]}",
        'latest_close': round(latest['close'], 2),
        'latest_date': latest_date,
        'latest_volume': int(latest['volume']),
        'latest_pct_chg': round(latest['pct_chg'], 2) if not pd.isna(latest['pct_chg']) else 0,
    }

    # ========== 阶段1：识别生命线（试盘） ==========
    # 生命线定义：阳线 + 成交量 >= 前3天均量3倍
    # 排除最近3天（避免用未完成的信号）
    analysis_df = df.iloc[:-3].copy() if len(df) > 3 else df.copy()

    life_line_mask = analysis_df['is_yang'] & (analysis_df['vol_ratio'] >= 3.0)
    life_lines = analysis_df[life_line_mask].copy()

    if len(life_lines) == 0:
        # 检查是否有接近生命线的信号
        near_life = analysis_df[analysis_df['is_yang'] & (analysis_df['vol_ratio'] >= 2.0)]
        if len(near_life) > 0:
            nl = near_life.iloc[-1]
            result['stage'] = '低吸（接近试盘）'
            result['analysis'] = f"近期出现放量阳线（{nl.name.date()}, 放量{nl['vol_ratio']:.1f}x），但未达生命线标准（3倍）"
            result['suggestion'] = '⏳ 观察期，等待明确试盘信号（阳线+3倍放量）'
        else:
            result['stage'] = '低吸（未出现生命线）'
            result['analysis'] = '近期未出现明显的试盘阳线，仍处于低吸/建仓阶段'
            result['suggestion'] = '📥 处于吸筹阶段，关注缩量后的放量阳线'

        # 横盘判断
        recent_cv = df['cv20'].tail(10).mean()
        if not pd.isna(recent_cv) and recent_cv < 3:
            result['sideways_note'] = f'近期价格变异系数{recent_cv:.2f}%，波动较小，符合横盘特征'
        recent_vol_ratio = df['vol_ratio_to_ma20'].tail(10).mean()
        if not pd.isna(recent_vol_ratio) and recent_vol_ratio < 0.7:
            result['low_volume_note'] = f'近期成交量萎缩至20日均量的{recent_vol_ratio*100:.0f}%，符合缩量特征'
        return result

    # 取最近的生命线作为参考
    life_line = life_lines.iloc[-1]
    ll_idx = life_line.name
    ll_date = str(ll_idx.date()) if hasattr(ll_idx, 'date') else str(ll_idx)
    ll_close = life_line['close']
    ll_low = life_line['low']
    ll_high = life_line['high']
    ll_vol = life_line['volume']
    ll_open = life_line['open']

    result['life_line_date'] = ll_date
    result['life_line_close'] = round(ll_close, 2)
    result['life_line_low'] = round(ll_low, 2)
    result['life_line_high'] = round(ll_high, 2)
    result['life_line_volume'] = int(ll_vol)
    result['benchmark_volume'] = int(ll_vol)
    result['life_line_vol_ratio'] = round(life_line['vol_ratio'], 2)

    # 生命线后的数据
    after_ll = df.loc[ll_idx:].copy()
    if len(after_ll) <= 1:
        result['stage'] = '刚刚试盘'
        result['analysis'] = f'{ll_date}出现生命线（收盘价{ll_close:.2f}），刚刚试盘，等待后续走势确认'
        result['suggestion'] = '⏳ 刚刚试盘，观察是否震仓洗盘'
        return result

    after_ll_next = after_ll.iloc[1:]  # 生命线之后的K线

    # 检查是否有效跌破生命线最低价（跌破超过2%认为失效）
    min_low_after = after_ll_next['low'].min()
    breakdown_threshold = ll_low * 0.98
    has_breakdown = min_low_after < breakdown_threshold

    if has_breakdown:
        # 生命线已失效，找新的生命线
        new_life_lines = after_ll_next[after_ll_next['is_yang'] & (after_ll_next['vol_ratio'] >= 3.0)]
        if len(new_life_lines) > 0:
            life_line = new_life_lines.iloc[-1]
            ll_idx = life_line.name
            ll_date = str(ll_idx.date()) if hasattr(ll_idx, 'date') else str(ll_idx)
            ll_close = life_line['close']
            ll_low = life_line['low']
            ll_vol = life_line['volume']
            result['life_line_date'] = ll_date
            result['life_line_close'] = round(ll_close, 2)
            result['life_line_low'] = round(ll_low, 2)
            result['benchmark_volume'] = int(ll_vol)
            after_ll = df.loc[ll_idx:].copy()
            after_ll_next = after_ll.iloc[1:]
            has_breakdown = after_ll_next['low'].min() < ll_low * 0.98
        else:
            result['stage'] = '低吸（生命线已失效）'
            result['analysis'] = f'原生命线{ll_date}已被跌破（最低{min_low_after:.2f} < 生命线低点{ll_low:.2f}），等待新的试盘信号'
            result['suggestion'] = '📥 主力可能重新吸筹，等待新的生命线出现'
            return result

    result['min_low_after_ll'] = round(after_ll_next['low'].min(), 2)
    result['max_high_after_ll'] = round(after_ll_next['high'].max(), 2)

    # ========== 阶段2：判断起涨点 ==========
    # 起涨点定义：阳线 + 收盘价在生命线之上 + 放量（vol_ratio >= 2.0）
    qizhang_mask = (
        (after_ll_next['close'] > ll_close) &
        (after_ll_next['is_yang']) &
        (after_ll_next['vol_ratio'] >= 2.0)
    )
    qizhang_points = after_ll_next[qizhang_mask]
    has_qizhang = len(qizhang_points) > 0

    # 也检查是否有收盘价突破生命线但放量的信号
    breakout_mask = (
        (after_ll_next['close'] > ll_close) &
        (after_ll_next['is_yang'])
    )
    breakouts = after_ll_next[breakout_mask]

    if has_qizhang:
        qz = qizhang_points.iloc[0]
        qz_idx = qz.name
        result['qizhang_date'] = str(qz_idx.date()) if hasattr(qz_idx, 'date') else str(qz_idx)
        result['qizhang_close'] = round(qz['close'], 2)
        result['qizhang_vol_ratio'] = round(qz['vol_ratio'], 2)

    # ========== 阶段3：判断拉升/出货 ==========
    latest_price = latest['close']
    latest_vol = latest['volume']

    if has_qizhang:
        qz_price = qizhang_points.iloc[0]['close']
        rise_pct = (latest_price - qz_price) / qz_price * 100
        vol_ratio_to_benchmark = latest_vol / ll_vol if ll_vol > 0 else 0

        result['rise_from_qizhang'] = round(rise_pct, 2)
        result['latest_vol_ratio_to_benchmark'] = round(vol_ratio_to_benchmark, 2)

        if rise_pct >= 30 and vol_ratio_to_benchmark >= 3:
            result['stage'] = '出货'
            result['analysis'] = f"从起涨点{result['qizhang_date']}（{qz_price:.2f}）已拉升{rise_pct:.1f}%，最新成交量为标杆量的{vol_ratio_to_benchmark:.1f}倍，符合出货特征"
            result['suggestion'] = '⚠️ 警惕出货风险，考虑分批减仓'
        elif rise_pct >= 30:
            result['stage'] = '拉升后期（接近出货）'
            result['analysis'] = f"从起涨点已拉升{rise_pct:.1f}%，但成交量为标杆量的{vol_ratio_to_benchmark:.1f}倍，尚未达到出货标准（3倍）"
            result['suggestion'] = '⚡ 涨幅已大，关注成交量变化，若放量超标杆量3倍需警惕出货'
        elif rise_pct > 10:
            result['stage'] = '拉升中'
            result['analysis'] = f"从起涨点{result['qizhang_date']}已拉升{rise_pct:.1f}%，处于拉升阶段"
            result['suggestion'] = '⬆️ 持股待涨，关注30%涨幅和成交量3倍标杆量信号'
        elif rise_pct > 0:
            result['stage'] = '起涨初期'
            result['analysis'] = f"起涨点{result['qizhang_date']}后上涨{rise_pct:.1f}%，拉升初期"
            result['suggestion'] = '🚀 刚起涨，可继续持有观察'
        else:
            # 起涨点后又回落了，检查是否震仓
            min_after_qz = df.loc[qizhang_points.iloc[0].name:]['low'].min()
            if min_after_qz >= ll_low * 0.98:
                result['stage'] = '洗盘（震仓）'
                result['analysis'] = f"起涨点{result['qizhang_date']}后回落震仓，未破生命线{ll_low:.2f}"
                result['suggestion'] = '🔄 震仓洗盘中，不破生命线可持有或逢低加仓'
            else:
                result['stage'] = '低吸（起涨失效）'
                result['analysis'] = f"起涨点已跌破，等待新的信号"
                result['suggestion'] = '📥 重新进入观察期'
    else:
        # 还没有起涨点
        # 检查是否有收盘价在生命线之上的情况
        above_ll = after_ll_next[after_ll_next['close'] > ll_close]

        # 震仓判断：生命线后有回调但不破生命线
        has_pullback = (after_ll_next['close'].min() < ll_close)
        is_shaking = has_pullback and (after_ll_next['low'].min() >= ll_low * 0.98)

        if is_shaking:
            max_pullback_pct = (after_ll_next['close'].min() - ll_close) / ll_close * 100
            result['max_pullback'] = round(max_pullback_pct, 2)
            result['stage'] = '洗盘（震仓）'
            result['analysis'] = f"生命线{ll_date}（{ll_close:.2f}）后回落震仓，最低{result['min_low_after_ll']:.2f}，未破生命线低点{ll_low:.2f}"
            result['suggestion'] = '🔄 震仓洗盘阶段，主力在清洗浮筹，不破生命线可继续持有或逢低关注'
        elif len(above_ll) > 0 and len(above_ll) >= len(after_ll_next) * 0.5:
            # 大部分时间在生命线之上但没有放量起涨
            result['stage'] = '试盘后强势整理'
            result['analysis'] = f"生命线{ll_date}后维持在生命线之上，但未出现放量起涨信号"
            result['suggestion'] = '⏳ 强势整理中，等待放量阳线突破确认起涨'
        else:
            days_after_ll = len(after_ll_next)
            if days_after_ll <= 3:
                result['stage'] = '试盘/观察'
                result['analysis'] = f"{days_after_ll}天前出现生命线（{ll_date}，收盘价{ll_close:.2f}，放量{result['life_line_vol_ratio']:.1f}x），等待后续确认"
                result['suggestion'] = '⏳ 刚刚试盘，观察是否震仓洗盘'
            else:
                result['stage'] = '试盘后整理'
                result['analysis'] = f"生命线{ll_date}（{ll_close:.2f}）后已整理{days_after_ll}天，尚未突破起涨"
                result['suggestion'] = '⏳ 整理期，关注是否放量突破生命线收盘价'

    # 低吸特征补充
    recent_vol_ratio = df['vol_ratio_to_ma20'].tail(10).mean()
    if not pd.isna(recent_vol_ratio):
        result['recent_vol_to_ma20'] = round(recent_vol_ratio, 2)
        if recent_vol_ratio < 0.7:
            result['low_volume_note'] = f'近期成交量萎缩至20日均量的{recent_vol_ratio*100:.0f}%，筹码锁定良好'

    recent_cv = df['cv20'].tail(10).mean()
    if not pd.isna(recent_cv) and recent_cv < 3:
        result['sideways_note'] = f'近期价格变异系数{recent_cv:.2f}%，波动较小，横盘整理中'

    return result


def print_report(results):
    """打印分析报告"""
    print("\n" + "=" * 80)
    print("📊 五阶段交易模型分析报告")
    print("=" * 80)
    print(f"分析时间: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"模型规则: 低吸 → 试盘(生命线) → 洗盘(震仓) → 起涨点 → 出货")
    print("=" * 80)

    for r in results:
        print(f"\n{'─' * 70}")
        code = r['stock_code']
        name = r['stock_name']
        stage = r.get('stage', '未知')

        # 阶段图标
        stage_icons = {
            '低吸（未出现生命线）': '📥',
            '低吸（接近试盘）': '📥',
            '低吸（生命线已失效）': '📥',
            '低吸（起涨失效）': '📥',
            '刚刚试盘': '🔍',
            '试盘/观察': '🔍',
            '试盘后整理': '➖',
            '试盘后强势整理': '➖',
            '洗盘（震仓）': '🔄',
            '起涨初期': '🚀',
            '拉升中': '⬆️',
            '拉升后期（接近出货）': '⬆️⚠️',
            '出货': '⚠️',
            '数据异常': '❓',
        }
        icon = stage_icons.get(stage, '❓')

        print(f"\n{icon} [{code}] {name}")
        print(f"   当前阶段: 【{stage}】")

        if 'error' in r:
            print(f"   ❌ 错误: {r['error']}")
            continue

        print(f"   最新收盘价: {r.get('latest_close', 'N/A')} ({r.get('latest_date', '')})")
        print(f"   最新涨跌幅: {r.get('latest_pct_chg', 'N/A')}%")

        if 'life_line_date' in r:
            print(f"   生命线日期: {r['life_line_date']}")
            print(f"   生命线: 开{r.get('life_line_open', 'N/A')} 收{r.get('life_line_close', 'N/A')} 低{r.get('life_line_low', 'N/A')} 高{r.get('life_line_high', 'N/A')}")
            print(f"   标杆量: {r.get('benchmark_volume', 'N/A'):,}")
            print(f"   生命线放量倍数: {r.get('life_line_vol_ratio', 'N/A')}x")

        if 'qizhang_date' in r:
            print(f"   起涨点日期: {r['qizhang_date']}")
            print(f"   起涨点收盘价: {r['qizhang_close']}")
            print(f"   起涨点放量倍数: {r.get('qizhang_vol_ratio', 'N/A')}x")

        if 'rise_from_qizhang' in r:
            print(f"   从起涨点涨幅: {r['rise_from_qizhang']}%")
        if 'latest_vol_ratio_to_benchmark' in r:
            print(f"   最新成交量/标杆量比: {r['latest_vol_ratio_to_benchmark']}x")

        if 'min_low_after_ll' in r:
            print(f"   生命线后最低价: {r['min_low_after_ll']}")
        if 'max_high_after_ll' in r:
            print(f"   生命线后最高价: {r['max_high_after_ll']}")
        if 'max_pullback' in r:
            print(f"   生命线后最大回落: {r['max_pullback']}%")

        if 'recent_vol_to_ma20' in r:
            print(f"   近期成交量/20日均量比: {r['recent_vol_to_ma20']}x")
        if 'low_volume_note' in r:
            print(f"   💡 {r['low_volume_note']}")
        if 'sideways_note' in r:
            print(f"   💡 {r['sideways_note']}")

        print(f"\n   📋 分析: {r.get('analysis', '')}")
        if 'suggestion' in r:
            print(f"   💎 建议: {r.get('suggestion', '')}")

    print("\n" + "=" * 80)
    print("⚠️ 免责声明：本分析仅供学习研究，不构成投资建议。股市有风险，入市需谨慎。")
    print("=" * 80)


def main():
    login()

    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=180)

    end_date_int = int(end_date.strftime('%Y%m%d'))
    start_date_int = int(start_date.strftime('%Y%m%d'))

    print(f"\n📅 数据时间范围: {start_date} ~ {end_date}")
    print(f"📈 分析股票数量: {len(STOCKS)}\n")

    results = []
    for code, name in STOCKS.items():
        print(f"🔍 正在分析: [{code}] {name} ...", end=' ', flush=True)
        try:
            df = get_daily_kline(code, start_date_int, end_date_int)
            if df is not None and len(df) > 0:
                print(f"获取到 {len(df)} 条日K线")
                result = analyze_five_stage(df, code, name)
                results.append(result)
            else:
                print(f"❌ 无数据")
                results.append({
                    'stock_code': code,
                    'stock_name': name,
                    'error': '无法获取数据',
                    'stage': '数据异常'
                })
        except Exception as e:
            print(f"❌ 失败: {e}")
            import traceback
            traceback.print_exc()
            results.append({
                'stock_code': code,
                'stock_name': name,
                'error': str(e),
                'stage': '分析异常'
            })

    print_report(results)
    return results


if __name__ == '__main__':
    main()
