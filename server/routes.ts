import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const GRADING_SYSTEM_PROMPT = `You are an expert Pokemon card grading analyst with deep knowledge of card grading standards from PSA, Beckett (BGS), and Ace Grading. You will analyze images of a Pokemon card (front and back) and provide estimated grades based on each company's published grading criteria.

IMPORTANT GRADING SCALE RULES - YOU MUST FOLLOW THESE EXACTLY:

**PSA (Professional Sports Authenticator) - Scale 1-10:**
- PSA uses HALF GRADES from 1.5 to 8.5 (e.g., 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10)
- There is NO PSA 9.5. The top grades are PSA 9 (Mint) and PSA 10 (Gem Mint) ONLY.
- PSA does NOT provide individual sub-grades, only an overall grade with text descriptions per category.
- Centering: Front 55/45-60/40 for PSA 10, 65/35 for PSA 9, 70/30 for PSA 8, 75/25 for PSA 7
- Corners: Must be sharp and clean for high grades
- Edges: Should be clean and smooth
- Surface: No scratches, print lines, staining for PSA 10

**Beckett (BGS) - Scale 1-10 with HALF-GRADE sub-grades:**
- BGS uses 0.5 increments for BOTH overall grade AND all sub-grades (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10)
- Overall grade is calculated from sub-grades
- Centering: 50/50 to 55/45 for 10, 55/45 to 60/40 for 9.5, 60/40 to 65/35 for 9
- Corners: Inspected under magnification. Must be razor sharp for 10
- Edges: Checked for chipping, rough cuts. Must be smooth for 10
- Surface: Examined for print dots, scratches, glazing. Must be flawless for 10

**Ace Grading (UK) - Scale 1-10, WHOLE NUMBERS ONLY:**
- Ace uses ONLY whole numbers (1, 2, 3, 4, 5, 6, 7, 8, 9, 10). NO HALF GRADES like 8.5 or 9.5.
- Both the overall grade and ALL sub-grades MUST be whole numbers.
- 10 = Gem Mint, 9 = Mint, 8 = Near Mint-Mint, 7 = Near Mint, 6 = Excellent, etc.
- Centering: 60/40 or better for 10
- Corners: Must be sharp with no visible wear for high grades
- Edges: Clean and consistent cuts required
- Surface: Free from scratches and defects

Analyze the card images carefully. Look for:
1. Centering - Measure how well centered the image is on both front and back. Provide the centering as a percentage for the LARGER side (e.g., if left border is slightly wider, frontLeftRight = 53 means 53/47). Values should be between 50 (perfect) and 80+ (severely off-center). Measure left-right and top-bottom separately for both front and back.
2. Corners - check all four corners for whitening, dings, or damage. Minor imperfections only visible under magnification should not significantly lower grades.
3. Edges - look for whitening, chipping, or rough cuts along all edges. Factory-level minor edge variation is acceptable for high grades.
4. Surface - check for scratches, print lines, staining, ink issues, or other surface defects. Minor factory print texture or very faint print lines common to modern Pokemon cards should not lower surface grades below 9.

LANGUAGE HANDLING:
- Pokemon cards exist in MANY languages: English, Japanese, Korean, Chinese, French, German, Spanish, Italian, Portuguese, etc.
- You MUST identify the card regardless of what language it is printed in.
- ALWAYS respond with the ENGLISH name of the Pokemon, set name, and all text fields, even if the card is in another language.
- For example: a Japanese card showing "リザードンex" should be reported as "Charizard ex" in cardName.
- Use the artwork, card number, set symbol, and your knowledge of Pokemon TCG releases across all languages to identify the card.

CRITICAL FOR CARD IDENTIFICATION — MULTI-STEP VERIFICATION:

Step 1: READ THE POKEMON NAME FROM THE CARD TEXT (do NOT guess from artwork)
- READ the Pokemon name that is PRINTED on the card (in ANY language). Do NOT identify the Pokemon from the artwork alone.
- For JAPANESE cards: READ the katakana/kanji name at the top of the card and translate to English.
  Key translations: コロトック = Kricketune, ゲノセクト = Genesect, リザードン = Charizard, ピカチュウ = Pikachu, ルカリオ = Lucario, ミュウツー = Mewtwo, レックウザ = Rayquaza
- Determine the ENGLISH name of the Pokemon (e.g., Japanese "リザードンex" = "Charizard ex").
- Note any suffix like "ex", "EX", "GX", "V", "VMAX", "VSTAR", etc.

Step 2: READ THE CARD NUMBER AND SET CODE
- The card number is printed at the bottom of the card, usually bottom-left or bottom-right.
- It typically follows the format "XXX/YYY" (e.g., "012/220").
- Japanese cards also have a SET CODE like "s6b", "s12a", "sv1" printed near the card number — READ this too.
- Card numbers can be hard to read due to glare, angle, small font, or holographic effects. Use these strategies:
  * Look for the "/" character that separates card number from set total
  * Japanese cards may use formats like "003/007" or "S1a 003/007" or "sv1 003/007"
  * Some promo cards have formats like "SWSH039" or "SVP 050"
  * If partially obscured, use visible digits + set symbol to narrow it down

Step 3: IDENTIFY THE SET
- Look at the set symbol/logo on the card (usually bottom-right area near the card number)
- Use the SET CODE if visible (e.g., s6b = VMAX Climax, s8b = VMAX Climax, s12a = VSTAR Universe, sv2a = Pokemon Card 151)
- Cross-reference the set symbol with the card number to identify the exact set
- Consider the card's era (vintage WOTC, modern Scarlet & Violet, etc.) based on card design/border style

Step 4: CROSS-REFERENCE AND VERIFY
- This is the MOST IMPORTANT step. You MUST verify that the card number matches the Pokemon:
  * Does this Pokemon actually exist at this card number in the identified set?
  * For example, if you see Pikachu artwork but read card number "006/165" from a set where card 006 is Charizard, you likely misread the number.
  * Common misreads: 0 vs 8, 3 vs 8, 6 vs 9, 1 vs 7. If the number doesn't match the Pokemon, try alternate readings.
  * If the set total (the number after /) doesn't match any known set, reconsider which set it is.
- Use your knowledge of Pokemon TCG card lists to verify: "Is [Pokemon name] actually card #[number] in [set name]?"
- If there's a conflict, trust the Pokemon identity (name + artwork is hard to misread) and adjust the card number to match.
- Only report a card number you are confident is correct. If uncertain, try your best reading but note the uncertainty.

Step 5: FINAL DETERMINATION
- Combine all evidence: Pokemon name + card number + set symbol + artwork style + card design era
- Report the verified cardName, setName, and setNumber in the JSON response.

Respond ONLY with valid JSON in this exact format:
{
  "cardName": "ENGLISH name of the Pokemon card (e.g. 'Charizard ex') - translate if card is in another language",
  "setName": "ENGLISH name of the Pokemon TCG set (e.g. 'Obsidian Flames') - use the international English set name",
  "setNumber": "Card number exactly as printed at the bottom of the card (e.g. '012/220')",
  "overallCondition": "Brief 1-2 sentence summary of the card's overall condition",
  "centering": {
    "frontLeftRight": 52,
    "frontTopBottom": 54,
    "backLeftRight": 55,
    "backTopBottom": 53
  },
  "psa": {
    "grade": 8,
    "centering": "Description of centering assessment",
    "corners": "Description of corners assessment",
    "edges": "Description of edges assessment",
    "surface": "Description of surface assessment",
    "notes": "Any additional notes about PSA-specific grading"
  },
  "beckett": {
    "overallGrade": 8.5,
    "centering": { "grade": 9.0, "notes": "Assessment details" },
    "corners": { "grade": 8.5, "notes": "Assessment details" },
    "edges": { "grade": 8.5, "notes": "Assessment details" },
    "surface": { "grade": 8.5, "notes": "Assessment details" },
    "notes": "Any additional notes about BGS-specific grading"
  },
  "ace": {
    "overallGrade": 8,
    "centering": { "grade": 9, "notes": "Assessment details" },
    "corners": { "grade": 8, "notes": "Assessment details" },
    "edges": { "grade": 8, "notes": "Assessment details" },
    "surface": { "grade": 8, "notes": "Assessment details" },
    "notes": "Any additional notes about Ace-specific grading"
  }
}

CRITICAL REMINDERS:
- PSA grade: valid values are 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10 (NO 9.5)
- BGS grades: use 0.5 increments (7, 7.5, 8, 8.5, 9, 9.5, 10)
- Ace grades: WHOLE NUMBERS ONLY (1-10, never 8.5 or 9.5)

GRADING PHILOSOPHY — START AT 10, DEDUCT FOR FLAWS:
- EVERY sub-grade (centering, corners, edges, surface) starts at 10 (Gem Mint) by default.
- Only lower a grade from 10 if you can identify a SPECIFIC flaw in the photo. Describe the flaw in your notes.
- You are grading from PHONE PHOTOS, not lab-quality scans. Phone cameras can introduce blur, glare, and compression artifacts. Be mindful that some apparent flaws may be photo artifacts rather than real defects, but use your judgement — if a flaw looks genuine, it probably is.
- Deduction guide from the starting point of 10:
  * 10 → 9: A minor but real flaw (e.g., slight whitening on a corner, very minor edge roughness, slight print texture inconsistency)
  * 9 → 8: Multiple minor flaws or one moderate flaw (e.g., whitening on 2+ corners, noticeable edge wear, minor surface scratching)
  * 8 → 7 or below: Clearly obvious damage visible at a glance (significant whitening, creasing, surface scratches, heavy off-center)
- Modern Pokemon cards (2020+) have high print quality. A pack-fresh card with careful handling should score 9s and 10s across most sub-grades. 10s are common for clean cards but a 9 is appropriate when minor imperfections are genuinely present.
- When in doubt between two grades, lean toward the higher grade.
- Do not speculatively lower grades without evidence, but do grade honestly when real flaws are visible.`;

