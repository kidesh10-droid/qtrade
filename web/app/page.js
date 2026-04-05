'use client'
import { useState, useEffect, useRef } from 'react'

// ── 데이터 생성 ──────────────────────────────────────────
function genOHLC(base, days = 90) {
  const data = []; let p = base; const now = Date.now()
  for (let i = days; i >= 0; i--) {
    const d = new Date(now - i * 86400000)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const chg = (Math.random() - 0.48) * p * 0.025
    const o = p, c = Math.max(p + chg, 1)
    const h = Math.max(o, c) * (1 + Math.random() * 0.008)
    const l = Math.min(o, c) * (1 - Math.random() * 0.008)
    data.push({ d, o, h, l, c, v: Math.floor(Math.random() * 5e6 + 5e5) })
    p = c
  }
  return data
}

function sma(data, n) {
  return data.map((_, i) => i < n - 1 ? null : data.slice(i - n + 1, i + 1).reduce((s, d) => s + d.c, 0) / n)
}

function bollinger(data, n = 20) {
  const m = sma(data, n)
  return data.map((_, i) => {
    if (i < n - 1) return { m: null, u: null, l: null }
    const sl = data.slice(i - n + 1, i + 1), mn = m[i]
    const std = Math.sqrt(sl.reduce((s, d) => s + (d.c - mn) ** 2, 0) / n)
    return { m: mn, u: mn + 2 * std, l: mn - 2 * std }
  })
}

function rsiCalc(data, n = 14) {
  return data.map((_, i) => {
    if (i < n) return null
    let g = 0, l = 0
    for (let j = i - n + 1; j <= i; j++) { const d = data[j].c - data[j - 1].c; d > 0 ? g += d : l -= d }
    return 100 - 100 / (1 + g / (l || 1e-9))
  })
}

function macdCalc(data) {
  const ema = (n) => { const k = 2 / (n + 1); const r = [data[0].c]; for (let i = 1; i < data.length; i++) r.push(data[i].c * k + r[i - 1] * (1 - k)); return r }
  const e12 = ema(12), e26 = ema(26)
  const m = e12.map((v, i) => v - e26[i])
  const s = m.map((_, i) => { if (i < 9) return null; return m.slice(i - 8, i + 1).reduce((a, v) => a + v, 0) / 9 })
  return { m, s, h: m.map((v, i) => s[i] != null ? v - s[i] : null) }
}

function getSignals(data, s5, s20, rv, bb) {
  const out = []
  for (let i = 20; i < data.length; i++) {
    const d = data[i]
    if (s5[i - 1] < s20[i - 1] && s5[i] >= s20[i]) out.push({ i, t: 'buy', r: '골든크로스', score: 3 })
    if (s5[i - 1] > s20[i - 1] && s5[i] <= s20[i]) out.push({ i, t: 'sell', r: '데드크로스', score: 3 })
    if (rv[i] < 30 && rv[i - 1] >= 30) out.push({ i, t: 'buy', r: 'RSI 과매도', score: 2 })
    if (rv[i] > 70 && rv[i - 1] <= 70) out.push({ i, t: 'sell', r: 'RSI 과매수', score: 2 })
    if (bb[i].l && d.l < bb[i].l && d.c > bb[i].l) out.push({ i, t: 'buy', r: '볼린저 하단 반등', score: 1 })
    if (bb[i].u && d.h > bb[i].u && d.c < bb[i].u) out.push({ i, t: 'sell', r: '볼린저 상단 이탈', score: 1 })
  }
  return out
}

function backtest(data, sigs) {
  let cash = 10_000_000, shares = 0
  const trades = []
  sigs.forEach(sig => {
    const d = data[sig.i]; if (!d) return
    if (sig.t === 'buy' && cash > d.c) {
      const qty = Math.floor(cash * 0.5 / d.c)
      if (qty > 0) { shares += qty; cash -= qty * d.c; trades.push({ ...sig, price: d.c, qty, date: d.d, action: '매수' }) }
    } else if (sig.t === 'sell' && shares > 0) {
      const qty = Math.floor(shares * 0.5)
      if (qty > 0) { cash += qty * d.c; shares -= qty; trades.push({ ...sig, price: d.c, qty, date: d.d, action: '매도' }) }
    }
  })
  const final = cash + shares * (data.at(-1)?.c || 0)
  return { trades, roi: (final - 10_000_000) / 10_000_000 * 100, bh: (data.at(-1)?.c / data[0]?.c - 1) * 100, final }
}

