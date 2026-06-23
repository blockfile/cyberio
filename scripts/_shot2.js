const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ headless:'new', executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', args:['--no-sandbox','--force-device-scale-factor=1'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1700, height: 1050, deviceScaleFactor: 1 });
  await p.goto('http://localhost:3000/world', { waitUntil:'networkidle2', timeout: 60000 });
  await new Promise(r=>setTimeout(r, 2500));
  // zoom in + pan to the holo pad (left of centre)
  for(let i=0;i<4;i++){ await p.mouse.move(850,500); await p.mouse.wheel({deltaY:-200}); await new Promise(r=>setTimeout(r,110)); }
  await p.mouse.move(700,400); await p.mouse.down(); await p.mouse.move(1050,560,{steps:12}); await p.mouse.up();
  await new Promise(r=>setTimeout(r, 500));
  await p.screenshot({ path: 'scripts/_pad.png' });
  await b.close(); console.log('ok');
})().catch(e=>{console.error(e);process.exit(1)});
