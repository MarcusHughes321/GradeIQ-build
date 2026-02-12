const sharp = require('sharp');
const path = require('path');

async function createIcon(outputFile, variant) {
  const size = 1024;
  const pad = 80;
  
  const slabW = 480;
  const slabH = 620;
  const slabX = (size - slabW) / 2;
  const slabY = variant === 'compact' ? 100 : 80;
  const slabR = 24;
  
  const redBarH = 70;
  const redBarY = slabY + 20;
  const redBarX = slabX + 20;
  const redBarW = slabW - 40;
  
  const cardPad = 20;
  const cardX = slabX + cardPad;
  const cardY = redBarY + redBarH + 15;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - (cardY - slabY) - cardPad;
  const cardR = 12;
  
  const fontSize = variant === 'compact' ? 100 : 110;
  const textY = slabY + slabH + (variant === 'compact' ? 100 : 120);
  
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    
    <!-- Slab outer -->
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="#FFFFFF"/>
    
    <!-- Slab inner border -->
    <rect x="${slabX + 8}" y="${slabY + 8}" width="${slabW - 16}" height="${slabH - 16}" rx="${slabR - 4}" ry="${slabR - 4}" fill="none" stroke="#333333" stroke-width="2"/>
    
    <!-- Red header bar -->
    <rect x="${redBarX}" y="${redBarY}" width="${redBarW}" height="${redBarH}" rx="6" ry="6" fill="#FF3C31"/>
    
    <!-- Card window area -->
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#1a1a1a"/>
    
    <!-- Card inner border for depth -->
    <rect x="${cardX + 6}" y="${cardY + 6}" width="${cardW - 12}" height="${cardH - 12}" rx="${cardR - 2}" ry="${cardR - 2}" fill="none" stroke="#333333" stroke-width="1.5"/>
    
    <!-- Grade.IQ text -->
    <text x="${size/2}" y="${textY}" 
          font-family="Arial Black, Impact, Helvetica Neue, sans-serif" 
          font-weight="900" 
          font-size="${fontSize}" 
          fill="white" 
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
  await createIcon(path.join(base, 'icon-built-1.png'), 'standard');
  await createIcon(path.join(base, 'icon-built-2.png'), 'compact');
}

main();
