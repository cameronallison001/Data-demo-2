// META — Market States (p5.js)
// Modes: 1 Price, 2 Candles, 3 Volatility, 4 Volume
// Drag to scrub • Space autoplay • Click once enables sound

let raw = null;
let data = [];
let closes = [], volumes = [], returns = [], sma20 = [], vol20 = [];
let shocks = [];

let mode = 3;
let hoverIndex = -1;

let ui = { play: false, playSpeed: 1.25 };
let scrub = { active: false, targetIdx: 0, idx: 0 };

let statusMsg = "Loading meta_stock_data.json…";
let fatalErr = "";

let audio = {
  ctx: null, master: null,
  enabled: false, muted: false,
  lastIdx: -1, lastTickMs: 0
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  textFont("ui-sans-serif, system-ui");

  // Try to use embedded data first (optional fallback: window.META_DATA)
  if (window.META_DATA && Array.isArray(window.META_DATA)) {
    statusMsg = "Loaded embedded dataset.";
    ingest(window.META_DATA);
    return;
  }

  // Load JSON with explicit success + error callbacks (prevents silent blank)
  loadJSON(
    "meta_stock_data.json",
    (json) => {
      statusMsg = "Dataset loaded.";
      raw = json;
      const arr = Array.isArray(raw) ? raw : Object.values(raw || {});
      ingest(arr);
    },
    (err) => {
      statusMsg = "Could not load meta_stock_data.json.";
      fatalErr =
        "JSON load failed. This usually happens if you're opening index.html by double-clicking.\n" +
        "Fix: Use VS Code Live Server OR use the 'no-server' method below (meta_stock_data.js).";
      console.error(err);
    }
  );

  // Buttons (if your HTML has them)
  safeBindButtons();
}

function safeBindButtons() {
  // If you don’t have these buttons, this won’t crash.
  const byId = (id) => document.getElementById(id);

  const b1 = byId("chip1"), b2 = byId("chip2"), b3 = byId("chip3"), b4 = byId("chip4");
  const bP = byId("chipPlay"), bS = byId("chipSound");

  if (b1) b1.onclick = () => setMode(1);
  if (b2) b2.onclick = () => setMode(2);
  if (b3) b3.onclick = () => setMode(3);
  if (b4) b4.onclick = () => setMode(4);

  if (bP) bP.onclick = () => {
    ui.play = !ui.play;
    if (audio.enabled && !audio.muted) swoosh(ui.play ? 680 : 440);
    updateButtons();
  };

  if (bS) bS.onclick = () => {
    audio.muted = !audio.muted;
    if (audio.enabled && !audio.muted) tick(720, 0.05, 0.08);
    updateButtons();
  };

  updateButtons();
}

function updateButtons() {
  const setActive = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", !!on);
  };
  setActive("chip1", mode === 1);
  setActive("chip2", mode === 2);
  setActive("chip3", mode === 3);
  setActive("chip4", mode === 4);
  setActive("chipPlay", ui.play);
  setActive("chipSound", !audio.muted);

  const play = document.getElementById("chipPlay");
  if (play) play.textContent = ui.play ? "⏸" : "▶";

  const snd = document.getElementById("chipSound");
  if (snd) snd.textContent = audio.muted ? "✕" : "♪";
}

function ingest(arr) {
  try {
    data = (arr || [])
      .map(d => ({
        dateStr: String(d.Date ?? d.date ?? ""),
        date: new Date(String(d.Date ?? d.date ?? "") + "T00:00:00"),
        open: +d.Open ?? +d.open,
        high: +d.High ?? +d.high,
        low:  +d.Low  ?? +d.low,
        close:+d.Close?? +d.close,
        volume:+d.Volume ?? +d.volume
      }))
      .filter(d =>
        d.date.toString() !== "Invalid Date" &&
        Number.isFinite(d.open) && Number.isFinite(d.high) &&
        Number.isFinite(d.low) && Number.isFinite(d.close) &&
        Number.isFinite(d.volume)
      )
      .sort((a,b) => a.date - b.date);

    if (!data.length) {
      fatalErr = "Loaded file, but parsed 0 rows. Check column names: Date, Open, High, Low, Close, Volume.";
      return;
    }

    closes = data.map(d => d.close);
    volumes = data.map(d => d.volume);
    returns = closes.map((c,i) => (i===0 ? 0 : (closes[i-1] ? (c - closes[i-1]) / closes[i-1] : 0)));

    sma20 = rollingMean(closes, 20);
    vol20 = rollingStd(returns, 20);

    computeShocks();

    scrub.idx = data.length - 1;
    scrub.targetIdx = scrub.idx;

    statusMsg = `Loaded ${data.length} rows.`;
  } catch (e) {
    fatalErr = "Ingest crashed: " + e.message;
    console.error(e);
  }
}

