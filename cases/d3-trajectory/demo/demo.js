/* d3 · 二维井眼轨迹控制教学模拟器。无需网络和外部依赖，不下发任何真实设备命令。 */
(() => {
'use strict';
const NS='http://www.w3.org/2000/svg';
const $=id=>document.getElementById(id);
const rad=x=>x*Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const f=(v,p=1)=>Number(v).toFixed(p);
const START=3000, END=3300, STEP=3, HORIZON=30;
const TRUE_GAIN=0.160, DLS_LIMIT=4.5;
// 隐藏的合成地层倾角改变自然造斜偏置；仅生成物理扰动，非真实岩层模型。
const hiddenFormationDip=md=>8+2*Math.sin(md/70);
const hiddenGeologyBias=md=>.006+.0015*hiddenFormationDip(md);
const Q_POS=.12, Q_HEADING=.035, R_U=.012, S_DU=.016, Q_TERMINAL=1.5;
// 辨识仅在线修正教学小模型的两个参数，不是地层实测倾角。
let identified={beta:.016,gain:.154,samples:0};
const C={jade:'#2f7d6b',jadeLight:'#e6f1ec',blue:'#41699b',clay:'#b26a39',red:'#b05a51',ink:'#4d565b',muted:'#79828a',line:'#e9e4d8',design:'#9ba3a9'};
let pts=[],state,cmd,rec,run=true,tickId=0,logCount=0,stamp=0,costHistory=[],approvalNum=0,manualNum=0;
const designX=md=>-26+0.10*(md-START);
const X0=73,X1=809,Y0=36,Y1=490;
const sx=x=>X0+(clamp(x,-65,65)+65)/130*(X1-X0);
const sy=md=>Y0+(clamp(md,START,END)-START)/(END-START)*(Y1-Y0);
function svgEl(tag,attrs={},content){let e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));if(content!=null)e.textContent=content;return e;}
function add(s,tag,attrs={},content){const e=svgEl(tag,attrs,content);s.appendChild(e);return e;}
function svgText(s,x,y,string,extras={}){return add(s,'text',{x,y,fill:C.muted,'font-size':10.5,...extras},string);}
function line(s,x1,y1,x2,y2,color=C.line,dash){return add(s,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,...(dash?{'stroke-dasharray':dash}:{})});}
function shape(s,id,color,width=3,dash=''){return add(s,'path',{id,d:'',fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round',...(dash?{'stroke-dasharray':dash}:{})});}
function path(points,fx,fy){return points.length?'M'+points.map((p,i)=>`${i?'L':''}${fx(p).toFixed(2)} ${fy(p).toFixed(2)}`).join(' '):'';}
function simStep(s,tf,length,physical=false){
  const active=length>0 && tf!==null;
  const natural=physical?hiddenGeologyBias(s.md):identified.beta;
  const gain=physical?TRUE_GAIN*1.045:identified.gain;
  // 教学简化：工具面 cos(phi) 投影成二维有效侧向曲率；并非完整三维 BHA 模型。
  const control=active?gain*Math.cos(rad(tf)):0;
  const curvature=natural+control;
  const h=s.heading+curvature*STEP;
  const md=Math.min(END,s.md+STEP);
  return {md,x:s.x+(.1+Math.tan(rad((s.heading+h)/2)))*STEP,
    heading:h,dls:Math.abs(curvature)*30,curvature,controlCurv:control};
}
// 第一段 + 可选第二段 + 自然钻进；构成未来30m的多步控制序列。
function forecast(s,angle=null,length=0,steps=10,angle2=null,length2=0){
  let q={...s},arr=[q],remaining1=length,remaining2=length2;
  for(let i=0;i<steps&&q.md<END;i++){
    const useFirst=remaining1>0, useSecond=!useFirst&&remaining2>0;
    const tf=useFirst?angle:useSecond?angle2:null;
    q=simStep(q,tf,tf===null?0:STEP);arr.push(q);
    if(useFirst)remaining1-=STEP;else if(useSecond)remaining2-=STEP;
  }
  return arr;
}
function errorOf(s){return s.x-designX(s.md);}
function evaluateCandidate(s,a1,l1,a2,l2){
  const seq=forecast(s,a1,l1,10,a2,l2);
  let J=0,prevU=s.controlCurv?s.controlCurv*30:0;
  for(let i=1;i<seq.length;i++){
    const v=seq[i],e=errorOf(v),u=v.controlCurv*30;
    // 工具/井段教学限值：所有预测步必须满足狗腿度硬约束。
    if(v.dls>DLS_LIMIT+1e-8)return null;
    J+=Q_POS*e*e+Q_HEADING*v.heading*v.heading;
    J+=R_U*u*u+S_DU*(u-prevU)*(u-prevU);
    J+=.015*v.dls*v.dls;
    prevU=u;
  }
  const terminal=seq[seq.length-1];
  J+=Q_TERMINAL*errorOf(terminal)**2+.045*terminal.heading**2;
  // 小幅控制成本：更长的滑动长度不是免费的。
  J+=.016*(l1+l2);
  return {angle:a1,length:l1,secondAngle:l2?a2:null,secondLength:l2,cost:J,
    pts:seq,end:terminal,dls:seq[1]?.dls||0};
}
function plan(s){
  if(s.md>=END)return {angle:180,length:0,secondAngle:null,secondLength:0,cost:0,
    pts:[s],end:s,dls:0};
  let best=null;
  const angles=[0,30,60,90,120,150,180,210,240,270,300,330];
  for(const l1 of [6,12,18,24])for(const a1 of angles){
    // 不做第二段动作：仍然在整个预测时域上计算轨迹代价。
    let v=evaluateCandidate(s,a1,l1,null,0);
    if(v&&(!best||v.cost<best.cost))best=v;
    for(const l2 of [6,12]){
      if(l1+l2>HORIZON)continue;
      for(const a2 of angles){
        // 两段候选曲率组成长度不超过30m的计划，实际只允许批准第一段。
        v=evaluateCandidate(s,a1,l1,a2,l2);
        if(v&&(!best||v.cost<best.cost))best=v;
      }
    }
  }
  return best||{angle:180,length:6,secondAngle:null,secondLength:0,
    cost:Infinity,pts:forecast(s,180,6),end:forecast(s,180,6).at(-1),dls:4.0};
}
function identifyFromObservation(previous,current,active,angle){
  const observed=(current.heading-previous.heading)/STEP;
  if(!active){
    // 在非滑动时观测自然偏置；EWMA 平滑抑制单点随机波动。
    identified.beta=clamp(.90*identified.beta+.10*observed,.006,.05);
  }else{
    const projection=Math.cos(rad(angle));
    if(Math.abs(projection)>.35){
      const gObs=(observed-identified.beta)/projection;
      if(gObs>.07&&gObs<.26)identified.gain=clamp(.97*identified.gain+.03*gObs,.08,.24);
    }
  }
  identified.samples++;
}
function makeStart(){pts=[];let q={md:START,x:designX(START),heading:0,dls:0};pts.push({...q});
  // 回放已钻进井段：地层自然转向且未及时纠偏，形成可供 MPC 修正的偏差。
  for(let i=0;i<44;i++){const drift=.030+.014*Math.sin(i*.19);const h=q.heading+drift*STEP;
    q={md:q.md+STEP,x:q.x+(0.1+Math.tan(rad((q.heading+h)/2)))*STEP,heading:h,dls:Math.abs(drift)*30};pts.push({...q});}
  identified={beta:.016,gain:.154,samples:0};state={...q};cmd=null;rec=plan(state);run=true;tickId=0;stamp=0;logCount=0;costHistory=[];approvalNum=0;manualNum=0;
  $('audit-log').innerHTML='<li class="log-placeholder">暂无授权记录。先尝试人工滑动，再比较 AI 纠偏建议。</li>';
  $('log-count').textContent='0';$('approval-num').textContent='0';$('manual-num').textContent='0';$('audit-mode').textContent='待人工授权';$('pause').textContent='暂停模拟';
}
function initTrajectory(){const s=$('trajectory-chart');
  const defs=add(s,'defs');const clip=add(defs,'clipPath',{id:'plot-clip'});add(clip,'rect',{x:X0,y:Y0,width:X1-X0,height:Y1-Y0});
  const layers=[['泥岩层',3000,3070,'#f5f2ea'],['粉砂岩',3070,3150,'#f9f5eb'],['砂岩层',3150,3240,'#f1f4ec'],['粉砂岩',3240,3300,'#f7f2eb']];
  for(let [name,lo,hi,fill] of layers){add(s,'rect',{x:X0,y:sy(lo),width:X1-X0,height:sy(hi)-sy(lo),fill});svgText(s,X1-12,sy(lo)+15,name,{'text-anchor':'end',fill:'#b3b1a6','font-size':10});}
  for(let d=3000;d<=3300;d+=50){const y=sy(d);line(s,X0,y,X1,y,C.line,'3 5');svgText(s,X0-12,y+4,d,{'text-anchor':'end'});}
  for(let x=-60;x<=60;x+=20){let p=sx(x);line(s,p,Y0,p,Y1,C.line,'3 5');svgText(s,p,Y1+18,x,{'text-anchor':'middle'});}
  line(s,X0,Y0,X0,Y1,C.muted);line(s,X0,Y1,X1,Y1,C.muted);svgText(s,X0,Y0-18,'测量井深 MD (m)');svgText(s,(X0+X1)/2,538,'相对横向位置 (m)',{'text-anchor':'middle',fill:C.ink});
  let target=designX(END);const xt=sx(target-10),xr=sx(target+10);
  add(s,'rect',{x:xt,y:sy(3270),width:xr-xt,height:sy(END)-sy(3270),fill:C.jadeLight,stroke:C.jade,'stroke-width':1.4,'stroke-dasharray':'5 3'});
  svgText(s,xr+5,sy(3280),'目标靶区',{'font-size':10,fill:C.jade});
  const plot=add(s,'g',{'clip-path':'url(#plot-clip)'});
  const pp=[];for(let md=START;md<=END;md+=3)pp.push({md,x:designX(md)});
  shape(plot,'design-line',C.design,2.4,'7 6').setAttribute('d',path(pp,p=>sx(p.x),p=>sy(p.md)));
  shape(plot,'actual-line',C.jade,3.6);
  shape(plot,'natural-line',C.blue,2.6,'6 5');
  shape(plot,'ai-line',C.jade,2.6,'6 5');
  add(plot,'circle',{id:'bit-point',r:5,fill:C.clay,stroke:'#fff','stroke-width':2});
  add(plot,'circle',{id:'natural-point',r:3.5,fill:C.blue});
  add(plot,'circle',{id:'ai-point',r:3.5,fill:C.jade});
  add(s,'text',{x:X1-6,y:Y0+13,'text-anchor':'end','font-size':10,fill:C.muted},'岩性、轨迹均为教学构造');
}
function initTrend(){const s=$('trend-chart'),L=67,R=785,T=30,B=214;
  add(s,'rect',{x:L,y:T,width:R-L,height:B-T,fill:'#fdfcf9'});
  const fx=n=>L+n/30*(R-L),dy=n=>B-n/8*(B-T),ty=n=>B-n/100*(B-T);
  for(let y=0;y<=8;y+=2){line(s,L,dy(y),R,dy(y),C.line,'3 5');svgText(s,L-9,dy(y)+4,y,{'text-anchor':'end'});}
  for(let x=0;x<=30;x+=5){const px=fx(x);line(s,px,T,px,B,C.line,'3 5');svgText(s,px,B+19,x,{'text-anchor':'middle'});}
  for(let n=0;n<=100;n+=25)svgText(s,R+11,ty(n)+4,n);
  line(s,L,T,L,B,C.muted);line(s,L,B,R,B,C.muted);
  svgText(s,L,14,'左轴：DLS (°/30 m)',{fill:C.jade});svgText(s,R,14,'右轴：摩阻代理指数 (0–100)',{fill:C.clay,'text-anchor':'end'});
  svgText(s,(L+R)/2,259,'未来进尺 (m)',{'text-anchor':'middle'});
  line(s,L,dy(DLS_LIMIT),R,dy(DLS_LIMIT),C.red,'6 4');svgText(s,R-8,dy(DLS_LIMIT)-7,'教学参考 4.5',{'text-anchor':'end',fill:C.red});
  shape(s,'trend-dls',C.jade,2.8);shape(s,'trend-friction',C.clay,2.8);
}
function initSolverTrace(){
  const svg=$('solver-trace'),L=72,R=799,T=28,B=183;
  add(svg,'rect',{x:L,y:T,width:R-L,height:B-T,fill:'#fdfcf9'});
  for(let i=0;i<=4;i++)line(svg,L,T+i*(B-T)/4,R,T+i*(B-T)/4,C.line,'3 5');
  line(svg,L,T,L,B,C.muted);line(svg,L,B,R,B,C.muted);
  svgText(svg,L,17,'最优代价 J*（无量纲教学权重）',{fill:C.jade});
  svgText(svg,(L+R)/2,222,'最近 24 次滚动优化（从旧到新）',{'text-anchor':'middle'});
  svgText(svg,L,B+19,'−23',{'text-anchor':'middle'});svgText(svg,R,B+19,'当前',{'text-anchor':'middle'});
  shape(svg,'solver-cost-line',C.jade,3);
  add(svg,'circle',{id:'solver-cost-dot',r:4,fill:C.clay,stroke:'#fff','stroke-width':1.5});
  for(let i=0;i<5;i++)svgText(svg,L-12,T+i*(B-T)/4,'—',{'text-anchor':'end',id:'solver-tick-'+i});
}
function renderSolverTrace(){
  const data=costHistory.slice(-24),L=72,R=799,T=28,B=183;
  if(!data.length)return;
  const hi=Math.max(5,...data.map(d=>d.value))*1.10,pts2=data.map((v,i)=>({x:L+(data.length===1?1:i/(data.length-1))*(R-L),y:B-v.value/hi*(B-T)}));
  $('solver-cost-line').setAttribute('d',path(pts2,p=>p.x,p=>p.y));
  const last=pts2.at(-1);$('solver-cost-dot').setAttribute('cx',last.x);$('solver-cost-dot').setAttribute('cy',last.y);
  for(let i=0;i<5;i++)$('solver-tick-'+i).textContent=f(hi*(4-i)/4,0);
}
function renderTrajectory(){const q=state,natural=forecast(q,null,0,10),ai=rec.pts;
  $('actual-line').setAttribute('d',path(pts,p=>sx(p.x),p=>sy(p.md)));
  $('natural-line').setAttribute('d',path(natural,p=>sx(p.x),p=>sy(p.md)));
  $('ai-line').setAttribute('d',path(ai,p=>sx(p.x),p=>sy(p.md)));
  for(let [id,p] of [['bit-point',q],['natural-point',natural.at(-1)],['ai-point',ai.at(-1)]]){
    $(id).setAttribute('cx',sx(p.x));$(id).setAttribute('cy',sy(p.md));
  }
}
function renderTrend(){const s=state,L=67,R=785,T=30,B=214;
  let seq=rec.pts;if(seq.length<2)seq=forecast(s,null,0,10);
  if(seq.length<2){$('trend-dls').setAttribute('d','');$('trend-friction').setAttribute('d','');return;}
  const draw=(values,min,max)=>values.map((v,i)=>[L+i/(values.length-1)*(R-L),B-(v-min)/(max-min)*(B-T)]);
  const dog=seq.map((p,i)=>i===0?(seq[1].dls||0):p.dls);
  const friction=seq.map(p=>clamp(24+Math.abs(errorOf(p))*2.5+Math.abs(p.heading)*3+Math.min(10,p.dls*3),0,100));
  $('trend-dls').setAttribute('d',path(draw(dog,0,8),p=>p[0],p=>p[1]));
  $('trend-friction').setAttribute('d',path(draw(friction,0,100),p=>p[0],p=>p[1]));
}
function updateUi(){rec=plan(state);const natural=forecast(state,null,0,10).at(-1);
  const err=errorOf(state),nErr=errorOf(natural),aErr=errorOf(rec.end);
  $('md-now').textContent=f(state.md,0);$('inc-now').textContent=f(86+.35*Math.sin(state.md/37),1);
  $('azi-now').textContent=f(120+state.heading,1);$('tf-now').textContent=cmd?f(cmd.angle,0):'—';
  $('error-now').textContent=(err>=0?'+':'')+f(err,2)+' m';$('error-now').classList.toggle('danger',Math.abs(err)>10);
  $('dls-now').textContent='最近狗腿度代理 '+f(state.dls,2)+' °/30m';
  $('ai-toolface').textContent=f(rec.angle,0)+'°';$('ai-length').textContent=f(rec.length,0)+' m';
  $('baseline-error').textContent=(nErr>=0?'+':'')+f(nErr,1)+' m';$('planned-error').textContent=(aErr>=0?'+':'')+f(aErr,1)+' m';
  $('natural-kpi').textContent=f(Math.abs(nErr),2)+' m';$('ai-kpi').textContent=f(Math.abs(aErr),2)+' m';
  $('drift-kpi').textContent='+'+f(identified.beta,3)+' °/m';$('gain-kpi').textContent=f(identified.gain,3)+' °/m';
  $('state-e').textContent=(err>=0?'+':'')+f(err,2)+' m';
  $('state-psi').textContent=f(state.heading,2)+'°';
  $('beta-live').textContent='+'+f(identified.beta,4)+' °/m';
  $('gain-live').textContent=f(identified.gain,4)+' °/m';
  $('model-state-note').textContent=`已观测 ${identified.samples} 步；使用自然漂移段与已授权滑动响应的 EWMA 更新。数值是曲率偏置估计，不是实际地层倾角测量。`;
  $('observation-num').textContent=String(identified.samples);
  $('mpc-cost').textContent=Number.isFinite(rec.cost)?f(rec.cost,2):'不可行';
  $('mpc-beta').textContent='+'+f(identified.beta,4)+' °/m';
  $('mpc-dip').textContent=f(hiddenFormationDip(state.md+15),1)+'°';
  $('mpc-dls').textContent=f(rec.dls,2)+' °/30m';
  $('mpc-next').textContent=rec.secondLength?rec.secondAngle+'° / '+rec.secondLength+'m':'自然钻进';
  $('mpc-reason').textContent=`未来 ${HORIZON} m 滚动规划；倾角为预设合成地质先验，β/ĝ 来源于控制与轨迹观测。硬筛选 DLS > ${DLS_LIMIT}°/30m；第二段仅前瞻，不自动执行。`;
  $('ai-reason').textContent=`不干预未来30m偏差约 ${f(Math.abs(nErr),1)} m；MPC 首段 ${rec.angle}° / ${rec.length}m，${rec.secondLength?'前瞻第二段 '+rec.secondAngle+'° / '+rec.secondLength+'m':'后续自然钻进'}；预测末端偏差 ${f(Math.abs(aErr),1)} m。只有首段可由工程师逐次授权。`;
  $('explain-note').textContent=`模型当前辨识自然偏置 ${f(identified.beta,4)} °/m 与工具响应增益 ${f(identified.gain,4)} °/m 生成多步候选；${Math.abs(aErr)<Math.abs(nErr)?'候选在本模拟中改善未来横向偏差。':'因狗腿与方向成本，候选未必使位置误差单调下降。'}`;
  const risk=Math.abs(err)>12 || state.dls>DLS_LIMIT;
  $('ai-panel').classList.toggle('warning',risk);
  $('statebar').classList.toggle('danger',Math.abs(err)>15||state.dls>DLS_LIMIT);
  $('statebar').classList.toggle('warn',risk&&Math.abs(err)<=15&&state.dls<=DLS_LIMIT);
  $('state-text').textContent=state.md>=END?(Math.abs(err)<=10?'教学井段完成 · 横向偏差位于教学靶窗内':'教学井段完成 · 未进入教学靶窗，请复盘纠偏策略'):risk?'轨迹偏差或狗腿代理偏高 · 请工程师审核':'监测中 · 工程师掌握最终控制权';
  $('state-level').textContent=risk?'ENGINEER REVIEW':'HUMAN CONTROL';
  $('ai-warning').textContent=risk?'⚠ 轨迹偏差 / 狗腿代理偏高：建议须经人工审核；不自动下发。':'AI 仅展示候选轨迹，工程师授权后才改变模拟钻进。';
  $('ai-warning').classList.toggle('warn',risk);
  $('order-status').textContent=cmd?`当前模拟执行：${cmd.kind}｜工具面 ${cmd.angle}°｜剩余 ${f(cmd.left,0)} m`:'当前执行：自然钻进。AI 推荐尚未授权。';
  $('approve-ai').disabled=state.md>=END;$('run-manual').disabled=state.md>=END;
  if(costHistory.length===0||costHistory.at(-1).sample!==tickId){
    costHistory.push({sample:tickId,value:Number.isFinite(rec.cost)?rec.cost:0});
    if(costHistory.length>24)costHistory.shift();
  } else costHistory[costHistory.length-1].value=Number.isFinite(rec.cost)?rec.cost:0;
  renderTrajectory();renderTrend();renderSolverTrace();
  $('actual-line').setAttribute('stroke',state.dls>DLS_LIMIT?C.red:C.jade);
  $('trend-dls').setAttribute('stroke',state.dls>DLS_LIMIT?C.red:C.jade);
}
function addLog(type,angle,len,kind){logCount++;const li=document.createElement('li');if(kind==='manual')li.className='manual';
  const timestamp=`模拟 T+${String(stamp).padStart(3,'0')} · MD ${f(state.md,0)} m`;
  const a=document.createElement('span');a.className='stamp';a.textContent=timestamp;
  const b=document.createElement('div'),strong=document.createElement('b');strong.textContent=type;
  b.appendChild(strong);b.appendChild(document.createTextNode(`｜工具面 ${f(angle,0)}° / 滑动 ${len} m / 偏差 ${f(errorOf(state),2)} m / MPC J* ${f(rec.cost,2)} / 地层偏置 ${f(identified.beta,4)} °/m`));
  li.append(a,b);const ul=$('audit-log');if(ul.querySelector('.log-placeholder'))ul.textContent='';ul.prepend(li);
  while(ul.children.length>5)ul.lastChild.remove();$('log-count').textContent=String(logCount);
}
function issue(kind,angle,len){if(state.md>=END)return;cmd={kind,angle,len,left:len};
  if(kind==='AI'){approvalNum++;$('approval-num').textContent=String(approvalNum);$('audit-mode').textContent='已授权 AI 首段';}
  else {manualNum++;$('manual-num').textContent=String(manualNum);$('audit-mode').textContent='人工控制已下发';}
  addLog(kind==='AI'?'工程师采纳 AI 轨迹建议':'工程师手动下发滑动指令',angle,len,kind==='AI'?'ai':'manual');
  updateUi();
}
function tick(){if(!run||state.md>=END)return;stamp++;tickId++;
  const active=Boolean(cmd&&cmd.left>0), tf=active?cmd.angle:null,previous={...state};
  const q=simStep(state,tf,active?cmd.left:0,true);
  identifyFromObservation(previous,q,active,tf);
  state=q;pts.push({...q});
  if(active){cmd.left-=STEP;if(cmd.left<=0)cmd=null;}
  updateUi();
}
function setTab(t,hash=true){const valid=['bg','flow','demo'].includes(t)?t:'bg';
  document.querySelectorAll('.tab').forEach(btn=>{const on=btn.dataset.tab===valid;btn.classList.toggle('on',on);btn.setAttribute('aria-selected',String(on));btn.tabIndex=on?0:-1;});
  document.querySelectorAll('.panel').forEach(el=>{el.hidden=el.id!=='panel-'+valid;});
  if(hash&&location.hash!==`#/scene/d3?tab=${valid}`)location.hash=`#/scene/d3?tab=${valid}`;
}
function tabHash(){const m=location.hash.match(/[?&]tab=(bg|flow|demo)/);return m?m[1]:'bg';}
function updateSliders(){for(const id of ['manual-tf','manual-length']){const el=$(id);el.style.setProperty('--pct',100*(+el.value-(+el.min))/(+el.max-(+el.min))+'%');}
  $('tf-out').textContent=$('manual-tf').value+'°';$('length-out').textContent=$('manual-length').value+' m';}
function init(){document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>setTab(btn.dataset.tab)));
  window.addEventListener('hashchange',()=>setTab(tabHash(),false));setTab(tabHash(),false);
  initTrajectory();initTrend();initSolverTrace();makeStart();updateSliders();updateUi();
  ['manual-tf','manual-length'].forEach(id=>$(id).addEventListener('input',updateSliders));
  $('approve-ai').addEventListener('click',()=>{const a=rec.angle,l=rec.length;$('manual-tf').value=a;$('manual-length').value=l;updateSliders();issue('AI',a,l);});
  $('run-manual').addEventListener('click',()=>issue('人工',+$('manual-tf').value,+$('manual-length').value));
  $('pause').addEventListener('click',()=>{run=!run;$('pause').textContent=run?'暂停模拟':'继续模拟';});
  $('restart').addEventListener('click',()=>{makeStart();updateUi();});
  window.setInterval(tick,800);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
