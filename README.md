# ◈ QTRADE — AI 주식 분석 플랫폼

국내(한국투자증권) + 미국(Alpaca) 주식 분석 대시보드  
GitHub → Vercel 자동 배포 + Python 자동매매 봇

---

## 📁 프로젝트 구조

```
qtrade-project/
├── web/                  ← Next.js 웹 대시보드 (Vercel 배포)
│   ├── app/
│   │   ├── page.js       ← 메인 대시보드 UI
│   │   ├── layout.js
│   │   └── api/
│   │       └── analyze/
│   │           └── route.js  ← Claude AI 분석 API
│   ├── package.json
│   ├── next.config.js
│   └── .env.local.example
└── bot/                  ← Python 자동매매 봇 (내 PC에서 실행)
    ├── main.py
    ├── config.py         ← ★ API 키 설정
    ├── strategy.py
    ├── korea_trader.py
    ├── us_trader.py
    ├── notifier.py
    └── requirements.txt
```

---

## 🚀 GitHub → Vercel 배포 (웹 대시보드)

### STEP 1 — GitHub 저장소 만들기

1. [github.com](https://github.com) 로그인
2. 우상단 **+** → **New repository**
3. 이름: `qtrade` → **Create repository**
4. 아래 명령어 실행:

```bash
cd qtrade-project
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/내아이디/qtrade.git
git push -u origin main
```

### STEP 2 — Vercel 연동

1. [vercel.com](https://vercel.com) 접속 → GitHub로 로그인
2. **Add New Project** → GitHub 저장소 `qtrade` 선택
3. **Root Directory** → `web` 으로 변경 ⚠️ 중요!
4. **Deploy** 클릭

### STEP 3 — 환경변수 설정 (AI 분석용)

Vercel 대시보드 → 프로젝트 → **Settings** → **Environment Variables**

| 이름 | 값 |
|------|----|
| `ANTHROPIC_API_KEY` | Claude API 키 ([console.anthropic.com](https://console.anthropic.com)) |

추가 후 **Redeploy** 클릭하면 완료!

### STEP 4 — 이후 업데이트

코드 수정 후 push만 하면 Vercel이 자동으로 재배포합니다:

```bash
git add .
git commit -m "update"
git push
```

---

## 🤖 Python 자동매매 봇 실행 (내 PC)

```bash
cd bot
pip install -r requirements.txt

# config.py 열어서 API 키 입력 후:
python main.py
```

---

## 🔑 필요한 API 키 (모두 무료)

| 용도 | 서비스 | 발급처 |
|------|--------|--------|
| AI 분석 | Claude API | [console.anthropic.com](https://console.anthropic.com) |
| 국내주식 | 한국투자증권 | [apiportal.koreainvestment.com](https://apiportal.koreainvestment.com) |
| 미국주식 주문 | Alpaca | [alpaca.markets](https://alpaca.markets) |
| 카카오 알림 | Kakao | [developers.kakao.com](https://developers.kakao.com) |