// ── 종목 목록 ─────────────────────────────────────────────
const STOCKS = {
  KR: [
    { sym: '005930', name: '삼성전자', sector: '반도체', base: 73000 },
    { sym: '000660', name: 'SK하이닉스', sector: '반도체', base: 195000 },
    { sym: '035420', name: 'NAVER', sector: 'IT', base: 218000 },
    { sym: '005380', name: '현대차', sector: '자동차', base: 210000 },
    { sym: '051910', name: 'LG화학', sector: '화학', base: 310000 },
    { sym: '035720', name: '카카오', sector: 'IT', base: 42000 },
  ],
  US: [
    { sym: 'AAPL', name: 'Apple', sector: 'Tech', base: 198 },
    { sym: 'NVDA', name: 'NVIDIA', sector: 'Semicon', base: 875 },
    { sym: 'TSLA', name: 'Tesla', sector: 'EV', base: 245 },
    { sym: 'MSFT', name: 'Microsoft', sector: 'Tech', base: 415 },
    { sym: 'AMZN', name: 'Amazon', sector: 'Commerce', base: 185 },
    { sym: 'META', name: 'Meta', sector: 'Social', base: 520 },
  ]
}

const cache = {}
function getData(s) {
  if (!cache[s.sym]) cache[s.sym] = genOHLC(s.base)
  return cache[s.sym]
}

