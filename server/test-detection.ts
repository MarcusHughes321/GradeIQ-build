import sharp from "sharp";
import fs from "fs";
import path from "path";

const CARD_WH_RATIO = 2.5 / 3.5;
const RATIO_TOLERANCE = 0.12;

interface DetectionResult {
  file: string;
  dimensions: string;
  coarse: BoundsResult;
  fine: BoundsResult;
  cardAreaPct: number;
  pass: boolean;
}

interface BoundsResult {
  left: number; top: number; right: number; bottom: number;
  angle: number; confidence: number;
  vPeakCount: number; hPeakCount: number;
  topCandidates: CandidateInfo[];
}

interface CandidateInfo {
  left: number; right: number; top: number; bottom: number;
  score: number;
  ratioScore: number; sizeScore: number; centerScore: number;
  edgeNorm: number; contrastScore: number; proximityPenalty: number;
  ratio: number; sizeRatio: number;
}

function detectBoundsDebug(
  pixels: Buffer, sw: number, sh: number,
  xConstraint?: { minPct: number; maxPct: number },
  yConstraint?: { minPct: number; maxPct: number }
): BoundsResult {
  const getPixel = (x: number, y: number) => {
    if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
    return pixels[y * sw + x];
  };

  const sobelX = (x: number, y: number): number => (
    -getPixel(x - 1, y - 1) + getPixel(x + 1, y - 1) +
    -2 * getPixel(x - 1, y) + 2 * getPixel(x + 1, y) +
    -getPixel(x - 1, y + 1) + getPixel(x + 1, y + 1)
  );

  const sobelY = (x: number, y: number): number => (
    -getPixel(x - 1, y - 1) - 2 * getPixel(x, y - 1) - getPixel(x + 1, y - 1) +
    getPixel(x - 1, y + 1) + 2 * getPixel(x, y + 1) + getPixel(x + 1, y + 1)
  );

  const vProfile = new Float64Array(sw);
  const hProfile = new Float64Array(sh);

  for (let x = 2; x < sw - 2; x++) {
    let sum = 0;
    for (let y = 2; y < sh - 2; y++) {
      const gx = Math.abs(sobelX(x, y));
      const gy = Math.abs(sobelY(x, y));
      if (gx > gy * 1.2 && gx > 8) sum += gx;
    }
    vProfile[x] = sum;
  }

  for (let y = 2; y < sh - 2; y++) {
    let sum = 0;
    for (let x = 2; x < sw - 2; x++) {
      const gy = Math.abs(sobelY(x, y));
      const gx = Math.abs(sobelX(x, y));
      if (gy > gx * 1.2 && gy > 8) sum += gy;
    }
    hProfile[y] = sum;
  }

  const smooth = (profile: Float64Array, radius: number): Float64Array => {
    const out = new Float64Array(profile.length);
    for (let i = 0; i < profile.length; i++) {
      let sum = 0; let count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(profile.length - 1, i + radius); j++) {
        sum += profile[j]; count++;
      }
      out[i] = sum / count;
    }
    return out;
  };

  const vSmooth = smooth(vProfile, 1);
  const hSmooth = smooth(hProfile, 1);

  const findPeaks = (profile: Float64Array, minSep: number, constraintMin?: number, constraintMax?: number): { pos: number; strength: number }[] => {
    const cMin = constraintMin ?? 2;
    const cMax = constraintMax ?? profile.length - 3;
    let maxVal = 0;
    for (let i = cMin; i <= cMax; i++) {
      if (profile[i] > maxVal) maxVal = profile[i];
    }
    if (maxVal === 0) return [];
    const threshold = maxVal * 0.15;
    const rawPeaks: { pos: number; strength: number }[] = [];
    for (let i = cMin + 1; i < cMax; i++) {
      if (profile[i] >= threshold && profile[i] >= profile[i - 1] && profile[i] >= profile[i + 1]) {
        rawPeaks.push({ pos: i, strength: profile[i] });
      }
    }
    if (profile[cMin] >= threshold && profile[cMin] >= profile[cMin + 1]) {
      rawPeaks.push({ pos: cMin, strength: profile[cMin] });
    }
    if (profile[cMax] >= threshold && profile[cMax] >= profile[cMax - 1]) {
      rawPeaks.push({ pos: cMax, strength: profile[cMax] });
    }
    rawPeaks.sort((a, b) => b.strength - a.strength);
    const selected: typeof rawPeaks = [];
    for (const p of rawPeaks) {
      if (!selected.some(s => Math.abs(s.pos - p.pos) < minSep)) {
        selected.push(p);
      }
    }
    return selected.slice(0, 15);
  };

  const xCMin = xConstraint ? Math.max(2, Math.round(sw * xConstraint.minPct / 100)) : 2;
  const xCMax = xConstraint ? Math.min(sw - 3, Math.round(sw * xConstraint.maxPct / 100)) : sw - 3;
  const yCMin = yConstraint ? Math.max(2, Math.round(sh * yConstraint.minPct / 100)) : 2;
  const yCMax = yConstraint ? Math.min(sh - 3, Math.round(sh * yConstraint.maxPct / 100)) : sh - 3;

  const vPeaks = findPeaks(vSmooth, Math.max(2, Math.round(sw * 0.03)), xCMin, xCMax);
  const hPeaks = findPeaks(hSmooth, Math.max(2, Math.round(sh * 0.03)), yCMin, yCMax);

  interface RectCandidate {
    left: number; right: number; top: number; bottom: number;
    score: number;
    ratioScore: number; sizeScore: number; centerScore: number;
    edgeNorm: number; contrastScore: number; proximityPenalty: number;
    ratio: number; sizeRatio: number;
    lStr: number; rStr: number; tStr: number; bStr: number;
  }

  const allCandidates: RectCandidate[] = [];

  let best: RectCandidate | null = null;

  for (let li = 0; li < vPeaks.length; li++) {
    for (let ri = 0; ri < vPeaks.length; ri++) {
      if (li === ri) continue;
      const lp = vPeaks[li];
      const rp = vPeaks[ri];
      if (rp.pos <= lp.pos) continue;
      const cardW = rp.pos - lp.pos;
      if (cardW < sw * 0.2) continue;
      const expectedH = cardW / CARD_WH_RATIO;

      for (let ti = 0; ti < hPeaks.length; ti++) {
        const tp = hPeaks[ti];
        const expectedBottom = tp.pos + expectedH;
        let bestBotPeak: { pos: number; strength: number } | null = null;
        let bestBotDist = Infinity;
        for (let bi = 0; bi < hPeaks.length; bi++) {
          if (bi === ti) continue;
          const bp = hPeaks[bi];
          if (bp.pos <= tp.pos) continue;
          const dist = Math.abs(bp.pos - expectedBottom);
          if (dist < bestBotDist) { bestBotDist = dist; bestBotPeak = bp; }
        }

        const tryBottom = (botPos: number, botStr: number) => {
          const cardH = botPos - tp.pos;
          if (cardH < sh * 0.2) return;
          const ratio = cardW / cardH;
          const ratioError = Math.abs(ratio - CARD_WH_RATIO) / CARD_WH_RATIO;
          if (ratioError > RATIO_TOLERANCE * 2) return;
          const ratioScore = Math.max(0, 1 - ratioError / RATIO_TOLERANCE);

          const sizeRatio = (cardW * cardH) / (sw * sh);
          let sizeScore: number;
          if (sizeRatio > 0.80) sizeScore = Math.max(0, 1 - (sizeRatio - 0.80) * 5);
          else if (sizeRatio > 0.15) sizeScore = 1.0;
          else sizeScore = Math.min(1, sizeRatio / 0.15);

          const centerX = (lp.pos + rp.pos) / 2;
          const centerY = (tp.pos + botPos) / 2;
          const offX = Math.abs(centerX - sw / 2) / (sw / 2);
          const offY = Math.abs(centerY - sh / 2) / (sh / 2);
          const centerScore = Math.max(0, 1 - (offX + offY));

          const maxEdge = Math.max(lp.strength, rp.strength, tp.strength, botStr, 1);
          const edgeNorm = (lp.strength + rp.strength + tp.strength + botStr) / (4 * maxEdge);

          const margin = Math.max(sw, sh) * 0.03;
          let proximityPenalty = 1.0;
          if (lp.pos < margin) proximityPenalty *= 0.5;
          if (rp.pos > sw - margin) proximityPenalty *= 0.5;
          if (tp.pos < margin) proximityPenalty *= 0.5;
          if (botPos > sh - margin) proximityPenalty *= 0.5;

          const sampleBand = Math.max(2, Math.round(cardW * 0.05));
          const sampleBrightness = (x1: number, y1: number, x2: number, y2: number, isVert: boolean): number => {
            let sum = 0; let ct = 0;
            const len = isVert ? (y2 - y1) : (x2 - x1);
            const steps = Math.max(5, Math.min(20, Math.abs(len)));
            for (let i = 0; i < steps; i++) {
              const t = i / (steps - 1);
              const sx = isVert ? Math.round(x1) : Math.round(x1 + (x2 - x1) * t);
              const sy = isVert ? Math.round(y1 + (y2 - y1) * t) : Math.round(y1);
              if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) { sum += getPixel(sx, sy); ct++; }
            }
            return ct > 0 ? sum / ct : 0;
          };

          const midY = Math.round((tp.pos + botPos) / 2);
          const bandH = Math.round(cardH * 0.3);
          const leftInside = sampleBrightness(lp.pos + sampleBand, midY - bandH, lp.pos + sampleBand, midY + bandH, true);
          const leftOutside = sampleBrightness(lp.pos - sampleBand, midY - bandH, lp.pos - sampleBand, midY + bandH, true);
          const rightInside = sampleBrightness(rp.pos - sampleBand, midY - bandH, rp.pos - sampleBand, midY + bandH, true);
          const rightOutside = sampleBrightness(rp.pos + sampleBand, midY - bandH, rp.pos + sampleBand, midY + bandH, true);
          const midX = Math.round((lp.pos + rp.pos) / 2);
          const bandW = Math.round(cardW * 0.3);
          const topInside = sampleBrightness(midX - bandW, tp.pos + sampleBand, midX + bandW, tp.pos + sampleBand, false);
          const topOutside = sampleBrightness(midX - bandW, tp.pos - sampleBand, midX + bandW, tp.pos - sampleBand, false);
          const botInside = sampleBrightness(midX - bandW, botPos - sampleBand, midX + bandW, botPos - sampleBand, false);
          const botOutside = sampleBrightness(midX - bandW, botPos + sampleBand, midX + bandW, botPos + sampleBand, false);

          const leftContrast = Math.abs(leftInside - leftOutside);
          const rightContrast = Math.abs(rightInside - rightOutside);
          const topContrast = Math.abs(topInside - topOutside);
          const botContrast = Math.abs(botInside - botOutside);
          const contrastScore = (leftContrast + rightContrast + topContrast + botContrast) / 4;
          const normalizedContrast = Math.min(1, contrastScore / 40);

          const totalScore = (ratioScore * 4.0 + sizeScore * 1.5 + centerScore * 1.0 + edgeNorm * 2.0 + normalizedContrast * 2.5) * proximityPenalty;

          const candidate: RectCandidate = {
            left: (lp.pos / sw) * 100, right: (rp.pos / sw) * 100,
            top: (tp.pos / sh) * 100, bottom: (botPos / sh) * 100,
            score: totalScore, ratioScore, sizeScore, centerScore, edgeNorm,
            contrastScore: normalizedContrast, proximityPenalty,
            ratio, sizeRatio,
            lStr: lp.strength, rStr: rp.strength, tStr: tp.strength, bStr: botStr,
          };
          allCandidates.push(candidate);

          if (!best || totalScore > best.score) {
            best = candidate;
          }
        };

        if (bestBotPeak) tryBottom(bestBotPeak.pos, bestBotPeak.strength);
        const inferredBot = Math.round(tp.pos + expectedH);
        if (inferredBot > tp.pos && inferredBot < sh - 2) {
          tryBottom(inferredBot, hSmooth[Math.min(inferredBot, sh - 1)] || 0);
        }
      }
    }
  }

  const fallback = { left: 10, right: 90, top: 10, bottom: 90 };
  const result = best || { ...fallback, score: 0, ratioScore: 0, sizeScore: 0, centerScore: 0, edgeNorm: 0, contrastScore: 0, proximityPenalty: 1, ratio: 0.71, sizeRatio: 0.64, lStr: 0, rStr: 0, tStr: 0, bStr: 0 };

  allCandidates.sort((a, b) => b.score - a.score);

  return {
    left: result.left,
    top: result.top,
    right: result.right,
    bottom: result.bottom,
    angle: 0,
    confidence: result.score,
    vPeakCount: vPeaks.length,
    hPeakCount: hPeaks.length,
    topCandidates: allCandidates.slice(0, 5).map(c => ({
      left: +c.left.toFixed(1), right: +c.right.toFixed(1),
      top: +c.top.toFixed(1), bottom: +c.bottom.toFixed(1),
      score: +c.score.toFixed(3),
      ratioScore: +c.ratioScore.toFixed(3), sizeScore: +c.sizeScore.toFixed(3),
      centerScore: +c.centerScore.toFixed(3), edgeNorm: +c.edgeNorm.toFixed(3),
      contrastScore: +c.contrastScore.toFixed(3), proximityPenalty: +c.proximityPenalty.toFixed(2),
      ratio: +c.ratio.toFixed(4), sizeRatio: +c.sizeRatio.toFixed(3),
    })),
  };
}

