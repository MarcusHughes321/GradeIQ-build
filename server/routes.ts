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
2. Corners - check all four corners for whitening, dings, or damage
3. Edges - look for whitening, chipping, or rough cuts along all edges
4. Surface - check for scratches, print lines, staining, ink issues, or other surface defects

Respond ONLY with valid JSON in this exact format:
{
  "cardName": "Full name of the Pokemon card (e.g. 'Charizard ex')",
  "setName": "Name of the Pokemon TCG set (e.g. 'Obsidian Flames')",
  "setNumber": "Card number as shown on the card (e.g. '012/220')",
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

Be realistic and conservative in your grading. Most cards in circulation are not PSA 10 or BGS 10.`;

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

async function detectCardBounds(dataUri: string): Promise<{ leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number }> {
  try {
    const base64Data = dataUri.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const { width, height } = await sharp(buffer).metadata() as { width: number; height: number };
    if (!width || !height) throw new Error("Could not get image dimensions");

    const SAMPLE_SIZE = 200;
    const scaleW = Math.min(1, SAMPLE_SIZE / width);
    const scaleH = Math.min(1, SAMPLE_SIZE / height);
    const sw = Math.round(width * scaleW);
    const sh = Math.round(height * scaleH);

    const { data: pixels } = await sharp(buffer)
      .resize(sw, sh, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const getPixel = (x: number, y: number) => pixels[y * sw + x];

    const computeEdgeGradient = (x: number, y: number): number => {
      let grad = 0;
      let count = 0;
      if (x > 0) { grad += Math.abs(getPixel(x, y) - getPixel(x - 1, y)); count++; }
      if (x < sw - 1) { grad += Math.abs(getPixel(x, y) - getPixel(x + 1, y)); count++; }
      if (y > 0) { grad += Math.abs(getPixel(x, y) - getPixel(x, y - 1)); count++; }
      if (y < sh - 1) { grad += Math.abs(getPixel(x, y) - getPixel(x, y + 1)); count++; }
      return count > 0 ? grad / count : 0;
    };

    const SCAN_RANGE = 0.4;
    const EDGE_THRESHOLD = 15;
    const MIN_VOTES = 3;

    const findEdgeColumn = (startX: number, endX: number, step: number): number => {
      const scanYStart = Math.round(sh * 0.15);
      const scanYEnd = Math.round(sh * 0.85);
      let bestCol = startX;
      let bestScore = 0;

      for (let x = startX; step > 0 ? x < endX : x > endX; x += step) {
        let votes = 0;
        let totalGrad = 0;
        for (let y = scanYStart; y < scanYEnd; y += 2) {
          const g = computeEdgeGradient(x, y);
          if (g >= EDGE_THRESHOLD) {
            votes++;
            totalGrad += g;
          }
        }
        if (votes >= MIN_VOTES && totalGrad > bestScore) {
          bestScore = totalGrad;
          bestCol = x;
        }
      }
      return bestCol;
    };

    const findEdgeRow = (startY: number, endY: number, step: number): number => {
      const scanXStart = Math.round(sw * 0.15);
      const scanXEnd = Math.round(sw * 0.85);
      let bestRow = startY;
      let bestScore = 0;

      for (let y = startY; step > 0 ? y < endY : y > endY; y += step) {
        let votes = 0;
        let totalGrad = 0;
        for (let x = scanXStart; x < scanXEnd; x += 2) {
          const g = computeEdgeGradient(x, y);
          if (g >= EDGE_THRESHOLD) {
            votes++;
            totalGrad += g;
          }
        }
        if (votes >= MIN_VOTES && totalGrad > bestScore) {
          bestScore = totalGrad;
          bestRow = y;
        }
      }
      return bestRow;
    };

    const leftCol = findEdgeColumn(0, Math.round(sw * SCAN_RANGE), 1);
    const rightCol = findEdgeColumn(sw - 1, Math.round(sw * (1 - SCAN_RANGE)), -1);
    const topRow = findEdgeRow(0, Math.round(sh * SCAN_RANGE), 1);
    const bottomRow = findEdgeRow(sh - 1, Math.round(sh * (1 - SCAN_RANGE)), -1);

    const leftPercent = Math.round((leftCol / sw) * 100);
    const rightPercent = Math.round((rightCol / sw) * 100);
    const topPercent = Math.round((topRow / sh) * 100);
    const bottomPercent = Math.round((bottomRow / sh) * 100);

    if (rightPercent - leftPercent < 30 || bottomPercent - topPercent < 30) {
      return { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98 };
    }

    return {
      leftPercent: clamp(leftPercent, 0, 45),
      topPercent: clamp(topPercent, 0, 45),
      rightPercent: clamp(rightPercent, 55, 100),
      bottomPercent: clamp(bottomPercent, 55, 100),
    };
  } catch (err) {
    console.error("Card bounds detection failed:", err);
    return { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98 };
  }
}

function enforceCardBounds(bounds: any): any {
  if (!bounds) return { leftPercent: 4, topPercent: 3, rightPercent: 96, bottomPercent: 97 };
  return {
    leftPercent: clamp(Math.round(bounds.leftPercent ?? 5), 3, 45),
    topPercent: clamp(Math.round(bounds.topPercent ?? 3), 2, 45),
    rightPercent: clamp(Math.round(bounds.rightPercent ?? 95), 55, 97),
    bottomPercent: clamp(Math.round(bounds.bottomPercent ?? 97), 55, 98),
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

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/grade-card", async (req, res) => {
    try {
      const { frontImage, backImage } = req.body;

      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back card images are required" });
      }

      const response = await openai.chat.completions.create({
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
                text: "Please analyze this Pokemon card and provide estimated grades from PSA, Beckett (BGS), and Ace Grading. The first image is the front of the card and the second image is the back.",
              },
              {
                type: "image_url",
                image_url: {
                  url: frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`,
                },
              },
              {
                type: "image_url",
                image_url: {
                  url: backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`,
                },
              },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content || "";

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
      if (!cardName) {
        return res.status(400).json({ error: "Card name is required" });
      }

      const cardDesc = [cardName, setName, setNumber].filter(Boolean).join(" - ");

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are a Pokemon TCG market analyst. Provide estimated recent eBay sold prices for graded Pokemon cards. Use your knowledge of Pokemon card values from eBay sold listings. Be realistic with prices based on the card's rarity, popularity, and condition.

Respond ONLY with valid JSON in this exact format:
{
  "psaValue": "Estimated eBay sold price for PSA graded version (e.g. '$45 - $65')",
  "bgsValue": "Estimated eBay sold price for BGS graded version (e.g. '$50 - $70')",
  "aceValue": "Estimated eBay sold price for Ace graded version (e.g. '$30 - $50')",
  "rawValue": "Estimated eBay sold price for raw/ungraded version (e.g. '$15 - $25')",
  "source": "Based on recent eBay sold listings"
}

If you cannot determine a reasonable price estimate for any category, use "No value data found" for that field. For very common cards, prices may be low ($1-$10). For rare/chase cards, prices can be much higher. The grade significantly affects value.`,
          },
          {
            role: "user",
            content: `What are the estimated recent eBay sold prices for this Pokemon card?\n\nCard: ${cardDesc}\nPSA Grade: ${psaGrade}\nBGS Grade: ${bgsGrade}\nAce Grade: ${aceGrade}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const valueData = JSON.parse(jsonMatch[0]);
        res.json(valueData);
      } else {
        res.json({
          psaValue: "No value data found",
          bgsValue: "No value data found",
          aceValue: "No value data found",
          rawValue: "No value data found",
          source: "Unable to estimate",
        });
      }
    } catch (error: any) {
      console.error("Error fetching card value:", error);
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
