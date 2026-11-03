/* D10 NPT · standalone teaching simulator. All reports and probabilities are synthetic. */
(function(){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const $=id=>document.getElementById(id);
  const C={jade:'#2f7d6b',clay:'#b26a39',red:'#b05a51',blue:'#41699b',grid:'#e9e4d8',ink:'#79828a'};
  const DEFAULT=$('report-text').value;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const fmt=(v,p=1)=>Number(v).toFixed(p);
  const state={events:[],mode:'baseline',parsed:false,annotations:0,logs:[],count:0,cursor:0,risk:null};

  const stamp=()=>new Date().toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const timeToMin=s=>{const v=s.split(':').map(Number);return v[0]*60+v[1];};
  const asHours=(a,b)=>{let n=timeToMin(b)-timeToMin(a);if(n<0)n+=1440;return n>1440?0:n/60;};
  const showCost=n=>n===null?'未注明':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(n)+' 元';
  function addLog(title,detail,warn=false){
    state.logs.unshift({stamp:stamp(),title,detail,warn});state.logs=state.logs.slice(0,8);
    const root=$('audit-log');root.replaceChildren();
    state.logs.forEach(r=>{const li=document.createElement('li');li.textContent=`${r.stamp}｜${r.title}：${r.detail}`;if(r.warn)li.classList.add('warn');root.appendChild(li);});
  }
  function addFeedback(){state.count++;$('feedback-count').textContent=String(state.count);}
  function invalidateIfChanged(reason){
    if(state.mode!=='approved')return;
    state.mode='baseline';
    $('confirmation').textContent='工况或人工标签已变化：旧授权失效，需要重新审核。';
    $('confirmation').classList.add('warn');
    $('decision-status').textContent='等待重新授权';
    addLog('授权失效',reason+'；此前审批只对原始情景有效',true);
  }
  function parseReport(){
    const raw=$('report-text').value;
    const rows=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const events=[];
    rows.forEach((line,idx)=>{
      const match=line.match(/(\d{1,2}:\d{2})\s*[-~—至]\s*(\d{1,2}:\d{2})/);
      const start=match?match[1]:'未注明',end=match?match[2]:'未注明';
      const hours=match?asHours(start,end):null;
      let type='待核实',category='review';
      if(/井漏|漏失/.test(line)){type='井漏 / 泥浆处理';category=/停|暂停/.test(line)?'npt':'review';}
      else if(/等钻具|待钻具|等工具|等待工具/.test(line)){type='等待钻具';category=/停|等待|等钻具/.test(line)?'npt':'review';}
      else if(/故障|异常|泵压波动|检查泥浆泵|检修/.test(line)){type='设备异常 / 复核';category='review';}
      else if(/正常钻进|钻进至/.test(line)){type='正常钻进';category='normal';}
      const money=line.match(/(?:估算停工损失|停工损失|损失|费用|成本)\s*([\d.]+)\s*(万?元)/);
      const cost=money?Math.round(Number(money[1])*(money[2]==='万元'?10000:1)):null;
      const action=(line.match(/配泥浆|循环观察|检查泥浆泵|顶驱保养|暂停钻进|暂停作业|正常钻进/)||[])[0]||'待人工识别';
      events.push({id:idx,start,end,hours,cost,type,action,category,text:line});
    });
    state.events=events;state.parsed=true;state.mode='baseline';
    renderHighlights(raw);renderTable();updateIndicators();
    $('parser-message').textContent=`已解析 ${events.length} 条，分类需人工审核`;
    $('confirmation').textContent='Human-in-the-loop：文本已解析，等待平台经理确认';
    $('confirmation').classList.remove('warn');
    $('decision-status').textContent='未授权';
    addLog('自动解析',`生成 ${events.length} 条事件记录；费用仅提取文本明确记载的金额`);
  }
  function renderHighlights(raw){
    const matches=[],rules=[
      ['time',/\b\d{1,2}:\d{2}\s*[-~—至]\s*\d{1,2}:\d{2}\b/g],
      ['cost',/(?:估算停工损失|停工损失|损失|费用|成本)\s*[\d.]+\s*万?元/g],
      ['event',/井漏|漏失|等钻具|待钻具|等工具|泵压波动|故障|正常钻进/g],
      ['action',/配泥浆|循环观察|检查泥浆泵|暂停钻进|暂停作业|顶驱保养/g]
    ];
    rules.forEach(([type,re])=>{for(const m of raw.matchAll(re))matches.push({start:m.index,end:m.index+m[0].length,type});});
    matches.sort((a,b)=>a.start-b.start||b.end-a.end);
    const out=$('highlight-output');out.replaceChildren();let pos=0;
    for(const e of matches){if(e.start<pos)continue;
      if(e.start>pos)out.appendChild(document.createTextNode(raw.slice(pos,e.start)));
      const mark=document.createElement('span');mark.className='entity '+e.type;mark.textContent=raw.slice(e.start,e.end);out.appendChild(mark);pos=e.end;
    }
    if(pos<raw.length)out.appendChild(document.createTextNode(raw.slice(pos)));
    if(raw.length===0)out.textContent='文本为空，请输入日报内容后重新解析。';
  }
  function renderTable(){
    const body=$('event-body');body.replaceChildren();
    if(!state.events.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty-row';td.textContent='未解析到有效日报行';tr.appendChild(td);body.appendChild(tr);return;}
    state.events.forEach(evt=>{
      const tr=document.createElement('tr');
      [evt.start+'–'+evt.end,evt.type+' / '+evt.action,evt.hours===null?'待核实':fmt(evt.hours,1)+' h',showCost(evt.cost)].forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.appendChild(td);});
      const td=document.createElement('td'),sel=document.createElement('select');sel.setAttribute('aria-label',`第${evt.id+1}条人工 NPT 归属`);
      [['normal','正常 / 计划'],['npt','NPT'],['review','待核实']].forEach(([value,label])=>{const opt=document.createElement('option');opt.value=value;opt.textContent=label;sel.appendChild(opt);});
      sel.value=evt.category;
      sel.addEventListener('change',()=>{
        const prev=evt.category;invalidateIfChanged('NPT归属人工修订');evt.category=sel.value;addFeedback();
        addLog('人工修订',`第 ${evt.id+1} 条由 ${prev} 改为 ${sel.value}；加入待审核训练样本`);
        updateIndicators();
      });
      td.appendChild(sel);tr.appendChild(td);body.appendChild(tr);
    });
  }
  function calcHazard(hour){
    const depth=+$('depth-input').value,pr=+$('pressure-input').value,eq=+$('equipment-input').value;
    const loss=state.events.some(e=>e.category==='npt'&&/井漏/.test(e.type));
    const machinery=state.events.some(e=>/泵|设备/.test(e.type));
    const nptCount=state.events.filter(e=>e.category==='npt').length;
    const baseline=0.0058+Math.max(0,depth-3000)/1000*.0026+pr*.00105+eq*.0055+(loss?.0038:0)+(machinery?.002:0)+Math.min(4,nptCount)*.0012;
    const wave=1+.26*Math.sin(hour*.56+.5)+.12*Math.cos(hour*1.33-.4);
    return Math.max(.001,baseline*wave);
  }
  function forecast(mult=1){
    const cumulative=[{h:0,p:0}],hazards=[];let H=0;
    for(let h=1;h<=24;h++){
      const k1=calcHazard(h-.75)*mult,k2=calcHazard(h-.25)*mult;
      H+=(k1+k2)*.5;
      cumulative.push({h,p:100*(1-Math.exp(-H))});
      hazards.push({h,rate:(k1+k2)*.5});
    }
    return {curve:cumulative,hazards,p12:cumulative[12].p,p24:cumulative[24].p};
  }
  const svg=(id)=>{const root=$(id);root.replaceChildren();return root;};
  const shape=(root,tag,attrs={},label)=>{const el=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));if(label!==undefined)el.textContent=String(label);root.appendChild(el);return el;};
  function text(root,x,y,label,attrs={}){return shape(root,'text',{x,y,'font-size':10.5,fill:C.ink,...attrs},label);}
  const line=(root,x1,y1,x2,y2,color=C.grid,dash='')=>shape(root,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,...(dash?{'stroke-dasharray':dash}:{})});
  const drawLine=(root,points,color,width=2.6,dash='')=>shape(root,'path',{d:'M'+points.map(p=>fmt(p[0],2)+' '+fmt(p[1],2)).join(' L'),fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round',...(dash?{'stroke-dasharray':dash}:{})});
  function drawRisk(base,action){
    const root=svg('risk-chart');const L=57,R=790,T=27,B=242;
    const x=h=>L+(R-L)*h/24,y=p=>B-(B-T)*p/100;
    shape(root,'rect',{x:L,y:T,width:R-L,height:B-T,fill:'#fdfcf9',rx:4});
    for(let p=0;p<=100;p+=20){line(root,L,y(p),R,y(p),C.grid,'4 5');text(root,L-9,y(p)+4,p+'%',{'text-anchor':'end'});}
    for(let h=0;h<=24;h+=4){line(root,x(h),T,x(h),B,'#f0eee7','4 5');text(root,x(h),B+17,h,{'text-anchor':'middle'});}
    const riskLine=y(30);line(root,L,riskLine,R,riskLine,C.red,'4 5');text(root,R-8,riskLine-8,'教学关注线 30%',{'text-anchor':'end',fill:C.red,'font-size':10});
    line(root,L,T,L,B,'#9ca7a4');line(root,L,B,R,B,'#9ca7a4');text(root,L,T-10,'累计发生至少一次 NPT 的概率 / %',{fill:'#4d565b','font-weight':600});text(root,(L+R)/2,278,'预测未来时间 / h',{'text-anchor':'middle',fill:'#4d565b'});
    drawLine(root,base.curve.map(v=>[x(v.h),y(v.p)]),C.clay,2.6);
    drawLine(root,action.curve.map(v=>[x(v.h),y(v.p)]),C.jade,state.mode==='approved'?3.8:2.3,'7 5');
    const current=state.mode==='approved'?action:base;
    const p=current.curve[12].p;
    shape(root,'circle',{cx:x(12),cy:y(p),r:5,fill:state.mode==='approved'?C.jade:C.clay,stroke:'#fff','stroke-width':2});
    text(root,x(12)+9,y(p)-8,`12 h：${fmt(p,0)}%`,{fill:state.mode==='approved'?C.jade:C.clay,'font-size':11,'font-weight':700});
    const xx=x(state.cursor);line(root,xx,T,xx,B,'#a3aba5','2 7');
  }
  function drawHazards(base,act){
    const root=svg('hazard-chart');const L=53,R=791,T=25,B=142;
    const all=[...base.hazards,...act.hazards].map(v=>v.rate);
    const ymax=Math.max(.04,Math.ceil(Math.max(...all)*100)/100+.005);
    const x=i=>L+(R-L)*i/12,y=v=>B-(B-T)*v/ymax;
    shape(root,'rect',{x:L,y:T,width:R-L,height:B-T,fill:'#fdfcf9',rx:3});
    for(let t=0;t<=4;t++){const val=t*ymax/4,yy=y(val);line(root,L,yy,R,yy,C.grid,'3 5');text(root,L-8,yy+4,fmt(val,2),{'text-anchor':'end','font-size':9.6});}
    for(let i=0;i<12;i++){const start=2*i,rate=(base.hazards[2*i].rate+base.hazards[2*i+1].rate)/2;const adjusted=(act.hazards[2*i].rate+act.hazards[2*i+1].rate)/2;
      shape(root,'rect',{x:x(i)+7,y:y(rate),width:19,height:Math.max(0,B-y(rate)),rx:2,fill:C.clay,opacity:.82});
      shape(root,'rect',{x:x(i)+27,y:y(adjusted),width:17,height:Math.max(0,B-y(adjusted)),rx:2,fill:C.jade,opacity:.8});
      if(i%2===0)text(root,x(i)+23,B+16,start,{'text-anchor':'middle','font-size':9.7});
    }
    line(root,L,B,R,B,'#9da6a1');text(root,L,14,'风险强度 / h⁻¹（2 小时平均）',{'font-size':10,fill:'#4d565b'});text(root,R,171,'预测未来时间 / h',{'text-anchor':'end','font-size':10,fill:'#4d565b'});
    text(root,R-2,T+14,'陶：未干预　青：干预后情景',{'text-anchor':'end','font-size':9.3});
  }
  function updateRange(){
    [['depth-input','depth-value',' m'],['pressure-input','pressure-value','%']].forEach(([id,out,suffix])=>{
      const el=$(id);$(out).textContent=el.value+suffix;el.style.setProperty('--fill',((+el.value- +el.min)/(+el.max- +el.min)*100)+'%');
    });
  }
  function updateIndicators(){
    updateRange();
    const nptH=state.events.reduce((sum,e)=>sum+(e.category==='npt'?(e.hours||0):0),0);
    const unknown=state.events.filter(e=>e.category==='review').length;
    const cost=state.events.reduce((sum,e)=>sum+(e.cost||0),0);
    $('npt-hours').textContent=fmt(nptH,1)+' h';$('unknown-count').textContent=String(unknown);$('explicit-cost').textContent=showCost(cost);
    $('depth-out').textContent=(+$('depth-input').value).toLocaleString('zh-CN')+' m';
    $('pressure-out').textContent=$('pressure-input').value+'%';
    const base=forecast(1),acted=forecast(.47);state.risk={base,acted};
    const current=state.mode==='approved'?acted:base;
    $('p12-out').textContent=fmt(current.p12,1)+'%';$('p24-out').textContent=fmt(current.p24,1)+'%';
    const high=base.p12>30,watch=base.p12>20;
    const status=$('status'),chip=$('risk-chip'),panel=$('ai-panel');
    status.classList.toggle('danger',high&&state.mode!=='approved');status.classList.toggle('warn',watch&&!high&&state.mode!=='approved');
    panel.classList.toggle('risk',watch&&state.mode!=='approved');
    chip.className='risk-chip'+(high&&state.mode!=='approved'?' bad':watch&&state.mode!=='approved'?' warn':'');
    chip.textContent=state.mode==='approved'?'已授权 · 干预情景':high?'高关注 · 需人工研判':watch?'中度关注 · 建议复核':'常规监测 · 低关注';
    $('status-title').textContent=state.mode==='approved'?'平台经理已授权干预 · 展示较低风险的预测情景':high?'风险预警：未来12小时 NPT 模拟概率偏高':watch?'风险关注：部分工况出现偏离':'日报结构化 + 工况风险监测';
    $('status-detail').textContent=state.mode==='approved'?'HUMAN APPROVED':high?'RISK REVIEW':watch?'WATCH':'MONITORING';
    const note=state.events.some(e=>e.category==='npt'&&/等待钻具/.test(e.type));
    $('ai-title').textContent=state.mode==='approved'?'干预方案已由平台经理批准':high?'建议提前检查井控与设备状态':watch?'建议复核近期异常并准备预案':'当前建议继续监测并复核日报';
    $('ai-description').textContent=`预计未来 12 小时发生至少一次 NPT 的${state.mode==='approved'?'干预后情景':'未干预情景'}概率约 ${fmt(current.p12,1)}%。这不是卡钻单一事件的概率；若立压、扭矩持续异常应按现场程序排查。`;
    $('evidence-1').textContent=`立压波动 ${$('pressure-input').value}% · 设备等级 ${+$('equipment-input').value+1}/3`;
    $('evidence-2').textContent=note?'日报识别“等待钻具”，请复核供应链':'日报已解析 '+state.events.length+' 条；待核实 '+unknown+' 条';
    $('evidence-3').textContent=high?'核对井控条件，必要时依程序循环与设备检查':'检查钻具保障、泵况并持续观察';
    drawRisk(base,acted);drawHazards(base,acted);
  }
  function choose(action){
    if(!state.parsed){addLog('操作提醒','请先完成一次日报解析',true);$('decision-note').textContent='请先解析日报并核实分类，再提交决策。';return;}
    if(action==='approved'){
      state.mode='approved';addFeedback();
      $('confirmation').textContent='Human-in-the-loop：采纳预警并批准教学干预情景；真实执行仍需现场审核。';
      $('confirmation').classList.remove('warn');$('decision-status').textContent='已采纳预警';
      $('decision-note').textContent='教学情景假定干预减小未来风险强度，但尚无实测结果；等待后续事件确认与概率回测。';
      addLog('平台经理采纳',`批准提前复核井控、泵况及钻具保障；记录原预测12h=${fmt(state.risk.base.p12,1)}%，情景值=${fmt(state.risk.acted.p12,1)}%`);
    }else{
      state.mode='ignored';addFeedback();
      $('confirmation').textContent='Human-in-the-loop：预警未采纳，记录人工原因待补录；风险按未干预情景展示。';
      $('confirmation').classList.add('warn');$('decision-status').textContent='未采纳预警';
      $('decision-note').textContent='人工选择继续观察：必须持续遵守现场安全程序；网页不授权任何危险操作。';
      addLog('平台经理忽略',`保留未干预风险情景12h=${fmt(state.risk.base.p12,1)}%；需说明现场判断依据`,true);
    }
    updateIndicators();
  }
  function reset(){
    state.mode='baseline';state.cursor=0;state.count=0;state.annotations=0;state.parsed=false;state.events=[];
    $('report-text').value=DEFAULT;$('depth-input').value=3160;$('pressure-input').value=12;$('equipment-input').value='1';
    $('highlight-output').textContent='请点击“一键 NLP 解析”生成高亮文本。';
    $('event-body').innerHTML='<tr><td class="empty-row" colspan="5">请先点击“一键 NLP 解析”</td></tr>';
    $('parser-message').textContent='等待识别时间、事件与处理措施';
    $('feedback-count').textContent='0';$('decision-status').textContent='未授权';
    $('confirmation').textContent='Human-in-the-loop：等待平台经理授权';$('confirmation').classList.remove('warn');
    $('decision-note').textContent='请核实天气、供应链、井控及设备情况；只有人工操作才会写入决策日志。';
    state.logs=[];addLog('演示重置','恢复示例日报和初始教学工况');updateIndicators();
  }
  function tab(name,writeHash=true){
    const key=['bg','flow','demo'].includes(name)?name:'bg';
    document.querySelectorAll('.tab').forEach(btn=>{const on=btn.dataset.tab===key;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',String(on));btn.tabIndex=on?0:-1;});
    document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!=='panel-'+key);
    if(writeHash&&location.hash!=='#/scene/d10-npt?tab='+key)location.hash='#/scene/d10-npt?tab='+key;
  }
  function init(){
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
    window.addEventListener('hashchange',()=>tab((location.hash.match(/[?&]tab=(bg|flow|demo)/)||[])[1]||'bg',false));
    $('parse-btn').addEventListener('click',parseReport);
    $('sample-btn').addEventListener('click',()=>{$('report-text').value=DEFAULT;parseReport();});
    $('depth-input').addEventListener('input',()=>{invalidateIfChanged('井深假设变化');updateIndicators();});
    $('pressure-input').addEventListener('input',()=>{invalidateIfChanged('立压波动假设变化');updateIndicators();});
    $('equipment-input').addEventListener('change',()=>{invalidateIfChanged('设备状态假设变化');updateIndicators();});
    $('approve-btn').addEventListener('click',()=>choose('approved'));
    $('ignore-btn').addEventListener('click',()=>choose('ignored'));
    $('reset-btn').addEventListener('click',reset);
    $('model-version').textContent='rule-proxy v1.0';
    updateIndicators();tab((location.hash.match(/[?&]tab=(bg|flow|demo)/)||[])[1]||'bg',false);
    setInterval(()=>{if(!document.hidden&&$('panel-demo').hidden===false){state.cursor=(state.cursor+1)%25;if(state.risk)drawRisk(state.risk.base,state.risk.acted);}},1200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
