const api = ''
const c = document.getElementById('c')
const ctx = c.getContext('2d')
let obs = null
let info = null
let metrics = null
let qns = 0, qew = 0
let phase = 0
let yellow = 0
let prevPhase = 0
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

// Event listeners
document.getElementById('load').onclick = () => load()
document.getElementById('reset').onclick = () => reset()
document.getElementById('mode').onchange = e => setMode(e.target.value)
document.getElementById('rate').onchange = e => interval = parseInt(e.target.value)

// Slider updates
document.getElementById('ns').oninput = e => {
  document.getElementById('ns-value').textContent = e.target.value
  setParams()
}
document.getElementById('ew').oninput = e => {
  document.getElementById('ew-value').textContent = e.target.value
  setParams()
}

// Rush hour toggle
document.getElementById('rush').onclick = () => {
  rush = !rush
  const btn = document.getElementById('rush')
  btn.textContent = `Rush Hour: ${rush ? 'On' : 'Off'}`
  btn.classList.toggle('active', rush)
  
  // Update sliders
  document.getElementById('ns').value = rush ? 1.3 : 0.5
  document.getElementById('ew').value = rush ? 1.3 : 0.5
  document.getElementById('ns-value').textContent = document.getElementById('ns').value
  document.getElementById('ew-value').textContent = document.getElementById('ew').value
  setParams()
}

// Drawing functions
function drawRoad(w, h){
  // Background
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, w, h)
  
  // Road surface
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(w/2 - 200, 0, 400, h)
  ctx.fillRect(0, h/2 - 200, w, 400)
  
  // Lane markings
  ctx.fillStyle = '#475569'
  ctx.fillRect(w/2 - 100, 0, 200, h)
  ctx.fillRect(0, h/2 - 100, w, 200)
  
  // Center lines
  ctx.fillStyle = '#f1f5f9'
  ctx.setLineDash([20, 10])
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(w/2, 0)
  ctx.lineTo(w/2, h)
  ctx.moveTo(0, h/2)
  ctx.lineTo(w, h/2)
  ctx.stroke()
  ctx.setLineDash([])
  
  // Crosswalk
  ctx.fillStyle = '#e2e8f0'
  for(let i = 0; i < 8; i++){
    ctx.fillRect(w/2 - 60 + i*15, h/2 - 3, 8, 6)
    ctx.fillRect(w/2 - 3, h/2 - 60 + i*15, 6, 8)
  }
}

