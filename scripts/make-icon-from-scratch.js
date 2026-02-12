const sharp = require('sharp');
const path = require('path');

async function createIcon(outputFile) {
  const size = 1024;
  
  const slabW = 440;
  const slabH = 560;
  const slabX = (size - slabW) / 2;
  const slabY = 90;
  const slabR = 24;
  
  const redBarH = 65;
  const redBarY = slabY + 22;
  const redBarX = slabX + 22;
  const redBarW = slabW - 44;
  
  const cardPad = 22;
  const cardX = slabX + cardPad;
  const cardY = redBarY + redBarH + 15;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - (cardY - slabY) - cardPad;
  const cardR = 12;
  
  const textY = slabY + slabH + 130;
  
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    
    <!-- Slab outer -->
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="#FFFFFF"/>
    
    <!-- Slab inner border -->
    <rect x="${slabX + 8}" y="${slabY + 8}" width="${slabW - 16}" height="${slabH - 16}" rx="${slabR - 4}" ry="${slabR - 4}" fill="none" stroke="#444444" stroke-width="2"/>
    
    <!-- Red header bar -->
    <rect x="${redBarX}" y="${redBarY}" width="${redBarW}" height="${redBarH}" rx="6" ry="6" fill="#FF3C31"/>
    
    <!-- Card window area -->
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#1a1a1a"/>
    
    <!-- Card inner border -->
    <rect x="${cardX + 5}" y="${cardY + 5}" width="${cardW - 10}" height="${cardH - 10}" rx="${cardR - 2}" ry="${cardR - 2}" fill="none" stroke="#333333" stroke-width="1.5"/>
    
    <!-- Grade.IQ text - white with red .IQ -->
    <text x="${size/2}" y="${textY}" 
          font-family="Arial Black, Impact, Helvetica Neue, sans-serif" 
          font-weight="900" 
          font-size="130" 
          fill="#FFFFFF" 
          text-anchor="middle"
          letter-spacing="-2">Grade<tspan fill="#FF3C31">.IQ</tspan></text>
  </svg>`;

  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(outputFile);
  
  console.log('Created:', outputFile);
}

async function main() {
  const base = '/home/runner/workspace/assets/images';
  await createIcon(path.join(base, 'icon-built-1.png'));
}

main();
