#!/usr/bin/env python3
"""
腾讯财经 API 工具模块
查询股票流通市值、精确计算换手率
"""
import urllib.request
import urllib.parse
import re
from typing import Dict, Optional

# 腾讯财经行情接口
# URL: https://qt.gtimg.cn/q=sh600519,sz000001
# 返回格式: v_sh600519="1~贵州茅台~600519~1289.85~..."
# 字段说明（以 ~ 分隔）：
#   [0]  未知
#   [1]  股票名称
#   [2]  股票代码
#   [3]  当前价格
#   [6]  成交量（手）
#   [44] 流通市值（亿元）


def ad_code_to_tencent(code: str) -> str:
    """
    将 AmazingData 代码格式转换为腾讯格式
    600519.SH -> sh600519
    000001.SZ -> sz000001
    688123.SH -> sh688123
    300001.SZ -> sz300001
    """
    code = code.strip().upper()
    # 已经是纯数字6位代码
    if re.match(r'^\d{6}$', code):
        if code.startswith('6'):
            return f'sh{code}'
        else:
            return f'sz{code}'
    # .SH / .SZ 后缀格式
    if '.SH' in code:
        return f'sh{code.replace(".SH", "")}'
    if '.SZ' in code:
        return f'sz{code.replace(".SZ", "")}'
    # 其他情况尝试推断
    pure = re.sub(r'[^0-9]', '', code)
    if len(pure) == 6:
        if pure.startswith('6'):
            return f'sh{pure}'
        else:
            return f'sz{pure}'
    raise ValueError(f"无法识别股票代码格式: {code}")


def fetch_tencent_quotes(codes: list) -> Dict[str, dict]:
    """
    批量查询腾讯财经行情数据
    :param codes: 股票代码列表（AmazingData 格式，如 ['600519.SH', '000001.SZ']）
    :return: {代码: {name, price, volume_lots, float_market_cap_yi}}
    """
    if not codes:
        return {}

    tencent_codes = [ad_code_to_tencent(c) for c in codes]
    url = f"https://qt.gtimg.cn/q={','.join(tencent_codes)}"

    req = urllib.request.Request(
        url=url,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )

    try:
        data = urllib.request.urlopen(req, timeout=15).read().decode('gbk', errors='replace')
    except Exception as e:
        print(f"⚠️ 腾讯财经请求失败: {e}")
        return {}

    result = {}
    for line in data.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        # 解析: v_sh600519="1~贵州茅台~600519~..."
        m = re.match(r'v_([a-z]{2}\d{6})="([^"]*)"', line)
        if not m:
            continue

        tcode = m.group(1)  # sh600519
        fields = m.group(2).split('~')

        if len(fields) < 45:
            continue

        # 将腾讯代码转回 AD 格式
        pure = tcode[2:]
        if tcode.startswith('sh'):
            ad_code = f'{pure}.SH'
        else:
            ad_code = f'{pure}.SZ'

        try:
            price = float(fields[3]) if fields[3] else 0.0
            volume_lots = int(fields[6]) if fields[6] else 0
            float_market_cap_yi = float(fields[44]) if fields[44] else 0.0
        except (ValueError, IndexError):
            continue

        result[ad_code] = {
            'name': fields[1],
            'price': price,
            'volume_lots': volume_lots,
            'float_market_cap_yi': float_market_cap_yi,
        }

    return result


def calc_turnover(volume: float, price: float, float_market_cap_yi: float) -> Optional[float]:
    """
    计算精确换手率
    :param volume: 成交量（股）
    :param price: 当前价格（元）
    :param float_market_cap_yi: 流通市值（亿元）
    :return: 换手率（%），如 1.5 表示 1.5%
    """
    if not float_market_cap_yi or float_market_cap_yi <= 0:
        return None
    if not price or price <= 0:
        return None
    # 换手率 = 成交额 / 流通市值
    # 成交额 = 成交量(股) * 价格
    # 流通市值 = float_market_cap_yi * 1亿元
    turnover = (volume * price) / (float_market_cap_yi * 100_000_000) * 100
    return round(turnover, 4)


def calc_turnover_from_lots(volume_lots: int, price: float, float_market_cap_yi: float) -> Optional[float]:
    """
    从成交量（手）计算精确换手率
    :param volume_lots: 成交量（手），1手=100股
    """
    return calc_turnover(volume_lots * 100, price, float_market_cap_yi)


def get_float_shares_dict(codes: list, batch_size: int = 50) -> Dict[str, float]:
    """
    批量获取流通市值（亿元），返回 {代码: 流通市值}
    :param codes: 股票代码列表（AD格式）
    :param batch_size: 每批查询数量（腾讯财经支持批量查询）
    :return: {代码: 流通市值(亿元)}
    """
    result = {}
    for i in range(0, len(codes), batch_size):
        batch = codes[i:i + batch_size]
        quotes = fetch_tencent_quotes(batch)
        for code, info in quotes.items():
            result[code] = info['float_market_cap_yi']
    return result


if __name__ == '__main__':
    # 测试
    test_codes = ['600519.SH', '000001.SZ', '688155.SH', '300750.SZ']
    print("测试腾讯财经查询:")
    quotes = fetch_tencent_quotes(test_codes)
    for code, info in quotes.items():
        print(f"  {code}: {info['name']} | 价:{info['price']} | 流通市值:{info['float_market_cap_yi']}亿")

    # 测试换手率计算
    print("\n测试换手率计算:")
    to = calc_turnover_from_lots(10002, 1289.85, 16124.18)
    print(f"  茅台: 成交量10002手, 价格1289.85, 流通市值16124.18亿 -> 换手率:{to}%")
