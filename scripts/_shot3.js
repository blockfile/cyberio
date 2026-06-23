const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ headless:'new', executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', args:['--no-sandbox','--force-device-scale-factor=1'] });
  const p = await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({ width: 5500, height: 3200, deviceScaleFactor: 1 });
  await p.goto('http://localhost:3000/world', { waitUntil:'networkidle2', timeout: 60000 });
  await new Promise(r=>setTimeout(r, 3200));
  await p.screenshot({ path: 'scripts/_full.png', clip:{x:0,y:0,width:5500,height:3160} });
  console.log('errors:', errs.length?errs.join(' | '):'none');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