const EXPECTED_BOUNDS: Record<string, { left: [number, number]; top: [number, number]; right: [number, number]; bottom: [number, number] }> = {
  "IMG_6631": { left: [18, 28], top: [12, 22], right: [72, 82], bottom: [75, 88] },
  "IMG_6632": { left: [22, 32], top: [15, 28], right: [70, 80], bottom: [75, 88] },
  "IMG_6638": { left: [18, 30], top: [12, 25], right: [68, 82], bottom: [75, 90] },
  "IMG_6639": { left: [25, 38], top: [12, 25], right: [62, 75], bottom: [75, 90] },
  "IMG_6640": { left: [15, 30], top: [5, 18], right: [65, 82], bottom: [72, 88] },
  "IMG_6641": { left: [18, 32], top: [8, 20], right: [68, 82], bottom: [72, 88] },
  "IMG_6646": { left: [12, 25], top: [10, 22], right: [75, 88], bottom: [72, 88] },
  "IMG_6647": { left: [22, 35], top: [15, 28], right: [68, 80], bottom: [75, 88] },
  "IMG_6650": { left: [10, 22], top: [5, 15], right: [78, 90], bottom: [82, 95] },
  "IMG_6651": { left: [8, 22], top: [5, 15], right: [78, 92], bottom: [82, 95] },
  "IMG_6652": { left: [15, 28], top: [5, 15], right: [72, 85], bottom: [82, 95] },
  "IMG_6653": { left: [15, 28], top: [5, 15], right: [72, 85], bottom: [82, 95] },
};

