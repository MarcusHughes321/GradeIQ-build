const sharp = require('sharp');
const path = require('path');

const size = 1024;
const base = '/home/runner/workspace/assets/images';

async function variation4big(outputFile) {
  const slabW = 520;
  const slabH = 830;
  const slabX = (size - slabW) / 2;
  const slabY = (size - slabH) / 2;
  const slabR = 24;

  const redBarH = 110;
  const redBarY = slabY + 18;
  const redBarX = slabX + 18;
  const redBarW = slabW - 36;

  const cardPad = 18;
  const cardX = slabX + cardPad;
  const cardY = redBarY + redBarH + 12;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - (cardY - slabY) - cardPad;
  const cardR = 12;

  const textY = redBarY + 78;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    
    <g transform="rotate(-8, ${size/2}, ${size/2})">
      <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="none" stroke="#FFFFFF" stroke-width="3"/>
      
      <rect x="${redBarX}" y="${redBarY}" width="${redBarW}" height="${redBarH}" rx="8" ry="8" fill="#FF3C31"/>
      <text x="${size/2}" y="${textY}" 
            font-family="Inter" font-weight="700" font-size="72" 
            fill="#FFFFFF" text-anchor="middle" letter-spacing="3">Grade.IQ</text>
      
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#000000" stroke="#333333" stroke-width="2"/>
    </g>
  </svg>`;

  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outputFile);
  console.log('V4 big:', outputFile);
}

async function main() {
  await variation4big(path.join(base, 'icon-var4.png'));
}

main();
