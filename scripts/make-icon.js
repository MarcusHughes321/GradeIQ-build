const sharp = require('sharp');
const path = require('path');

async function makeIcon(inputFile, outputFile, options = {}) {
  const size = 1024;
  const fontSize = options.fontSize || 110;
  const textY = options.textY || (size - 80);
  
  const img = sharp(inputFile).resize(size, size);
  
  const textSvg = `
  <svg width="${size}" height="${size}">
    <text x="${size/2}" y="${textY}" 
          font-family="Arial Black, Impact, Helvetica, sans-serif" 
          font-weight="900" 
          font-size="${fontSize}" 
          fill="white" 
          text-anchor="middle"
          letter-spacing="-3">Grade<tspan fill="#FF3C31">.IQ</tspan></text>
  </svg>`;

  await img
    .composite([{
      input: Buffer.from(textSvg),
      top: 0,
      left: 0,
    }])
    .png()
    .toFile(outputFile);
  
  console.log('Created:', outputFile);
}

async function main() {
  const base = '/home/runner/workspace/assets/images';
  
  for (let i = 1; i <= 2; i++) {
    const input = path.join(base, `icon-slab-clean-${i}.png`);
    const output = path.join(base, `icon-branded-${i}.png`);
    try {
      await makeIcon(input, output, { fontSize: 120, textY: 920 });
    } catch(e) {
      console.log(`Skipping clean-${i}: ${e.message}`);
    }
  }
}

main();
