"""
카카오톡 알림 모듈
나에게 카카오톡 메시지 발송 (무료)
"""

import requests
import logging
from config import CONFIG

log = logging.getLogger(__name__)


class KakaoNotifier:
    def __init__(self):
        self.token = CONFIG['kakao']['token']

    def send(self, message: str) -> bool:
        """카카오톡 나에게 메시지 보내기"""
        if not self.token:
            log.warning(f"[카카오 알림 미설정] {message}")
            return False

        url = 'https://kapi.kakao.com/v2/api/talk/memo/default/send'
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        template = {
            "object_type": "text",
            "text": message,
            "link": {"web_url": "", "mobile_web_url": ""},
        }
        import json
        data = {'template_object': json.dumps(template, ensure_ascii=False)}

        try:
            res = requests.post(url, headers=headers, data=data, timeout=10)
            if res.status_code == 200:
                log.info(f"카카오 알림 전송 성공")
                return True
            else:
                log.warning(f"카카오 알림 실패: {res.status_code} {res.text}")
                return False
        except Exception as e:
            log.error(f"카카오 알림 오류: {e}")
            return False
