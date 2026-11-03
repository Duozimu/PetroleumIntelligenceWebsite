/* D6 Hole Cleaning Simulator · teaching-only synthetic surrogate + discrete PSO. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const LIMIT = 22.0; // MPa: fictional teaching safety limit, not a field threshold.
  const A_ANNULUS = Math.PI / 4 * (0.216 * 0.216 - 0.127 * 0.127); // m²: illustrative dimensions.
  const MIN_Q = 18, MAX_Q = 50, MIN_R = 40, MAX_R = 140;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const fmt = (v, d = 1) => Number(v).toFixed(d);
  const colors = {jade:'#2f7d6b',blue:'#41699b',clay:'#b26a39',bad:'#b05a51',grid:'#e9e4d8',ink:'#79828a'};
  const state = { q:24, rpm:60, mu:24, bed:20, minute:0, history:[], feedback:0, version:1, mode:'observation', riskSeen:false, message:'', log:[], lastReason:'等待人工授权' };
  let recommendation = null;
  const seedRandom = (seed) => () => { seed = (Math.imul(seed,1664525) + 1013904223) | 0; return (seed>>>0)/4294967296; };

  // Mechanism-inspired, uncalibrated synthetic proxies. No CFD network is actually trained here.
  function pump(q,rpm,mu) { return 4.8 + 0.028 * Math.pow(q,1.7) + 0.016 * rpm + 0.024 * (mu - 24); }
  function annularVelocity(q) { return q / 1000 / A_ANNULUS; }
  function cleaningRate(q,rpm,mu) {
    const rheology = 1 + 0.003 * (mu-24);
    return clamp((0.009 + 0.0016*(q-20) + 0.00035*(rpm-40))*rheology, 0.002, 0.085);
  }
  function predictedFraction(q,rpm,mu,minutes=40) { return 1 - Math.exp(-cleaningRate(q,rpm,mu)*minutes); }
  function predictedBed(q,rpm,mu,startBed=20) { return startBed*Math.exp(-cleaningRate(q,rpm,mu)*40); }
  function ecd(q,rpm,mu) { return 1.115+0.0021*(pump(q,rpm,mu)-10); } // simplistic density-equivalent proxy
  function feasible(q,rpm,mu) { const p=pump(q,rpm,mu), den=ecd(q,rpm,mu); return p<=LIMIT && den>=1.10 && den<=1.19; }
  function objective(q,rpm,mu) {
    if(!feasible(q,rpm,mu)) return Number.POSITIVE_INFINITY;
    // Dimensionless normalized surrogate terms + operational adjustment penalties.
    const bed=1-predictedFraction(q,rpm,mu);
    return 2.4*bed + 0.50*Math.pow(pump(q,rpm,mu)/LIMIT,2) + 0.011*Math.abs(q-24) + 0.00015*Math.pow(rpm-65,2);
  }
  function snapQ(v){return clamp(Math.round(v/2)*2,MIN_Q,MAX_Q);}
  function snapR(v){return clamp(Math.round(v/20)*20,MIN_R,MAX_R);}
  function optimize(mu) {
    // Small reproducible PSO on practical 2 L/s and 20 rpm set-point increments.
    const rnd=seedRandom(20261102);const particles=[];
    let best={score:Infinity,q:24,rpm:60};
    function evalPoint(q,rpm){q=snapQ(q);rpm=snapR(rpm);return {q,rpm,score:objective(q,rpm,mu)};}
    for(let i=0;i<25;i++){
      const q=MIN_Q+rnd()*(MAX_Q-MIN_Q),r=MIN_R+rnd()*(MAX_R-MIN_R);
      const c=evalPoint(q,r);
      particles.push({q,r,vq:0,vr:0,pbest:{...c}});
      if(c.score<best.score)best={...c};
    }
    for(let it=0;it<42;it++){
      for(const p of particles){
        const c=evalPoint(p.q,p.r);
        if(c.score<p.pbest.score)p.pbest={...c};
        if(c.score<best.score)best={...c};
        p.vq=clamp(0.65*p.vq + 1.35*rnd()*(p.pbest.q-p.q) +1.35*rnd()*(best.q-p.q),-7,7);
        p.vr=clamp(0.65*p.vr +1.4*rnd()*(p.pbest.rpm-p.r)+1.4*rnd()*(best.rpm-p.r),-28,28);
        p.q=clamp(p.q+p.vq,MIN_Q,MAX_Q);p.r=clamp(p.r+p.vr,MIN_R,MAX_R);
      }
    }
    // Local finite-grid safety verification: required because discrete PSO is not guaranteed optimal.
    for(let q=MIN_Q;q<=MAX_Q;q+=2){for(let rpm=MIN_R;rpm<=MAX_R;rpm+=20){const c=evalPoint(q,rpm);if(c.score<best.score)best={...c};}}
    return best.score===Infinity ? null : {...best,pressure:pump(best.q,best.rpm,mu),removal:predictedFraction(best.q,best.rpm,mu)};
  }
  const svgEl=(tag,attrs={},content)=>{
    const node=document.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
    if(content!==undefined)node.textContent=String(content);
    return node;
  };
  function add(svg,tag,attrs,content){const el=svgEl(tag,attrs,content);svg.appendChild(el);return el;}
  function line(svg,x1,y1,x2,y2,color=colors.grid,dash){return add(svg,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,...dash?{'stroke-dasharray':dash}:{}});}
  function txt(svg,x,y,label,extra={}){return add(svg,'text',{x,y,'font-size':11,fill:colors.ink,...extra},label);}
  function path(points){return points.length?'M'+points.map(v=>`${fmt(v[0],2)},${fmt(v[1],2)}`).join('L'):'';}
  function poly(svg,pts,color,dash){return add(svg,'path',{d:path(pts),fill:'none',stroke:color,'stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round',...(dash?{'stroke-dasharray':dash}:{})});}
  function clear(id){const s=$(id);while(s.firstChild)s.removeChild(s.firstChild);return s;}

  // Two panel graph: bed height vs time; what-if prediction vs flow & RPM.
  function drawBed(){
    const s=clear('bed-chart');
    const a={L:54,R:461,T:39,B:301}, b={L:516,R:793,T:39,B:301};
    const ax=i=>a.L+(i/45)*(a.R-a.L), ay=h=>a.B-(h/24)*(a.B-a.T);
    const bx=q=>b.L+(q-MIN_Q)/(MAX_Q-MIN_Q)*(b.R-b.L), by=h=>b.B-(h/24)*(b.B-b.T);
    txt(s,54,21,'实时床厚 · cm',{fill:'#4d565b','font-weight':600});
    txt(s,516,21,'未来 40 min 净清除 · cm',{fill:'#4d565b','font-weight':600});
    for(let h=0;h<=24;h+=6){line(s,a.L,ay(h),a.R,ay(h));line(s,b.L,by(h),b.R,by(h));txt(s,a.L-9,ay(h)+4,h,{'text-anchor':'end'});txt(s,b.L-7,by(h)+4,h,{'text-anchor':'end'});}
    for(let t=0;t<=45;t+=15){const x=ax(t);line(s,x,a.B,x,a.B+4);txt(s,x,a.B+20,t,{'text-anchor':'middle'});}
    for(let q=18;q<=50;q+=8){const x=bx(q);line(s,x,b.B,x,b.B+4);txt(s,x,b.B+20,q,{'text-anchor':'middle'});}
    line(s,a.L,a.T,a.L,a.B,'#a3a8a4');line(s,a.L,a.B,a.R,a.B,'#a3a8a4');line(s,b.L,b.T,b.L,b.B,'#a3a8a4');line(s,b.L,b.B,b.R,b.B,'#a3a8a4');
    txt(s,258,344,'模拟累计循环时间 / min',{'text-anchor':'middle',fill:'#4d565b'});
    txt(s,648,344,'候选排量 Q / (L/s)',{'text-anchor':'middle',fill:'#4d565b'});
    const his=state.history.slice(-46);const values=his.map((h,i)=>[ax(45-Math.min(his.length-1,45)+i),ay(h.bed)]);poly(s,values,colors.jade);
    if(values.length){const last=values[values.length-1];add(s,'circle',{cx:last[0],cy:last[1],r:4,fill:state.riskSeen?colors.bad:colors.jade});}
    const curve=[],high=[];for(let q=18;q<=50;q+=1){curve.push([bx(q),by(predictedBed(q,Number($('rpm-input').value),Number($('mu-input').value),20))]);high.push([bx(q),by(predictedBed(q,120,Number($('mu-input').value),20))]);}
    poly(s,curve,colors.blue,'7 4');poly(s,high,colors.clay,'3 5');
    txt(s,b.R-4,b.T+14,'蓝：人工RPM / 陶：120 rpm',{'text-anchor':'end','font-size':9.7});
    const x=bx(Number($('flow-input').value));line(s,x,b.T,x,b.B,colors.blue,'3 4');
    if(state.riskSeen)txt(s,280,a.T+18,'越限工况：教学清理进度冻结',{'text-anchor':'middle',fill:colors.bad,'font-size':11});
  }
  function drawPump(){
    const s=clear('pump-chart');const L=56,R=795,T=28,B=194;
    const x=q=>L+(q-MIN_Q)/(MAX_Q-MIN_Q)*(R-L),y=p=>B-p/32*(B-T);
    for(let p=0;p<=30;p+=5){line(s,L,y(p),R,y(p));txt(s,L-10,y(p)+4,p,{'text-anchor':'end'});}
    for(let q=18;q<=50;q+=8){line(s,x(q),B,x(q),B+5);txt(s,x(q),B+21,q,{'text-anchor':'middle'});}
    line(s,L,T,L,B,'#9ba3a9');line(s,L,B,R,B,'#9ba3a9');
    txt(s,L,T-13,'立管泵压 MPa',{fill:'#4d565b','font-weight':600});txt(s,(L+R)/2,234,'排量 Q / (L/s)',{'text-anchor':'middle',fill:'#4d565b'});
    const yLimit=y(LIMIT);add(s,'rect',{x:L,y:T,width:R-L,height:yLimit-T,fill:'#f9e9e5',opacity:.32});line(s,L,yLimit,R,yLimit,colors.bad,'7 4');txt(s,R-8,yLimit-7,'教学泵压红线 22 MPa',{'text-anchor':'end',fill:colors.bad});
    const mu=Number($('mu-input').value);const base=[],ref=[];for(let q=MIN_Q;q<=MAX_Q;q++){base.push([x(q),y(pump(q,Number($('rpm-input').value),mu))]);ref.push([x(q),y(pump(q,80,mu))]);}
    poly(s,base,colors.blue);poly(s,ref,colors.clay,'5 4');
    const candQ=Number($('flow-input').value),candR=Number($('rpm-input').value),p=pump(candQ,candR,mu);
    add(s,'circle',{cx:x(candQ),cy:y(p),r:5.2,fill:colors.blue,stroke:'#fff','stroke-width':1.8});
    add(s,'circle',{cx:x(state.q),cy:y(pump(state.q,state.rpm,state.mu)),r:5.5,fill:colors.jade,stroke:'#fff','stroke-width':2});
    txt(s,L+5,T+14,'蓝：人工草案曲线 / 陶：80 rpm',{'font-size':10});
  }
  function drawBedSection(){
    const s=clear('bed-section');add(s,'rect',{x:12,y:17,width:796,height:99,rx:9,fill:'#eef5f0',stroke:'#c8d2cc'});
    const bedH=clamp(state.bed/24*65,0,76);
    add(s,'path',{d:`M23 ${116-bedH} Q210 ${109-bedH} 400 ${116-bedH} T797 ${116-bedH} L797 116 H23Z`,fill:'#b8a07d',stroke:'#997f5e','stroke-width':1.5});
    add(s,'rect',{x:34,y:37,width:751,height:26,rx:12,fill:'#b8c6c0',stroke:'#6c8177','stroke-width':2});
    add(s,'line',{x1:754,y1:28,x2:590,y2:28,stroke:colors.jade,'stroke-width':2.5});
    add(s,'path',{d:'M604 22L589 28L604 34',stroke:colors.jade,'stroke-width':2,fill:'none'});
    txt(s,42,103,'低侧岩屑床 / '+fmt(state.bed,1)+' cm',{fill:state.riskSeen?colors.bad:'#8e5229'});
    txt(s,780,107,'环空返流 / ←',{'text-anchor':'end',fill:'#235f51'});
    if(state.riskSeen)txt(s,405,79,'模拟安全冻结：停止推进清床状态',{'text-anchor':'middle',fill:colors.bad,'font-weight':700});
  }
  function addLog(kind,info,isDanger=false){
    state.feedback++;
    const item={time:state.minute,kind,info,isDanger};state.log.unshift(item);state.log.length=Math.min(state.log.length,6);
    const list=$('audit-log');list.textContent='';
    for(const e of state.log){const li=document.createElement('li');li.textContent=`T+${fmt(e.time,0)} min｜${e.kind}：${e.info}`;if(e.isDanger)li.classList.add('alert');list.appendChild(li);}
    $('audit-count').textContent=state.feedback;
    state.version=1+Math.floor(state.feedback/2);$('model-version').textContent='v'+state.version;
  }
  function updateSliders(){
    const entries=[['flow-input','flow-out',' L/s'],['rpm-input','rpm-out',' rpm'],['mu-input','mu-out',' mPa·s']];
    for(const [id,out,unit] of entries){const el=$(id);$(out).textContent=el.value+unit;el.style.setProperty('--pct',((+el.value- +el.min)/(+el.max- +el.min)*100)+'%');}
  }
  function refreshDisplay(){
    const cq=+$('flow-input').value,cr=+$('rpm-input').value,cm=+$('mu-input').value;
    const pPreview=pump(cq,cr,cm),pNow=pump(state.q,state.rpm,state.mu);
    const previewRisk=!feasible(cq,cr,cm),actualRisk=!feasible(state.q,state.rpm,state.mu);
    state.riskSeen=actualRisk;
    const bar=$('statebar');bar.classList.toggle('alarm',actualRisk);bar.classList.toggle('warn',!actualRisk&&previewRisk);
    const tip=$('preview-status');tip.classList.toggle('bad',previewRisk);
    tip.textContent=previewRisk?`人工候选越限：预计泵压 ${fmt(pPreview,2)} MPa，超出 22 MPa 安全红线`:`人工草案预测：泵压 ${fmt(pPreview,2)} MPa，属于教学可行域`;
    $('state-code').textContent=actualRisk?'OVERPRESSURE':previewRisk?'PREVIEW WARNING':'MONITORING';
    $('state-message').textContent=actualRisk?'严重警告：压漏地层风险！停止教学清理推进':previewRisk?'参数预警：人工候选泵压越限；实际执行值未改变':state.mode==='ai'?'司钻已采纳 AI 候选，循环净清理中':'司钻人工控制 / 正常循环';
    $('pressure-now').textContent=fmt(pNow,2);$('flow-now').textContent=fmt(state.q,0);$('rpm-now').textContent=fmt(state.rpm,0);$('bed-now').textContent=fmt(state.bed,1);$('clock-now').textContent='T+'+fmt(state.minute,0);
    $('velocity-val').textContent=fmt(annularVelocity(state.q),2);
    $('cleaning-val').textContent=fmt(cleaningRate(state.q,state.rpm,state.mu),3);
    $('remove-val').textContent=fmt(predictedFraction(state.q,state.rpm,state.mu)*100,0);
    $('margin-val').textContent=fmt(LIMIT-pPreview,2);
    $('check-pump').textContent=actualRisk?'执行工况超限':'实际工况可行';$('check-pump').classList.toggle('bad',actualRisk);
    recommendation=optimize(cm);
    if(recommendation){
      $('rec-flow').textContent=recommendation.q+' L/s';$('rec-rpm').textContent=recommendation.rpm+' rpm';
      $('rec-removal').textContent='约 '+Math.round(recommendation.removal*10)*10+'%';$('rec-pressure').textContent=fmt(recommendation.pressure,1)+' MPa';
      $('ai-title').textContent=actualRisk?'现场执行超压：立即复核并采取现场规定措施':previewRisk?'候选参数越限：仅能提交安全方案':'已找到泵压约束内的推荐方案';
      $('ai-reason').textContent=`离散 PSO + 可行域复核：${recommendation.q} L/s、${recommendation.rpm} rpm，预计40 min净清理 ${fmt(recommendation.removal*100,0)}%；仍需独立核对井底 ECD。`;
    }else{$('rec-flow').textContent='无可行解';$('rec-rpm').textContent='—';$('rec-removal').textContent='—';$('rec-pressure').textContent='—';$('ai-title').textContent='全部候选均越限：需要人工复核';}
    // Handoff safety UI: unsafe MANUAL PREVIEW cannot be interpreted as an approvable candidate.
    // Keep the original synthetic execution logic; an unsafe existing execution remains recoverable.
    $('ai-card').classList.toggle('alarm',actualRisk);
    $('ai-card').classList.toggle('preview-alert',previewRisk && !actualRisk);
    $('accept-btn').disabled = previewRisk;
    $('accept-btn').title = previewRisk ? '人工草案超出安全边界，请先调回安全范围再采纳 AI 推荐' : '须经司钻人工确认后才执行 AI 可行候选';
    if(previewRisk && !actualRisk){
      $('ai-title').textContent='人工草案越限：请先调回安全区，再审核 AI 推荐';
      $('ai-reason').textContent='当前滑块仅为预览，没有下发。预测压力/安全窗口越界；暂停 AI 采纳按钮，仍显示可行推荐供对照。';
    }
    drawBed();drawPump();drawBedSection();
  }
  function setTab(tab,writeHash=true){
    tab=['bg','flow','demo'].includes(tab)?tab:'bg';
    document.querySelectorAll('.tab').forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
    document.querySelectorAll('.panel').forEach(p=>{p.hidden=p.id!=='panel-'+tab;});
    if(writeHash&&window.location.hash!=='#/scene/d6-hole-cleaning?tab='+tab)window.location.hash='#/scene/d6-hole-cleaning?tab='+tab;
  }
  function readHash(){const found=location.hash.match(/[?&]tab=(bg|flow|demo)/);return found?found[1]:'bg';}
  function advance(minutes){
    for(let i=0;i<minutes;i++){
      state.minute++;
      if(feasible(state.q,state.rpm,state.mu))state.bed=Math.max(0.6,state.bed*Math.exp(-cleaningRate(state.q,state.rpm,state.mu)));
      state.history.push({minute:state.minute,bed:state.bed});if(state.history.length>46)state.history.shift();
    }
    refreshDisplay();
  }
  function applyAI(){
    const draftQ=+$('flow-input').value, draftR=+$('rpm-input').value, draftMu=+$('mu-input').value;
    if(!feasible(draftQ,draftR,draftMu)){
      $('decision-note').textContent='采纳暂停：人工草案越过安全边界。请先把滑块调整回安全区并重新审核。';
      refreshDisplay(); return;
    }
    const cm=draftMu,rec=optimize(cm);
    if(!rec){addLog('AI 不可行','没有符合硬约束的候选，等待人工复核',true);return;}
    $('flow-input').value=rec.q;$('rpm-input').value=rec.rpm;
    state.q=rec.q;state.rpm=rec.rpm;state.mu=cm;state.mode='ai';
    state.lastReason='司钻明确采纳 AI 安全候选';
    addLog('司钻采纳 AI',`${rec.q} L/s、${rec.rpm} rpm、PV ${cm} mPa·s；泵压 ${fmt(rec.pressure,2)} MPa；提交教学执行`);
    $('decision-note').textContent='人机交接完成：司钻授权模拟执行。预测清除量是理想化 40 min 净清理结果，不等于已实测。';
    updateSliders();refreshDisplay();
  }
  function applyManual(){
    const q=+$('flow-input').value,r=+$('rpm-input').value,mu=+$('mu-input').value,p=pump(q,r,mu);
    state.q=q;state.rpm=r;state.mu=mu;state.mode='manual';
    const bad=!feasible(q,r,mu);
    addLog('司钻人工设定',`${q} L/s、${r} rpm、PV ${mu} mPa·s，预测泵压 ${fmt(p,2)} MPa${bad?'（超限、仅作风险教学）':''}`,bad);
    $('decision-note').textContent=bad?'超压参数已进入风险教学模拟：红线警报激活，岩屑床不再模拟减少。真实作业严禁这样越限下发。':'已按司钻决定切换模拟工况；请结合返砂与井控继续审核。';
    refreshDisplay();
  }
  function circulate(){
    const risk=!feasible(state.q,state.rpm,state.mu);
    if(risk){addLog('人工延长循环请求','当前执行参数越限，额外循环被教学安全逻辑拒绝',true);$('decision-note').textContent='超限状态不允许继续教学清床；请先采用安全工况。';refreshDisplay();return;}
    addLog('司钻追加循环','基于振动筛岩屑返出，额外循环 10 min（合成工况）');advance(10);
    $('decision-note').textContent='已按人工决定增加 10 min 的教学模拟循环，审计保留。真实返砂存在滞后，需现场校核。';
  }
  function reset(){
    Object.assign(state,{q:24,rpm:60,mu:24,bed:20,minute:0,history:[],feedback:0,version:1,mode:'observation',riskSeen:false,lastReason:'等待人工授权',log:[]});
    for(let i=0;i<22;i++)state.history.push({minute:0,bed:20});
    $('flow-input').value=24;$('rpm-input').value=60;$('mu-input').value=24;
    $('audit-log').innerHTML='<li>等待人工采纳、微调或决定延长循环；日志将保留参数和风险解释。</li>';
    $('audit-count').textContent='0';$('model-version').textContent='v1';$('decision-note').textContent='等待司钻操作。超限草案会显示警告，即使在教学模拟中执行也不会被标为安全方案。';
    updateSliders();refreshDisplay();
  }
  function init(){
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
    window.addEventListener('hashchange',()=>setTab(readHash(),false));setTab(readHash(),false);
    for(const id of ['flow-input','rpm-input','mu-input'])$(id).addEventListener('input',()=>{updateSliders();refreshDisplay();});
    $('accept-btn').addEventListener('click',applyAI);$('manual-btn').addEventListener('click',applyManual);
    $('circulate-btn').addEventListener('click',circulate);$('reset-btn').addEventListener('click',reset);
    reset();
    // 1 second = 1 synthetic minute; no real equipment/API connectivity.
    setInterval(()=>advance(1),1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
