import sharp from "sharp";
import fs from "fs";

async function diagnose(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const meta = await sharp(buffer).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  
  const sz = 200;
  const sw = Math.max(20, Math.round(w <= sz ? w : sz * (w / Math.max(w, h))));
  const sh2 = Math.max(20, Math.round(h <= sz ? h : sz * (h / Math.max(w, h))));
  const { data } = await sharp(buffer).resize(sw, sh2, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  
  const getPixel = (x: number, y: number) => data[y * sw + x] || 0;
  
  console.log(`\n${filePath.split("/").pop()} (${w}x${h} → ${sw}x${sh2})`);
  
  console.log("  Row avg brightness:");
  for (let y = 0; y < sh2; y += Math.max(1, Math.round(sh2 / 20))) {
    let sum = 0;
    for (let x = 0; x < sw; x++) sum += getPixel(x, y);
    const avg = Math.round(sum / sw);
    const pct = ((y / sh2) * 100).toFixed(0).padStart(3);
    console.log(`    ${pct}%: ${String(avg).padStart(3)} ${"█".repeat(Math.round(avg / 8))}`);
  }

  const midRow = Math.round(sh2 * 0.45);
  console.log(`  Col avg at ~45% row:`);
  for (let x = 0; x < sw; x += Math.max(1, Math.round(sw / 20))) {
    const val = getPixel(x, midRow);
    const pct = ((x / sw) * 100).toFixed(0).padStart(3);
    console.log(`    ${pct}%: ${String(val).padStart(3)} ${"█".repeat(Math.round(val / 8))}`);
  }
}

async function main() {
  const testImages = [
    "attached_assets/IMG_6631_1770856748264.png",
    "attached_assets/IMG_6632_1770856748264.png",
    "attached_assets/IMG_6638_1770856748264.jpeg",
    "attached_assets/IMG_6639_1770856748264.jpeg",
    "attached_assets/IMG_6640_1770856748264.jpeg",
    "attached_assets/IMG_6641_1770856748265.jpeg",
    "attached_assets/IMG_6650_1770856748265.jpeg",
    "attached_assets/IMG_6651_1770856748265.jpeg",
    "attached_assets/IMG_6652_1770856748265.jpeg",
    "attached_assets/IMG_6653_1770856748265.jpeg",
  ];
  for (const img of testImages) {
    if (fs.existsSync(img)) await diagnose(img);
  }
}
main().catch(console.error);