// ── 차트 ─────────────────────────────────────────────────
function Chart({ data, s5, s20, bb, sigs, ind }) {
  const mainRef = useRef(null)
  const subRef = useRef(null)

  useEffect(() => {
    if (!data.length || !mainRef.current) return
    const cv = mainRef.current
    const dpr = window.devicePixelRatio || 1
    cv.width = cv.offsetWidth * dpr; cv.height = 300 * dpr
    cv.style.height = '300px'
    const ctx = cv.getContext('2d')
    ctx.scale(dpr, dpr)
    const W = cv.offsetWidth, H = 300
    const pd = { t: 16, r: 62, b: 28, l: 8 }
    const cw = W - pd.l - pd.r, ch = H - pd.t - pd.b
    const vis = data.slice(-60), vi = data.length - 60
    const bbv = bb.slice(-60)
    const allP = [...vis.flatMap(d => [d.h, d.l]), ...bbv.flatMap(b => [b.u, b.l].filter(Boolean))]
    const mn = Math.min(...allP) * 0.998, mx = Math.max(...allP) * 1.002
    const toY = v => pd.t + ch - (v - mn) / (mx - mn) * ch
    const bw = cw / vis.length

    for (let i = 0; i <= 5; i++) {
      const y = pd.t + ch / 5 * i
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pd.l, y); ctx.lineTo(W - pd.r, y); ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px monospace'; ctx.textAlign = 'right'
      ctx.fillText((mx - (mx - mn) / 5 * i).toLocaleString('ko-KR', { maximumFractionDigits: 0 }), W - 2, y + 3)
    }

    ['u', 'l', 'm'].forEach((k, ki) => {
      ctx.strokeStyle = 'rgba(100,180,255,0.3)'; ctx.lineWidth = 1
      ctx.setLineDash(ki === 2 ? [3, 3] : [])
      ctx.beginPath(); let st = false
      bbv.forEach((b, i) => { if (!b[k]) return; const x = pd.l + i * bw + bw / 2; st ? ctx.lineTo(x, toY(b[k])) : (ctx.moveTo(x, toY(b[k])), st = true) })
      ctx.stroke()
    }); ctx.setLineDash([])

    [[s5.slice(-60), '#FFD700'], [s20.slice(-60), '#FF6B6B']].forEach(([sm, c]) => {
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); let st = false
      sm.forEach((v, i) => { if (!v) return; const x = pd.l + i * bw + bw / 2; st ? ctx.lineTo(x, toY(v)) : (ctx.moveTo(x, toY(v)), st = true) })
      ctx.stroke()
    })

    vis.forEach((d, i) => {
      const up = d.c >= d.o, col = up ? '#00E5A0' : '#FF4D6D'
      const cx = pd.l + i * bw + bw / 2
      ctx.strokeStyle = col; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx, toY(d.h)); ctx.lineTo(cx, toY(d.l)); ctx.stroke()
      ctx.fillStyle = col
      ctx.fillRect(pd.l + i * bw + bw * 0.15, Math.min(toY(d.o), toY(d.c)), bw * 0.7, Math.abs(toY(d.c) - toY(d.o)) || 1)
    })

    sigs.forEach(sig => {
      const li = sig.i - vi; if (li < 0 || li >= vis.length) return
      const d = vis[li], x = pd.l + li * bw + bw / 2
      ctx.fillStyle = sig.t === 'buy' ? '#00E5A0' : '#FF4D6D'
      ctx.beginPath()
      if (sig.t === 'buy') { const y = toY(d.l) + 12; ctx.moveTo(x, y - 10); ctx.lineTo(x + 5, y); ctx.lineTo(x - 5, y) }
      else { const y = toY(d.h) - 12; ctx.moveTo(x, y + 10); ctx.lineTo(x + 5, y); ctx.lineTo(x - 5, y) }
      ctx.fill()
    })

    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ;[0, 15, 30, 45, 59].forEach(i => {
      if (!vis[i]) return
      ctx.fillText(`${vis[i].d.getMonth() + 1}/${vis[i].d.getDate()}`, pd.l + i * bw + bw / 2, H - 8)
    })
  }, [data, s5, s20, bb, sigs])

  useEffect(() => {
    if (!ind || ind === 'none' || !subRef.current || !data.length) return
    const cv = subRef.current
    const dpr = window.devicePixelRatio || 1
    cv.width = cv.offsetWidth * dpr; cv.height = 80 * dpr
    cv.style.height = '80px'
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr)
    const W = cv.offsetWidth, H = 80
    const pd = { t: 8, r: 62, b: 18, l: 8 }
    const cw = W - pd.l - pd.r, ch = H - pd.t - pd.b
    const bw = cw / 60; ctx.clearRect(0, 0, W, H)

    if (ind === 'rsi') {
      const rv = rsiCalc(data).slice(-60)
      ;[30, 50, 70].forEach(v => {
        const y = pd.t + ch - (v / 100) * ch
        ctx.strokeStyle = v === 50 ? 'rgba(255,255,255,0.08)' : 'rgba(255,80,80,0.25)'
        ctx.setLineDash([3, 3]); ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(pd.l, y); ctx.lineTo(W - pd.r, y); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '9px monospace'; ctx.textAlign = 'right'
        ctx.fillText(v, W - 2, y + 3)
      })
      ctx.strokeStyle = '#A78BFA'; ctx.lineWidth = 1.5; ctx.beginPath(); let st = false
      rv.forEach((v, i) => { if (!v) return; const x = pd.l + i * bw + bw / 2, y = pd.t + ch - (v / 100) * ch; st ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), st = true) })
      ctx.stroke()
      ctx.fillStyle = 'rgba(167,139,250,0.7)'; ctx.font = '9px monospace'; ctx.textAlign = 'left'
      ctx.fillText('RSI(14)', pd.l + 4, pd.t + 11)
    }

    if (ind === 'macd') {
      const { m, s, h } = macdCalc(data)
      const vm = m.slice(-60), vs = s.slice(-60), vh = h.slice(-60)
      const all = [...vm, ...vs, ...vh].filter(Boolean)
      const minV = Math.min(...all), maxV = Math.max(...all)
      const toY = v => pd.t + ch - ((v - minV) / (maxV - minV)) * ch
      const zY = toY(0)
      vh.forEach((v, i) => { if (!v) return; ctx.fillStyle = v >= 0 ? 'rgba(0,229,160,0.45)' : 'rgba(255,77,109,0.45)'; ctx.fillRect(pd.l + i * bw + bw * 0.1, Math.min(toY(v), zY), bw * 0.8, Math.abs(toY(v) - zY)) })
      ;[[vm, '#FFD700'], [vs, '#FF6B6B']].forEach(([arr, c]) => {
        ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); let st = false
        arr.forEach((v, i) => { if (!v) return; const x = pd.l + i * bw + bw / 2; st ? ctx.lineTo(x, toY(v)) : (ctx.moveTo(x, toY(v)), st = true) }); ctx.stroke()
      })
      ctx.fillStyle = 'rgba(255,215,0,0.7)'; ctx.font = '9px monospace'; ctx.textAlign = 'left'
      ctx.fillText('MACD', pd.l + 4, pd.t + 11)
    }
  }, [data, ind])

  return (
    <div>
      <canvas ref={mainRef} style={{ width: '100%', display: 'block' }} />
      {ind && ind !== 'none' && (
        <canvas ref={subRef} style={{ width: '100%', display: 'block', borderTop: '1px solid rgba(255,255,255,0.06)' }} />
      )}
    </div>
  )
}

