/* 钻速优化教学沙箱：仅使用原生 JavaScript 与 SVG。无网络、无硬件接口。 */
(function () {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COLORS = {jade:'#2f7d6b', clay:'#b26a39', blue:'#41699b', red:'#b05a51', grid:'#e9e4d8', ink:'#4d565b'};
  const TORQUE_LIMIT = 14.4;     // kN·m，仅用于教学
  const TORQUE_MARGIN = 0.50;   // 推荐器保留模拟裕量
  const SERIES_LENGTH = 65;
  const $ = id => document.getElementById(id);
  const bound = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
  const fixed = (x,n=1) => Number(x).toFixed(n);
  const state = {mode:'manual', rpm:120, actualWob:80, authorizedWob:80,
    actualRop:0, actualTorque:0, aiCandidate:130, acceptedSafe:0,
    time:0, bias:0, logs:0, lastAlarm:false, history:[], feedbackQueue:[]};

  // 非线性教学响应：先增益、后收益递减；不对应具体井场经验系数。
  function predictROP(wob,rpm) {
    return Math.max(0,(2+0.50*wob-0.00190*wob*wob)*Math.pow(rpm/120,0.70));
  }
  function predictTorque(wob,rpm) {
    return 3+0.080*wob+0.0075*(rpm-120)+0.00009*Math.pow(Math.max(0,wob-115),2);
  }
  function observedROP(wob,rpm,t) {
    return Math.max(0,predictROP(wob,rpm)+0.85*Math.sin(wob/19)+0.38*Math.sin(t*0.35));
  }
  function safeCeiling(rpm) {
    let safe=30;
    for(let w=30;w<=190;w+=0.25) {
      if(predictTorque(w,rpm)<=TORQUE_LIMIT-TORQUE_MARGIN) safe=w;
      else break;
    }
    return safe;
  }
  function filteredCandidate(wob,rpm) { return Math.min(wob,safeCeiling(rpm)); }
  function findOptimal(rpm) {
    let answer=60, best=-Infinity;
    for(let w=60;w<=190;w+=1) {
      if(predictTorque(w,rpm)>TORQUE_LIMIT-TORQUE_MARGIN) continue;
      const score=predictROP(w,rpm);
      if(score>best) {best=score;answer=w;}
    }
    return answer;
  }
  function node(svg,tag,attrs={},content) {
    const el=document.createElementNS(SVG_NS,tag);
    Object.keys(attrs).forEach(k=>el.setAttribute(k,String(attrs[k])));
    if(content!=null) el.textContent=String(content);
    svg.appendChild(el);return el;
  }
  function line(svg,x1,y1,x2,y2,color=COLORS.grid,dash) {
    return node(svg,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,...(dash?{'stroke-dasharray':dash}:{})});
  }
  function txt(svg,x,y,value,attrs={}) {
    return node(svg,'text',{x,y,fill:COLORS.ink,'font-size':11,...attrs},value);
  }
  function path(svg,id,color,dash) {
    return node(svg,'path',{id,d:'',fill:'none',stroke:color,'stroke-width':2.7,
      'stroke-linejoin':'round','stroke-linecap':'round',...(dash?{'stroke-dasharray':dash}:{})});
  }
  function smooth(points) {
    if(points.length===0) return '';
    let d=`M ${fixed(points[0][0],2)} ${fixed(points[0][1],2)}`;
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      d+=` Q ${fixed(a[0],2)} ${fixed(a[1],2)} ${fixed((a[0]+b[0])/2,2)} ${fixed((a[1]+b[1])/2,2)}`;
    }
    const p=points[points.length-1];
    return d+` L ${fixed(p[0],2)} ${fixed(p[1],2)}`;
  }
  function buildResponseChart() {
    const s=$('response-chart');
    const L=67,R=793,T=32,B=286;
    const x=w=>L+(w-40)/150*(R-L);
    const yR=v=>B-v/44*(B-T);
    const yT=v=>B-v/22*(B-T);
    const cutoff=safeCeiling(120);
    node(s,'rect',{x:L,y:T,width:x(cutoff)-L,height:B-T,fill:'#e6f1ec',opacity:0.65});
    node(s,'rect',{x:x(cutoff),y:T,width:R-x(cutoff),height:B-T,fill:'#f9e9e5',opacity:0.7});
    for(let v=0;v<=40;v+=10){line(s,L,yR(v),R,yR(v));txt(s,L-13,yR(v)+4,v,{'text-anchor':'end'});}
    for(let v=0;v<=20;v+=5) txt(s,R+14,yT(v)+4,v);
    for(let w=40;w<=190;w+=25){line(s,x(w),T,x(w),B,'#f0eee8','3 5');txt(s,x(w),B+20,w,{'text-anchor':'middle'});}
    line(s,L,T,L,B,'#a9b0ab');line(s,L,B,R,B,'#a9b0ab');line(s,R,T,R,B,'#a9b0ab');
    txt(s,L,17,'左轴 · 机械钻速 ROP (m/h)',{fill:COLORS.jade,'font-weight':650});
    txt(s,R,17,'右轴 · 井底扭矩 Torque (kN·m)',{fill:COLORS.clay,'text-anchor':'end','font-weight':650});
    txt(s,(L+R)/2,338,'钻压 WOB (kN)',{'text-anchor':'middle'});
    const rops=[],torques=[];
    for(let w=40;w<=190;w+=2){rops.push([x(w),yR(predictROP(w,120))]);torques.push([x(w),yT(predictTorque(w,120))]);}
    path(s,'response-rop',COLORS.jade).setAttribute('d',smooth(rops));
    path(s,'response-torque',COLORS.clay).setAttribute('d',smooth(torques));
    line(s,L,yT(TORQUE_LIMIT),R,yT(TORQUE_LIMIT),COLORS.red,'7 4');
    line(s,x(cutoff),T,x(cutoff),B,COLORS.red,'3 5');
    txt(s,R-7,yT(TORQUE_LIMIT)-8,'Torque 红线 14.40',{'text-anchor':'end',fill:COLORS.red});
    txt(s,L+12,T+20,'安全候选区',{'font-weight':650,fill:'#235f51'});
    txt(s,R-12,T+20,'高风险区',{'text-anchor':'end','font-weight':650,fill:COLORS.red});
    txt(s,L+10,B-12,'● ROP 预测',{'font-size':10,fill:COLORS.jade});
    txt(s,L+108,B-12,'● 扭矩预测',{'font-size':10,fill:COLORS.clay});
  }
  const P={L:64,R:810, RT:37,RB:200, TT:245,TB:365};
  const xAt=i=>P.L+i/(SERIES_LENGTH-1)*(P.R-P.L);
  const ropY=v=>P.RB-v/50*(P.RB-P.RT);
  const torqueY=v=>P.TB-v/24*(P.TB-P.TT);
  function buildLiveChart() {
    const s=$('live-chart');
    node(s,'rect',{x:P.L,y:P.RT,width:P.R-P.L,height:P.RB-P.RT,fill:'#fdfcf9'});
    node(s,'rect',{x:P.L,y:P.TT,width:P.R-P.L,height:torqueY(TORQUE_LIMIT)-P.TT,fill:'#f9e9e5'});
    for(let v=0;v<=50;v+=10){line(s,P.L,ropY(v),P.R,ropY(v));txt(s,P.L-13,ropY(v)+4,v,{'text-anchor':'end'});}
    for(let v=0;v<=24;v+=6){line(s,P.L,torqueY(v),P.R,torqueY(v));txt(s,P.L-13,torqueY(v)+4,v,{'text-anchor':'end'});}
    for(let i=0;i<SERIES_LENGTH;i+=16){line(s,xAt(i),P.RT,xAt(i),P.TB,'#f2f0e8','3 5');txt(s,xAt(i),P.TB+22,i===64?'现在':`${i-64} min`,{'text-anchor':'middle'});}
    line(s,P.L,P.RT,P.L,P.RB,'#a9b0ab');line(s,P.L,P.RB,P.R,P.RB,'#a9b0ab');
    line(s,P.L,P.TT,P.L,P.TB,'#a9b0ab');line(s,P.L,P.TB,P.R,P.TB,'#a9b0ab');
    txt(s,P.L,20,'机械钻速 · ROP (m/h)',{'font-weight':650});
    txt(s,P.L,230,'井底扭矩 · Torque (kN·m)',{'font-weight':650});
    txt(s,(P.L+P.R)/2,417,'模拟时间 / min',{'text-anchor':'middle'});
    line(s,P.L,torqueY(TORQUE_LIMIT),P.R,torqueY(TORQUE_LIMIT),COLORS.red,'7 4');
    txt(s,P.R-8,torqueY(TORQUE_LIMIT)-8,'红线 14.40 kN·m',{'text-anchor':'end',fill:COLORS.red,'font-size':10});
    const real=path(s,'line-rop-actual',COLORS.jade);
    const pred=path(s,'line-rop-pred',COLORS.blue,'6 4');
    const tor=path(s,'line-torque-actual',COLORS.clay);
    [real,pred,tor].forEach(el=>{el.style.transition='d .45s ease';});
  }
  function drawLiveChart() {
    for(const [id,key,y] of [['line-rop-actual','rop',ropY],['line-rop-pred','pred',ropY],['line-torque-actual','torque',torqueY]]) {
      $(id).setAttribute('d',smooth(state.history.map((item,i)=>[xAt(i),y(item[key])])));
    }
  }
  function updateSliders() {
    for(const id of ['ai-wob','trim']) {
      const e=$(id);e.style.setProperty('--percent',(100*(+e.value-(+e.min))/(+e.max-(+e.min)))+'%');
    }
    $('ai-wob-out').textContent=$('ai-wob').value+' kN';
    $('trim-out').textContent=(+$('trim').value>=0?'+':'')+$('trim').value+' kN';
    $('rpm-out').textContent=$('rpm').value+' rpm';
  }
  function updateRecommendation() {
    state.aiCandidate=+$('ai-wob').value;
    const safe=filteredCandidate(state.aiCandidate,state.rpm);
    $('safe-candidate').textContent=fixed(safe,1)+' kN';
    return safe;
  }
  function updateStatus() {
    const predictedTorque=predictTorque(state.authorizedWob,state.rpm);
    const critical=state.actualTorque>TORQUE_LIMIT;
    const futureRisk=predictedTorque>TORQUE_LIMIT;
    const box=$('status-strip');
    box.classList.toggle('alarm',critical);
    box.classList.toggle('prealarm',!critical&&futureRisk);
    $('hitl-status').textContent='Human-in-the-loop：'+(state.mode==='ai'?'当前采纳 AI 建议（司钻已授权）':'当前由司钻接管');
    $('safety-status').textContent=critical?'红色警报：扭矩越线，模拟卡钻风险！':futureRisk?'预警：人工目标可能导致扭矩越限':'实时监测：扭矩位于示意安全范围';
    $('authorized-wob').textContent=fixed(state.authorizedWob,1)+' kN';
    $('wob-now').textContent=fixed(state.actualWob,1)+' kN';
    $('rop-actual').textContent=fixed(state.actualRop,1);
    $('rop-forecast').textContent=fixed(predictROP(state.authorizedWob,state.rpm)+state.bias,1);
    $('torque-actual').textContent=fixed(state.actualTorque,2);
    $('torque-forecast').textContent=fixed(predictedTorque,2);
    $('torque-actual').style.color=critical?COLORS.red:'';
    if(critical&&!state.lastAlarm) audit('越限告警','实时扭矩超出教学红线；模拟卡钻风险',true,false);
    state.lastAlarm=critical;
  }
  function audit(type,details,risk=false,feedback=true) {
    state.logs++;
    $('log-count').textContent=String(state.logs);
    const list=$('audit-list');
    if(list.firstElementChild?.classList.contains('empty-log')) list.textContent='';
    const li=document.createElement('li');
    if(risk) li.className='danger-entry';
    const timestamp=new Date().toLocaleTimeString('zh-CN',{hour12:false});
    const prefix=document.createElement('span');prefix.textContent=timestamp+' · ';
    const typ=document.createElement('span');typ.className='log-type';typ.textContent=type;
    const content=document.createTextNode(` · ${details} · 目标 ${fixed(state.authorizedWob,1)} kN · AI ${fixed(state.aiCandidate,0)} kN · Torque 预测 ${fixed(predictTorque(state.authorizedWob,state.rpm),2)} kN·m`);
    li.append(prefix,typ,content);list.prepend(li);
    while(list.children.length>7) list.lastElementChild.remove();
    if(feedback) state.feedbackQueue.push({at:state.time+9});
  }
  function acceptAI() {
    const input=state.aiCandidate;
    const approved=updateRecommendation();
    state.authorizedWob=approved;
    state.mode='ai';
    const clipped=input>approved+0.01;
    $('decision-info').textContent=clipped?
      `司钻已授权；高风险 AI 候选 ${fixed(input,0)} kN 已由扭矩约束截断为 ${fixed(approved,1)} kN。`:
      `司钻已授权 AI 候选 ${fixed(approved,1)} kN；建议已经进入模拟执行目标。`;
    audit('采纳 AI',clipped?'超限候选截断后经司钻授权':'司钻审核通过候选参数');
    updateStatus();
  }
  function manualOverride(type) {
    state.mode='manual';
    state.authorizedWob=bound(80+(+$('trim').value),10,185);
    const unsafe=predictTorque(state.authorizedWob,state.rpm)>TORQUE_LIMIT;
    $('decision-info').textContent=unsafe?
      '人工目标超过教学扭矩约束，已发出预警；模拟器保留人工控制选择，并持续监测。':
      '当前由司钻接管。人工目标已更新，AI 不会自行下发新参数。';
    audit(type,`人工微调 ${$('trim').value} kN，转速 ${state.rpm} rpm` ,unsafe);
    updateStatus();
  }
  function step() {
    state.time++;
    // 一阶响应模拟参数调整不是瞬间到达井底；人工过量调节可穿越红线。
    state.actualWob+=(state.authorizedWob-state.actualWob)*0.22;
    state.actualTorque+=(predictTorque(state.actualWob,state.rpm)-state.actualTorque)*0.30;
    state.actualRop+=(observedROP(state.actualWob,state.rpm,state.time)-state.actualRop)*0.30;
    const displayedROP=bound(state.actualRop+0.18*Math.cos(state.time*.73),0,50);
    const displayedPrediction=bound(predictROP(state.authorizedWob,state.rpm)+state.bias,0,50);
    state.history.push({rop:displayedROP,pred:displayedPrediction,torque:state.actualTorque});
    if(state.history.length>SERIES_LENGTH)state.history.shift();
    // 仅演示监督反馈的偏差校正，不进行真实神经网络在线更新。
    while(state.feedbackQueue[0]&&state.feedbackQueue[0].at<=state.time) {
      state.feedbackQueue.shift();
      const residual=observedROP(state.actualWob,state.rpm,state.time)-predictROP(state.actualWob,state.rpm)-state.bias;
      state.bias=bound(state.bias+0.12*residual,-2,2);
      $('bias-value').textContent=(state.bias>=0?'+':'')+fixed(state.bias,2)+' m/h';
    }
    updateStatus();drawLiveChart();
  }
  function tabFromHash() {
    const found=location.hash.match(/[?&]tab=(bg|flow|demo)(?:&|$)/);
    return found?found[1]:'bg';
  }
  function changeTab(next,modifyHash=true) {
    const tab=['bg','flow','demo'].includes(next)?next:'bg';
    document.querySelectorAll('[data-tab]').forEach(button=>{
      const on=button.dataset.tab===tab;
      button.classList.toggle('on',on);button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;
    });
    document.querySelectorAll('main > .panel').forEach(panel=>{
      const on=panel.id==='panel-'+tab;panel.classList.toggle('on',on);panel.hidden=!on;
    });
    if(modifyHash&&location.hash!==`#/scene/d1?tab=${tab}`)location.hash=`#/scene/d1?tab=${tab}`;
  }
  function init() {
    document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>changeTab(button.dataset.tab)));
    window.addEventListener('hashchange',()=>changeTab(tabFromHash(),false));
    buildResponseChart();buildLiveChart();
    state.aiCandidate=findOptimal(120);
    $('ai-wob').value=state.aiCandidate;
    state.actualRop=observedROP(80,120,0);
    state.actualTorque=predictTorque(80,120);
    for(let i=0;i<SERIES_LENGTH;i++) {
      const w=80+1.8*Math.sin(i/8);
      state.history.push({rop:observedROP(w,120,i),pred:predictROP(w,120),torque:predictTorque(w,120)});
    }
    updateSliders();updateRecommendation();updateStatus();drawLiveChart();
    changeTab(tabFromHash(),false);
    $('ai-wob').addEventListener('input',()=>{
      updateSliders();updateRecommendation();
      $('decision-info').textContent='AI 候选已经更新；尚未授权执行。需司钻再次点击“采纳 AI 建议”。';
    });
    $('accept').addEventListener('click',acceptAI);
    $('reject').addEventListener('click',()=>manualOverride('拒绝 AI'));
    $('trim').addEventListener('input',()=>{
      updateSliders();
      $('decision-info').textContent='正在预览人工微调；松开滑块后由司钻确认并写入操作日志。';
    });
    $('trim').addEventListener('change',()=>manualOverride('司钻微调'));
    $('rpm').addEventListener('change',()=>{
      state.rpm=+$('rpm').value;
      updateSliders();updateRecommendation();
      // 更改 RPM 属于人工干预；已有执行 WOB 保留，不自动采纳新的 AI WOB。
      state.mode='manual';
      const unsafe=predictTorque(state.authorizedWob,state.rpm)>TORQUE_LIMIT;
      $('decision-info').textContent='司钻变更 RPM，现由人工接管；AI 候选需要重新授权。';
      audit('司钻调速',`更改转速为 ${state.rpm} rpm`,unsafe);
      updateStatus();
    });
    setInterval(step,650);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
