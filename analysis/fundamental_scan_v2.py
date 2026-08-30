#!/usr/bin/env python3
"""获取股票基本面+行业+公告信息 v2"""
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

# 1. 股票基本信息
print("="*70)
print("📋 股票基本信息")
print("="*70)
try:
    # get_stock_basic 可能不需要code_list参数
    stock_basic = info.get_stock_basic()
    for code in codes:
        if code in stock_basic:
            df = stock_basic[code]
            if len(df) > 0:
                row = df.iloc[0]
                print(f"\n  [{code}] {STOCKS[code]}")
                for f in ['SECURITY_NAME', 'INDUSTRY_CSRC', 'INDUSTRY_SW', 'LIST_DATE']:
                    if f in row:
                        print(f"    {f}: {row[f]}")
except Exception as e:
    print(f"  获取基本信息失败: {e}")

# 2. 行业分类
print(f"\n{'='*70}")
print("🏭 行业分类")
print("="*70)
try:
    industry = info.get_industry_base_info()
    for code in codes:
        if code in industry:
            df = industry[code]
            if len(df) > 0:
                row = df.iloc[0]
                print(f"\n  [{code}] {STOCKS[code]}")
                for f in ['INDUSTRY_NAME', 'INDUSTRY_CODE']:
                    if f in row:
                        print(f"    {f}: {row[f]}")
except Exception as e:
    print(f"  获取行业分类失败: {e}")

# 3. 公告列表（筛选负面关键词）
print(f"\n{'='*70}")
print("📰 近期公告扫描（负面关键词）")
print("="*70)

try:
    announcements = info.get_announcement_stock_list(code_list=codes)
    if len(announcements) > 0:
        # 负面关键词
        negative_keywords = ['处罚', '立案', '违规', '收购失败', '终止', '亏损', '退市', '警示', '调查', '谴责', '减持', '质押']
        
        for code in codes:
            code_ann = announcements[announcements['MARKET_CODE'] == code]
            if len(code_ann) > 0:
                print(f"\n  [{code}] {STOCKS[code]} - 共{len(code_ann)}条公告")
                
                # 检查负面公告
                neg_found = False
                for _, row in code_ann.iterrows():
                    title = str(row.get('TITLE', ''))
                    for kw in negative_keywords:
                        if kw in title:
                            pub_time = row.get('PUBLISH_TIME', '')
                            time_str = str(pub_time)[:10] if pub_time else 'N/A'
                            print(f"    ⚠️ [{time_str}] {title}")
                            neg_found = True
                            break
                if not neg_found:
                    # 显示最近3条公告标题
                    print(f"    最近公告:")
                    for _, row in code_ann.head(3).iterrows():
                        pub_time = row.get('PUBLISH_TIME', '')
                        time_str = str(pub_time)[:10] if pub_time else 'N/A'
                        print(f"      {time_str} {row.get('TITLE', '')}")
            else:
                print(f"\n  [{code}] {STOCKS[code]} - 无近期公告")
    else:
        print("  无公告数据")
except Exception as e:
    print(f"  获取公告失败: {e}")

print(f"\n{'='*70}")
print("⚠️ 免责声明：本分析仅供学习研究，不构成投资建议。")
print("="*70)