function draw() {
  background(255);

  // Always show status (so you never get mystery blank)
  drawStatus();

  if (fatalErr) {
    drawFatal();
    return;
  }
  if (!data.length) return;

  const pad = 64, top = 80;
  const left = pad, right = width - pad;
  const bottom = height - pad;
  const w = right - left, h = bottom - top;

  drawGrid(left, top, w, h);

  if (ui.play && !scrub.active) {
    const delta = ui.playSpeed * (deltaTime / 1000);
    scrub.targetIdx += delta;
    if (scrub.targetIdx >= data.length - 1) scrub.targetIdx = 0;
  }
  scrub.idx = lerp(scrub.idx, scrub.targetIdx, 0.12);
  const iCenter = constrain(Math.round(scrub.idx), 0, data.length - 1);

  let startIdx = 0, endIdx = data.length - 1;
  if (mode === 2 || mode === 4) {
    const windowSize = 220;
    startIdx = max(0, iCenter - Math.floor(windowSize/2));
    endIdx = min(data.length - 1, startIdx + windowSize);
  }

  hoverIndex = getHoverIndex(left, top, w, h, startIdx, endIdx);

  if (mode === 1) drawPriceLine(left, top, w, h, 0, data.length - 1);
  if (mode === 2) drawCandles(left, top, w, h, startIdx, endIdx);
  if (mode === 3) drawVolatilityRibbon(left, top, w, h, 0, data.length - 1);
  if (mode === 4) drawVolumeSkyline(left, top, w, h, startIdx, endIdx);

  drawShockMarkers(left, top, w, startIdx, endIdx);
  drawModeLabel(left, top);
  drawScrubBar(left, bottom - 16, w, iCenter);

  if (hoverIndex >= 0) {
    drawHover(left, top, w, h, startIdx, endIdx, hoverIndex);
    maybeSoundForHover(hoverIndex);
  }
}

function drawStatus() {
  push();
  noStroke();
  fill(0,0,0,140);
  textSize(11);
  textAlign(LEFT, TOP);
  text(statusMsg, 16, height - 18);
  pop();
}

function drawFatal() {
  push();
  noStroke();
  fill(17);
  textSize(12);
  textAlign(LEFT, TOP);
  text("⚠ Problem:", 16, 120);
  fill(0,0,0,140);
  text(fatalErr, 16, 140, width - 32, height - 160);
  pop();
}

// -------- interactions --------
function setMode(m){ mode=m; updateButtons(); if(audio.enabled && !audio.muted) swoosh(520+m*60); }

function mousePressed(){ if(!audio.enabled) initAudio(); scrub.active=true; scrubFromMouse(); }
function mouseDragged(){ if(scrub.active) scrubFromMouse(); }
function mouseReleased(){ scrub.active=false; }
function scrubFromMouse(){
  const pad=64, left=pad, right=width-pad;
  const x=constrain(mouseX,left,right);
  scrub.targetIdx = map(x,left,right,0,data.length-1);
}

function keyPressed(){
  if(key==="1") setMode(1);
  if(key==="2") setMode(2);
  if(key==="3") setMode(3);
  if(key==="4") setMode(4);
  if(key===" "){
    ui.play=!ui.play; updateButtons();
    if(audio.enabled && !audio.muted) swoosh(ui.play?680:440);
  }
}

function windowResized(){ resizeCanvas(windowWidth, windowHeight); }

