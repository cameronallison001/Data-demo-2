// Interactive Bar Graph: Meta Stock Closing Prices by Date

let data = [];
let sampleInterval = 20; // Show every 20th data point to avoid crowding
let barWidth;
let barSpacing;
let padding = 60;
let hoveredIndex = -1;

async function setup() {
  createCanvas(windowWidth, windowHeight);
  
  // Load JSON data
  const response = await fetch('/data/meta_stock_data.json');
  const jsonData = await response.json();
  
  // Sample the data for better visualization
  for (let i = 0; i < jsonData.length; i += sampleInterval) {
    data.push({
      date: jsonData[i].Date,
      close: jsonData[i].Close,
      high: jsonData[i].High,
      low: jsonData[i].Low,
      volume: jsonData[i].Volume
    });
  }
  
  // Calculate bar dimensions
  const graphWidth = width - padding * 2;
  barWidth = graphWidth / data.length * 0.8;
  barSpacing = graphWidth / data.length;
  
  console.log(`Loaded ${data.length} data points (sampled every ${sampleInterval} days)`);
}

function draw() {
  background(245);
  
  if (data.length === 0) return;
  
  // Draw axes
  drawAxes();
  
  // Draw bars
  drawBars();
  
  // Draw tooltip if hovering
  if (hoveredIndex !== -1) {
    drawTooltip();
  }
}

function drawAxes() {
  stroke(0);
  strokeWeight(2);
  
  // Y-axis
  line(padding, padding, padding, height - padding);
  
  // X-axis
  line(padding, height - padding, width - padding, height - padding);
  
  // Y-axis labels (price)
  fill(0);
  textAlign(RIGHT, CENTER);
  textSize(11);
  
  const minPrice = Math.min(...data.map(d => d.close));
  const maxPrice = Math.max(...data.map(d => d.close));
  const priceRange = maxPrice - minPrice;
  
  for (let i = 0; i <= 5; i++) {
    const price = minPrice + (priceRange * i / 5);
    const y = map(price, minPrice, maxPrice, height - padding, padding);
    line(padding - 5, y, padding, y);
    text(price.toFixed(0), padding - 10, y);
  }
  
  // X-axis labels (dates - show every few bars)
  textAlign(CENTER, TOP);
  const labelInterval = Math.ceil(data.length / 10);
  
  for (let i = 0; i < data.length; i += labelInterval) {
    const x = padding + (i * barSpacing) + barSpacing / 2;
    line(x, height - padding, x, height - padding + 5);
    text(data[i].date, x, height - padding + 10);
  }
}

function drawBars() {
  const minPrice = Math.min(...data.map(d => d.close));
  const maxPrice = Math.max(...data.map(d => d.close));
  
  for (let i = 0; i < data.length; i++) {
    const price = data[i].close;
    
    // Calculate bar position and height
    const x = padding + (i * barSpacing) + barSpacing / 2 - barWidth / 2;
    const barHeight = map(price, minPrice, maxPrice, 0, height - padding * 2);
    const y = height - padding - barHeight;
    
    // Color changes on hover
    if (i === hoveredIndex) {
      fill(255, 100, 100);
      stroke(200, 0, 0);
      strokeWeight(2);
    } else {
      fill(100, 150, 255);
      stroke(50, 100, 200);
      strokeWeight(1);
    }
    
    rect(x, y, barWidth, barHeight);
  }
}

function drawTooltip() {
  if (hoveredIndex < 0 || hoveredIndex >= data.length) return;
  
  const item = data[hoveredIndex];
  const tooltipText = `${item.date}\nClose: $${item.close.toFixed(2)}\nHigh: $${item.high.toFixed(2)}\nLow: $${item.low.toFixed(2)}`;
  
  fill(50);
  textAlign(LEFT, TOP);
  textSize(12);
  
  // Draw tooltip box
  const boxPadding = 8;
  const lineHeight = 15;
  const textWidth = 150;
  const textHeight = 60;
  
  fill(255, 255, 200);
  stroke(0);
  strokeWeight(1);
  rect(mouseX + 10, mouseY + 10, textWidth, textHeight);
  
  fill(0);
  textAlign(LEFT, TOP);
  text(tooltipText, mouseX + 10 + boxPadding, mouseY + 10 + boxPadding);
}

function mouseMoved() {
  hoveredIndex = -1;
  
  // Check if mouse is over a bar
  if (mouseX < padding || mouseX > width - padding || 
      mouseY < padding || mouseY > height - padding) {
    return;
  }
  
  const relativeX = mouseX - padding;
  const index = Math.floor(relativeX / barSpacing);
  
  if (index >= 0 && index < data.length) {
    hoveredIndex = index;
  }
}