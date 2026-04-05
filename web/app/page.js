"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";

function genOHLC(base) {
  var data=[], p=base, now=Date.now();
  for(var i=90;i>=0;i--){
    var d=new Date(now-i*86400000);
    if(d.getDay()===0||d.getDay()===6)continue;
    var chg=(Math.random()-0.48)*p*0.025;
    var o=p,c=Math.max(p+chg,1);
    data.push({date:d,o:o,h:Math.max(o,c)*1.005,l:Math.min(o,c)*0.995,c:c,v:Math.floor(Math.random()*5e6)});
    p=c;
  }
  return data;
}
function calcSMA(data,n){return data.map(function(_,i){if(i<n-1)return null;return data.slice(i-n+1,i+1).reduce(function(s,d){return s+d.c;},0)/n;});}
function calcBB(data){var m=calcSMA(data,20);return data.map(function(_,i){if(i<19)return{m:null,u:null,l:null};var sl=data.slice(i-19,i+1),mn=m[i],std=Math.sqrt(sl.reduce(function(s,d){return s+(d.c-mn)*(d.c-mn);},0)/20);return{m:mn,u:mn+2*std,l:mn-2*std};});}
function calcRSI(data){return data.map(function(_,i){if(i<14)return null;var g=0,l=0;for(var j=i-13;j<=i;j++){var d=data[j].c-data[j-1].c;if(d>0)g+=d;else l-=d;}return 100-100/(1+g/(l||1e-9));});}
function calcMACD(data){var ema=function(n){var k=2/(n+1),r=[data[0].c];for(var i=1;i<data.length;i++)r.push(data[i].c*k+r[i-1]*(1-k));return r;};var e12=ema(12),e26=ema(26);var m=e12.map(function(v,i){return v-e26[i];});var s=m.map(function(_,i){if(i<9)return null;return m.slice(i-8,i+1).reduce(function(a,v){return a+v;},0)/9;});return{m:m,s:s,h:m.map(function(v,i){return s[i]!=null?v-s[i]:null;})};}
function getSignals(data,s5,s20,rv,bv){var out=[];for(var i=20;i<data.length;i++){var d=data[i];if(s5[i-1]<s20[i-1]&&s5[i]>=s20[i])out.push({i:i,t:"buy",r:"골든크로스",score:3});if(s5[i-1]>s20[i-1]&&s5[i]<=s20[i])out.push({i:i,t:"sell",r:"데드크로스",score:3});if(rv[i]<30&&rv[i-1]>=30)out.push({i:i,t:"buy",r:"RSI 과매도",score:2});if(rv[i]>70&&rv[i-1]<=70)out.push({i:i,t:"sell",r:"RSI 과매수",score:2});if(bv[i].l&&d.l<bv[i].l&&d.c>bv[i].l)out.push({i:i,t:"buy",r:"볼린저 하단",score:1});if(bv[i].u&&d.h>bv[i].u&&d.c<bv[i].u)out.push({i:i,t:"sell",r:"볼린저 상단",score:1});}return out;}
function runBacktest(data,sigs){var cash=10000000,shares=0,trades=[];sigs.forEach(function(sig){var d=data[sig.i];if(!d)return;if(sig.t==="buy"&&cash>d.c){var q=Math.floor(cash*0.5/d.c);if(q>0){shares+=q;cash-=q*d.c;trades.push(Object.assign({},sig,{price:d.c,qty:q,date:d.date,action:"매수"}));}}else if(sig.t==="sell"&&shares>0){var q2=Math.floor(shares*0.5);if(q2>0){cash+=q2*d.c;shares-=q2;trades.push(Object.assign({},sig,{price:d.c,qty:q2,date:d.date,action:"매도"}));}}});var last=data[data.length-1],first=data[0];var fin=cash+shares*(last?last.c:0);return{trades:trades,roi:(fin-10000000)/10000000*100,bh:last&&first?(last.c/first.c-1)*100:0,fin:fin};}

var DEFAULT_STOCKS={
  KR:[{sym:"005930",name:"삼성전자",sector:"반도체",base:73000},{sym:"000660",name:"SK하이닉스",sector:"반도체",base:195000},{sym:"035420",name:"NAVER",sector:"IT",base:218000},{sym:"005380",name:"현대차",sector:"자동차",base:210000},{sym:"035720",name:"카카오",sector:"IT",base:42000}],
  US:[{sym:"AAPL",name:"Apple",sector:"Tech",base:198},{sym:"NVDA",name:"NVIDIA",sector:"Semicon",base:875},{sym:"TSLA",name:"Tesla",sector:"EV",base:245},{sym:"MSFT",name:"Microsoft",sector:"Tech",base:415},{sym:"META",name:"Meta",sector:"Social",base:520}]
};
var mockCache={};
function getMockData(s){if(!mockCache[s.sym])mockCache[s.sym]=genOHLC(s.base);return mockCache[s.sym];}

