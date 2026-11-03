/* D7 | Geosteering educational simulator: no trained LSTM, no physical field controls. */
(function(){'use strict';
const NS='http://www.w3.org/2000/svg', $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI, f=(n,p=1)=>Number(n).toFixed(p), LR=18, H=30, DX=2;
const colors={jade:'#2f7d6b',blue:'#41699b',clay:'#b26a39',red:'#b05a51',grid:'#e9e4d8',ink:'#79828a'};
// Synthetic "ground truth": only simulation renderer uses it to advance / validate.
function trueCenter(x){return 203+.018*(x-60)+4*Math.sin((x-80)/28)+4.8*Math.tanh((x-140)/20);}
function seismicCenter(x){return trueCenter(x)+1.2+1.35*Math.sin(x/31+.6);}
const halfThick=5.0, state={x:68,y:trueCenter(68),inc:88,targetInc:88,mode:'hold',paused:false,bias:0.0,variance:1.8,step:0,log:[],points:[],logs:[],requested:null,ended:false,obs:[],history:[],lastWarn:false,justAuthorized:false,aiUntil:0,pending:[]};
function setChartAttrs(e,attrs){Object.entries(attrs).forEach(([key,val])=>e.setAttribute(key,String(val)));return e;}
function node(s,tag,attrs={},content){const e=document.createElementNS(NS,tag);setChartAttrs(e,attrs);if(content!==undefined)e.textContent=content;s.appendChild(e);return e;}
function line(s,x1,y1,x2,y2,color=colors.grid,dash=''){return node(s,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,...(dash?{'stroke-dasharray':dash}:{})});}
function label(s,x,y,t,attrs={}){return node(s,'text',{x,y,'font-size':11,fill:colors.ink,...attrs},t);}
function path(s,pts,color,width=2.4,dash='',opacity=1){if(pts.length<2)return;return node(s,'path',{d:'M'+pts.map(p=>f(p[0],2)+' '+f(p[1],2)).join(' L'),fill:'none',stroke:color,'stroke-width':width,opacity,'stroke-linejoin':'round','stroke-linecap':'round',...(dash?{'stroke-dasharray':dash}:{})});}
function polygon(s,pts,color,opacity=.18){return node(s,'polygon',{points:pts.map(p=>f(p[0],2)+','+f(p[1],2)).join(' '),fill:color,opacity,stroke:'none'});}
function xMap(x){return 53+(x/240)*738;}
function yMap(y){return 33+((y-180)/48)*281;}
function measuredPathY(x){let v=state.points[0].y;for(let i=1;i<state.points.length;i++){if(state.points[i].x>=x){let a=state.points[i-1],b=state.points[i],q=(x-a.x)/(b.x-a.x);return a.y+(b.y-a.y)*clamp(q,0,1);}v=state.points[i].y;}return v;}
function observedGR(sensorX){const d=measuredPathY(sensorX)-trueCenter(sensorX);const phase=Math.sin(sensorX*.41)*2.7+Math.cos(sensorX*.16)*1.9;return clamp((Math.abs(d)>halfThick?110:44)+6*Math.min(2,Math.abs(d)/halfThick)+phase,20,140);}
function predictCenter(x){return seismicCenter(x)+state.bias;}
function reliability(x){return clamp(.65+.018*Math.max(0,x-(state.x-LR))+.0035*Math.max(0,x-state.x),.7,3.7);}
function updatePosterior(){const sx=state.x-LR;if(sx<0)return;
  // Teacher-supplied proxy for inversion of sensor GR/resistivity into boundary position.
  const inferredCenter=trueCenter(sx)+.33*Math.sin(state.step*.87)+.19*Math.cos(state.step*.43);
  const residual=inferredCenter-seismicCenter(sx);
  state.bias=.68*state.bias+.32*residual;
  state.variance=clamp(state.variance*.88+.12*(.75+Math.abs(residual-state.bias)),.65,3.5);
  const gr=observedGR(sx);state.obs.push({x:sx,gr});if(state.obs.length>160)state.obs.shift();
  state.history.push({x:state.x,absoluteResidual:f(residual,2),error:f(predictCenter(sx)-trueCenter(sx),2)});
  // A human-approved recommendation becomes a delayed, reviewable training example
  // only when the trailing LWD sensor eventually passes the predicted interval.
  for(const item of state.pending){if(!item.checked && sx>=item.targetX){
    item.checked=true;const observed=trueCenter(item.targetX)+.25*Math.sin(state.step);
    const error=observed-item.predicted;
    log('反馈回流：'+item.action+'，界面预测误差 '+(error>=0?'+':'')+f(error,2)+' m；加入待复核样本。');
  }}
}
function forwardCandidate(inc){let score=0,y=state.y,angle=state.inc;for(let t=1;t<=H/2;t++){
 angle+=clamp(inc-angle,-.42,.42);y+=DX*Math.tan(rad(90-angle));const x=state.x+t*DX;
 const e=y-predictCenter(x),overshoot=Math.max(0,Math.abs(e)-halfThick+1.0);
 score+=e*e*.21+overshoot*overshoot*14+.08*Math.pow(angle-state.inc,2);
 }return score+.34*Math.pow(inc-state.inc,2);
}
function optimize(){let best=state.inc,cost=Infinity;for(let i=82;i<=94.01;i+=.5){let value=forwardCandidate(i);if(value<cost){cost=value;best=i;}}return {inc:best,cost};}
function futurePath(inc){let x=state.x,y=state.y,a=state.inc,pts=[[x,y]];for(let i=0;i<15;i++){a+=clamp(inc-a,-.42,.42);x+=DX;y+=DX*Math.tan(rad(90-a));pts.push([x,y]);}return pts;}
function makeFormation(s){const top=[],bot=[],center=[],estimated=[],upper=[],lower=[];for(let x=0;x<=240;x+=2){let v=trueCenter(x),m=predictCenter(x),r=reliability(x);top.push([xMap(x),yMap(v-halfThick)]);bot.push([xMap(x),yMap(v+halfThick)]);center.push([xMap(x),yMap(v)]);if(x>=state.x-LR&&x<=state.x+H){estimated.push([xMap(x),yMap(m)]);upper.push([xMap(x),yMap(m-r)]);lower.push([xMap(x),yMap(m+r)]);}}
  polygon(s,top.concat(bot.slice().reverse()),'#edcf93',.58);
  path(s,top,'#bb9e67',1.8);path(s,bot,'#bb9e67',1.8);
  if(upper.length>1)polygon(s,upper.concat(lower.slice().reverse()),'#a9c6e6',.27);
  if(estimated.length>1)path(s,estimated,'#41699b',1.4,'5 5',.62);
}
function drawGeology(){const s=$('geo-chart');s.replaceChildren();node(s,'rect',{x:42,y:24,width:749,height:290,fill:'#fdfcf9',rx:5});for(let x=0;x<=240;x+=40){const px=xMap(x);line(s,px,25,px,314,'#eeeae0','3 5');label(s,px,336,x,{'text-anchor':'middle'});}for(let d=180;d<=228;d+=8){let py=yMap(d);line(s,42,py,791,py,'#eeeae0','3 5');label(s,33,py+4,d,{'text-anchor':'end'});}
  makeFormation(s);
  // Plan uses pre-drill seismic prior centerline, not real future sensors.
  let design=[];for(let x=0;x<=240;x+=3)design.push([xMap(x),yMap(seismicCenter(x))]);path(s,design,'#9a9fa0',2,'7 6');
  // Gray x hatch symbolizes future unknown region; real geology displayed for teaching only.
  node(s,'rect',{x:xMap(state.x),y:24,width:Math.max(0,791-xMap(state.x)),height:290,fill:'#f9f4e9',opacity:.15});
  path(s,state.points.map(p=>[xMap(p.x),yMap(p.y)]),colors.jade,3.8);
  const best=optimize(),fut=futurePath(best.inc);path(s,fut.map(p=>[xMap(p[0]),yMap(p[1])]),colors.blue,2.8,'7 4');
  const trial=futurePath(Number($('inclination').value));path(s,trial.map(p=>[xMap(p[0]),yMap(p[1])]),colors.clay,1.6,'3 5',.8);
  const sensorX=state.x-LR,sensorY=measuredPathY(sensorX);node(s,'circle',{cx:xMap(sensorX),cy:yMap(sensorY),r:5.5,fill:colors.clay,stroke:'#fff','stroke-width':2});node(s,'circle',{cx:xMap(state.x),cy:yMap(state.y),r:6.5,fill:colors.jade,stroke:'#fff','stroke-width':2});
  if(state.x<240)line(s,xMap(state.x),24,xMap(state.x),314,colors.jade,'2 6');
  label(s,53,16,'垂深 TVD / m（向下增大）',{fill:'#4d565b','font-size':10});label(s,790,348,'水平位移 / m',{'text-anchor':'end',fill:'#4d565b','font-size':10});
  label(s,xMap(state.x)-7,23,'钻头',{'text-anchor':'end',fill:colors.jade,'font-size':10});label(s,xMap(sensorX)-7,23,'LWD',{'text-anchor':'end',fill:colors.clay,'font-size':10});
  label(s,775,40,'浅金色：储层真值（仅教学）',{'text-anchor':'end','font-size':9.5});}
function drawGR(){const s=$('gr-chart');s.replaceChildren();const l=52,r=790,top=25,bottom=171;
  const gx=x=>l+x/240*(r-l),gy=g=>bottom-(g/150)*(bottom-top);
  node(s,'rect',{x:l,y:top,width:r-l,height:bottom-top,fill:'#fdfcf9',rx:4});for(let v=0;v<=150;v+=50){let y=gy(v);line(s,l,y,r,y,colors.grid,'3 5');label(s,l-8,y+4,v,{'text-anchor':'end'});}for(let x=0;x<=240;x+=40){let px=gx(x);line(s,px,top,px,bottom,'#f1eee8','3 5');label(s,px,192,x,{'text-anchor':'middle'});}label(s,l,13,'自然伽马 GR / API',{'font-size':10,fill:'#4d565b'});label(s,r,206,'传感器横向位移 / m',{'font-size':10,'text-anchor':'end'});
  const obs=state.obs.filter(v=>v.x>=0&&v.x<=240).map(o=>[gx(o.x),gy(o.gr)]);path(s,obs,colors.clay,2.4);
  const sx=state.x-LR;if(sx>=0){line(s,gx(sx),top,gx(sx),bottom,colors.clay,'4 4');label(s,Math.min(gx(sx)+4,690),top+15,'最近 LWD 点',{'font-size':9.5,fill:'#98632f'});}line(s,gx(state.x),top,gx(state.x),bottom,colors.jade,'3 5');label(s,Math.min(gx(state.x)+4,720),bottom-6,'钻头位置',{'font-size':9.5,fill:colors.jade});
}
function drawConfidence(){
 const s=$('confidence-chart');s.replaceChildren();const l=55,r=784,t=23,b=148;
 const px=v=>l+v/30*(r-l),py=v=>b-(v+10)/26*(b-t);
 node(s,'rect',{x:l,y:t,width:r-l,height:b-t,fill:'#fdfcf9',rx:4});
 for(let q=-10;q<=16;q+=5){let y=py(q);line(s,l,y,r,y,'#ede9e1','3 5');label(s,l-8,y+4,q,{'text-anchor':'end','font-size':10});}
 for(let d=0;d<=30;d+=10){let x=px(d);line(s,x,t,x,b,'#ede9e1','3 5');label(s,x,165,d,{'text-anchor':'middle','font-size':10});}
 const center=[],upper=[],lower=[],hold=[];
 for(let d=0;d<=30;d++){let xp=state.x+d,c=predictCenter(xp)-state.y,u=reliability(xp);center.push([px(d),py(c)]);upper.push([px(d),py(c-u)]);lower.push([px(d),py(c+u)]);hold.push([px(d),py(d*Math.tan(rad(90-state.inc)))]);}
 polygon(s,upper.concat(lower.slice().reverse()),'#a8c4e5',.34);path(s,center,colors.blue,2.3);path(s,hold,'#939b9a',1.7,'5 4');
 label(s,l,t-9,'相对 TVD / m（向下为正）',{'font-size':10,fill:'#4d565b'});label(s,r,181,'前方距离 / m',{'font-size':10,'text-anchor':'end'});
 label(s,610,39,'蓝：预测中线　灰：维持井斜',{'font-size':9.5});
}
function log(message,warn=false){const entry={step:state.step,x:state.x,message,warn};state.logs.unshift(entry);state.logs=state.logs.slice(0,6);const list=$('log-list');list.replaceChildren();state.logs.forEach(e=>{const li=document.createElement('li');if(e.warn)li.className='warn';li.textContent='MD '+f(e.x,0)+' m · '+e.message;list.appendChild(li);});}
function updateTexts(){const opt=optimize(),e=state.y-trueCenter(state.x),ex=state.x+20,delta=deg(Math.atan2(predictCenter(ex)-predictCenter(state.x),20));const hold=futurePath(state.inc).at(-1),holdError=hold[1]-predictCenter(hold[0]);const nearing=Math.abs(e)>halfThick-1.5||Math.abs(holdError)>halfThick-1.0;
 $('inc-now').textContent=f(state.inc)+'°';$('tvd-now').textContent=f(state.y,1)+' m';$('x-now').textContent=f(state.x,0)+' m';$('sensor-now').textContent=f(state.x-LR,0)+' m';$('ai-inc').textContent=f(opt.inc)+'°';$('dip-forecast').textContent=(delta>=0?'+':'')+f(delta,1)+'°';$('hold-error').textContent=(holdError>=0?'+':'')+f(holdError,1)+' m';$('posterior-bias').textContent=(state.bias>=0?'+':'')+f(state.bias,2);$('uncertainty').textContent=f(reliability(state.x+30),2);
 const out=Math.abs(e)>halfThick;
 $('status').classList.toggle('danger',out||nearing);$('ai-panel').classList.toggle('risk',out||nearing);
 $('status-title').textContent=out?'出靶警报：钻头已离开储层':nearing?'偏离预警：前方可能穿出甜点层':'Human-in-the-loop：当前由地质导向师控制';
 $('status-desc').textContent=out?'教学模拟出靶 · 人工干预':nearing?'建议复核预测并审核井斜':'当前钻头在储层内';
 $('ai-title').textContent=out?'出靶：建议立即复核井斜 '+f(opt.inc,1)+'°（待人工确认）':nearing?'前方偏离：建议审核井斜 '+f(opt.inc,1)+'°':'AI 已更新地层预测';
 $('ai-description').textContent='依据后方 LWD、地震先验与最近地层走势，建议 '+f(opt.inc)+'°；预测前方 20 m 相对倾角 '+(delta>=0?'+':'')+f(delta,1)+'°。建议仅供审批，非自动下发。';
 if(out&&!state.lastWarn){log('出靶警报：偏离储层中线 '+f(e,1)+' m；需工程师研判。',true);state.lastWarn=true;}if(!out)state.lastWarn=false;
}
function refresh(){updateTexts();drawGeology();drawGR();drawConfidence();updateRange();}
function updateRange(){const inp=$('inclination');$('slider-output').textContent=f(inp.value,1)+'°';inp.style.setProperty('--fill',(Number(inp.value)-82)/12*100+'%');}
function advance(){if(state.paused||state.ended)return;
 // The human approves a maximum 30 m advice horizon; within that interval
 // the simplified receding-horizon predictor may refine its guidance.
 if(state.mode==='ai' && state.x<state.aiUntil){state.targetInc=optimize().inc;}
 else if(state.mode==='ai' && state.x>=state.aiUntil){state.mode='hold';state.targetInc=state.inc;log('AI 已完成授权的 30 m 预测段，后续调整需再次人工确认。');}
 state.step++;state.inc+=clamp(state.targetInc-state.inc,-.42,.42);state.x+=DX;state.y+=DX*Math.tan(rad(90-state.inc));state.points.push({x:state.x,y:state.y});
 updatePosterior();if(state.x>=238){state.ended=true;state.paused=true;$('pause').textContent='井段已结束';log('教学井段结束：轨迹审核日志已保留。');}refresh();}
function useTarget(value,origin){if(state.ended)return;state.targetInc=clamp(value,82,94);state.mode=origin.startsWith('采纳 AI')?'ai':'manual';state.aiUntil=state.mode==='ai'?state.x+30:0;
 state.pending.push({targetX:state.x+20,predicted:predictCenter(state.x+20),action:origin,checked:false});
 log('Human-in-the-loop · '+origin+'；目标井斜 '+f(state.targetInc,1)+'°；当前位置 '+f(state.x,0)+' m。');$('control-info').textContent='工程师已授权：目标 '+f(state.targetInc,1)+'°；'+(state.mode==='ai'?'仅对接下来 30 m 有效，需定期重新审批。':'人工控制指令已生效。');state.justAuthorized=true;refresh();}
function init(){
 state.points=[{x:state.x,y:state.y}];for(let x=0;x<=state.x-LR;x+=2){state.obs.push({x,gr:clamp(46+3*Math.sin(x*.13),20,150)});} // Historic example signals for the pre-roll region.
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
 window.addEventListener('hashchange',()=>setTab((location.hash.match(/[?&]tab=(bg|flow|demo)/)||[])[1]||'bg',false));setTab((location.hash.match(/[?&]tab=(bg|flow|demo)/)||[])[1]||'bg',false);
 $('inclination').addEventListener('input',()=>{updateRange();drawGeology();$('control-info').textContent='人工预览角度 '+f($('inclination').value,1)+'°；未授权，不改变当前控制。';});
 $('accept').addEventListener('click',()=>{const ai=optimize().inc;$('inclination').value=ai;useTarget(ai,'采纳 AI 地质导向建议');});
 $('manual').addEventListener('click',()=>useTarget(Number($('inclination').value),'执行人工井斜指令'));
 $('hold').addEventListener('click',()=>useTarget(state.inc,'保持现有井斜继续观察'));
 $('pause').addEventListener('click',()=>{if(state.ended)return;state.paused=!state.paused;$('pause').textContent=state.paused?'继续推进':'暂停推进';});
 $('restart').addEventListener('click',()=>{const z={x:68,y:trueCenter(68),inc:88,targetInc:88,mode:'hold',paused:false,bias:0,variance:1.8,step:0,points:[{x:68,y:trueCenter(68)}],logs:[],obs:[],history:[],ended:false,lastWarn:false,justAuthorized:false,aiUntil:0,pending:[]};Object.assign(state,z);$('pause').textContent='暂停推进';$('inclination').value='88';$('log-list').innerHTML='<li>教学井段已重置，等待工程师授权。</li>';$('control-info').textContent='调整滑块只预览，不会直接改变执行工况。';refresh();});
 updatePosterior();log('系统开始模拟：测量点滞后于钻头 18 m；等待人工指令。');refresh();setInterval(advance,750);
}
function setTab(key,hash=true){key=['bg','flow','demo'].includes(key)?key:'bg';document.querySelectorAll('[data-tab]').forEach(b=>{let active=b.dataset.tab===key;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!=='panel-'+key);if(hash&&location.hash!=='#/scene/d7-geosteering?tab='+key)location.hash='#/scene/d7-geosteering?tab='+key;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
