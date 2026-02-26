// META — Market States (p5.js)
// Minimal white stock vibe • 4 modes • scrub + autoplay • subtle sound
// DATA: embedded in data/meta_stock_data.js as window.META_DATA

let data = [];
let closes = [], volumes = [], returns = [], sma20 = [], vol20 = [];
let shocks = [];

let mode = 3;
let hoverIndex = -1;

let play = false;
let playSpeed = 1.3;

let scrub = { active:false, idx:0, target:0 };

let audio = {
  enabled:false, muted:false,
  ctx:null, master:null,
  lastIdx:-1, lastMs:0
};

function setup(){
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  textFont("ui-sans-serif,system-ui");

  if (!window.META_DATA || !Array.isArray(window.META_DATA) || window.META_DATA.length === 0){
    return;
  }

  ingest(window.META_DATA);
  scrub.idx = data.length - 1;
  scrub.target = scrub.idx;

  setupUI();
}

function setupUI(){
  document.querySelectorAll(".chip[data-mode]").forEach(btn=>{
    btn.addEventListener("click", ()=> setMode(+btn.dataset.mode));
  });

  const playBtn = document.getElementById("playBtn");
  const soundBtn = document.getElementById("soundBtn");

  playBtn?.addEventListener("click", ()=>{
    play = !play;
    updateUI();
    if (audio.enabled && !audio.muted) swoosh(play ? 680 : 440);
  });

  soundBtn?.addEventListener("click", ()=>{
    audio.muted = !audio.muted;
    updateUI();
    if (audio.enabled && !audio.muted) tick(720, 0.05, 0.08);
  });

  updateUI();
}

function updateUI(){
  document.querySelectorAll(".chip[data-mode]").forEach(btn=>{
    btn.classList.toggle("active", +btn.dataset.mode === mode);
  });

  const playBtn = document.getElementById("playBtn");
  const soundBtn = document.getElementById("soundBtn");

  playBtn?.classList.toggle("active", play);
  if (playBtn) playBtn.textContent = play ? "⏸" : "▶";

  soundBtn?.classList.toggle("active", !audio.muted);
  if (soundBtn) soundBtn.textContent = audio.muted ? "✕" : "♪";
}

function ingest(arr){
  data = arr.map(d=>({
      dateStr: String(d.Date ?? d.date ?? ""),
      date: new Date(String(d.Date ?? d.date ?? "") + "T00:00:00"),
      open: +d.Open ?? +d.open,
      high: +d.High ?? +d.high,
      low: +d.Low ?? +d.low,
      close: +d.Close ?? +d.close,
      volume: +d.Volume ?? +d.volume
    }))
    .filter(d => d.date.toString() !== "Invalid Date" &&
      Number.isFinite(d.open) && Number.isFinite(d.high) &&
      Number.isFinite(d.low) && Number.isFinite(d.close) &&
      Number.isFinite(d.volume))
    .sort((a,b)=>a.date-b.date);

  closes = data.map(d=>d.close);
  volumes = data.map(d=>d.volume);
  returns = closes.map((c,i)=>{
    if(i===0) return 0;
    const p = closes[i-1];
    return p ? (c-p)/p : 0;
  });

  sma20 = rollingMean(closes, 20);
  vol20 = rollingStd(returns, 20);
  computeShocks();
}

function draw(){
  background(255);

  if (!window.META_DATA || !Array.isArray(window.META_DATA) || window.META_DATA.length === 0){
    drawError("Missing dataset.\nMake sure data/meta_stock_data.js exists and is included before sketch.js.");
    return;
  }
  if (!data.length){
    drawError("Dataset present but parsing failed.\nExpected keys: Date, Open, High, Low, Close, Volume.");
    return;
  }

  const pad=64, top=80;
  const left=pad, right=width-pad;
  const bottom=height-pad;
  const w=right-left, h=bottom-top;

  drawGrid(left, top, w, h);

  if(play && !scrub.active){
    const delta = playSpeed * (deltaTime/1000);
    scrub.target += delta;
    if(scrub.target >= data.length-1) scrub.target = 0;
  }

  scrub.idx = lerp(scrub.idx, scrub.target, 0.12);
  const center = constrain(Math.round(scrub.idx), 0, data.length-1);

  let startIdx=0, endIdx=data.length-1;
  if(mode===2 || mode===4){
    const windowSize = 220;
    startIdx = max(0, center - Math.floor(windowSize/2));
    endIdx = min(data.length-1, startIdx + windowSize);
  }

  hoverIndex = getHoverIndex(left, top, w, h, startIdx, endIdx);

  if(mode===1) drawPriceLine(left, top, w, h, 0, data.length-1);
  if(mode===2) drawCandles(left, top, w, h, startIdx, endIdx);
  if(mode===3) drawVolRibbon(left, top, w, h, 0, data.length-1);
  if(mode===4) drawVolume(left, top, w, h, startIdx, endIdx);

  drawShockMarkers(left, top, w, startIdx, endIdx);
  drawScrubBar(left, bottom-16, w, center);

  if(hoverIndex>=0){
    drawHover(left, top, w, h, startIdx, endIdx, hoverIndex);
    soundOnHover(hoverIndex);
  }
}