function isWithinExpected(val: number, range: [number, number]): boolean {
  return val >= range[0] - 5 && val <= range[1] + 5;
}

async function runTest(filePath: string): Promise<DetectionResult> {
  const buffer = fs.readFileSync(filePath);
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;

  const COARSE = 200;
  const csw = Math.max(20, Math.round(width <= COARSE ? width : COARSE * (width / Math.max(width, height))));
  const csh = Math.max(20, Math.round(height <= COARSE ? height : COARSE * (height / Math.max(width, height))));
  const { data: coarsePixels } = await sharp(buffer)
    .resize(csw, csh, { fit: "fill" }).greyscale().raw()
    .toBuffer({ resolveWithObject: true });

  const coarse = detectBoundsDebug(coarsePixels as any, csw, csh);

  const FINE = 600;
  const fsw = Math.max(40, Math.round(width <= FINE ? width : FINE * (width / Math.max(width, height))));
  const fsh = Math.max(40, Math.round(height <= FINE ? height : FINE * (height / Math.max(width, height))));
  const { data: finePixels } = await sharp(buffer)
    .resize(fsw, fsh, { fit: "fill" }).greyscale().raw()
    .toBuffer({ resolveWithObject: true });

  const BAND = 12;
  const fine = detectBoundsDebug(
    finePixels as any, fsw, fsh,
    { minPct: Math.max(0, coarse.left - BAND), maxPct: Math.min(100, coarse.right + BAND) },
    { minPct: Math.max(0, coarse.top - BAND), maxPct: Math.min(100, coarse.bottom + BAND) }
  );

  const cardW = (fine.right - fine.left) / 100;
  const cardH = (fine.bottom - fine.top) / 100;
  const cardAreaPct = cardW * cardH * 100;

  const baseName = path.basename(filePath).replace(/_\d+\.(png|jpeg)$/, "");
  const expected = EXPECTED_BOUNDS[baseName];
  let pass = false;
  if (expected) {
    pass = isWithinExpected(fine.left, expected.left) &&
           isWithinExpected(fine.right, expected.right) &&
           isWithinExpected(fine.top, expected.top) &&
           isWithinExpected(fine.bottom, expected.bottom);
  }

  return {
    file: path.basename(filePath),
    dimensions: `${width}x${height}`,
    coarse,
    fine,
    cardAreaPct: +cardAreaPct.toFixed(1),
    pass,
  };
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

  console.log("=== CARD DETECTION TEST SUITE ===\n");

  let passed = 0;
  let total = 0;

  for (const img of testImages) {
    if (!fs.existsSync(img)) { console.log(`SKIP: ${img} not found`); continue; }
    total++;
    try {
      const result = await runTest(img);
      const status = result.pass ? "PASS" : "FAIL";
      if (result.pass) passed++;

      console.log(`${status} | ${result.file} (${result.dimensions})`);
      console.log(`  Coarse: L=${result.coarse.left.toFixed(1)} T=${result.coarse.top.toFixed(1)} R=${result.coarse.right.toFixed(1)} B=${result.coarse.bottom.toFixed(1)} (${result.coarse.vPeakCount}v, ${result.coarse.hPeakCount}h peaks)`);
      console.log(`  Fine:   L=${result.fine.left.toFixed(1)} T=${result.fine.top.toFixed(1)} R=${result.fine.right.toFixed(1)} B=${result.fine.bottom.toFixed(1)} (${result.fine.vPeakCount}v, ${result.fine.hPeakCount}h peaks)`);
      console.log(`  Card area: ${result.cardAreaPct}% | Fine confidence: ${result.fine.confidence.toFixed(3)}`);

      if (result.fine.topCandidates.length > 0) {
        console.log(`  Top candidate breakdown:`);
        const c = result.fine.topCandidates[0];
        console.log(`    ratio=${c.ratio} ratioSc=${c.ratioScore} sizeSc=${c.sizeScore} centerSc=${c.centerScore} edgeSc=${c.edgeNorm} contrastSc=${c.contrastScore} proxPen=${c.proximityPenalty} total=${c.score}`);
        console.log(`    sizeRatio=${c.sizeRatio} (area fill)`);
      }
      if (result.fine.topCandidates.length > 1) {
        console.log(`  Runner-up:`);
        const c = result.fine.topCandidates[1];
        console.log(`    L=${c.left} T=${c.top} R=${c.right} B=${c.bottom} score=${c.score} ratio=${c.ratio} sizeRatio=${c.sizeRatio} contrast=${c.contrastScore}`);
      }
      console.log("");
    } catch (err: any) {
      console.log(`ERROR | ${img}: ${err.message}`);
    }
  }

  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
}

main().catch(console.error);
