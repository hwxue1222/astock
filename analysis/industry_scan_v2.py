#!/usr/bin/env python3
"""获取股票行业分类和成分股信息"""
import pandas as pd, AmazingData as ad

ad.login(username='210600007723', password='19781222', host='101.230.159.234', port=8600)
print("✅ 登录成功\n")

STOCKS = {
    '688155.SH': '先惠技术',
    '301662.SZ': '宏工科技',
    '000777.SZ': '中核科技',
    '002332.SZ': '仙琚制药',
    '000153.SZ': '丰原药业',
}

codes = list(STOCKS.keys())

from AmazingData.query_api.info_data import InfoData
info = InfoData()

# 1. 获取行业成分股（看股票属于哪些行业）
print("="*70)
print("🏭 股票行业分类")
print("="*70)
try:
    # get_industry_constituent 可能需要行业代码
    # 先获取全部行业
    industries = info.get_industry_base_info()
    print(f"  共有 {len(industries)} 个行业分类")
    print(f"  行业层级: {industries['LEVEL_TYPE'].unique() if 'LEVEL_TYPE' in industries.columns else 'N/A'}")
    
    # 查看数据结构
    print(f"\n  行业表示例:")
    print(industries.head(3).to_string())
    
except Exception as e:
    print(f"  失败: {e}")
    import traceback
    traceback.print_exc()

# 2. 尝试获取行业成分股
print(f"\n{'='*70}")
print("📊 行业成分股查询")
print("="*70)
try:
    # 尝试获取一些主要行业的成分股
    # 申万一级行业代码通常是数字
    # 尝试用 get_industry_constituent
    constituents = info.get_industry_constituent()
    print(f"  成分股数据条数: {len(constituents)}")
    if len(constituents) > 0:
        print(f"  列名: {list(constituents.columns)}")
        # 筛选5只股票
        if 'MARKET_CODE' in constituents.columns:
            stock_const = constituents[constituents['MARKET_CODE'].isin(codes)]
            for code in codes:
                code_const = stock_const[stock_const['MARKET_CODE'] == code]
                if len(code_const) > 0:
                    print(f"\n  [{code}] {STOCKS[code]}:")
                    for _, row in code_const.iterrows():
                        print(f"    行业: {row.get('INDUSTRY_NAME', 'N/A')} ({row.get('INDUSTRY_CODE', 'N/A')})")
except Exception as e:
    print(f"  失败: {e}")

# 3. 尝试行业日线
print(f"\n{'='*70}")
print("💰 行业日线数据")
print("="*70)
try:
    # 需要行业代码
    # 先获取一些主要行业代码
    if len(industries) > 0 and 'INDEX_CODE' in industries.columns:
        sample_codes = industries['INDEX_CODE'].head(10).tolist()
        print(f"  尝试获取行业: {sample_codes}")
        ind_daily = info.get_industry_daily(code_list=sample_codes)
        print(f"  数据条数: {len(ind_daily)}")
        if len(ind_daily) > 0:
            print(f"  列名: {list(ind_daily.columns)}")
            print(ind_daily.tail(5).to_string())
except Exception as e:
    print(f"  失败: {e}")
    import traceback
    traceback.print_exc()

print(f"\n{'='*70}")
print("⚠️ 免责声明：本分析仅供学习研究，不构成投资建议。")
print("="*70)