function drawError(msg){
  push();
  fill(17); textSize(12); textAlign(LEFT, TOP);
  text("⚠ Not working", 16, 120);
  fill(0,0,0,140);
  text(msg, 16, 140, width-32, height-160);
  pop();
}

function setMode(m){
  mode=m;
  updateUI();
  if(audio.enabled && !audio.muted) swoosh(520 + m*60);
}

function drawGrid(x,y,w,h){
  push();
  stroke(0,0,0,16); strokeWeight(1);
  for(let i=0;i<=8;i++){ const xx=x+(w*i)/8; line(xx,y,xx,y+h); }
  for(let j=0;j<=6;j++){ const yy=y+(h*j)/6; line(x,yy,x+w,yy); }
  pop();
}

function drawScrubBar(x,y,w,idx){
  push();
  stroke(0,0,0,18); strokeWeight(1);
  line(x,y,x+w,y);
  const px = map(idx,0,data.length-1,x,x+w);
  stroke(17);
  line(px-8,y,px+8,y);
  pop();
}

function drawPriceLine(x,y,w,h,s,e){
  const slice=closes.slice(s,e+1);
  const mn=min(slice), mx=max(slice);
  push();
  noFill(); stroke(17); strokeWeight(1.6);
  beginShape();
  for(let i=s;i<=e;i++){
    const px=map(i,s,e,x,x+w);
    const py=map(closes[i],mn,mx,y+h,y);
    vertex(px,py);
  }
  endShape();
  const t=millis()*0.004;
  const r=5.5 + sin(t)*0.7;
  const lastX=map(e,s,e,x,x+w);
  const lastY=map(closes[e],mn,mx,y+h,y);
  noStroke(); fill(17);
  circle(lastX,lastY,r);
  pop();
}

function drawCandles(x,y,w,h,s,e){
  const lows=data.slice(s,e+1).map(d=>d.low);
  const highs=data.slice(s,e+1).map(d=>d.high);
  const mn=min(lows), mx=max(highs);

  const count=e-s+1;
  const cw=max(2,(w/count)*0.65);

  push();
  strokeWeight(1);
  rectMode(CENTER);

  for(let i=s;i<=e;i++){
    const d=data[i];
    const px=map(i,s,e,x,x+w);
    const yH=map(d.high,mn,mx,y+h,y);
    const yL=map(d.low,mn,mx,y+h,y);
    const yO=map(d.open,mn,mx,y+h,y);
    const yC=map(d.close,mn,mx,y+h,y);
    const up=d.close>=d.open;

    stroke(17);
    line(px,yH,px,yL);

    const topY=up?yC:yO;
    const botY=up?yO:yC;
    const bh=max(2,abs(botY-topY));

    if(up){ noStroke(); fill(17); rect(px,(topY+botY)/2,cw,bh,1); }
    else { noFill(); stroke(17); rect(px,(topY+botY)/2,cw,bh,1); }
  }
  pop();
}

