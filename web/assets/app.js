const api = ''
const c = document.getElementById('c')
const ctx = c.getContext('2d')
let obs = null
let info = null
let metrics = null
let qns = 0, qew = 0
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
  const simView = document.querySelector('.simulation-view');
  if(simView){
    c.width = simView.clientWidth;
    c.height = Math.max(simView.clientHeight, 600);
  } else {
    c.width = window.innerWidth;
    c.height = 600;
  }
}

window.addEventListener('resize', size)
setTimeout(size, 100)
window.addEventListener('load', () => setTimeout(size, 200))

async function post(path, body){
  const r = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}'
  });
  return r.json()
}

async function get(path){
  const r = await fetch(`${api}${path}`);
  return r.json()
}

async function load(){
  await post('/load_policy', { path: 'train/models/ppo_single_junction.zip' })
}

async function reset(){
  const r = await post('/reset')
  obs = r.obs
  info = r.info
  pedEnabled = false
  const pc = document.getElementById('ped-controls')
  if(pc) pc.style.display = 'none'
  waitSeries = []
}

async function setMode(m){
  await post('/mode', { mode: m })
}

async function setParams(){
  const data = {
    lambda_ns: parseFloat(document.getElementById('ns').value),
    lambda_ew: parseFloat(document.getElementById('ew').value)
  }
  await post('/set_params', data)
}

async function ped(side){}

document.getElementById('load').onclick = () => load()
document.getElementById('reset').onclick = () => reset()
document.getElementById('mode').onchange = e => setMode(e.target.value)
document.getElementById('rate').onchange = e => interval = parseInt(e.target.value)
document.getElementById('ns').oninput = setParams
document.getElementById('ew').oninput = setParams

document.getElementById('rush').onclick = () => {
  rush = !rush
  document.getElementById('rush').textContent = `Rush hour: ${rush ? 'On' : 'Off'}`
  document.getElementById('ns').value = rush ? 1.3 : 0.7
  document.getElementById('ew').value = rush ? 1.3 : 0.7
  if(pedEnabled){
    document.getElementById('pns').value = rush ? 0.5 : 0.2
    document.getElementById('pew').value = rush ? 0.5 : 0.2
  }
  setParams()
}

function drawRoad(w, h){
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, w, h)
  
  ctx.fillStyle = '#2d2d2d'
  ctx.fillRect(w/2 - 160, 0, 320, h)
  ctx.fillRect(0, h/2 - 160, w, 320)
  
  ctx.fillStyle = '#404040'
  ctx.fillRect(w/2 - 80, 0, 160, h)
  ctx.fillRect(0, h/2 - 80, w, 160)
  
  ctx.fillStyle = '#ffffff'
  ctx.setLineDash([20, 10])
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(w/2, 0)
  ctx.lineTo(w/2, h)
  ctx.moveTo(0, h/2)
  ctx.lineTo(w, h/2)
  ctx.stroke()
  ctx.setLineDash([])
  
  ctx.fillStyle = '#ffff00'
  for(let i = 0; i < 8; i++){
    ctx.fillRect(w/2 - 60 + i*15, h/2 - 3, 8, 6)
    ctx.fillRect(w/2 - 3, h/2 - 60 + i*15, 6, 8)
  }
  
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 16px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('NORTH', w/2, 30)
  ctx.fillText('SOUTH', w/2, h - 10)
  ctx.save()
  ctx.translate(30, h/2)
  ctx.rotate(-Math.PI/2)
  ctx.fillText('WEST', 0, 0)
  ctx.restore()
  ctx.save()
  ctx.translate(w - 30, h/2)
  ctx.rotate(Math.PI/2)
  ctx.fillText('EAST', 0, 0)
  ctx.restore()
}

function lightColors(){
  const red = '#d64545', yellowC = '#e6c04c', green = '#3cc662'
  let n = {r: 1, y: 0, g: 0}, s = {r: 1, y: 0, g: 0}
  let e = {r: 1, y: 0, g: 0}, w = {r: 1, y: 0, g: 0}
  
  if(phase === 2){
    n = {r: 1, y: 0, g: 0}; s = n; e = n; w = n
  } else if(yellow > 0){
    if(prevPhase === 0){
      n = {r: 0, y: 1, g: 0}; s = n
      e = {r: 1, y: 0, g: 0}; w = e
    } else if(prevPhase === 1){
      e = {r: 0, y: 1, g: 0}; w = e
      n = {r: 1, y: 0, g: 0}; s = n
    }
  } else {
    if(phase === 0){
      n = {r: 0, y: 0, g: 1}; s = n
      e = {r: 1, y: 0, g: 0}; w = e
    } else if(phase === 1){
      e = {r: 0, y: 0, g: 1}; w = e
      n = {r: 1, y: 0, g: 0}; s = n
    }
  }
  
  return {n, s, e, w, red, yellowC, green}
}

