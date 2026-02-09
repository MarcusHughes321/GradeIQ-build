import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const GRADING_SYSTEM_PROMPT = `You are an expert Pokemon card grading analyst with deep knowledge of card grading standards from PSA, Beckett (BGS), and Ace Grading. You will analyze images of a Pokemon card (front and back) and provide estimated grades based on each company's published grading criteria.

GRADING CRITERIA BY COMPANY:

**PSA (Professional Sports Authenticator) - Scale 1-10:**
- Centering: Front 60/40 or better for PSA 10, 65/35 for PSA 9, 70/30 for PSA 8, 75/25 for PSA 7
- Corners: Must be sharp and clean for high grades. Any whitening, dings, or rounding reduces grade
- Edges: Should be clean and smooth. Chipping, rough cuts, or whitening reduces grade
- Surface: No scratches, print lines, staining, or other blemishes for PSA 10. Minor issues acceptable at lower grades

**Beckett (BGS) - Scale 1-10 with sub-grades:**
- Centering: 50/50 to 55/45 for 10, 55/45 to 60/40 for 9.5, 60/40 to 65/35 for 9
- Corners: Inspected under magnification. Must be razor sharp for 10
- Edges: Checked for chipping, rough cuts, diamond cutting. Must be smooth for 10
- Surface: Examined for print dots, scratches, glazing issues. Must be flawless for 10
- BGS uses half-point sub-grades (9.5, 9.0, 8.5, etc.)

**Ace Grading - Scale 1-10 with sub-grades:**
- Centering: Measured precisely with percentage tolerance. 55/45 or better for 10
- Corners: Must be sharp with no visible wear for high grades
- Edges: Clean and consistent cuts required
- Surface: Free from scratches, print defects, and other blemishes
- Uses advanced imaging technology in their assessment
- Sub-grades given for each category

Analyze the card images carefully. Look for:
1. Centering - how well centered is the image on both front and back
2. Corners - check all four corners for whitening, dings, or damage
3. Edges - look for whitening, chipping, or rough cuts along all edges
4. Surface - check for scratches, print lines, staining, ink issues, or other surface defects

Respond ONLY with valid JSON in this exact format:
{
  "cardName": "Name of the Pokemon card if identifiable",
  "setInfo": "Set name and number if identifiable",
  "overallCondition": "Brief 1-2 sentence summary of the card's overall condition",
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
    "overallGrade": 8.5,
    "centering": { "grade": 9.0, "notes": "Assessment details" },
    "corners": { "grade": 8.5, "notes": "Assessment details" },
    "edges": { "grade": 8.5, "notes": "Assessment details" },
    "surface": { "grade": 8.5, "notes": "Assessment details" },
    "notes": "Any additional notes about Ace-specific grading"
  }
}

Be realistic and conservative in your grading. Most cards in circulation are not PSA 10 or BGS 10. Consider that photos may not capture every detail, so note any limitations in your assessment.`;

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

      res.json(gradingResult);
    } catch (error: any) {
      console.error("Error grading card:", error);
      res.status(500).json({ error: error.message || "Failed to grade card" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