function drawVolRibbon(x,y,w,h,s,e){
  const smaSlice=sma20.slice(s,e+1).filter(Number.isFinite);
  const mn=min(smaSlice), mx=max(smaSlice);
  const volSlice=vol20.slice(s,e+1).filter(Number.isFinite);
  const maxVol=max(volSlice) || 0.02;

  push();
  noStroke(); fill(0,0,0,18);
  beginShape();
  for(let i=s;i<=e;i++){
    const c=sma20[i], v=vol20[i];
    if(!Number.isFinite(c)||!Number.isFinite(v)) continue;
    const px=map(i,s,e,x,x+w);
    const py=map(c,mn,mx,y+h,y);
    const band=map(v,0,maxVol,2,26);
    vertex(px,py-band);
  }
  for(let i=e;i>=s;i--){
    const c=sma20[i], v=vol20[i];
    if(!Number.isFinite(c)||!Number.isFinite(v)) continue;
    const px=map(i,s,e,x,x+w);
    const py=map(c,mn,mx,y+h,y);
    const band=map(v,0,maxVol,2,26);
    vertex(px,py+band);
  }
  endShape(CLOSE);
  pop();

  push();
  noFill(); stroke(17); strokeWeight(1.4);
  beginShape();
  for(let i=s;i<=e;i++){
    const c=sma20[i];
    if(!Number.isFinite(c)) continue;
    const px=map(i,s,e,x,x+w);
    const py=map(c,mn,mx,y+h,y);
    vertex(px,py);
  }
  endShape();
  pop();
}

function drawVolume(x,y,w,h,s,e){
  const slice=volumes.slice(s,e+1);
  const mx=max(slice) || 1;
  const baseY=y+h;
  const volH=h*0.32;

  push();
  stroke(17); strokeWeight(1);
  const count=e-s+1;
  const step=max(1, floor(count/(w/2)));
  for(let i=s;i<=e;i+=step){
    const px=map(i,s,e,x,x+w);
    const bar=map(volumes[i],0,mx,2,volH);
    line(px,baseY,px,baseY-bar);
  }
  pop();
}

function getHoverIndex(x,y,w,h,s,e){
  if(mouseX<x||mouseX>x+w||mouseY<y||mouseY>y+h) return -1;
  return constrain(round(map(mouseX,x,x+w,s,e)), s, e);
}

function drawHover(x,y,w,h,s,e,idx){
  const d=data[idx];
  const px=map(idx,s,e,x,x+w);

  push();
  stroke(0,0,0,40); strokeWeight(1);
  line(px,y,px,y+h);
  pop();

  let py=y+h/2;
  if(mode===1) py=map(d.close,min(closes),max(closes),y+h,y);
  if(mode===2){
    const lows=data.slice(s,e+1).map(o=>o.low);
    const highs=data.slice(s,e+1).map(o=>o.high);
    py=map(d.close,min(lows),max(highs),y+h,y);
  }
  if(mode===3){
    const vals=sma20.filter(Number.isFinite);
    py=map(sma20[idx],min(vals),max(vals),y+h,y);
  }
  if(mode===4){
    const mx=max(volumes.slice(s,e+1))||1;
    const baseY=y+h, volH=h*0.32;
    py=baseY - map(d.volume,0,mx,2,volH);
  }

  push(); noStroke(); fill(17); circle(px,py,6); pop();

  const pct=returns[idx]*100;
  const pctStr=(pct>=0?"+":"")+pct.toFixed(2)+"%";

  let l1=d.dateStr, l2="", l3="";
  if(mode===1){ l2=`Close  ${money(d.close)}   (${pctStr})`; l3=`Vol  ${compact(d.volume)}`; }
  if(mode===2){ l2=`O ${money(d.open)}  H ${money(d.high)}  L ${money(d.low)}  C ${money(d.close)}`; l3=`(${pctStr})  Vol ${compact(d.volume)}`; }
  if(mode===3){ const v=vol20[idx]; l2=`Volatility (20d)  ${Number.isFinite(v)?(v*100).toFixed(2)+"%":"—"}`; l3=`Avg (20d)  ${Number.isFinite(sma20[idx])?money(sma20[idx]):"—"}`; }
  if(mode===4){ l2=`Volume  ${compact(d.volume)}`; l3=`Close  ${money(d.close)}  (${pctStr})`; }

  tooltip(px,py,[l1,l2,l3]);

  if(shocks.includes(idx)){
    push(); noStroke(); fill(0,0,0,70);
    circle(px+10,py-10,3);
    pop();
  }
}

function tooltip(px,py,lines){
  const padding=10, gap=14;
  push();
  textSize(11); textAlign(LEFT,TOP);
  let tw=0; for(const s of lines) tw=max(tw,textWidth(s));
  const boxW=tw+padding*2;
  const boxH=padding*2+gap*(lines.length-1)+11;

  let bx=px+14, by=py-boxH-12;
  if(bx+boxW>width-16) bx=px-boxW-14;
  if(by<16) by=py+12;

  noStroke(); fill(255); rect(bx,by,boxW,boxH,10);
  noFill(); stroke(0,0,0,28); rect(bx,by,boxW,boxH,10);

  noStroke(); fill(17);
  let ty=by+padding;
  for(const s of lines){ text(s,bx+padding,ty); ty+=gap; }
  pop();
}

