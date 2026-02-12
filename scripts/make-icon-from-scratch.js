const sharp = require('sharp');
const path = require('path');

async function createIcon(outputFile) {
  const size = 1024;
  
  const slabW = 230;
  const slabH = 370;
  const slabX = (size - slabW) / 2;
  const slabY = 100;
  const slabR = 14;
  const slabStroke = 2.5;
  
  const redBarH = 36;
  const redBarY = slabY + 12;
  const redBarX = slabX + 12;
  const redBarW = slabW - 24;
  
  const cardPad = 12;
  const cardX = slabX + cardPad;
  const cardY = redBarY + redBarH + 8;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - (cardY - slabY) - cardPad;
  const cardR = 7;
  
  const textY = slabY + slabH + 140;
  
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="none" stroke="#FFFFFF" stroke-width="${slabStroke}"/>
    
    <rect x="${redBarX}" y="${redBarY}" width="${redBarW}" height="${redBarH}" rx="4" ry="4" fill="#FF3C31"/>
    
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#000000" stroke="#333333" stroke-width="1.5"/>
    
    <text x="${size/2}" y="${textY}" 
          font-family="Inter" 
          font-weight="700" 
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
