/* D9 / Educational hydraulics, synthetic mechanism-inspired proxy + miniature GA.
   Important: This is NOT a trained MLP or a connected rig control system. */
(function(){
'use strict';
const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
const C={jade:'#2f7d6b',blue:'#41699b',clay:'#b26a39',bad:'#b05a51',line:'#e9e4d8',ink:'#79828a',sand:'#d1b98c'};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const fmt=(x,n=1)=>Number(x).toFixed(n);
const FLOW_MIN=18,FLOW_MAX=52, P_LIMIT=14.0, V_LIMIT=100, PUMP_KW_LIMIT=850, ECD_MIN=1.10,ECD_MAX=1.43;
const CD=.95, TVD=3000, ETA=.85, NOZZLES=[10,11,12,13,14,16];
const state={q:29.7,targetQ:29.7,rho:1200,pv:28,nozzle:12,mode:'hold',seconds:0,logs:[],feedback:0,alarm:false,changePending:false};
let recommended=null;
const initialHydro=calcHydro(29.7,12,1200,28);
const rndSeed=(seed)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
function totalArea(mm){return 3*Math.PI*Math.pow(mm/1000,2)/4;}
function calcHydro(q,mm,rho,pv){
  // Standard orifice pressure loss in SI: Pa = rho * Q^2 / (2 * Cd^2 * At^2)
  const Q=q/1000, At=totalArea(mm);
  const bitMPa=rho*Q*Q/(2*CD*CD*At*At)/1e6;
  // Synthetic, depth- and rheology-conditioned surrogate for surface / drill string / annulus losses.
  const rhoFactor=Math.pow(rho/1200,.30),muFactor=Math.pow(pv/28,.46);
  const systemMPa=2.2+0.0041*q*q*rhoFactor*muFactor+0.012*q;
  const annulusMPa=0.0016*q*q*rhoFactor*Math.pow(pv/28,.50);
  const pumpMPa=bitMPa+systemMPa;
  const powerKW=bitMPa*q; // MPa * L/s = kW
  const jetSpeed=Q/At;
  const shaftKW=pumpMPa*q/ETA;
  const ecd=rho/1000+annulusMPa/(0.00981*TVD);
  return {q,mm,rho,pv,bitMPa,systemMPa,annulusMPa,pumpMPa,powerKW,jetSpeed,shaftKW,ecd,At};
}
function violations(h){
  const a=[];
  if(h.pumpMPa>P_LIMIT+1e-8)a.push('泵压越过 '+fmt(P_LIMIT)+' MPa');
  if(h.jetSpeed>V_LIMIT+1e-8)a.push('喷嘴速度超过教学限值');
  if(h.shaftKW>PUMP_KW_LIMIT+1e-8)a.push('泵轴功率越限');
  if(h.ecd<ECD_MIN||h.ecd>ECD_MAX)a.push('ECD 不在教学窗口内');
  return a;
}
function merit(h,baseQ=29.7){
  if(violations(h).length)return -Infinity;
  // Weighted objective: maximize jet power, modestly penalize changing the flow.
  return h.powerKW-.12*Math.pow(h.q-26,2)-.0*Math.abs(h.q-baseQ);
}
function optimize(rho,pv){
  const rand=rndSeed(20261103),pop=[];
  const snapQ=v=>clamp(Math.round((v-FLOW_MIN)/2)*2+FLOW_MIN,FLOW_MIN,FLOW_MAX);
  const randomIndividual=()=>({q:FLOW_MIN+rand()*(FLOW_MAX-FLOW_MIN),d:NOZZLES[Math.floor(rand()*NOZZLES.length)]});
  for(let i=0;i<30;i++)pop.push(randomIndividual());
  let champion=null;
  function evaluate(ind){const q=snapQ(ind.q),d=NOZZLES.reduce((a,b)=>Math.abs(b-ind.d)<Math.abs(a-ind.d)?b:a,NOZZLES[0]);const h=calcHydro(q,d,rho,pv);return {...h,score:merit(h)};}
  for(let gen=0;gen<42;gen++){
    const ranked=pop.map(evaluate).sort((a,b)=>b.score-a.score);
    if(!champion||ranked[0].score>champion.score)champion=ranked[0];
    const parents=ranked.slice(0,10).filter(x=>Number.isFinite(x.score));
    if(!parents.length){for(let i=0;i<30;i++)pop[i]=randomIndividual();continue;}
    const next=ranked.slice(0,5).map(x=>({q:x.q,d:x.mm}));
    while(next.length<30){
      const a=parents[Math.floor(rand()*parents.length)],b=parents[Math.floor(rand()*parents.length)];
      const child={q:rand()<.5?a.q:b.q,d:rand()<.5?a.mm:b.mm};
      if(rand()<.30)child.q=clamp(child.q+(rand()-.5)*12,FLOW_MIN,FLOW_MAX);
      if(rand()<.20)child.d=NOZZLES[Math.floor(rand()*NOZZLES.length)];
      next.push(child);
    }
    pop.splice(0,pop.length,...next);
  }
  // Finite-grid engineering feasibility cross-check; avoids claiming GA global optimality.
  for(let q=FLOW_MIN;q<=FLOW_MAX;q+=2)for(const d of NOZZLES){const h=calcHydro(q,d,rho,pv);const score=merit(h);if(!champion||score>champion.score)champion={...h,score};}
  return champion&&Number.isFinite(champion.score)?champion:null;
}
function svgEl(parent,tag,attrs={},text){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=String(text);parent.appendChild(el);return el;}
function clearSVG(id){const s=$(id);while(s.firstChild)s.removeChild(s.firstChild);return s;}
function line(s,x1,y1,x2,y2,color=C.line,dash=''){return svgEl(s,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,...(dash?{'stroke-dasharray':dash}:{})});}
function txt(s,x,y,value,attrs={}){return svgEl(s,'text',{x,y,'font-size':11,fill:C.ink,...attrs},value);}
function polygon(s,pts,color){if(pts.length<2)return;svgEl(s,'path',{d:'M'+pts.map(p=>fmt(p[0],2)+' '+fmt(p[1],2)).join('L'),fill:'none',stroke:color,'stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'});}
function polyDash(s,pts,color,dash){if(pts.length<2)return;svgEl(s,'path',{d:'M'+pts.map(p=>fmt(p[0],2)+' '+fmt(p[1],2)).join('L'),fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':dash,'stroke-linecap':'round'});}
function draft(){return calcHydro(+$('flow-input').value,+$('nozzle-input').value,+$('rho-input').value,+$('pv-input').value);}
function drawHydro(){
  const s=clearSVG('hydro-chart'),L=60,R=823,T=38,B=310;
  const prev=draft(),current=calcHydro(state.q,state.nozzle,state.rho,state.pv),opt=recommended||current;
  let maxP=Math.max(23,calcHydro(FLOW_MAX,prev.mm,prev.rho,prev.pv).pumpMPa*1.10);
  maxP=Math.min(78,Math.ceil(maxP/5)*5);
  let maxPower=0;for(let q=FLOW_MIN;q<=FLOW_MAX;q++)maxPower=Math.max(maxPower,calcHydro(q,prev.mm,prev.rho,prev.pv).powerKW);maxPower=Math.ceil(Math.max(250,maxPower*1.08)/100)*100;
  const x=q=>L+(q-FLOW_MIN)/(FLOW_MAX-FLOW_MIN)*(R-L),yP=p=>B-p/maxP*(B-T),yW=v=>B-v/maxPower*(B-T);
  svgEl(s,'rect',{x:L,y:T,width:R-L,height:B-T,fill:'#fdfcf9',rx:3});
  svgEl(s,'rect',{x:L,y:T,width:R-L,height:Math.max(0,yP(P_LIMIT)-T),fill:'#f9e9e5',opacity:.5});
  for(let i=0;i<=5;i++){const p=maxP*i/5,y=yP(p);line(s,L,y,R,y,'#eae7df','3 5');txt(s,L-8,y+4,fmt(p,0),{'text-anchor':'end'});txt(s,R+8,y+4,fmt(maxPower*i/5,0),{'text-anchor':'start',fill:C.blue});}
  for(let q=18;q<=52;q+=4){const xx=x(q);line(s,xx,T,xx,B,'#f1eee8','3 5');txt(s,xx,B+19,q,{'text-anchor':'middle'});}
  line(s,L,T,L,B,'#afb2ab');line(s,R,T,R,B,'#afb2ab');line(s,L,B,R,B,'#afb2ab');
  txt(s,L,T-15,'立管压力 P / MPa',{'font-size':11,fill:'#4d565b','font-weight':650});txt(s,R,T-15,'钻头水功率 / kW',{'font-size':11,fill:C.blue,'font-weight':650,'text-anchor':'end'});
  txt(s,(L+R)/2,358,'排量 Q / (L/s)',{'text-anchor':'middle','font-size':12,fill:'#4d565b'});
  const yLimit=yP(P_LIMIT);line(s,L,yLimit,R,yLimit,C.bad,'8 5');txt(s,R-8,yLimit-7,'教学泵压红线 '+fmt(P_LIMIT,1)+' MPa',{'text-anchor':'end',fill:C.bad,'font-size':11});
  const pressures=[],powers=[];for(let q=FLOW_MIN;q<=FLOW_MAX;q+=.5){const h=calcHydro(q,prev.mm,prev.rho,prev.pv);pressures.push([x(q),yP(h.pumpMPa)]);powers.push([x(q),yW(h.powerKW)]);}
  polygon(s,pressures,C.jade);polygon(s,powers,C.blue);
  const mark=(h,c,r=5)=>{svgEl(s,'circle',{cx:x(h.q),cy:yP(h.pumpMPa),r,stroke:'#fff','stroke-width':2,fill:c});svgEl(s,'circle',{cx:x(h.q),cy:yW(h.powerKW),r:r-.6,stroke:'#fff','stroke-width':1.6,fill:c});};
  mark(current,C.jade,5.5);mark(prev,violations(prev).length?C.bad:C.clay,5);mark(opt,C.blue,4.8);
  const xx=x(prev.q);line(s,xx,T,xx,B,C.clay,'3 6');
  txt(s,L+5,T+15,'颜色：绿色压力 / 蓝色功率 / 陶色人工草案',{'font-size':10,fill:'#79828a'});
}
function drawBudget(){
  const s=clearSVG('budget-chart'),h=calcHydro(state.q,state.nozzle,state.rho,state.pv),left=65,right=820,top=56,bottom=123,scale=p=>left+clamp(p/P_LIMIT,0,1.6)*(right-left);
  svgEl(s,'rect',{x:left,y:top,width:right-left,height:bottom-top,rx:4,fill:'#f4f2eb',stroke:'#e9e4d8'});
  const wSys=Math.max(0,scale(h.systemMPa)-left),wBit=Math.max(0,scale(h.systemMPa+h.bitMPa)-scale(h.systemMPa));
  svgEl(s,'rect',{x:left,y:top,width:Math.min(right-left,wSys),height:bottom-top,fill:C.blue});
  svgEl(s,'rect',{x:Math.min(right,scale(h.systemMPa)),y:top,width:Math.max(0,Math.min(right,scale(h.systemMPa+h.bitMPa))-Math.min(right,scale(h.systemMPa))),height:bottom-top,fill:C.jade});
  line(s,right,top-11,right,bottom+5,C.bad,'5 4');txt(s,right,top-18,fmt(P_LIMIT,1)+' MPa 红线',{'text-anchor':'end','font-size':11,fill:C.bad});
  for(let p=0;p<=14;p+=2){const x=scale(p);line(s,x,bottom,x,bottom+4);txt(s,x,bottom+20,p,{'text-anchor':'middle','font-size':11});}
  txt(s,left,38,'压力 / MPa（按执行工况）',{'font-size':11,fill:'#4d565b','font-weight':650});
  txt(s,left,172,`系统压耗 ${fmt(h.systemMPa,2)} MPa`,{'font-size':11,fill:C.blue});
  txt(s,410,172,`喷嘴压降 ${fmt(h.bitMPa,2)} MPa`,{'font-size':11,fill:C.jade});
  txt(s,818,188,`裕度 ${fmt(P_LIMIT-h.pumpMPa,2)} MPa`,{'text-anchor':'end','font-size':11,fill:P_LIMIT>=h.pumpMPa?'#4d565b':C.bad});
  if(h.pumpMPa>P_LIMIT){txt(s,430,98,'教学越限：超过红线的压力不应下发现场',{'text-anchor':'middle',fill:'#fff','font-weight':700,'font-size':13});}
}
function drawNozzle(){
  const s=clearSVG('nozzle-chart'),h=draft();
  svgEl(s,'rect',{x:18,y:17,width:864,height:162,rx:6,fill:'#fdfcf9',stroke:'#ece8df'});
  const p=[[152,71],[235,71],[194,128]],r=(h.mm-6)*2.5+8;
  for(let i=0;i<3;i++){const [cx,cy]=p[i];svgEl(s,'circle',{cx,cy,r:27,fill:'#dce6e1',stroke:'#7d958a','stroke-width':2});svgEl(s,'circle',{cx,cy,r:r/2,fill:'#41699b',stroke:'#fff','stroke-width':2});}
  txt(s,57,37,'三喷嘴俯视 · 结构示意',{'font-weight':650,'font-size':12,fill:'#4d565b'});
  txt(s,360,59,'总喷嘴过流面积 Aₜ',{'font-size':12,fill:'#79828a'});
  txt(s,360,90,fmt(h.At*1e6,0)+' mm²',{'font-size':23,'font-weight':700,fill:C.jade});
  txt(s,360,125,'喷嘴组合 3 × '+h.mm+' mm',{'font-size':12,fill:'#4d565b'});
  line(s,586,109,686,109,C.blue,'5 4');svgEl(s,'path',{d:'M674 102L686 109L674 116',stroke:C.blue,'stroke-width':2.5,fill:'none'});
  txt(s,597,68,'喷嘴射流速度 v',{'font-size':12,fill:'#79828a'});
  txt(s,597,94,fmt(h.jetSpeed,1)+' m/s',{'font-size':22,'font-weight':700,fill:h.jetSpeed>V_LIMIT?C.bad:C.blue});
  txt(s,597,141,'蓝色表示流量经喷嘴加速',{'font-size':11,fill:'#79828a'});
}
function drawSensitivity(){
  const s=clearSVG('sensitivity-chart');
  const h=draft(),left=68,right=818,top=28,bottom=218;
  const values=NOZZLES.map(d=>calcHydro(h.q,d,h.rho,h.pv));
  const maxP=Math.max(21,Math.max(...values.map(v=>v.pumpMPa))*1.10),maxW=Math.max(150,Math.max(...values.map(v=>v.powerKW))*1.10);
  const px=d=>left+((NOZZLES.indexOf(d)+.5)/NOZZLES.length)*(right-left),yP=p=>bottom-p/maxP*(bottom-top),yW=w=>bottom-w/maxW*(bottom-top);
  svgEl(s,'rect',{x:left,y:top,width:right-left,height:bottom-top,fill:'#fdfcf9',rx:3});
  for(let i=0;i<=4;i++){const p=maxP*i/4,y=yP(p);line(s,left,y,right,y,'#eae7df','3 5');txt(s,left-9,y+4,fmt(p,0),{'text-anchor':'end'});txt(s,right+7,y+4,fmt(maxW*i/4,0),{fill:C.jade});}
  for(const v of values){
    const xx=px(v.mm),w=36;
    const rejected=violations(v).length>0;
    svgEl(s,'rect',{x:xx-37,y:yP(v.pumpMPa),width:w,height:Math.max(0,bottom-yP(v.pumpMPa)),rx:2,fill:rejected?C.bad:C.blue,opacity:rejected?.58:.85});
    svgEl(s,'rect',{x:xx+2,y:yW(v.powerKW),width:w,height:Math.max(0,bottom-yW(v.powerKW)),rx:2,fill:C.jade,opacity:rejected?.3:.83});
    txt(s,xx,bottom+20,'3×'+v.mm,{'text-anchor':'middle','font-size':11,'font-weight':v.mm===h.mm?700:400,fill:v.mm===h.mm?C.jade:C.ink});
    if(rejected)txt(s,xx,yP(v.pumpMPa)-8,'越限',{'text-anchor':'middle','font-size':10,fill:C.bad});
  }
  line(s,left,yP(P_LIMIT),right,yP(P_LIMIT),C.bad,'7 5');
  txt(s,right-6,yP(P_LIMIT)-8,'泵压限额 '+fmt(P_LIMIT,1)+' MPa',{'text-anchor':'end','font-size':10.5,fill:C.bad});
  txt(s,left,15,'立管泵压 / MPa',{'font-size':11,fill:C.blue});txt(s,right,15,'井底水功率 / kW',{'text-anchor':'end','font-size':11,fill:C.jade});
  txt(s,(left+right)/2,269,'三喷嘴直径组合 / mm · 固定人工草案排量 '+fmt(h.q,1)+' L/s',{'text-anchor':'middle','font-size':11,fill:'#4d565b'});
}
function appendLog(kind,info,bad=false){
  state.feedback++;state.logs.unshift({kind,info,bad,seconds:state.seconds});state.logs.length=Math.min(state.logs.length,8);
  const list=$('audit-list');list.replaceChildren();
  for(const v of state.logs){const li=document.createElement('li');li.textContent=`T+${Math.round(v.seconds)} s｜${v.kind}：${v.info}`;if(v.bad)li.classList.add('alert');list.appendChild(li);}
  $('audit-count').textContent=String(state.feedback);
}
function updateControls(){
  for(const [id,out,suffix] of [['flow-input','flow-out',' L/s'],['rho-input','rho-out',' kg/m³']]){
    const input=$(id);$(out).textContent=(id==='flow-input'?fmt(+input.value,1):input.value)+suffix;
    input.style.setProperty('--pct',fmt(100*(+input.value- +input.min)/(+input.max- +input.min),1)+'%');
  }
  $('nozzle-out').textContent='3×'+$('nozzle-input').value+' mm';$('pv-out').textContent=$('pv-input').value+' mPa·s';
}
function refresh(){
  const h=calcHydro(state.q,state.nozzle,state.rho,state.pv),p=draft(),pIssues=violations(p),hIssues=violations(h);
  recommended=optimize(p.rho,p.pv);
  $('now-flow').textContent=fmt(h.q,1);$('now-pressure').textContent=fmt(h.pumpMPa,2);$('now-power').textContent=fmt(h.powerKW,1);$('now-nozzle').textContent='3×'+h.mm;$('sim-time').textContent='T+'+Math.round(state.seconds)+' s';
  $('p-limit').textContent=fmt(P_LIMIT,1)+' MPa';
  const box=$('preview-box');box.classList.toggle('warning',pIssues.length>0);
  box.textContent=pIssues.length?`人工草案越限：${pIssues.join('、')}。预计立压 ${fmt(p.pumpMPa,2)} MPa；仅供风险教学，不能下发。`:`草案通过教学硬约束：泵压 ${fmt(p.pumpMPa,2)} MPa，水功率 ${fmt(p.powerKW,1)} kW；需人工复核。`;
  const bar=$('statebar'),ai=$('ai-card');bar.classList.toggle('danger',hIssues.length>0);bar.classList.toggle('warning',!hIssues.length&&pIssues.length>0);ai.classList.toggle('warning',hIssues.length>0||pIssues.length>0);
  $('state-code').textContent=hIssues.length?'OVERLIMIT':pIssues.length?'CANDIDATE WARNING':'MONITORING';
  $('state-message').textContent=hIssues.length?'严重警告：模拟执行工况越限，停止风险操作':pIssues.length?'人工草案越限：执行工况未改变':state.mode==='ai'?'工程师已采纳 AI 候选 · 教学渐进执行中':'Human-in-the-loop：工程师保留最终授权';
  $('ai-title').textContent=hIssues.length?'执行工况风险：请复核并回到安全参数':pIssues.length?'候选草案有越限风险：仅建议安全方案':'通过硬约束筛选，等待工程师审核';
  if(recommended){
    $('rec-flow').textContent=fmt(recommended.q,0)+' L/s';$('rec-nozzle').textContent='3×'+recommended.mm+' mm';$('rec-pressure').textContent=fmt(recommended.pumpMPa,2)+' MPa';
    const base=calcHydro(29.7,12,p.rho,p.pv);const pct=100*(recommended.powerKW/base.powerKW-1);
    $('rec-uplift').textContent=(pct>=0?'+':'')+fmt(pct,1)+'%';
    $('ai-reason').textContent=`教学 GA 搜索：推荐 ${fmt(recommended.q,0)} L/s、3×${recommended.mm} mm，预测喷嘴水功率 ${fmt(recommended.powerKW,1)} kW；相对同密度下 29.7 L/s、3×12 mm 基准提高 ${fmt(pct,1)}%。`;
  }else{
    $('rec-flow').textContent='无可行解';$('rec-nozzle').textContent='—';$('rec-pressure').textContent='—';$('rec-uplift').textContent='—';
    $('ai-reason').textContent='候选集无法满足全部约束。请重新评估设备/井控边界，不得越界强求功率。';
  }
  $('accept-ai').disabled=!recommended;
  const check=(id,text,bad=false)=>{const e=$(id);e.textContent=text;e.classList.toggle('bad',bad);};
  check('check-pressure',fmt(h.pumpMPa,2)+' / '+fmt(P_LIMIT,1)+' MPa',h.pumpMPa>P_LIMIT);
  check('check-jet',fmt(h.jetSpeed,1)+' / '+V_LIMIT+' m/s',h.jetSpeed>V_LIMIT);
  check('check-ecd',fmt(h.ecd,3)+' g/cm³',h.ecd<ECD_MIN||h.ecd>ECD_MAX);
  check('check-risk',hIssues.length?'执行越限（风险教学）':pIssues.length?'草案越限（未执行）':'教学约束内',hIssues.length>0);
  drawHydro();drawBudget();drawNozzle();drawSensitivity();
}
function applyAI(){
  const r=optimize(+$('rho-input').value,+$('pv-input').value);
  if(!r){appendLog('AI 暂无可行解','候选均未满足硬安全约束',true);refresh();return;}
  const previous=state.nozzle;
  $('flow-input').value=r.q;$('nozzle-input').value=r.mm;
  state.rho=+$('rho-input').value;state.pv=+$('pv-input').value;state.targetQ=r.q;state.nozzle=r.mm;state.mode='ai';state.alarm=false;
  updateControls();
  appendLog('工程师采纳 AI',`批准目标 ${r.q} L/s、3×${r.mm} mm；预测泵压 ${fmt(r.pumpMPa,2)} MPa${previous!==r.mm?'；喷嘴按下一趟钻具组合模拟更换':''}`);
  $('decision-note').textContent=previous!==r.mm?'人工批准完成：本网页将喷嘴调整视为模拟下一趟 BHA 更换；排量渐进调整。':'人工批准完成：模拟排量逐步逼近建议值；继续核查井底 ECD 与设备状态。';
  refresh();
}
function applyManual(){
  const h=draft(),bad=violations(h).length>0,prev=state.nozzle;
  state.targetQ=h.q;state.rho=h.rho;state.pv=h.pv;state.nozzle=h.mm;state.mode='manual';
  if(bad){state.q=h.q;state.alarm=true;}else{state.alarm=false;}
  appendLog('工程师人工设定',`${fmt(h.q,1)} L/s、3×${h.mm} mm、预测立压 ${fmt(h.pumpMPa,2)} MPa${bad?'；越限风险仅用于教学展示':''}${prev!==h.mm?'；模拟下一趟更换喷嘴':''}`,bad);
  $('decision-note').textContent=bad?'教学越限已触发红色风险提示；真实现场不得据此下发操作。':'人工方案已授权；若喷嘴规格发生改变，应视为下一趟钻具组合计划。';
  refresh();
}
function manualReduce(){
  const v=Math.max(+$('flow-input').min,+$('flow-input').value-2);$('flow-input').value=fmt(v,1);
  updateControls();$('decision-note').textContent='已将草案排量降低 2 L/s，仍需点击“执行人工设定”才能修改模拟执行参数。';refresh();
}
function reset(){
  Object.assign(state,{q:29.7,targetQ:29.7,rho:1200,pv:28,nozzle:12,mode:'hold',seconds:0,logs:[],feedback:0,alarm:false});
  $('flow-input').value='29.7';$('rho-input').value='1200';$('pv-input').value='28';$('nozzle-input').value='12';
  $('audit-list').innerHTML='<li>教学系统已重置，等待工程师明确授权。</li>';$('audit-count').textContent='0';$('decision-note').textContent='滑块只预览；人工审批后才改变教学执行状态。不同喷嘴需模拟起钻更换。';
  updateControls();refresh();
}
function setTab(key,writeHash=true){
  key=['bg','flow','demo'].includes(key)?key:'bg';
  for(const b of document.querySelectorAll('[data-tab]')){const selected=b.dataset.tab===key;b.classList.toggle('on',selected);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}
  for(const p of document.querySelectorAll('.panel'))p.hidden=p.id!=='panel-'+key;
  if(writeHash&&location.hash!=='#/scene/d9-hydraulics?tab='+key)location.hash='#/scene/d9-hydraulics?tab='+key;
}
function readHash(){const m=location.hash.match(/[?&]tab=(bg|flow|demo)/);return m?m[1]:'bg';}
function init(){
  for(const tab of document.querySelectorAll('[data-tab]'))tab.addEventListener('click',()=>setTab(tab.dataset.tab));
  window.addEventListener('hashchange',()=>setTab(readHash(),false));setTab(readHash(),false);
  for(const id of ['flow-input','rho-input','nozzle-input','pv-input'])$(id).addEventListener(id==='flow-input'||id==='rho-input'?'input':'change',()=>{updateControls();refresh();});
  $('accept-ai').addEventListener('click',applyAI);$('apply-manual').addEventListener('click',applyManual);$('manual-reduce').addEventListener('click',manualReduce);$('reset').addEventListener('click',reset);
  updateControls();refresh();
  setInterval(()=>{
    state.seconds+=.5;
    if(state.mode!=='hold'&&Math.abs(state.q-state.targetQ)>.04){
      // An engineer-approved AI recovery plan reduces a simulated unsafe flow promptly;
      // ordinary manual setpoint movements remain gentler. No equipment is connected.
      const gain=state.mode==='ai'?.33:.19;
      const step=state.mode==='ai'?4.5:1.7;
      state.q+=clamp((state.targetQ-state.q)*gain,-step,step);
      if(Math.abs(state.q-state.targetQ)<.06)state.q=state.targetQ;
    }
    if(state.mode==='ai'&&Math.abs(state.q-state.targetQ)<.06)state.mode='ai';
    refresh();
  },500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
