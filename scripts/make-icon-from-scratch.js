const sharp = require('sharp');
const path = require('path');

async function createIcon(outputFile) {
  const size = 1024;
  
  const slabW = 360;
  const slabH = 520;
  const slabX = (size - slabW) / 2;
  const slabY = 90;
  const slabR = 20;
  
  const redBarH = 55;
  const redBarY = slabY + 18;
  const redBarX = slabX + 18;
  const redBarW = slabW - 36;
  
  const cardPad = 18;
  const cardX = slabX + cardPad;
  const cardY = redBarY + redBarH + 12;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - (cardY - slabY) - cardPad;
  const cardR = 10;
  
  const textY = slabY + slabH + 130;
  
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    
    <!-- Slab outer -->
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="#FFFFFF"/>
    
    <!-- Slab inner border -->
    <rect x="${slabX + 7}" y="${slabY + 7}" width="${slabW - 14}" height="${slabH - 14}" rx="${slabR - 3}" ry="${slabR - 3}" fill="none" stroke="#444444" stroke-width="1.5"/>
    
    <!-- Red header bar -->
    <rect x="${redBarX}" y="${redBarY}" width="${redBarW}" height="${redBarH}" rx="5" ry="5" fill="#FF3C31"/>
    
    <!-- Card window area -->
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#1a1a1a"/>
    
    <!-- Card inner border -->
    <rect x="${cardX + 4}" y="${cardY + 4}" width="${cardW - 8}" height="${cardH - 8}" rx="${cardR - 2}" ry="${cardR - 2}" fill="none" stroke="#333333" stroke-width="1.5"/>
    
    <!-- Grade.IQ text using Inter font style -->
    <text x="${size/2}" y="${textY}" 
          font-family="Inter, Helvetica Neue, Helvetica, sans-serif" 
          font-weight="800" 
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
