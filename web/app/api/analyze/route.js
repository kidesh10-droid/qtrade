import { NextResponse } from 'next/server'

export async function POST(req) {
  const body = await req.json()

  if (body.action === 'quote') {
    try {
      const sym = body.market === 'KR' ? body.symbol + '.KS' : body.symbol
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=6mo`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      })
      const json = await res.json()
      const result = json.chart?.result?.[0]
      if (!result) return NextResponse.json({ error: 'no data' })
      const timestamps = result.timestamp
      const q = result.indicators.quote[0]
      const rows = timestamps.map((t, i) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i]
      })).filter(r => r.c != null)
      return NextResponse.json({ rows })
    } catch(e) { return NextResponse.json({ error: e.message }) }
  }

  if (body.action === 'search') {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(body.keyword)}&quotesCount=8&newsCount=0`
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const json = await res.json()
      const results = (json.quotes || []).slice(0, 8).map(q => ({
        sym: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        type: q.quoteType || '주식',
        region: q.exchange || ''
      }))
      return NextResponse.json({ results })
    } catch(e) { return NextResponse.json({ results: [] }) }
  }

  const { name, sym, market, price, chg, rsi, signal, recent5, s5, s20, bbU, bbL } = body
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ text: 'GEMINI_API_KEY를 Vercel 환경변수에 추가해주세요.' })

  const prompt = `당신은 친절한 주식 전문가입니다. 주식을 처음 시작하는 초보 투자자도 이해할 수 있게 쉽고 명확하게 설명해주세요. 전문 용어는 괄호 안에 쉽게 풀어서 설명하세요.

분석할 종목 정보:
- 종목명: ${name} (${sym})
- 시장: ${market === 'KR' ? '한국 주식시장' : '미국 주식시장'}
- 현재 주가: ${price}
- 최근 5일 변동: ${chg}%
- RSI 지표: ${rsi} (0~30 과매도 매수기회, 70~100 과매수 매도고려, 30~70 중립)
- 5일 이동평균: ${s5}
- 20일 이동평균: ${s20}
- 볼린저밴드 상단: ${bbU} / 하단: ${bbL}
- 최근 매매 신호: ${signal}
- 최근 5일 종가: ${recent5}

아래 형식으로 빠짐없이 모두 작성하세요. 각 항목을 절대 생략하지 마세요:

✅ 지금 이 주식 상태는?
(초보자도 이해할 수 있게 현재 상황을 2~3문장으로 쉽게 설명)

📈 기술적 지표 해석
- RSI ${rsi}: (과매수/과매도/중립 여부와 의미를 쉽게 설명)
- 이동평균선: (5일선과 20일선 관계, 상승/하락 추세 쉽게 설명)
- 볼린저밴드: (현재 주가 위치로 본 매매 시점 쉽게 설명)

💰 매수 추천 가격
- 1차 매수가: ${price}의 약 2~3% 아래 가격 (숫자로 명시)
- 2차 매수가: ${price}의 약 5% 아래 가격 (숫자로 명시)
- 이유: (왜 이 가격에 사면 좋은지 쉽게 설명)

🎯 목표 주가 (팔아야 할 가격)
- 1차 목표가: ${price}의 약 5~7% 위 가격 (숫자로 명시, 수익률 표시)
- 2차 목표가: ${price}의 약 10~15% 위 가격 (숫자로 명시, 수익률 표시)

🛡️ 손절가 (손해를 줄이기 위해 팔아야 할 가격)
- 손절가: ${price}의 약 5~7% 아래 가격 (숫자로 명시)
- 이유: (왜 이 가격 아래면 손절해야 하는지 쉽게 설명)

⚡ 지금 어떻게 해야 할까요?
매수 / 매도 / 관망 중 하나를 선택하고 초보자도 이해할 수 있게 행동 지침 3줄 작성

⚠️ 주의할 점
(이 종목 투자 시 조심해야 할 리스크 2가지를 쉽게 설명)

🏆 종합 평가: X/10점
(한 줄 총평)`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 3000 }
        })
      }
    )
    const json = await geminiRes.json()
    if (json.error) return NextResponse.json({ text: '오류 ' + json.error.code + ': ' + json.error.message })
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return NextResponse.json({ text: '응답 없음: ' + JSON.stringify(json).slice(0, 200) })
    const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()
    return NextResponse.json({ text: clean })
  } catch(e) {
    return NextResponse.json({ text: '오류: ' + e.message })
  }
}
