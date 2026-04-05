import { NextResponse } from 'next/server'

export async function POST(req) {
  const body = await req.json()

  // 🇰🇷 국내 주식 — 네이버
  if (body.action === 'quote' && body.market === 'KR') {
    try {
      const sym = body.symbol
      const chartUrl = `https://api.stock.naver.com/chart/domestic/item/${sym}/day?startDateTime=20240101000000&endDateTime=99991231000000`
      const chartRes = await fetch(chartUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com' }
      })
      const chartJson = await chartRes.json()
      if (!chartJson || !Array.isArray(chartJson)) return NextResponse.json({ error: 'no data' })
      const rows = chartJson.slice(-90).map(d => ({
        date: d[0].slice(0,10), o:+d[1], h:+d[2], l:+d[3], c:+d[4], v:+d[5]
      }))
      return NextResponse.json({ rows })
    } catch(e) { return NextResponse.json({ error: e.message }) }
  }

  // 🇺🇸 미국 주식 — Alpha Vantage
  if (body.action === 'quote' && body.market === 'US') {
    const key = process.env.ALPHA_VANTAGE_KEY
    if (!key) return NextResponse.json({ error: 'no key' })
    try {
      const res = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${body.symbol}&outputsize=compact&apikey=${key}`)
      const json = await res.json()
      const ts = json['Time Series (Daily)']
      if (!ts) return NextResponse.json({ error: 'no data' })
      const rows = Object.entries(ts).slice(0,90).reverse().map(([date,v]) => ({
        date, o:+v['1. open'], h:+v['2. high'], l:+v['3. low'], c:+v['4. close'], v:+v['5. volume']
      }))
      return NextResponse.json({ rows })
    } catch(e) { return NextResponse.json({ error: e.message }) }
  }

  // 🔍 종목 검색
  if (body.action === 'search') {
    const keyword = body.keyword
    if (/[ㄱ-ㅎ가-힣]/.test(keyword) || /^\d{6}$/.test(keyword)) {
      try {
        const res = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(keyword)}&target=stock,index`, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com' }
        })
        const json = await res.json()
        const items = json.items?.[0] || []
        const results = items.slice(0,8).map(item => ({
          sym: item[1], name: item[0], type: '주식', region: '한국'
        }))
        return NextResponse.json({ results })
      } catch(e) { return NextResponse.json({ results: [] }) }
    }
    const key = process.env.ALPHA_VANTAGE_KEY
    if (!key) return NextResponse.json({ results: [] })
    try {
      const res = await fetch(`https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${keyword}&apikey=${key}`)
      const json = await res.json()
      const results = (json.bestMatches||[]).slice(0,8).map(m => ({
        sym: m['1. symbol'], name: m['2. name'], type: m['3. type'], region: m['4. region']
      }))
      return NextResponse.json({ results })
    } catch(e) { return NextResponse.json({ results: [] }) }
  }

  // 🤖 AI 분석 — Gemini (무료)
  const { name,sym,market,price,chg,rsi,signal,recent5,s5,s20,bbU,bbL } = body
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ text: '⚠️ GEMINI_API_KEY를 Vercel 환경변수에 추가해주세요.' })

  const prompt = `당신은 전문 주식 기술적 분석가입니다.
종목: ${name}(${sym}) / ${market==='KR'?'국내':'미국'} 시장
현재가: ${price} | 5일변동: ${chg}%
RSI(14): ${rsi} | MA5: ${s5} | MA20: ${s20}
볼린저 상단: ${bbU} / 하단: ${bbL}
최근신호: ${signal} | 최근5일: ${recent5}

다음 형식으로 한국어 분석을 제공하세요:

**📊 현재 기술적 상태**
(2~3문장)

**🎯 단기 매매 의견**
매수/매도/관망 + 근거

**📌 주요 가격대**
지지선: / 저항선:

**⚠️ 리스크 요인**
(1~2가지)

**🏆 종합 점수: X/10**`

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })
    const json = await res.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '분석 실패'
    return NextResponse.json({ text })
  } catch(e) {
    return NextResponse.json({ text: '⚠️ 오류: '+e.message })
  }
}