function CandleChart(props){
  var data=props.data,s5=props.s5,s20=props.s20,bv=props.bv,sigs=props.sigs,ind=props.ind;
  var mRef=useRef(null),sRef=useRef(null);
  useEffect(function(){
    if(!data||!data.length||!mRef.current)return;
    var cv=mRef.current,dpr=window.devicePixelRatio||1;
    cv.width=cv.offsetWidth*dpr;cv.height=300*dpr;cv.style.height="300px";
    var ctx=cv.getContext("2d");ctx.scale(dpr,dpr);
    var W=cv.offsetWidth,H=300,pd={t:16,r:66,b:28,l:8},cw=W-pd.l-pd.r,ch=H-pd.t-pd.b;
    var vis=data.slice(-60),vi=data.length-60,bvv=bv?bv.slice(-60):[];
    var allP=vis.reduce(function(a,d){return a.concat([d.h,d.l]);},[]); 
    bvv.forEach(function(b){if(b&&b.u)allP.push(b.u);if(b&&b.l)allP.push(b.l);});
    var mn=Math.min.apply(null,allP)*0.998,mx=Math.max.apply(null,allP)*1.002;
    var toY=function(v){return pd.t+ch-(v-mn)/(mx-mn)*ch;},bw=cw/vis.length;
    ctx.clearRect(0,0,W,H);
    for(var gi=0;gi<=5;gi++){var gy=pd.t+ch/5*gi;ctx.strokeStyle="rgba(255,255,255,0.05)";ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(pd.l,gy);ctx.lineTo(W-pd.r,gy);ctx.stroke();ctx.fillStyle="rgba(255,255,255,0.3)";ctx.font="10px monospace";ctx.textAlign="right";ctx.fillText((mx-(mx-mn)/5*gi).toLocaleString("ko-KR",{maximumFractionDigits:0}),W-2,gy+3);}
    if(bvv.length){["u","l","m"].forEach(function(k,ki){ctx.strokeStyle="rgba(100,180,255,0.3)";ctx.lineWidth=1;ctx.setLineDash(ki===2?[3,3]:[]);ctx.beginPath();var st=false;bvv.forEach(function(b,i){if(!b||!b[k])return;var x=pd.l+i*bw+bw/2;if(!st){ctx.moveTo(x,toY(b[k]));st=true;}else ctx.lineTo(x,toY(b[k]));});ctx.stroke();});ctx.setLineDash([]);}
    if(s5&&s20){[[s5.slice(-60),"#FFD700"],[s20.slice(-60),"#FF6B6B"]].forEach(function(pr){ctx.strokeStyle=pr[1];ctx.lineWidth=1.5;ctx.beginPath();var st=false;pr[0].forEach(function(v,i){if(!v)return;var x=pd.l+i*bw+bw/2;if(!st){ctx.moveTo(x,toY(v));st=true;}else ctx.lineTo(x,toY(v));});ctx.stroke();});}
    vis.forEach(function(d,i){var up=d.c>=d.o,col=up?"#00E5A0":"#FF4D6D",cx=pd.l+i*bw+bw/2;ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,toY(d.h));ctx.lineTo(cx,toY(d.l));ctx.stroke();ctx.fillStyle=col;ctx.fillRect(pd.l+i*bw+bw*0.15,Math.min(toY(d.o),toY(d.c)),bw*0.7,Math.abs(toY(d.c)-toY(d.o))||1);});
    if(sigs){sigs.forEach(function(sig){var li=sig.i-vi;if(li<0||li>=vis.length)return;var d=vis[li],x=pd.l+li*bw+bw/2;ctx.fillStyle=sig.t==="buy"?"#00E5A0":"#FF4D6D";ctx.beginPath();if(sig.t==="buy"){var y=toY(d.l)+12;ctx.moveTo(x,y-10);ctx.lineTo(x+5,y);ctx.lineTo(x-5,y);}else{var y2=toY(d.h)-12;ctx.moveTo(x,y2+10);ctx.lineTo(x+5,y2);ctx.lineTo(x-5,y2);}ctx.fill();});}
    ctx.fillStyle="rgba(255,255,255,0.2)";ctx.font="9px monospace";ctx.textAlign="center";[0,15,30,45,59].forEach(function(i){if(!vis[i])return;var dd=vis[i].date;ctx.fillText((dd.getMonth()+1)+"/"+dd.getDate(),pd.l+i*bw+bw/2,H-8);});
  },[data,s5,s20,bv,sigs]);
  useEffect(function(){
    if(!ind||ind==="none"||!sRef.current||!data||!data.length)return;
    var cv=sRef.current,dpr=window.devicePixelRatio||1;
    cv.width=cv.offsetWidth*dpr;cv.height=80*dpr;cv.style.height="80px";
    var ctx=cv.getContext("2d");ctx.scale(dpr,dpr);
    var W=cv.offsetWidth,H=80,pd={t:8,r:66,b:18,l:8},cw=W-pd.l-pd.r,ch=H-pd.t-pd.b,bw=cw/60;
    ctx.clearRect(0,0,W,H);
    if(ind==="rsi"){
      var rv=calcRSI(data).slice(-60);
      [30,50,70].forEach(function(v){var y=pd.t+ch-(v/100)*ch;ctx.strokeStyle=v===50?"rgba(255,255,255,0.08)":"rgba(255,80,80,0.25)";ctx.setLineDash([3,3]);ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(pd.l,y);ctx.lineTo(W-pd.r,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="rgba(255,255,255,0.25)";ctx.font="9px monospace";ctx.textAlign="right";ctx.fillText(v,W-2,y+3);});
      ctx.strokeStyle="#A78BFA";ctx.lineWidth=1.5;ctx.beginPath();var st=false;rv.forEach(function(v,i){if(!v)return;var x=pd.l+i*bw+bw/2,y=pd.t+ch-(v/100)*ch;if(!st){ctx.moveTo(x,y);st=true;}else ctx.lineTo(x,y);});ctx.stroke();
      ctx.fillStyle="rgba(167,139,250,0.7)";ctx.font="9px monospace";ctx.textAlign="left";ctx.fillText("RSI(14)",pd.l+4,pd.t+11);
    }
    if(ind==="macd"){
      var mc=calcMACD(data);var vm=mc.m.slice(-60),vs=mc.s.slice(-60),vh=mc.h.slice(-60);
      var all=vm.concat(vs).concat(vh).filter(function(v){return v!=null;});
      if(!all.length)return;
      var minV=Math.min.apply(null,all),maxV=Math.max.apply(null,all);
      var toY2=function(v){return pd.t+ch-((v-minV)/(maxV-minV))*ch;};var zY=toY2(0);
      vh.forEach(function(v,i){if(!v)return;ctx.fillStyle=v>=0?"rgba(0,229,160,0.45)":"rgba(255,77,109,0.45)";ctx.fillRect(pd.l+i*bw+bw*0.1,Math.min(toY2(v),zY),bw*0.8,Math.abs(toY2(v)-zY));});
      [[vm,"#FFD700"],[vs,"#FF6B6B"]].forEach(function(pr){ctx.strokeStyle=pr[1];ctx.lineWidth=1.5;ctx.beginPath();var st2=false;pr[0].forEach(function(v,i){if(!v)return;var x=pd.l+i*bw+bw/2;if(!st2){ctx.moveTo(x,toY2(v));st2=true;}else ctx.lineTo(x,toY2(v));});ctx.stroke();});
      ctx.fillStyle="rgba(255,215,0,0.7)";ctx.font="9px monospace";ctx.textAlign="left";ctx.fillText("MACD",pd.l+4,pd.t+11);
    }
  },[data,ind]);
  return React.createElement("div",null,
    React.createElement("canvas",{ref:mRef,style:{width:"100%",display:"block"}}),
    ind&&ind!=="none"?React.createElement("canvas",{ref:sRef,style:{width:"100%",display:"block",borderTop:"1px solid rgba(255,255,255,0.06)"}}):null
  );
}

