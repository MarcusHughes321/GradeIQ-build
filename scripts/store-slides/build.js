#!/usr/bin/env node
/*
 * Grade.IQ — App Store + Google Play screenshot builder.
 *
 * Renders the 6-slide store listing set for both stores from source
 * screenshots in attached_assets/. Phone slides (2-5) composite a screenshot
 * into the upright phone mockup (base template) and overlay title + two
 * subtitle lines. Slide 1 (hero) and slide 6 (closing) are passed through.
 *
 * Apple:       1290 x 2796, no alpha (valid 6.9" size).
 * Google Play: 1400 x 2796, padded so aspect ratio stays <= 2:1.
 *
 * Fonts: Inter (400/500/700) must be registered with fontconfig so librsvg
 * (used by sharp for SVG text) can render it. ensureFonts() self-heals this.
 *
 * Run from repo root:  node scripts/store-slides/build.js
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// ---------------------------------------------------------------- layout
const W = 1290, H = 2796, BG = "#20262c";
const GX = 162, GY = 638, GW = 965, GH = 2040, R = 124; // glass rect + radius
const PAINT_H = 612;                                    // erase base title area
const TITLE_Y = 350, SUB1_Y = 446, SUB2_Y = 515;       // text baselines
const BASE = "attached_assets/IMG_6836_1783082056846.png";
const GW_PLAY = 1400;                                   // google play width

const APPLE = "store-assets/apple";
const PLAY = "store-assets/google-play";

// company colours (match constants/colors.ts + components/CompanyLabel.tsx)
const C = { psaP: "#1E56A0", psaS: "#E63946", psaA: "#1E56A0", bgs: "#C0C0C0", ace: "#FFD700", tag: "#FFFFFF", cgc: "#E63946", grey: "#A0A0A0" };

// ---------------------------------------------------------------- fonts
function interRegistered() {
  try {
    const fams = execSync("fc-list : family", { encoding: "utf8" });
    return fams.split("\n").some((line) => line.split(",").map((f) => f.trim()).includes("Inter"));
  } catch (_) { return false; }
}

function ensureFonts() {
  if (interRegistered()) return;
  const dst = path.join(os.homedir(), ".fonts");
  fs.mkdirSync(dst, { recursive: true });
  const weights = [
    ["400Regular", "Inter_400Regular.ttf"],
    ["500Medium", "Inter_500Medium.ttf"],
    ["600SemiBold", "Inter_600SemiBold.ttf"],
    ["700Bold", "Inter_700Bold.ttf"],
  ];
  for (const [dir, file] of weights) {
    const src = `node_modules/@expo-google-fonts/inter/${dir}/${file}`;
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dst, file));
  }
  execSync(`fc-cache -f ${dst}`, { stdio: "ignore" });
  if (!interRegistered()) {
    throw new Error("Inter font not registered after fc-cache — SVG text would render with a fallback font, breaking layout.");
  }
}

// ---------------------------------------------------------------- helpers
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// rightmost non-transparent pixel = rendered text width
async function measure(text, weight, size) {
  const CANVAS = 4000;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="300"><text x="0" y="200" font-family="Inter" font-weight="${weight}" font-size="${size}" fill="#fff">${esc(text)}</text></svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let maxx = 0;
  for (let y = 0; y < height; y++) {
    for (let x = width - 1; x > maxx; x--) {
      if (data[(y * width + x) * channels + 3] > 10) { maxx = x; break; }
    }
  }
  if (maxx >= width - 1) throw new Error(`measure() canvas too small for text "${text}" @ ${size}px — widen CANVAS`);
  return maxx;
}

async function fitSize(text, weight, maxSize, maxWidth) {
  const w = await measure(text, weight, maxSize);
  return w <= maxWidth ? maxSize : Math.floor(maxSize * maxWidth / w);
}

async function cornerColor(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (2 * info.width + 2) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2], alpha: 1 };
}

const maskSvg = () => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}"><rect x="0" y="0" width="${GW}" height="${GH}" rx="${R}" ry="${R}" fill="#fff"/></svg>`);

async function prepShot(shotPath) {
  return sharp(`attached_assets/${shotPath}`)
    .resize(GW, GH, { fit: "cover", position: "centre" })
    .composite([{ input: maskSvg(), blend: "dest-in" }])
    .png().toBuffer();
}

// build the transparent text overlay (title + 2 sub lines)
function textOverlay({ title, titleSize, sub1, sub2, subSize }) {
  const sub1svg = Array.isArray(sub1)
    ? sub1.map((p) => `<tspan fill="${p.f}">${esc(p.t)}</tspan>`).join("")
    : `<tspan fill="${C.grey}">${esc(sub1)}</tspan>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text xml:space="preserve" x="${W / 2}" y="${TITLE_Y}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${titleSize}" fill="#FFFFFF">${esc(title)}</text>
    <text xml:space="preserve" x="${W / 2}" y="${SUB1_Y}" text-anchor="middle" font-family="Inter" font-weight="500" font-size="${subSize}">${sub1svg}</text>
    <text xml:space="preserve" x="${W / 2}" y="${SUB2_Y}" text-anchor="middle" font-family="Inter" font-weight="400" font-size="${subSize}" fill="#666666">${esc(sub2)}</text>
  </svg>`;
  return Buffer.from(svg);
}

async function paintBuf() {
  return sharp({ create: { width: W, height: PAINT_H, channels: 4, background: BG } }).png().toBuffer();
}

// export apple (1290) + google play (padded 1400); flatten guarantees no alpha
async function exportBoth(appleBuf, out, padColor) {
  await sharp(appleBuf).flatten({ background: BG }).toFile(`${APPLE}/${out}.png`);
  const left = Math.round((GW_PLAY - W) / 2);
  await sharp(appleBuf).flatten({ background: BG })
    .extend({ left, right: GW_PLAY - W - left, top: 0, bottom: 0, background: padColor })
    .toFile(`${PLAY}/${out}.png`);
}

// ---------------------------------------------------------------- slides
const SLIDES = [
  {
    out: "02-why-gradeiq",
    shot: "IMG_8930_1783084680084.png",
    title: "Why Grade.IQ",
    sub1: [
      { t: "P", f: C.psaP }, { t: "S", f: C.psaS }, { t: "A", f: C.psaA },
      { t: ", ", f: C.grey },
      { t: "BGS", f: C.bgs }, { t: ", ", f: C.grey },
      { t: "ACE", f: C.ace }, { t: ", ", f: C.grey },
      { t: "TAG", f: C.tag }, { t: " & ", f: C.grey },
      { t: "CGC", f: C.cgc }, { t: " published standards —", f: C.grey },
    ],
    sub2: "baked right into our AI grader.",
  },
  {
    out: "03-most-value",
    shot: "IMG_8929_1783084596187.png",
    title: "Where's the Most Value?",
    sub1: "Compare your value across every company's AI grade.",
    sub2: "See how liquid it is to sell — and the best grader to choose.",
  },
  {
    out: "04-every-detail",
    shot: "IMG_8932_1783093120444.png",
    title: "Every Detail Revealed",
    sub1: "CLAHE adaptive filters reveal every detail.",
    sub2: "Scratches & surface flaws invisible to the naked eye.",
  },
  {
    out: "05-tcg-advisor",
    shot: "IMG_8933_1783093732460.png",
    title: "TCG Advisor",
    sub1: "An AI chatbot plugged into our card & price database.",
    sub2: "Ask it anything — values, grades, good trades.",
  },
];

async function buildPhoneSlide(s) {
  const shot = await prepShot(s.shot);
  const paint = await paintBuf();
  const sub1plain = Array.isArray(s.sub1) ? s.sub1.map((p) => p.t).join("") : s.sub1;
  const titleSize = await fitSize(s.title, 700, 96, 1180);
  const subSize = Math.min(
    await fitSize(sub1plain, 500, 50, 1200),
    await fitSize(s.sub2, 400, 50, 1200),
  );
  const overlay = textOverlay({ title: s.title, titleSize, sub1: s.sub1, sub2: s.sub2, subSize });
  const appleBuf = await sharp(BASE).ensureAlpha()
    .composite([
      { input: paint, top: 0, left: 0 },
      { input: shot, top: GY, left: GX },
      { input: overlay, top: 0, left: 0 },
    ])
    .png().toBuffer();
  await exportBoth(appleBuf, s.out, BG);
  console.log(`  ${s.out}  (title ${titleSize}px, sub ${subSize}px)`);
}

async function buildPassthrough(srcPath, out) {
  const appleBuf = await sharp(srcPath).flatten({ background: BG }).resize(W, H).png().toBuffer();
  const pad = await cornerColor(appleBuf);
  await exportBoth(appleBuf, out, pad);
  console.log(`  ${out}  (passthrough)`);
}

async function main() {
  ensureFonts();
  fs.mkdirSync(APPLE, { recursive: true });
  fs.mkdirSync(PLAY, { recursive: true });

  console.log("Phone slides:");
  for (const s of SLIDES) await buildPhoneSlide(s);

  console.log("Closing slide:");
  await buildPassthrough("attached_assets/IMG_6835_1783090992355.png", "06-closing");

  // slide 1 hero: keep existing apple export, (re)build the google-play pad from it
  console.log("Hero google-play pad:");
  const heroApple = `${APPLE}/01-hero-results.png`;
  if (fs.existsSync(heroApple)) {
    const buf = await sharp(heroApple).flatten({ background: BG }).removeAlpha().png().toBuffer();
    const pad = await cornerColor(buf);
    const left = Math.round((GW_PLAY - W) / 2);
    await sharp(buf).removeAlpha().extend({ left, right: GW_PLAY - W - left, top: 0, bottom: 0, background: pad })
      .toFile(`${PLAY}/01-hero-results.png`);
    console.log("  01-hero-results  (google pad)");
  } else {
    console.log("  !! hero apple export missing, skipped");
  }

  // remove stale renamed files from the previous copy pass
  for (const dir of [APPLE, PLAY]) {
    for (const f of ["02-scoring-standards.png", "03-values-liquidity.png"]) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) { fs.unlinkSync(p); console.log("  removed stale", p); }
    }
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
