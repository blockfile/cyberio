// Usage: node scripts/_shot.js [out.png]
// Renders the full world scene at 1:1 by sizing the viewport to the scene, capturing all of it.
const puppeteer = require('puppeteer-core');
(async () => {
  const out = process.argv[2] || 'scripts/_v.png';
  const b = await puppeteer.launch({ headless:'new', executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', args:['--no-sandbox','--force-device-scale-factor=1'] });
  const p = await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  // big viewport so the entire scene is on-screen
  await p.setViewport({ width: 5600, height: 3260, deviceScaleFactor: 1 });
  await p.goto('http://localhost:3000/world', { waitUntil:'networkidle2', timeout: 60000 });
  await p.evaluate(() => {
    const s = document.querySelector('.world-scene');
    if (s) { s.style.transform = 'none'; s.style.left='0'; s.style.top='0'; s.style.position='absolute'; }
    const vp = document.querySelector('.world-viewport');
    if (vp) { vp.style.position='absolute'; vp.style.inset='auto'; vp.style.width='5600px'; vp.style.height='3260px'; }
  });
  // wait until every <img> in the scene has finished decoding
  await p.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.world-scene img')];
    await Promise.all(imgs.map(im => im.complete && im.naturalWidth ? Promise.resolve()
      : new Promise(res => { im.onload = im.onerror = res; })));
  });
  await new Promise(r=>setTimeout(r, 1500));
  await p.screenshot({ path: out, clip: { x:0, y:0, width:5500, height:3160 } });
  console.log('errors:', errs.length?errs.join(' | '):'none');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
