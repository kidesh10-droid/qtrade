"""
QTRADE 자동매매 봇
국내주식 (한국투자증권 OpenAPI) + 미국주식 (Alpaca) + 카카오톡 알림
"""

import time
import schedule
import logging
from datetime import datetime
from config import CONFIG
from korea_trader import KoreaTrader
from us_trader import USTrader
from notifier import KakaoNotifier
from strategy import TradingStrategy

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('qtrade.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)


def run_korea():
    """국내주식 자동매매 실행"""
    if not CONFIG['kis']['app_key']:
        log.warning("한국투자증권 API 키 미설정 — 국내주식 건너뜀")
        return

    log.info("━━━ 국내주식 분석 시작 ━━━")
    trader = KoreaTrader()
    notifier = KakaoNotifier()

    for symbol, name in CONFIG['korea_watchlist'].items():
        try:
            data = trader.get_ohlcv(symbol)
            if data is None or len(data) < 30:
                continue

            strategy = TradingStrategy(data)
            signal = strategy.get_signal()

            log.info(f"[KR] {name}({symbol}) → {signal['type']} | RSI:{signal['rsi']:.1f} | 이유:{signal['reason']}")

            if signal['type'] == 'buy':
                budget = CONFIG['korea_budget_per_trade']
                price = data['close'].iloc[-1]
                qty = int(budget / price)
                if qty > 0:
                    result = trader.buy(symbol, qty)
                    msg = f"🟢 [매수] {name}\n가격: {price:,.0f}원\n수량: {qty}주\n사유: {signal['reason']}\nRSI: {signal['rsi']:.1f}"
                    notifier.send(msg)
                    log.info(f"매수 주문: {name} {qty}주 @ {price:,.0f}원")

            elif signal['type'] == 'sell':
                position = trader.get_position(symbol)
                if position and position['qty'] > 0:
                    result = trader.sell(symbol, position['qty'])
                    price = data['close'].iloc[-1]
                    msg = f"🔴 [매도] {name}\n가격: {price:,.0f}원\n수량: {position['qty']}주\n사유: {signal['reason']}\nRSI: {signal['rsi']:.1f}"
                    notifier.send(msg)
                    log.info(f"매도 주문: {name} {position['qty']}주 @ {price:,.0f}원")

        except Exception as e:
            log.error(f"[KR] {name} 처리 오류: {e}")

    log.info("━━━ 국내주식 분석 완료 ━━━")


def run_us():
    """미국주식 자동매매 실행"""
    if not CONFIG['alpaca']['api_key']:
        log.warning("Alpaca API 키 미설정 — 미국주식 건너뜀")
        return

    log.info("━━━ 미국주식 분석 시작 ━━━")
    trader = USTrader()
    notifier = KakaoNotifier()

    for symbol in CONFIG['us_watchlist']:
        try:
            data = trader.get_ohlcv(symbol)
            if data is None or len(data) < 30:
                continue

            strategy = TradingStrategy(data)
            signal = strategy.get_signal()

            log.info(f"[US] {symbol} → {signal['type']} | RSI:{signal['rsi']:.1f} | 이유:{signal['reason']}")

            if signal['type'] == 'buy':
                price = data['close'].iloc[-1]
                budget = CONFIG['us_budget_per_trade']
                qty = int(budget / price)
                if qty > 0:
                    result = trader.buy(symbol, qty)
                    msg = f"🟢 [매수] {symbol}\n가격: ${price:.2f}\n수량: {qty}주\n사유: {signal['reason']}\nRSI: {signal['rsi']:.1f}"
                    notifier.send(msg)
                    log.info(f"매수 주문: {symbol} {qty}주 @ ${price:.2f}")

            elif signal['type'] == 'sell':
                position = trader.get_position(symbol)
                if position and position['qty'] > 0:
                    result = trader.sell(symbol, position['qty'])
                    price = data['close'].iloc[-1]
                    msg = f"🔴 [매도] {symbol}\n가격: ${price:.2f}\n수량: {position['qty']}주\n사유: {signal['reason']}\nRSI: {signal['rsi']:.1f}"
                    notifier.send(msg)
                    log.info(f"매도 주문: {symbol} {position['qty']}주 @ ${price:.2f}")

        except Exception as e:
            log.error(f"[US] {symbol} 처리 오류: {e}")

    log.info("━━━ 미국주식 분석 완료 ━━━")


def send_daily_report():
    """하루 마감 리포트 카카오톡 전송"""
    notifier = KakaoNotifier()
    now = datetime.now().strftime('%Y-%m-%d %H:%M')

    lines = [f"📊 QTRADE 일일 리포트 ({now})\n"]

    # 국내 포지션
    if CONFIG['kis']['app_key']:
        try:
            trader = KoreaTrader()
            balance = trader.get_balance()
            lines.append(f"🇰🇷 국내 계좌")
            lines.append(f"  예수금: {balance.get('cash', 0):,.0f}원")
            lines.append(f"  평가금액: {balance.get('eval', 0):,.0f}원")
            lines.append(f"  손익: {balance.get('pnl', 0):+,.0f}원\n")
        except Exception as e:
            lines.append(f"🇰🇷 국내 계좌 조회 실패: {e}\n")

    # 미국 포지션
    if CONFIG['alpaca']['api_key']:
        try:
            trader = USTrader()
            balance = trader.get_balance()
            lines.append(f"🇺🇸 미국 계좌")
            lines.append(f"  현금: ${balance.get('cash', 0):.2f}")
            lines.append(f"  포트폴리오: ${balance.get('portfolio', 0):.2f}")
            lines.append(f"  일일손익: ${balance.get('day_pnl', 0):+.2f}")
        except Exception as e:
            lines.append(f"🇺🇸 미국 계좌 조회 실패: {e}")

    notifier.send('\n'.join(lines))
    log.info("일일 리포트 전송 완료")


def is_korea_market_open():
    """국내 주식시장 개장 여부 확인 (평일 09:00~15:30)"""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    return (9, 0) <= (now.hour, now.minute) <= (15, 30)


def is_us_market_open():
    """미국 주식시장 개장 여부 확인 (한국시간 기준 23:30~06:00)"""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    h = now.hour
    return h >= 23 or h < 6


if __name__ == '__main__':
    log.info("=" * 50)
    log.info("QTRADE 자동매매 봇 시작")
    log.info(f"국내 감시종목: {list(CONFIG['korea_watchlist'].keys())}")
    log.info(f"미국 감시종목: {CONFIG['us_watchlist']}")
    log.info(f"모의투자 모드: {CONFIG['paper_trading']}")
    log.info("=" * 50)

    # ── 스케줄 설정 ──────────────────────────────
    # 국내: 장 시작 직후, 점심, 장 마감 30분 전
    schedule.every().monday.at("09:05").do(run_korea)
    schedule.every().tuesday.at("09:05").do(run_korea)
    schedule.every().wednesday.at("09:05").do(run_korea)
    schedule.every().thursday.at("09:05").do(run_korea)
    schedule.every().friday.at("09:05").do(run_korea)

    schedule.every().monday.at("12:00").do(run_korea)
    schedule.every().tuesday.at("12:00").do(run_korea)
    schedule.every().wednesday.at("12:00").do(run_korea)
    schedule.every().thursday.at("12:00").do(run_korea)
    schedule.every().friday.at("12:00").do(run_korea)

    schedule.every().monday.at("15:00").do(run_korea)
    schedule.every().tuesday.at("15:00").do(run_korea)
    schedule.every().wednesday.at("15:00").do(run_korea)
    schedule.every().thursday.at("15:00").do(run_korea)
    schedule.every().friday.at("15:00").do(run_korea)

    # 미국: 장 시작 후 (한국시간 23:35), 새벽 02:00
    schedule.every().monday.at("23:35").do(run_us)
    schedule.every().tuesday.at("23:35").do(run_us)
    schedule.every().wednesday.at("23:35").do(run_us)
    schedule.every().thursday.at("23:35").do(run_us)
    schedule.every().friday.at("23:35").do(run_us)

    schedule.every().tuesday.at("02:00").do(run_us)
    schedule.every().wednesday.at("02:00").do(run_us)
    schedule.every().thursday.at("02:00").do(run_us)
    schedule.every().friday.at("02:00").do(run_us)
    schedule.every().saturday.at("02:00").do(run_us)

    # 일일 리포트: 매일 오후 4시
    schedule.every().day.at("16:00").do(send_daily_report)

    log.info("스케줄 등록 완료. 봇 실행 중...")
    notifier = KakaoNotifier()
    notifier.send("🤖 QTRADE 봇이 시작되었습니다!")

    while True:
        schedule.run_pending()
        time.sleep(30)
