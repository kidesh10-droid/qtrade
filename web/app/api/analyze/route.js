import { NextResponse } from 'next/server'

export async function POST(req) {
  const { name, sym, market, price, chg, rsi, signal, recent5, s5, s20, bbU, bbL } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ text: '⚠️ ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.\nVercel 대시보드 → Settings → Environment Variables에 추가해주세요.' })
  }

  const prompt = `당신은 전문 주식 기술적 분석가입니다. 다음 데이터를 바탕으로 한국어로 전문적인 분석을 제공하세요.

종목: ${name} (${sym}) / ${market === 'KR' ? '국내 주식시장' : '미국 주식시장'}
현재가: ${price} | 5일 변동: ${chg}%
RSI(14): ${rsi} | MA5: ${s5} | MA20: ${s20}
볼린저 상단: ${bbU} / 하단: ${bbL}
최근 신호: ${signal}
최근 5일 종가: ${recent5}

다음 형식으로 분석해주세요:

**📊 현재 기술적 상태**
(RSI, 이동평균, 볼린저밴드 상태 2~3문장)

**🎯 단기 매매 의견**
매수 / 매도 / 관망 중 하나를 명확히 선택하고 근거를 설명하세요.

**📌 주요 가격대**
지지선: (가격)
저항선: (가격)

**⚠️ 리스크 요인**
(1~2가지 핵심 리스크)

**🏆 종합 점수: X/10** (매수 관점)
(한줄 총평)`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const data = await res.json()
    return NextResponse.json({ text: data.content?.[0]?.text || '분석 실패' })
  } catch (e) {
    return NextResponse.json({ text: `⚠️ 오류: ${e.message}` })
  }
}
