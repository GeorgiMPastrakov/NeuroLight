const api = ''
const c = document.getElementById('c')
const ctx = c.getContext('2d')
let obs = null
let info = null
let metrics = null
let qns = 0, qew = 0, pns = 0, pew = 0
let phase = 0
let yellow = 0
let pedWalk = 0
let pedClear = 0
let prevPhase = 0
let pedEnabled = false
let interval = 1000
let rush = false
let waitSeries = []
const MAX_POINTS = 100
function size(){
  const simView=document.querySelector('.simulation-view');
  if(simView){
    c.width=simView.clientWidth;
    c.height=Math.max(simView.clientHeight, 600);
  } else {
    c.width=window.innerWidth;
    c.height=600;
  }
}
window.addEventListener('resize', size)
setTimeout(size, 100)
// Also resize when canvas is ready
window.addEventListener('load', () => setTimeout(size, 200))
async function post(path, body){const r=await fetch(`${api}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):'{}'});return r.json()}
async function get(path){const r=await fetch(`${api}${path}`);return r.json()}
async function load(){await post('/load_policy',{path:'train/models/ppo_single_junction.zip'})}
async function reset(){const r=await post('/reset');obs=r.obs;info=r.info;pedEnabled=Array.isArray(obs)&&obs.length===8;document.getElementById('ped-controls').style.display=pedEnabled?'flex':'none';waitSeries=[]}
async function setMode(m){await post('/mode',{mode:m})}
async function setParams(){const data={lambda_ns:parseFloat(document.getElementById('ns').value),lambda_ew:parseFloat(document.getElementById('ew').value)};if(pedEnabled){data.lambda_p_ns=parseFloat(document.getElementById('pns').value);data.lambda_p_ew=parseFloat(document.getElementById('pew').value)}await post('/set_params',data)}
async function ped(side){if(pedEnabled)await post('/ped_call',{side})}
document.getElementById('load').onclick=()=>load()
document.getElementById('reset').onclick=()=>reset()
document.getElementById('mode').onchange=e=>setMode(e.target.value)
document.getElementById('rate').onchange=e=>interval=parseInt(e.target.value)
document.getElementById('ns').oninput=setParams
document.getElementById('ew').oninput=setParams
document.getElementById('pns').oninput=setParams
document.getElementById('pew').oninput=setParams
document.getElementById('pedns').onclick=()=>ped('ns')
document.getElementById('pedew').onclick=()=>ped('ew')
document.getElementById('rush').onclick=()=>{
  rush=!rush
  document.getElementById('rush').textContent=`Rush hour: ${rush?'On':'Off'}`
  // Simple param toggle: raise arrival rates when on
  document.getElementById('ns').value=rush?1.3:0.7
  document.getElementById('ew').value=rush?1.3:0.7
  if(pedEnabled){
    document.getElementById('pns').value=rush?0.5:0.2
    document.getElementById('pew').value=rush?0.5:0.2
  }
  setParams()
}
function drawRoad(w,h){ctx.fillStyle='#1b2130';ctx.fillRect(0,0,w,h);ctx.fillStyle='#2a3347';ctx.fillRect(w/2-160,0,320,h);ctx.fillRect(0,h/2-160,w,320);ctx.fillStyle='#404b66';ctx.fillRect(w/2-80,0,160,h);ctx.fillRect(0,h/2-80,w,160);ctx.fillStyle='#d0d5e5';for(let i=0;i<10;i++){ctx.fillRect(w/2-2, i*(h/10)+10, 4,40);ctx.fillRect(i*(w/10)+10, h/2-2, 40,4)}ctx.fillStyle='#aab3c9';for(let i=-5;i<=5;i++){ctx.fillRect(w/2-120, h/2+i*18, 240,4);ctx.fillRect(w/2+i*18, h/2-120, 4,240)}ctx.fillStyle='#e0e5f5';ctx.fillRect(w/2-90,h/2-2,180,4);ctx.fillRect(w/2-2,h/2-90,4,180)}
function lightColors(){const red='#d64545',yellowC='#e6c04c',green='#3cc662';let n={r:1,y:0,g:0},s={r:1,y:0,g:0},e={r:1,y:0,g:0},w={r:1,y:0,g:0};if(phase===2){n={r:1,y:0,g:0};s=n;e=n;w=n}else if(yellow>0){if(prevPhase===0){n={r:0,y:1,g:0};s=n;e={r:1,y:0,g:0};w=e}else if(prevPhase===1){e={r:0,y:1,g:0};w=e;n={r:1,y:0,g:0};s=n}}else{if(phase===0){n={r:0,y:0,g:1};s=n;e={r:1,y:0,g:0};w=e}else if(phase===1){e={r:0,y:0,g:1};w=e;n={r:1,y:0,g:0};s=n}}return{n,s,e,w,red,yellowC,green}}
function drawLightBox(x,y,st){
  ctx.fillStyle='#0f131c';
  ctx.fillRect(x-18,y-42,36,84);
  const r=12;
  
  // Red light
  ctx.fillStyle=st.r?st.red:'#2a3040';
  if(st.r){
    ctx.shadowBlur=15;
    ctx.shadowColor=st.red;
  }
  ctx.beginPath();
  ctx.arc(x,y-24,r,0,Math.PI*2);
  ctx.fill();
  ctx.shadowBlur=0;
  
  // Yellow light
  ctx.fillStyle=st.y?st.yellowC:'#2a3040';
  if(st.y){
    ctx.shadowBlur=15;
    ctx.shadowColor=st.yellowC;
  }
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();
  ctx.shadowBlur=0;
  
  // Green light
  ctx.fillStyle=st.g?st.green:'#2a3040';
  if(st.g){
    ctx.shadowBlur=15;
    ctx.shadowColor=st.green;
  }
  ctx.beginPath();
  ctx.arc(x,y+24,r,0,Math.PI*2);
  ctx.fill();
  ctx.shadowBlur=0;
}
function drawLights(w,h){const st=lightColors();drawLightBox(w/2-110,h/2-110,st.n);drawLightBox(w/2-110,h/2+110,st.s);drawLightBox(w/2+110,h/2-110,st.e);drawLightBox(w/2+110,h/2+110,st.w)}
function drawCars(w,h){const spacing=16;const t=performance.now()/1000;const nsMove=(yellow===0&&phase===0)?(t%1)*spacing:0;const ewMove=(yellow===0&&phase===1)?(t%1)*spacing:0;const nsUp=Math.ceil(qns/2);const nsDown=qns-nsUp;const ewLeft=Math.ceil(qew/2);const ewRight=qew-ewLeft;ctx.fillStyle='#6fd0ff';for(let i=0;i<Math.min(20,nsUp);i++){const y=h/2+100+nsMove+spacing*i;ctx.fillRect(w/2-25,y,20,10)}for(let i=0;i<Math.min(20,nsDown);i++){const y=h/2-110-nsMove-spacing*i;ctx.fillRect(w/2+5,y,20,10)}ctx.fillStyle='#ffb86b';for(let i=0;i<Math.min(20,ewLeft);i++){const x=w/2+110+ewMove+spacing*i;ctx.fillRect(x,h/2-25,10,20)}for(let i=0;i<Math.min(20,ewRight);i++){const x=w/2-120-ewMove-spacing*i;ctx.fillRect(x,h/2+5,10,20)}}
function drawPeds(w,h){if(!pedEnabled)return;ctx.fillStyle='#a2ffd6';for(let i=0;i<Math.min(20,pns);i++){ctx.fillRect(w/2-80-6*i,h/2-140,4,8)}for(let i=0;i<Math.min(20,pew);i++){ctx.fillRect(w/2+140,h/2+80+6*i,8,4)}if(phase===2&&pedWalk>0){ctx.fillStyle='#3cc662';ctx.fillRect(w/2-16,h/2-6,32,12)}else if(phase===2&&pedClear>0){ctx.fillStyle='#e6c04c';ctx.fillRect(w/2-16,h/2-6,32,12)}else{ctx.fillStyle='#d64545';ctx.fillRect(w/2-16,h/2-6,32,12)}}
function draw(){const w=c.width,h=c.height;ctx.clearRect(0,0,w,h);drawRoad(w,h);drawLights(w,h);drawCars(w,h);drawPeds(w,h)}
function phaseBadge(){
  const b=document.getElementById('phase-badge');
  if(phase===0){
    b.textContent='NS';
    b.style.color='#00FF99';
  } else if(phase===1){
    b.textContent='EW';
    b.style.color='#00FFFF';
  } else if(phase===2){
    b.textContent='PED';
    b.style.color='#FFD700';
  } else {
    b.textContent='?';
    b.style.color='#8b95a8';
  }
}
function drawSpark(val){
  const sc=document.getElementById('spark');
  if(!sc)return;
  const sctx=sc.getContext('2d');
  waitSeries.push(val);
  if(waitSeries.length>MAX_POINTS)waitSeries.shift();
  const w=sc.width,h=sc.height;
  sctx.clearRect(0,0,w,h);
  
  // Draw gradient fill
  if(waitSeries.length>1){
    const gradient=sctx.createLinearGradient(0,0,0,h);
    gradient.addColorStop(0,'rgba(0,255,255,0.3)');
    gradient.addColorStop(1,'rgba(0,255,255,0.05)');
    sctx.fillStyle=gradient;
    sctx.beginPath();
    sctx.moveTo(0,h);
    for(let i=0;i<waitSeries.length;i++){
      const x=i*(w/Math.max(1,MAX_POINTS-1));
      const vmax=Math.max(...waitSeries,1);
      const y=h-(waitSeries[i]/vmax)*(h-4)-2;
      sctx.lineTo(x,y);
    }
    sctx.lineTo(w,h);
    sctx.closePath();
    sctx.fill();
  }
  
  // Draw line with glow
  sctx.strokeStyle='#00FFFF';
  sctx.lineWidth=2;
  sctx.shadowBlur=10;
  sctx.shadowColor='rgba(0,255,255,0.5)';
  sctx.beginPath();
  for(let i=0;i<waitSeries.length;i++){
    const x=i*(w/Math.max(1,MAX_POINTS-1));
    const vmax=Math.max(...waitSeries,1);
    const y=h-(waitSeries[i]/vmax)*(h-4)-2;
    if(i===0)sctx.moveTo(x,y);
    else sctx.lineTo(x,y);
  }
  sctx.stroke();
  sctx.shadowBlur=0;
}
async function stepOnce(){const m=document.getElementById('mode').value;const r=await post('/step',{mode:m});if(r.obs){obs=r.obs;info=r.info;qns=info.q_ns||0;qew=info.q_ew||0;pns=info.p_ns||0;pew=info.p_ew||0;prevPhase=typeof phase==='number'?phase:0;phase=info.phase||0;yellow=info.yellow||0;pedWalk=info.ped_walk_left||0;pedClear=info.ped_clear_left||0}
if(r.episode_reset){waitSeries=[]}
const met=await get('/metrics');metrics=met;document.getElementById('ep').textContent=met.episode||1;document.getElementById('t').textContent=met.t;const avg=Number(met.avg_wait_proxy||0);document.getElementById('avg').textContent=avg.toFixed(2);document.getElementById('sv').textContent=met.served_v;document.getElementById('sp').textContent=met.served_p;document.getElementById('sw').textContent=met.switches;document.getElementById('ra').textContent=Number(met.reward_avg||0).toFixed(3);phaseBadge();drawSpark(avg);draw()}
async function loop(){await stepOnce();setTimeout(loop,interval)}
reset().then(()=>loop())