// -------- visuals --------
function drawGrid(x,y,w,h){
  push(); stroke(0,0,0,16); strokeWeight(1);
  for(let i=0;i<=8;i++){ const xx=x+(w*i)/8; line(xx,y,xx,y+h); }
  for(let j=0;j<=6;j++){ const yy=y+(h*j)/6; line(x,yy,x+w,yy); }
  pop();
}
function drawModeLabel(x,y){
  const labels={1:"PRICE",2:"CANDLES",3:"VOLATILITY",4:"VOLUME"};
  push(); noStroke(); fill(17); textSize(11); textAlign(LEFT,TOP);
  text(labels[mode], x, y-26); pop();
}
function drawPriceLine(x,y,w,h,s,e){
  const slice=closes.slice(s,e+1); const mn=min(slice), mx=max(slice);
  push(); noFill(); stroke(17); strokeWeight(1.6);
  beginShape();
  for(let i=s;i<=e;i++){
    const px=map(i,s,e,x,x+w);
    const py=map(closes[i],mn,mx,y+h,y);
    vertex(px,py);
  } endShape();
  const t=millis()*0.004;
  const r=5.5+sin(t)*0.7;
  const lastX=map(e,s,e,x,x+w);
  const lastY=map(closes[e],mn,mx,y+h,y);
  noStroke(); fill(17); circle(lastX,lastY,r);
  pop();
}
function drawCandles(x,y,w,h,s,e){
  const lows=data.slice(s,e+1).map(d=>d.low);
  const highs=data.slice(s,e+1).map(d=>d.high);
  const mn=min(lows), mx=max(highs);
  const count=e-s+1; const cw=max(2,(w/count)*0.65);
  push(); strokeWeight(1);
  for(let i=s;i<=e;i++){
    const d=data[i];
    const px=map(i,s,e,x,x+w);
    const yH=map(d.high,mn,mx,y+h,y);
    const yL=map(d.low,mn,mx,y+h,y);
    const yO=map(d.open,mn,mx,y+h,y);
    const yC=map(d.close,mn,mx,y+h,y);
    const up=d.close>=d.open;
    stroke(17); line(px,yH,px,yL);
    const topY=up?yC:yO, botY=up?yO:yC;
    const bh=max(2,abs(botY-topY));
    rectMode(CENTER);
    if(up){ noStroke(); fill(17); rect(px,(topY+botY)/2,cw,bh,1); }
    else { noFill(); stroke(17); rect(px,(topY+botY)/2,cw,bh,1); }
  }
  pop();
}
function drawVolatilityRibbon(x,y,w,h,s,e){
  const smaSlice=sma20.slice(s,e+1).filter(Number.isFinite);
  const mn=min(smaSlice), mx=max(smaSlice);
  const volSlice=vol20.slice(s,e+1).filter(Number.isFinite);
  const maxVol=max(volSlice)||0.02;

  push(); noStroke(); fill(0,0,0,18);
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

  push(); noFill(); stroke(17); strokeWeight(1.4);
  beginShape();
  for(let i=s;i<=e;i++){
    const c=sma20[i];
    if(!Number.isFinite(c)) continue;
    const px=map(i,s,e,x,x+w);
    const py=map(c,mn,mx,y+h,y);
    vertex(px,py);
  }
  endShape(); pop();
}
function drawVolumeSkyline(x,y,w,h,s,e){
  const slice=volumes.slice(s,e+1); const mx=max(slice)||1;
  const baseY=y+h, volH=h*0.32;
  push(); stroke(17); strokeWeight(1);
  const count=e-s+1; const step=max(1,floor(count/(w/2)));
  for(let i=s;i<=e;i+=step){
    const px=map(i,s,e,x,x+w);
    const bar=map(volumes[i],0,mx,2,volH);
    line(px,baseY,px,baseY-bar);
  } pop();
}
function computeShocks(){
  const arr=[];
  for(let i=1;i<returns.length;i++) arr.push({i,mag:abs(returns[i])});
  arr.sort((a,b)=>b.mag-a.mag);
  shocks=arr.slice(0,18).map(o=>o.i).sort((a,b)=>a-b);
}
function drawShockMarkers(x,y,w,s,e){
  const t=millis()*0.006;
  push(); noStroke(); fill(0,0,0,60);
  for(const i of shocks){
    if(i<s||i>e) continue;
    const px=map(i,s,e,x,x+w);
    const pulse=2.2+(sin(t+i*0.2)*0.6);
    circle(px,y+8,pulse);
  }
  pop();
}
function drawScrubBar(x,y,w,idx){
  push(); stroke(0,0,0,18); strokeWeight(1);
  line(x,y,x+w,y);
  const px=map(idx,0,data.length-1,x,x+w);
  stroke(17); line(px-8,y,px+8,y);
  pop();
}

