const sharp = require('sharp');
const path = require('path');

async function makeIcon(inputFile, outputFile) {
  const size = 1024;
  const img = sharp(inputFile).resize(size, size);
  
  const textSvg = `
  <svg width="${size}" height="${size}">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@800');
    </style>
    <text x="${size/2}" y="${size - 120}" 
          font-family="Inter, Arial Black, sans-serif" 
          font-weight="900" 
          font-size="120" 
          fill="white" 
          text-anchor="middle"
          letter-spacing="-2">Grade<tspan fill="#FF3C31">.IQ</tspan></text>
  </svg>`;

  await img
    .composite([{
      input: Buffer.from(textSvg),
      top: 0,
      left: 0,
    }])
    .png()
    .toFile(outputFile);
  
  console.log(`Created: ${outputFile}`);
}

async function main() {
  const base = '/home/runner/workspace/assets/images';
  for (let i = 1; i <= 3; i++) {
    const input = path.join(base, `icon-slab-${i}.png`);
    const output = path.join(base, `icon-final-${i}.png`);
    try {
      await makeIcon(input, output);
    } catch(e) {
      console.log(`Skipping ${i}: ${e.message}`);
    }
  }
}

main();
