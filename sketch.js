/* Get column 0 in csv, Date
get column 1 in csv, open 
get column 2 in csv, high
get column 3 in csv, low
get column 4 in csv, close
get column 5 in csv, volume
show stock price as a line graph, x axis is date, y axis is price

*/

let table;
let date;
let High;
let Low;
let Open;
let Close;
let Volume;


async function setup() {
  createCanvas(windowWidth, windowHeight);
  table = await loadTable('/data/meta_stock_data.csv', ',', 'header');
    console.log(table); 

    date = table.getColumn(0);
    High = table.getColumn(1);
    Low = table.getColumn(2);
    Open = table.getColumn(3);
    Close = table.getColumn(4);
    Volume = table.getColumn(5);


}

function draw() {
  background(220);

  if (table) {
    for (let i = 0; i < table.getRowCount(); i++) {
        let textX = random(width);
        let textY = random(height);
        text(date[i], textX, textY);
    }
    noLoop();
    }
}