// Rasterize individual cloud artwork only; folds and plane remain SVG vectors.
const sharp = require('sharp');
const path = require('node:path');
const bundle = require('../userapp/assets/opening/bundle.json');
Promise.all(['265:479', '265:482', '265:485'].map(async id => {
  const asset = bundle.assets[id];
  const xml = asset.xml.replace(/\sfilter="[^"]*"/g, '').replace(/<defs>[\s\S]*?<\/defs>/g, '');
  await sharp(Buffer.from(xml)).resize(asset.rw * 2, asset.rh * 2).png().toFile(path.join(__dirname, '../userapp/assets/opening', `cloud-${id.replace(':', '-')}.png`));
})).then(() => console.log('Generated 3 original individual cloud sprites at 2x.')).catch(error => { console.error(error); process.exitCode = 1; });
