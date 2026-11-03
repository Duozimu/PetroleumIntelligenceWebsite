/* d2 | Downhole early warning — synthetic educational simulator only.
 * No real sensor, trained AE, well-control API, or online RL is used.
 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (v, digits = 2) => Number(v).toFixed(digits);
  const SIZE = 61;
  const C = {torque:'#b26a39', pressure:'#41699b', flow:'#2f7d6b', pit:'#7e5a8d', danger:'#b05a51', grid:'#e9e4d8'};
  const scenarioNames = {normal:'正常钻进', connection:'接单根停泵', loss:'井漏前兆', kick:'气侵前兆', stuck:'卡钻前兆'};
  const state = {
    scenario:'stuck', time:0, phase:0, handled:false, risk:0, raw:0,
    impulse:0, shown:0, count:0, pos:0, pit:100,
    last:{torque:9.7,pressure:15.3,flow:31.8,flowIn:32,pit:100,pump:1,rpm:120,flag:false},
    data:[], scoreData:[], feedback:[], dangerCount:0, baselineShift:0, baselineRevision:0, lastLevel:'normal'
  };

  function node(tag, attrs, content) {
    const item = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k,v]) => item.setAttribute(k, String(v)));
    if (content !== undefined) item.textContent = String(content);
    return item;
  }
  function put(svg, tag, attrs, content) { const item = node(tag, attrs, content); svg.appendChild(item); return item; }
  function stroke(svg, x1,y1,x2,y2,color=C.grid,extra={}) {
    return put(svg,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,...extra});
  }
  function txt(svg,x,y,label,extra={}) {
    return put(svg,'text',{x,y,fill:'#79828a','font-size':10.5,...extra},label);
  }
  function pathOf(points) {
    if (!points.length) return '';
    let d='M '+fmt(points[0][0],1)+' '+fmt(points[0][1],1);
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      d+=' Q '+fmt(a[0],1)+' '+fmt(a[1],1)+' '+fmt((a[0]+b[0])/2,1)+' '+fmt((a[1]+b[1])/2,1);
    }
    const last=points[points.length-1];
    return d+' L '+fmt(last[0],1)+' '+fmt(last[1],1);
  }
  function linePath(svg,id,color) {
    const p=put(svg,'path',{id,d:'',fill:'none',stroke:color,'stroke-width':2.3,'stroke-linejoin':'round','stroke-linecap':'round'});
    p.style.transition='d .35s ease';
    return p;
  }
  const X0=77, X1=867, W=X1-X0;
  const rows=[
    {name:'扭矩',key:'torque',unit:'kN·m',min:4,max:19,top:24,bottom:93,color:C.torque},
    {name:'立管压力',key:'pressure',unit:'MPa',min:0,max:21,top:109,bottom:178,color:C.pressure},
    {name:'返出流量',key:'flow',unit:'L/s',min:0,max:41,top:194,bottom:263,color:C.flow},
    {name:'池体积',key:'pit',unit:'m³',min:94,max:106,top:279,bottom:348,color:C.pit}
  ];
  const ix = i => X0 + i / (SIZE-1)*W;
  function yy(row,v){return row.bottom-clamp((v-row.min)/(row.max-row.min),0,1)*(row.bottom-row.top);}
  function initSignalChart() {
    const svg=$('signals');
    rows.forEach((row,i)=>{
      put(svg,'rect',{x:X0,y:row.top,width:W,height:row.bottom-row.top,fill:i%2?'#fff':'#fdfcf9'});
      for(let j=0;j<=2;j++){
        const v=row.min+(row.max-row.min)*j/2,y=yy(row,v);
        stroke(svg,X0,y,X1,y,C.grid,{'stroke-dasharray':'3 5'});
        txt(svg,X0-11,y+4,fmt(v,j===1?1:0),{'text-anchor':'end'});
      }
      txt(svg,10,row.top+12,row.name,{fill:row.color,'font-size':10.5,'font-weight':600});
      txt(svg,10,row.top+25,row.unit,{'font-size':9.5});
      stroke(svg,X0,row.top,X0,row.bottom,'#a8aaa6');
      linePath(svg,'series-'+row.key,row.color);
    });
    for(let i=0;i<SIZE;i+=15){
      const x=ix(i);stroke(svg,x,24,x,348,'#f1eee6',{'stroke-dasharray':'3 4'});
      txt(svg,x,372,i===SIZE-1?'现在':'−'+(SIZE-1-i)+' min',{'text-anchor':'middle'});
    }
    txt(svg,469,388,'模拟相对时间 / min',{'text-anchor':'middle',fill:'#4d565b'});
    linePath(svg,'series-alert','#b05a51');
  }
  function initScoreChart() {
    const svg=$('scores'),top=18,bottom=124;
    put(svg,'rect',{x:X0,y:top,width:W,height:bottom-top,fill:'#fdfcf9'});
    for(let v=0;v<=1.001;v+=.25){const y=bottom-v*(bottom-top);stroke(svg,X0,y,X1,y,C.grid,{'stroke-dasharray':'3 5'});txt(svg,X0-10,y+3,fmt(v*100,0),{'text-anchor':'end'});}
    for(let i=0;i<SIZE;i+=15)txt(svg,ix(i),148,i===SIZE-1?'现在':'−'+(SIZE-1-i)+' min',{'text-anchor':'middle'});
    txt(svg,12,11,'异常分数 / 100分',{'font-size':11,fill:'#4d565b','font-weight':600});
    linePath(svg,'score-series',C.jade||'#2f7d6b');
    put(svg,'line',{id:'warn-line',x1:X0,y1:0,x2:X1,y2:0,stroke:'#a97a1c','stroke-dasharray':'5 4'});
    put(svg,'line',{id:'danger-line',x1:X0,y1:0,x2:X1,y2:0,stroke:C.danger,'stroke-dasharray':'5 4'});
  }

  function thresholds(){
    const v=Number($('sensitivity').value);
    return v===0?{warn:.58,danger:.80,label:'稳健'}:v===2?{warn:.38,danger:.80,label:'灵敏'}:{warn:.50,danger:.80,label:'标准'};
  }
  function syntheticSample(){
    const t=state.time, s=state.scenario, elapsed=state.phase;
    const isConn=s==='connection';
    const pump=isConn?0:1;
    // 人工确认井漏后，演示入口排量从 32 L/s 平滑降至约 27 L/s。
    // 仅作教学可视化：不构成真实井漏处置指令。
    const reducedInflow=(s==='loss' && state.handled) ? 5*(1-Math.exp(-Math.max(0,elapsed-state.pos)/4)) : 0;
    const fin=pump ? 32-reducedInflow+.45*Math.sin(.19*t)+.23*Math.sin(.47*t) : 0;
    const rpm=isConn?0:120+.8*Math.sin(.14*t);
    let torque=isConn?5.1:9.70+.22*Math.sin(.31*t)+.15*Math.cos(.14*t);
    let pressure=pump?2.2+.4*fin+.027*torque+.09*Math.sin(.26*t):.52+.18*Math.sin(.21*t);
    let fout=isConn?.14:.993*fin+.27*Math.sin(.34*t);
    let leak=0,influx=0;
    // Scenario envelopes accumulate gradually and make coupled, physically interpretable changes.
    const onset=clamp(elapsed/13,0,1);
    const decay=state.handled ? Math.exp(-Math.max(0,elapsed-state.pos)/6):1;
    const sev=onset*decay;
    if(s==='loss'){
      leak=6*sev;fout-=leak;pressure-=2.0*sev;
      state.pit-=.008+.14*sev; // accumulated losses in tank inventory (m^3 per simulated minute)
    }else if(s==='kick'){
      influx=5.9*sev;fout+=influx;pressure-=.55*sev;
      state.pit+=.008+.13*sev;
    }else if(s==='stuck'){
      torque+=6.4*sev;pressure+=1.7*sev;
      fout-=.6*sev;
      state.pit+=.004*Math.sin(.27*t);
    }else{
      state.pit+=.006*Math.sin(.23*t); // near-steady volume for normal/connection
    }
    let flag=false;
    if(state.impulse>0){
      // Isolated sensor artifact: violates channel correlations but is NOT labelled as a downhole event.
      pressure+=5.2;fout-=5.5;torque+=.35;flag=true;state.impulse--;
    }
    return {torque,pressure,flow:fout,flowIn:fin,pit:state.pit,pump,rpm,flag,leak,influx};
  }
  function calculate(sample,prev) {
    const fin=sample.flowIn, fout=sample.flow;
    const balance=(fout-fin*.993); // normal flow offset compensated
    const pitDelta=sample.pit-prev.pit;
    const expectedPressure=2.2+.4*fin+.027*sample.torque;
    const pressureResidual=sample.pressure-expectedPressure-state.baselineShift;
    const torqueResidual=sample.torque-(9.70+.22*Math.sin(.31*state.time)+.15*Math.cos(.14*state.time));
    const flowErr=clamp((Math.abs(balance)-.40)/4.8,0,1);
    const pitErr=clamp((Math.abs(pitDelta)-.011)/.12,0,1);
    const pErr=clamp((Math.abs(pressureResidual)-.28)/2.2,0,1);
    const tErr=clamp((Math.abs(torqueResidual)-.34)/5.7,0,1);
    // Autoencoder proxy: a weighted reconstruction-error score over standardized channels.
    // The actual AE would learn joint reconstruction from training windows.
    const reconstruction=clamp(.34*flowErr+.27*pitErr+.20*pErr+.19*tErr,0,1);
    // Mechanistic consistency requires paired evidence, not just a single threshold breach.
    const lossEvidence=clamp(.5*clamp(-balance/5,0,1)+.36*clamp(-pitDelta/.12,0,1)+.14*clamp(-pressureResidual/2.2,0,1),0,1);
    const kickEvidence=clamp(.55*clamp(balance/5,0,1)+.4*clamp(pitDelta/.12,0,1)+.05*pErr,0,1);
    const stickEvidence=clamp(.75*clamp(torqueResidual/4.5,0,1)+.25*clamp(pressureResidual/1.6,0,1),0,1);
    const physical=Math.max(lossEvidence,kickEvidence,stickEvidence);
    let raw=clamp(.20*reconstruction+.80*physical,0,1);
    // Explicit operation gating prevents pump-off connection from looking like a loss/kick.
    if(sample.pump===0){raw=.04;}
    // Single-point sensor spikes remain a QC alert, not a sustained accident alarm.
    if(sample.flag){raw=Math.min(raw,.30);}
    const signatures={loss:lossEvidence,kick:kickEvidence,stuck:stickEvidence};
    const ranked=Object.entries(signatures).sort((a,b)=>b[1]-a[1]);
    return {raw,reconstruction,physical,balance,pitDelta,pressureResidual,torqueResidual,
      quality:sample.flag,gate:sample.pump===0,ranked,
      contributors:[
        ['流量失衡',flowErr],['池体积趋势',pitErr],['立压残差',pErr],['扭矩残差',tErr]
      ].sort((a,b)=>b[1]-a[1])};
  }
  function updateXAI(e,level) {
    let title,description;
    const best=e.ranked[0]||['loss',0];
    if(e.gate){
      title='工况门控：接单根 / 停泵';
      description='入口排量与返出流量同步降低、立压随泵停下降；此时常规流动平衡模型不适用，不能直接判定井漏。请核对作业记录。';
    }else if(e.quality){
      title='数据质量提示：疑似瞬时传感器干扰';
      description='立管压力与返出流量出现短时突变，缺少持续的池体积证据。已降低本采样点的事故评分权重，仍需核对仪表与数据质量。';
    }else if(level==='normal'){
      title='正常基线：未发现持续的联合偏离';
      description='当前流量平衡、池体积变化与扭矩/立压代理模型的残差较小；保持监测并观察工况切换。';
    }else if(best[0]==='loss'){
      title='井漏候选：返出减少与池体积下降耦合';
      description='出入口流量差为 '+fmt(e.balance,1)+' L/s，池体积变化 '+fmt(e.pitDelta,3)+' m³/模拟分钟；立压残差 '+fmt(e.pressureResidual,2)+' MPa。多项一致才构成可核实的井漏线索。';
    }else if(best[0]==='kick'){
      title='气侵候选：返出增加与池体积上涨耦合';
      description='返出相对入口增量 '+fmt(e.balance,1)+' L/s，池体积变化 '+fmt(e.pitDelta,3)+' m³/模拟分钟。该模式提示需要核实井况，不构成独立诊断。';
    }else{
      title='卡钻候选：扭矩偏离正常摩阻基线';
      description='扭矩机理残差 '+fmt(e.torqueResidual,2)+' kN·m，伴随压力/工况异常。需人工排查钻具、井眼摩阻以及传感器状态。';
    }
    $('xai-title').textContent=title;
    $('xai-body').textContent=description;
    $('explain-card').classList.toggle('danger',level==='danger');
    const list=$('evidence-list');list.textContent='';
    e.contributors.forEach(([name,value])=>{
      const row=document.createElement('div');row.className='evidence-row';
      const label=document.createElement('span');label.textContent=name;
      const bar=document.createElement('div');bar.className='evidence-bar';
      const fill=document.createElement('i');fill.style.width=fmt(value*100,0)+'%';bar.appendChild(fill);
      const number=document.createElement('strong');number.textContent=fmt(value*100,0)+'%';
      row.append(label,bar,number);list.appendChild(row);
    });
    $('xai-strength').textContent='规则模式匹配强度（非概率） '+fmt(best[1]*100,0)+'% · AE 残差代理 '+fmt(e.reconstruction,2)+' · 物理残差 '+fmt(e.physical,2);
  }
  function paintSignals(){
    const len=state.data.length;
    rows.forEach(row=>{
      const points=state.data.map((s,i)=>[ix(SIZE-len+i),yy(row,s[row.key])]);
      $('series-'+row.key).setAttribute('d',pathOf(points));
    });
  }
  function paintScores(t){
    const svg=$('scores'),top=18,bottom=124,sy=v=>bottom-clamp(v,0,1)*(bottom-top);
    $('warn-line').setAttribute('y1',sy(t.warn));$('warn-line').setAttribute('y2',sy(t.warn));
    $('danger-line').setAttribute('y1',sy(t.danger));$('danger-line').setAttribute('y2',sy(t.danger));
    $('score-series').setAttribute('d',pathOf(state.scoreData.map((v,i)=>[ix(SIZE-state.scoreData.length+i),sy(v)])));
    $('score-threshold').textContent='注意 '+fmt(t.warn*100,0)+' · 警戒 '+fmt(t.danger*100,0);
    const g=clamp(state.shown,0,1),angle=Math.PI-Math.PI*g;
    const gx=170+133*Math.cos(angle),gy=145-133*Math.sin(angle);
    $('gauge-needle').setAttribute('x2',fmt(gx,2));$('gauge-needle').setAttribute('y2',fmt(gy,2));
    $('gauge-needle').setAttribute('stroke',g>.8?'#b05a51':g>=t.warn?'#b26a39':'#242b2e');
    $('score-number').textContent=fmt(g*100,0);
    $('score-number').setAttribute('fill',g>.8?'#b05a51':g>=t.warn?'#b26a39':'#242b2e');
  }
  /* 五轴雷达：按工况修正后的偏差，未进行真实模型特征提取。 */
  const radarConfig={cx:290,cy:153,r:106,labels:['扭矩','立压','流量','池体积','转速']};
  let radarPrevious=[.28,.28,.28,.28,.28],radarFrame=0;
  function radarPoint(axis,value,radius=radarConfig.r) {
    const angle=-Math.PI/2+axis*2*Math.PI/5;
    return [radarConfig.cx+radius*value*Math.cos(angle),radarConfig.cy+radius*value*Math.sin(angle)];
  }
  function radarVertices(values){
    return values.map((v,i)=>radarPoint(i,v).map(x=>fmt(x,1)).join(',')).join(' ');
  }
  function initRadar(){
    const grid=$('radar-grid'),labels=$('radar-axis-labels');
    [.25,.5,.75,1].forEach((fraction)=>{
      put(grid,'polygon',{points:radarVertices(Array(5).fill(fraction)),fill:'none',stroke:'#e9e4d8','stroke-width':fraction===1?1.3:1,'stroke-dasharray':fraction===.5?'3 4':'none'});
    });
    radarConfig.labels.forEach((label,i)=>{
      const edge=radarPoint(i,1.02),out=radarPoint(i,1.26);
      stroke(grid,radarConfig.cx,radarConfig.cy,edge[0],edge[1],'#dcd8cc');
      txt(labels,out[0],out[1]+3,label,{'text-anchor':'middle',fill:'#4d565b','font-size':12,'font-weight':600});
    });
    txt(labels,radarConfig.cx+7,radarConfig.cy-7,'基准',{fill:'#9ba3a9','font-size':10});
    $('radar-baseline').setAttribute('points',radarVertices(Array(5).fill(.52)));
    $('radar-current').setAttribute('points',radarVertices(radarPrevious));
    radarPrevious.forEach((value,i)=>{
      const p=radarPoint(i,value);
      put($('radar-points'),'circle',{cx:p[0],cy:p[1],r:3.5,fill:'#b26a39',stroke:'#fff','stroke-width':1.2});
    });
  }
  function renderRadar(values, immediate=false, danger=false){
    cancelAnimationFrame(radarFrame);
    const poly=$('radar-current'),dots=[...$('radar-points').children];
    function draw(vs){
      poly.setAttribute('points',radarVertices(vs));
      vs.forEach((v,i)=>{
        const p=radarPoint(i,v);dots[i].setAttribute('cx',fmt(p[0],2));dots[i].setAttribute('cy',fmt(p[1],2));
      });
    }
    const color=danger?'#b05a51':'#b26a39';
    poly.setAttribute('stroke',color);poly.setAttribute('fill',color);
    dots.forEach(dot=>dot.setAttribute('fill',color));
    $('radar-legend-current').classList.toggle('danger',danger);
    $('radar-state').textContent='联合偏离：'+(danger?'高风险':Math.max(...values)>.52?'需核查':'正常范围');
    document.querySelector('.radar-card').classList.toggle('danger',danger);
    const from=[...radarPrevious],to=values.map(v=>clamp(v,.05,1));
    radarPrevious=to;
    if(immediate||window.matchMedia('(prefers-reduced-motion: reduce)').matches){draw(to);return;}
    const start=performance.now(),duration=340;
    function frame(now){
      const t=clamp((now-start)/duration,0,1),e=1-Math.pow(1-t,3);
      draw(from.map((v,i)=>v+(to[i]-v)*e));
      if(t<1)radarFrame=requestAnimationFrame(frame);
    }
    radarFrame=requestAnimationFrame(frame);
  }
  function updateRadar(e,forceNormal=false){
    if(forceNormal){renderRadar([.26,.27,.26,.28,.24],true,false);return;}
    const s=state.last;
    // 关联证据经工况/质量门控后才进入特征展示，避免停泵假越界。
    const factor=(e.gate||e.quality)?.05:1;
    const raw=[
      Math.abs(e.torqueResidual)/5.0,
      Math.abs(e.pressureResidual)/2.0,
      Math.abs(e.balance)/5.1,
      Math.abs(e.pitDelta)/.115,
      Math.abs(s.rpm-120)/85
    ];
    const v=raw.map(x=>clamp(.26+factor*(.58*clamp(x,0,1)+.18*state.shown),.14,1));
    renderRadar(v,false,state.shown>.80&&!e.gate&&!e.quality);
  }
  function updateInference(e,level){
    // 所有统计数为教学模拟，不能视为真实训练数据或工业推理日志。
    $('infer-window').textContent='10 点 / 10 模拟分钟';
    $('infer-match').textContent=(142+(state.time*7)%19)+' 次匹配';
    $('infer-recon').textContent=fmt(e.reconstruction,2);
    $('infer-physics').textContent=fmt(e.physical,2);
    const phases=[...document.querySelectorAll('.inference-progress span')];
    phases.forEach((el,i)=>el.classList.toggle('active',i===state.time%3));
    $('infer-summary').textContent=e.gate?'已识别停泵工况：进入门控检测，不将压力下降直接当作井漏。':
      e.quality?'检测到单点突变：先执行数据质量核查，再追踪持续的联合残差。':
      level==='danger'?'高风险证据聚集：AI 已生成解释，等待司钻最终研判。':
      level==='caution'?'联合偏离正在增大：优先核对立压、流量与摩阻关联。':
      '正在比较标准化重构误差与物理残差，保持连续监测。';
  }
  function handoffMessage(message,reviewed=false){
    $('handoff-state').textContent=message;
    document.querySelector('.handoff-line').classList.toggle('reviewed',reviewed);
  }
  function resolveWarnings(){
    document.querySelectorAll('#warnings-list li:not(.neutral):not(.resolved)').forEach(li=>{
      li.classList.add('resolved');li.classList.remove('danger');li.textContent='已人工研判（历史）｜'+li.textContent;
    });
  }
  function resetVisualAfterHumanDecision(message){
    // 复位显示的是本次“已研判事件”，绝非宣布真实井下危险已消除。
    state.shown=0;state.raw=0;state.lastLevel='normal';
    state.scoreData.push(0);if(state.scoreData.length>SIZE)state.scoreData.shift();
    $('k-score').textContent='0';
    paintScores(thresholds());updateRadar(null,true);
    $('statebar').className='statebar';
    $('status-text').textContent='人工研判已登记 · 继续监测新证据';
    $('state-level').textContent='HUMAN REVIEWED';
    document.querySelector('.score-card').classList.remove('danger');
    resolveWarnings();handoffMessage(message,true);
  }

  function record(type,details,cls='') {
    state.count++;$('k-feedback').textContent=state.count;$('audit-count').textContent=state.count;
    const log=$('audit-log');
    if(log.firstElementChild && log.firstElementChild.classList.contains('empty-log'))log.textContent='';
    const li=document.createElement('li');li.className=cls;
    const clock=document.createElement('span');clock.className='log-time';
    clock.textContent=new Date().toLocaleTimeString('zh-CN',{hour12:false});
    const message=document.createElement('span');
    message.textContent=type+'｜'+details+'｜场景 '+scenarioNames[state.scenario]+'，评分 '+fmt(state.shown*100,0)+'/100'+'，入口 '+fmt(state.last.flowIn,1)+' L/s，返出 '+fmt(state.last.flow,1)+' L/s，立压 '+fmt(state.last.pressure,1)+' MPa，扭矩 '+fmt(state.last.torque,1)+' kN·m';
    li.append(clock,message);log.prepend(li);
    while(log.children.length>8)log.lastElementChild.remove();
  }
  function updateLevel(e){
    const t=thresholds();
    let level=state.shown>t.danger?'danger':state.shown>=t.warn?'caution':'normal';
    if(e.gate)level='normal';
    const bar=$('statebar');bar.className='statebar'+(level==='normal'?'':' '+level);
    const indicator=$('state-level'),label=$('status-text');
    if(e.gate){label.textContent='工况识别 · 接单根停泵（已门控）';indicator.textContent='OPERATION FILTER';}
    else if(e.quality){label.textContent='数据质量波动 · 已降低单点权重';indicator.textContent='QC CHECK';}
    else if(level==='danger'){label.textContent='红色警戒：多变量持续异常，等待司钻核实';indicator.textContent='HIGH ALERT / 警戒';}
    else if(level==='caution'){label.textContent='黄色注意：异常证据正在聚集';indicator.textContent='CAUTION / 注意';}
    else{label.textContent='持续监测 · 当前无持续异常';indicator.textContent='NORMAL / 正常';}
    $('k-score').textContent=fmt(state.shown*100,0);
    $('k-balance').textContent=fmt(e.balance,1);
    $('k-mode').textContent=scenarioNames[state.scenario];
    document.querySelector('.score-card').classList.toggle('danger',level==='danger');
    updateXAI(e,level);paintScores(t);updateRadar(e);updateInference(e,level);
    if(level==='danger')handoffMessage('高风险警戒：机器提出证据，等待司钻核实并决定是否干预');
    else if(level==='caution')handoffMessage('黄色注意：AI 提供关联线索，最终核实由司钻完成');
    else if(!document.querySelector('.handoff-line').classList.contains('reviewed'))handoffMessage('持续监测 · AI 提醒、司钻最终授权');
    if(level!=='normal' && level!==state.lastLevel && !e.gate && !e.quality){
      const ul=$('warnings-list');
      if(ul.firstElementChild?.classList.contains('neutral'))ul.textContent='';
      const li=document.createElement('li');li.className=level==='danger'?'danger':'';
      const eventTime=new Date().toLocaleTimeString('zh-CN',{hour12:false});
      li.textContent=eventTime+'｜'+(level==='danger'?'红色警戒':'黄色注意')+' · '+$('xai-title').textContent+' · '+fmt(state.shown*100,0)+' 分（待司钻核实）';
      ul.prepend(li);while(ul.children.length>5)ul.lastElementChild.remove();
    }
    state.lastLevel=level;
    return level;
  }
  function advance(){
    state.time++;state.phase++;
    const prev=state.last;
    const sample=syntheticSample();
    const evidence=calculate(sample,prev);
    state.raw=evidence.raw;
    // Temporal persistence: coherent anomalies grow while a one-off pulse dies out.
    state.shown=clamp(.56*state.shown+.44*evidence.raw,0,1);
    if(evidence.gate)state.shown=.025;
    state.last=sample;
    state.data.push(sample);state.scoreData.push(state.shown);
    if(state.data.length>SIZE)state.data.shift();
    if(state.scoreData.length>SIZE)state.scoreData.shift();
    paintSignals();updateLevel(evidence);
  }
  function resetScenario(next){
    state.scenario=next;state.phase=0;state.pos=0;state.handled=false;state.shown=.03;state.raw=.03;state.lastLevel='normal';
    state.pit=100;updateRadar(null,true);state.last={torque:9.7,pressure:15.3,flow:31.8,flowIn:32,pit:100,pump:1,rpm:120,flag:false};
    // Keep prior history for visible transition; the new scenario produces its own trend.
    $('action-hint').textContent='已切换到'+scenarioNames[next]+'。观察多个通道是否构成一致证据，最终判断由司钻完成。';
    $('confirm').textContent=next==='stuck'?'✓ 确认干预（降钻压 / 提转速）':'✓ 确认风险 · 模拟处置';
  }
  function bindActions(){
    document.querySelectorAll('.tab').forEach(b=>{
      b.addEventListener('click',()=>switchTab(b.dataset.tab,true));
      b.addEventListener('keydown',event=>{
        if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
        const order=['bg','flow','demo'],i=order.indexOf(b.dataset.tab);
        const target=order[(i+(event.key==='ArrowRight'?1:2))%3];
        event.preventDefault();switchTab(target,true);$('tab-'+target).focus();
      });
    });
    window.addEventListener('hashchange',()=>switchTab(parseTab(),false));
    $('scenario').addEventListener('change',event=>{resetScenario(event.target.value);record('选择演示工况','司钻将模拟工况设置为“'+scenarioNames[state.scenario]+'”','ack');});
    $('sensitivity').addEventListener('input',()=>{
      const t=thresholds();$('sense-value').textContent=t.label;
      $('sensitivity').style.setProperty('--pct',Number($('sensitivity').value)*50+'%');
      updateLevel(calculate(state.last,state.data[state.data.length-2]||state.last));
    });
    $('disturb').addEventListener('click',()=>{
      state.impulse=2;record('传感器干扰注入','生成短时突变，等待质量门控和后续复评','warn');
    });
    $('reset').addEventListener('click',()=>{
      resetScenario('normal');$('scenario').value='normal';state.impulse=0;
      record('重置教学基线','清除当前模拟扰动并返回正常钻进；历史人工日志保留','ack');
    });
    $('dismiss').addEventListener('click',()=>{
      const reason=state.scenario==='connection'?'判断为接单根停泵工况':state.impulse>0||state.last.flag?'判断为瞬态传感器干扰':'司钻标记为误报（待复核），持续偏离不会被静音';
      state.baselineRevision++;
      state.baselineShift=clamp(state.baselineShift+0.012,-0.15,0.15);
      $('baseline-version').textContent='教学基线校准：v1.'+String(state.baselineRevision).padStart(2,'0')+' · 传感器偏置补偿 '+fmt(state.baselineShift,3)+' MPa（仅演示）';
      record('司钻驳回报警 / 误报标注',reason+'；校准版本 v1.'+String(state.baselineRevision).padStart(2,'0')+'；不屏蔽新异常','ack');
      resetVisualAfterHumanDecision('司钻标记疑似误报，已写入审计记录与教学基线版本');
      $('action-hint').textContent='人工标记误报：仪表盘与雷达图已归位，反馈进入教学基线校正；真实持续异常仍会在后续采样重新触发。';
    });
    $('confirm').addEventListener('click',()=>{
      const sc=state.scenario;
      const action=sc==='loss'?'模拟经核实的排量调整及后续稳定趋势（仅教学）':sc==='kick'?'记录气侵待核实并模拟风险趋稳（非现场井控指令）':sc==='stuck'?'记录卡钻前兆并模拟工况趋稳（非现场作业指令）':'记录人工核验结果（无需自动处置）';
      record('司钻确认风险 / 人工干预',action+'；模拟调整 WOB/RPM，后续曲线渐稳（非现场指令）','warn');
      if(['loss','kick','stuck'].includes(sc)){state.handled=true;state.pos=state.phase;}
      resetVisualAfterHumanDecision('司钻确认干预：已记录操作，模拟信号将逐步回稳');
      $('action-hint').textContent='司钻决策已登记：当前仪表和雷达图复位；随后按新采样继续复核，物理信号逐渐回稳不代表现场处置保证有效。';
    });
  }
  function parseTab(){const p=new URLSearchParams(location.hash.split('?')[1]||'');return p.get('tab')||'bg';}
  function switchTab(name,updateHash){
    const tab=['bg','flow','demo'].includes(name)?name:'bg';
    document.querySelectorAll('.tab').forEach(button=>{
      const on=button.dataset.tab===tab;
      button.classList.toggle('on',on);button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;
    });
    document.querySelectorAll('.panel').forEach(panel=>{
      const on=panel.id==='panel-'+tab;panel.hidden=!on;panel.classList.toggle('on',on);
    });
    if(updateHash)location.hash='#/scene/d2?tab='+tab;
  }
  function init(){
    initSignalChart();initScoreChart();initRadar();
    for(let i=0;i<SIZE;i++){
      const t=i-SIZE;
      const fin=32+.30*Math.sin(i*.15),torque=9.7+.19*Math.sin(i*.28),p=2.2+.4*fin+.027*torque;
      state.data.push({torque,pressure:p,flow:.993*fin+.14*Math.sin(i*.21),flowIn:fin,pit:100+.05*Math.sin(i*.08),pump:1,rpm:120,flag:false});
      state.scoreData.push(.035+.014*Math.sin(i*.17));
    }
    paintSignals();paintScores(thresholds());
    bindActions();resetScenario('stuck');switchTab(parseTab(),false);
    $('sensitivity').style.setProperty('--pct','50%');
    updateLevel(calculate(state.last,state.data[state.data.length-2]));
    window.setInterval(advance,800);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
