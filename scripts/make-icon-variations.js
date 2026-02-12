const sharp = require('sharp');
const path = require('path');

const size = 1024;
const base = '/home/runner/workspace/assets/images';

async function variation1(outputFile) {
  // Text replaces the red header bar area inside the slab
  const slabW = 340;
  const slabH = 540;
  const slabX = (size - slabW) / 2;
  const slabY = (size - slabH) / 2;
  const slabR = 16;

  const labelY = slabY + 58;
  const cardPad = 14;
  const cardX = slabX + cardPad;
  const cardY = slabY + 80;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - 80 - cardPad + slabY;
  const cardR = 8;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>
    
    <!-- Grade.IQ as the label where the red bar was -->
    <text x="${size/2}" y="${labelY}" 
          font-family="Inter" font-weight="700" font-size="42" 
          fill="#FFFFFF" text-anchor="middle" letter-spacing="1">Grade<tspan fill="#FF3C31">.IQ</tspan></text>
    
    <!-- Card window -->
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#000000" stroke="#333333" stroke-width="1.5"/>
  </svg>`;

  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outputFile);
  console.log('V1 - Text as header label:', outputFile);
}

async function variation2(outputFile) {
  // Slab with text at bottom like a real grade label, card window above
  const slabW = 340;
  const slabH = 560;
  const slabX = (size - slabW) / 2;
  const slabY = (size - slabH) / 2;
  const slabR = 16;

  const cardPad = 14;
  const cardX = slabX + cardPad;
  const cardY = slabY + cardPad;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - 120;
  const cardR = 8;

  const redBarY = slabY + slabH - 80;
  const redBarH = 55;
  const redBarX = slabX + cardPad;
  const redBarW = slabW - cardPad * 2;

  const textY = redBarY + 39;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>
    
    <!-- Card window at top -->
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#000000" stroke="#333333" stroke-width="1.5"/>
    
    <!-- Red bar at bottom with text -->
    <rect x="${redBarX}" y="${redBarY}" width="${redBarW}" height="${redBarH}" rx="6" ry="6" fill="#FF3C31"/>
    <text x="${size/2}" y="${textY}" 
          font-family="Inter" font-weight="700" font-size="38" 
          fill="#FFFFFF" text-anchor="middle" letter-spacing="2">Grade.IQ</text>
  </svg>`;

  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outputFile);
  console.log('V2 - Text in red bar at bottom:', outputFile);
}

async function variation3(outputFile) {
  // Text overlaid on the card window area, no separate bar
  const slabW = 360;
  const slabH = 520;
  const slabX = (size - slabW) / 2;
  const slabY = (size - slabH) / 2;
  const slabR = 16;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>
    
    <!-- Thin red accent line at top -->
    <rect x="${slabX + 14}" y="${slabY + 14}" width="${slabW - 28}" height="4" rx="2" ry="2" fill="#FF3C31"/>
    
    <!-- Grade stacked above .IQ, centered in slab -->
    <text x="${size/2}" y="${size/2 - 30}" 
          font-family="Inter" font-weight="700" font-size="110" 
          fill="#FFFFFF" text-anchor="middle" letter-spacing="-2">Grade</text>
    <text x="${size/2}" y="${size/2 + 90}" 
          font-family="Inter" font-weight="700" font-size="110" 
          fill="#FF3C31" text-anchor="middle" letter-spacing="-2">.IQ</text>
    
    <!-- Thin red accent line at bottom -->
    <rect x="${slabX + 14}" y="${slabY + slabH - 18}" width="${slabW - 28}" height="4" rx="2" ry="2" fill="#FF3C31"/>
  </svg>`;

  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outputFile);
  console.log('V3 - Stacked text inside slab:', outputFile);
}

async function variation4(outputFile) {
  // Rotated/tilted slab with text inside the red header
  const slabW = 300;
  const slabH = 480;
  const slabX = (size - slabW) / 2;
  const slabY = (size - slabH) / 2;
  const slabR = 14;

  const redBarH = 65;
  const redBarY = slabY + 12;
  const redBarX = slabX + 12;
  const redBarW = slabW - 24;

  const cardPad = 12;
  const cardX = slabX + cardPad;
  const cardY = redBarY + redBarH + 8;
  const cardW = slabW - cardPad * 2;
  const cardH = slabH - (cardY - slabY) - cardPad;
  const cardR = 7;

  const textY = redBarY + 47;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    
    <g transform="rotate(-8, ${size/2}, ${size/2})">
      <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>
      
      <rect x="${redBarX}" y="${redBarY}" width="${redBarW}" height="${redBarH}" rx="5" ry="5" fill="#FF3C31"/>
      <text x="${size/2}" y="${textY}" 
            font-family="Inter" font-weight="700" font-size="42" 
            fill="#FFFFFF" text-anchor="middle" letter-spacing="2">Grade.IQ</text>
      
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#000000" stroke="#333333" stroke-width="1.5"/>
    </g>
  </svg>`;

  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outputFile);
  console.log('V4 - Tilted slab with text in red bar:', outputFile);
}

async function main() {
  await Promise.all([
    variation1(path.join(base, 'icon-var1.png')),
    variation2(path.join(base, 'icon-var2.png')),
    variation3(path.join(base, 'icon-var3.png')),
    variation4(path.join(base, 'icon-var4.png')),
  ]);
}

main();