function computeShocks(){
  const arr=[];
  for(let i=1;i<returns.length;i++) arr.push({i, mag: abs(returns[i])});
  arr.sort((a,b)=>b.mag-a.mag);
  shocks = arr.slice(0,18).map(o=>o.i).sort((a,b)=>a-b);
}

function drawShockMarkers(x,y,w,s,e){
  const t=millis()*0.006;
  push(); noStroke(); fill(0,0,0,60);
  for(const i of shocks){
    if(i<s || i>e) continue;
    const px=map(i,s,e,x,x+w);
    const pulse=2.2 + sin(t + i*0.2)*0.6;
    circle(px,y+8,pulse);
  }
  pop();
}

// Input
function mousePressed(){
  if(!audio.enabled) initAudio();
  scrub.active=true;
  scrubFromMouse();
}
function mouseDragged(){ if(scrub.active) scrubFromMouse(); }
function mouseReleased(){ scrub.active=false; }
function scrubFromMouse(){
  const pad=64, left=pad, right=width-pad;
  const x=constrain(mouseX,left,right);
  scrub.target = map(x,left,right,0,data.length-1);
}
function keyPressed(){
  if(key==="1") setMode(1);
  if(key==="2") setMode(2);
  if(key==="3") setMode(3);
  if(key==="4") setMode(4);
  if(key===" "){
    play = !play;
    updateUI();
    if(audio.enabled && !audio.muted) swoosh(play ? 680 : 440);
  }
}
function windowResized(){ resizeCanvas(windowWidth, windowHeight); }

// Audio
function initAudio(){
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audio.ctx = new AudioCtx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.05;
    audio.master.connect(audio.ctx.destination);
    audio.enabled = true;
  }catch(e){ audio.enabled=false; }
}
function soundOnHover(idx){
  if(!audio.enabled || audio.muted) return;
  if(idx === audio.lastIdx) return;

  const now = millis();
  if(now - audio.lastMs < 45) return;

  audio.lastIdx = idx;
  audio.lastMs = now;

  const r = returns[idx];
  const freq = constrain(520 + r*2200, 260, 980);

  if(abs(r) > 0.06) tap();
  else tick(freq, 0.05, 0.07);
}
function tick(freq, gainAmt=0.06, dur=0.08){
  const t = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);

  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(gainAmt, t+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);

  osc.connect(g); g.connect(audio.master);
  osc.start(t); osc.stop(t+dur+0.01);
}
function tap(){
  const t = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(170, t);

  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.08, t+0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.06);

  osc.connect(g); g.connect(audio.master);
  osc.start(t); osc.stop(t+0.07);
}
function swoosh(freq){
  if(!audio.enabled || audio.muted) return;
  const t = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq*0.8, t+0.12);

  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.05, t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.14);

  osc.connect(g); g.connect(audio.master);
  osc.start(t); osc.stop(t+0.16);
}

// Stats helpers
function rollingMean(arr, win){
  const out = new Array(arr.length).fill(NaN);
  let sum = 0;
  for(let i=0;i<arr.length;i++){
    sum += arr[i];
    if(i >= win) sum -= arr[i-win];
    if(i >= win-1) out[i] = sum / win;
  }
  return out;
}
function rollingStd(arr, win){
  const out = new Array(arr.length).fill(NaN);
  for(let i=0;i<arr.length;i++){
    if(i < win-1) continue;
    let mean = 0;
    for(let j=i-win+1;j<=i;j++) mean += arr[j];
    mean /= win;

    let v = 0;
    for(let j=i-win+1;j<=i;j++){
      const diff = arr[j] - mean;
      v += diff*diff;
    }
    v /= win;
    out[i] = sqrt(v);
  }
  return out;
}
function money(v){ return Number.isFinite(v) ? "$" + v.toFixed(2) : "—"; }
function compact(n){
  if(!Number.isFinite(n)) return "—";
  const a = abs(n);
  if(a >= 1e9) return (n/1e9).toFixed(2) + "B";
  if(a >= 1e6) return (n/1e6).toFixed(2) + "M";
  if(a >= 1e3) return (n/1e3).toFixed(2) + "K";
  return String(Math.round(n));
}
