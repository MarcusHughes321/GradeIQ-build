const sharp = require('sharp');
const path = require('path');

const size = 1024;
const base = '/home/runner/workspace/assets/images';

async function variation4straight(outputFile) {
  const slabW = 520;
  const slabH = 830;
  const slabX = (size - slabW) / 2;
  const slabY = (size - slabH) / 2;
  const slabR = 24;

  const headerH = 110;
  const headerY = slabY + 18;
  const headerX = slabX + 18;
  const headerW = slabW - 36;

  const cardPad = 18;
  const cardX = slabX + cardPad;
  const cardY = headerY + headerH + 12;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - (cardY - slabY) - cardPad;
  const cardR = 12;

  const textY = headerY + 78;

  const cornerLen = 28;
  const cornerOff = 8;
  const cLeft = cardX + cornerOff;
  const cRight = cardX + cardW - cornerOff;
  const cTop = cardY + cornerOff;
  const cBottom = cardY + cardH - cornerOff;
  const cStroke = 2;
  const cColor = "#444444";

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <!-- White background -->
    <rect width="${size}" height="${size}" fill="#FFFFFF"/>
    
    <!-- Black slab -->
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="#000000" stroke="#222222" stroke-width="1"/>
    
    <!-- Black header bar -->
    <rect x="${headerX}" y="${headerY}" width="${headerW}" height="${headerH}" rx="8" ry="8" fill="#111111" stroke="#333333" stroke-width="1"/>
    <!-- White Grade + Red .IQ (same as app logo) -->
    <text x="${size/2}" y="${textY}" 
          font-family="Inter" font-weight="700" font-size="72" 
          fill="#FFFFFF" text-anchor="middle" letter-spacing="3">Grade<tspan fill="#FF3C31">.IQ</tspan></text>
    
    <!-- Card window -->
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#0a0a0a" stroke="#222222" stroke-width="1.5"/>
    
    <!-- Corner brackets - top left -->
    <line x1="${cLeft}" y1="${cTop}" x2="${cLeft + cornerLen}" y2="${cTop}" stroke="${cColor}" stroke-width="${cStroke}"/>
    <line x1="${cLeft}" y1="${cTop}" x2="${cLeft}" y2="${cTop + cornerLen}" stroke="${cColor}" stroke-width="${cStroke}"/>
    
    <!-- Corner brackets - top right -->
    <line x1="${cRight}" y1="${cTop}" x2="${cRight - cornerLen}" y2="${cTop}" stroke="${cColor}" stroke-width="${cStroke}"/>
    <line x1="${cRight}" y1="${cTop}" x2="${cRight}" y2="${cTop + cornerLen}" stroke="${cColor}" stroke-width="${cStroke}"/>
    
    <!-- Corner brackets - bottom left -->
    <line x1="${cLeft}" y1="${cBottom}" x2="${cLeft + cornerLen}" y2="${cBottom}" stroke="${cColor}" stroke-width="${cStroke}"/>
    <line x1="${cLeft}" y1="${cBottom}" x2="${cLeft}" y2="${cBottom - cornerLen}" stroke="${cColor}" stroke-width="${cStroke}"/>
    
    <!-- Corner brackets - bottom right -->
    <line x1="${cRight}" y1="${cBottom}" x2="${cRight - cornerLen}" y2="${cBottom}" stroke="${cColor}" stroke-width="${cStroke}"/>
    <line x1="${cRight}" y1="${cBottom}" x2="${cRight}" y2="${cBottom - cornerLen}" stroke="${cColor}" stroke-width="${cStroke}"/>
  </svg>`;

  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outputFile);
  console.log('V4 inverted:', outputFile);
}

async function main() {
  await variation4straight(path.join(base, 'icon-var4.png'));
}

main();
