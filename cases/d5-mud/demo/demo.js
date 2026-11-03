/* d5-mud: isolated educational soft sensing & ECD optimization simulator.
   No network, no device command, no trained XGBoost/LSTM model. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const C = {jade:'#2f7d6b',clay:'#b26a39',bad:'#b05a51',blue:'#41699b',gray:'#79828a',grid:'#e9e4d8',ink:'#4d565b'};
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const f=(v,n=2)=>Number(v).toFixed(n);
  const state={tick:0,high:false,barite:1.5,fluid:0.8,targetBarite:1.5,targetFluid:0.8,softBias:0,version:1,lastRisk:'',lastStatus:'',feedback:0,pending:[],series:[],formulation:'idle'};
  const DEPTHS=[0,.125,.25,.375,.5,.625,.75,.875,1];
  const BAR_BASE=1.12;
  function pore(t){return state.high?1.258+0.029*t:1.132+0.025*t;}
  function frac(t){return 1.345+0.038*t;}
  // Coupled illustrative density + annular pressure loss; not a field hydraulics model.
  function density(b){return BAR_BASE + 0.052*b;}
  function ecd(t,b,fl){return density(b)+0.040+0.013*fl+0.018*t;}
  function viscosity(b,fl){return 22+5*b+6*fl;}
  function minMargin(b,fl){let m=Infinity;for(const t of DEPTHS){const v=ecd(t,b,fl);m=Math.min(m,v-pore(t),frac(t)-v);}return m;}
  function riskType(b=state.barite,fl=state.fluid){let low=0,high=0;for(const t of DEPTHS){const v=ecd(t,b,fl);low=Math.max(low,pore(t)-v);high=Math.max(high,v-frac(t));}return high>0.0005?'leak':low>0.0005?'kick':'safe';}
  function optimize(){
    // Hard feasibility first; costs cannot make an ECD-violating solution acceptable.
    let result=null;const center=state.high?2.0:1.5;
    for(let bi=0;bi<=40;bi++)for(let ri=0;ri<=25;ri++){
      const b=bi/10,fl=ri/10,margin=minMargin(b,fl);
      if(margin<0.002)continue;
      const material=0.4*b+0.27*fl;
      const rheology=Math.pow((viscosity(b,fl)-34.3)/10,2);
      const adjustment=Math.pow(b-state.barite,2)*0.12+Math.pow(fl-state.fluid,2)*0.08;
      const preference=6*Math.pow(b-center,2)+5*Math.pow(fl-.8,2);
      const cost=material+.35*rheology+.18*adjustment+preference;
      if(!result||cost<result.cost-1e-9)result={barite:b,fluid:fl,margin,cost};
    }
    return result;
  }
  function create(svg,tag,attrs={},content){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(content!=null)el.textContent=content;svg.appendChild(el);return el;}
  function text(svg,x,y,content,more={}){return create(svg,'text',{x,y,'font-size':11,fill:C.gray,...more},content);}
  function line(svg,x1,y1,x2,y2,color=C.grid,dash){return create(svg,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,...(dash?{'stroke-dasharray':dash}:{})});}
  function path(points){if(!points.length)return '';return points.map(([x,y],i)=>(i?'L':'M')+f(x,2)+' '+f(y,2)).join(' ');}
  function curve(svg,id,color,dash){const e=create(svg,'path',{id,fill:'none',stroke:color,'stroke-width':2.6,'stroke-linecap':'round','stroke-linejoin':'round',...(dash?{'stroke-dasharray':dash}:{})});e.style.transition='d .4s ease, stroke .3s';return e;}
  const E={L:71,R:753,T:46,B:300,min:1.05,max:1.49};
  const ex=d=>E.L+(d-E.min)/(E.max-E.min)*(E.R-E.L);
  const ey=t=>E.T+t*(E.B-E.T);
  function setupEcd(){
    const s=$('ecd-chart');
    for(let v=1.1;v<=1.451;v+=.05){let x=ex(v);line(s,x,E.T,x,E.B,'#eeeae2','3 4');text(s,x,E.T-9,f(v,2),{'text-anchor':'middle'});}
    for(let j=0;j<=4;j++){const t=j/4,y=ey(t);line(s,E.L,y,E.R,y);text(s,E.L-12,y+4,Math.round(2550+550*t),{'text-anchor':'end'});}
    line(s,E.L,E.T,E.L,E.B,C.gray);line(s,E.L,E.T,E.R,E.T,C.gray);
    text(s,(E.L+E.R)/2,19,'当量密度 / g·cm⁻³',{'text-anchor':'middle',fill:C.ink,'font-weight':600});
    text(s,12,34,'井深 / m',{fill:C.ink,'font-weight':600});
    text(s,(E.L+E.R)/2,345,'ECD 应位于孔隙压力与破裂压力之间',{'text-anchor':'middle',fill:C.ink,'font-size':11});
    create(s,'path',{id:'ecd-safe',fill:'#e6f1ec',opacity:'0.9'});
    curve(s,'ecd-pore',C.clay,'6 4');curve(s,'ecd-frac',C.bad,'6 4');curve(s,'ecd-live',C.jade);create(s,'g',{id:'ecd-flags'});
    text(s,690,55,'← 破裂风险',{'text-anchor':'end',fill:C.bad,'font-size':10});
    text(s,86,290,'井涌风险 →',{fill:C.clay,'font-size':10});
  }
  function drawEcd(){
    const p=DEPTHS.map(t=>[ex(pore(t)),ey(t)]),r=DEPTHS.map(t=>[ex(frac(t)),ey(t)]),v=DEPTHS.map(t=>[ex(ecd(t,state.barite,state.fluid)),ey(t)]);
    $('ecd-safe').setAttribute('d',path([...p,...r.slice().reverse()])+' Z');
    $('ecd-pore').setAttribute('d',path(p));$('ecd-frac').setAttribute('d',path(r));
    $('ecd-live').setAttribute('d',path(v));
    $('ecd-live').setAttribute('stroke',riskType()==='safe'?C.jade:C.bad);
    const group=$('ecd-flags');group.replaceChildren();
    DEPTHS.forEach(t=>{const val=ecd(t,state.barite,state.fluid);if(val<pore(t)||val>frac(t)){
      const x=ex(val),y=ey(t);line(group,x-5,y-5,x+5,y+5,C.bad);line(group,x+5,y-5,x-5,y+5,C.bad);
    }});
  }
  const S={L:67,R:786,T:39,B:191,min:1.10,max:1.39};
  const sx=i=>S.L+i/59*(S.R-S.L),sy=n=>S.B-(n-S.min)/(S.max-S.min)*(S.B-S.T);
  function setupSoft(){const s=$('soft-chart');
    for(let v=1.10;v<1.391;v+=.05){const y=sy(v);line(s,S.L,y,S.R,y);text(s,S.L-10,y+3,f(v,2),{'text-anchor':'end'});}
    for(let i=0;i<=59;i+=15){const x=sx(i);line(s,x,S.T,x,S.B,'#eeeae2','3 5');text(s,x,S.B+19,i===59?'现在':'−'+(59-i)+' min',{'text-anchor':'middle'});}
    text(s,S.L,S.T-17,'井下密度 / g·cm⁻³',{fill:C.ink,'font-weight':600});
    line(s,S.L,S.T,S.L,S.B,C.gray);line(s,S.L,S.B,S.R,S.B,C.gray);
    curve(s,'soft-true',C.jade);curve(s,'soft-pred',C.blue,'5 4');create(s,'g',{id:'soft-lab'});
  }
  function drawSoft(){const arr=state.series.slice(-60);const start=60-arr.length;
    $('soft-true').setAttribute('d',path(arr.map((p,i)=>[sx(start+i),sy(p.real)])));
    $('soft-pred').setAttribute('d',path(arr.map((p,i)=>[sx(start+i),sy(p.pred)])));
    const group=$('soft-lab');group.replaceChildren();
    arr.forEach((p,i)=>{if(p.lab!=null)create(group,'circle',{cx:sx(start+i),cy:sy(p.lab),r:4,fill:C.clay,stroke:'#fff','stroke-width':1.5});});
  }
  const LAG={L:69,R:790,T:35,B:167,min:1.16,max:1.47};
  const lx=i=>LAG.L+i/59*(LAG.R-LAG.L),ly=v=>LAG.B-(v-LAG.min)/(LAG.max-LAG.min)*(LAG.B-LAG.T);
  function setupLag(){const s=$('lag-chart');for(let v=1.2;v<1.46;v+=.05){let y=ly(v);line(s,LAG.L,y,LAG.R,y);text(s,LAG.L-11,y+3,f(v,2),{'text-anchor':'end'});}for(let i=0;i<=59;i+=15){let x=lx(i);line(s,x,LAG.T,x,LAG.B,'#eeeae2','3 5');text(s,x,LAG.B+19,i===59?'现在':'−'+(59-i)+' min',{'text-anchor':'middle'});}text(s,LAG.L,19,'ECD / g·cm⁻³',{fill:C.ink,'font-weight':600});line(s,LAG.L,LAG.T,LAG.L,LAG.B,C.gray);line(s,LAG.L,LAG.B,LAG.R,LAG.B,C.gray);curve(s,'lag-actual',C.jade);curve(s,'lag-target',C.blue,'5 5');}
  function drawLag(){const arr=state.series.slice(-60),offset=60-arr.length;
    $('lag-actual').setAttribute('d',path(arr.map((p,i)=>[lx(offset+i),ly(p.ecd)])));
    const goal=ecd(1,state.targetBarite,state.targetFluid);
    $('lag-target').setAttribute('d',path([[lx(42),ly(goal)],[lx(59),ly(goal)]]));
  }
  function addLog(message,kind='normal'){
    state.feedback++;
    const ul=$('audit-log');if(state.feedback===1)ul.replaceChildren();
    const li=document.createElement('li');li.textContent='T+'+state.tick+'｜'+message;
    li.className=kind;ul.prepend(li);while(ul.children.length>6)ul.lastElementChild.remove();
    $('log-count').textContent=String(state.feedback);
  }
  function updateRange(el){const percent=(+el.value-(+el.min))/(+el.max-(+el.min))*100;el.style.setProperty('--pct',percent+'%');}
  function updateDraft(){const b=$('barite'),fli=$('fluidloss');$('barite-out').textContent=f(+b.value,1)+'%';$('fluidloss-out').textContent=f(+fli.value,1)+'%';updateRange(b);updateRange(fli);}
  function showStatus(){
    const risk=riskType();const bar=$('statebar');bar.classList.remove('danger','warning');
    let title='正常循环：ECD 位于教学安全窗口',tag='NORMAL';
    if(risk==='kick'){title='井涌风险预警：地层孔隙压力升高，当前 ECD 不足';tag='KICK RISK';bar.classList.add('danger');}
    else if(risk==='leak'){title='井漏严重警告：过量加重使 ECD 越过破裂压力上界';tag='LOSS RISK';bar.classList.add('danger');}
    else if(state.high){title='高压盐水层：当前 ECD 已回到演示安全窗口';tag='RECOVERING';bar.classList.add('warning');}
    $('state-title').textContent=title;$('state-tag').textContent=tag;
    const ai=$('ai-card');ai.classList.remove('danger','warning');
    const suggestion=optimize();
    if(risk==='leak'){ai.classList.add('danger');$('ai-title').textContent='过度加重：需复核井漏风险';$('ai-reason').textContent='现场模拟 ECD 超出破裂压力下界窗口；暂停进一步加药、核查循环及井控状态。算法仅提供建议。';}
    else if(risk==='kick'){ai.classList.add('danger');$('ai-title').textContent='高压层预警：建议重晶石约 2.0%（教学）';$('ai-reason').textContent='地层孔隙压力梯度提高，原配方的 ECD 部分低于新下界；软测量 + 约束优化建议经泥浆工程师确认后调整。';}
    else if(state.high){ai.classList.add('warning');$('ai-title').textContent='已回到教学窗口，仍需现场复核';$('ai-reason').textContent='输送滞后尚可能存在；工程师需结合化验、返出流量及井壁状态确认响应。';}
    else{$('ai-title').textContent='稳态建议：重晶石 1.5%，降滤失剂 0.8%';$('ai-reason').textContent='候选配方已通过示意 ECD 窗口筛查，供工程师根据泥浆性质和岩屑返出情况审核。';}
    if(suggestion){$('rec-b').textContent=f(suggestion.barite,1)+'%';$('rec-f').textContent=f(suggestion.fluid,1)+'%';$('rec-margin').textContent=f(suggestion.margin,3);$('rec-cost').textContent=f(suggestion.cost,2);}else{$('rec-b').textContent='无可行解';$('rec-f').textContent='—';$('rec-margin').textContent='—';$('rec-cost').textContent='—';}
    $('formation-name').textContent=state.high?'高压盐水层':'普通井段';
    if(risk!==state.lastRisk){state.lastRisk=risk; if(risk==='leak')addLog('模拟 ECD 越过破裂压力窗口，显示井漏风险警告','danger');else if(risk==='kick')addLog('高压层发生压力窗口变化，显示井涌风险警告','danger');}
  }
  function triggerHigh(){if(state.high)return;state.high=true;addLog('模拟钻遇高压盐水层：孔隙压力边界提高，重新计算配方可行域');update();}
  function authorize(source){const suggestion=optimize();if(source==='ai'&&!suggestion){$('decision-text').textContent='当前候选集无安全解，不能提交 AI 配方。';return;}
    const b=source==='ai'?suggestion.barite:+$('barite').value;
    const fl=source==='ai'?suggestion.fluid:+$('fluidloss').value;
    if(source==='ai'){$('barite').value=b;$('fluidloss').value=fl;updateDraft();}
    state.targetBarite=b;state.targetFluid=fl;state.formulation=source;
    const danger=riskType(b,fl)!=='safe';
    const action=source==='ai'?'泥浆工程师采纳 AI 建议':'泥浆工程师人工修正并授权';
    addLog(action+'：重晶石 '+f(b,1)+'%，降滤失剂 '+f(fl,1)+'%；'+(danger?'预测越出 ECD 窗口（教学风险）':'预测在教学安全窗口内'),danger?'danger':'success');
    $('decision-text').textContent=action+'；正在模拟泥浆混合与循环的延迟响应。'+(danger?' 当前人工配方存在越界风险。':'');
    state.pending.push({due:state.tick+8,type:source});
    update();
  }
  function tick(){state.tick++;
    if(state.tick===12&&!state.high)triggerHigh();
    // Exponential settling models a delayed circulation / treatment response.
    state.barite+=(state.targetBarite-state.barite)*0.14;
    state.fluid+=(state.targetFluid-state.fluid)*0.12;
    const real=density(state.barite)+.0011*Math.sin(state.tick*.36);
    const predicted=real+state.softBias+.0027*Math.sin(state.tick*.58+.7);
    const lab=state.tick%9===0?real+.0008*Math.cos(state.tick*.29):null;
    state.series.push({real,pred:predicted,lab,ecd:ecd(1,state.barite,state.fluid)});if(state.series.length>60)state.series.shift();
    while(state.pending.length&&state.pending[0].due<=state.tick){const done=state.pending.shift();state.softBias=clamp(state.softBias-(predicted-real)*.13,-.02,.02);state.version++;$('model-version').textContent='v'+state.version;addLog('反馈回流：'+(done.type==='ai'?'采纳建议':'人工修正')+'后的演示密度/化验响应已记录，完成小幅偏差校正','success');}
    update();
  }
  function update(){
    drawEcd();drawSoft();drawLag();showStatus();
    const trueRho=density(state.barite),pred=trueRho+state.softBias+.0027*Math.sin(state.tick*.58+.7);
    $('ecd-now').textContent=f(ecd(1,state.barite,state.fluid),3);
    $('rho-now').textContent=f(pred,3);
    $('flow-now').textContent=f(38+.4*Math.sin(state.tick*.4),1);
    $('spp-now').textContent=f(19.8+10*(ecd(1,state.barite,state.fluid)-1.2)+.2*Math.sin(state.tick*.3),1);
    $('tick-now').textContent='T+'+state.tick;
    $('actual-b').textContent=f(state.barite,2)+'%';$('actual-f').textContent=f(state.fluid,2)+'%';
    $('lag-val').textContent=f(8+1.2*Math.sin(state.tick*.1),1);
    $('err-val').textContent=f(Math.abs(pred-trueRho),4);
    $('mu-val').textContent=f(viscosity(state.barite,state.fluid),1);
  }
  function setTab(tab,writeHash=true){if(!['bg','flow','demo'].includes(tab))tab='bg';
    document.querySelectorAll('.tab').forEach(el=>{const on=el.dataset.tab===tab;el.classList.toggle('on',on);el.setAttribute('aria-selected',String(on));el.tabIndex=on?0:-1;});
    document.querySelectorAll('.panel').forEach(el=>{el.hidden=el.id!=='panel-'+tab;});
    if(writeHash&&location.hash!=='#/scene/d5?tab='+tab)location.hash='#/scene/d5?tab='+tab;
  }
  function getHashTab(){return (location.hash.match(/[?&]tab=(bg|flow|demo)/)||[])[1]||'bg';}
  function init(){
    document.querySelectorAll('.tab').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.tab)));
    window.addEventListener('hashchange',()=>setTab(getHashTab(),false));
    setTab(getHashTab(),false);
    setupEcd();setupSoft();setupLag();
    for(let i=0;i<60;i++){const real=density(1.5)+.001*Math.sin(i*.24);state.series.push({real,pred:real+.0025*Math.cos(i*.23),lab:i%9===0?real+.0006:null,ecd:ecd(1,1.5,.8)});}
    $('barite').addEventListener('input',updateDraft);$('fluidloss').addEventListener('input',updateDraft);
    $('accept-btn').addEventListener('click',()=>authorize('ai'));
    $('manual-btn').addEventListener('click',()=>authorize('manual'));
    $('salt-btn').addEventListener('click',triggerHigh);
    $('reset-btn').addEventListener('click',()=>{state.tick=0;state.high=false;state.barite=1.5;state.fluid=.8;state.targetBarite=1.5;state.targetFluid=.8;state.softBias=0;state.version=1;state.lastRisk='';state.feedback=0;state.pending=[];state.series=[];state.formulation='idle';$('barite').value=1.5;$('fluidloss').value=.8;updateDraft();$('audit-log').replaceChildren();const li=document.createElement('li');li.textContent='演示已重置，等待新的人工决策。';$('audit-log').appendChild(li);$('log-count').textContent='0';$('model-version').textContent='v1';$('decision-text').textContent='观察模式：配方变更必须经泥浆工程师授权。';for(let i=0;i<60;i++){const real=density(1.5)+.001*Math.sin(i*.24);state.series.push({real,pred:real+.0025*Math.cos(i*.23),lab:i%9===0?real+.0006:null,ecd:ecd(1,1.5,.8)});}update();});
    updateDraft();update();setInterval(tick,800);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
