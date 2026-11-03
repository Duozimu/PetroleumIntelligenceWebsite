/* D8 · Wellbore collision avoidance teaching sandbox.
 * All coordinates, errors, risks and thresholds are SYNTHETIC. No trained ML is claimed.
 * Main 3D metrics use point-to-polyline shortest distances; MC samples coherent
 * relative 3D displacements across a 50 m forecast horizon (simplified correlation).
 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const NS='http://www.w3.org/2000/svg';
const C={jade:'#2f7d6b',jadeLight:'#e6f1ec',blue:'#41699b',clay:'#b26a39',bad:'#b05a51',gray:'#9da5a2',grid:'#e9e4d8',ink:'#79828a'};
const RAD=Math.PI/180,STEP=2.5,HORIZON=50,RADIUS_SUM=2.15,SF_LIMIT=1.10,PC_LIMIT=.03,K_SIGMA=2,DLS_MAX=8;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),fmt=(v,d=1)=>Number(v).toFixed(d);
const state={e:40,n:30.3,z:2500.88,heading:-9.5,target:-9.5,advance:0,step:0,mode:'hold',authorizedUntil:0,paused:false,ended:false,points:[],logs:[],pending:[],feedback:0};
let rec=null, info=null;

function neighborAt(e){return {e,n:12+2.2*Math.sin((e-65)/35),z:2501.4+.0065*(e-30)};}
function designAt(e){return {e,n:32-.055*(e-30),z:2500.8+.0065*(e-30)};}
const offset=[];for(let e=0;e<=250.001;e+=STEP)offset.push(neighborAt(e));
const magBump=e=>.42*Math.exp(-Math.pow((e-136)/35,2));
function sigmaAt(e){return {e:1.75+.004*Math.max(e,0),n:2.15+.005*Math.max(e,0)+magBump(e),z:.50+.001*Math.max(e,0)};}
function closestOnSegment(p,a,b){let ux=b.e-a.e,uy=b.n-a.n,uz=b.z-a.z;const denom=ux*ux+uy*uy+uz*uz;
 let t=clamp(((p.e-a.e)*ux+(p.n-a.n)*uy+(p.z-a.z)*uz)/(denom||1),0,1);
 const cp={e:a.e+ux*t,n:a.n+uy*t,z:a.z+uz*t};const dE=p.e-cp.e,dN=p.n-cp.n,dZ=p.z-cp.z;
 return {distance:Math.hypot(dE,dN,dZ),p,cp,de:dE,dn:dN,dz:dZ};}
function nearestOffset(p){let id=clamp(Math.floor(p.e/STEP),0,offset.length-2),best=null;
 for(let i=Math.max(0,id-7);i<=Math.min(offset.length-2,id+7);i++){
  const x=closestOnSegment(p,offset[i],offset[i+1]);if(!best||x.distance<best.distance)best=x;
 }return best;}
function projectPath(target,base=state,count=20){let e=base.e,n=base.n,z=base.z,h=base.heading,pts=[{e,n,z}];
 for(let k=0;k<count;k++){h+=clamp(target-h,-DLS_MAX*STEP/30,DLS_MAX*STEP/30);const de=STEP*Math.cos(h*RAD);e+=de;n+=STEP*Math.sin(h*RAD);z+=.0065*STEP;pts.push({e,n,z});}
 return pts;}
function samplePathFromPoints(points){return points.map(p=>({e:p.e,n:p.n,z:p.z}));}
function minSeparation(path){let best=null;for(const p of path){const hit=nearestOffset(p);if(!best||hit.distance<best.distance)best=hit;}return best;}
function directionalSigma(hit){const s=sigmaAt(hit.p.e),d=Math.max(.001,hit.distance),a=hit.de/d,b=hit.dn/d,c=hit.dz/d;
 return Math.hypot(a*s.e,b*s.n,c*s.z);}
function sfProxy(path){let best=Infinity,bestP=null,near=null;for(const p of path){const v=nearestOffset(p),sf=v.distance/(RADIUS_SUM+K_SIGMA*directionalSigma(v));if(sf<best){best=sf;bestP=p;near=v;}}return {sf:best,where:bestP,closest:near};}
function rng(seed){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)|0;return (seed>>>0)/4294967296;};}
function gaussians(seed){const r=rng(seed);let spare=null;return ()=>{if(spare!==null){const v=spare;spare=null;return v;}const u=Math.max(1e-12,r()),v=r();const mag=Math.sqrt(-2*Math.log(u)),theta=2*Math.PI*v;spare=mag*Math.sin(theta);return mag*Math.cos(theta);};}
// A single coherent relative-error vector is shared across stations per simulated future path.
// This is a deliberate simplified 3D covariance/correlation model for classroom use.
function probabilityHorizon(path,draws=1800){let collided=0;const randn=gaussians(0x2a8b7c);for(let s=0;s<draws;s++){
 const ze=randn(),zn=randn(),zz=randn();let hit=false;
 for(const p of path){const sigma=sigmaAt(p.e),q={e:p.e+ze*sigma.e,n:p.n+zn*sigma.n,z:p.z+zz*sigma.z};
  if(nearestOffset(q).distance<=RADIUS_SUM){hit=true;break;}}
 if(hit)collided++;
 }return collided/draws;}
function pointProbability(p,draws=320){let collision=0;const randn=gaussians(0x21ba98);
 for(let k=0;k<draws;k++){const s=sigmaAt(p.e),q={e:p.e+randn()*s.e,n:p.n+randn()*s.n,z:p.z+randn()*s.z};if(nearestOffset(q).distance<=RADIUS_SUM)collision++;}
 return collision/draws;}
function pathStats(path,draws=1600){const closest=minSeparation(path),sf=sfProxy(path);return {closest,sf:sf.sf,pc:probabilityHorizon(path,draws)};}
function optimize(){let all=[];
 for(let az=-20;az<=15.001;az+=1){const p=projectPath(az);const closest=minSeparation(p);const sf=sfProxy(p).sf;
  // Hard filters are only within the synthetic geometry and assumed uncertainty model.
  if(closest.distance<RADIUS_SUM+.35 || sf<SF_LIMIT)continue;
  const mean=p.reduce((sum,v)=>sum+Math.pow(v.n-designAt(v.e).n,2),0)/p.length;
  const smooth=Math.pow(az-state.heading,2);
  const cost=0.14*mean+.07*smooth+4/Math.max(.45,sf)+.6*Math.max(0,4-closest.distance);
  all.push({az,path:p,closest,sf,cost});
 }
 all.sort((a,b)=>a.cost-b.cost);
 for(const v of all.slice(0,14)){
  const pc=probabilityHorizon(v.path,650);if(pc<=PC_LIMIT)return {...v,pc};
 }
 return null;}
function getData(){const holdPath=projectPath(state.heading),manualAngle=Number($('azimuth').value),manualPath=projectPath(manualAngle);
 const ai=optimize(),hold=pathStats(holdPath,1500),manual=pathStats(manualPath,950);
 const aiStats=ai?{closest:ai.closest,sf:ai.sf,pc:probabilityHorizon(ai.path,1500)}:null;
 const now=nearestOffset({e:state.e,n:state.n,z:state.z});return {holdPath,manualPath,ai,hold,manual,aiStats,now};}

const svg=(s,tag,attr={},value)=>{const el=document.createElementNS(NS,tag);Object.entries(attr).forEach(([k,v])=>el.setAttribute(k,String(v)));if(value!==undefined)el.textContent=String(value);s.appendChild(el);return el;};
const drawLine=(s,x1,y1,x2,y2,color=C.grid,dash='',width=1)=>svg(s,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,...(dash?{'stroke-dasharray':dash}:{})});
const drawText=(s,x,y,value,attrs={})=>svg(s,'text',{x,y,'font-size':10.5,fill:C.ink,...attrs},value);
function drawPath(s,coords,color,width=2.5,dash='',opacity=1){if(coords.length<2)return;
 const d='M'+coords.map(p=>fmt(p[0],2)+' '+fmt(p[1],2)).join(' L');return svg(s,'path',{d,stroke:color,fill:'none','stroke-width':width,opacity,'stroke-linecap':'round','stroke-linejoin':'round',...(dash?{'stroke-dasharray':dash}:{})});}
function drawMap(data){const s=$('well-map');s.replaceChildren();const L=55,R=822,T=30,B=320;
 const xp=x=>L+(x/250)*(R-L),yp=y=>B-(y+5)/55*(B-T);
 svg(s,'rect',{x:L,y:T,width:R-L,height:B-T,rx:5,fill:'#fdfcf9'});
 for(let x=0;x<=250;x+=50){const px=xp(x);drawLine(s,px,T,px,B,C.grid,'3 4');drawText(s,px,B+20,x,{'text-anchor':'middle'});}
 for(let n=0;n<=50;n+=10){const py=yp(n);drawLine(s,L,py,R,py,C.grid,'3 4');drawText(s,L-9,py+4,n,{'text-anchor':'end'});}
 drawText(s,L,T-10,'北向 N / m',{fill:'#4d565b'});drawText(s,R,B+33,'东向 E / m',{'text-anchor':'end',fill:'#4d565b'});
 drawPath(s,offset.map(p=>[xp(p.e),yp(p.n)]),C.bad,3.0);
 const design=[];for(let e=0;e<=245;e+=2.5){const d=designAt(e);design.push([xp(e),yp(d.n)]);}drawPath(s,design,C.gray,2,'7 5',.9);
 for(let e=35;e<=230;e+=25){const a=neighborAt(e),sig=sigmaAt(e);svg(s,'ellipse',{cx:xp(a.e),cy:yp(a.n),rx:2*sig.e/250*(R-L),ry:2*sig.n/55*(B-T),fill:C.bad,'fill-opacity':.055,stroke:C.bad,'stroke-opacity':.26,'stroke-width':1.1,'stroke-dasharray':'3 4'});}
 for(let i=0;i<data.holdPath.length;i+=5){const p=data.holdPath[i],sig=sigmaAt(p.e);svg(s,'ellipse',{cx:xp(p.e),cy:yp(p.n),rx:2*sig.e/250*(R-L),ry:2*sig.n/55*(B-T),fill:C.jade,'fill-opacity':.06,stroke:C.jade,'stroke-opacity':.3,'stroke-width':1.1,'stroke-dasharray':'3 4'});}
 drawPath(s,samplePathFromPoints(state.points).map(p=>[xp(p.e),yp(p.n)]),C.jade,3.8);
 drawPath(s,data.holdPath.map(p=>[xp(p.e),yp(p.n)]),C.gray,1.5,'3 6',.7);
 if(data.ai)drawPath(s,data.ai.path.map(p=>[xp(p.e),yp(p.n)]),C.blue,2.8,'7 5');
 drawPath(s,data.manualPath.map(p=>[xp(p.e),yp(p.n)]),C.clay,2,'3 5',.8);
 svg(s,'circle',{cx:xp(state.e),cy:yp(state.n),r:6.2,fill:C.jade,stroke:'#fff','stroke-width':2});
 const n=nearestOffset({e:state.e,n:state.n,z:state.z});drawLine(s,xp(n.p.e),yp(n.p.n),xp(n.cp.e),yp(n.cp.n),C.clay,'4 4',1.6);
 drawText(s,clamp(xp(state.e)+6,L+55,R-70),clamp(yp(state.n)-13,T+13,B-12),'当前钻头',{fill:C.jade,'font-weight':700});
 drawText(s,Math.max(xp(145),L+80),T+15,'邻井 A（暗红） · 固定历史轨迹',{fill:'#9b4a42','font-weight':600});
 drawText(s,R-5,B-8,'俯视只显示 E/N，风险计算包含 TVD',{'text-anchor':'end','font-size':9.6,fill:C.ink});
}
function drawRisk(data){const s=$('risk-chart');s.replaceChildren();const L=52,R=820,T=28,B=176;
 const seriesRaw=p=>{const arr=[];for(let i=0;i<p.length;i+=2)arr.push([i*STEP,pointProbability(p[i],220)]);return arr;};
 const h=seriesRaw(data.holdPath),m=seriesRaw(data.manualPath),a=data.ai?seriesRaw(data.ai.path):[];
 const max=Math.max(...h.map(t=>t[1]),...m.map(t=>t[1]),...a.map(t=>t[1]),PC_LIMIT);
 const yMax=Math.max(.06,Math.ceil((max*100)/10)*.1);
 const x=v=>L+v/HORIZON*(R-L),y=v=>B-clamp(v,0,yMax)/yMax*(B-T);
 svg(s,'rect',{x:L,y:T,width:R-L,height:B-T,rx:4,fill:'#fdfcf9'});
 for(let i=0;i<=4;i++){const v=i*yMax/4;drawLine(s,L,y(v),R,y(v),C.grid,'3 4');drawText(s,L-8,y(v)+4,fmt(v*100,0)+'%',{'text-anchor':'end'});}
 for(let d=0;d<=50;d+=10){drawLine(s,x(d),T,x(d),B,'#f1ede6','3 5');drawText(s,x(d),B+19,d,{'text-anchor':'middle'});}
 drawText(s,L,T-11,'点位接触概率 / %',{fill:'#4d565b'});drawText(s,R,B+35,'未来前进距离 / m',{'text-anchor':'end',fill:'#4d565b'});
 const limitY=y(PC_LIMIT);drawLine(s,L,limitY,R,limitY,C.bad,'5 5');drawText(s,R-7,limitY-5,'教学参考线 3%',{'text-anchor':'end',fill:C.bad,'font-size':10});
 const plot=series=>series.map(p=>[x(p[0]),y(p[1])]);
 drawPath(s,plot(h),C.bad,2.3);drawPath(s,plot(m),C.clay,1.8,'3 5');if(a.length)drawPath(s,plot(a),C.blue,2.4,'7 4');
}
function drawClearance(data){const s=$('clearance-chart');s.replaceChildren();const L=52,R=816,T=25,B=172;
 const x=d=>L+d/HORIZON*(R-L),y=d=>B-clamp(d,0,28)/28*(B-T);
 svg(s,'rect',{x:L,y:T,width:R-L,height:B-T,rx:4,fill:'#fdfcf9'});
 for(let d=0;d<=25;d+=5){drawLine(s,L,y(d),R,y(d),C.grid,'3 4');drawText(s,L-7,y(d)+3,d,{'text-anchor':'end'});}
 for(let k=0;k<=50;k+=10){drawLine(s,x(k),T,x(k),B,'#f2eee8','3 4');drawText(s,x(k),B+17,k,{'text-anchor':'middle'});}
 drawText(s,L,T-9,'三维井距 / m',{fill:'#4d565b'});drawText(s,R,B+32,'未来前进距离 / m',{'text-anchor':'end',fill:'#4d565b'});
 drawLine(s,L,y(RADIUS_SUM),R,y(RADIUS_SUM),C.bad,'5 4',1.4);drawText(s,R-7,y(RADIUS_SUM)-5,'合并半径（示意）',{'text-anchor':'end',fill:C.bad});
 const lineValues=path=>path.filter((_,i)=>i%2===0).map((p,i)=>[x(i*2*STEP),y(nearestOffset(p).distance)]);
 drawPath(s,lineValues(data.holdPath),C.gray,2.1,'4 5');
 if(data.ai)drawPath(s,lineValues(data.ai.path),C.blue,2.4,'7 4');
 drawPath(s,lineValues(data.manualPath),C.clay,1.7,'3 5');
}
function formatPercent(v){return (100*v).toFixed(v<.01?2:1)+'%';}
function tone(id,condition,kind='danger'){$(id).classList.toggle(kind,condition);}
function log(kind,msg,danger=false){state.feedback++;state.logs.unshift({step:state.step,kind,msg,danger});state.logs.length=Math.min(8,state.logs.length);paintLog();}
function paintLog(){const list=$('audit-list');list.replaceChildren();for(const e of state.logs){const li=document.createElement('li');if(e.danger)li.className='danger';li.textContent=`T+${e.step} · ${e.kind}：${e.msg}`;list.appendChild(li);}$('log-count').textContent=`${state.feedback} 条记录`;}
function setRange(){const el=$('azimuth');$('azimuth-value').textContent=(+el.value>=0?'+':'')+fmt(+el.value,1)+'°';el.style.setProperty('--fill',( (+el.value- +el.min)/(+el.max- +el.min)*100)+'%');}
function refresh(){setRange();info=getData();rec=info.ai;const {hold,manual,aiStats,now}=info;
 const actual=now.distance<=RADIUS_SUM, warning=hold.pc>PC_LIMIT||hold.sf<SF_LIMIT+0.18||hold.closest.distance<4.4;
 const status=$('status');status.classList.toggle('danger',actual||warning);status.classList.toggle('warn',!actual&&!warning&&(hold.pc>.005||hold.sf<1.5));
 $('status-title').textContent=state.ended?'教学严重警报：模拟井眼接触，进程锁定':warning?'前方防碰预警：维持方位可能靠近邻井 A':'Human-in-the-loop：正在进行三维防碰扫描';
 $('status-detail').textContent=state.ended?'请停钻并按现场流程复测（教学演示）':warning?'建议复核测斜数据并审核避让方案':'人工最终授权，AI 不自动执行';
 $('distance-now').textContent=fmt(now.distance,2);$('distance-future').textContent=fmt(hold.closest.distance,2);
 $('sf-now').textContent=fmt(hold.sf,2);$('pc-now').textContent=formatPercent(hold.pc);
 tone('distance-future',hold.closest.distance<4.5);tone('sf-now',hold.sf<SF_LIMIT);tone('pc-now',hold.pc>PC_LIMIT);
 $('heading-now').textContent=(state.heading>=0?'+':'')+fmt(state.heading,1)+'°';$('advance-now').textContent=fmt(state.advance,0)+' m';
 $('evidence-distance').textContent=fmt(now.distance,2)+' m';$('evidence-sigma').textContent='σ ≈ '+fmt(directionalSigma(now),2)+' m';
 $('evidence-QC').textContent=warning?'建议复测磁测':'校验中';
 const aiPanel=$('ai-card');aiPanel.classList.toggle('risk',warning||!rec);
 $('ai-heading').textContent=rec?((rec.az>=0?'+':'')+fmt(rec.az,1)+'°'):'无可行解';$('ai-pc').textContent=rec?formatPercent(aiStats.pc):'—';$('ai-sf').textContent=rec?fmt(aiStats.sf,2):'—';
 $('ai-title').textContent=!rec?'所有候选不满足教学安全约束：需人工复核':warning?'前方邻井 A 风险上升，建议复核并调整方位角':'已找到教学约束内的平滑候选';
 $('ai-description').textContent=rec?`前方 50 m，维持方位模拟接触风险 ${formatPercent(hold.pc)}，建议方位 ${(rec.az>=0?'+':'')+fmt(rec.az,1)}°；预计降至 ${formatPercent(aiStats.pc)}（合成误差假设）。工程师有最终决定权。`:'当前模型无法生成符合距离、SF*、概率条件的方案。应核查测斜、邻井资料并遵循现场停钻复测程序。';
 $('accept-ai').disabled=!rec||state.ended;
 const preview=$('manual-preview');const manualRisk=manual.pc>PC_LIMIT||manual.sf<SF_LIMIT||manual.closest.distance<=RADIUS_SUM+.3;
 preview.classList.toggle('risk',manualRisk);preview.textContent=`人工草案：未来 50 m 最小井距 ${fmt(manual.closest.distance,2)} m，SF* ${fmt(manual.sf,2)}，模拟 Pc ${formatPercent(manual.pc)}。${manualRisk?'超出教学安全边界，勿作为实际指令。':'处于教学可行域，仍需人工审核。'}`;
 $('pause').disabled=state.ended;$('step').disabled=state.ended;$('manual').disabled=state.ended;$('hold').disabled=state.ended;
 drawMap(info);drawRisk(info);drawClearance(info);
}
function applyAI(){if(!rec||state.ended){log('AI 候选不可用','没有满足教学硬约束的方案，应复测',true);return;}
 const az=rec.az,pc=info.aiStats.pc;$('azimuth').value=az;state.target=az;state.mode='ai';state.authorizedUntil=state.advance+HORIZON;
 state.pending.push({action:'采纳 AI',startE:state.e,angle:az,predictedPc:pc});
 log('Human-in-the-loop · 采纳 AI',`授权未来 50 m 方位 ${fmt(az,1)}°；预测 Pc ${formatPercent(pc)}；模型仍须复核。`);
 $('decision-note').textContent='工程师已采纳：仅未来 50 m 教学控制段有效，下一次授权前不会自动延长。';refresh();}
function applyManual(az,mode){if(state.ended)return;const manualInfo=info.manual;
 state.target=clamp(az,-22,15);state.mode=mode;state.authorizedUntil=state.advance+HORIZON;
 state.pending.push({action:mode==='hold'?'拒绝并维持':'人工指令',startE:state.e,angle:az,predictedPc:manualInfo.pc});
 const risk=manualInfo.pc>PC_LIMIT||manualInfo.sf<SF_LIMIT;
 log(mode==='hold'?'司钻拒绝 AI / 维持方位':'司钻执行人工指令',`目标 ${fmt(az,1)}°，前方模拟 Pc ${formatPercent(manualInfo.pc)}，${risk?'触发风险教学警示':'候选待持续监测'}`,risk);
 $('decision-note').textContent=risk?'当前选择在教学模型内存在额外碰撞风险；真实井场不得以本演示替代现场防碰审批。':'已记录人工授权；继续监测下一段风险。';refresh();}
function advance(){if(state.paused||state.ended)return;
 const before={e:state.e,n:state.n,z:state.z};state.heading+=clamp(state.target-state.heading,-DLS_MAX*STEP/30,DLS_MAX*STEP/30);
 state.e+=STEP*Math.cos(state.heading*RAD);state.n+=STEP*Math.sin(state.heading*RAD);state.z+=.0065*STEP;state.step++;state.advance+=STEP;
 state.points.push({e:state.e,n:state.n,z:state.z});
 if(state.advance>=state.authorizedUntil&&state.mode!=='hold'){
   state.mode='hold';state.target=state.heading;log('授权控制段结束','下一段 AI/人工调斜均需要重新授权。');
 }
 const hit=nearestOffset({e:state.e,n:state.n,z:state.z});
 if(hit.distance<=RADIUS_SUM){state.ended=true;state.paused=true;log('严重风险教学终止',`模拟三维中心距 ${fmt(hit.distance,2)} m，达到合并井筒半径；暂停演示。`,true);
   $('decision-note').textContent='已触发教学停止：真实井场应立即执行现场防碰/井控程序，而非继续本演示。';}
 for(const item of state.pending){if(!item.checked&&state.e>=item.startE+20){item.checked=true;log('后续观测反馈',`${item.action} 的 20 m 复核点，模拟井距 ${fmt(hit.distance,2)} m；待专业人员复核作为校正标签。`);}}
 if(state.e>=235&&!state.ended){state.ended=true;state.paused=true;log('教学井段结束','轨迹与授权记录已保存于本页面本次会话。');}
 refresh();}
function init(){
 // Previously drilled reference track (synthetic example).
 for(let e=25;e<=40.01;e+=STEP){const t=(e-25)/15;state.points.push({e,n:32.8+(30.3-32.8)*t,z:2500.8+.0065*(e-25)});}
 document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
 window.addEventListener('hashchange',()=>setTab((location.hash.match(/[?&]tab=(bg|flow|demo)/)||[])[1]||'bg',false));
 setTab((location.hash.match(/[?&]tab=(bg|flow|demo)/)||[])[1]||'bg',false);
 $('azimuth').addEventListener('input',()=>{refresh();$('decision-note').textContent='人工候选已更新，但未获得工程师执行授权；点击按钮才改变模拟路径。';});
 $('accept-ai').addEventListener('click',applyAI);
 $('manual').addEventListener('click',()=>applyManual(+$('azimuth').value,'manual'));
 $('hold').addEventListener('click',()=>{ $('azimuth').value=state.heading;refresh();applyManual(state.heading,'hold');});
 $('pause').addEventListener('click',()=>{if(state.ended)return;state.paused=!state.paused;$('pause').textContent=state.paused?'继续推进':'暂停推进';});
 $('step').addEventListener('click',()=>{if(state.ended)return;const was=state.paused;state.paused=false;advance();state.paused=was;});
 $('restart').addEventListener('click',()=>{const reset={e:40,n:30.3,z:2500.88,heading:-9.5,target:-9.5,advance:0,step:0,mode:'hold',authorizedUntil:0,paused:false,ended:false,logs:[],pending:[],feedback:0,points:[]};Object.assign(state,reset);
 for(let e=25;e<=40.01;e+=STEP){let t=(e-25)/15;state.points.push({e,n:32.8+(30.3-32.8)*t,z:2500.8+.0065*(e-25)});}$('azimuth').value='-9.5';$('pause').textContent='暂停推进';$('decision-note').textContent='教学案例已重置；所有指令必须经过人工操作。';paintLog();refresh();});
 log('教学开始','相对东向初始方位 −9.5°；等待人工审批；蒙特卡洛不等于现场认证风险。');
 refresh();setInterval(advance,1100);
}
function setTab(key,withHash=true){key=['bg','flow','demo'].includes(key)?key:'bg';
 document.querySelectorAll('.tab').forEach(b=>{const on=b.dataset.tab===key;b.classList.toggle('is-active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
 document.querySelectorAll('.panel').forEach(p=>{p.hidden=p.id!=='panel-'+key;});
 const hash='#/scene/d8-anticollision?tab='+key;if(withHash&&window.location.hash!==hash)window.location.hash=hash;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