// ── 메인 앱 ───────────────────────────────────────────────
export default function Home() {
  const [market, setMarket] = useState('KR')
  const [stock, setStock] = useState(STOCKS.KR[0])
  const [tab, setTab] = useState('chart')
  const [ind, setInd] = useState('rsi')
  const [btResult, setBtResult] = useState(null)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const data = getData(stock)
  const s5 = sma(data, 5), s20 = sma(data, 20)
  const bb = bollinger(data), rv = rsiCalc(data)
  const sigs = getSignals(data, s5, s20, rv, bb)
  const last = data.at(-1), prev = data.at(-2)
  const chgPct = last && prev ? (last.c - prev.c) / prev.c * 100 : 0
  const lastRSI = rv.filter(Boolean).at(-1)
  const lastSig = sigs.at(-1)
  const isKR = market === 'KR'
  const fmt = v => isKR ? v?.toLocaleString() + '₩' : '$' + v?.toFixed(2)

  const switchMarket = (m) => {
    setMarket(m); setStock(STOCKS[m][0])
    setAiText(''); setBtResult(null)
  }

  const doAI = async () => {
    setAiLoading(true); setAiText('')
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: stock.name, sym: stock.sym, market,
          price: fmt(last?.c), chg: chgPct.toFixed(2),
          rsi: lastRSI?.toFixed(1),
          signal: lastSig ? (lastSig.t === 'buy' ? '🟢매수 ' : '🔴매도 ') + lastSig.r : '없음',
          recent5: data.slice(-5).map(d => fmt(d.c)).join(', '),
          s5: s5.at(-1)?.toFixed(0), s20: s20.at(-1)?.toFixed(0),
          bbU: bb.at(-1)?.u?.toFixed(0), bbL: bb.at(-1)?.l?.toFixed(0),
        })
      })
      const json = await res.json()
      setAiText(json.text || '분석 실패')
    } catch { setAiText('⚠️ 분석 오류') }
    setAiLoading(false)
  }

  const C = { green: '#00E5A0', red: '#FF4D6D', gold: '#FFD700', purple: '#A78BFA', muted: 'rgba(255,255,255,0.3)', border: 'rgba(255,255,255,0.08)' }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#080d18,#0f1a2e 60%,#080d18)', color: '#fff', fontFamily: "'DM Mono',monospace", fontSize: 13 }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
      `}</style>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3, color: C.green }}>◈ QTRADE</div>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2 }}>AI STOCK PLATFORM</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {['KR', 'US'].map(m => (
            <button key={m} onClick={() => switchMarket(m)} style={{ padding: '5px 14px', borderRadius: 6, border: `1px solid ${market === m ? C.green : C.border}`, background: market === m ? 'rgba(0,229,160,0.08)' : 'transparent', color: market === m ? C.green : C.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>
              {m === 'KR' ? '🇰🇷 국내' : '🇺🇸 미국'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 49px)' }}>
        {/* SIDEBAR */}
        <div style={{ width: 168, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8 }}>{market === 'KR' ? 'KOSPI/KOSDAQ' : 'NYSE/NASDAQ'}</div>
          {STOCKS[market].map(s => {
            const sd = getData(s), sl = sd.at(-1)?.c, sp = sd.at(-2)?.c
            const sc = sp ? (sl - sp) / sp * 100 : 0
            const sel = stock.sym === s.sym
            return (
              <div key={s.sym} onClick={() => { setStock(s); setAiText(''); setBtResult(null) }}
                style={{ padding: '9px 8px', borderRadius: 8, cursor: 'pointer', marginBottom: 3, background: sel ? 'rgba(0,229,160,0.07)' : 'transparent', border: `1px solid ${sel ? 'rgba(0,229,160,0.25)' : 'transparent'}`, transition: 'all .15s' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: sel ? C.green : '#fff' }}>{s.name}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.sym}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11 }}>
                  <span>{isKR ? sl?.toLocaleString() : '$' + sl?.toFixed(1)}</span>
                  <span style={{ color: sc >= 0 ? C.green : C.red }}>{sc >= 0 ? '▲' : '▼'}{Math.abs(sc).toFixed(1)}%</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* MAIN */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* PRICE BAR */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: `1px solid ${C.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{stock.name}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{stock.sym} · {stock.sector}</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(last?.c)}</div>
              <div style={{ color: chgPct >= 0 ? C.green : C.red, fontSize: 13 }}>{chgPct >= 0 ? '▲' : '▼'} {Math.abs(chgPct).toFixed(2)}%</div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[['RSI', lastRSI?.toFixed(1), lastRSI < 30 ? C.green : lastRSI > 70 ? C.red : '#fff'],
                ['신호', lastSig ? (lastSig.t === 'buy' ? '🟢매수' : '🔴매도') : '—', C.purple],
                ['신호수', sigs.length + '개', C.gold]].map(([l, v, c]) => (
                <div key={l}>
                  <div style={{ fontSize: 10, color: C.muted }}>{l}</div>
                  <div style={{ color: c, fontWeight: 500, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['chart', '📊 차트'], ['backtest', '🔄 백테스트'], ['portfolio', '💼 포트폴리오'], ['ai', '🤖 AI분석']].map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${tab === t ? C.purple : C.border}`, background: tab === t ? 'rgba(167,139,250,0.1)' : 'transparent', color: tab === t ? C.purple : C.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>{l}</button>
              ))}
            </div>
          </div>

          {/* CHART TAB */}
          {tab === 'chart' && <>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: C.muted, letterSpacing: 2 }}>지표</span>
                {[['rsi', 'RSI'], ['macd', 'MACD'], ['none', '없음']].map(([v, l]) => (
                  <button key={v} onClick={() => setInd(v)} style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${ind === v ? C.gold : C.border}`, background: ind === v ? 'rgba(255,215,0,0.08)' : 'transparent', color: ind === v ? C.gold : C.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>{l}</button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 10, color: C.muted, flexWrap: 'wrap' }}>
                  {[['#FFD700', 'MA5'], ['#FF6B6B', 'MA20'], ['rgba(100,180,255,0.7)', '볼린저'], [C.green, '매수▲'], [C.red, '매도▼']].map(([c, l]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}
                    </span>
                  ))}
                </div>
              </div>
              <Chart data={data} s5={s5} s20={s20} bb={bb} sigs={sigs} ind={ind} />
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: C.muted, marginBottom: 10 }}>매매 신호 내역</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>{['날짜', '유형', '사유', '강도', '가격'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: C.muted, fontWeight: 400, borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {sigs.slice(-8).reverse().map((sig, i) => {
                      const d = data[sig.i]
                      return <tr key={i} style={{ borderBottom: 'none' }}>
                        <td style={{ padding: '6px 8px', color: C.muted }}>{d?.d.toLocaleDateString('ko-KR')}</td>
                        <td style={{ padding: '6px 8px' }}><span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, background: sig.t === 'buy' ? 'rgba(0,229,160,0.12)' : 'rgba(255,77,109,0.12)', color: sig.t === 'buy' ? C.green : C.red }}>{sig.t === 'buy' ? '매수' : '매도'}</span></td>
                        <td style={{ padding: '6px 8px' }}>{sig.r}</td>
                        <td style={{ padding: '6px 8px' }}>{'⭐'.repeat(sig.score)}</td>
                        <td style={{ padding: '6px 8px' }}>{fmt(d?.c)}</td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>}

          {/* BACKTEST TAB */}
          {tab === 'backtest' && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: `1px solid ${C.border}`, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>백테스팅 시뮬레이션</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>기술적 신호 기반 · 초기자금 1,000만원 · 50% 분할매매</div>
                </div>
                <button onClick={() => setBtResult(backtest(data, sigs))} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5A0,#00B4D8)', color: '#000', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>▶ 실행</button>
              </div>
              {btResult ? <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                  {[['전략 수익률', btResult.roi.toFixed(2) + '%', btResult.roi >= 0 ? C.green : C.red],
                    ['Buy & Hold', btResult.bh.toFixed(2) + '%', btResult.bh >= 0 ? C.green : C.red],
                    ['최종자산', (btResult.final / 10000).toFixed(0) + '만원', C.gold],
                    ['거래횟수', btResult.trades.length + '회', C.purple]].map(([l, v, c]) => (
                    <div key={l} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 14, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: C.muted }}>{l}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: c, marginTop: 6 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr>{['날짜', '액션', '사유', '수량', '가격'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: C.muted, fontWeight: 400, borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {btResult.trades.map((t, i) => (
                        <tr key={i}>
                          <td style={{ padding: '6px 8px', color: C.muted }}>{t.date?.toLocaleDateString('ko-KR')}</td>
                          <td style={{ padding: '6px 8px', color: t.action === '매수' ? C.green : C.red }}>{t.action}</td>
                          <td style={{ padding: '6px 8px' }}>{t.r}</td>
                          <td style={{ padding: '6px 8px' }}>{t.qty?.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px' }}>{fmt(t.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </> : <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>▶ 실행 버튼을 눌러 시작하세요</div>}
            </div>
          )}

          {/* PORTFOLIO TAB */}
          {tab === 'portfolio' && (() => {
            const pf = [
              { sym: '005930', name: '삼성전자', qty: 10, avg: 71000, mkt: 'KR', base: 73000 },
              { sym: 'NVDA', name: 'NVIDIA', qty: 5, avg: 820, mkt: 'US', base: 875 },
              { sym: 'AAPL', name: 'Apple', qty: 8, avg: 185, mkt: 'US', base: 198 },
              { sym: '035420', name: 'NAVER', qty: 3, avg: 210000, mkt: 'KR', base: 218000 },
            ].map(p => {
              const s = [...STOCKS.KR, ...STOCKS.US].find(s => s.sym === p.sym)
              const d = s ? getData(s) : null
              const cur = d ? d.at(-1)?.c : p.base
              const pl = (cur - p.avg) * p.qty
              const fmtP = v => p.mkt === 'US' ? '$' + v.toFixed(2) : v.toLocaleString() + '₩'
              return { ...p, cur, pl, plPct: (cur - p.avg) / p.avg * 100, fmtP }
            })
            const total = pf.reduce((s, p) => s + p.pl, 0)
            return (
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: `1px solid ${C.border}`, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>내 포트폴리오</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: C.muted }}>총 평가손익</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: total >= 0 ? C.green : C.red, marginTop: 2 }}>{total >= 0 ? '+' : ''}{(total / 10000).toFixed(1)}만원</div>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr>{['종목', '시장', '수량', '평균단가', '현재가', '평가손익', '수익률'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: C.muted, fontWeight: 400, borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {pf.map((p, i) => (
                        <tr key={i}>
                          <td style={{ padding: '10px 10px' }}><div style={{ fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 10, color: C.muted }}>{p.sym}</div></td>
                          <td style={{ padding: '10px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, background: p.mkt === 'KR' ? 'rgba(60,100,255,0.15)' : 'rgba(255,120,50,0.15)', color: p.mkt === 'KR' ? '#6699FF' : '#FFA07A' }}>{p.mkt}</span></td>
                          <td style={{ padding: '10px 10px' }}>{p.qty}</td>
                          <td style={{ padding: '10px 10px', color: C.muted }}>{p.fmtP(p.avg)}</td>
                          <td style={{ padding: '10px 10px' }}>{p.fmtP(p.cur)}</td>
                          <td style={{ padding: '10px 10px', color: p.pl >= 0 ? C.green : C.red }}>{p.pl >= 0 ? '+' : ''}{(p.pl / 10000).toFixed(1)}만</td>
                          <td style={{ padding: '10px 10px', color: p.plPct >= 0 ? C.green : C.red }}>{p.plPct >= 0 ? '+' : ''}{p.plPct.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* AI TAB */}
          {tab === 'ai' && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: `1px solid ${C.border}`, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>🤖 Claude AI 기술적 분석</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>RSI · 이동평균 · 볼린저밴드 · 매매신호 종합 분석</div>
                </div>
                <button onClick={doAI} disabled={aiLoading} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: aiLoading ? 'rgba(167,139,250,0.25)' : 'linear-gradient(135deg,#A78BFA,#6366f1)', color: '#fff', fontWeight: 700, cursor: aiLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                  {aiLoading ? '⚙️ 분석 중...' : '분석 시작'}
                </button>
              </div>
              {aiText && (
                <div style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 10, padding: 18, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                  {aiText.split('\n').map((line, i) => {
                    if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ fontWeight: 700, color: C.purple, marginTop: 10 }}>{line.replace(/\*\*/g, '')}</div>
                    const html = line.replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.gold}">$1</strong>`)
                    return <div key={i} dangerouslySetInnerHTML={{ __html: html || '\u00a0' }} />
                  })}
                </div>
              )}
              {!aiText && !aiLoading && <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>분석 시작 버튼을 눌러주세요</div>}
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
                ⚠️ 기술적 지표 기반 참고용입니다. 실제 투자는 본인 책임입니다.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
