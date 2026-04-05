"""
국내주식 매매 모듈 — 한국투자증권 OpenAPI
"""

import requests
import pandas as pd
from datetime import datetime, timedelta
import logging
from config import CONFIG

log = logging.getLogger(__name__)


class KoreaTrader:
    def __init__(self):
        self.cfg = CONFIG['kis']
        self.paper = CONFIG['paper_trading']
        self._token = None
        self._token_exp = None
        self._get_token()

    def _get_token(self):
        url = f"{self.cfg['base_url']}/oauth2/tokenP"
        body = {
            "grant_type": "client_credentials",
            "appkey": self.cfg['app_key'],
            "appsecret": self.cfg['app_secret']
        }
        try:
            res = requests.post(url, json=body, timeout=10)
            data = res.json()
            self._token = data.get('access_token', '')
            log.info("KIS 토큰 발급 성공")
        except Exception as e:
            log.error(f"KIS 토큰 발급 실패: {e}")
            self._token = ''

    def _headers(self, tr_id: str) -> dict:
        acct = self.cfg['account'].split('-')
        return {
            'content-type': 'application/json',
            'authorization': f'Bearer {self._token}',
            'appkey': self.cfg['app_key'],
            'appsecret': self.cfg['app_secret'],
            'tr_id': tr_id,
        }

    def get_ohlcv(self, symbol: str, days: int = 90) -> pd.DataFrame | None:
        """일봉 데이터 조회"""
        end   = datetime.now().strftime('%Y%m%d')
        start = (datetime.now() - timedelta(days=days)).strftime('%Y%m%d')

        url = f"{self.cfg['base_url']}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice"
        params = {
            'fid_cond_mrkt_div_code': 'J',
            'fid_input_iscd': symbol,
            'fid_input_date_1': start,
            'fid_input_date_2': end,
            'fid_period_div_code': 'D',
            'fid_org_adj_prc': '1',
        }
        headers = self._headers('FHKST03010100')

        try:
            res = requests.get(url, headers=headers, params=params, timeout=10)
            data = res.json()
            rows = data.get('output2', [])
            if not rows:
                return None
            df = pd.DataFrame(rows)
            df = df.rename(columns={
                'stck_bsop_date': 'date',
                'stck_oprc': 'open', 'stck_hgpr': 'high',
                'stck_lwpr': 'low',  'stck_clpr': 'close',
                'acml_vol': 'volume'
            })[['date','open','high','low','close','volume']]
            for col in ['open','high','low','close','volume']:
                df[col] = pd.to_numeric(df[col])
            df['date'] = pd.to_datetime(df['date'])
            return df.sort_values('date').reset_index(drop=True)
        except Exception as e:
            log.error(f"KIS OHLCV 조회 실패 ({symbol}): {e}")
            return None

    def get_price(self, symbol: str) -> float | None:
        url = f"{self.cfg['base_url']}/uapi/domestic-stock/v1/quotations/inquire-price"
        params = {'fid_cond_mrkt_div_code': 'J', 'fid_input_iscd': symbol}
        try:
            res = requests.get(url, headers=self._headers('FHKST01010100'), params=params, timeout=10)
            return float(res.json()['output']['stck_prpr'])
        except:
            return None

    def buy(self, symbol: str, qty: int) -> dict:
        if self.paper:
            log.info(f"[모의매수] {symbol} {qty}주")
            return {'result': 'paper_trade', 'symbol': symbol, 'qty': qty}

        acct_parts = self.cfg['account'].split('-')
        url = f"{self.cfg['base_url']}/uapi/domestic-stock/v1/trading/order-cash"
        body = {
            "CANO": acct_parts[0],
            "ACNT_PRDT_CD": acct_parts[1] if len(acct_parts) > 1 else "01",
            "PDNO": symbol,
            "ORD_DVSN": "01",       # 시장가
            "ORD_QTY": str(qty),
            "ORD_UNPR": "0",
        }
        tr_id = 'VTTC0802U' if self.paper else 'TTTC0802U'
        try:
            res = requests.post(url, headers=self._headers(tr_id), json=body, timeout=10)
            result = res.json()
            log.info(f"매수 주문 결과: {result}")
            return result
        except Exception as e:
            log.error(f"매수 주문 실패: {e}")
            return {}

    def sell(self, symbol: str, qty: int) -> dict:
        if self.paper:
            log.info(f"[모의매도] {symbol} {qty}주")
            return {'result': 'paper_trade', 'symbol': symbol, 'qty': qty}

        acct_parts = self.cfg['account'].split('-')
        url = f"{self.cfg['base_url']}/uapi/domestic-stock/v1/trading/order-cash"
        body = {
            "CANO": acct_parts[0],
            "ACNT_PRDT_CD": acct_parts[1] if len(acct_parts) > 1 else "01",
            "PDNO": symbol,
            "ORD_DVSN": "01",
            "ORD_QTY": str(qty),
            "ORD_UNPR": "0",
            "SLL_TYPE": "01",
        }
        tr_id = 'VTTC0801U' if self.paper else 'TTTC0801U'
        try:
            res = requests.post(url, headers=self._headers(tr_id), json=body, timeout=10)
            result = res.json()
            log.info(f"매도 주문 결과: {result}")
            return result
        except Exception as e:
            log.error(f"매도 주문 실패: {e}")
            return {}

    def get_position(self, symbol: str) -> dict | None:
        """보유 수량 조회"""
        acct_parts = self.cfg['account'].split('-')
        url = f"{self.cfg['base_url']}/uapi/domestic-stock/v1/trading/inquire-balance"
        params = {
            "CANO": acct_parts[0],
            "ACNT_PRDT_CD": acct_parts[1] if len(acct_parts) > 1 else "01",
            "AFHR_FLPR_YN": "N", "OFL_YN": "N", "INQR_DVSN": "02",
            "UNPR_DVSN": "01", "FUND_STTL_ICLD_YN": "N",
            "FNCG_AMT_AUTO_RDPT_YN": "N", "PRCS_DVSN": "00", "CTX_AREA_FK100": "", "CTX_AREA_NK100": ""
        }
        tr_id = 'VTTC8434R' if self.paper else 'TTTC8434R'
        try:
            res = requests.get(url, headers=self._headers(tr_id), params=params, timeout=10)
            items = res.json().get('output1', [])
            for item in items:
                if item.get('pdno') == symbol:
                    return {'symbol': symbol, 'qty': int(item.get('hldg_qty', 0))}
        except Exception as e:
            log.error(f"포지션 조회 실패: {e}")
        return None

    def get_balance(self) -> dict:
        """잔고 조회"""
        acct_parts = self.cfg['account'].split('-')
        url = f"{self.cfg['base_url']}/uapi/domestic-stock/v1/trading/inquire-balance"
        params = {
            "CANO": acct_parts[0],
            "ACNT_PRDT_CD": acct_parts[1] if len(acct_parts) > 1 else "01",
            "AFHR_FLPR_YN": "N", "OFL_YN": "N", "INQR_DVSN": "02",
            "UNPR_DVSN": "01", "FUND_STTL_ICLD_YN": "N",
            "FNCG_AMT_AUTO_RDPT_YN": "N", "PRCS_DVSN": "00", "CTX_AREA_FK100": "", "CTX_AREA_NK100": ""
        }
        tr_id = 'VTTC8434R' if self.paper else 'TTTC8434R'
        try:
            res = requests.get(url, headers=self._headers(tr_id), params=params, timeout=10)
            data = res.json()
            output2 = data.get('output2', [{}])[0]
            return {
                'cash': float(output2.get('dnca_tot_amt', 0)),
                'eval': float(output2.get('scts_evlu_amt', 0)),
                'pnl':  float(output2.get('evlu_pfls_smtl_amt', 0)),
            }
        except Exception as e:
            log.error(f"잔고 조회 실패: {e}")
            return {}