const VALID_PSA_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10];

function roundToNearest(value: number, validValues: number[]): number {
  let closest = validValues[0];
  let minDiff = Math.abs(value - closest);
  for (const v of validValues) {
    const diff = Math.abs(value - v);
    if (diff < minDiff) {
      minDiff = diff;
      closest = v;
    }
  }
  return closest;
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function roundToWhole(value: number): number {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stripSuffix(name: string): string {
  return name.replace(/\s*(ex|EX|gx|GX|v|V|vmax|VMAX|vstar|VSTAR|☆)\s*$/i, "").trim();
}

function formatSetNumber(num: string | number, total: string | number): string {
  const n = String(num);
  const t = String(total);
  if (t && parseInt(t) > 0) {
    const padLen = Math.max(3, t.length);
    return `${n.padStart(padLen, "0")}/${t.padStart(padLen, "0")}`;
  }
  return n;
}

async function queryPokemonTcgApi(q: string): Promise<any[]> {
  try {
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=15&select=name,set,number`;
    console.log(`[card-lookup] Querying: ${q}`);
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.log(`[card-lookup] API returned ${resp.status}`);
      return [];
    }
    const data = await resp.json() as any;
    return data?.data || [];
  } catch (e: any) {
    console.log(`[card-lookup] Query failed: ${e?.message}`);
    return [];
  }
}

function scoreName(apiName: string, aiName: string): number {
  const a = apiName.toLowerCase();
  const b = aiName.toLowerCase();
  if (a === b) return 100;
  const aBase = stripSuffix(a);
  const bBase = stripSuffix(b);
  const aSuffix = a.replace(aBase, "").trim();
  const bSuffix = b.replace(bBase, "").trim();
  const suffixMatch = aSuffix === bSuffix;
  if (aBase === bBase && suffixMatch) return 100;
  if (aBase === bBase) return 75;
  if (a.includes(bBase) || bBase.includes(aBase)) return suffixMatch ? 65 : 50;
  const aWords = aBase.split(/\s+/);
  const bWords = bBase.split(/\s+/);
  const overlap = aWords.filter(w => bWords.includes(w)).length;
  if (overlap > 0) return 20 + (overlap / Math.max(aWords.length, bWords.length)) * 30;
  return 0;
}

async function lookupCardOnline(cardName: string, setNumber: string, setName: string, setCode?: string): Promise<{ cardName: string; setName: string; setNumber: string } | null> {
  try {
    const rawNumber = setNumber?.split("/")[0]?.replace(/^0+/, "") || "";
    const setTotal = setNumber?.split("/")[1]?.replace(/^0+/, "") || "";
    const baseName = stripSuffix(cardName);

    console.log(`[card-lookup] Looking up: name="${cardName}" number="${rawNumber}" total="${setTotal}" set="${setName}" code="${setCode || "none"}"`);

    const queries: string[] = [];

    if (setCode && rawNumber) {
      queries.push(`set.id:"${setCode}*" number:${rawNumber}`);
      queries.push(`set.ptcgoCode:"${setCode}*" number:${rawNumber}`);
    }
    if (rawNumber && baseName) {
      queries.push(`number:${rawNumber} name:"${baseName}*"`);
    }
    if (rawNumber && setTotal) {
      queries.push(`number:${rawNumber} set.printedTotal:${setTotal}`);
    }
    if (rawNumber && setName) {
      queries.push(`number:${rawNumber} set.name:"${setName}"`);
      queries.push(`number:${rawNumber} set.name:"${setName}*"`);
    }
    if (baseName && setName) {
      queries.push(`name:"${baseName}*" set.name:"${setName}"`);
      queries.push(`name:"${baseName}*" set.name:"${setName}*"`);
    }
    if (baseName) {
      queries.push(`name:"${baseName}"`);
    }

    let allCards: any[] = [];
    const seenIds = new Set<string>();

    for (const q of queries) {
      const cards = await queryPokemonTcgApi(q);
      for (const c of cards) {
        const id = c.id || `${c.name}-${c.number}-${c.set?.name}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          allCards.push(c);
        }
      }
      if (allCards.length >= 5) break;
    }

    if (allCards.length === 0) {
      console.log(`[card-lookup] No results from API`);
      return null;
    }

    let bestCard = allCards[0];
    let bestScore = -1;

    for (const card of allCards) {
      let score = scoreName(card.name || "", cardName);

      const cardNum = String(card.number || "").replace(/^0+/, "");
      if (cardNum === rawNumber) score += 40;

      const cardSetName = (card.set?.name || "").toLowerCase();
      const querySetName = (setName || "").toLowerCase();
      if (querySetName && cardSetName === querySetName) {
        score += 25;
      } else if (querySetName && cardSetName.includes(querySetName)) {
        score += 10;
      }

      const cardTotal = String(card.set?.printedTotal || "");
      if (setTotal) {
        if (cardTotal === setTotal) {
          score += 30;
        } else {
          score -= 80;
        }
      }

      console.log(`[card-lookup]   Candidate: ${card.name} #${card.number} (${card.set?.name}, total=${cardTotal}) score=${score}`);

      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    if (bestScore < 80) {
      console.log(`[card-lookup] Best score too low (${bestScore}), rejecting — trusting AI identification`);
      return null;
    }

    const verifiedNumber = bestCard.number || rawNumber;
    const verifiedTotal = bestCard.set?.printedTotal || setTotal;
    const verifiedSetNumber = formatSetNumber(verifiedNumber, verifiedTotal);

    console.log(`[card-lookup] Best match: ${bestCard.name} - ${bestCard.set?.name} (${verifiedSetNumber}) score=${bestScore}`);
    return {
      cardName: bestCard.name || cardName,
      setName: bestCard.set?.name || setName,
      setNumber: verifiedSetNumber,
    };
  } catch (err: any) {
    console.log(`[card-lookup] Lookup failed:`, err?.message);
    return null;
  }
}

