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

// Animation variables
let animationTime = 0
let carPositions = { ns: [], ew: [] }

// Initialize canvas size
function size(){
  const simView = document.querySelector('.simulation-view');
  if(simView){
    c.width = simView.clientWidth;
    c.height = Math.max(simView.clientHeight, 500);
  } else {
    c.width = window.innerWidth;
    c.height = 500;
  }
}

window.addEventListener('resize', size)
setTimeout(size, 100)
window.addEventListener('load', () => setTimeout(size, 200))

// API helpers
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

// Control functions
async function load(){
  await post('/load_policy', { path: 'train/models/ppo_single_junction.zip' })
}

async function reset(){
  const r = await post('/reset')
  obs = r.obs
  info = r.info
  waitSeries = []
  carPositions = { ns: [], ew: [] }
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

// Enhanced drawing functions
function drawRoad(w, h){
  // Background gradient
  const gradient = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h)/2)
  gradient.addColorStop(0, '#0a0f1c')
  gradient.addColorStop(1, '#1a1f2e')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
  
  // Road surface with texture
  ctx.fillStyle = '#2a2f3e'
  ctx.fillRect(w/2 - 250, 0, 500, h)
  ctx.fillRect(0, h/2 - 250, w, 500)
  
  // Lane markings with glow effect
  ctx.fillStyle = '#4a5568'
  ctx.fillRect(w/2 - 125, 0, 250, h)
  ctx.fillRect(0, h/2 - 125, w, 250)
  
  // Center lines with animation
  ctx.strokeStyle = '#e2e8f0'
  ctx.setLineDash([30, 15])
  ctx.lineWidth = 4
  ctx.shadowBlur = 10
  ctx.shadowColor = '#e2e8f0'
  
  ctx.beginPath()
  ctx.moveTo(w/2, 0)
  ctx.lineTo(w/2, h)
  ctx.moveTo(0, h/2)
  ctx.lineTo(w, h/2)
  ctx.stroke()
  
  ctx.setLineDash([])
  ctx.shadowBlur = 0
  
  // Crosswalk with enhanced pattern
  ctx.fillStyle = '#f7fafc'
  for(let i = 0; i < 12; i++){
    ctx.fillRect(w/2 - 80 + i*12, h/2 - 4, 8, 8)
    ctx.fillRect(w/2 - 4, h/2 - 80 + i*12, 8, 8)
  }
  
  // Road edges
  ctx.strokeStyle = '#4a5568'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(w/2 - 250, 0)
  ctx.lineTo(w/2 - 250, h)
  ctx.moveTo(w/2 + 250, 0)
  ctx.lineTo(w/2 + 250, h)
  ctx.moveTo(0, h/2 - 250)
  ctx.lineTo(w, h/2 - 250)
  ctx.moveTo(0, h/2 + 250)
  ctx.lineTo(w, h/2 + 250)
  ctx.stroke()
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
  // Enhanced light housing with 3D effect
  const gradient = ctx.createLinearGradient(x - 25, y - 60, x + 25, y + 60)
  gradient.addColorStop(0, '#1a202c')
  gradient.addColorStop(0.5, '#2d3748')
  gradient.addColorStop(1, '#1a202c')
  
  ctx.fillStyle = gradient
  ctx.fillRect(x - 25, y - 60, 50, 120)
  
  // Light housing border
  ctx.strokeStyle = '#4a5568'
  ctx.lineWidth = 2
  ctx.strokeRect(x - 25, y - 60, 50, 120)
  
  const r = 15
  
  // Red light with enhanced glow
  ctx.fillStyle = st.r ? st.red : '#2d3748'
  if(st.r){
    ctx.shadowBlur = 25
    ctx.shadowColor = st.red
  }
  ctx.beginPath()
  ctx.arc(x, y - 35, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  
  // Yellow light with enhanced glow
  ctx.fillStyle = st.y ? st.yellowC : '#2d3748'
  if(st.y){
    ctx.shadowBlur = 25
    ctx.shadowColor = st.yellowC
  }
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  
  // Green light with enhanced glow
  ctx.fillStyle = st.g ? st.green : '#2d3748'
  if(st.g){
    ctx.shadowBlur = 25
    ctx.shadowColor = st.green
  }
  ctx.beginPath()
  ctx.arc(x, y + 35, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
}

function drawLights(w, h){
  const st = lightColors()
  drawLightBox(w/2 - 150, h/2 - 150, st.n)  // North
  drawLightBox(w/2 - 150, h/2 + 150, st.s)  // South
  drawLightBox(w/2 + 150, h/2 - 150, st.e)  // East
  drawLightBox(w/2 + 150, h/2 + 150, st.w)  // West
}

function drawCars(w, h){
  const spacing = 25
  const t = performance.now() / 1000
  
  // Smooth movement animation
  const nsMove = (yellow === 0 && phase === 0) ? Math.sin(t * 2) * 15 : 0
  const ewMove = (yellow === 0 && phase === 1) ? Math.sin(t * 2) * 15 : 0
  
  // Queue distribution
  const nsUp = Math.ceil(qns / 2)
  const nsDown = qns - nsUp
  const ewLeft = Math.ceil(qew / 2)
  const ewRight = qew - ewLeft
  
  // Enhanced car drawing with gradients and details
  function drawCar(x, y, width, height, color1, color2, direction = 'horizontal'){
    // Car shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(x + 2, y + 2, width, height)
    
    // Car body gradient
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height)
    gradient.addColorStop(0, color1)
    gradient.addColorStop(1, color2)
    ctx.fillStyle = gradient
    ctx.fillRect(x, y, width, height)
    
    // Car details
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    if(direction === 'horizontal'){
      ctx.fillRect(x + 2, y + 2, width - 4, 3)
      ctx.fillRect(x + 2, y + height - 5, width - 4, 3)
    } else {
      ctx.fillRect(x + 2, y + 2, 3, height - 4)
      ctx.fillRect(x + width - 5, y + 2, 3, height - 4)
    }
    
    // Headlights
    ctx.fillStyle = '#fbbf24'
    ctx.shadowBlur = 10
    ctx.shadowColor = '#fbbf24'
    if(direction === 'horizontal'){
      ctx.fillRect(x + width - 3, y + 2, 2, 2)
      ctx.fillRect(x + width - 3, y + height - 4, 2, 2)
    } else {
      ctx.fillRect(x + 2, y + height - 3, 2, 2)
      ctx.fillRect(x + width - 4, y + height - 3, 2, 2)
    }
    ctx.shadowBlur = 0
  }
  
  // Northbound cars (blue gradient)
  for(let i = 0; i < Math.min(20, nsUp); i++){
    const y = h/2 + 150 + nsMove + spacing * i
    drawCar(w/2 - 35, y, 30, 15, '#3b82f6', '#1e40af', 'vertical')
  }
  
  // Southbound cars (purple gradient)
  for(let i = 0; i < Math.min(20, nsDown); i++){
    const y = h/2 - 165 - nsMove - spacing * i
    drawCar(w/2 + 5, y, 30, 15, '#8b5cf6', '#6d28d9', 'vertical')
  }
  
  // Eastbound cars (orange gradient)
  for(let i = 0; i < Math.min(20, ewLeft); i++){
    const x = w/2 + 150 + ewMove + spacing * i
    drawCar(x, h/2 - 35, 15, 30, '#f59e0b', '#d97706', 'horizontal')
  }
  
  // Westbound cars (red gradient)
  for(let i = 0; i < Math.min(20, ewRight); i++){
    const x = w/2 - 165 - ewMove - spacing * i
    drawCar(x, h/2 + 5, 15, 30, '#ef4444', '#dc2626', 'horizontal')
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
    // Enhanced gradient fill
    const gradient = sctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.4)')
    gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.2)')
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
    
    // Enhanced line with stronger glow
    sctx.strokeStyle = '#22c55e'
    sctx.lineWidth = 3
    sctx.shadowBlur = 15
    sctx.shadowColor = 'rgba(34, 197, 94, 0.8)'
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