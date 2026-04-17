const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function createIcon(outputFile) {
  const size = 1024;
  
  const fontPath = '/home/runner/workspace/node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf';
  
  execSync(`mkdir -p /tmp/fonts && cp "${fontPath}" /tmp/fonts/Inter-Bold.ttf`);
  
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

  const gradeW = 430;
  const iqW = 190;
  const totalW = gradeW + iqW;
  const startX = (size - totalW) / 2;
  const textY = slabY + slabH + 130;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#000000"/>
    
    <rect x="${slabX}" y="${slabY}" width="${slabW}" height="${slabH}" rx="${slabR}" ry="${slabR}" fill="#FFFFFF"/>
    <rect x="${slabX + 7}" y="${slabY + 7}" width="${slabW - 14}" height="${slabH - 14}" rx="${slabR - 3}" ry="${slabR - 3}" fill="none" stroke="#444444" stroke-width="1.5"/>
    <rect x="${redBarX}" y="${redBarY}" width="${redBarW}" height="${redBarH}" rx="5" ry="5" fill="#FF3C31"/>
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#1a1a1a"/>
    <rect x="${cardX + 4}" y="${cardY + 4}" width="${cardW - 8}" height="${cardH - 8}" rx="${cardR - 2}" ry="${cardR - 2}" fill="none" stroke="#333333" stroke-width="1.5"/>
  </svg>`;

  const base = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

  const gradeText = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <text x="${startX}" y="${textY}" 
          font-family="Inter Bold, Inter, sans-serif" 
          font-weight="700" 
          font-size="130" 
          fill="#FFFFFF"
          letter-spacing="-2">Grade</text>
    <text x="${startX + gradeW}" y="${textY}" 
          font-family="Inter Bold, Inter, sans-serif" 
          font-weight="700" 
          font-size="130" 
          fill="#FF3C31"
          letter-spacing="-2">.IQ</text>
  </svg>`;

  await sharp(base)
    .composite([{
      input: Buffer.from(gradeText),
      top: 0,
      left: 0,
    }])
    .png()
    .toFile(outputFile);
  
  console.log('Created:', outputFile);
}

async function main() {
  const base = '/home/runner/workspace/assets/images';
  
  process.env.FONTCONFIG_PATH = '/tmp/fonts';
  
  await createIcon(path.join(base, 'icon-built-1.png'));
}

main();
