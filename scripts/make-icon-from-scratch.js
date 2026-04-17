const sharp = require('sharp');
const path = require('path');

async function createIcon(outputFile) {
  const size = 1024;
  
  const slabW = 160;
  const slabH = 256;
  const textFontSize = 160;
  const gap = 60;
  const totalH = slabH + gap + textFontSize * 0.75;
  const startY = (size - totalH) / 2;
  
  const slabX = (size - slabW) / 2;
  const slabY = startY;
  const slabR = 10;
  const slabStroke = 2;
  
  const redBarH = 25;
  const redBarY = slabY + 9;
  const redBarX = slabX + 9;
  const redBarW = slabW - 18;
  
  const cardPad = 9;
  const cardX = slabX + cardPad;
  const cardY = redBarY + redBarH + 6;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - (cardY - slabY) - cardPad;
  const cardR = 5;
  
  const textY = slabY + slabH + gap + textFontSize * 0.75;
  
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="none" stroke="#FFFFFF" stroke-width="${slabStroke}"/>
    
    <rect x="${redBarX}" y="${redBarY}" width="${redBarW}" height="${redBarH}" rx="3" ry="3" fill="#FF3C31"/>
    
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#000000" stroke="#333333" stroke-width="1.2"/>
    
    <text x="${size/2}" y="${textY}" 
          font-family="Inter" 
          font-weight="700" 
          font-size="${textFontSize}" 
          fill="#FFFFFF" 
          text-anchor="middle"
          letter-spacing="-3">Grade<tspan fill="#FF3C31">.IQ</tspan></text>
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
