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

  const prompt = `당신은 친절한 주식 전문가입니다. 주식을 처음 시작하는 초보 투자자도 이해할 수 있게 쉽고 명확하게 설명해주세요.

분석 종목: ${name} (${sym}) / ${market === 'KR' ? '한국 주식시장' : '미국 주식시장'}
현재 주가: ${price} | 최근 5일 변동: ${chg}%
RSI: ${rsi} | MA5: ${s5} | MA20: ${s20}
볼린저 상단: ${bbU} / 하단: ${bbL}
최근 신호: ${signal} | 최근 5일 종가: ${recent5}

아래 항목을 빠짐없이 모두 작성하세요:

✅ 지금 이 주식 상태는?
현재 상황을 초보자도 이해할 수 있게 3~4문장으로 쉽게 설명해주세요.

📈 기술적 지표 해석
- RSI ${rsi}: 현재 상태가 과매수/과매도/중립인지 쉽게 설명
- 이동평균선: MA5(${s5})와 MA20(${s20}) 관계로 추세 설명
- 볼린저밴드: 상단 ${bbU} / 하단 ${bbL} 기준 현재 위치 설명
- 종합 추세: 상승/하락/횡보 판단

💰 매수 추천 가격
- 1차 매수가: (현재가 기준 구체적인 가격 숫자로)
- 2차 매수가: (현재가 기준 구체적인 가격 숫자로)
- 매수 이유: 왜 이 가격이 좋은지 쉽게 설명

🎯 목표 주가
- 1차 목표가: (구체적인 가격과 예상 수익률%)
- 2차 목표가: (구체적인 가격과 예상 수익률%)
- 근거: 왜 이 가격이 목표인지 설명

🛡️ 손절가 (이 가격 아래로 떨어지면 손해를 줄이기 위해 파세요)
- 손절가: (구체적인 가격 숫자로)
- 손절 이유: 왜 이 가격에서 팔아야 하는지 쉽게 설명

⚡ 지금 당장 어떻게 해야 할까요?
매수 / 매도 / 관망 중 하나를 선택하고 초보자도 바로 실행할 수 있는 행동 지침을 3~4줄로 작성

⚠️ 꼭 알아야 할 리스크
이 종목에 투자할 때 조심해야 할 위험 요소 2~3가지를 쉽게 설명

🏆 종합 평가: X/10점
한 줄 총평과 이유`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
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