function lightColors(){
  const red = '#ef4444', yellowC = '#f59e0b', green = '#22c55e'
  let n = {r: 1, y: 0, g: 0}, s = {r: 1, y: 0, g: 0}
  let e = {r: 1, y: 0, g: 0}, w = {r: 1, y: 0, g: 0}
  
  if(yellow > 0){
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
  // Light housing
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(x - 20, y - 50, 40, 100)
  
  const r = 12
  
  // Red light
  ctx.fillStyle = st.r ? st.red : '#374151'
  if(st.r){
    ctx.shadowBlur = 20
    ctx.shadowColor = st.red
  }
  ctx.beginPath()
  ctx.arc(x, y - 30, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  
  // Yellow light
  ctx.fillStyle = st.y ? st.yellowC : '#374151'
  if(st.y){
    ctx.shadowBlur = 20
    ctx.shadowColor = st.yellowC
  }
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  
  // Green light
  ctx.fillStyle = st.g ? st.green : '#374151'
  if(st.g){
    ctx.shadowBlur = 20
    ctx.shadowColor = st.green
  }
  ctx.beginPath()
  ctx.arc(x, y + 30, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
}

function drawLights(w, h){
  const st = lightColors()
  drawLightBox(w/2 - 120, h/2 - 120, st.n)  // North
  drawLightBox(w/2 - 120, h/2 + 120, st.s)  // South
  drawLightBox(w/2 + 120, h/2 - 120, st.e)  // East
  drawLightBox(w/2 + 120, h/2 + 120, st.w)  // West
}

function drawCars(w, h){
  const spacing = 20
  const t = performance.now() / 1000
  
  // Movement animation
  const nsMove = (yellow === 0 && phase === 0) ? (t % 1) * spacing : 0
  const ewMove = (yellow === 0 && phase === 1) ? (t % 1) * spacing : 0
  
  // Queue distribution
  const nsUp = Math.ceil(qns / 2)
  const nsDown = qns - nsUp
  const ewLeft = Math.ceil(qew / 2)
  const ewRight = qew - ewLeft
  
  // Northbound cars
  ctx.fillStyle = '#3b82f6'
  for(let i = 0; i < Math.min(25, nsUp); i++){
    const y = h/2 + 120 + nsMove + spacing * i
    ctx.fillRect(w/2 - 30, y, 25, 12)
    // Car details
    ctx.fillStyle = '#1e40af'
    ctx.fillRect(w/2 - 28, y + 2, 21, 8)
    ctx.fillStyle = '#3b82f6'
  }
  
  // Southbound cars
  ctx.fillStyle = '#8b5cf6'
  for(let i = 0; i < Math.min(25, nsDown); i++){
    const y = h/2 - 132 - nsMove - spacing * i
    ctx.fillRect(w/2 + 5, y, 25, 12)
    // Car details
    ctx.fillStyle = '#6d28d9'
    ctx.fillRect(w/2 + 7, y + 2, 21, 8)
    ctx.fillStyle = '#8b5cf6'
  }
  
  // Eastbound cars
  ctx.fillStyle = '#f59e0b'
  for(let i = 0; i < Math.min(25, ewLeft); i++){
    const x = w/2 + 120 + ewMove + spacing * i
    ctx.fillRect(x, h/2 - 30, 12, 25)
    // Car details
    ctx.fillStyle = '#d97706'
    ctx.fillRect(x + 2, h/2 - 28, 8, 21)
    ctx.fillStyle = '#f59e0b'
  }
  
  // Westbound cars
  ctx.fillStyle = '#ef4444'
  for(let i = 0; i < Math.min(25, ewRight); i++){
    const x = w/2 - 132 - ewMove - spacing * i
    ctx.fillRect(x, h/2 + 5, 12, 25)
    // Car details
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(x + 2, h/2 + 7, 8, 21)
    ctx.fillStyle = '#ef4444'
  }
}

function draw(){
  const w = c.width, h = c.height
  ctx.clearRect(0, 0, w, h)
  drawRoad(w, h)
  drawLights(w, h)
  drawCars(w, h)
}

function phaseBadge(){
  const badge = document.getElementById('phase-badge')
  const dot = document.getElementById('status-dot')
  
  if(phase === 0){
    badge.textContent = 'NS'
    badge.style.color = '#22c55e'
    dot.className = 'status-dot'
  } else if(phase === 1){
    badge.textContent = 'EW'
    badge.style.color = '#3b82f6'
    dot.className = 'status-dot'
  } else {
    badge.textContent = '?'
    badge.style.color = '#94a3b8'
    dot.className = 'status-dot'
  }
  
  // Add yellow state
  if(yellow > 0){
    dot.className = 'status-dot yellow'
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
    // Gradient fill
    const gradient = sctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)')
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.05)')
    sctx.fillStyle = gradient
    sctx.beginPath()
    sctx.moveTo(0, h)
    
    for(let i = 0; i < waitSeries.length; i++){
      const x = i * (w / Math.max(1, MAX_POINTS - 1))
      const vmax = Math.max(...waitSeries, 1)
      const y = h - (waitSeries[i] / vmax) * (h - 8) - 4
      sctx.lineTo(x, y)
    }
    sctx.lineTo(w, h)
    sctx.closePath()
    sctx.fill()
    
    // Line with glow
    sctx.strokeStyle = '#22c55e'
    sctx.lineWidth = 2
    sctx.shadowBlur = 10
    sctx.shadowColor = 'rgba(34, 197, 94, 0.5)'
    sctx.beginPath()
    
    for(let i = 0; i < waitSeries.length; i++){
      const x = i * (w / Math.max(1, MAX_POINTS - 1))
      const vmax = Math.max(...waitSeries, 1)
      const y = h - (waitSeries[i] / vmax) * (h - 8) - 4
      if(i === 0) sctx.moveTo(x, y)
      else sctx.lineTo(x, y)
    }
    sctx.stroke()
    sctx.shadowBlur = 0
  }
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
  
  // Update UI
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

// Initialize
reset().then(() => loop())