function drawLightBox(x, y, st){
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(x - 20, y - 50, 40, 100)
  
  ctx.strokeStyle = '#333333'
  ctx.lineWidth = 2
  ctx.strokeRect(x - 20, y - 50, 40, 100)
  
  const r = 14
  
  ctx.fillStyle = st.r ? '#ff0000' : '#2a2a2a'
  if(st.r){
    ctx.shadowBlur = 20
    ctx.shadowColor = '#ff0000'
    ctx.globalAlpha = 1.0
  } else {
    ctx.globalAlpha = 0.3
  }
  ctx.beginPath()
  ctx.arc(x, y - 30, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1.0
  
  ctx.fillStyle = st.y ? '#ffff00' : '#2a2a2a'
  if(st.y){
    ctx.shadowBlur = 20
    ctx.shadowColor = '#ffff00'
    ctx.globalAlpha = 1.0
  } else {
    ctx.globalAlpha = 0.3
  }
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1.0
  
  ctx.fillStyle = st.g ? '#00ff00' : '#2a2a2a'
  if(st.g){
    ctx.shadowBlur = 20
    ctx.shadowColor = '#00ff00'
    ctx.globalAlpha = 1.0
  } else {
    ctx.globalAlpha = 0.3
  }
  ctx.beginPath()
  ctx.arc(x, y + 30, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1.0
}

function drawLights(w, h){
  const st = lightColors()
  drawLightBox(w/2 - 110, h/2 - 110, st.n)
  drawLightBox(w/2 - 110, h/2 + 110, st.s)
  drawLightBox(w/2 + 110, h/2 - 110, st.e)
  drawLightBox(w/2 + 110, h/2 + 110, st.w)
}

function drawCars(w, h){
  const spacing = 20
  const t = performance.now() / 1000
  
  const nsMove = (yellow === 0 && phase === 0) ? Math.sin(t * 3) * 8 : 0
  const ewMove = (yellow === 0 && phase === 1) ? Math.sin(t * 3) * 8 : 0
  
  const nsUp = Math.ceil(qns / 2)
  const nsDown = qns - nsUp
  const ewLeft = Math.ceil(qew / 2)
  const ewRight = qew - ewLeft
  
  function drawArrowCar(x, y, width, height, color, direction){
    ctx.fillStyle = color
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    
    if(direction === 'north'){
      ctx.beginPath()
      ctx.moveTo(x, y + height)
      ctx.lineTo(x + width/2, y)
      ctx.lineTo(x + width, y + height)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(x + width/2 - 2, y + height - 4)
      ctx.lineTo(x + width/2 + 2, y + height - 4)
      ctx.lineTo(x + width/2, y + height - 8)
      ctx.closePath()
      ctx.fill()
    } else if(direction === 'south'){
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + width/2, y + height)
      ctx.lineTo(x + width, y)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(x + width/2 - 2, y + 4)
      ctx.lineTo(x + width/2 + 2, y + 4)
      ctx.lineTo(x + width/2, y + 8)
      ctx.closePath()
      ctx.fill()
    } else if(direction === 'east'){
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + height, y + height/2)
      ctx.lineTo(x, y + height)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(x + 4, y + height/2 - 2)
      ctx.lineTo(x + 4, y + height/2 + 2)
      ctx.lineTo(x + 8, y + height/2)
      ctx.closePath()
      ctx.fill()
    } else if(direction === 'west'){
      ctx.beginPath()
      ctx.moveTo(x + height, y)
      ctx.lineTo(x, y + height/2)
      ctx.lineTo(x + height, y + height)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(x + height - 4, y + height/2 - 2)
      ctx.lineTo(x + height - 4, y + height/2 + 2)
      ctx.lineTo(x + height - 8, y + height/2)
      ctx.closePath()
      ctx.fill()
    }
  }
  
  ctx.fillStyle = '#4a90e2'
  for(let i = 0; i < Math.min(15, nsUp); i++){
    const y = h/2 + 100 + nsMove + spacing * i
    drawArrowCar(w/2 + 20, y, 30, 12, '#4a90e2', 'north')
  }
  
  for(let i = 0; i < Math.min(15, nsDown); i++){
    const y = h/2 - 112 - nsMove - spacing * i
    drawArrowCar(w/2 + 20, y, 30, 12, '#7b68ee', 'south')
  }
  
  ctx.fillStyle = '#ff8c42'
  for(let i = 0; i < Math.min(15, ewLeft); i++){
    const x = w/2 + 100 + ewMove + spacing * i
    drawArrowCar(x, h/2 + 20, 12, 30, '#ff8c42', 'east')
  }
  
  for(let i = 0; i < Math.min(15, ewRight); i++){
    const x = w/2 - 112 - ewMove - spacing * i
    drawArrowCar(x, h/2 + 20, 12, 30, '#ff4757', 'west')
  }
}

