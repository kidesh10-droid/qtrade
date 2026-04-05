"""
미국주식 매매 모듈 — Alpaca API (무료 Paper Trading 지원)
"""

import requests
import pandas as pd
from datetime import datetime, timedelta
import logging
from config import CONFIG

log = logging.getLogger(__name__)


class USTrader:
    def __init__(self):
        self.cfg = CONFIG['alpaca']
        self.paper = CONFIG['paper_trading']
        self.base = self.cfg['base_url']
        self.data_base = 'https://data.alpaca.markets'
        self.headers = {
            'APCA-API-KEY-ID':     self.cfg['api_key'],
            'APCA-API-SECRET-KEY': self.cfg['api_secret'],
            'Content-Type': 'application/json',
        }

    def get_ohlcv(self, symbol: str, days: int = 90) -> pd.DataFrame | None:
        """일봉 데이터 조회"""
        end   = datetime.now().strftime('%Y-%m-%d')
        start = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        url = f"{self.data_base}/v2/stocks/{symbol}/bars"
        params = {
            'timeframe': '1Day',
            'start': start,
            'end': end,
            'limit': 100,
            'feed': 'iex',
        }
        try:
            res = requests.get(url, headers=self.headers, params=params, timeout=10)
            bars = res.json().get('bars', [])
            if not bars:
                return None
            df = pd.DataFrame(bars)
            df = df.rename(columns={'t':'date','o':'open','h':'high','l':'low','c':'close','v':'volume'})
            df['date'] = pd.to_datetime(df['date'])
            for col in ['open','high','low','close','volume']:
                df[col] = pd.to_numeric(df[col])
            return df.sort_values('date').reset_index(drop=True)
        except Exception as e:
            log.error(f"Alpaca OHLCV 조회 실패 ({symbol}): {e}")
            return None

    def get_price(self, symbol: str) -> float | None:
        url = f"{self.data_base}/v2/stocks/{symbol}/trades/latest"
        try:
            res = requests.get(url, headers=self.headers, timeout=10)
            return float(res.json()['trade']['p'])
        except:
            return None

    def buy(self, symbol: str, qty: int) -> dict:
        if self.paper:
            log.info(f"[모의매수] {symbol} {qty}주")

        url = f"{self.base}/v2/orders"
        body = {
            'symbol': symbol,
            'qty': str(qty),
            'side': 'buy',
            'type': 'market',
            'time_in_force': 'day',
        }
        try:
            res = requests.post(url, headers=self.headers, json=body, timeout=10)
            result = res.json()
            log.info(f"Alpaca 매수 주문: {result.get('id','?')} | {symbol} {qty}주")
            return result
        except Exception as e:
            log.error(f"Alpaca 매수 실패: {e}")
            return {}

    def sell(self, symbol: str, qty: int) -> dict:
        if self.paper:
            log.info(f"[모의매도] {symbol} {qty}주")

        url = f"{self.base}/v2/orders"
        body = {
            'symbol': symbol,
            'qty': str(qty),
            'side': 'sell',
            'type': 'market',
            'time_in_force': 'day',
        }
        try:
            res = requests.post(url, headers=self.headers, json=body, timeout=10)
            result = res.json()
            log.info(f"Alpaca 매도 주문: {result.get('id','?')} | {symbol} {qty}주")
            return result
        except Exception as e:
            log.error(f"Alpaca 매도 실패: {e}")
            return {}

    def get_position(self, symbol: str) -> dict | None:
        url = f"{self.base}/v2/positions/{symbol}"
        try:
            res = requests.get(url, headers=self.headers, timeout=10)
            if res.status_code == 404:
                return None
            data = res.json()
            return {
                'symbol': symbol,
                'qty': int(float(data.get('qty', 0))),
                'avg_price': float(data.get('avg_entry_price', 0)),
                'pnl': float(data.get('unrealized_pl', 0)),
            }
        except Exception as e:
            log.error(f"Alpaca 포지션 조회 실패: {e}")
            return None

    def get_balance(self) -> dict:
        url = f"{self.base}/v2/account"
        try:
            res = requests.get(url, headers=self.headers, timeout=10)
            data = res.json()
            return {
                'cash':      float(data.get('cash', 0)),
                'portfolio': float(data.get('portfolio_value', 0)),
                'day_pnl':   float(data.get('equity', 0)) - float(data.get('last_equity', 0)),
            }
        except Exception as e:
            log.error(f"Alpaca 잔고 조회 실패: {e}")
            return {}

    def get_all_positions(self) -> list:
        url = f"{self.base}/v2/positions"
        try:
            res = requests.get(url, headers=self.headers, timeout=10)
            return res.json()
        except:
            return []
