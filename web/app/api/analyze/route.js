import { NextResponse } from 'next/server'

export async function POST(req) {
  const body = await req.json()

  // 📈 주가 데이터 — Yahoo Finance
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

  // 🔍 종목 검색 — Yahoo Finance
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

  // 🤖 AI 분석 — Gemini
  const { name, sym, market, price, chg, rsi, signal, recent5, s5, s20, bbU, bbL } = body
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ text: 'GEMINI_API_KEY를 Vercel 환경변수에 추가해주세요.' })

  const prompt = `당신은 전문 주식 트레이더이자 기술적 분석가입니다. 아래 데이터를 바탕으로 실전 매매에 바로 활용할 수 있는 분석을 한국어로 제공하세요.

종목: ${name}(${sym}) / ${market === 'KR' ? '국내' : '미국'} 시장
현재가: ${price} | 5일변동: ${chg}%
RSI(14): ${rsi} | MA5: ${s5} | MA20: ${s20}
볼린저 상단: ${bbU} / 하단: ${bbL}
최근신호: ${signal} | 최근5일 종가: ${recent5}

반드시 아래 형식으로만 답하세요:

[📊 기술적 지표 분석]
- RSI: (현재값 해석)
- 이동평균: (MA5 vs MA20 관계 및 추세)
- 볼린저밴드: (현재 위치 및 변동성)
- 추세: (상승/하락/횡보 + 강도)

[🎯 매수 포인트]
- 1차 매수가: (구체적 가격)
- 2차 매수가: (구체적 가격)
- 매수 근거: (기술적 근거)

[🚀 목표 주가]
- 1차 목표가: (구체적 가격, 수익률%)
- 2차 목표가: (구체적 가격, 수익률%)

[🛡️ 손절가]
- 손절가: (구체적 가격)
- 손절 근거: (기술적 근거)

[⚡ 단기 매매 전략]
매수 / 매도 / 관망 중 하나 선택 + 핵심 전략 2~3줄

[🏆 종합 점수: X/10]
총평 한줄`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
        })
      }
    )
    const json = await geminiRes.json()

    if (json.error) {
      return NextResponse.json({ text: '오류 ' + json.error.code + ': ' + json.error.message })
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      return NextResponse.json({ text: '응답 디버그: ' + JSON.stringify(json).slice(0, 300) })
    }

    const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()
    return NextResponse.json({ text: clean })
  } catch(e) {
    return NextResponse.json({ text: '오류: ' + e.message })
  }
}
