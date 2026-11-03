/* d4-fatigue teaching simulator · pure JS and SVG · no site control / no trained model */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const C = {jade:'#2f7d6b',clay:'#b26a39',bad:'#b05a51',ink:'#4d565b',dim:'#79828a',line:'#e9e4d8',blue:'#41699b'};
  const $ = id => document.getElementById(id);
  const clip = (x,a,b) => Math.max(a,Math.min(b,x));
  const f = (x,n=2) => Number(x).toFixed(n);
  let damage = 0.765, time = 16.0, depth = 3120, tool = 1, step = 0;
  let mode = 'watch', remaining = 0, failed = false, feedbacks = 0;
  let rul = 0, rms = 0, inc = 0, residual = 0;
  let samples = [];
  const history = [];
  const HISTORY_LIMIT = 65;
  const stamp = () => new Date().toLocaleTimeString('zh-CN',{hour12:false});
  const iconSafe = s => s;

  function shape(tag, props={}, label){
    const el=document.createElementNS(NS,tag);
    Object.entries(props).forEach(([k,v])=>el.setAttribute(k,String(v)));
    if(label!==undefined)el.textContent=String(label);
    return el;
  }
  function put(s,tag,props,label){const el=shape(tag,props,label);s.appendChild(el);return el;}
  function line(s,x1,y1,x2,y2,color=C.line,dash=''){return put(s,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,...(dash?{'stroke-dasharray':dash}:{})});}
  function label(s,x,y,value,props={}){return put(s,'text',{x,y,fill:C.dim,'font-size':11,'font-family':'system-ui,sans-serif',...props},value);}
  function svgPath(s,id,color,width=2.8,dash=''){
    return put(s,'path',{id,d:'',stroke:color,'stroke-width':width,fill:'none','stroke-linejoin':'round','stroke-linecap':'round',...(dash?{'stroke-dasharray':dash}:{})});
  }
  function path(points){if(!points.length)return '';return points.map((p,i)=>(i?'L':'M')+f(p[0],2)+','+f(p[1],2)).join(' ');}

  function initCharts(){
    let s=$('rul-chart');let L=61,R=796,T=33,B=265;
    const X=i=>L+i/(HISTORY_LIMIT-1)*(R-L);
    const Y=v=>B-clip(v,0,40)/40*(B-T);
    put(s,'rect',{x:L,y:T,width:R-L,height:B-T,fill:'#fdfcf9'});
    put(s,'rect',{x:L,y:Y(3),width:R-L,height:B-Y(3),fill:'#f9e9e5',opacity:.68});
    for(let v=0;v<=40;v+=10){let y=Y(v);line(s,L,y,R,y);label(s,L-12,y+4,v,{'text-anchor':'end'});}
    for(let i=0;i<HISTORY_LIMIT;i+=16){let x=X(i);line(s,x,T,x,B,'#f2efe8','3 5');label(s,x,B+19,i===64?'当前':'−'+(64-i)+' 样点',{'text-anchor':'middle','font-size':9.5});}
    line(s,L,T,L,B,'#96a19d');line(s,L,B,R,B,'#96a19d');
    line(s,L,Y(3),R,Y(3),C.bad,'6 5');
    label(s,R-5,Y(3)-8,'警戒线 3 h',{'text-anchor':'end',fill:C.bad});
    label(s,L,17,'剩余寿命 RUL（h）',{'font-weight':600,fill:C.ink});
    label(s,(L+R)/2,314,'相对采样时间（压缩模拟）',{'text-anchor':'middle',fill:C.ink});
    svgPath(s,'rul-series',C.jade);
    put(s,'circle',{id:'rul-tip',cx:L,cy:Y(20),r:4,fill:C.jade,stroke:'#fff','stroke-width':1.5});

    s=$('vibration-chart');L=60;R=798;T=22;B=178;
    const vy=v=>T+(2.5-v)/5*(B-T);
    put(s,'rect',{x:L,y:vy(1.3),width:R-L,height:vy(-1.3)-vy(1.3),fill:'#edf2ed'});
    for(let v=-2;v<=2;v+=1){const y=vy(v);line(s,L,y,R,y,v===0?'#c5ccc8':C.line,v===0?'4 4':'');label(s,L-9,y+4,v,{'text-anchor':'end'});}
    for(let i=0;i<=5;i++){const x=L+i/5*(R-L);line(s,x,T,x,B,'#f1efe8','3 6');label(s,x,B+17,String(i*200),{'text-anchor':'middle','font-size':10});}
    line(s,L,T,L,B,'#9ba3a9');line(s,L,B,R,B,'#9ba3a9');
    label(s,L,13,'相对振动幅值（归一化）',{'font-weight':600,fill:C.ink});
    label(s,(L+R)/2,222,'采样窗口时间（ms）',{'text-anchor':'middle',fill:C.ink});
    svgPath(s,'vib-series',C.clay,1.6);
  }
  function computeWave(d, t, high){
    const a=0.48+0.9*clip(d-.65,0,.4)+(.5*high);
    let sum=0;const arr=[];
    for(let i=0;i<256;i++){
      const local=i/200;
      const stick=(Math.sin(2*Math.PI*4.4*local+0.6*t) > .75? .24 : -.10);
      const impulsive=(i%67===0? .57*(1+high):0);
      const v=a*(.68*Math.sin(2*Math.PI*12*local+.31*t)+.24*Math.sin(2*Math.PI*29*local-.12*t)+stick)+impulsive+.06*Math.sin(i*2.77+t);
      arr.push(v);sum+=v*v;
    }
    return {data:arr,rms:Math.sqrt(sum/arr.length)};
  }
  function physicalDelta(){
    /* 以两组虚构应力幅计数构成 Miner 增量：n_i/N_i。每 tick 是合成服役片段。 */
    const high=(mode==='continue'?1:0);
    const lowCycles=55+8*Math.sin(step*.14);
    const highCycles=11+8*high+8*clip(damage-.7,0,1);
    const Nlow=10800, Nhigh=5000;
    const minor=lowCycles/Nlow+highCycles/Nhigh;
    const amplification=high?1.45:1;
    return Math.max(.0002,minor*amplification);
  }
  function updateSeries(){
    const y=v=>265-clip(v,0,40)/40*(265-33);
    const points=history.map((h,i)=>[61+i/(HISTORY_LIMIT-1)*(796-61),y(h.rul)]);
    $('rul-series').setAttribute('d',path(points));
    if(points.length){const p=points[points.length-1];$('rul-tip').setAttribute('cx',p[0]);$('rul-tip').setAttribute('cy',p[1]);$('rul-tip').setAttribute('fill',failed?C.bad:damage>.8?C.clay:C.jade);}
    const W=738,L=60;const wpoints=samples.map((v,i)=>[L+i/(samples.length-1)*W,22+(2.5-clip(v,-2.5,2.5))/5*(178-22)]);
    $('vib-series').setAttribute('d',path(wpoints));
    $('vib-series').setAttribute('stroke',damage>=.94?C.bad:C.clay);
  }
  function audit(kind,msg,bad=false){
    feedbacks++;
    const li=document.createElement('li');li.className=bad?'bad':'';
    li.textContent='['+stamp()+'] '+kind+'｜'+msg+'｜D='+f(damage,3)+'，进尺='+f(depth,1)+' m，钻具 T-'+String(tool).padStart(3,'0');
    const root=$('audit-log');if(root.firstElementChild?.textContent?.startsWith('暂无'))root.textContent='';
    root.prepend(li);while(root.children.length>7)root.lastElementChild.remove();
    $('feedback-num').textContent=feedbacks;
  }
  function updateStatus(){
    const bar=$('statebar'), ai=$('ai-card');
    bar.className='statebar';ai.className='card ai-card';
    let level='NORMAL / WATCH',title='正在监测：剩余寿命与疲劳损伤',head='当前处于监测窗口',reason='振动时序与 Miner 物理损伤共同解释寿命变化；尚未进入教学干预阈值。',short='持续观察';
    if(failed){bar.classList.add('failed');ai.classList.add('danger');level='FAILURE / STOP';title='严重警报：教学钻具达到 D ≥ 1.00，强制终止模拟钻进';head='模拟断钻具：禁止继续钻进';reason='累计损伤达到模型临界，模拟器已终止运行。实际钻具是否断裂不能仅由 Miner D 确定。';short='教学锁定';}
    else if(damage>=.94){bar.classList.add('danger');ai.classList.add('danger');level='HIGH / HUMAN';title='高风险：损伤逼近教学临界 · 请求人工研判';head='预测疲劳临界，建议起钻检查/更换';reason='D 已进入 0.94 以上区间，继续服役可迅速触及临界；高频振动特征与疲劳物理证据需联合复核。';short='建议起钻';}
    else if(damage>.8){bar.classList.add('warning');ai.classList.add('warning');level='WARNING / HUMAN';title='提前预警：累计疲劳损伤 D > 0.80';head='AI 预警：建议评估起钻更换';reason='Miner 累积损伤跨过教学预警门槛；建议结合振动幅值、钻具台账及现场检查决定是否起钻。';short='人工审核';}
    $('state-label').textContent=level;$('state-title').textContent=title;
    $('ai-headline').textContent=head;$('ai-reason').textContent=reason;
    $('decision-evidence').textContent=short;
    $('physics-evidence').textContent='D = '+f(damage,3);
    $('sequence-evidence').textContent='RMS = '+f(rms,2);
    $('health-val').textContent=f(100*Math.max(0,1-damage),0);
    $('damage-val').textContent=f(damage,3);
    $('depth-val').textContent=f(depth,0);
    $('rul-val').textContent=f(rul,1);
    $('time-val').textContent=f(time,1);
    $('tool-val').textContent='T-'+String(tool).padStart(3,'0');
    $('damage-rate').textContent='+'+f(inc,4);
    $('vib-rms').textContent=f(rms,2);
    $('residual').textContent=f(residual,3);
    $('model-state').textContent=failed?'已锁定':damage>.8?'建议复核':'基线一致';
    $('damage-fill').style.width=f(clip(damage*100,0,100),2)+'%';
    $('damage-fill').style.background=damage>=.94?C.bad:damage>.8?C.clay:C.jade;
    $('continue-btn').disabled=failed;
    $('trip-btn').disabled=failed;
    $('reset-btn').hidden=!failed;
  }
  function tick(){
    if(failed)return;
    step++;
    const ongoing=mode==='continue';
    const simInc=physicalDelta();
    inc=simInc;damage=Math.min(1.12,damage+inc);
    time+=.12;
    const progress=ongoing?Math.min(5,remaining):1.25;
    depth+=progress;
    if(ongoing)remaining-=progress;
    const wave=computeWave(damage,time,ongoing?1:0);samples=wave.data;rms=wave.rms;
    residual=.012*Math.sin(step*.62)+.012*clip(rms-.7,0,2);
    // 这里使用 Miner 增量和振动特征的可解释代理，不是经过训练的神经网络。
    const hourlyRate=Math.max(.008,inc/.12);
    rul=clip((1-damage)/hourlyRate,0,40);
    history.push({rul,time,damage});if(history.length>HISTORY_LIMIT)history.shift();
    if(damage>=1){
      failed=true;mode='failed';rul=0;history[history.length-1].rul=0;
      audit('严重事件','达到教学临界 D ≥ 1.00，强制停止；模拟断钻具',true);
      $('decision-result').textContent='严重事件：教学钻具达到临界并停止。可点击“重置教学场景”重新开始。';
    }else if(ongoing&&remaining<=0){
      mode='watch';audit('继续钻进结果','完成此次虚拟目标进尺，需复核疲劳与井下状态',damage>.8);
      $('decision-result').textContent='本轮虚拟继续钻进完成。继续监测中；这不是现场继续作业许可。';
    }
    updateSeries();updateStatus();
  }
  function restart(replacement){
    if(replacement){
      audit('人工采纳','起钻检查/更换模拟完成；新钻具入井，继续暴露风险已在教学中消除');
    }
    tool++;
    damage=.055;time=0;remaining=0;mode='watch';failed=false;step=0;
    inc=0;residual=0;
    history.length=0;
    const w=computeWave(damage,time,0);samples=w.data;rms=w.rms;
    rul=40;history.push({rul,time,damage});
    $('decision-result').textContent=replacement?'人工采纳并完成模拟更换：新批次钻具已进入监测。检查与维护结果已形成教学反馈。':'教学场景已重置；上一轮记录保留在本页审计区。';
    updateSeries();updateStatus();
  }
  function switchTab(name,updateHash=true){
    const tab=['bg','flow','demo'].includes(name)?name:'bg';
    document.querySelectorAll('.tab').forEach(x=>{const yes=x.dataset.tab===tab;x.classList.toggle('on',yes);x.setAttribute('aria-selected',String(yes));x.tabIndex=yes?0:-1;});
    document.querySelectorAll('.panel').forEach(x=>x.hidden=x.id!=='panel-'+tab);
    if(updateHash){const hash='#/scene/d4?tab='+tab;if(location.hash!==hash)location.hash=hash;}
  }
  function tabFromHash(){const m=location.hash.match(/[?&]tab=(bg|flow|demo)/);return m?m[1]:'bg';}
  function init(){
    document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
    window.addEventListener('hashchange',()=>switchTab(tabFromHash(),false));switchTab(tabFromHash(),false);
    initCharts();
    // 生成少量历史点；让初次打开也能看见寿命持续衰退的轨迹。
    for(let i=0;i<50;i++)history.push({time:i*.32,damage:.37+i*.0079,rul:clip(12.7-i*.18+.14*Math.sin(i*.2),0,40)});
    const w=computeWave(damage,time,0);samples=w.data;rms=w.rms;
    inc=physicalDelta();rul=clip((1-damage)/(inc/.12),0,40);
    history.push({time,damage,rul});updateSeries();updateStatus();
    $('advance').addEventListener('input',()=>{const el=$('advance');$('advance-value').textContent=el.value+' m';el.style.setProperty('--pct',(Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100+'%');});
    $('advance').dispatchEvent(new Event('input'));
    $('continue-btn').addEventListener('click',()=>{
      if(failed)return;
      const m=Number($('advance').value);remaining+=m;mode='continue';
      audit('人工暂缓','请求继续钻进 '+m+' m，承担新增疲劳暴露',true);
      $('decision-result').textContent='司钻选择带风险继续 '+m+' m（虚构井段），系统记录该指令并加速损伤模拟。';
      updateStatus();
    });
    $('trip-btn').addEventListener('click',()=>{if(!failed)restart(true);});
    $('reset-btn').addEventListener('click',()=>{audit('教学复位','故障事件后重新开始虚拟案例',true);restart(false);});
    window.setInterval(tick,900);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
