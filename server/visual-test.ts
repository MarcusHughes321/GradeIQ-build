import sharp from "sharp";
import fs from "fs";
import path from "path";

const CARD_WH_RATIO = 2.5 / 3.5;
const CARD_WH_RATIO_ROTATED = 3.5 / 2.5;
const RATIO_TOLERANCE = 0.12;

function detectCardRegionByVariance(
  pixels: Buffer, sw: number, sh: number
): { leftPct: number; rightPct: number; topPct: number; bottomPct: number } | null {
  const getPixel = (x: number, y: number) => {
    if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
    return pixels[y * sw + x];
  };
  const colVariance = new Float64Array(sw);
  const rowSampleStep = Math.max(1, Math.floor(sh / 40));
  for (let x = 0; x < sw; x++) {
    const vals: number[] = [];
    for (let y = 0; y < sh; y += rowSampleStep) vals.push(getPixel(x, y));
    if (vals.length < 3) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    colVariance[x] = vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
  }
  const rowVariance = new Float64Array(sh);
  const colSampleStep = Math.max(1, Math.floor(sw / 40));
  for (let y = 0; y < sh; y++) {
    const vals: number[] = [];
    for (let x = 0; x < sw; x += colSampleStep) vals.push(getPixel(x, y));
    if (vals.length < 3) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    rowVariance[y] = vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
  }
  const smoothVariance = (profile: Float64Array, radius: number): Float64Array => {
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
  const smoothCol = smoothVariance(colVariance, Math.max(1, Math.round(sw * 0.02)));
  const smoothRow = smoothVariance(rowVariance, Math.max(1, Math.round(sh * 0.02)));
  let maxColVar = 0;
  for (let i = 0; i < sw; i++) if (smoothCol[i] > maxColVar) maxColVar = smoothCol[i];
  let maxRowVar = 0;
  for (let i = 0; i < sh; i++) if (smoothRow[i] > maxRowVar) maxRowVar = smoothRow[i];
  if (maxColVar === 0 && maxRowVar === 0) return null;
  const colThreshold = maxColVar * 0.15;
  const rowThreshold = maxRowVar * 0.15;
  let leftVar = 0, rightVar = sw - 1, topVar = 0, bottomVar = sh - 1;
  for (let x = 0; x < sw; x++) { if (smoothCol[x] >= colThreshold) { leftVar = x; break; } }
  for (let x = sw - 1; x >= 0; x--) { if (smoothCol[x] >= colThreshold) { rightVar = x; break; } }
  for (let y = 0; y < sh; y++) { if (smoothRow[y] >= rowThreshold) { topVar = y; break; } }
  for (let y = sh - 1; y >= 0; y--) { if (smoothRow[y] >= rowThreshold) { bottomVar = y; break; } }
  return {
    leftPct: (leftVar / sw) * 100, rightPct: (rightVar / sw) * 100,
    topPct: (topVar / sh) * 100, bottomPct: (bottomVar / sh) * 100,
  };
}

function detectBoundsAtResolution(
  pixels: Buffer, sw: number, sh: number,
  xConstraint?: { minPct: number; maxPct: number },
  yConstraint?: { minPct: number; maxPct: number }
): { leftPct: number; rightPct: number; topPct: number; bottomPct: number; confidence: number } {
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
    for (let i = cMin; i <= cMax; i++) if (profile[i] > maxVal) maxVal = profile[i];
    if (maxVal === 0) return [];
    const threshold = maxVal * 0.08;
    const rawPeaks: { pos: number; strength: number }[] = [];
    for (let i = cMin + 1; i < cMax; i++) {
      if (profile[i] >= threshold && profile[i] >= profile[i - 1] && profile[i] >= profile[i + 1]) {
        rawPeaks.push({ pos: i, strength: profile[i] });
      }
    }
    if (profile[cMin] >= threshold && profile[cMin] >= profile[cMin + 1]) rawPeaks.push({ pos: cMin, strength: profile[cMin] });
    if (profile[cMax] >= threshold && profile[cMax] >= profile[cMax - 1]) rawPeaks.push({ pos: cMax, strength: profile[cMax] });
    rawPeaks.sort((a, b) => b.strength - a.strength);
    const selected: typeof rawPeaks = [];
    for (const p of rawPeaks) {
      if (!selected.some(s => Math.abs(s.pos - p.pos) < minSep)) selected.push(p);
    }
    return selected.slice(0, 20);
  };

  const xCMin = xConstraint ? Math.max(2, Math.round(sw * xConstraint.minPct / 100)) : 2;
  const xCMax = xConstraint ? Math.min(sw - 3, Math.round(sw * xConstraint.maxPct / 100)) : sw - 3;
  const yCMin = yConstraint ? Math.max(2, Math.round(sh * yConstraint.minPct / 100)) : 2;
  const yCMax = yConstraint ? Math.min(sh - 3, Math.round(sh * yConstraint.maxPct / 100)) : sh - 3;

  const vPeaks = findPeaks(vSmooth, Math.max(2, Math.round(sw * 0.03)), xCMin, xCMax);
  const hPeaks = findPeaks(hSmooth, Math.max(2, Math.round(sh * 0.03)), yCMin, yCMax);

  let best: { left: number; right: number; top: number; bottom: number; score: number } | null = null;

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

  const sampleVariance = (x1: number, y1: number, x2: number, y2: number, isVert: boolean): number => {
    const values: number[] = [];
    const len = isVert ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
    const steps = Math.max(5, Math.min(30, Math.abs(len)));
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const sx = isVert ? Math.round(x1) : Math.round(x1 + (x2 - x1) * t);
      const sy = isVert ? Math.round(y1 + (y2 - y1) * t) : Math.round(y1);
      if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) values.push(getPixel(sx, sy));
    }
    if (values.length < 3) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length);
  };

  for (let li = 0; li < vPeaks.length; li++) {
    for (let ri = 0; ri < vPeaks.length; ri++) {
      if (li === ri) continue;
      const lp = vPeaks[li]; const rp = vPeaks[ri];
      if (rp.pos <= lp.pos) continue;
      const cardW = rp.pos - lp.pos;
      if (cardW < sw * 0.2) continue;

      const ratiosToTry = [CARD_WH_RATIO, CARD_WH_RATIO_ROTATED];
      for (const targetRatio of ratiosToTry) {
        const expectedH = cardW / targetRatio;
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
            const ratioError = Math.abs(ratio - targetRatio) / targetRatio;
            if (ratioError > RATIO_TOLERANCE * 2) return;
            const ratioScore = Math.max(0, 1 - ratioError / RATIO_TOLERANCE);
            const sizeRatio = (cardW * cardH) / (sw * sh);
            let sizeScore: number;
            if (sizeRatio > 0.85) sizeScore = Math.max(0, 1 - (sizeRatio - 0.85) * 5);
            else sizeScore = Math.min(1, sizeRatio / 0.60);
            const maxEdge = Math.max(lp.strength, rp.strength, tp.strength, botStr, 1);
            const edgeNorm = (lp.strength + rp.strength + tp.strength + botStr) / (4 * maxEdge);
            const margin = Math.max(sw, sh) * 0.03;
            let proximityPenalty = 1.0;
            if (lp.pos < margin) proximityPenalty *= 0.5;
            if (rp.pos > sw - margin) proximityPenalty *= 0.5;
            if (tp.pos < margin) proximityPenalty *= 0.5;
            if (botPos > sh - margin) proximityPenalty *= 0.5;
            const sampleBand = Math.max(2, Math.round(cardW * 0.05));
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
            const minContrast = Math.min(leftContrast, rightContrast, topContrast, botContrast);
            const avgContrast = (leftContrast + rightContrast + topContrast + botContrast) / 4;
            const normalizedContrast = Math.min(1, avgContrast / 80);
            const minContrastScore = Math.min(1, minContrast / 30);
            const extBand = Math.max(3, Math.round(Math.min(cardW, cardH) * 0.15));
            const topExtVar = sampleVariance(midX - bandW, Math.max(0, tp.pos - extBand * 2), midX + bandW, Math.max(0, tp.pos - extBand), false);
            const botExtVar = sampleVariance(midX - bandW, Math.min(sh - 1, botPos + extBand), midX + bandW, Math.min(sh - 1, botPos + extBand * 2), false);
            const leftExtVar = sampleVariance(Math.max(0, lp.pos - extBand * 2), midY - bandH, Math.max(0, lp.pos - extBand), midY + bandH, true);
            const rightExtVar = sampleVariance(Math.min(sw - 1, rp.pos + extBand), midY - bandH, Math.min(sw - 1, rp.pos + extBand * 2), midY + bandH, true);
            const avgExtVar = (topExtVar + botExtVar + leftExtVar + rightExtVar) / 4;
            const exteriorUniformity = 1 / (1 + avgExtVar / 15);
            const rotatedPenalty = targetRatio === CARD_WH_RATIO ? 1.0 : 0.85;
            const totalScore = (ratioScore * 4.0 + sizeScore * 3.0 + edgeNorm * 1.0 + normalizedContrast * 2.5 + minContrastScore * 1.5 + exteriorUniformity * 4.0) * proximityPenalty * rotatedPenalty;
            if (!best || totalScore > best.score) {
              best = { left: lp.pos, right: rp.pos, top: tp.pos, bottom: botPos, score: totalScore };
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
  }

  const fallback = { left: Math.round(sw * 0.1), right: Math.round(sw * 0.9), top: Math.round(sh * 0.1), bottom: Math.round(sh * 0.9), score: -1 };
  const result = best || fallback;

  const refineEdge = (
    edgePos: number, isVertical: boolean, isMinEdge: boolean,
    crossStart: number, crossEnd: number,
    searchRadius: number
  ): number => {
    const numSamples = 25;
    const outerBand = Math.max(3, Math.round(searchRadius * 0.4));
    const refinedPositions: number[] = [];
    const dim = isVertical ? sw : sh;
    for (let i = 0; i < numSamples; i++) {
      const t = (i + 0.5) / numSamples;
      const crossPos = Math.round(crossStart + (crossEnd - crossStart) * t);
      let bestScore = -1;
      let bestPos = edgePos;
      const scanMin = Math.max(outerBand + 1, edgePos - searchRadius);
      const scanMax = Math.min(dim - outerBand - 2, edgePos + searchRadius);
      for (let pos = scanMin; pos <= scanMax; pos++) {
        let outsideSum = 0, insideSum = 0, outsideSqSum = 0;
        for (let k = 1; k <= outerBand; k++) {
          let outPixel: number, inPixel: number;
          if (isVertical) {
            if (isMinEdge) { outPixel = getPixel(pos - k, crossPos); inPixel = getPixel(pos + k, crossPos); }
            else { outPixel = getPixel(pos + k, crossPos); inPixel = getPixel(pos - k, crossPos); }
          } else {
            if (isMinEdge) { outPixel = getPixel(crossPos, pos - k); inPixel = getPixel(crossPos, pos + k); }
            else { outPixel = getPixel(crossPos, pos + k); inPixel = getPixel(crossPos, pos - k); }
          }
          outsideSum += outPixel; insideSum += inPixel; outsideSqSum += outPixel * outPixel;
        }
        const outsideAvg = outsideSum / outerBand;
        const insideAvg = insideSum / outerBand;
        const gradient = Math.abs(insideAvg - outsideAvg);
        const outsideVariance = (outsideSqSum / outerBand) - (outsideAvg * outsideAvg);
        const outsideUniformity = 1 / (1 + Math.max(0, outsideVariance) / 200);
        const distFromOriginal = Math.abs(pos - edgePos) / searchRadius;
        const proximityBonus = 1 / (1 + distFromOriginal * distFromOriginal);
        const score = gradient * outsideUniformity * proximityBonus;
        if (score > bestScore) { bestScore = score; bestPos = pos; }
      }
      refinedPositions.push(bestPos);
    }
    refinedPositions.sort((a, b) => a - b);
    const q1 = Math.floor(refinedPositions.length * 0.25);
    const q3 = Math.floor(refinedPositions.length * 0.75);
    const iqrPositions = refinedPositions.slice(q1, q3 + 1);
    return iqrPositions[Math.floor(iqrPositions.length / 2)];
  };

  const cardW = result.right - result.left;
  const cardH = result.bottom - result.top;
  const refineRadius = Math.max(4, Math.round(Math.min(cardW, cardH) * 0.15));
  const refinedLeft = refineEdge(result.left, true, true, result.top, result.bottom, refineRadius);
  const refinedRight = refineEdge(result.right, true, false, result.top, result.bottom, refineRadius);
  const refinedTop = refineEdge(result.top, false, true, result.left, result.right, refineRadius);
  const refinedBottom = refineEdge(result.bottom, false, false, result.left, result.right, refineRadius);

  return {
    leftPct: (refinedLeft / sw) * 100,
    rightPct: (refinedRight / sw) * 100,
    topPct: (refinedTop / sh) * 100,
    bottomPct: (refinedBottom / sh) * 100,
    confidence: result.score,
  };
}

async function detectAndDraw(imagePath: string, outputPath: string): Promise<void> {
  const buffer = fs.readFileSync(imagePath);
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;

  const COARSE = 200;
  const csw = Math.max(20, Math.round(width <= COARSE ? width : COARSE * (width / Math.max(width, height))));
  const csh = Math.max(20, Math.round(height <= COARSE ? height : COARSE * (height / Math.max(width, height))));
  const { data: coarsePixels } = await sharp(buffer).resize(csw, csh, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const varianceHint = detectCardRegionByVariance(coarsePixels as any, csw, csh);
  const coarse = detectBoundsAtResolution(coarsePixels as any, csw, csh);

  let unionLeft = coarse.leftPct, unionRight = coarse.rightPct, unionTop = coarse.topPct, unionBottom = coarse.bottomPct;
  if (varianceHint) {
    unionLeft = Math.min(unionLeft, varianceHint.leftPct);
    unionRight = Math.max(unionRight, varianceHint.rightPct);
    unionTop = Math.min(unionTop, varianceHint.topPct);
    unionBottom = Math.max(unionBottom, varianceHint.bottomPct);
  }

  const FINE = 1000;
  const fsw = Math.max(40, Math.round(width <= FINE ? width : FINE * (width / Math.max(width, height))));
  const fsh = Math.max(40, Math.round(height <= FINE ? height : FINE * (height / Math.max(width, height))));
  const { data: finePixels } = await sharp(buffer).resize(fsw, fsh, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });

  const BAND = 15;
  const fine = detectBoundsAtResolution(
    finePixels as any, fsw, fsh,
    { minPct: Math.max(0, unionLeft - BAND), maxPct: Math.min(100, unionRight + BAND) },
    { minPct: Math.max(0, unionTop - BAND), maxPct: Math.min(100, unionBottom + BAND) }
  );

  const leftPx = Math.round(fine.leftPct / 100 * width);
  const rightPx = Math.round(fine.rightPct / 100 * width);
  const topPx = Math.round(fine.topPct / 100 * height);
  const bottomPx = Math.round(fine.bottomPct / 100 * height);

  const lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.003));

  const svgLines = `
    <svg width="${width}" height="${height}">
      <rect x="${leftPx}" y="0" width="${lineWidth}" height="${height}" fill="red" opacity="0.9"/>
      <rect x="${rightPx - lineWidth}" y="0" width="${lineWidth}" height="${height}" fill="blue" opacity="0.9"/>
      <rect x="0" y="${topPx}" width="${width}" height="${lineWidth}" fill="lime" opacity="0.9"/>
      <rect x="0" y="${bottomPx - lineWidth}" width="${width}" height="${lineWidth}" fill="lime" opacity="0.9"/>
    </svg>`;

  await sharp(buffer)
    .composite([{ input: Buffer.from(svgLines), top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  console.log(`${path.basename(imagePath)} -> ${outputPath}`);
  console.log(`  Detected: L=${fine.leftPct.toFixed(1)}% T=${fine.topPct.toFixed(1)}% R=${fine.rightPct.toFixed(1)}% B=${fine.bottomPct.toFixed(1)}%`);
  console.log(`  Pixels:   L=${leftPx} T=${topPx} R=${rightPx} B=${bottomPx} (${width}x${height})`);
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
  ];

  const outDir = "/tmp/visual-test";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const img of testImages) {
    if (!fs.existsSync(img)) { console.log(`SKIP: ${img}`); continue; }
    const baseName = path.basename(img).replace(/\.[^.]+$/, "");
    await detectAndDraw(img, path.join(outDir, `${baseName}_result.jpg`));
  }
}

main().catch(console.error);
