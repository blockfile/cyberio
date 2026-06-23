const { createWorker } = require('tesseract.js');
const { execSync } = require('child_process');
const B = "src/components/assets/images/webp.5k.nfts";
const list = ["1-50/nft_6","1-50/nft_42","1-50/nft_7","551-1000/nft_777","4001-5000/nft_5000",
              "1-50/nft_1","1-50/nft_2","1-50/nft_3","1-50/nft_10","101-150/nft_120","251-300/nft_280","2001-3000/nft_2500"];
function prep(src,out){
  // mask the top-right corner (ring arc) to white, keep just the digit
  execSync(`magick "${src}" -gravity NorthEast -crop 120x160+125+105 +repage -colorspace Gray -normalize -threshold 62% -negate -fill white -draw "polygon 78,0 120,0 120,55" -trim +repage -bordercolor white -border 28 -resize x110 "${out}"`);
}
(async()=>{
  const w = await createWorker('eng');
  await w.setParameters({ tessedit_char_whitelist:'0123456789', tessedit_pageseg_mode:'10' });
  for (const rel of list){
    const out='scripts/_o.png';
    try{ prep(`${B}/${rel}.webp`,out);}catch(e){console.log(rel,'prep-fail');continue;}
    const { data:{text,confidence} } = await w.recognize(out);
    console.log(`${rel.padEnd(20)} digit=${(text||'').replace(/\D/g,'')||'?'}  conf=${Math.round(confidence)}`);
  }
  await w.terminate();
})().catch(e=>{console.error(e.message);process.exit(1)});