async function detectCardBounds(dataUri: string): Promise<{ leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number }> {
  try {
    const base64Data = dataUri.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const { width, height } = await sharp(buffer).metadata() as { width: number; height: number };
    if (!width || !height) throw new Error("Could not get image dimensions");

    const SAMPLE_SIZE = 400;
    const scaleW = Math.min(1, SAMPLE_SIZE / width);
    const scaleH = Math.min(1, SAMPLE_SIZE / height);
    const sw = Math.round(width * scaleW);
    const sh = Math.round(height * scaleH);

    const { data: pixels } = await sharp(buffer)
      .resize(sw, sh, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const getPixel = (x: number, y: number) => {
      if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
      return pixels[y * sw + x];
    };

    const sobelX = (x: number, y: number): number => {
      return (
        -getPixel(x - 1, y - 1) + getPixel(x + 1, y - 1) +
        -2 * getPixel(x - 1, y) + 2 * getPixel(x + 1, y) +
        -getPixel(x - 1, y + 1) + getPixel(x + 1, y + 1)
      );
    };

    const sobelY = (x: number, y: number): number => {
      return (
        -getPixel(x - 1, y - 1) - 2 * getPixel(x, y - 1) - getPixel(x + 1, y - 1) +
        getPixel(x - 1, y + 1) + 2 * getPixel(x, y + 1) + getPixel(x + 1, y + 1)
      );
    };

    const SCAN_RANGE = 0.4;
    const EDGE_THRESHOLD = 25;
    const MIN_VOTE_RATIO = 0.15;

    const findEdgeColumn = (startX: number, endX: number, step: number): number => {
      const scanYStart = Math.round(sh * 0.1);
      const scanYEnd = Math.round(sh * 0.9);
      const totalScanRows = Math.floor((scanYEnd - scanYStart) / 1);
      const minVotes = Math.max(3, Math.round(totalScanRows * MIN_VOTE_RATIO));

      const columns: { x: number; score: number; votes: number }[] = [];

      for (let x = startX; step > 0 ? x < endX : x > endX; x += step) {
        let votes = 0;
        let totalGrad = 0;
        for (let y = scanYStart; y < scanYEnd; y += 1) {
          const gx = Math.abs(sobelX(x, y));
          if (gx >= EDGE_THRESHOLD) {
            votes++;
            totalGrad += gx;
          }
        }
        if (votes >= minVotes) {
          columns.push({ x, score: totalGrad, votes });
        }
      }

      if (columns.length === 0) return startX;

      columns.sort((a, b) => b.score - a.score);
      const topN = columns.slice(0, Math.max(1, Math.ceil(columns.length * 0.1)));

      if (step > 0) {
        topN.sort((a, b) => a.x - b.x);
      } else {
        topN.sort((a, b) => b.x - a.x);
      }

      let cluster: number[] = [topN[0].x];
      for (let i = 1; i < topN.length; i++) {
        if (Math.abs(topN[i].x - topN[0].x) <= 3) {
          cluster.push(topN[i].x);
        }
      }

      const avgX = cluster.reduce((s, v) => s + v, 0) / cluster.length;
      return avgX;
    };

    const findEdgeRow = (startY: number, endY: number, step: number): number => {
      const scanXStart = Math.round(sw * 0.1);
      const scanXEnd = Math.round(sw * 0.9);
      const totalScanCols = Math.floor((scanXEnd - scanXStart) / 1);
      const minVotes = Math.max(3, Math.round(totalScanCols * MIN_VOTE_RATIO));

      const rows: { y: number; score: number; votes: number }[] = [];

      for (let y = startY; step > 0 ? y < endY : y > endY; y += step) {
        let votes = 0;
        let totalGrad = 0;
        for (let x = scanXStart; x < scanXEnd; x += 1) {
          const gy = Math.abs(sobelY(x, y));
          if (gy >= EDGE_THRESHOLD) {
            votes++;
            totalGrad += gy;
          }
        }
        if (votes >= minVotes) {
          rows.push({ y, score: totalGrad, votes });
        }
      }

      if (rows.length === 0) return startY;

      rows.sort((a, b) => b.score - a.score);
      const topN = rows.slice(0, Math.max(1, Math.ceil(rows.length * 0.1)));

      if (step > 0) {
        topN.sort((a, b) => a.y - b.y);
      } else {
        topN.sort((a, b) => b.y - a.y);
      }

      let cluster: number[] = [topN[0].y];
      for (let i = 1; i < topN.length; i++) {
        if (Math.abs(topN[i].y - topN[0].y) <= 3) {
          cluster.push(topN[i].y);
        }
      }

      const avgY = cluster.reduce((s, v) => s + v, 0) / cluster.length;
      return avgY;
    };

    const leftCol = findEdgeColumn(1, Math.round(sw * SCAN_RANGE), 1);
    const rightCol = findEdgeColumn(sw - 2, Math.round(sw * (1 - SCAN_RANGE)), -1);
    const topRow = findEdgeRow(1, Math.round(sh * SCAN_RANGE), 1);
    const bottomRow = findEdgeRow(sh - 2, Math.round(sh * (1 - SCAN_RANGE)), -1);

    const leftPercent = (leftCol / sw) * 100;
    const rightPercent = (rightCol / sw) * 100;
    const topPercent = (topRow / sh) * 100;
    const bottomPercent = (bottomRow / sh) * 100;

    if (rightPercent - leftPercent < 30 || bottomPercent - topPercent < 30) {
      return { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98 };
    }

    return {
      leftPercent: parseFloat(clamp(leftPercent, 0, 45).toFixed(1)),
      topPercent: parseFloat(clamp(topPercent, 0, 45).toFixed(1)),
      rightPercent: parseFloat(clamp(rightPercent, 55, 100).toFixed(1)),
      bottomPercent: parseFloat(clamp(bottomPercent, 55, 100).toFixed(1)),
    };
  } catch (err) {
    console.error("Card bounds detection failed:", err);
    return { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98 };
  }
}

function enforceCardBounds(bounds: any): any {
  if (!bounds) return { leftPercent: 4, topPercent: 3, rightPercent: 96, bottomPercent: 97 };
  return {
    leftPercent: parseFloat(clamp(bounds.leftPercent ?? 5, 1, 45).toFixed(1)),
    topPercent: parseFloat(clamp(bounds.topPercent ?? 3, 1, 45).toFixed(1)),
    rightPercent: parseFloat(clamp(bounds.rightPercent ?? 95, 55, 99).toFixed(1)),
    bottomPercent: parseFloat(clamp(bounds.bottomPercent ?? 97, 55, 99).toFixed(1)),
  };
}

function computeCenteringGrades(centering: any) {
  const frontWorst = Math.max(centering.frontLeftRight, centering.frontTopBottom);
  const backWorst = Math.max(centering.backLeftRight, centering.backTopBottom);

  let psaCentering: number;
  if (frontWorst <= 55 && backWorst <= 75) psaCentering = 10;
  else if (frontWorst <= 60 && backWorst <= 75) psaCentering = 9;
  else if (frontWorst <= 65 && backWorst <= 90) psaCentering = 8;
  else if (frontWorst <= 70 && backWorst <= 90) psaCentering = 7;
  else psaCentering = 6;

  let bgsCentering: number;
  if (frontWorst <= 50 && backWorst <= 50) bgsCentering = 10;
  else if (frontWorst <= 55 && backWorst <= 55) bgsCentering = 9.5;
  else if (frontWorst <= 60 && backWorst <= 60) bgsCentering = 9;
  else if (frontWorst <= 65 && backWorst <= 65) bgsCentering = 8.5;
  else if (frontWorst <= 70 && backWorst <= 70) bgsCentering = 8;
  else bgsCentering = 7;

  let aceCentering: number;
  if (frontWorst <= 60 && backWorst <= 60) aceCentering = 10;
  else if (frontWorst <= 65 && backWorst <= 65) aceCentering = 9;
  else if (frontWorst <= 70 && backWorst <= 70) aceCentering = 8;
  else aceCentering = 7;

  return { psaCentering, bgsCentering, aceCentering };
}

function syncCenteringToGrades(result: any): any {
  if (!result.centering) return result;

  const { psaCentering, bgsCentering, aceCentering } = computeCenteringGrades(result.centering);
  const centeringNote = `Front: ${result.centering.frontLeftRight}/${100 - result.centering.frontLeftRight} LR, ${result.centering.frontTopBottom}/${100 - result.centering.frontTopBottom} TB. Back: ${result.centering.backLeftRight}/${100 - result.centering.backLeftRight} LR, ${result.centering.backTopBottom}/${100 - result.centering.backTopBottom} TB.`;

  if (result.psa) {
    result.psa.centeringGrade = psaCentering;
    const minOtherBgs = Math.min(
      result.beckett?.corners?.grade ?? 10,
      result.beckett?.edges?.grade ?? 10,
      result.beckett?.surface?.grade ?? 10
    );
    let psaNonCenteringMax: number;
    if (minOtherBgs >= 9.5) psaNonCenteringMax = 10;
    else if (minOtherBgs >= 8.5) psaNonCenteringMax = 9;
    else if (minOtherBgs >= 7.5) psaNonCenteringMax = 8;
    else if (minOtherBgs >= 6.5) psaNonCenteringMax = 7;
    else if (minOtherBgs >= 5.5) psaNonCenteringMax = 6;
    else psaNonCenteringMax = Math.max(1, Math.round(minOtherBgs));
    result.psa.grade = roundToNearest(Math.min(psaCentering, psaNonCenteringMax), VALID_PSA_GRADES);
    result.psa.centering = centeringNote;
  }

  if (result.beckett) {
    result.beckett.centering.grade = bgsCentering;
    result.beckett.centering.notes = centeringNote;
    const avg = (bgsCentering + result.beckett.corners.grade + result.beckett.edges.grade + result.beckett.surface.grade) / 4;
    result.beckett.overallGrade = roundToHalf(avg);
  }

  if (result.ace) {
    result.ace.centering.grade = aceCentering;
    result.ace.centering.notes = centeringNote;
    const aceGrades = [aceCentering, result.ace.corners.grade, result.ace.edges.grade, result.ace.surface.grade];
    const count10 = aceGrades.filter(g => g === 10).length;
    const count9 = aceGrades.filter(g => g === 9).length;
    if (count10 >= 3 && count9 >= 1 && aceCentering === 10) {
      result.ace.overallGrade = 10;
    } else {
      const avg = aceGrades.reduce((a, b) => a + b, 0) / 4;
      result.ace.overallGrade = roundToWhole(avg);
    }
  }

  return result;
}

function enforceGradingScales(result: any): any {
  if (result.centering) {
    result.centering.frontLeftRight = clamp(Math.round(result.centering.frontLeftRight || 50), 50, 95);
    result.centering.frontTopBottom = clamp(Math.round(result.centering.frontTopBottom || 50), 50, 95);
    result.centering.backLeftRight = clamp(Math.round(result.centering.backLeftRight || 50), 50, 95);
    result.centering.backTopBottom = clamp(Math.round(result.centering.backTopBottom || 50), 50, 95);
  } else {
    result.centering = { frontLeftRight: 50, frontTopBottom: 50, backLeftRight: 50, backTopBottom: 50 };
  }

  result.frontCardBounds = enforceCardBounds(result.frontCardBounds);
  result.backCardBounds = enforceCardBounds(result.backCardBounds);

  if (result.psa) {
    result.psa.grade = roundToNearest(clamp(result.psa.grade, 1, 10), VALID_PSA_GRADES);
  }

  if (result.beckett) {
    result.beckett.overallGrade = roundToHalf(clamp(result.beckett.overallGrade, 1, 10));
    for (const key of ["centering", "corners", "edges", "surface"]) {
      if (result.beckett[key]?.grade !== undefined) {
        result.beckett[key].grade = roundToHalf(clamp(result.beckett[key].grade, 1, 10));
      }
    }
  }

  if (result.ace) {
    result.ace.overallGrade = roundToWhole(clamp(result.ace.overallGrade, 1, 10));
    for (const key of ["centering", "corners", "edges", "surface"]) {
      if (result.ace[key]?.grade !== undefined) {
        result.ace[key].grade = roundToWhole(clamp(result.ace[key].grade, 1, 10));
      }
    }
  }

  return result;
}

async function cropCardRegions(imageDataUrl: string): Promise<{ topStrip: string; bottomStrip: string }> {
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  const metadata = await sharp(buffer).metadata();
  const w = metadata.width || 1000;
  const h = metadata.height || 1400;

  const topH = Math.round(h * 0.18);
  const bottomH = Math.round(h * 0.18);

  const [topBuf, bottomBuf] = await Promise.all([
    sharp(buffer).extract({ left: 0, top: 0, width: w, height: topH }).jpeg({ quality: 95 }).toBuffer(),
    sharp(buffer).extract({ left: 0, top: h - bottomH, width: w, height: bottomH }).jpeg({ quality: 95 }).toBuffer(),
  ]);

  return {
    topStrip: `data:image/jpeg;base64,${topBuf.toString("base64")}`,
    bottomStrip: `data:image/jpeg;base64,${bottomBuf.toString("base64")}`,
  };
}

async function identifyCard(frontImageUrl: string): Promise<{ cardName: string; setName: string; setNumber: string; setCode?: string } | null> {
  try {
    console.log(`[card-id] Cropping card regions for focused text reading...`);
    const { topStrip, bottomStrip } = await cropCardRegions(frontImageUrl);

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are an OCR specialist. You will receive two cropped strips from a Pokemon trading card:
1. The TOP strip — contains the Pokemon name
2. The BOTTOM strip — contains the card number and set code

Your job is to READ the text in these images. There is NO artwork visible — only text.

READING THE TOP STRIP (Pokemon name):
- The Pokemon name is the large text in this strip.
- It may be in Japanese (katakana/kanji), Korean, or another language. Translate to English.
- Common Japanese Pokemon names in katakana:
  コロトック = Kricketune, ゲノセクト = Genesect, リザードン = Charizard, ピカチュウ = Pikachu,
  ミュウツー = Mewtwo, ルカリオ = Lucario, レックウザ = Rayquaza, ミュウ = Mew,
  ザシアン = Zacian, ザマゼンタ = Zamazenta, ジガルデ = Zygarde, ゼラオラ = Zeraora,
  ゲッコウガ = Greninja, ガブリアス = Garchomp, サーナイト = Gardevoir,
  バシャーモ = Blaziken, エースバーン = Cinderace, ドラパルト = Dragapult,
  パルキア = Palkia, ディアルガ = Dialga, ギラティナ = Giratina,
  アルセウス = Arceus, ミミッキュ = Mimikyu, ドダイトス = Torterra
- Include any suffix (V, VMAX, VSTAR, ex, EX, GX) — these are usually in Latin characters.

READING THE BOTTOM STRIP (card number + set code):
- Look for a number in format "XXX/YYY" (e.g., "004/184", "012/220").
- Also look for a set code like "s6b", "s12a", "sv1", "SV5K", etc.
- The set code is typically a short alphanumeric string near the card number.
- READ every character carefully. Watch for: 0↔8, 3↔8, 6↔9, 1↔7.
- Also read the rarity symbol if visible (e.g., "RRR", "SR", "RR", "C", "U", "R").

SET NAME from set code:
- s6b = VMAX Climax, s8b = VMAX Climax, s12a = VSTAR Universe
- sv1 = Scarlet ex, sv2a = Pokemon Card 151, sv3 = Ruler of the Black Flame
- S1a = VMAX Rising, S5a = Matchless Fighters, S11a = Incandescent Arcana

Respond with JSON ONLY:
{"cardName": "English name", "setNumber": "XXX/YYY", "setCode": "code", "setName": "English set name"}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Image 1 is the TOP of a Pokemon card (contains the Pokemon name). Image 2 is the BOTTOM of the same card (contains the card number and set code). READ the text in both strips.",
            },
            {
              type: "image_url",
              image_url: { url: topStrip, detail: "high" },
            },
            {
              type: "image_url",
              image_url: { url: bottomStrip, detail: "high" },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[card-id] Cropped OCR result: name="${parsed.cardName}" number="${parsed.setNumber}" set="${parsed.setName}" code="${parsed.setCode || "none"}"`);
      return parsed;
    }
  } catch (err: any) {
    console.log(`[card-id] Dedicated identification failed:`, err?.message);
  }
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/grade-card", async (req, res) => {
    try {
      const { frontImage, backImage } = req.body;

      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back card images are required" });
      }

      const frontUrl = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
      const backUrl = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;

      const [gradingResponse, cardIdResult] = await Promise.all([
        openai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 4096,
          messages: [
            {
              role: "system",
              content: GRADING_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Please analyze this Pokemon card and provide estimated grades from PSA, Beckett (BGS), and Ace Grading. The first image is the front of the card and the second image is the back.\n\nIMPORTANT CARD IDENTIFICATION: First identify the Pokemon from the artwork and name on the card. Then read the card number at the bottom. Then VERIFY they match — does this Pokemon actually exist at this card number in the set you identified? If not, re-read the number or adjust. Common digit misreads: 0↔8, 3↔8, 6↔9, 1↔7.",
                },
                {
                  type: "image_url",
                  image_url: { url: frontUrl, detail: "high" },
                },
                {
                  type: "image_url",
                  image_url: { url: backUrl, detail: "high" },
                },
              ],
            },
          ],
        }),
        identifyCard(frontUrl),
      ]);

      const content = gradingResponse.choices[0]?.message?.content || "";

      let gradingResult;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          gradingResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        return res.status(500).json({ error: "Failed to parse grading results", raw: content });
      }

      gradingResult = enforceGradingScales(gradingResult);

      const gradingName = gradingResult.cardName || "";
      const gradingNumber = gradingResult.setNumber || "";
      const gradingSet = gradingResult.setName || "";
      const idName = cardIdResult?.cardName || "";
      const idNumber = cardIdResult?.setNumber || "";
      const idSet = cardIdResult?.setName || "";
      const idCode = cardIdResult?.setCode || "";

      console.log(`[grade-card] Grading call:  name="${gradingName}" number="${gradingNumber}" set="${gradingSet}"`);
      console.log(`[grade-card] ID call:       name="${idName}" number="${idNumber}" set="${idSet}" code="${idCode}"`);

      const bestName = idName || gradingName;
      const bestNumber = idNumber || gradingNumber;
      const bestSet = idSet || gradingSet;

      try {
        const lookupCandidates: Array<{ name: string; number: string; set: string; code?: string; source: string }> = [];
        lookupCandidates.push({ name: bestName, number: bestNumber, set: bestSet, code: idCode, source: "primary" });

        if (gradingNumber && gradingNumber !== bestNumber) {
          lookupCandidates.push({ name: gradingName || bestName, number: gradingNumber, set: gradingSet || bestSet, source: "grading-alt" });
        }
        if (idNumber && idNumber !== bestNumber && idNumber !== gradingNumber) {
          lookupCandidates.push({ name: idName || bestName, number: idNumber, set: idSet || bestSet, code: idCode, source: "ocr-alt" });
        }

        let bestVerified: { cardName: string; setName: string; setNumber: string } | null = null;
        for (const candidate of lookupCandidates) {
          console.log(`[grade-card] Trying lookup (${candidate.source}): name="${candidate.name}" number="${candidate.number}" set="${candidate.set}"`);
          const verified = await lookupCardOnline(candidate.name, candidate.number, candidate.set, candidate.code);
          if (verified) {
            bestVerified = verified;
            console.log(`[grade-card] Verified via ${candidate.source}: "${verified.cardName}" from "${verified.setName}" (${verified.setNumber})`);
            break;
          }
        }

        if (bestVerified) {
          gradingResult.cardName = bestVerified.cardName;
          gradingResult.setName = bestVerified.setName;
          gradingResult.setNumber = bestVerified.setNumber;
        } else {
          console.log(`[grade-card] No online match found, using AI identification`);
          gradingResult.cardName = bestName;
          gradingResult.setNumber = bestNumber;
          gradingResult.setName = bestSet;
        }
      } catch (lookupErr) {
        console.log(`[grade-card] Online lookup failed, using best AI identification`);
        gradingResult.cardName = bestName;
        gradingResult.setNumber = bestNumber;
        gradingResult.setName = bestSet;
      }

      const frontUri = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
      const backUri = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;
      const [detectedFront, detectedBack] = await Promise.all([
        detectCardBounds(frontUri),
        detectCardBounds(backUri),
      ]);
      gradingResult.frontCardBounds = detectedFront;
      gradingResult.backCardBounds = detectedBack;

      gradingResult = syncCenteringToGrades(gradingResult);

      res.json(gradingResult);
    } catch (error: any) {
      console.error("Error grading card:", error);
      res.status(500).json({ error: error.message || "Failed to grade card" });
    }
  });

  app.post("/api/card-value", async (req, res) => {
    try {
      const { cardName, setName, setNumber, psaGrade, bgsGrade, aceGrade } = req.body;
      console.log("[card-value] Request received:", { cardName, setName, setNumber, psaGrade, bgsGrade, aceGrade });
      if (!cardName) {
        console.log("[card-value] Missing cardName, returning 400");
        return res.status(400).json({ error: "Card name is required" });
      }

      const cardDesc = [cardName, setName, setNumber].filter(Boolean).join(" - ");

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are a Pokemon TCG market analyst specialising in the UK eBay market.

Your job is to estimate what each version of a card has ACTUALLY SOLD FOR on eBay UK recently. Think of it as: if someone searched eBay UK sold listings for each of these exact search terms, what prices would they find?

You will be given:
- The card name, set name, and card number (from the bottom of the card)
- The specific PSA, BGS, and Ace grades the card received

For EACH grading company, imagine searching eBay UK sold listings with a search like:
  "[Card Name] [Set Name] [Card Number] PSA [grade]"
  "[Card Name] [Set Name] [Card Number] BGS [grade]"
  "[Card Name] [Set Name] [Card Number] Ace [grade]"
  "[Card Name] [Set Name] [Card Number]" (for raw/ungraded)

The card number is CRITICAL for finding the right card - many Pokemon appear in multiple sets with very different values.

A graded card is ALWAYS worth more than a raw card. A PSA 10 or BGS 10 is worth significantly more than lower grades. The grading company slab and grade adds value on top of the raw card price.

Respond ONLY with valid JSON:
{
  "psaValue": "£XX - £XX",
  "bgsValue": "£XX - £XX",
  "aceValue": "£XX - £XX",
  "rawValue": "£XX - £XX",
  "source": "Based on recent eBay UK sold listings"
}

If no data exists for a category, use "No value data found". All prices MUST be in GBP (£).`,
          },
          {
            role: "user",
            content: `Look up eBay UK sold prices for this Pokemon card. Use the card name, set, AND card number together to identify the exact card.\n\nCard: ${cardName}\nSet: ${setName || "Unknown"}\nCard Number: ${setNumber || "Unknown"}\n\nSearch eBay UK sold listings for each of these:\n1. "${cardName} ${setNumber || ""} ${setName || ""} PSA ${psaGrade}" → psaValue\n2. "${cardName} ${setNumber || ""} ${setName || ""} BGS ${bgsGrade}" → bgsValue\n3. "${cardName} ${setNumber || ""} ${setName || ""} Ace ${aceGrade}" → aceValue\n4. "${cardName} ${setNumber || ""} ${setName || ""}" raw/ungraded → rawValue\n\nRemember: graded cards sell for MORE than raw cards. PSA 10 sells for MORE than PSA 9. All prices in GBP (£).`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const valueData = JSON.parse(jsonMatch[0]);
        console.log("[card-value] Success, returning:", valueData);
        res.json(valueData);
      } else {
        console.log("[card-value] No JSON found in response. Raw content:", content);
        res.json({
          psaValue: "No value data found",
          bgsValue: "No value data found",
          aceValue: "No value data found",
          rawValue: "No value data found",
          source: "Unable to estimate",
        });
      }
    } catch (error: any) {
      console.error("[card-value] Error fetching card value:", error?.message || error);
      res.json({
        psaValue: "No value data found",
        bgsValue: "No value data found",
        aceValue: "No value data found",
        rawValue: "No value data found",
        source: "Error fetching values",
      });
    }
  });

  app.post("/api/detect-bounds", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }
      const uri = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
      const bounds = await detectCardBounds(uri);
      res.json(bounds);
    } catch (error: any) {
      console.error("Error detecting bounds:", error);
      res.status(500).json({ error: error.message || "Failed to detect bounds" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
