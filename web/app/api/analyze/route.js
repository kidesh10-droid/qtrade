import { NextResponse } from 'next/server'

export async function POST(req) {
  const body = await req.json()

  if (body.action === 'quote') {
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

  if (body.action === 'search') {
    const key = process.env.ALPHA_VANTAGE_KEY
    if (!key) return NextResponse.json({ results: [] })
    try {
      const res = await fetch(`https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${body.keyword}&apikey=${key}`)
      const json = await res.json()
      const results = (json.bestMatches||[]).slice(0,8).map(m => ({
        sym: m['1. symbol'], name: m['2. name'], type: m['3. type'], region: m['4. region']
      }))
      return NextResponse.json({ results })
    } catch(e) { return NextResponse.json({ results: [] }) }
  }

  const { name,sym,market,price,chg,rsi,signal,recent5,s5,s20,bbU,bbL } = body
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ text: '⚠️ ANTHROPIC_API_KEY를 Vercel 환경변수에 추가해주세요.' })

  const prompt = `당신은 전문 주식 기술적 분석가입니다.
종목: ${name}(${sym}) / ${market==='KR'?'국내':'미국'} 시장
현재가: ${price} | 5일변동: ${chg}%
RSI(14): ${rsi} | MA5: ${s5} | MA20: ${s20}
볼린저 상단: ${bbU} / 하단: ${bbL}
최근신호: ${signal}
최근5일: ${recent5}

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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000, messages:[{role:'user',content:prompt}] })
    })
    const json = await res.json()
    return NextResponse.json({ text: json.content?.[0]?.text || '분석 실패' })
  } catch(e) {
    return NextResponse.json({ text: '⚠️ 오류: '+e.message })
  }
}
