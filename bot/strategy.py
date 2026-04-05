"""
매매 전략 모듈
RSI + 이동평균 골든/데드크로스 + 볼린저밴드 복합 신호
"""

import pandas as pd
import numpy as np
from config import CONFIG


class TradingStrategy:
    def __init__(self, df: pd.DataFrame):
        """
        df: open, high, low, close, volume 컬럼이 있는 DataFrame
        """
        self.df = df.copy()
        self.cfg = CONFIG['strategy']
        self._calc_indicators()

    def _calc_indicators(self):
        df = self.df
        # RSI
        delta = df['close'].diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.ewm(com=self.cfg['rsi_period']-1, adjust=False).mean()
        avg_loss = loss.ewm(com=self.cfg['rsi_period']-1, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, 1e-9)
        df['rsi'] = 100 - 100 / (1 + rs)

        # 이동평균
        df['sma5']  = df['close'].rolling(self.cfg['sma_short']).mean()
        df['sma20'] = df['close'].rolling(self.cfg['sma_long']).mean()

        # 볼린저밴드
        df['bb_mid'] = df['close'].rolling(self.cfg['bb_period']).mean()
        std = df['close'].rolling(self.cfg['bb_period']).std()
        df['bb_up'] = df['bb_mid'] + self.cfg['bb_std'] * std
        df['bb_dn'] = df['bb_mid'] - self.cfg['bb_std'] * std

        # MACD
        ema12 = df['close'].ewm(span=12, adjust=False).mean()
        ema26 = df['close'].ewm(span=26, adjust=False).mean()
        df['macd'] = ema12 - ema26
        df['macd_sig'] = df['macd'].ewm(span=9, adjust=False).mean()
        df['macd_hist'] = df['macd'] - df['macd_sig']

        self.df = df

    def get_signal(self) -> dict:
        df = self.df
        cur  = df.iloc[-1]
        prev = df.iloc[-2]

        buy_score  = 0
        sell_score = 0
        reasons    = []

        # ── RSI ─────────────────────────────────
        if cur['rsi'] < self.cfg['rsi_buy']:
            buy_score += 2
            reasons.append(f"RSI 과매도({cur['rsi']:.1f})")
        elif cur['rsi'] > self.cfg['rsi_sell']:
            sell_score += 2
            reasons.append(f"RSI 과매수({cur['rsi']:.1f})")

        # ── 골든/데드 크로스 ─────────────────────
        if prev['sma5'] < prev['sma20'] and cur['sma5'] >= cur['sma20']:
            buy_score += 3
            reasons.append("골든크로스")
        elif prev['sma5'] > prev['sma20'] and cur['sma5'] <= cur['sma20']:
            sell_score += 3
            reasons.append("데드크로스")

        # ── 볼린저밴드 ───────────────────────────
        if cur['low'] < cur['bb_dn'] and cur['close'] > cur['bb_dn']:
            buy_score += 1
            reasons.append("볼린저 하단 반등")
        elif cur['high'] > cur['bb_up'] and cur['close'] < cur['bb_up']:
            sell_score += 1
            reasons.append("볼린저 상단 이탈")

        # ── MACD 방향 ────────────────────────────
        if cur['macd_hist'] > 0 and prev['macd_hist'] <= 0:
            buy_score += 1
            reasons.append("MACD 상향전환")
        elif cur['macd_hist'] < 0 and prev['macd_hist'] >= 0:
            sell_score += 1
            reasons.append("MACD 하향전환")

        # ── 종합 판단 ────────────────────────────
        min_score = self.cfg['min_signal_score']
        signal_type = 'hold'
        if buy_score >= min_score and buy_score > sell_score:
            signal_type = 'buy'
        elif sell_score >= min_score and sell_score > buy_score:
            signal_type = 'sell'

        return {
            'type':       signal_type,
            'buy_score':  buy_score,
            'sell_score': sell_score,
            'rsi':        cur['rsi'],
            'reason':     ' + '.join(reasons) if reasons else '신호 없음',
            'price':      cur['close'],
            'sma5':       cur['sma5'],
            'sma20':      cur['sma20'],
            'bb_up':      cur['bb_up'],
            'bb_dn':      cur['bb_dn'],
        }
