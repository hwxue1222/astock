#!/usr/bin/env python3
"""
银河星耀数智本地 Bridge 服务
把银河星耀数智(AmazingData)的K线能力包装成HTTP服务，
供 astock 网页端通过 GALAXY_BRIDGE_URL 调用（多源互补）。

用法:
  pip install AmazingData tgw
  python galaxy_bridge.py          # 默认端口 8601

环境变量:
  AD_USERNAME / AD_PASSWORD / AD_HOST / AD_PORT  银河账号
  GALAXY_BRIDGE_PORT  默认 8601

网页端 API 自动检测 GALAXY_BRIDGE_URL，无需配置即可降级。
"""
import json, os
from datetime import datetime, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

AD_USERNAME = os.getenv('AD_USERNAME', '')
AD_PASSWORD = os.getenv('AD_PASSWORD', '')
AD_HOST = os.getenv('AD_HOST', '')
AD_PORT = int(os.getenv('AD_PORT', '0') or '0')
BRIDGE_PORT = int(os.getenv('GALAXY_BRIDGE_PORT', '8601'))

_ad = None

def get_ad():
    global _ad
    if _ad is None:
        if not AD_USERNAME or not AD_PASSWORD or not AD_HOST or not AD_PORT:
            raise RuntimeError('Missing AD credentials: AD_USERNAME/AD_PASSWORD/AD_HOST/AD_PORT')
        import AmazingData as ad
        ad.login(username=AD_USERNAME, password=AD_PASSWORD, host=AD_HOST, port=AD_PORT)
        _ad = ad
    return _ad


def fetch_kline(code6: str, limit: int):
    """银河K线 → 统一candle格式"""
    ad = get_ad()
    if code6.startswith('6'):
        code = f'{code6}.SH'
    elif code6.startswith(('0', '3')):
        code = f'{code6}.SZ'
    else:
        code = f'{code6}.BJ'

    end = datetime.now()
    start = end - timedelta(days=int(limit * 1.5) + 10)
    dates = [int(d.strftime('%Y%m%d')) for d in pd.date_range(start, end, freq='D')]
    md = ad.MarketData(dates)
    result = md.query_kline(code_list=[code], begin_date=int(start.strftime('%Y%m%d')),
                            end_date=int(end.strftime('%Y%m%d')))
    if code not in result or not len(result[code]):
        return []

    df = result[code].copy()
    df['date'] = pd.to_datetime(df['kline_time']).dt.date
    daily = df.groupby('date').agg(
        open=('open', 'first'), high=('high', 'max'),
        low=('low', 'min'), close=('close', 'last'), volume=('volume', 'sum'),
    ).reset_index().sort_values('date').tail(limit)

    return [
        {
            'ts': str(r.date),
            'open': round(float(r.open), 3),
            'close': round(float(r.close), 3),
            'high': round(float(r.high), 3),
            'low': round(float(r.low), 3),
            'volume': int(r.volume),
        }
        for r in daily.itertuples()
    ]


def fetch_codes(limit: int):
    ad = get_ad()
    base = ad.BaseData()
    df = base.get_code_list(security_type='EXTRA_STOCK_A')
    cols = list(df.columns)
    code_col = next((c for c in cols if 'code' in str(c).lower()), None)
    name_col = next((c for c in cols if 'name' in str(c).lower()), None)
    if code_col is None:
        raise RuntimeError('code_list missing code column')
    rows = []
    for r in df.itertuples(index=False):
        row = r._asdict() if hasattr(r, '_asdict') else dict(zip(cols, r))
        raw = str(row.get(code_col, '')).strip()
        code6 = raw.split('.')[0]
        if len(code6) != 6 or not code6.isdigit():
            continue
        name = str(row.get(name_col, '')).strip() if name_col else ''
        rows.append({'code': code6, 'name': name})
        if len(rows) >= limit:
            break
    return rows


import pandas as pd  # noqa: E402  (银河SDK依赖)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/health':
            self._json({'ok': True, 'service': 'galaxy-bridge', 'ad': bool(AD_USERNAME and AD_HOST and AD_PORT)})
            return
        if parsed.path == '/kline':
            qs = parse_qs(parsed.query)
            code = (qs.get('code', [''])[0] or '').strip()
            limit = int(qs.get('limit', ['200'])[0] or 200)
            if not code:
                self._json({'error': 'missing code'}, 400)
                return
            try:
                candles = fetch_kline(code, min(limit, 800))
                self._json({'candles': candles, 'source': 'galaxy_mx'})
            except Exception as e:
                self._json({'error': str(e), 'candles': []}, 502)
            return
        if parsed.path == '/codes':
            qs = parse_qs(parsed.query)
            limit = int(qs.get('limit', ['5000'])[0] or 5000)
            try:
                items = fetch_codes(min(limit, 7000))
                self._json({'items': items, 'source': 'galaxy_ad'})
            except Exception as e:
                self._json({'error': str(e), 'items': []}, 502)
            return
        self._json({'error': 'not found'}, 404)

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    print(f'🚀 银河星耀数智 Bridge 启动: http://localhost:{BRIDGE_PORT}')
    print(f'   测试: http://localhost:{BRIDGE_PORT}/health')
    HTTPServer(('127.0.0.1', BRIDGE_PORT), Handler).serve_forever()