function drawPeds(w, h){
  if(!pedEnabled) return
  
  ctx.fillStyle = '#a2ffd6'
  for(let i = 0; i < Math.min(20, pns); i++){
    ctx.fillRect(w/2 - 80 - 6 * i, h/2 - 140, 4, 8)
  }
  
  for(let i = 0; i < Math.min(20, pew); i++){
    ctx.fillRect(w/2 + 140, h/2 + 80 + 6 * i, 8, 4)
  }
  
  if(phase === 2 && pedWalk > 0){
    ctx.fillStyle = '#3cc662'
    ctx.fillRect(w/2 - 16, h/2 - 6, 32, 12)
  } else if(phase === 2 && pedClear > 0){
    ctx.fillStyle = '#e6c04c'
    ctx.fillRect(w/2 - 16, h/2 - 6, 32, 12)
  } else {
    ctx.fillStyle = '#d64545'
    ctx.fillRect(w/2 - 16, h/2 - 6, 32, 12)
  }
}

function draw(){
  const w = c.width, h = c.height
  ctx.clearRect(0, 0, w, h)
  drawRoad(w, h)
  drawLights(w, h)
  drawCars(w, h)
  drawPeds(w, h)
  drawMovementIndicators(w, h)
}

function drawMovementIndicators(w, h){
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  
  if(yellow > 0){
    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)'
    ctx.fillText('YELLOW - PREPARING TO SWITCH', w/2, 50)
    return
  }
  
  if(phase === 0){
    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)'
    ctx.fillText('NORTH-SOUTH MOVING', w/2, 50)
    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'
    ctx.fillText('EAST-WEST STOPPED', w/2, h - 30)
  } else if(phase === 1){
    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)'
    ctx.fillText('EAST-WEST MOVING', w/2, 50)
    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'
    ctx.fillText('NORTH-SOUTH STOPPED', w/2, h - 30)
  }
}

function phaseBadge(){
  const b = document.getElementById('phase-badge')
  if(phase === 0){
    b.textContent = 'NS'
    b.style.color = '#00FF99'
  } else if(phase === 1){
    b.textContent = 'EW'
    b.style.color = '#00FFFF'
  } else if(phase === 2){
    b.textContent = 'PED'
    b.style.color = '#FFD700'
  } else {
    b.textContent = '?'
    b.style.color = '#8b95a8'
  }
}

function drawSpark(val){
  const sc = document.getElementById('spark')
  if(!sc) return
  
  const sctx = sc.getContext('2d')
  waitSeries.push(val)
  if(waitSeries.length > MAX_POINTS) waitSeries.shift()
  
  const w = sc.width, h = sc.height
  sctx.clearRect(0, 0, w, h)
  
  if(waitSeries.length > 1){
    const gradient = sctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, 'rgba(0,255,255,0.3)')
    gradient.addColorStop(1, 'rgba(0,255,255,0.05)')
    sctx.fillStyle = gradient
    sctx.beginPath()
    sctx.moveTo(0, h)
    
    for(let i = 0; i < waitSeries.length; i++){
      const x = i * (w / Math.max(1, MAX_POINTS - 1))
      const vmax = Math.max(...waitSeries, 1)
      const y = h - (waitSeries[i] / vmax) * (h - 4) - 2
      sctx.lineTo(x, y)
    }
    sctx.lineTo(w, h)
    sctx.closePath()
    sctx.fill()
  }
  sctx.strokeStyle = '#00FFFF'
  sctx.lineWidth = 2
  sctx.shadowBlur = 10
  sctx.shadowColor = 'rgba(0,255,255,0.5)'
  sctx.beginPath()
  
  for(let i = 0; i < waitSeries.length; i++){
    const x = i * (w / Math.max(1, MAX_POINTS - 1))
    const vmax = Math.max(...waitSeries, 1)
    const y = h - (waitSeries[i] / vmax) * (h - 4) - 2
    if(i === 0) sctx.moveTo(x, y)
    else sctx.lineTo(x, y)
  }
  sctx.stroke()
  sctx.shadowBlur = 0
}

async function stepOnce(){
  const m = document.getElementById('mode').value
  const r = await post('/step', { mode: m })
  
  if(r.obs){
    obs = r.obs
    info = r.info
    qns = info.q_ns || 0
    qew = info.q_ew || 0
    prevPhase = typeof phase === 'number' ? phase : 0
    phase = info.phase || 0
    yellow = info.yellow || 0
  }
  
  if(r.episode_reset){
    waitSeries = []
  }
  
  const met = await get('/metrics')
  metrics = met
  
  document.getElementById('ep').textContent = met.episode || 1
  document.getElementById('t').textContent = met.t
  const avg = Number(met.avg_wait_proxy || 0)
  document.getElementById('avg').textContent = avg.toFixed(2)
  document.getElementById('sv').textContent = met.served_v
  document.getElementById('sw').textContent = met.switches
  document.getElementById('ra').textContent = Number(met.reward_avg || 0).toFixed(3)
  
  phaseBadge()
  drawSpark(avg)
  draw()
}

async function loop(){
  await stepOnce()
  setTimeout(loop, interval)
}

reset().then(() => loop())