// hover + tooltip
function getHoverIndex(x,y,w,h,s,e){
  if(mouseX<x||mouseX>x+w||mouseY<y||mouseY>y+h) return -1;
  return constrain(round(map(mouseX,x,x+w,s,e)), s, e);
}
function drawHover(x,y,w,h,s,e,idx){
  const d=data[idx];
  const px=map(idx,s,e,x,x+w);

  push(); stroke(0,0,0,40); strokeWeight(1); line(px,y,px,y+h); pop();

  let py=y+h/2;
  if(mode===1) py=map(d.close,min(closes),max(closes),y+h,y);
  if(mode===3){
    const vals=sma20.filter(Number.isFinite);
    py=map(sma20[idx],min(vals),max(vals),y+h,y);
  }
  if(mode===4){
    const mx=max(volumes.slice(s,e+1))||1;
    const baseY=y+h, volH=h*0.32;
    py=baseY - map(d.volume,0,mx,2,volH);
  }
  if(mode===2){
    const lows=data.slice(s,e+1).map(o=>o.low);
    const highs=data.slice(s,e+1).map(o=>o.high);
    py=map(d.close,min(lows),max(highs),y+h,y);
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

  if(shocks.includes(idx)){ push(); noStroke(); fill(0,0,0,70); circle(px+10,py-10,3); pop(); }
}
function tooltip(px,py,lines){
  const padding=10,gap=14;
  push(); textSize(11); textAlign(LEFT,TOP);
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

// audio
function initAudio(){
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    audio.ctx=new AudioCtx();
    audio.master=audio.ctx.createGain();
    audio.master.gain.value=0.05;
    audio.master.connect(audio.ctx.destination);
    audio.enabled=true;
  }catch(e){ audio.enabled=false; }
}
function maybeSoundForHover(idx){
  if(!audio.enabled||audio.muted) return;
  if(idx===audio.lastIdx) return;
  const now=millis();
  if(now-audio.lastTickMs<45) return;
  audio.lastIdx=idx; audio.lastTickMs=now;

  const r=returns[idx];
  const freq=constrain(520+r*2200,260,980);
  if(abs(r)>0.06) tap(); else tick(freq,0.05,0.07);
}
function tick(freq,gainAmt=0.06,dur=0.08){
  const t=audio.ctx.currentTime;
  const osc=audio.ctx.createOscillator();
  const gain=audio.ctx.createGain();
  osc.type="sine";
  osc.frequency.setValueAtTime(freq,t);
  gain.gain.setValueAtTime(0.0,t);
  gain.gain.linearRampToValueAtTime(gainAmt,t+0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  osc.connect(gain); gain.connect(audio.master);
  osc.start(t); osc.stop(t+dur+0.01);
}
function tap(){
  const t=audio.ctx.currentTime;
  const osc=audio.ctx.createOscillator();
  const gain=audio.ctx.createGain();
  osc.type="triangle";
  osc.frequency.setValueAtTime(170,t);
  gain.gain.setValueAtTime(0.0,t);
  gain.gain.linearRampToValueAtTime(0.08,t+0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001,t+0.06);
  osc.connect(gain); gain.connect(audio.master);
  osc.start(t); osc.stop(t+0.07);
}
function swoosh(freq){
  if(!audio.enabled||audio.muted) return;
  const t=audio.ctx.currentTime;
  const osc=audio.ctx.createOscillator();
  const gain=audio.ctx.createGain();
  osc.type="sine";
  osc.frequency.setValueAtTime(freq,t);
  osc.frequency.exponentialRampToValueAtTime(freq*0.8,t+0.12);
  gain.gain.setValueAtTime(0.0,t);
  gain.gain.linearRampToValueAtTime(0.05,t+0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001,t+0.14);
  osc.connect(gain); gain.connect(audio.master);
  osc.start(t); osc.stop(t+0.16);
}

// helpers
function rollingMean(arr,win){
  const out=new Array(arr.length).fill(NaN);
  let sum=0;
  for(let i=0;i<arr.length;i++){
    sum+=arr[i];
    if(i>=win) sum-=arr[i-win];
    if(i>=win-1) out[i]=sum/win;
  }
  return out;
}
function rollingStd(arr,win){
  const out=new Array(arr.length).fill(NaN);
  for(let i=0;i<arr.length;i++){
    if(i<win-1) continue;
    let mean=0;
    for(let j=i-win+1;j<=i;j++) mean+=arr[j];
    mean/=win;
    let v=0;
    for(let j=i-win+1;j<=i;j++){ const diff=arr[j]-mean; v+=diff*diff; }
    v/=win;
    out[i]=sqrt(v);
  }
  return out;
}
function money(v){ return Number.isFinite(v) ? "$"+v.toFixed(2) : "—"; }
function compact(n){
  if(!Number.isFinite(n)) return "—";
  const a=abs(n);
  if(a>=1e9) return (n/1e9).toFixed(2)+"B";
  if(a>=1e6) return (n/1e6).toFixed(2)+"M";
  if(a>=1e3) return (n/1e3).toFixed(2)+"K";
  return String(Math.round(n));
}