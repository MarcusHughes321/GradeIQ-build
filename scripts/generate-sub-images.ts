const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SIZE = 1024;
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'subscription-images');

interface TierConfig {
  name: string;
  filename: string;
  bgGradient: { start: string; end: string };
  accentColor: string;
  features: string[];
  price: string;
  badge?: string;
  iconShape: string;
}

const tiers: TierConfig[] = [
  {
    name: 'Curious',
    filename: 'subscription_curious.png',
    bgGradient: { start: '#0A2342', end: '#1B6B93' },
    accentColor: '#38BDF8',
    features: ['15 Quick Grades', '2 Deep Grades'],
    price: '£2.99/mo',
    iconShape: 'sparkles',
  },
  {
    name: 'Enthusiast',
    filename: 'subscription_enthusiast.png',
    bgGradient: { start: '#3D0C02', end: '#8B1A1A' },
    accentColor: '#FF3C31',
    features: ['50 Quick Grades', '7 Deep Grades'],
    price: '£5.99/mo',
    badge: 'Most Popular',
    iconShape: 'flame',
  },
  {
    name: 'Obsessed',
    filename: 'subscription_obsessed.png',
    bgGradient: { start: '#1A0533', end: '#4C1D95' },
    accentColor: '#F59E0B',
    features: ['Unlimited Quick Grades', '30 Deep Grades'],
    price: '£9.99/mo',
    iconShape: 'diamond',
  },
];

function sparklesSvg(cx: number, cy: number, color: string): string {
  return `
    <g transform="translate(${cx}, ${cy})">
      <path d="M0,-50 L8,-8 L50,0 L8,8 L0,50 L-8,8 L-50,0 L-8,-8 Z" fill="${color}" opacity="0.9"/>
      <path d="M35,-35 L39,-25 L50,-20 L39,-15 L35,-5 L31,-15 L20,-20 L31,-25 Z" fill="${color}" opacity="0.6"/>
      <path d="M-30,30 L-26,38 L-18,42 L-26,46 L-30,54 L-34,46 L-42,42 L-34,38 Z" fill="${color}" opacity="0.6"/>
    </g>`;
}

function flameSvg(cx: number, cy: number, color: string): string {
  return `
    <g transform="translate(${cx}, ${cy})">
      <path d="M0,-55 C15,-35 45,-15 40,20 C38,40 20,55 0,55 C-20,55 -38,40 -40,20 C-45,-15 -15,-35 0,-55 Z" fill="${color}" opacity="0.9"/>
      <path d="M0,-25 C8,-15 22,-5 20,15 C19,28 10,38 0,38 C-10,38 -19,28 -20,15 C-22,-5 -8,-15 0,-25 Z" fill="#FF6B35" opacity="0.7"/>
      <path d="M0,-5 C4,-0 10,5 9,15 C8,22 4,28 0,28 C-4,28 -8,22 -9,15 C-10,5 -4,0 0,-5 Z" fill="#FFD700" opacity="0.8"/>
    </g>`;
}

function diamondSvg(cx: number, cy: number, color: string): string {
  return `
    <g transform="translate(${cx}, ${cy})">
      <path d="M0,-55 L45,-15 L0,55 L-45,-15 Z" fill="${color}" opacity="0.9"/>
      <path d="M0,-55 L45,-15 L0,-5 L-45,-15 Z" fill="${color}" opacity="0.5"/>
      <path d="M0,-55 L15,-15 L0,55 L-15,-15 Z" fill="white" opacity="0.15"/>
      <line x1="-45" y1="-15" x2="45" y2="-15" stroke="white" stroke-width="1.5" opacity="0.3"/>
    </g>`;
}

function getIconSvg(shape: string, cx: number, cy: number, color: string): string {
  switch (shape) {
    case 'sparkles': return sparklesSvg(cx, cy, color);
    case 'flame': return flameSvg(cx, cy, color);
    case 'diamond': return diamondSvg(cx, cy, color);
    default: return '';
  }
}

function generateSvg(tier: TierConfig): string {
  const { name, bgGradient, accentColor, features, price, badge, iconShape } = tier;

  const badgeSvg = badge ? `
    <rect x="312" y="80" width="400" height="56" rx="28" fill="${accentColor}"/>
    <text x="512" y="116" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="28" fill="white" text-anchor="middle">${badge}</text>
  ` : '';

  const featureLines = features.map((f, i) => {
    const y = 580 + i * 72;
    return `
      <circle cx="240" cy="${y}" r="14" fill="${accentColor}"/>
      <text x="240" y="${y + 2}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="18" fill="white" text-anchor="middle">✓</text>
      <text x="270" y="${y + 12}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="44" fill="white">${f}</text>
    `;
  }).join('');

  const svg = `
  <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgGradient.start}"/>
        <stop offset="100%" stop-color="${bgGradient.end}"/>
      </linearGradient>
      <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.12)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.04)"/>
      </linearGradient>
    </defs>

    <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>

    <circle cx="100" cy="100" r="200" fill="${accentColor}" opacity="0.06"/>
    <circle cx="900" cy="900" r="250" fill="${accentColor}" opacity="0.06"/>
    <circle cx="800" cy="200" r="150" fill="${accentColor}" opacity="0.04"/>

    <rect x="80" y="160" width="864" height="700" rx="40" fill="white" opacity="0.08"/>
    <rect x="80" y="160" width="864" height="700" rx="40" fill="none" stroke="${accentColor}" stroke-width="2" opacity="0.3"/>

    ${badgeSvg}

    ${getIconSvg(iconShape, 512, 340, accentColor)}

    <text x="512" y="470" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="72" fill="white" text-anchor="middle">${name}</text>

    <line x1="240" y1="510" x2="784" y2="510" stroke="${accentColor}" stroke-width="3" opacity="0.5"/>

    ${featureLines}

    <rect x="262" y="790" width="500" height="90" rx="45" fill="${accentColor}"/>
    <text x="512" y="850" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="52" fill="white" text-anchor="middle">${price}</text>

    <text x="512" y="960" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="white" opacity="0.5" text-anchor="middle">Grade IQ</text>
  </svg>`;

  return svg;
}

async function generateImage(tier: TierConfig) {
  const svg = generateSvg(tier);
  const outputPath = path.join(OUT_DIR, tier.filename);
  
  await sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .png()
    .toFile(outputPath);

  console.log(`Generated: ${outputPath}`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  for (const tier of tiers) {
    await generateImage(tier);
  }

  console.log('All subscription images generated successfully!');
}

main().catch(console.error);
