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

  const prompt = `당신은 전문 주식 기술적 분석가입니다.
종목: ${name}(${sym}) / ${market === 'KR' ? '국내' : '미국'} 시장
현재가: ${price} | 5일변동: ${chg}%
RSI(14): ${rsi} | MA5: ${s5} | MA20: ${s20}
볼린저 상단: ${bbU} / 하단: ${bbL}
최근신호: ${signal} | 최근5일: ${recent5}

다음 형식으로 한국어로 분석하세요:

[현재 기술적 상태]
2~3문장으로 설명

[단기 매매 의견]
매수 또는 매도 또는 관망 선택 후 근거 설명

[주요 가격대]
지지선: 가격
저항선: 가격

[리스크 요인]
1~2가지

[종합 점수: X/10]
한줄 총평`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
        })
      }
    )
    const json = await geminiRes.json()

    if (json.error) {
      return NextResponse.json({ text: '오류코드 ' + json.error.code + ': ' + json.error.message })
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