export default function Home(){
  var ms=useState("KR"),market=ms[0],setMarket=ms[1];
  var ss=useState(DEFAULT_STOCKS.KR[0]),stock=ss[0],setStock=ss[1];
  var ts=useState("chart"),tab=ts[0],setTab=ts[1];
  var is=useState("rsi"),ind=is[0],setInd=is[1];
  var brs=useState(null),btR=brs[0],setBtR=brs[1];
  var ats=useState(""),aiText=ats[0],setAiText=ats[1];
  var als=useState(false),aiLoad=als[0],setAiLoad=als[1];
  var qs=useState(""),query=qs[0],setQuery=qs[1];
  var qrs=useState([]),searchResults=qrs[0],setSearchResults=qrs[1];
  var qls=useState(false),searching=qls[0],setSearching=qls[1];
  var qos=useState(false),showSearch=qos[0],setShowSearch=qos[1];
  var rds=useState(null),realData=rds[0],setRealData=rds[1];
  var rls=useState(false),dataLoading=rls[0],setDataLoading=rls[1];
  var res=useState(false),isRealData=res[0],setIsRealData=res[1];

  var data=realData||getMockData(stock);
  var s5=calcSMA(data,5),s20=calcSMA(data,20),bv=calcBB(data),rv=calcRSI(data);
  var sigs=getSignals(data,s5,s20,rv,bv);
  var last=data[data.length-1],prev=data[data.length-2];
  var chg=last&&prev?(last.c-prev.c)/prev.c*100:0;
  var lastRSI=rv.filter(function(v){return v!=null;}).slice(-1)[0];
  var lastSig=sigs[sigs.length-1];
  var isKR=market==="KR";
  var fmt=function(v){if(!v&&v!==0)return"—";return isKR?v.toLocaleString()+"₩":"$"+v.toFixed(2);};
  var C={g:"#00E5A0",r:"#FF4D6D",gold:"#FFD700",p:"#A78BFA",m:"rgba(255,255,255,0.3)",b:"rgba(255,255,255,0.08)"};
  var card={background:"rgba(255,255,255,0.04)",borderRadius:10,border:"1px solid rgba(255,255,255,0.08)",padding:14};

  var loadRealData=useCallback(async function(sym){
    setDataLoading(true);setRealData(null);setIsRealData(false);
    try{
      var r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"quote",symbol:sym})});
      var json=await r.json();
      if(json.rows&&json.rows.length>0){
        var parsed=json.rows.map(function(row){return{date:new Date(row.date),o:row.o,h:row.h,l:row.l,c:row.c,v:row.v};});
        setRealData(parsed);setIsRealData(true);
      }
    }catch(e){}
    setDataLoading(false);
  },[]);

  useEffect(function(){loadRealData(stock.sym);},[stock.sym]);

  var searchTimer=useRef(null);
  var doSearch=async function(kw){
    if(!kw||kw.length<1){setSearchResults([]);return;}
    setSearching(true);
    try{
      var r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"search",keyword:kw})});
      var json=await r.json();setSearchResults(json.results||[]);
    }catch(e){setSearchResults([]);}
    setSearching(false);
  };
  var onQueryChange=function(e){
    var v=e.target.value;setQuery(v);setShowSearch(true);
    clearTimeout(searchTimer.current);
    searchTimer.current=setTimeout(function(){doSearch(v);},400);
  };
  var selectResult=function(r){
    var newStock={sym:r.sym,name:r.name,sector:r.type||"—",base:100};
    var newMarket=r.region&&(r.region.includes("United States")||r.region.includes("NASDAQ")||r.region.includes("NYSE"))?"US":"KR";
    setMarket(newMarket);setStock(newStock);setQuery("");setSearchResults([]);setShowSearch(false);setAiText("");setBtR(null);
  };
  var switchMarket=function(m){setMarket(m);setStock(DEFAULT_STOCKS[m][0]);setAiText("");setBtR(null);setRealData(null);};

  var doAI=async function(){
    setAiLoad(true);setAiText("");
    try{
      var r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:stock.name,sym:stock.sym,market:market,price:fmt(last?last.c:0),chg:chg.toFixed(2),rsi:lastRSI?lastRSI.toFixed(1):"—",signal:lastSig?(lastSig.t==="buy"?"🟢매수 ":"🔴매도 ")+lastSig.r:"없음",recent5:data.slice(-5).map(function(d){return fmt(d.c);}).join(", "),s5:s5[s5.length-1]?s5[s5.length-1].toFixed(0):"—",s20:s20[s20.length-1]?s20[s20.length-1].toFixed(0):"—",bbU:bv[bv.length-1]&&bv[bv.length-1].u?bv[bv.length-1].u.toFixed(0):"—",bbL:bv[bv.length-1]&&bv[bv.length-1].l?bv[bv.length-1].l.toFixed(0):"—"})});
      var json=await r.json();setAiText(json.text||"분석 실패");
    }catch(e){setAiText("⚠️ 오류: "+e.message);}
    setAiLoad(false);
  };

  var btn=function(active,color){return{padding:"6px 12px",borderRadius:7,border:"1px solid "+(active?color:C.b),background:active?"rgba(167,139,250,0.1)":"transparent",color:active?color:C.m,cursor:"pointer",fontFamily:"inherit",fontSize:11};};

  return React.createElement("div",{style:{minHeight:"100vh",background:"linear-gradient(160deg,#080d18,#0f1a2e 60%,#080d18)",color:"#fff",fontFamily:"monospace",fontSize:13}},
    React.createElement("style",null,"*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}input::placeholder{color:rgba(255,255,255,0.3)}"),
    React.createElement("div",{style:{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)",flexWrap:"wrap"}},
      React.createElement("div",{style:{fontSize:20,fontWeight:700,letterSpacing:3,color:C.g}},"◈ QTRADE"),
      React.createElement("div",{style:{fontSize:10,color:C.m,letterSpacing:2}},"AI STOCK PLATFORM"),
      React.createElement("div",{style:{position:"relative",flex:1,maxWidth:360,margin:"0 8px"}},
        React.createElement("input",{value:query,onChange:onQueryChange,onFocus:function(){setShowSearch(true);},onBlur:function(){setTimeout(function(){setShowSearch(false);},200);},placeholder:"🔍 종목 검색 (예: AAPL, Tesla, 삼성...)",style:{width:"100%",padding:"7px 14px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,color:"#fff",fontFamily:"inherit",fontSize:12,outline:"none"}}),
        showSearch&&(searching||searchResults.length>0)?React.createElement("div",{style:{position:"absolute",top:"100%",left:0,right:0,background:"#0f1a2e",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,marginTop:4,zIndex:100,maxHeight:300,overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}},
          searching?React.createElement("div",{style:{padding:"12px 14px",color:C.m,fontSize:12}},"검색 중..."):
          searchResults.map(function(r,i){return React.createElement("div",{key:i,onMouseDown:function(){selectResult(r);},style:{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.05)",display:"flex",justifyContent:"space-between",alignItems:"center"}},
            React.createElement("div",null,React.createElement("div",{style:{fontSize:12,fontWeight:500}},r.sym),React.createElement("div",{style:{fontSize:11,color:C.m,marginTop:2}},r.name)),
            React.createElement("div",{style:{textAlign:"right"}},React.createElement("div",{style:{fontSize:10,color:C.p}},r.type),React.createElement("div",{style:{fontSize:10,color:C.m}},r.region))
          );})
        ):null
      ),
      React.createElement("div",{style:{display:"flex",gap:6}},["KR","US"].map(function(m){return React.createElement("button",{key:m,onClick:function(){switchMarket(m);},style:{padding:"5px 14px",borderRadius:6,border:"1px solid "+(market===m?C.g:C.b),background:market===m?"rgba(0,229,160,0.08)":"transparent",color:market===m?C.g:C.m,cursor:"pointer",fontFamily:"inherit",fontSize:11}},m==="KR"?"🇰🇷 국내":"🇺🇸 미국");}))
    ),
    React.createElement("div",{style:{display:"flex",height:"calc(100vh - 49px)"}},
      React.createElement("div",{style:{width:168,borderRight:"1px solid rgba(255,255,255,0.08)",overflowY:"auto",padding:10,flexShrink:0}},
        React.createElement("div",{style:{fontSize:10,color:C.m,letterSpacing:2,marginBottom:8}},market==="KR"?"KOSPI/KOSDAQ":"NYSE/NASDAQ"),
        DEFAULT_STOCKS[market].map(function(s){
          var sd=getMockData(s),sl=sd[sd.length-1]?sd[sd.length-1].c:s.base,sp=sd[sd.length-2]?sd[sd.length-2].c:s.base,sc=(sl-sp)/sp*100,sel=stock.sym===s.sym;
          return React.createElement("div",{key:s.sym,onClick:function(){setStock(s);setAiText("");setBtR(null);},style:{padding:"9px 8px",borderRadius:8,cursor:"pointer",marginBottom:3,background:sel?"rgba(0,229,160,0.07)":"transparent",border:"1px solid "+(sel?"rgba(0,229,160,0.25)":"transparent")}},
            React.createElement("div",{style:{fontSize:12,fontWeight:500,color:sel?C.g:"#fff"}},s.name),
            React.createElement("div",{style:{fontSize:10,color:C.m,marginTop:2}},s.sym),
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:11}},React.createElement("span",null,isKR?sl.toLocaleString():"$"+sl.toFixed(1)),React.createElement("span",{style:{color:sc>=0?C.g:C.r}},(sc>=0?"▲":"▼")+Math.abs(sc).toFixed(1)+"%"))
          );
        })
      ),
      React.createElement("div",{style:{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:10}},
        React.createElement("div",{style:Object.assign({},card,{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"})},
          React.createElement("div",null,
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
              React.createElement("div",{style:{fontSize:16,fontWeight:600}},stock.name),
              dataLoading?React.createElement("span",{style:{fontSize:10,color:C.gold}},"⟳ 로딩..."):isRealData?React.createElement("span",{style:{fontSize:10,color:C.g,padding:"2px 6px",background:"rgba(0,229,160,0.1)",borderRadius:4}},"실시간"):React.createElement("span",{style:{fontSize:10,color:C.m,padding:"2px 6px",background:"rgba(255,255,255,0.05)",borderRadius:4}},"데모")
            ),
            React.createElement("div",{style:{fontSize:10,color:C.m,marginTop:2}},stock.sym+" · "+stock.sector)
          ),
          React.createElement("div",null,React.createElement("div",{style:{fontSize:24,fontWeight:700}},last?fmt(last.c):"—"),React.createElement("div",{style:{color:chg>=0?C.g:C.r,fontSize:13}},(chg>=0?"▲":"▼")+" "+Math.abs(chg).toFixed(2)+"%")),
          React.createElement("div",{style:{display:"flex",gap:16,flexWrap:"wrap"}},[["RSI",lastRSI?lastRSI.toFixed(1):"—",lastRSI<30?C.g:lastRSI>70?C.r:"#fff"],["신호",lastSig?(lastSig.t==="buy"?"🟢매수":"🔴매도"):"—",C.p],["신호수",sigs.length+"개",C.gold]].map(function(it){return React.createElement("div",{key:it[0]},React.createElement("div",{style:{fontSize:10,color:C.m}},it[0]),React.createElement("div",{style:{color:it[2],fontWeight:500,marginTop:2}},it[1]));})),
          React.createElement("div",{style:{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}},[["chart","📊 차트"],["backtest","🔄 백테스트"],["portfolio","💼 포트폴리오"],["ai","🤖 AI분석"]].map(function(it){return React.createElement("button",{key:it[0],onClick:function(){setTab(it[0]);},style:btn(tab===it[0],C.p)},it[1]);}))
        ),
        tab==="chart"&&React.createElement(React.Fragment,null,
          React.createElement("div",{style:Object.assign({},card,{padding:0,overflow:"hidden"})},
            React.createElement("div",{style:{display:"flex",gap:6,padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.08)",alignItems:"center",flexWrap:"wrap"}},
              React.createElement("span",{style:{fontSize:10,color:C.m,letterSpacing:2}},"지표"),
              [["rsi","RSI"],["macd","MACD"],["none","없음"]].map(function(it){return React.createElement("button",{key:it[0],onClick:function(){setInd(it[0]);},style:btn(ind===it[0],C.gold)},it[1]);}),
              React.createElement("div",{style:{marginLeft:"auto",display:"flex",gap:10,fontSize:10,color:C.m,flexWrap:"wrap"}},[["#FFD700","MA5"],["#FF6B6B","MA20"],["rgba(100,180,255,0.7)","볼린저"],[C.g,"매수▲"],[C.r,"매도▼"]].map(function(it){return React.createElement("span",{key:it[1],style:{display:"flex",alignItems:"center",gap:4}},React.createElement("span",{style:{width:7,height:7,borderRadius:"50%",background:it[0],display:"inline-block"}}),it[1]);}))
            ),
            dataLoading?React.createElement("div",{style:{height:300,display:"flex",alignItems:"center",justifyContent:"center",color:C.m}},"⟳ 실시간 데이터 불러오는 중..."):React.createElement(CandleChart,{data:data,s5:s5,s20:s20,bv:bv,sigs:sigs,ind:ind})
          ),
          React.createElement("div",{style:card},
            React.createElement("div",{style:{fontSize:10,letterSpacing:2,color:C.m,marginBottom:10}},"매매 신호 내역"),
            React.createElement("div",{style:{overflowX:"auto"}},React.createElement("table",{style:{width:"100%",borderCollapse:"collapse",fontSize:12}},
              React.createElement("thead",null,React.createElement("tr",null,["날짜","유형","사유","강도","가격"].map(function(h){return React.createElement("th",{key:h,style:{padding:"5px 8px",textAlign:"left",color:C.m,fontWeight:400,borderBottom:"1px solid rgba(255,255,255,0.08)"}},h);}))),
              React.createElement("tbody",null,sigs.slice(-8).reverse().map(function(sig,i){var d=data[sig.i];return React.createElement("tr",{key:i},React.createElement("td",{style:{padding:"6px 8px",color:C.m}},d?d.date.toLocaleDateString("ko-KR"):"—"),React.createElement("td",{style:{padding:"6px 8px"}},React.createElement("span",{style:{padding:"2px 9px",borderRadius:20,fontSize:11,background:sig.t==="buy"?"rgba(0,229,160,0.12)":"rgba(255,77,109,0.12)",color:sig.t==="buy"?C.g:C.r}},sig.t==="buy"?"매수":"매도")),React.createElement("td",{style:{padding:"6px 8px"}},sig.r),React.createElement("td",{style:{padding:"6px 8px"}},"⭐".repeat(sig.score)),React.createElement("td",{style:{padding:"6px 8px"}},d?fmt(d.c):"—"));}))
            ))
          )
        ),
        tab==="backtest"&&React.createElement("div",{style:card},
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}},
            React.createElement("div",null,React.createElement("div",{style:{fontSize:15,fontWeight:600}},"백테스팅 시뮬레이션"),React.createElement("div",{style:{fontSize:11,color:C.m,marginTop:4}},"기술적 신호 기반 · 초기자금 1,000만원")),
            React.createElement("button",{onClick:function(){setBtR(runBacktest(data,sigs));},style:{padding:"9px 22px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#00E5A0,#00B4D8)",color:"#000",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:13}},"▶ 실행")
          ),
          btR?React.createElement(React.Fragment,null,
            React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}},[["전략 수익률",btR.roi.toFixed(2)+"%",btR.roi>=0?C.g:C.r],["Buy & Hold",btR.bh.toFixed(2)+"%",btR.bh>=0?C.g:C.r],["최종자산",(btR.fin/10000).toFixed(0)+"만원",C.gold],["거래횟수",btR.trades.length+"회",C.p]].map(function(it){return React.createElement("div",{key:it[0],style:{background:"rgba(255,255,255,0.04)",borderRadius:9,padding:14,textAlign:"center"}},React.createElement("div",{style:{fontSize:10,color:C.m}},it[0]),React.createElement("div",{style:{fontSize:20,fontWeight:700,color:it[2],marginTop:6}},it[1]));})),
            React.createElement("div",{style:{maxHeight:260,overflowY:"auto"}},React.createElement("table",{style:{width:"100%",borderCollapse:"collapse",fontSize:12}},
              React.createElement("thead",null,React.createElement("tr",null,["날짜","액션","사유","수량","가격"].map(function(h){return React.createElement("th",{key:h,style:{padding:"5px 8px",textAlign:"left",color:C.m,fontWeight:400,borderBottom:"1px solid rgba(255,255,255,0.08)"}},h);}))),
              React.createElement("tbody",null,btR.trades.map(function(t,i){return React.createElement("tr",{key:i},React.createElement("td",{style:{padding:"6px 8px",color:C.m}},t.date?t.date.toLocaleDateString("ko-KR"):"—"),React.createElement("td",{style:{padding:"6px 8px",color:t.action==="매수"?C.g:C.r}},t.action),React.createElement("td",{style:{padding:"6px 8px"}},t.r),React.createElement("td",{style:{padding:"6px 8px"}},t.qty?t.qty.toLocaleString():"—"),React.createElement("td",{style:{padding:"6px 8px"}},fmt(t.price)));}))
            ))
          ):React.createElement("div",{style:{textAlign:"center",padding:60,color:C.m}},"▶ 실행 버튼을 눌러 시작하세요")
        ),
        tab==="portfolio"&&(function(){
          var pf=[{sym:"005930",name:"삼성전자",qty:10,avg:71000,mkt:"KR",base:73000},{sym:"NVDA",name:"NVIDIA",qty:5,avg:820,mkt:"US",base:875},{sym:"AAPL",name:"Apple",qty:8,avg:185,mkt:"US",base:198},{sym:"035420",name:"NAVER",qty:3,avg:210000,mkt:"KR",base:218000}].map(function(p){var s=DEFAULT_STOCKS.KR.concat(DEFAULT_STOCKS.US).find(function(s){return s.sym===p.sym;});var d=s?getMockData(s):null;var cur=d&&d[d.length-1]?d[d.length-1].c:p.base;var pl=(cur-p.avg)*p.qty;var fmtP=function(v){return p.mkt==="US"?"$"+v.toFixed(2):v.toLocaleString()+"₩";};return Object.assign({},p,{cur:cur,pl:pl,plPct:(cur-p.avg)/p.avg*100,fmtP:fmtP});});
          var total=pf.reduce(function(s,p){return s+p.pl;},0);
          return React.createElement("div",{style:card},
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}},React.createElement("div",{style:{fontSize:15,fontWeight:600}},"내 포트폴리오"),React.createElement("div",{style:{textAlign:"right"}},React.createElement("div",{style:{fontSize:10,color:C.m}},"총 평가손익"),React.createElement("div",{style:{fontSize:22,fontWeight:700,color:total>=0?C.g:C.r,marginTop:2}},(total>=0?"+":"")+(total/10000).toFixed(1)+"만원"))),
            React.createElement("div",{style:{overflowX:"auto"}},React.createElement("table",{style:{width:"100%",borderCollapse:"collapse",fontSize:12}},
              React.createElement("thead",null,React.createElement("tr",null,["종목","시장","수량","평균단가","현재가","평가손익","수익률"].map(function(h){return React.createElement("th",{key:h,style:{padding:"6px 10px",textAlign:"left",color:C.m,fontWeight:400,borderBottom:"1px solid rgba(255,255,255,0.08)"}},h);}))),
              React.createElement("tbody",null,pf.map(function(p,i){return React.createElement("tr",{key:i},React.createElement("td",{style:{padding:"10px"}},React.createElement("div",{style:{fontWeight:500}},p.name),React.createElement("div",{style:{fontSize:10,color:C.m}},p.sym)),React.createElement("td",{style:{padding:"10px"}},React.createElement("span",{style:{padding:"2px 8px",borderRadius:4,fontSize:10,background:p.mkt==="KR"?"rgba(60,100,255,0.15)":"rgba(255,120,50,0.15)",color:p.mkt==="KR"?"#6699FF":"#FFA07A"}},p.mkt)),React.createElement("td",{style:{padding:"10px"}},p.qty),React.createElement("td",{style:{padding:"10px",color:C.m}},p.fmtP(p.avg)),React.createElement("td",{style:{padding:"10px"}},p.fmtP(p.cur)),React.createElement("td",{style:{padding:"10px",color:p.pl>=0?C.g:C.r}},(p.pl>=0?"+":"")+(p.pl/10000).toFixed(1)+"만"),React.createElement("td",{style:{padding:"10px",color:p.plPct>=0?C.g:C.r}},(p.plPct>=0?"+":"")+p.plPct.toFixed(2)+"%"));}))
            ))
          );
        })(),
        tab==="ai"&&React.createElement("div",{style:card},
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}},
            React.createElement("div",null,React.createElement("div",{style:{fontSize:15,fontWeight:600}},"🤖 Claude AI 기술적 분석"),React.createElement("div",{style:{fontSize:11,color:C.m,marginTop:4}},"RSI · 이동평균 · 볼린저밴드 · 매매신호 종합")),
            React.createElement("button",{onClick:doAI,disabled:aiLoad,style:{padding:"9px 22px",borderRadius:8,border:"none",background:aiLoad?"rgba(167,139,250,0.25)":"linear-gradient(135deg,#A78BFA,#6366f1)",color:"#fff",fontWeight:700,cursor:aiLoad?"not-allowed":"pointer",fontFamily:"inherit",fontSize:13}},aiLoad?"⚙️ 분석 중...":"분석 시작")
          ),
          aiText?React.createElement("div",{style:{background:"rgba(167,139,250,0.05)",border:"1px solid rgba(167,139,250,0.15)",borderRadius:10,padding:18,lineHeight:1.8,fontSize:13}},aiText.split("\n").map(function(line,i){if(line.startsWith("**")&&line.endsWith("**"))return React.createElement("div",{key:i,style:{fontWeight:700,color:C.p,marginTop:10}},line.replace(/\*\*/g,""));return React.createElement("div",{key:i,dangerouslySetInnerHTML:{__html:line.replace(/\*\*(.+?)\*\*/g,"<strong style=\"color:#FFD700\">$1</strong>")||"\u00a0"}});})):
          React.createElement("div",{style:{textAlign:"center",padding:60,color:C.m}},aiLoad?"분석 중...":"분석 시작 버튼을 눌러주세요"),
          React.createElement("div",{style:{marginTop:12,padding:10,background:"rgba(255,255,255,0.02)",borderRadius:8,fontSize:11,color:"rgba(255,255,255,0.2)"}},"⚠️ 기술적 지표 기반 참고용입니다. 실제 투자는 본인 책임입니다.")
        )
      )
    )
  );
}
