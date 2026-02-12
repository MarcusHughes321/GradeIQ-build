import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SET_CODE_TO_NAME: Record<string, string> = {
  "s6a": "Eevee Heroes", "s6b": "Fusion Arts", "s8": "Fusion Arts",
  "s8a": "25th Anniversary Collection", "s8b": "VMAX Climax",
  "s9": "Star Birth", "s9a": "Battle Region",
  "s10": "Time Gazer / Space Juggler", "s10a": "Dark Phantasma", "s10b": "Pokemon GO",
  "s11": "Lost Abyss", "s11a": "Incandescent Arcana",
  "s12": "Silver Tempest", "s12a": "VSTAR Universe",
  "sv1": "Scarlet ex", "sv1a": "Triplet Beat", "sv2": "Snow Hazard / Clay Burst",
  "sv2a": "Pokemon Card 151", "sv3": "Ruler of the Black Flame",
  "sv3a": "Raging Surf", "sv4": "Shiny Treasure ex", "sv4a": "Ancient Roar / Future Flash",
  "sv5k": "Wild Force", "sv5m": "Cyber Judge",
  "sv6": "Night Wanderer", "sv6a": "Transformation Mask",
  "sv7": "Stellar Crown", "sv7a": "Paradise Dragona",
  "sv8": "Super Electric Breaker", "sv8a": "Terastal Fest ex",
  "s1a": "VMAX Rising", "s1h": "Shield", "s1w": "Sword",
  "s2": "Rebellion Crash", "s2a": "Explosive Walker",
  "s3": "Infinity Zone", "s3a": "Legendary Heartbeat",
  "s4": "Amazing Volt Tackle", "s4a": "Shiny Star V",
  "s5a": "Matchless Fighters", "s5i": "Single Strike / Rapid Strike",
  "s5r": "Rapid Strike Master", "s6h": "Silver Lance", "s6k": "Jet Black Spirit",
  "s7d": "Skyscraping Perfection", "s7r": "Blue Sky Stream",
  "pflen": "Phantasmal Flames", "sfa": "Surging Sparks",
  "paf": "Paldean Fates", "obf": "Obsidian Flames",
  "pal": "Paldea Evolved", "svi": "Scarlet & Violet",
  "crz": "Crown Zenith", "sit": "Silver Tempest",
  "lor": "Lost Origin", "asr": "Astral Radiance",
  "brs": "Brilliant Stars", "fst": "Fusion Strike",
  "evs": "Evolving Skies", "cre": "Chilling Reign",
  "bst": "Battle Styles", "shf": "Shining Fates",
  "viv": "Vivid Voltage", "daa": "Darkness Ablaze",
  "rcl": "Rebel Clash", "ssh": "Sword & Shield",
  "pre": "Prismatic Evolutions", "tef": "Temporal Forces",
  "twm": "Twilight Masquerade", "scr": "Stellar Crown",
  "ssp": "Surging Sparks", "mev": "Mythical Island",
  "sm1": "Sun & Moon", "sm2": "Guardians Rising",
  "sm3": "Burning Shadows", "sm4": "Crimson Invasion",
  "sm5": "Ultra Prism", "sm6": "Forbidden Light",
  "sm7": "Celestial Storm", "sm8": "Lost Thunder",
  "sm9": "Team Up", "sm10": "Unbroken Bonds",
  "sm11": "Unified Minds", "sm12": "Cosmic Eclipse",
};

function resolveSetName(setCode: string, aiSetName: string): string {
  if (!setCode) return aiSetName;
  const key = setCode.toLowerCase().trim();
  return SET_CODE_TO_NAME[key] || aiSetName;
}

interface CachedSet {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  ptcgoCode: string;
  releaseDate: string;
}

let cachedSets: CachedSet[] = [];
let setsLastFetched = 0;
const SET_CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchAndCacheSets(): Promise<void> {
  try {
    console.log(`[set-cache] Fetching all sets from Pokemon TCG API...`);
    const resp = await fetch(
      "https://api.pokemontcg.io/v2/sets?select=id,name,series,printedTotal,total,ptcgoCode,releaseDate&pageSize=250&orderBy=releaseDate",
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) {
      console.log(`[set-cache] API returned ${resp.status}`);
      return;
    }
    const data = await resp.json() as any;
    cachedSets = (data?.data || []).map((s: any) => ({
      id: s.id || "",
      name: s.name || "",
      series: s.series || "",
      printedTotal: s.printedTotal || 0,
      total: s.total || 0,
      ptcgoCode: s.ptcgoCode || "",
      releaseDate: s.releaseDate || "",
    }));
    setsLastFetched = Date.now();
    console.log(`[set-cache] Cached ${cachedSets.length} sets`);
  } catch (e: any) {
    console.log(`[set-cache] Failed to fetch sets: ${e?.message}`);
  }
}

async function ensureSetsCached(): Promise<CachedSet[]> {
  if (cachedSets.length === 0 || Date.now() - setsLastFetched > SET_CACHE_TTL) {
    await fetchAndCacheSets();
  }
  return cachedSets;
}

function findSetsByTotal(printedTotal: number): CachedSet[] {
  return cachedSets.filter(s => s.printedTotal === printedTotal || s.total === printedTotal);
}

function findSetByName(name: string): CachedSet | null {
  const cleanName = (n: string) => n.toLowerCase()
    .replace(/\(english\)|\(unlimited\)|\(1st edition\)|\(japanese\)/gi, "")
    .replace(/[—–-]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleanName(name);
  if (!lower) return null;

  let best: CachedSet | null = null;
  let bestScore = 0;
  for (const s of cachedSets) {
    const sLower = cleanName(s.name);
    if (sLower === lower) return s;

    let score = 0;
    if (lower === sLower) {
      score = 1.0;
    } else if (sLower === lower || lower.startsWith(sLower + " ") || sLower.startsWith(lower + " ")) {
      score = Math.min(sLower.length, lower.length) / Math.max(sLower.length, lower.length);
      score = Math.min(score + 0.1, 1.0);
    } else if (sLower.includes(lower) || lower.includes(sLower)) {
      score = Math.min(sLower.length, lower.length) / Math.max(sLower.length, lower.length);
    } else {
      const sWords = sLower.split(/\s+/);
      const nWords = lower.split(/\s+/);
      const overlap = sWords.filter((w: string) => nWords.includes(w)).length;
      if (overlap > 0) {
        score = overlap / Math.max(sWords.length, nWords.length);
        if (score < 0.5) score = 0;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore > 0.4 ? best : null;
}

function findSetByCode(code: string): CachedSet | null {
  const lower = code.toLowerCase();
  return cachedSets.find(s => s.id.toLowerCase() === lower || s.ptcgoCode.toLowerCase() === lower) || null;
}

function validateCardInSet(cardNumber: number, setTotal: number): CachedSet[] {
  return cachedSets.filter(s =>
    cardNumber <= (s.total || s.printedTotal) &&
    (s.printedTotal === setTotal || s.total === setTotal)
  );
}

fetchAndCacheSets();

// ======================================================================
// Asian Card Database Cache (Bulbapedia-sourced) — covers Japanese, Korean, and Chinese cards
// ======================================================================

interface JapaneseSetCache {
  cards: Map<number, string>; // cardNumber → English card name
  setName: string;
  fetchedAt: number;
}

const japaneseSetCards = new Map<string, JapaneseSetCache>();
const JP_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const JP_SET_CODE_TO_PAGE: Record<string, string> = {
  "s1a": "VMAX_Rising",
  "s1h": "Shield",
  "s1w": "Sword",
  "s2": "Rebellion_Crash",
  "s2a": "Explosive_Walker",
  "s3": "Infinity_Zone",
  "s3a": "Legendary_Heartbeat",
  "s4": "Amazing_Volt_Tackle",
  "s4a": "Shiny_Star_V",
  "s5a": "Matchless_Fighters",
  "s5i": "Single_Strike_Master",
  "s5r": "Rapid_Strike_Master",
  "s6": "Silver_Lance",
  "s6a": "Eevee_Heroes",
  "s6h": "Silver_Lance",
  "s6k": "Jet-Black_Poltergeist",
  "s7": "Blue_Sky_Stream",
  "s7d": "Skyscraping_Perfection",
  "s7r": "Towering_Perfection",
  "s8": "Fusion_Arts",
  "s8a": "25th_Anniversary_Collection",
  "s8b": "VMAX_Climax",
  "s9": "Star_Birth",
  "s9a": "Battle_Region",
  "s10a": "Dark_Phantasma",
  "s10b": "Pokémon_GO_(TCG)",
  "s10d": "Time_Gazer",
  "s10p": "Space_Juggler",
  "s11": "Lost_Abyss",
  "s11a": "Incandescent_Arcana",
  "s12": "Paradigm_Trigger",
  "s12a": "VSTAR_Universe",
  "sv1s": "Scarlet_ex_(TCG)",
  "sv1v": "Violet_ex_(TCG)",
  "sv2a": "Pokémon_Card_151",
  "sv2d": "Clay_Burst",
  "sv2p": "Snow_Hazard",
  "sv3": "Ruler_of_the_Black_Flame",
  "sv3a": "Raging_Surf",
  "sv4": "Ancient_Roar",
  "sv4a": "Shiny_Treasure_ex",
  "sv4k": "Ancient_Roar",
  "sv4m": "Future_Flash",
  "sv5a": "Crimson_Haze",
  "sv5k": "Wild_Force",
  "sv5m": "Cyber_Judge",
  "sv6": "Transformation_Mask",
  "sv6a": "Night_Wanderer",
  "sv7": "Stellar_Miracle",
  "sv7a": "Paradise_Dragona",
  "sv8": "Super_Electric_Breaker",
  "sv8a": "Terastal_Fest_ex",
  "sm1": "Collection_Sun",
  "sm1m": "Collection_Moon",
  "sm1s": "Collection_Sun",
  "sm2": "Alolan_Moonlight",
  "sm3": "Darkness_that_Consumes_Light",
  "sm3h": "To_Have_Seen_the_Battle_Rainbow",
  "sm3n": "Darkness_that_Consumes_Light",
  "sm4": "The_Best_of_XY",
  "sm4a": "Ultradimensional_Beasts",
  "sm5": "Ultra_Sun_(TCG)",
  "sm5m": "Ultra_Moon_(TCG)",
  "sm5s": "Ultra_Sun_(TCG)",
  "sm6": "Forbidden_Light_(TCG)",
  "sm6a": "Dragon_Storm",
  "sm6b": "Champion_Road",
  "sm7": "Charisma_of_the_Wrecked_Sky",
  "sm7a": "Thunderclap_Spark",
  "sm7b": "Fairy_Rise",
  "sm8": "Super-Burst_Impact",
  "sm8a": "Dark_Order",
  "sm8b": "GX_Ultra_Shiny",
  "sm9": "Tag_Bolt",
  "sm9a": "Night_Unison",
  "sm9b": "Full_Metal_Wall",
  "sm10": "Double_Blaze",
  "sm10a": "GG_End",
  "sm10b": "Sky_Legend",
  "sm11": "Miracle_Twin",
  "sm11a": "Remix_Bout",
  "sm11b": "Dream_League",
  "sm12": "Alter_Genesis",
  "sm12a": "Tag_All_Stars",
};

async function fetchBulbapediaSetCards(setPageName: string): Promise<Map<number, string>> {
  try {
    const url = `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(setPageName)}_(TCG)`;
    console.log(`[jp-cache] Fetching card list from Bulbapedia: ${url}`);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GradeIQ/1.0)",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const altUrl = `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(setPageName)}`;
      console.log(`[jp-cache] First URL returned ${resp.status}, trying: ${altUrl}`);
      const resp2 = await fetch(altUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GradeIQ/1.0)", "Accept": "text/html" },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp2.ok) {
        console.log(`[jp-cache] Alt URL also returned ${resp2.status}`);
        return new Map();
      }
      const html = await resp2.text();
      return parseBulbapediaCardList(html);
    }
    const html = await resp.text();
    return parseBulbapediaCardList(html);
  } catch (err: any) {
    console.log(`[jp-cache] Fetch failed: ${err?.message}`);
    return new Map();
  }
}

function parseBulbapediaCardList(html: string): Map<number, string> {
  const cards = new Map<number, string>();
  const regex = /title="([^"]+)\s+(\d+)\)"/g;
  let m;
  const setGroups = new Map<string, Array<{ num: number; name: string }>>();

  while ((m = regex.exec(html))) {
    const full = m[1];
    const num = parseInt(m[2]);
    const lastParen = full.lastIndexOf("(");
    if (lastParen > 0) {
      const cardName = full.substring(0, lastParen).trim();
      const setName = full.substring(lastParen + 1).trim();
      if (!setGroups.has(setName)) setGroups.set(setName, []);
      setGroups.get(setName)!.push({ num, name: cardName });
    }
  }

  let largestSetName = "";
  let largestSetSize = 0;
  for (const [setName, setCards] of setGroups) {
    if (setCards.length > largestSetSize) {
      largestSetSize = setCards.length;
      largestSetName = setName;
    }
  }

  if (largestSetName && largestSetSize > 5) {
    for (const c of setGroups.get(largestSetName)!) {
      if (!cards.has(c.num)) {
        cards.set(c.num, c.name);
      }
    }
    console.log(`[jp-cache] Parsed ${cards.size} cards from set "${largestSetName}"`);
  }

  return cards;
}

async function lookupJapaneseCard(setCode: string, cardNumber: number, aiSetName?: string): Promise<string | null> {
  const codeKey = setCode.toLowerCase();

  const cached = japaneseSetCards.get(codeKey);
  if (cached && Date.now() - cached.fetchedAt < JP_CACHE_TTL) {
    const name = cached.cards.get(cardNumber);
    if (name) {
      console.log(`[jp-cache] Cache hit: ${codeKey} #${cardNumber} = "${name}"`);
      return name;
    }
    console.log(`[jp-cache] Cache hit for set ${codeKey} but card #${cardNumber} not found (set has ${cached.cards.size} cards)`);
    return null;
  }

  const pageName = JP_SET_CODE_TO_PAGE[codeKey];
  if (!pageName && !aiSetName) {
    console.log(`[jp-cache] No Bulbapedia page mapping for set code "${setCode}" and no AI set name`);
    return null;
  }

  const searchName = pageName || aiSetName!.replace(/\s+/g, "_").replace(/['']/g, "%27");
  const cards = await fetchBulbapediaSetCards(searchName);

  if (cards.size > 0) {
    japaneseSetCards.set(codeKey, {
      cards,
      setName: searchName,
      fetchedAt: Date.now(),
    });
    const name = cards.get(cardNumber);
    if (name) {
      console.log(`[jp-cache] Fetched & found: ${codeKey} #${cardNumber} = "${name}"`);
      return name;
    }
    console.log(`[jp-cache] Fetched ${cards.size} cards for ${codeKey} but #${cardNumber} not found`);
  } else if (aiSetName && pageName) {
    const aiSearchName = aiSetName.replace(/\s+/g, "_");
    if (aiSearchName !== searchName) {
      console.log(`[jp-cache] Trying AI set name: "${aiSearchName}"`);
      const cards2 = await fetchBulbapediaSetCards(aiSearchName);
      if (cards2.size > 0) {
        japaneseSetCards.set(codeKey, { cards: cards2, setName: aiSearchName, fetchedAt: Date.now() });
        const name = cards2.get(cardNumber);
        if (name) {
          console.log(`[jp-cache] Found via AI name: ${codeKey} #${cardNumber} = "${name}"`);
          return name;
        }
      }
    }
  }

  return null;
}

const GRADING_SYSTEM_PROMPT = `You are an expert Pokemon card grading analyst with deep knowledge of card grading standards from PSA, Beckett (BGS), Ace Grading, TAG Grading, and CGC Cards. You will analyze images of a Pokemon card (front and back) and provide estimated grades based on each company's published grading criteria.

IMPORTANT GRADING SCALE RULES - YOU MUST FOLLOW THESE EXACTLY:

**PSA (Professional Sports Authenticator) - Scale 1-10, NO 9.5:**
- PSA uses HALF GRADES from 1.5 to 8.5 (e.g., 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10)
- There is NO PSA 9.5. The top grades are PSA 9 (Mint) and PSA 10 (Gem Mint) ONLY.
- PSA does NOT provide individual sub-grades, only an overall grade. The final grade is determined by the weakest category.
- CENTERING THRESHOLDS (front / back):
  * PSA 10 (Gem Mint): Front 55/45 to 60/40, Back up to 75/25. Yes, PSA allows significant back off-centering for a 10.
  * PSA 9 (Mint): Front ~60/40, Back ~90/10
  * PSA 8 (NM-MT): Front ~65/35, Back ~90/10
  * PSA 7 (NM): Front ~70/30, Back ~90/10
  * PSA 6 (EX-MT): Front 80/20, Back ~90/10
- CORNERS: PSA 10 requires four perfectly sharp corners. PSA 9 allows corners that are mint to the naked eye. PSA 8 allows very slight fraying at 1-2 corners. PSA 7 allows slight fraying on some corners.
- EDGES: PSA 10 requires perfect edges. PSA 9 allows clean edges. PSA 8 allows minimal wear. PSA 7 allows minimal wear visible on close inspection.
- SURFACE: PSA 10 requires sharp focus, full original gloss, free of staining. One slight printing imperfection allowed if it doesn't impair appeal. PSA 9 allows ONE minor flaw only (very slight wax stain on reverse, minor printing imperfection, OR slightly off-white borders). PSA 8 allows very slight wax stain, slightest fraying, minor printing imperfection, or slightly off-white borders.

**Beckett (BGS) - Scale 1-10 with HALF-GRADE sub-grades:**
- BGS uses 0.5 increments for BOTH overall grade AND all sub-grades (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10)
- The LOWEST subgrade heavily influences the overall grade. The lowest subgrade often CAPS the overall.
- Black Label 10 = ALL FOUR subgrades are perfect 10. This is extremely rare.
- CENTERING THRESHOLDS (front / back):
  * 10 (Pristine): Front 50/50, Back 60/40 or better
  * 9.5 (Gem Mint): Front 50/50 one way + 55/45 other, Back 60/40 or better
  * 9 (Mint): Front 55/45 both ways, Back 70/30 or better
  * 8.5 (NM-Mint+): Front 60/40 both ways, Back 80/20 or better
  * 8 (NM-Mint): Front 65/35 both ways
  * 7 (Near Mint): Front 75/25 both ways, Back 95/5 or better
- CORNERS: 10 = Perfect to naked eye, Mint under magnification. 9.5 = Mint to naked eye, slight imperfections under magnification. 9 = Speck of wear under intense scrutiny. 8.5 = Sharp to naked eye, slight imperfections under close exam. 7 = Four fuzzy corners, touch of notching or minor ding.
- EDGES: 10 = Perfect to naked eye, virtually flaw-free under magnification. 9.5 = Speck of wear under intense scrutiny. 9 = Unobtrusive specks of chipping on borders. 8.5 = Specks of chipping visible to naked eye. 7 = Noticeable roughness, very slight notching.
- SURFACE: 10 = No print spots, flawless color, perfect gloss, no scratches or metallic print lines. 9.5 = Few extremely minor print spots under intense scrutiny, deep color, perfect gloss. 9 = Handful of printing specks or one minor spot, clean gloss with 1-2 tiny scratches, one faint metallic line allowed. 8.5 = Few minor print spots, solid gloss with minor scratches under close inspection.

**Ace Grading (UK) - Scale 1-10, WHOLE NUMBERS ONLY:**
- Ace uses ONLY whole numbers (1, 2, 3, 4, 5, 6, 7, 8, 9, 10). NO HALF GRADES like 8.5 or 9.5.
- Both the overall grade and ALL sub-grades MUST be whole numbers.
- Ace provides FREE subgrades for Centering, Corners, Edges, and Surface.
- CAPPING RULE: No card can have an overall grade more than 1 grade HIGHER than its lowest subgrade. E.g., if Edges = 7, maximum overall = 8.
- ACE 10 RULE: For a card to receive an overall Ace 10, Centering MUST be a 10. Additionally, at least 2 of the other 3 sub-grades (Corners, Edges, Surface) must also be 10, with only ONE 9 allowed among them. If centering is not a 10, the card CANNOT get an overall Ace 10 regardless of other sub-grades.
- Centering is measured with 1/1000th mm precision using automated scanning.
- CENTERING THRESHOLDS (front / back):
  * 10 (Gem Mint): Under 60/40 on both front and back
  * 9 (Mint): Better than 65/35 front, better than 70/30 back
  * 8 (NM-Mint): Better than 70/30 front, better than 75/25 back
  * 7 (Near Mint): Better than 75/25 front, better than 80/20 back
  * 6 (Excellent-Mint): Better than 80/20 both sides
  * 5 (Excellent): Better than 85/15 both sides
- OC (Off-Center) qualifier: Applied when centering is 2+ grades below the overall grade.
- CORNERS: 10 = Four undamaged, sharp corners. 9 = One minor imperfection. 8 = Few minor imperfections like slight whitening. 7 = More noticeable whitening.
- EDGES: 10 = Sharp, no whitening, chipping, or kinks. 9 = Nearly identical to 10 with one minor flaw. 8 = Few minor imperfections. 7 = Slight wear, some whitening.
- SURFACE: 10 = Beautiful surface, no marks, stains, or damage. Very minor defects allowed if they don't harm eye appeal. 9 = Nearly identical to 10, one minor imperfection. 8 = Few minor imperfections. 7 = Slight wear visible, may include perceptible printing defects.

**TAG Grading (AI-Powered) - Scale 1-10 with HALF-GRADE sub-grades:**
- TAG uses a 1000-point scale (100-1000) that converts to industry-standard 1-10.
- Pristine 10 (score 990-1000): Exceeds Gem Mint standard. Less than 1% of cards achieve this.
- Gem Mint 10 (score 950-989): Industry-standard Gem Mint 10.
- TAG does NOT use 9.5 grades. Scores 900-949 = TAG 9.
- Uses 0.5 increments for sub-grades (e.g., 7, 7.5, 8, 8.5, 9, 10)
- Fully automated grading using computer vision and Photometric Stereoscopic Imaging — no human subjectivity.
- CENTERING THRESHOLDS for TCG/Pokemon cards (front / back):
  * TAG 10: Front ~52/48, Back ~52/48. TAG is the STRICTEST on centering for TCG cards.
  * TAG 9: Front ~55/45, Back ~65/35
  * TAG 8: Front ~62.5/37.5, Back ~85/15
  * TAG 7: Front ~65/35, Back ~95/5
- CORNERS: Pristine = Virtually flawless, sharp and crisp. Gem Mint 10 = 4 sharp corners with minor fill/fray artifacts. 9 = Sharp & square, light corner touches on reverse. 8 = Light rounding visible.
- EDGES: Pristine = Virtually flawless. Gem Mint 10 = Minor fill or fray under high-resolution. 9 = Visible but minor surface wear on 1-2 edges. 8 = Minor chipping.
- SURFACE: TAG is STRICTER on surface than other companies. Pristine = Extremely attractive, slight print imperfection only under hi-res. Gem Mint 10 = Very minor surface wear, tiny pit or light scratch that doesn't penetrate gloss. 9 = Small scratch penetrating gloss on back, multiple print lines, minor scuffing.

**CGC Cards - Scale 1-10 with HALF-GRADE increments, NO sub-grades:**
- CGC uses 0.5 increments for the overall grade (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10)
- CGC DISCONTINUED sub-grades in 2023. Only an overall grade is given with text descriptions per category.
- CGC has TWO types of 10:
  * Pristine 10 (Gold Label): Front centering 50/50, flawless under 10x magnification. Flawless color and registration. This is extremely rare.
  * Gem Mint 10 (Standard): Corners perfect to naked eye, Mint+ under 10x. Surface free of print spots, perfect gloss. One criterion may fall slightly short of Pristine.
- CENTERING THRESHOLDS:
  * Pristine 10: Front 50/50 exactly, Back 55/45 or better
  * Gem Mint 10: Front 55/45, Back 75/25 or better
  * 9.5 (Mint+): Front ~55/45 to 60/40, Back ~75/25 to 80/20. Nearly perfect centering.
  * 9 (Mint): Slight centering deviations. Front ~60/40, Back ~80/20.
  * 8.5 (NM/Mint+): Front ~65/35, Back ~85/15
- CORNERS: Pristine/Gem 10 = Perfect to naked eye. 9.5 = Mint to naked eye, slight imperfections under magnification. 9 = Minor wear visible. 8 = More noticeable wear.
- EDGES: Similar standards to corners. Pristine requires flawless edges. Lower grades allow progressive chipping/whitening.
- SURFACE: Pristine requires no print spots, flawless color, perfect gloss. Manufacturing defects (print lines, roller marks, ink smears) count against the grade. Holographic/chrome cards show defects easily under light.

Analyze the card images carefully. Look for:
1. Centering - Measure how well centered the image is on both front and back. Provide the centering as a percentage for the LARGER side (e.g., if left border is slightly wider, frontLeftRight = 53 means 53/47). Values should be between 50 (perfect) and 80+ (severely off-center). Measure left-right and top-bottom separately for both front and back.
2. Corners - check all four corners for whitening, dings, or damage. Minor imperfections only visible under magnification should not significantly lower grades.
3. Edges - look for whitening, chipping, or rough cuts along all edges. Factory-level minor edge variation is acceptable for high grades.
4. Surface - check for scratches, print lines, staining, ink issues, or other surface defects. Minor factory print texture or very faint print lines common to modern Pokemon cards should not lower surface grades below 9.

LANGUAGE HANDLING:
- Pokemon cards exist in MANY languages: English, Japanese, Korean, Chinese (Traditional & Simplified), French, German, Spanish, Italian, Portuguese, etc.
- You MUST identify the card regardless of what language it is printed in.
- ALWAYS respond with the ENGLISH name of the Pokemon, set name, and all text fields, even if the card is in another language.
- For example: a Japanese card showing "リザードンex" should be reported as "Charizard ex" in cardName.
- For Korean cards: 리자몽 = Charizard, 피카츄 = Pikachu, 뮤츠 = Mewtwo, 루카리오 = Lucario, 레쿠자 = Rayquaza, 겐가 = Gengar, 님피아 = Sylveon, 블래키 = Umbreon
- For Chinese cards: 噴火龍 = Charizard, 皮卡丘 = Pikachu, 超夢 = Mewtwo, 路卡利歐 = Lucario, 烈空坐 = Rayquaza, 耿鬼 = Gengar, 仙子伊布 = Sylveon, 月亮伊布 = Umbreon
- Use the artwork, card number, set symbol, and your knowledge of Pokemon TCG releases across all languages to identify the card.
- IMPORTANT: Japanese, Korean, and Chinese cards all use the SAME set codes (e.g., s8b, sv2a, sm12) and the SAME card numbering. They are regional releases of the same sets.

CRITICAL FOR CARD IDENTIFICATION — MULTI-STEP VERIFICATION:

Step 1: IDENTIFY THE POKEMON using name text AND artwork
- READ the Pokemon name that is PRINTED on the card (in ANY language).
- ALSO look at the ARTWORK — use the Pokemon's distinctive visual features (colors, body shape, face, wings, tail, etc.) to confirm your text reading.
- If the name is hard to read (glare, holographic, non-English), rely MORE on the artwork. Every Pokemon has unique visual features that make identification possible even without reading the name.
- For JAPANESE cards: READ the katakana/kanji name at the top of the card and translate to English.
  Key translations: コロトック = Kricketune, ゲノセクト = Genesect, リザードン = Charizard, ピカチュウ = Pikachu, ルカリオ = Lucario, ミュウツー = Mewtwo, レックウザ = Rayquaza
- For KOREAN cards: READ the Hangul name at the top of the card and translate to English.
  Key translations: 리자몽 = Charizard, 피카츄 = Pikachu, 뮤츠 = Mewtwo, 루카리오 = Lucario, 레쿠자 = Rayquaza, 팬텀 = Gengar, 님피아 = Sylveon, 블래키 = Umbreon, 에브이 = Eevee, 가브리아스 = Garchomp, 메타그로스 = Metagross
- For CHINESE cards: READ the Chinese characters and translate to English.
  Key translations: 噴火龍 = Charizard, 皮卡丘 = Pikachu, 超夢 = Mewtwo, 路卡利歐 = Lucario, 烈空坐 = Rayquaza, 耿鬼 = Gengar, 仙子伊布 = Sylveon, 月亮伊布 = Umbreon, 伊布 = Eevee
- Determine the ENGLISH name of the Pokemon (e.g., Japanese "リザードンex" = "Charizard ex", Korean "리자몽ex" = "Charizard ex", Chinese "噴火龍ex" = "Charizard ex").
- Note any suffix like "ex", "EX", "GX", "V", "VMAX", "VSTAR", etc.

Step 2: READ THE CARD NUMBER AND SET CODE
- The card number is printed at the bottom of the card, usually bottom-left or bottom-right.
- It typically follows the format "XXX/YYY" (e.g., "012/220").
- Japanese, Korean, and Chinese cards all have a SET CODE like "s6b", "s12a", "sv1" printed near the card number — READ this too.
- Card numbers can be hard to read due to glare, angle, small font, or holographic effects. Use these strategies:
  * Look for the "/" character that separates card number from set total
  * Asian-language cards may use formats like "003/007" or "S1a 003/007" or "sv1 003/007"
  * Some promo cards have formats like "SWSH039" or "SVP 050"
  * If partially obscured, use visible digits + set symbol to narrow it down

Step 3: READ THE SET CODE AND IDENTIFY THE SET
- READ the actual set code printed on the card near the card number. This is the SHORT ALPHANUMERIC CODE like "s8b", "sv2a", "PFLen", "SV5K", etc.
- The set code is your PRIMARY source of truth for identifying the set. Do NOT guess the set from the Pokemon name alone.
- Report the set code EXACTLY as printed (e.g., "PFLen", "s8b", "sv2a", "SV5K").
- Use this set code mapping to determine the English set name:
  Japanese/Korean/Chinese sets: s6a = Eevee Heroes, s6b = Fusion Arts, s8 = Fusion Arts, s8a = 25th Anniversary Collection, s8b = VMAX Climax, s9 = Star Birth, s9a = Battle Region, s10 = Time Gazer/Space Juggler, s11 = Lost Abyss, s11a = Incandescent Arcana, s12 = Silver Tempest, s12a = VSTAR Universe, sv1 = Scarlet ex, sv2a = Pokemon Card 151, sv3 = Ruler of the Black Flame, SV5K = Wild Force, SV5M = Cyber Judge, sv6 = Night Wanderer, sv7 = Stellar Crown, sv8 = Super Electric Breaker
  English sets: PFLen = Phantasmal Flames, SFA = Surging Sparks, PAF = Paldean Fates, OBF = Obsidian Flames, PAL = Paldea Evolved, SVI = Scarlet & Violet, CRZ = Crown Zenith, SIT = Silver Tempest, LOR = Lost Origin, ASR = Astral Radiance, BRS = Brilliant Stars, FST = Fusion Strike, EVS = Evolving Skies, CRE = Chilling Reign, BST = Battle Styles, SHF = Shining Fates, VIV = Vivid Voltage, DAA = Darkness Ablaze, RCL = Rebel Clash, SSH = Sword & Shield, PRE = Prismatic Evolutions, TEF = Temporal Forces, TWM = Twilight Masquerade, SCR = Stellar Crown, SSP = Surging Sparks
- If the set code is not in the mapping above, still report the exact set code — do NOT invent a set name.
- Consider the card's era (vintage WOTC, modern Scarlet & Violet, etc.) based on card design/border style

Step 4: REPORT WHAT YOU READ
- The set code and card number you READ from the card are the source of truth.
- Do NOT substitute a different set code or card number based on your knowledge.
- Secret rares have numbers ABOVE the set total (e.g., "125/094") — this is normal, do NOT "fix" it.
- If the set code is "PFLen", report "PFLen" — do NOT change it to "EVO" or any other code.
- If you cannot read a digit clearly, note the uncertainty but report your best reading.

Step 5: FINAL DETERMINATION
- Combine: Pokemon name (from text + artwork) + card number (as read) + set code (as read)
- Report the verified cardName, setName, and setNumber in the JSON response.

Respond ONLY with valid JSON in this exact format:
{
  "cardName": "ENGLISH name of the Pokemon card (e.g. 'Charizard ex') - translate if card is in another language",
  "setCode": "The set code EXACTLY as printed on the card (e.g. 'PFLen', 's8b', 'sv2a', 'OBF'). READ THIS FROM THE CARD.",
  "setName": "ENGLISH name of the set derived from the set code (e.g. PFLen = 'Phantasmal Flames', s8b = 'VMAX Climax')",
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
  },
  "tag": {
    "overallGrade": 8.5,
    "centering": { "grade": 9.0, "notes": "Assessment details" },
    "corners": { "grade": 8.5, "notes": "Assessment details" },
    "edges": { "grade": 8.5, "notes": "Assessment details" },
    "surface": { "grade": 8.0, "notes": "Assessment details - TAG is stricter on surface" },
    "notes": "Any additional notes about TAG-specific grading"
  },
  "cgc": {
    "grade": 8.5,
    "centering": "Description of centering assessment",
    "corners": "Description of corners assessment",
    "edges": "Description of edges assessment",
    "surface": "Description of surface assessment",
    "notes": "Any additional notes about CGC-specific grading"
  }
}

CRITICAL REMINDERS:
- PSA grade: valid values are 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10 (NO 9.5)
- BGS grades: use 0.5 increments (7, 7.5, 8, 8.5, 9, 9.5, 10)
- Ace grades: WHOLE NUMBERS ONLY (1-10, never 8.5 or 9.5)
- TAG grades: use 0.5 increments (7, 7.5, 8, 8.5, 9, 9.5, 10) - stricter on surface than BGS
- CGC grades: use 0.5 increments (7, 7.5, 8, 8.5, 9, 9.5, 10) - no sub-grades, text descriptions only

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
  return name.replace(/[\s-]*(ex|EX|gx|GX|v|V|vmax|VMAX|vstar|VSTAR|☆)\s*$/i, "").trim();
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
      signal: AbortSignal.timeout(5000),
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

async function lookupCardOnline(cardName: string, setNumber: string, setName: string, setCode?: string): Promise<{ cardName: string; setName: string; setNumber: string; _score?: number } | null> {
  try {
    await ensureSetsCached();

    const rawNumber = setNumber?.split("/")[0]?.replace(/^0+/, "") || "";
    const setTotal = setNumber?.split("/")[1]?.replace(/^0+/, "") || "";
    const baseName = stripSuffix(cardName);
    const numericTotal = parseInt(setTotal) || 0;
    const numericNumber = parseInt(rawNumber) || 0;

    const resolvedSet = setCode ? findSetByCode(setCode) : null;
    let namedSet = setName ? findSetByName(setName) : null;
    const matchingSets = numericTotal > 0 ? findSetsByTotal(numericTotal) : [];

    if (namedSet && numericTotal > 0 && namedSet.printedTotal !== numericTotal && namedSet.total !== numericTotal) {
      const betterMatch = matchingSets.find(s => {
        const sClean = s.name.toLowerCase().replace(/[—–-]/g, " ").replace(/[^a-z0-9\s]/g, "").trim();
        const nClean = (setName || "").toLowerCase().replace(/\(english\)|\(unlimited\)|\(1st edition\)|\(japanese\)/gi, "").replace(/[—–-]/g, " ").replace(/[^a-z0-9\s]/g, "").trim();
        return sClean.includes(nClean) || nClean.includes(sClean);
      });
      if (betterMatch) {
        console.log(`[card-lookup] Set name "${setName}" initially matched "${namedSet.name}" (total=${namedSet.printedTotal}), but total ${numericTotal} matches "${betterMatch.name}" better`);
        namedSet = betterMatch;
      }
    }

    const isKnownSet = !!(resolvedSet || namedSet || matchingSets.length > 0);
    const setIsAsianOnly = setCode && !resolvedSet && /^s\d|^sv\d|^sm\d/.test(setCode.toLowerCase());

    if (resolvedSet) {
      console.log(`[card-lookup] Set code "${setCode}" resolved to: ${resolvedSet.name} (${resolvedSet.id}, total=${resolvedSet.printedTotal})`);
    } else if (namedSet) {
      console.log(`[card-lookup] Set name "${setName}" matched to: ${namedSet.name} (${namedSet.id}, total=${namedSet.printedTotal})`);
    } else if (matchingSets.length > 0) {
      console.log(`[card-lookup] ${matchingSets.length} sets match total=${numericTotal}: ${matchingSets.map(s => s.name).join(", ")}`);
    } else if (setIsAsianOnly) {
      console.log(`[card-lookup] Set code "${setCode}" appears to be Asian-exclusive, will search by name+number`);
    } else {
      console.log(`[card-lookup] No cached set match for name="${setName}" code="${setCode || "none"}" total=${numericTotal}`);
    }

    console.log(`[card-lookup] Looking up: name="${cardName}" number="${rawNumber}" total="${setTotal}" set="${setName}" code="${setCode || "none"}"`);

    const queries: string[] = [];

    const effectiveSetId = resolvedSet?.id || namedSet?.id || "";
    const effectiveSetCode = resolvedSet?.ptcgoCode || namedSet?.ptcgoCode || "";

    if (effectiveSetId && rawNumber) {
      queries.push(`set.id:"${effectiveSetId}" number:${rawNumber}`);
    }
    if (effectiveSetCode && rawNumber) {
      queries.push(`set.ptcgoCode:"${effectiveSetCode}" number:${rawNumber}`);
    }
    if (setCode && rawNumber && setCode !== effectiveSetId) {
      queries.push(`set.id:"${setCode}*" number:${rawNumber}`);
      queries.push(`set.ptcgoCode:"${setCode}*" number:${rawNumber}`);
    }
    if (rawNumber && baseName) {
      queries.push(`number:${rawNumber} name:"${baseName}*"`);
    }
    if (rawNumber && numericTotal > 0 && matchingSets.length > 0 && matchingSets.length <= 5) {
      for (const ms of matchingSets) {
        queries.push(`number:${rawNumber} set.id:"${ms.id}"`);
      }
    } else if (rawNumber && setTotal) {
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

    const results = await Promise.all(queries.map(q => queryPokemonTcgApi(q)));
    for (const cards of results) {
      for (const c of cards) {
        const id = c.id || `${c.name}-${c.number}-${c.set?.name}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          allCards.push(c);
        }
      }
    }

    if (allCards.length === 0) {
      console.log(`[card-lookup] No results from API`);
      return null;
    }

    let bestCard = allCards[0];
    let bestScore = -1;

    const resolvedSetId = (resolvedSet?.id || namedSet?.id || "").toLowerCase();

    for (const card of allCards) {
      const nameScore = scoreName(card.name || "", cardName);
      let score = nameScore * 1.5;

      const cardNum = String(card.number || "").replace(/^0+/, "");
      if (cardNum === rawNumber) score += 30;

      const cardSetId = (card.set?.id || "").toLowerCase();
      const cardSetName = (card.set?.name || "").toLowerCase();
      const querySetName = (setName || "").toLowerCase();
      let setMatched = false;

      if (resolvedSetId && cardSetId === resolvedSetId) {
        score += 35;
        setMatched = true;
      } else if (querySetName && cardSetName === querySetName) {
        score += 20;
        setMatched = true;
      } else if (querySetName && (cardSetName.includes(querySetName) || querySetName.includes(cardSetName))) {
        score += 10;
        setMatched = true;
      }

      const cardTotal = card.set?.printedTotal || 0;
      if (numericTotal > 0) {
        if (cardTotal === numericTotal) {
          score += 20;
        } else {
          const cachedSet = findSetByName(card.set?.name || "");
          if (cachedSet && numericNumber <= cachedSet.total) {
            score -= 5;
          } else {
            score -= 15;
          }
        }
      }

      if (nameScore === 0) {
        score = Math.min(score, setMatched ? 40 : 30);
      }

      console.log(`[card-lookup]   Candidate: ${card.name} #${card.number} (${card.set?.name}, total=${cardTotal}) nameScore=${nameScore} score=${score}`);

      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    if (bestScore < 50) {
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
      _score: bestScore,
    };
  } catch (err: any) {
    console.log(`[card-lookup] Lookup failed:`, err?.message);
    return null;
  }
}

interface CardBoundsHint {
  leftPercent?: number;
  topPercent?: number;
  rightPercent?: number;
  bottomPercent?: number;
}

function fitLineToEdge(
  pixels: Buffer, sw: number, sh: number,
  scanXStart: number, scanXEnd: number,
  scanYFrom: number, scanYTo: number,
  direction: "down" | "up"
): number {
  const getPixel = (x: number, y: number) => {
    if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
    return pixels[y * sw + x];
  };

  const sobelY = (x: number, y: number): number => {
    return (
      -getPixel(x - 1, y - 1) - 2 * getPixel(x, y - 1) - getPixel(x + 1, y - 1) +
      getPixel(x - 1, y + 1) + 2 * getPixel(x, y + 1) + getPixel(x + 1, y + 1)
    );
  };

  const EDGE_THRESHOLD = 12;
  const NUM_SAMPLES = 50;
  const edgePoints: { x: number; y: number; grad: number }[] = [];
  const xStep = (scanXEnd - scanXStart) / (NUM_SAMPLES - 1);

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const sampleX = Math.round(scanXStart + i * xStep);
    let bestY = -1;
    let bestGrad = 0;

    if (direction === "up") {
      for (let y = scanYFrom; y >= scanYTo; y--) {
        const gy = Math.abs(sobelY(sampleX, y));
        if (gy >= EDGE_THRESHOLD && gy > bestGrad) {
          bestGrad = gy;
          bestY = y;
        }
        if (bestY >= 0 && y < bestY - 8) break;
      }
    } else {
      for (let y = scanYFrom; y <= scanYTo; y++) {
        const gy = Math.abs(sobelY(sampleX, y));
        if (gy >= EDGE_THRESHOLD && gy > bestGrad) {
          bestGrad = gy;
          bestY = y;
        }
        if (bestY >= 0 && y > bestY + 8) break;
      }
    }

    if (bestY >= 0) {
      edgePoints.push({ x: sampleX, y: bestY, grad: bestGrad });
    }
  }

  if (edgePoints.length < 8) return NaN;

  const sortedByY = [...edgePoints].sort((a, b) => a.y - b.y);
  const q1 = sortedByY[Math.floor(edgePoints.length * 0.25)].y;
  const q3 = sortedByY[Math.floor(edgePoints.length * 0.75)].y;
  const iqr = q3 - q1;
  const tolerance = Math.max(iqr * 1.5, sh * 0.025);
  const medianY = sortedByY[Math.floor(edgePoints.length / 2)].y;
  const filtered = edgePoints.filter(p => Math.abs(p.y - medianY) <= tolerance);

  if (filtered.length < 6) return NaN;

  const bestFit = (pts: { x: number; y: number }[]) => {
    const n = pts.length;
    const sumX = pts.reduce((s, p) => s + p.x, 0);
    const sumY = pts.reduce((s, p) => s + p.y, 0);
    const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 0.001) return { slope: 0, residual: Infinity };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const residual = pts.reduce((s, p) => s + Math.abs(p.y - (slope * p.x + intercept)), 0) / n;
    return { slope, residual };
  };

  let best = bestFit(filtered);
  for (let iter = 0; iter < 2; iter++) {
    const fit = bestFit(filtered);
    const intercept = (filtered.reduce((s, p) => s + p.y, 0) - fit.slope * filtered.reduce((s, p) => s + p.x, 0)) / filtered.length;
    const residuals = filtered.map(p => Math.abs(p.y - (fit.slope * p.x + intercept)));
    const medRes = [...residuals].sort((a, b) => a - b)[Math.floor(residuals.length / 2)];
    const threshold = Math.max(medRes * 2.5, 2);
    const refined = filtered.filter((_, i) => residuals[i] <= threshold);
    if (refined.length < 5) break;
    filtered.length = 0;
    filtered.push(...refined);
    best = bestFit(filtered);
  }

  return Math.atan(best.slope) * (180 / Math.PI);
}

async function detectCardAngle(dataUri: string, boundsHint?: CardBoundsHint): Promise<number> {
  try {
    const base64Data = dataUri.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const { width, height } = await sharp(buffer).metadata() as { width: number; height: number };
    if (!width || !height) return 0;

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

    const left = boundsHint?.leftPercent ?? 15;
    const right = boundsHint?.rightPercent ?? 85;
    const top = boundsHint?.topPercent ?? 10;
    const bottom = boundsHint?.bottomPercent ?? 90;

    const scanXStart = Math.round(sw * (left + 3) / 100);
    const scanXEnd = Math.round(sw * (right - 3) / 100);

    const bottomEdgeCenter = Math.round(sh * bottom / 100);
    const bottomScanFrom = Math.min(sh - 2, Math.round(bottomEdgeCenter + sh * 0.10));
    const bottomScanTo = Math.max(1, Math.round(bottomEdgeCenter - sh * 0.10));
    const bottomAngle = fitLineToEdge(pixels as any, sw, sh, scanXStart, scanXEnd, bottomScanFrom, bottomScanTo, "up");

    const topEdgeCenter = Math.round(sh * top / 100);
    const topScanFrom = Math.max(1, Math.round(topEdgeCenter - sh * 0.10));
    const topScanTo = Math.min(sh - 2, Math.round(topEdgeCenter + sh * 0.10));
    const topAngle = fitLineToEdge(pixels as any, sw, sh, scanXStart, scanXEnd, topScanFrom, topScanTo, "down");

    const validAngles: number[] = [];
    if (!isNaN(bottomAngle)) validAngles.push(bottomAngle);
    if (!isNaN(topAngle)) validAngles.push(topAngle);

    let angleDeg: number;
    if (validAngles.length === 0) {
      console.log(`[detect-angle] No edges detected`);
      return 0;
    } else if (validAngles.length === 2 && Math.abs(validAngles[0] - validAngles[1]) > 2) {
      angleDeg = Math.abs(validAngles[0]) < Math.abs(validAngles[1]) ? validAngles[0] : validAngles[1];
      console.log(`[detect-angle] Top: ${topAngle.toFixed(3)}°, Bottom: ${bottomAngle.toFixed(3)}°, Divergent - using smaller: ${angleDeg.toFixed(3)}°`);
    } else {
      angleDeg = validAngles.reduce((s, v) => s + v, 0) / validAngles.length;
      console.log(`[detect-angle] Top: ${topAngle?.toFixed(3) ?? 'N/A'}°, Bottom: ${bottomAngle?.toFixed(3) ?? 'N/A'}°, Average: ${angleDeg.toFixed(3)}°`);
    }

    const clamped = Math.max(-10, Math.min(10, angleDeg));
    return parseFloat(clamped.toFixed(2));
  } catch (err) {
    console.error("Card angle detection failed:", err);
    return 0;
  }
}

const boundsCache = new Map<string, { leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number }>();

async function convertHeifToJpeg(buffer: Buffer): Promise<Buffer> {
  const fs = await import("fs");
  const { execSync } = await import("child_process");
  const os = await import("os");
  const path = await import("path");
  const tmpDir = os.tmpdir();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const heifPath = path.join(tmpDir, `card_${id}.heic`);
  const jpegPath = path.join(tmpDir, `card_${id}.jpg`);
  try {
    fs.writeFileSync(heifPath, buffer);
    execSync(`heif-convert "${heifPath}" "${jpegPath}"`, { timeout: 10000 });
    const jpegBuf = fs.readFileSync(jpegPath);
    return jpegBuf;
  } finally {
    try { fs.unlinkSync(heifPath); } catch {}
    try { fs.unlinkSync(jpegPath); } catch {}
  }
}

async function optimizeImageForAI(dataUri: string, maxDim: number = 1536): Promise<string> {
  try {
    const mimeMatch = dataUri.match(/^data:(image\/[^;]+);base64,/);
    const mime = (mimeMatch?.[1] || "").toLowerCase();
    const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, "");
    let buffer = Buffer.from(base64Data, "base64");

    const isHeif = mime.includes("heic") || mime.includes("heif") ||
      (buffer.length > 12 && buffer.toString("ascii", 4, 12).includes("ftyp"));

    if (isHeif) {
      console.log(`[optimize] Converting HEIF/HEIC image (${Math.round(buffer.length / 1024)}KB) to JPEG`);
      try {
        buffer = Buffer.from(await sharp(buffer).jpeg({ quality: 90 }).toBuffer());
      } catch {
        console.log(`[optimize] Sharp HEIF failed, trying heif-convert CLI...`);
        buffer = Buffer.from(await convertHeifToJpeg(buffer));
      }
    }

    const meta = await sharp(buffer).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (w <= maxDim && h <= maxDim && meta.format === "jpeg" && !isHeif) return dataUri;
    let pipeline = sharp(buffer);
    if (w > maxDim || h > maxDim) {
      pipeline = pipeline.resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true });
    }
    const optimized = await pipeline.jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${optimized.toString("base64")}`;
  } catch (err) {
    console.error("[optimize] Image optimization failed:", err);
    return dataUri;
  }
}

function detectCardRegionByVariance(
  pixels: Buffer, sw: number, sh: number
): { leftPct: number; rightPct: number; topPct: number; bottomPct: number } | null {
  const CARD_WH_RATIO = 2.5 / 3.5;
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

  const findEdges = (profile: Float64Array): { start: number; end: number } => {
    let maxVar = 0;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] > maxVar) maxVar = profile[i];
    }
    if (maxVar < 10) return { start: Math.round(profile.length * 0.1), end: Math.round(profile.length * 0.9) };

    const threshold = maxVar * 0.20;

    let start = 0;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] >= threshold) { start = i; break; }
    }
    let end = profile.length - 1;
    for (let i = profile.length - 1; i >= 0; i--) {
      if (profile[i] >= threshold) { end = i; break; }
    }

    return { start, end };
  };

  const hEdges = findEdges(smoothCol);
  const vEdges = findEdges(smoothRow);

  const varW = hEdges.end - hEdges.start;
  const varH = vEdges.end - vEdges.start;
  if (varW < sw * 0.15 || varH < sh * 0.15) return null;

  const rawRatio = varW / varH;

  let adjLeft = hEdges.start;
  let adjRight = hEdges.end;
  let adjTop = vEdges.start;
  let adjBottom = vEdges.end;

  if (rawRatio > CARD_WH_RATIO * 1.3) {
    const expectedW = varH * CARD_WH_RATIO;
    const center = (hEdges.start + hEdges.end) / 2;
    adjLeft = Math.round(center - expectedW / 2);
    adjRight = Math.round(center + expectedW / 2);
  } else if (rawRatio < CARD_WH_RATIO * 0.7) {
    const expectedH = varW / CARD_WH_RATIO;
    const center = (vEdges.start + vEdges.end) / 2;
    adjTop = Math.round(center - expectedH / 2);
    adjBottom = Math.round(center + expectedH / 2);
  }

  return {
    leftPct: (Math.max(0, adjLeft) / sw) * 100,
    rightPct: (Math.min(sw - 1, adjRight) / sw) * 100,
    topPct: (Math.max(0, adjTop) / sh) * 100,
    bottomPct: (Math.min(sh - 1, adjBottom) / sh) * 100,
  };
}

function detectBoundsAtResolution(
  pixels: Buffer, sw: number, sh: number,
  _scanRange: number, _minVoteRatio: number,
  xConstraint?: { minPct: number; maxPct: number },
  yConstraint?: { minPct: number; maxPct: number }
): { leftPct: number; rightPct: number; topPct: number; bottomPct: number; angleDeg: number; confidence: number } {
  const CARD_WH_RATIO = 2.5 / 3.5;
  const CARD_WH_RATIO_ROTATED = 3.5 / 2.5;
  const RATIO_TOLERANCE = 0.12;

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
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(profile.length - 1, i + radius); j++) {
        sum += profile[j];
        count++;
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

    const threshold = maxVal * 0.08;

    const rawPeaks: { pos: number; strength: number }[] = [];
    for (let i = cMin + 1; i < cMax; i++) {
      if (profile[i] >= threshold &&
          profile[i] >= profile[i - 1] &&
          profile[i] >= profile[i + 1]) {
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

    return selected.slice(0, 20);
  };

  const xCMin = xConstraint ? Math.max(2, Math.round(sw * xConstraint.minPct / 100)) : 2;
  const xCMax = xConstraint ? Math.min(sw - 3, Math.round(sw * xConstraint.maxPct / 100)) : sw - 3;
  const yCMin = yConstraint ? Math.max(2, Math.round(sh * yConstraint.minPct / 100)) : 2;
  const yCMax = yConstraint ? Math.min(sh - 3, Math.round(sh * yConstraint.maxPct / 100)) : sh - 3;

  const vPeaks = findPeaks(vSmooth, Math.max(2, Math.round(sw * 0.03)), xCMin, xCMax);
  const hPeaks = findPeaks(hSmooth, Math.max(2, Math.round(sh * 0.03)), yCMin, yCMax);

  const colBrightness = new Float64Array(sw);
  for (let x = 0; x < sw; x++) {
    let sum = 0;
    const step = Math.max(1, Math.round(sh / 30));
    let count = 0;
    for (let y = 0; y < sh; y += step) {
      sum += getPixel(x, y);
      count++;
    }
    colBrightness[x] = count > 0 ? sum / count : 0;
  }

  const rowBrightness = new Float64Array(sh);
  for (let y = 0; y < sh; y++) {
    let sum = 0;
    const step = Math.max(1, Math.round(sw / 30));
    let count = 0;
    for (let x = 0; x < sw; x += step) {
      sum += getPixel(x, y);
      count++;
    }
    rowBrightness[y] = count > 0 ? sum / count : 0;
  }

  interface RectHypothesis {
    left: number; right: number; top: number; bottom: number;
    score: number;
    lStr: number; rStr: number; tStr: number; bStr: number;
  }

  let best: RectHypothesis = {
    left: Math.round(sw * 0.1), right: Math.round(sw * 0.9),
    top: Math.round(sh * 0.1), bottom: Math.round(sh * 0.9),
    score: -1, lStr: 0, rStr: 0, tStr: 0, bStr: 0,
  };

  for (let li = 0; li < vPeaks.length; li++) {
    for (let ri = 0; ri < vPeaks.length; ri++) {
      if (li === ri) continue;
      const lp = vPeaks[li];
      const rp = vPeaks[ri];
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
            if (dist < bestBotDist) {
              bestBotDist = dist;
              bestBotPeak = bp;
            }
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
          if (sizeRatio > 0.85) {
            sizeScore = Math.max(0, 1 - (sizeRatio - 0.85) * 5);
          } else {
            sizeScore = Math.min(1, sizeRatio / 0.60);
          }

          const maxEdge = Math.max(lp.strength, rp.strength, tp.strength, botStr, 1);
          const edgeNorm = (lp.strength + rp.strength + tp.strength + botStr) / (4 * maxEdge);

          const margin = Math.max(sw, sh) * 0.03;
          let edgeProximityPenalty = 1.0;
          if (lp.pos < margin) edgeProximityPenalty *= 0.5;
          if (rp.pos > sw - margin) edgeProximityPenalty *= 0.5;
          if (tp.pos < margin) edgeProximityPenalty *= 0.5;
          if (botPos > sh - margin) edgeProximityPenalty *= 0.5;

          const sampleBand = Math.max(2, Math.round(cardW * 0.05));

          const sampleBrightness = (x1: number, y1: number, x2: number, y2: number, isVert: boolean): number => {
            let sum = 0;
            let ct = 0;
            const len = isVert ? (y2 - y1) : (x2 - x1);
            const steps = Math.max(5, Math.min(20, Math.abs(len)));
            for (let i = 0; i < steps; i++) {
              const t = i / (steps - 1);
              const sx = isVert ? Math.round(x1) : Math.round(x1 + (x2 - x1) * t);
              const sy = isVert ? Math.round(y1 + (y2 - y1) * t) : Math.round(y1);
              if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) {
                sum += getPixel(sx, sy);
                ct++;
              }
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
              if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) {
                values.push(getPixel(sx, sy));
              }
            }
            if (values.length < 3) return 0;
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            return Math.sqrt(values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length);
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
          const totalScore = (ratioScore * 4.0 + sizeScore * 3.0 + edgeNorm * 1.0 + normalizedContrast * 2.5 + minContrastScore * 1.5 + exteriorUniformity * 4.0) * edgeProximityPenalty * rotatedPenalty;

          if (totalScore > best.score) {
            best = {
              left: lp.pos, right: rp.pos, top: tp.pos, bottom: botPos,
              score: totalScore, lStr: lp.strength, rStr: rp.strength, tStr: tp.strength, bStr: botStr,
            };
          }
        };

          if (bestBotPeak) {
            tryBottom(bestBotPeak.pos, bestBotPeak.strength);
          }

          const inferredBot = Math.round(tp.pos + expectedH);
          if (inferredBot > tp.pos && inferredBot < sh - 2) {
            tryBottom(inferredBot, hSmooth[Math.min(inferredBot, sh - 1)] || 0);
          }
        }
      }

      if (hPeaks.length === 0) {
        for (const fallbackRatio of ratiosToTry) {
          const expectedH = cardW / fallbackRatio;
          const centerY = sh / 2;
          const inferredTop = Math.round(centerY - expectedH / 2);
          const inferredBot = Math.round(centerY + expectedH / 2);
          if (inferredTop >= 0 && inferredBot < sh) {
            const ratio = cardW / (inferredBot - inferredTop);
            const ratioError = Math.abs(ratio - fallbackRatio) / fallbackRatio;
            const ratioScore = Math.max(0, 1 - ratioError / RATIO_TOLERANCE);
            const sizeRatio = (cardW * (inferredBot - inferredTop)) / (sw * sh);
            let sizeScore: number;
            if (sizeRatio > 0.80) sizeScore = Math.max(0, 1 - (sizeRatio - 0.80) * 5);
            else if (sizeRatio > 0.15) sizeScore = 1.0;
            else sizeScore = Math.min(1, sizeRatio / 0.15);
            const totalScore = ratioScore * 4.0 + sizeScore * 1.5 + 0.5;
            if (totalScore > best.score) {
              best = {
                left: lp.pos, right: rp.pos, top: inferredTop, bottom: inferredBot,
                score: totalScore, lStr: lp.strength, rStr: rp.strength, tStr: 0, bStr: 0,
              };
            }
          }
        }
      }
    }
  }

  if (vPeaks.length === 0 && hPeaks.length >= 2) {
    for (const fallbackRatio of [CARD_WH_RATIO, CARD_WH_RATIO_ROTATED]) {
      for (let ti = 0; ti < hPeaks.length; ti++) {
        for (let bi = ti + 1; bi < hPeaks.length; bi++) {
          const tp = hPeaks[ti];
          const bp = hPeaks[bi];
          const cardH = bp.pos - tp.pos;
          if (cardH < sh * 0.2) continue;
          const expectedW = cardH * fallbackRatio;
          const centerX = sw / 2;
          const inferredLeft = Math.round(centerX - expectedW / 2);
          const inferredRight = Math.round(centerX + expectedW / 2);
          if (inferredLeft >= 0 && inferredRight < sw) {
            const ratio = expectedW / cardH;
            const ratioError = Math.abs(ratio - fallbackRatio) / fallbackRatio;
            const ratioScore = Math.max(0, 1 - ratioError / RATIO_TOLERANCE);
            const sizeRatio = (expectedW * cardH) / (sw * sh);
            let sizeScore: number;
            if (sizeRatio > 0.80) sizeScore = Math.max(0, 1 - (sizeRatio - 0.80) * 5);
            else if (sizeRatio > 0.15) sizeScore = 1.0;
            else sizeScore = Math.min(1, sizeRatio / 0.15);
            const totalScore = ratioScore * 4.0 + sizeScore * 1.5 + 0.5;
            if (totalScore > best.score) {
              best = {
                left: inferredLeft, right: inferredRight, top: tp.pos, bottom: bp.pos,
                score: totalScore, lStr: 0, rStr: 0, tStr: tp.strength, bStr: bp.strength,
              };
            }
          }
        }
      }
    }
  }

  const leftCol = best.left;
  const rightCol = best.right;
  const topRow = best.top;
  const bottomRow = best.bottom;

  const extractAngleFromEdge = (
    edgePos: number, isVertical: boolean,
    searchBand: number, crossStart: number, crossEnd: number
  ): number => {
    const points: { main: number; cross: number }[] = [];
    const numSamples = Math.max(15, Math.min(50, Math.abs(crossEnd - crossStart)));
    const crossStep = (crossEnd - crossStart) / (numSamples - 1);
    const threshold = 8;
    const bandLo = Math.max(2, Math.round(edgePos - searchBand));
    const bandHi = Math.min((isVertical ? sw : sh) - 3, Math.round(edgePos + searchBand));

    for (let i = 0; i < numSamples; i++) {
      const cross = Math.round(crossStart + i * crossStep);
      if (cross < 2 || cross >= (isVertical ? sh : sw) - 2) continue;

      let bestMain = -1;
      let bestGrad = 0;
      for (let m = bandLo; m <= bandHi; m++) {
        if (m < 2 || m >= (isVertical ? sw : sh) - 2) continue;
        const gPrimary = isVertical ? Math.abs(sobelX(m, cross)) : Math.abs(sobelY(cross, m));
        const gSecondary = isVertical ? Math.abs(sobelY(m, cross)) : Math.abs(sobelX(cross, m));
        if (gPrimary >= threshold && gPrimary > gSecondary * 1.0 && gPrimary > bestGrad) {
          bestGrad = gPrimary;
          bestMain = m;
        }
      }
      if (bestMain >= 0) points.push({ main: bestMain, cross });
    }

    if (points.length < 6) return 0;
    const sortedByMain = [...points].sort((a, b) => a.main - b.main);
    const medianMain = sortedByMain[Math.floor(points.length / 2)].main;
    const q1 = sortedByMain[Math.floor(points.length * 0.25)].main;
    const q3 = sortedByMain[Math.floor(points.length * 0.75)].main;
    const iqr = q3 - q1;
    const tolerance = Math.max(iqr * 2, searchBand * 0.6, 2);
    let filtered = points.filter(p => Math.abs(p.main - medianMain) <= tolerance);
    if (filtered.length < 5) return 0;

    const lineFit = (pts: { main: number; cross: number }[]) => {
      const n = pts.length;
      const sC = pts.reduce((s, p) => s + p.cross, 0);
      const sM = pts.reduce((s, p) => s + p.main, 0);
      const sCM = pts.reduce((s, p) => s + p.cross * p.main, 0);
      const sC2 = pts.reduce((s, p) => s + p.cross * p.cross, 0);
      const denom = n * sC2 - sC * sC;
      if (Math.abs(denom) < 0.001) return { slope: 0, residual: Infinity };
      const slope = (n * sCM - sC * sM) / denom;
      const intercept = (sM - slope * sC) / n;
      const residual = pts.reduce((s, p) => s + Math.abs(p.main - (slope * p.cross + intercept)), 0) / n;
      return { slope, residual };
    };

    for (let iter = 0; iter < 2; iter++) {
      const fit = lineFit(filtered);
      if (fit.residual === Infinity) break;
      const intercept = (filtered.reduce((s, p) => s + p.main, 0) - fit.slope * filtered.reduce((s, p) => s + p.cross, 0)) / filtered.length;
      const residuals = filtered.map(p => Math.abs(p.main - (fit.slope * p.cross + intercept)));
      const medRes = [...residuals].sort((a, b) => a - b)[Math.floor(residuals.length / 2)];
      const thresh = Math.max(medRes * 2.5, 1.5);
      const refined = filtered.filter((_, i) => residuals[i] <= thresh);
      if (refined.length < 5) break;
      filtered = refined;
    }

    const finalFit = lineFit(filtered);
    if (finalFit.residual === Infinity) return 0;
    return Math.atan(finalFit.slope) * (180 / Math.PI);
  };

  const cardWidthPx = rightCol - leftCol;
  const angleBand = Math.max(3, Math.round(cardWidthPx * 0.04));
  const cardTop10 = Math.round(topRow + (bottomRow - topRow) * 0.1);
  const cardBot90 = Math.round(topRow + (bottomRow - topRow) * 0.9);

  let angleDeg = 0;
  if (cardWidthPx > sw * 0.1) {
    const leftAngle = extractAngleFromEdge(leftCol, true, angleBand, cardTop10, cardBot90);
    const rightAngle = extractAngleFromEdge(rightCol, true, angleBand, cardTop10, cardBot90);

    if (Math.abs(leftAngle) < 5 && Math.abs(rightAngle) < 5) {
      if (Math.abs(leftAngle - rightAngle) < 2) {
        angleDeg = (leftAngle + rightAngle) / 2;
      } else {
        angleDeg = Math.abs(leftAngle) < Math.abs(rightAngle) ? leftAngle : rightAngle;
      }
    } else if (Math.abs(leftAngle) < 5) {
      angleDeg = leftAngle;
    } else if (Math.abs(rightAngle) < 5) {
      angleDeg = rightAngle;
    }
  }

  const detW = rightCol - leftCol;
  const detH = bottomRow - topRow;
  const detectedRatio = detH > 0 ? detW / detH : 0;
  const ratioDeviation = Math.abs(detectedRatio - CARD_WH_RATIO) / CARD_WH_RATIO;
  const ratioScore = Math.max(0, 1 - ratioDeviation * 3);
  const sizeScore = (detW > sw * 0.2 && detH > sh * 0.2) ? 1 : 0.3;
  const overallConfidence = parseFloat((ratioScore * 0.5 + sizeScore * 0.3 + (best.score > 0 ? 0.2 : 0)).toFixed(2));

  console.log(`[detect-bounds] ${sw}x${sh} found ${vPeaks.length} vLines, ${hPeaks.length} hLines → rect [${leftCol},${topRow}]-[${rightCol},${bottomRow}] ratio=${detectedRatio.toFixed(3)} conf=${overallConfidence} angle=${angleDeg.toFixed(2)}`);

  const refineEdgeSingle = (
    edgePos: number, isVert: boolean, isMinEdge: boolean,
    crossStart: number, crossEnd: number,
    searchRad: number
  ): number => {
    const numSamples = 50;
    const outerBand = Math.max(5, Math.round(searchRad * 0.6));
    const dim = isVert ? sw : sh;

    const scoreAt = (pos: number, crossPos: number): number => {
      if (pos < outerBand + 1 || pos >= dim - outerBand - 2) return -1;
      let outsideSum = 0, insideSum = 0, outsideSqSum = 0, insideSqSum = 0;
      for (let k = 1; k <= outerBand; k++) {
        let outPx: number, inPx: number;
        if (isVert) {
          if (isMinEdge) { outPx = getPixel(pos - k, crossPos); inPx = getPixel(pos + k, crossPos); }
          else { outPx = getPixel(pos + k, crossPos); inPx = getPixel(pos - k, crossPos); }
        } else {
          if (isMinEdge) { outPx = getPixel(crossPos, pos - k); inPx = getPixel(crossPos, pos + k); }
          else { outPx = getPixel(crossPos, pos + k); inPx = getPixel(crossPos, pos - k); }
        }
        outsideSum += outPx; insideSum += inPx;
        outsideSqSum += outPx * outPx; insideSqSum += inPx * inPx;
      }
      const outsideAvg = outsideSum / outerBand;
      const insideAvg = insideSum / outerBand;
      const gradient = Math.abs(insideAvg - outsideAvg);
      const outsideVar = (outsideSqSum / outerBand) - (outsideAvg * outsideAvg);
      const outsideUnif = 1 / (1 + Math.max(0, outsideVar) / 150);
      let sobelGrad = 0;
      if (isVert) {
        sobelGrad = Math.abs(sobelX(pos, crossPos));
      } else {
        sobelGrad = Math.abs(sobelY(crossPos, pos));
      }
      const sobelScore = Math.min(1, sobelGrad / 100);
      const distNorm = Math.abs(pos - edgePos) / searchRad;
      const proxBonus = 1 / (1 + distNorm * distNorm * 2);
      return (gradient * 0.6 + sobelGrad * 0.4) * outsideUnif * proxBonus * (1 + sobelScore * 0.3);
    };

    const refinedPositions: { pos: number; score: number }[] = [];
    for (let i = 0; i < numSamples; i++) {
      const t = (i + 0.5) / numSamples;
      const crossPos = Math.round(crossStart + (crossEnd - crossStart) * t);
      let bestScore = -1;
      let bestPos = edgePos;
      const scanMin = Math.max(outerBand + 1, edgePos - searchRad);
      const scanMax = Math.min(dim - outerBand - 2, edgePos + searchRad);
      for (let pos = scanMin; pos <= scanMax; pos++) {
        const s = scoreAt(pos, crossPos);
        if (s > bestScore) { bestScore = s; bestPos = pos; }
      }
      if (bestPos > scanMin && bestPos < scanMax && bestScore > 0) {
        const sLeft = scoreAt(bestPos - 1, crossPos);
        const sRight = scoreAt(bestPos + 1, crossPos);
        if (sLeft > 0 && sRight > 0) {
          const denom = 2 * (2 * bestScore - sLeft - sRight);
          if (Math.abs(denom) > 0.001) {
            const offset = (sLeft - sRight) / denom;
            refinedPositions.push({ pos: bestPos + Math.max(-0.5, Math.min(0.5, offset)), score: bestScore });
            continue;
          }
        }
      }
      refinedPositions.push({ pos: bestPos, score: bestScore });
    }

    refinedPositions.sort((a, b) => a.pos - b.pos);
    const q1 = Math.floor(refinedPositions.length * 0.25);
    const q3 = Math.floor(refinedPositions.length * 0.75);
    const iqrSlice = refinedPositions.slice(q1, q3 + 1);
    const medianPos = iqrSlice[Math.floor(iqrSlice.length / 2)].pos;
    const iqrRange = iqrSlice[iqrSlice.length - 1].pos - iqrSlice[0].pos;
    const tightTolerance = Math.max(2, iqrRange * 1.2);
    const tight = iqrSlice.filter(p => Math.abs(p.pos - medianPos) <= tightTolerance);
    if (tight.length >= 5) {
      const totalWeight = tight.reduce((s, p) => s + Math.max(0.01, p.score), 0);
      const weightedPos = tight.reduce((s, p) => s + p.pos * Math.max(0.01, p.score), 0) / totalWeight;
      return weightedPos;
    }
    return medianPos;
  };

  const refCardW = rightCol - leftCol;
  const refCardH = bottomRow - topRow;
  const pass1Radius = Math.max(6, Math.round(Math.min(refCardW, refCardH) * 0.15));
  const p1Left = refineEdgeSingle(leftCol, true, true, topRow, bottomRow, pass1Radius);
  const p1Right = refineEdgeSingle(rightCol, true, false, topRow, bottomRow, pass1Radius);
  const p1Top = refineEdgeSingle(topRow, false, true, leftCol, rightCol, pass1Radius);
  const p1Bottom = refineEdgeSingle(bottomRow, false, false, leftCol, rightCol, pass1Radius);

  const pass2Radius = Math.max(3, Math.round(pass1Radius * 0.4));
  const rLeftRaw = refineEdgeSingle(Math.round(p1Left), true, true, topRow, bottomRow, pass2Radius);
  const rRightRaw = refineEdgeSingle(Math.round(p1Right), true, false, topRow, bottomRow, pass2Radius);
  const rTopRaw = refineEdgeSingle(Math.round(p1Top), false, true, leftCol, rightCol, pass2Radius);
  const rBottomRaw = refineEdgeSingle(Math.round(p1Bottom), false, false, leftCol, rightCol, pass2Radius);

  let rLeft = rLeftRaw;
  let rRight = rRightRaw;
  let rTop = rTopRaw;
  let rBottom = rBottomRaw;

  const refinedW = rRight - rLeft;
  const refinedH = rBottom - rTop;
  if (refinedW > 0 && refinedH > 0) {
    const refinedRatio = refinedW / refinedH;
    const targetAR = Math.abs(refinedRatio - CARD_WH_RATIO) < Math.abs(refinedRatio - CARD_WH_RATIO_ROTATED) ? CARD_WH_RATIO : CARD_WH_RATIO_ROTATED;
    const arError = (refinedRatio - targetAR) / targetAR;
    if (Math.abs(arError) > 0.01 && Math.abs(arError) < 0.08) {
      const correction = (arError * refinedW * 0.3) / 2;
      rLeft += correction;
      rRight -= correction;
    }
  }

  console.log(`[detect-bounds] Refined: [${rLeft.toFixed(1)},${rTop.toFixed(1)}]-[${rRight.toFixed(1)},${rBottom.toFixed(1)}] (from [${leftCol},${topRow}]-[${rightCol},${bottomRow}], pass1=[${p1Left.toFixed(1)},${p1Top.toFixed(1)}]-[${p1Right.toFixed(1)},${p1Bottom.toFixed(1)}])`);

  return {
    leftPct: parseFloat(((rLeft / sw) * 100).toFixed(2)),
    rightPct: parseFloat(((rRight / sw) * 100).toFixed(2)),
    topPct: parseFloat(((rTop / sh) * 100).toFixed(2)),
    bottomPct: parseFloat(((rBottom / sh) * 100).toFixed(2)),
    angleDeg: parseFloat(angleDeg.toFixed(3)),
    confidence: overallConfidence,
  };
}

function detectInnerBorders(
  pixels: Buffer, sw: number, sh: number,
  outerLeft: number, outerRight: number, outerTop: number, outerBottom: number
): { innerLeftPct: number; innerTopPct: number; innerRightPct: number; innerBottomPct: number } | null {
  const cardW = outerRight - outerLeft;
  const cardH = outerBottom - outerTop;
  if (cardW < 10 || cardH < 10) return null;

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

  const scanMargin = Math.round(cardW * 0.03);
  const innerSearchMax = Math.round(cardW * 0.15);

  const leftSearchStart = outerLeft + scanMargin;
  const leftSearchEnd = outerLeft + innerSearchMax;
  const rightSearchStart = outerRight - innerSearchMax;
  const rightSearchEnd = outerRight - scanMargin;

  const topSearchStart = outerTop + scanMargin;
  const topSearchEnd = outerTop + Math.round(cardH * 0.15);
  const bottomSearchStart = outerBottom - Math.round(cardH * 0.15);
  const bottomSearchEnd = outerBottom - scanMargin;

  const yScanStart = outerTop + Math.round(cardH * 0.15);
  const yScanEnd = outerBottom - Math.round(cardH * 0.15);
  const xScanStart = outerLeft + Math.round(cardW * 0.15);
  const xScanEnd = outerRight - Math.round(cardW * 0.15);

  const findInnerEdge = (
    searchStart: number, searchEnd: number,
    isVertical: boolean, crossStart: number, crossEnd: number
  ): number | null => {
    const profile = new Float64Array(Math.abs(searchEnd - searchStart) + 1);
    const step = searchStart <= searchEnd ? 1 : -1;
    const crossStep = Math.max(1, Math.round(Math.abs(crossEnd - crossStart) / 60));

    let idx = 0;
    for (let p = searchStart; step > 0 ? p <= searchEnd : p >= searchEnd; p += step) {
      let sum = 0;
      for (let c = crossStart; c < crossEnd; c += crossStep) {
        if (isVertical) {
          const gx = Math.abs(sobelX(p, c));
          const gy = Math.abs(sobelY(p, c));
          if (gx > gy * 1.0 && gx > 6) sum += gx;
        } else {
          const gy = Math.abs(sobelY(c, p));
          const gx = Math.abs(sobelX(c, p));
          if (gy > gx * 1.0 && gy > 6) sum += gy;
        }
      }
      profile[idx] = sum;
      idx++;
    }

    let bestIdx = -1;
    let bestVal = 0;
    for (let i = 1; i < idx - 1; i++) {
      if (profile[i] > bestVal && profile[i] >= profile[i - 1] && profile[i] >= profile[i + 1]) {
        bestVal = profile[i];
        bestIdx = i;
      }
    }

    if (bestIdx < 0 || bestVal < 1) return null;

    return searchStart + bestIdx * step;
  };

  const innerLeft = findInnerEdge(leftSearchStart, leftSearchEnd, true, yScanStart, yScanEnd);
  const innerRight = findInnerEdge(rightSearchEnd, rightSearchStart, true, yScanStart, yScanEnd);
  const innerTop = findInnerEdge(topSearchStart, topSearchEnd, false, xScanStart, xScanEnd);
  const innerBottom = findInnerEdge(bottomSearchEnd, bottomSearchStart, false, xScanStart, xScanEnd);

  if (innerLeft === null && innerRight === null && innerTop === null && innerBottom === null) {
    return null;
  }

  const defaultBorderH = cardW * 0.05;
  const defaultBorderV = cardH * 0.04;

  const iL = innerLeft ?? Math.round(outerLeft + defaultBorderH);
  const iR = innerRight ?? Math.round(outerRight - defaultBorderH);
  const iT = innerTop ?? Math.round(outerTop + defaultBorderV);
  const iB = innerBottom ?? Math.round(outerBottom - defaultBorderV);

  if (iL >= iR || iT >= iB) return null;
  if (iL <= outerLeft || iR >= outerRight || iT <= outerTop || iB >= outerBottom) return null;

  const leftBorder = (iL - outerLeft) / cardW;
  const rightBorder = (outerRight - iR) / cardW;
  const topBorder = (iT - outerTop) / cardH;
  const bottomBorder = (outerBottom - iB) / cardH;
  if (leftBorder > 0.2 || rightBorder > 0.2 || topBorder > 0.2 || bottomBorder > 0.2) return null;
  if (leftBorder < 0.01 || rightBorder < 0.01 || topBorder < 0.01 || bottomBorder < 0.01) return null;

  console.log(`[inner-borders] L=${((iL / sw) * 100).toFixed(1)}% R=${((iR / sw) * 100).toFixed(1)}% T=${((iT / sh) * 100).toFixed(1)}% B=${((iB / sh) * 100).toFixed(1)}% | borders: L=${(leftBorder * 100).toFixed(1)}% R=${(rightBorder * 100).toFixed(1)}% T=${(topBorder * 100).toFixed(1)}% B=${(bottomBorder * 100).toFixed(1)}%`);

  return {
    innerLeftPct: (iL / sw) * 100,
    innerTopPct: (iT / sh) * 100,
    innerRightPct: (iR / sw) * 100,
    innerBottomPct: (iB / sh) * 100,
  };
}

async function detectCardBounds(dataUri: string): Promise<{ leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; angleDeg?: number; confidence?: number; innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number }> {
  const cacheKey = dataUri.slice(dataUri.length - 64);
  const cached = boundsCache.get(cacheKey);
  if (cached) return cached;
  try {
    const base64Data = dataUri.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const { width, height } = await sharp(buffer).metadata() as { width: number; height: number };
    if (!width || !height) throw new Error("Could not get image dimensions");

    const COARSE_SIZE = 200;
    const csw = Math.max(20, Math.round(width <= COARSE_SIZE ? width : COARSE_SIZE * (width / Math.max(width, height))));
    const csh = Math.max(20, Math.round(height <= COARSE_SIZE ? height : COARSE_SIZE * (height / Math.max(width, height))));

    const { data: coarsePixels } = await sharp(buffer)
      .resize(csw, csh, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const varianceHint = detectCardRegionByVariance(coarsePixels as any, csw, csh);
    const coarse = detectBoundsAtResolution(coarsePixels as any, csw, csh, 0.4, 0.12);

    let unionLeft = coarse.leftPct;
    let unionRight = coarse.rightPct;
    let unionTop = coarse.topPct;
    let unionBottom = coarse.bottomPct;

    if (varianceHint) {
      unionLeft = Math.min(unionLeft, varianceHint.leftPct);
      unionRight = Math.max(unionRight, varianceHint.rightPct);
      unionTop = Math.min(unionTop, varianceHint.topPct);
      unionBottom = Math.max(unionBottom, varianceHint.bottomPct);
      console.log(`[detect-bounds] Union of coarse+variance: L=${unionLeft.toFixed(1)} T=${unionTop.toFixed(1)} R=${unionRight.toFixed(1)} B=${unionBottom.toFixed(1)}`);
    }

    const FINE_SIZE = 1000;
    const fsw = Math.max(40, Math.round(width <= FINE_SIZE ? width : FINE_SIZE * (width / Math.max(width, height))));
    const fsh = Math.max(40, Math.round(height <= FINE_SIZE ? height : FINE_SIZE * (height / Math.max(width, height))));

    const { data: finePixels } = await sharp(buffer)
      .resize(fsw, fsh, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const REFINE_BAND = 15;
    const fine = detectBoundsAtResolution(
      finePixels as any, fsw, fsh, 0.4, 0.15,
      { minPct: Math.max(0, unionLeft - REFINE_BAND), maxPct: Math.min(100, unionRight + REFINE_BAND) },
      { minPct: Math.max(0, unionTop - REFINE_BAND), maxPct: Math.min(100, unionBottom + REFINE_BAND) }
    );

    let leftPercent = fine.leftPct;
    let rightPercent = fine.rightPct;
    let topPercent = fine.topPct;
    let bottomPercent = fine.bottomPct;
    const angleDeg = fine.angleDeg;
    const confidence = fine.confidence;

    if (rightPercent - leftPercent < 30 || bottomPercent - topPercent < 30) {
      return { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98, angleDeg: 0, confidence: 0 };
    }

    const outerLeftPx = Math.round(fine.leftPct / 100 * fsw);
    const outerRightPx = Math.round(fine.rightPct / 100 * fsw);
    const outerTopPx = Math.round(fine.topPct / 100 * fsh);
    const outerBottomPx = Math.round(fine.bottomPct / 100 * fsh);

    const innerBorders = detectInnerBorders(
      finePixels as any, fsw, fsh,
      outerLeftPx, outerRightPx, outerTopPx, outerBottomPx
    );

    const result: any = {
      leftPercent: parseFloat(clamp(leftPercent, 0, 45).toFixed(2)),
      topPercent: parseFloat(clamp(topPercent, 0, 45).toFixed(2)),
      rightPercent: parseFloat(clamp(rightPercent, 55, 100).toFixed(2)),
      bottomPercent: parseFloat(clamp(bottomPercent, 55, 100).toFixed(2)),
      angleDeg,
      confidence,
    };

    if (innerBorders) {
      result.innerLeftPercent = parseFloat(innerBorders.innerLeftPct.toFixed(2));
      result.innerTopPercent = parseFloat(innerBorders.innerTopPct.toFixed(2));
      result.innerRightPercent = parseFloat(innerBorders.innerRightPct.toFixed(2));
      result.innerBottomPercent = parseFloat(innerBorders.innerBottomPct.toFixed(2));
    }

    boundsCache.set(cacheKey, result);
    if (boundsCache.size > 100) {
      const firstKey = boundsCache.keys().next().value;
      if (firstKey) boundsCache.delete(firstKey);
    }
    return result;
  } catch (err) {
    console.error("Card bounds detection failed:", err);
    return { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98, angleDeg: 0, confidence: 0 };
  }
}

function enforceCardBounds(bounds: any): any {
  if (!bounds) return { leftPercent: 4, topPercent: 3, rightPercent: 96, bottomPercent: 97 };
  const result: any = {
    leftPercent: parseFloat(clamp(bounds.leftPercent ?? 5, 1, 45).toFixed(1)),
    topPercent: parseFloat(clamp(bounds.topPercent ?? 3, 1, 45).toFixed(1)),
    rightPercent: parseFloat(clamp(bounds.rightPercent ?? 95, 55, 99).toFixed(1)),
    bottomPercent: parseFloat(clamp(bounds.bottomPercent ?? 97, 55, 99).toFixed(1)),
  };
  if (bounds.innerLeftPercent != null) result.innerLeftPercent = bounds.innerLeftPercent;
  if (bounds.innerTopPercent != null) result.innerTopPercent = bounds.innerTopPercent;
  if (bounds.innerRightPercent != null) result.innerRightPercent = bounds.innerRightPercent;
  if (bounds.innerBottomPercent != null) result.innerBottomPercent = bounds.innerBottomPercent;
  return result;
}

function computeCenteringGrades(centering: any) {
  const frontWorst = Math.max(centering.frontLeftRight, centering.frontTopBottom);
  const backWorst = Math.max(centering.backLeftRight, centering.backTopBottom);

  let psaCentering: number;
  if (frontWorst <= 60 && backWorst <= 75) psaCentering = 10;
  else if (frontWorst <= 60 && backWorst <= 90) psaCentering = 9;
  else if (frontWorst <= 65 && backWorst <= 90) psaCentering = 8;
  else if (frontWorst <= 70 && backWorst <= 90) psaCentering = 7;
  else if (frontWorst <= 80 && backWorst <= 90) psaCentering = 6;
  else if (frontWorst <= 85 && backWorst <= 90) psaCentering = 5;
  else psaCentering = 4;

  let bgsCentering: number;
  if (frontWorst <= 50 && backWorst <= 60) bgsCentering = 10;
  else if (frontWorst <= 55 && backWorst <= 60) bgsCentering = 9.5;
  else if (frontWorst <= 55 && backWorst <= 70) bgsCentering = 9;
  else if (frontWorst <= 60 && backWorst <= 80) bgsCentering = 8.5;
  else if (frontWorst <= 65) bgsCentering = 8;
  else if (frontWorst <= 75 && backWorst <= 95) bgsCentering = 7;
  else if (frontWorst <= 80) bgsCentering = 6;
  else bgsCentering = 5;

  let aceCentering: number;
  if (frontWorst < 60 && backWorst < 60) aceCentering = 10;
  else if (frontWorst <= 65 && backWorst <= 70) aceCentering = 9;
  else if (frontWorst <= 70 && backWorst <= 75) aceCentering = 8;
  else if (frontWorst <= 75 && backWorst <= 80) aceCentering = 7;
  else if (frontWorst <= 80 && backWorst <= 80) aceCentering = 6;
  else if (frontWorst <= 85 && backWorst <= 85) aceCentering = 5;
  else aceCentering = 4;

  let tagCentering: number;
  if (frontWorst <= 52 && backWorst <= 52) tagCentering = 10;
  else if (frontWorst <= 55 && backWorst <= 65) tagCentering = 9;
  else if (frontWorst <= 60 && backWorst <= 75) tagCentering = 8.5;
  else if (frontWorst <= 62 && backWorst <= 85) tagCentering = 8;
  else if (frontWorst <= 65 && backWorst <= 95) tagCentering = 7;
  else tagCentering = 6;

  let cgcCentering: number;
  if (frontWorst <= 50 && backWorst <= 55) cgcCentering = 10.5;
  else if (frontWorst <= 55 && backWorst <= 75) cgcCentering = 10;
  else if (frontWorst <= 60 && backWorst <= 80) cgcCentering = 9.5;
  else if (frontWorst <= 62 && backWorst <= 82) cgcCentering = 9;
  else if (frontWorst <= 65 && backWorst <= 85) cgcCentering = 8.5;
  else if (frontWorst <= 70 && backWorst <= 90) cgcCentering = 8;
  else cgcCentering = 7;

  return { psaCentering, bgsCentering, aceCentering, tagCentering, cgcCentering };
}

function syncCenteringToGrades(result: any): any {
  if (!result.centering) return result;

  const { psaCentering, bgsCentering, aceCentering, tagCentering, cgcCentering } = computeCenteringGrades(result.centering);
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
    const bgsSubgrades = [bgsCentering, result.beckett.corners.grade, result.beckett.edges.grade, result.beckett.surface.grade];
    const bgsLowest = Math.min(...bgsSubgrades);
    const bgsAvg = bgsSubgrades.reduce((a, b) => a + b, 0) / 4;
    const bgsFromAvg = roundToHalf(bgsAvg);
    result.beckett.overallGrade = Math.min(bgsFromAvg, bgsLowest + 1);
  }

  if (result.ace) {
    result.ace.centering.grade = aceCentering;
    result.ace.centering.notes = centeringNote;
    const aceGrades = [aceCentering, result.ace.corners.grade, result.ace.edges.grade, result.ace.surface.grade];
    const aceLowest = Math.min(...aceGrades);
    const aceAvg = aceGrades.reduce((a, b) => a + b, 0) / 4;
    const aceFromAvg = roundToWhole(aceAvg);
    result.ace.overallGrade = Math.min(aceFromAvg, aceLowest + 1);
  }

  if (result.tag) {
    result.tag.centering.grade = tagCentering;
    result.tag.centering.notes = centeringNote;
    const avg = (tagCentering + result.tag.corners.grade + result.tag.edges.grade + result.tag.surface.grade) / 4;
    result.tag.overallGrade = roundToHalf(avg);
  }

  if (result.cgc) {
    result.cgc.centeringGrade = cgcCentering;
    result.cgc.centering = centeringNote;
    const minOtherCgc = Math.min(
      result.tag?.corners?.grade ?? result.beckett?.corners?.grade ?? 10,
      result.tag?.edges?.grade ?? result.beckett?.edges?.grade ?? 10,
      result.tag?.surface?.grade ?? result.beckett?.surface?.grade ?? 10
    );
    const cgcNonCentering = roundToHalf(minOtherCgc);
    result.cgc.grade = roundToHalf(Math.min(cgcCentering, cgcNonCentering));
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

  if (result.tag) {
    result.tag.overallGrade = roundToHalf(clamp(result.tag.overallGrade, 1, 10));
    for (const key of ["centering", "corners", "edges", "surface"]) {
      if (result.tag[key]?.grade !== undefined) {
        result.tag[key].grade = roundToHalf(clamp(result.tag[key].grade, 1, 10));
      }
    }
  }

  if (result.cgc) {
    result.cgc.grade = roundToHalf(clamp(result.cgc.grade, 1, 10));
  }

  return result;
}

export async function registerRoutes(app: Express): Promise<Server> {
  interface GradingJob {
    id: string;
    status: "processing" | "completed" | "failed";
    type: "single" | "bulk";
    result?: any;
    results?: Array<{ status: "completed" | "failed"; result?: any; error?: string }>;
    totalCards?: number;
    completedCards?: number;
    error?: string;
    pushToken?: string;
    createdAt: number;
  }

  const gradingJobs = new Map<string, GradingJob>();

  setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, job] of gradingJobs) {
      if (job.createdAt < oneHourAgo) gradingJobs.delete(id);
    }
  }, 10 * 60 * 1000);

  async function sendPushNotification(pushToken: string, title: string, body: string) {
    try {
      console.log(`[push] Sending notification to token: ${pushToken.substring(0, 20)}...`);
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          to: pushToken,
          sound: "default",
          title,
          body,
          data: { type: "grading_complete" },
        }),
      });
      const respData = await resp.json();
      console.log(`[push] Expo push response:`, JSON.stringify(respData));
    } catch (err) {
      console.error("[push] Failed to send notification:", err);
    }
  }

  app.post("/api/grade-card", async (req, res) => {
    try {
      const { frontImage, backImage } = req.body;

      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back card images are required" });
      }

      const gradeStartTime = Date.now();
      const rawFrontUrl = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
      const rawBackUrl = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;

      const [frontUrl, backUrl] = await Promise.all([
        optimizeImageForAI(rawFrontUrl),
        optimizeImageForAI(rawBackUrl),
      ]);
      const optimizeTime = Date.now() - gradeStartTime;
      if (optimizeTime > 50) console.log(`[grade-card] Image optimization took ${optimizeTime}ms`);

      const gradingResponse = await openai.chat.completions.create({
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
                text: "Please analyze this Pokemon card and provide estimated grades from PSA, Beckett (BGS), Ace Grading, TAG Grading, and CGC Cards. The first image is the front of the card and the second image is the back.\n\nIMPORTANT CARD IDENTIFICATION: Read the card number and set code printed at the bottom of the card. Read the Pokemon name from the top. The set code + card number uniquely identify this card — report them EXACTLY as printed. Do NOT guess or substitute different values. Common digit misreads: 0↔8, 3↔8, 6↔9, 1↔7.",
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
      });

      const aiTime = Date.now() - gradeStartTime;
      console.log(`[grade-card] AI calls completed in ${aiTime}ms`);

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

      const cardName = gradingResult.cardName || "";
      const cardNumber = gradingResult.setNumber || "";
      const setName = gradingResult.setName || "";
      const setCode = (gradingResult as any).setCode || "";

      console.log(`[grade-card] AI result: name="${cardName}" number="${cardNumber}" set="${setName}" code="${setCode}"`);

      const isAsianCode = /^s\d|^sv\d|^sm\d/i.test(setCode || "");
      const hasNonLatinName = /[^\u0000-\u007F]/.test(cardName);
      const isAsianCard = isAsianCode && hasNonLatinName;
      console.log(`[grade-card] hasNonLatinName=${hasNonLatinName} isAsianCard=${isAsianCard}`);

      const frontUri = frontUrl;
      const backUri = backUrl;

      if (isAsianCard) {
        console.log(`[grade-card] Asian set code "${setCode}" — trying Bulbapedia database lookup`);

        const cardNum = parseInt((cardNumber || "").split("/")[0]?.replace(/^0+/, "") || "0");
        const numbersToTry = new Set<number>();
        if (cardNum > 0) numbersToTry.add(cardNum);

        const boundsPromise = Promise.all([detectCardBounds(frontUri), detectCardBounds(backUri)]);
        const lookupPromises = [...numbersToTry].map(num =>
          lookupJapaneseCard(setCode, num, setName).then(name => ({ num, name }))
        );

        const [boundsResults, ...bulbapediaResults] = await Promise.all([boundsPromise, ...lookupPromises]);
        const [detectedFront, detectedBack] = boundsResults;
        gradingResult.frontCardBounds = detectedFront;
        gradingResult.backCardBounds = detectedBack;

        const foundResults = bulbapediaResults.filter(r => r.name !== null) as Array<{ num: number; name: string }>;
        console.log(`[grade-card] Bulbapedia results: ${foundResults.map(r => `#${r.num}="${r.name}"`).join(", ") || "none"}`);

        if (foundResults.length > 0) {
          const bestBulbapedia = foundResults[0];
          console.log(`[grade-card] Bulbapedia verified: "${bestBulbapedia.name}" for ${setCode} #${bestBulbapedia.num}`);
          gradingResult.cardName = bestBulbapedia.name;
          const setTotal = (cardNumber || "").split("/")[1] || "";
          gradingResult.setNumber = setTotal ? formatSetNumber(bestBulbapedia.num, setTotal) : String(bestBulbapedia.num);

          const cachedSetPage = japaneseSetCards.get(setCode.toLowerCase());
          if (cachedSetPage) {
            gradingResult.setName = cachedSetPage.setName.replace(/_/g, " ").replace(/\s*\(TCG\)\s*/g, "");
          }
        } else {
          console.log(`[grade-card] Bulbapedia lookup missed — using AI name as-is`);
        }
      } else {
      console.log(`[grade-card] Looking up card online: name="${cardName}" number="${cardNumber}" set="${setName}" code="${setCode}"`);

      const [boundsResults, lookupResult] = await Promise.all([
        Promise.all([detectCardBounds(frontUri), detectCardBounds(backUri)]),
        lookupCardOnline(cardName, cardNumber, setName, setCode).catch(() => null),
      ]);

      const [detectedFront, detectedBack] = boundsResults;

      if (lookupResult) {
        const resultScore = (lookupResult as any)._score || 0;
        console.log(`[grade-card] Online verified: "${lookupResult.cardName}" from "${lookupResult.setName}" (${lookupResult.setNumber}) score=${resultScore}`);

        let displayName = lookupResult.cardName;
        if (displayName && cardName) {
          const dbLower = displayName.toLowerCase().replace(/[-\s]/g, "");
          const aiLower = cardName.toLowerCase().replace(/[-\s]/g, "");
          const isAbbreviated = /^m\s/i.test(displayName) && /^mega\s/i.test(cardName);
          const aiIsMoreDescriptive = aiLower.length > dbLower.length && aiLower.includes(dbLower.replace(/ex$/i, "").replace(/gx$/i, "").replace(/vmax$/i, "").replace(/vstar$/i, "").slice(0, Math.max(4, dbLower.length / 2)));
          if (isAbbreviated || (aiIsMoreDescriptive && cardName.length <= displayName.length * 2.5)) {
            displayName = cardName;
          }
        }
        gradingResult.cardName = displayName;
        gradingResult.setName = lookupResult.setName;
        gradingResult.setNumber = lookupResult.setNumber;
      } else {
        console.log(`[grade-card] No online match found, using AI identification as-is`);
      }
      gradingResult.frontCardBounds = detectedFront;
      gradingResult.backCardBounds = detectedBack;
      } // end else (non-Asian-code path)

      if (setCode) {
        const resolvedSet = resolveSetName(setCode, gradingResult.setName || "");
        if (resolvedSet !== gradingResult.setName) {
          console.log(`[grade-card] Set code correction: "${setCode}" → "${resolvedSet}" (was "${gradingResult.setName}")`);
          gradingResult.setName = resolvedSet;
        }
      }

      gradingResult = syncCenteringToGrades(gradingResult);

      const totalTime = Date.now() - gradeStartTime;
      console.log(`[grade-card] Total time: ${totalTime}ms (AI: ${aiTime}ms, lookup+bounds: ${totalTime - aiTime}ms)`);

      res.json(gradingResult);
    } catch (error: any) {
      console.error("Error grading card:", error);
      res.status(500).json({ error: error.message || "Failed to grade card" });
    }
  });

  app.post("/api/regrade-card", async (req, res) => {
    try {
      const { frontImage, backImage, cardName, setName, setNumber } = req.body;

      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back card images are required" });
      }

      const rawFront = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
      const rawBack = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;

      const [frontUrl, backUrl] = await Promise.all([
        optimizeImageForAI(rawFront),
        optimizeImageForAI(rawBack),
      ]);

      console.log(`[regrade] Starting fast re-grade for "${cardName}"`);

      const [gradingResponse, detectedFront, detectedBack] = await Promise.all([
        openai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 2048,
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
                  text: `Re-grade this Pokemon card's CONDITION ONLY. The card has already been identified as: ${cardName || "Unknown"} from ${setName || "Unknown"} (${setNumber || "Unknown"}).\n\nFocus ONLY on grading the physical condition: centering, corners, edges, and surface. Do NOT spend time identifying the card — use the name/set/number provided above.\n\nThe first image is the front, the second is the back.`,
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
        detectCardBounds(frontUrl),
        detectCardBounds(backUrl),
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

      gradingResult.cardName = cardName || gradingResult.cardName;
      gradingResult.setName = setName || gradingResult.setName;
      gradingResult.setNumber = setNumber || gradingResult.setNumber;
      gradingResult.frontCardBounds = detectedFront;
      gradingResult.backCardBounds = detectedBack;
      gradingResult = syncCenteringToGrades(gradingResult);

      console.log(`[regrade] Complete for "${cardName}"`);
      res.json(gradingResult);
    } catch (error: any) {
      console.error("Error re-grading card:", error);
      res.status(500).json({ error: error.message || "Failed to re-grade card" });
    }
  });


  // --- TCGPlayer pricing via TCGCSV (free, no auth, daily-updated TCGPlayer market data) ---
  const USD_TO_GBP = 0.79;

  interface TCGGroup {
    groupId: number;
    name: string;
    abbreviation: string;
    categoryId: number;
  }

  interface TCGProduct {
    productId: number;
    name: string;
    cleanName: string;
    groupId: number;
    extendedData: Array<{ name: string; value: string }>;
  }

  interface TCGPrice {
    productId: number;
    lowPrice: number | null;
    midPrice: number | null;
    highPrice: number | null;
    marketPrice: number | null;
    directLowPrice: number | null;
    subTypeName: string;
  }

  let tcgGroupsCache: { data: TCGGroup[]; fetchedAt: number } | null = null;
  const TCG_CACHE_TTL = 24 * 60 * 60 * 1000;
  const tcgProductCache = new Map<number, { products: TCGProduct[]; prices: TCGPrice[]; fetchedAt: number }>();

  async function fetchTCGGroups(): Promise<TCGGroup[]> {
    if (tcgGroupsCache && Date.now() - tcgGroupsCache.fetchedAt < TCG_CACHE_TTL) {
      return tcgGroupsCache.data;
    }
    try {
      const resp = await fetch("https://tcgcsv.com/tcgplayer/3/groups", { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const raw = await resp.json() as any;
      const data: TCGGroup[] = raw.results || raw;
      tcgGroupsCache = { data, fetchedAt: Date.now() };
      console.log(`[tcgplayer] Cached ${data.length} Pokemon sets`);
      return data;
    } catch (err: any) {
      console.log(`[tcgplayer] Failed to fetch groups: ${err?.message}`);
      return tcgGroupsCache?.data || [];
    }
  }

  async function fetchTCGSetData(groupId: number): Promise<{ products: TCGProduct[]; prices: TCGPrice[] }> {
    const cached = tcgProductCache.get(groupId);
    if (cached && Date.now() - cached.fetchedAt < TCG_CACHE_TTL) {
      return { products: cached.products, prices: cached.prices };
    }
    try {
      const [prodResp, priceResp] = await Promise.all([
        fetch(`https://tcgcsv.com/tcgplayer/3/${groupId}/products`, { signal: AbortSignal.timeout(10000) }),
        fetch(`https://tcgcsv.com/tcgplayer/3/${groupId}/prices`, { signal: AbortSignal.timeout(10000) }),
      ]);
      if (!prodResp.ok || !priceResp.ok) throw new Error(`HTTP products=${prodResp.status} prices=${priceResp.status}`);
      const prodRaw = await prodResp.json() as any;
      const priceRaw = await priceResp.json() as any;
      const products: TCGProduct[] = prodRaw.results || prodRaw;
      const prices: TCGPrice[] = priceRaw.results || priceRaw;
      tcgProductCache.set(groupId, { products, prices, fetchedAt: Date.now() });
      if (tcgProductCache.size > 50) {
        const oldest = [...tcgProductCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
        tcgProductCache.delete(oldest[0]);
      }
      console.log(`[tcgplayer] Cached set ${groupId}: ${products.length} products, ${prices.length} prices`);
      return { products, prices };
    } catch (err: any) {
      console.log(`[tcgplayer] Failed to fetch set ${groupId}: ${err?.message}`);
      return cached ? { products: cached.products, prices: cached.prices } : { products: [], prices: [] };
    }
  }

  function normalizeForMatch(s: string): string {
    return s.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const TCGCSV_SET_ALIASES: Record<string, string> = {
    "base": "Base Set",
    "base set unlimited": "Base Set",
    "pokemon base set": "Base Set",
    "original base set": "Base Set",
    "base set 1999": "Base Set",
    "base set 1st edition": "Base Set (Shadowless)",
    "base set shadowless": "Base Set (Shadowless)",
    "jungle": "Jungle",
    "fossil": "Fossil",
    "team rocket": "Team Rocket",
    "gym heroes": "Gym Heroes",
    "gym challenge": "Gym Challenge",
    "neo genesis": "Neo Genesis",
    "neo discovery": "Neo Discovery",
    "neo revelation": "Neo Revelation",
    "neo destiny": "Neo Destiny",
    "legendary collection": "Legendary Collection",
    "expedition base set": "Expedition Base Set",
    "aquapolis": "Aquapolis",
    "skyridge": "Skyridge",
  };

  function findBestGroup(groups: TCGGroup[], setName: string): TCGGroup | null {
    if (!setName) return null;

    const normInput = normalizeForMatch(setName);
    const aliased = TCGCSV_SET_ALIASES[normInput];
    const norm = aliased ? normalizeForMatch(aliased) : normInput;

    let bestMatch: TCGGroup | null = null;
    let bestScore = 0;

    for (const g of groups) {
      const gName = normalizeForMatch(g.name);
      const gNameNoPrefix = gName.replace(/^(me\d*|sv\d*|swsh\d*|sm\d*|xy\d*|bw\d*|dp\d*|hgss\d*|pop\d*|ex\d*)\s*/, "");

      if (gName === norm) {
        return g;
      }
      if (gNameNoPrefix === norm) {
        const lengthDiff = Math.abs(gName.length - norm.length);
        const exactScore = 1000 - lengthDiff;
        if (exactScore > bestScore) {
          bestScore = exactScore;
          bestMatch = g;
        }
        continue;
      }

      const normWords = norm.split(" ");
      const gWords = gNameNoPrefix.split(" ");
      let matchedWords = 0;
      for (const w of normWords) {
        if (w.length >= 3 && gWords.some(gw => gw === w)) matchedWords++;
      }

      let score = matchedWords / Math.max(normWords.length, 1);

      if (gNameNoPrefix.length > norm.length * 1.5) {
        score *= 0.8;
      }
      if (normWords.length === gWords.length && matchedWords === normWords.length) {
        score += 0.1;
      }

      const normWordCount = normWords.length;
      const gWordCount = gWords.length;
      if (normWordCount <= 1 && gWordCount > 2) {
        score *= 0.3;
      }

      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = g;
      }
    }

    return bestMatch;
  }

  function findBestProduct(products: TCGProduct[], cardName: string, cardNumber: string): TCGProduct | null {
    const normName = normalizeForMatch(cardName);
    const numberOnly = cardNumber ? cardNumber.split("/")[0].replace(/^0+/, "") : "";
    const fullNumber = cardNumber || "";

    let bestMatch: TCGProduct | null = null;
    let bestScore = 0;

    for (const p of products) {
      let score = 0;
      const pName = normalizeForMatch(p.name);
      const pClean = normalizeForMatch(p.cleanName);

      const pNumber = p.extendedData?.find(e => e.name === "Number")?.value || "";
      const pNumOnly = pNumber.split("/")[0].replace(/^0+/, "");

      if (fullNumber && pNumber === fullNumber) {
        score += 50;
      } else if (numberOnly && pNumOnly === numberOnly) {
        score += 40;
      }

      if (pName.includes(normName) || pClean.includes(normName)) {
        score += 30;
      } else if (pClean.includes(normName.replace(/\s*ex$/i, "")) && normName.includes("ex")) {
        score += 28;
      } else {
        const nameWords = normName.split(" ");
        let wordMatches = 0;
        for (const w of nameWords) {
          if (w.length >= 3 && (pClean.includes(w) || pName.includes(w))) wordMatches++;
        }
        score += (wordMatches / Math.max(nameWords.length, 1)) * 25;
      }

      if (score > bestScore || (score === bestScore && score >= 30 && bestMatch)) {
        if (score > bestScore) {
          bestScore = score;
          bestMatch = p;
        }
      }
    }

    if (bestScore >= 30) {
      return bestMatch;
    }
    return null;
  }

  interface TCGPlayerLookupResult {
    found: boolean;
    productName?: string;
    setName?: string;
    rarity?: string;
    marketPriceUSD?: number;
    lowPriceUSD?: number;
    midPriceUSD?: number;
    highPriceUSD?: number;
    marketPriceGBP?: number;
    lowPriceGBP?: number;
    midPriceGBP?: number;
    tcgplayerUrl?: string;
  }

  async function lookupTCGPlayerPrice(cardName: string, setName: string, cardNumber: string): Promise<TCGPlayerLookupResult> {
    try {
      const groups = await fetchTCGGroups();
      if (groups.length === 0) return { found: false };

      const matchedGroup = findBestGroup(groups, setName);
      if (!matchedGroup) {
        console.log(`[tcgplayer] No matching set for "${setName}"`);
        return { found: false };
      }

      console.log(`[tcgplayer] Matched set "${setName}" -> "${matchedGroup.name}" (groupId=${matchedGroup.groupId})`);

      const { products, prices } = await fetchTCGSetData(matchedGroup.groupId);
      if (products.length === 0) return { found: false };

      const matchedProduct = findBestProduct(products, cardName, cardNumber);
      if (!matchedProduct) {
        console.log(`[tcgplayer] No matching card for "${cardName}" #${cardNumber} in ${matchedGroup.name} (${products.length} products searched)`);
        return { found: false };
      }

      const matchedNum = matchedProduct.extendedData?.find(e => e.name === "Number")?.value || "";
      console.log(`[tcgplayer] Matched card: "${matchedProduct.name}" #${matchedNum} (searched: name="${cardName}" #${cardNumber})`);


      const rarity = matchedProduct.extendedData?.find(e => e.name === "Rarity")?.value || "";
      const cardPrices = prices.filter(p => p.productId === matchedProduct.productId);

      const bestPrice = cardPrices.sort((a, b) => (b.marketPrice || 0) - (a.marketPrice || 0))[0];
      if (!bestPrice || !bestPrice.marketPrice) {
        console.log(`[tcgplayer] Found card but no price data for "${matchedProduct.name}"`);
        return { found: false };
      }

      const result: TCGPlayerLookupResult = {
        found: true,
        productName: matchedProduct.name,
        setName: matchedGroup.name,
        rarity,
        marketPriceUSD: bestPrice.marketPrice,
        lowPriceUSD: bestPrice.lowPrice || undefined,
        midPriceUSD: bestPrice.midPrice || undefined,
        highPriceUSD: bestPrice.highPrice || undefined,
        marketPriceGBP: Math.round(bestPrice.marketPrice * USD_TO_GBP * 100) / 100,
        lowPriceGBP: bestPrice.lowPrice ? Math.round(bestPrice.lowPrice * USD_TO_GBP * 100) / 100 : undefined,
        midPriceGBP: bestPrice.midPrice ? Math.round(bestPrice.midPrice * USD_TO_GBP * 100) / 100 : undefined,
      };

      console.log(`[tcgplayer] Found: "${matchedProduct.name}" | Rarity: ${rarity} | Market: $${bestPrice.marketPrice} (£${result.marketPriceGBP}) | Low: $${bestPrice.lowPrice} | Mid: $${bestPrice.midPrice}`);
      return result;
    } catch (err: any) {
      console.log(`[tcgplayer] Lookup error: ${err?.message}`);
      return { found: false };
    }
  }

  app.post("/api/card-value", async (req, res) => {
    try {
      const { cardName, setName, setNumber, psaGrade, bgsGrade, aceGrade, tagGrade, cgcGrade } = req.body;
      console.log("[card-value] Request received:", { cardName, setName, setNumber, psaGrade, bgsGrade, aceGrade, tagGrade, cgcGrade });
      if (!cardName) {
        return res.status(400).json({ error: "Card name is required" });
      }

      const tcgResult = await lookupTCGPlayerPrice(cardName, setName, setNumber);

      const allKeys = ["psaValue", "psa10Value", "bgsValue", "bgs10Value", "aceValue", "ace10Value", "tagValue", "tag10Value", "cgcValue", "cgc10Value", "rawValue"];

      const tcgContext = tcgResult.found
        ? `REAL TCGPlayer Market Data (verified, daily-updated):
- Card: ${tcgResult.productName}
- Set: ${tcgResult.setName}
- Rarity: ${tcgResult.rarity}
- TCGPlayer Market Price: $${tcgResult.marketPriceUSD} USD (£${tcgResult.marketPriceGBP} GBP)
${tcgResult.lowPriceUSD ? `- TCGPlayer Low: $${tcgResult.lowPriceUSD} USD (£${tcgResult.lowPriceGBP} GBP)` : ""}
${tcgResult.midPriceUSD ? `- TCGPlayer Mid: $${tcgResult.midPriceUSD} USD (£${tcgResult.midPriceGBP} GBP)` : ""}

This is the UNGRADED raw card price from TCGPlayer. Use it as your primary baseline.`
        : "";

      console.log(`[card-value] TCGPlayer data: ${tcgResult.found ? `Found - $${tcgResult.marketPriceUSD} / £${tcgResult.marketPriceGBP}` : "Not found"}`);

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are an expert Pokemon TCG market price analyst. Your job is to estimate graded card values in GBP.

${tcgResult.found ? `You have been given REAL TCGPlayer market data for the raw/ungraded card price. This is AUTHORITATIVE — base ALL your estimates on this verified price.

The TCGPlayer market price is the UNGRADED Near Mint value. Use it to calculate graded premiums:
- Raw/ungraded value = TCGPlayer market price converted to GBP (already provided)
- PSA 9 = 1.5-2.5x raw value (popular cards higher)
- PSA 10 = 3-8x raw value (chase cards can be 10-20x)
- BGS 9.5 = similar to PSA 10 value
- BGS 10 (Black Label) = 1.5-3x PSA 10
- CGC 9 = 80-90% of PSA 9
- CGC 10 = 70-85% of PSA 10
- ACE 10 = 70-85% of PSA 10
- ACE (current grade) = 70-85% of equivalent PSA grade
- TAG 9.5 = 60-75% of BGS 9.5
- TAG 10 = 60-75% of PSA 10

For very cheap cards (raw < £5): grading premiums are minimal (graded = £10-25 at best for a 10).
For expensive cards (raw > £100): premiums scale significantly, especially for grade 10s.` : `TCGPlayer data was not available. Use your expert knowledge of Pokemon TCG market prices (2024-2025) to estimate.`}

RULES:
1. All prices in GBP (£). Format: "£XX.XX" or "£XX - £XX" for ranges.
2. Use TIGHT price ranges based on the TCGPlayer data.
3. NEVER say "No value data found" — every card has value.
4. Raw value should closely reflect the TCGPlayer market price when available.

Respond ONLY with valid JSON:
{
  "psaValue": "£XX - £XX",
  "bgsValue": "£XX - £XX",
  "aceValue": "£XX - £XX",
  "tagValue": "£XX - £XX",
  "cgcValue": "£XX - £XX",
  "rawValue": "£XX - £XX",
  "psa10Value": "£XX - £XX",
  "bgs10Value": "£XX - £XX",
  "ace10Value": "£XX - £XX",
  "tag10Value": "£XX - £XX",
  "cgc10Value": "£XX - £XX",
  "source": "${tcgResult.found ? "Based on TCGPlayer market data" : "Estimated from market data"}"
}`,
          },
          {
            role: "user",
            content: `Card: ${cardName}
Set: ${setName || "Unknown"}
Card Number: ${setNumber || "Unknown"}
Grades: PSA ${psaGrade}, BGS ${bgsGrade}, Ace ${aceGrade}, TAG ${tagGrade}, CGC ${cgcGrade}

${tcgContext || "No external price data available. Estimate using your expert knowledge of current Pokemon TCG values."}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiData = JSON.parse(jsonMatch[0]);
        aiData.source = tcgResult.found ? "Based on TCGPlayer market data" : "Estimated from market data";
        if (tcgResult.found) {
          aiData.tcgplayerMarketPrice = `£${tcgResult.marketPriceGBP}`;
          aiData.tcgplayerMarketPriceUSD = `$${tcgResult.marketPriceUSD}`;
        }
        console.log("[card-value] Success, returning:", aiData);
        res.json(aiData);
      } else {
        console.log("[card-value] No JSON in AI response:", content);
        const fallback: Record<string, string> = {};
        for (const k of allKeys) fallback[k] = "No value data found";
        fallback.source = "Unable to estimate";
        res.json(fallback);
      }
    } catch (error: any) {
      console.error("[card-value] Error:", error?.message || error);
      res.json({
        psaValue: "No value data found", bgsValue: "No value data found", aceValue: "No value data found",
        tagValue: "No value data found", cgcValue: "No value data found", rawValue: "No value data found",
        psa10Value: "No value data found", bgs10Value: "No value data found", ace10Value: "No value data found",
        tag10Value: "No value data found", cgc10Value: "No value data found", source: "Error fetching values",
      });
    }
  });

  app.post("/api/crop-to-card", async (req, res) => {
    try {
      const { image, padding = 20 } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }
      let uri = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

      const initialBounds = await detectCardBounds(uri);
      const angle = initialBounds.angleDeg ?? 0;

      if (Math.abs(angle) > 0.3) {
        try {
          const rotBase64 = uri.replace(/^data:image\/\w+;base64,/, "");
          const rotBuffer = Buffer.from(rotBase64, "base64");
          const straightened = await sharp(rotBuffer)
            .rotate(-angle, { background: { r: 0, g: 0, b: 0, alpha: 1 } })
            .jpeg({ quality: 90 })
            .toBuffer();
          uri = `data:image/jpeg;base64,${straightened.toString("base64")}`;
          console.log(`[crop-to-card] Auto-straightened by ${angle.toFixed(2)} degrees`);
        } catch (rotErr) {
          console.log(`[crop-to-card] Straighten failed, continuing without:`, rotErr);
        }
      }

      boundsCache.clear();
      const bounds = await detectCardBounds(uri);

      const base64Data = uri.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const meta = await sharp(buffer).metadata();
      const imgW = meta.width || 1;
      const imgH = meta.height || 1;

      let cardLeft = (bounds.leftPercent / 100) * imgW;
      let cardRight = (bounds.rightPercent / 100) * imgW;
      let cardTop = (bounds.topPercent / 100) * imgH;
      let cardBottom = (bounds.bottomPercent / 100) * imgH;
      let cardW = cardRight - cardLeft;
      let cardH = cardBottom - cardTop;

      const CARD_ASPECT = 2.5 / 3.5;
      const detectedRatio = cardW / cardH;

      const lrDetected = bounds.leftPercent > 5 || bounds.rightPercent < 95;
      const tbDetected = bounds.topPercent > 5 || bounds.bottomPercent < 95;

      if (lrDetected && (!tbDetected || Math.abs(detectedRatio - CARD_ASPECT) > 0.25)) {
        const expectedH = cardW / CARD_ASPECT;
        const centerY = (cardTop + cardBottom) / 2;
        cardTop = Math.max(0, centerY - expectedH / 2);
        cardBottom = Math.min(imgH, centerY + expectedH / 2);
        cardH = cardBottom - cardTop;
        console.log(`[crop-to-card] Inferred top/bottom from card width. Ratio was ${detectedRatio.toFixed(3)}, expected ${CARD_ASPECT.toFixed(3)}`);
      } else if (tbDetected && (!lrDetected || Math.abs(detectedRatio - CARD_ASPECT) > 0.25)) {
        const expectedW = cardH * CARD_ASPECT;
        const centerX = (cardLeft + cardRight) / 2;
        cardLeft = Math.max(0, centerX - expectedW / 2);
        cardRight = Math.min(imgW, centerX + expectedW / 2);
        cardW = cardRight - cardLeft;
        console.log(`[crop-to-card] Inferred left/right from card height. Ratio was ${detectedRatio.toFixed(3)}, expected ${CARD_ASPECT.toFixed(3)}`);
      }

      const padX = cardW * (padding / 100);
      const padY = cardH * (padding / 100);

      const availLeft = cardLeft;
      const availRight = imgW - cardRight;
      const availTop = cardTop;
      const availBottom = imgH - cardBottom;

      const actualPadX = Math.min(padX, availLeft, availRight);
      const actualPadY = Math.min(padY, availTop, availBottom);

      const cropLeft = Math.max(0, Math.round(cardLeft - actualPadX));
      const cropTop = Math.max(0, Math.round(cardTop - actualPadY));
      const cropRight = Math.min(imgW, Math.round(cardRight + actualPadX));
      const cropBottom = Math.min(imgH, Math.round(cardBottom + actualPadY));
      const cropW = cropRight - cropLeft;
      const cropH = cropBottom - cropTop;

      if (cropW < 50 || cropH < 50) {
        console.log(`[crop-to-card] Card too small or not detected, returning original`);
        return res.json({ croppedImage: uri, wasCropped: false, bounds });
      }

      const cardAreaRatio = (cardW * cardH) / (imgW * imgH);
      if (cardAreaRatio > 0.7) {
        console.log(`[crop-to-card] Card already fills ${(cardAreaRatio * 100).toFixed(0)}% of image, skipping crop`);
        return res.json({ croppedImage: uri, wasCropped: false, bounds });
      }

      const cropped = await sharp(buffer)
        .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
        .jpeg({ quality: 90 })
        .toBuffer();

      const croppedBase64 = `data:image/jpeg;base64,${cropped.toString("base64")}`;

      const newBounds = await detectCardBounds(croppedBase64);

      console.log(`[crop-to-card] Cropped ${imgW}x${imgH} -> ${cropW}x${cropH} (card was ${(cardAreaRatio * 100).toFixed(0)}% of image)`);
      res.json({ croppedImage: croppedBase64, wasCropped: true, bounds: newBounds });
    } catch (error: any) {
      console.error("Error cropping to card:", error);
      res.status(500).json({ error: error.message || "Failed to crop to card" });
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

      console.log(`[detect-bounds] Result: L=${bounds.leftPercent.toFixed(1)} T=${bounds.topPercent.toFixed(1)} R=${bounds.rightPercent.toFixed(1)} B=${bounds.bottomPercent.toFixed(1)} angle=${bounds.angleDeg ?? 0} confidence=${bounds.confidence ?? 0}`);
      res.json(bounds);
    } catch (error: any) {
      console.error("Error detecting bounds:", error);
      res.status(500).json({ error: error.message || "Failed to detect bounds" });
    }
  });

  app.post("/api/detect-angle", async (req, res) => {
    try {
      const { image, bounds } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }
      const uri = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
      const angle = await detectCardAngle(uri, bounds);
      console.log(`[detect-angle] Detected angle: ${angle} degrees`);
      res.json({ angle });
    } catch (error: any) {
      console.error("Error detecting angle:", error);
      res.status(500).json({ error: error.message || "Failed to detect angle" });
    }
  });

  app.post("/api/grade-job", async (req, res) => {
    try {
      const { frontImage, backImage, pushToken } = req.body;
      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back images required" });
      }

      const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
      console.log(`[grade-job] Creating job ${jobId}, pushToken: ${pushToken ? pushToken.substring(0, 20) + "..." : "none"}`);
      const job: GradingJob = {
        id: jobId,
        status: "processing",
        type: "single",
        pushToken,
        createdAt: Date.now(),
      };
      gradingJobs.set(jobId, job);

      res.json({ jobId });

      (async () => {
        try {
          const gradeStartTime = Date.now();
          const rawFrontUrl = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
          const rawBackUrl = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;

          const [frontUrl, backUrl] = await Promise.all([
            optimizeImageForAI(rawFrontUrl),
            optimizeImageForAI(rawBackUrl),
          ]);

          const internalUrl = `http://localhost:5000/api/grade-card`;
          const gradeResp = await fetch(internalUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frontImage, backImage }),
          });

          if (!gradeResp.ok) {
            const errText = await gradeResp.text();
            throw new Error(errText || "Grading failed");
          }

          const result = await gradeResp.json();
          job.status = "completed";
          job.result = result;

          console.log(`[grade-job] Job ${jobId} completed in ${Date.now() - gradeStartTime}ms`);

          if (job.pushToken) {
            const cardName = result.cardName || "your card";
            sendPushNotification(job.pushToken, "Grading Complete", `${cardName} has been graded!`);
          }
        } catch (err: any) {
          console.error(`[grade-job] Job ${jobId} failed:`, err.message);
          job.status = "failed";
          job.error = err.message || "Unknown error";

          if (job.pushToken) {
            sendPushNotification(job.pushToken, "Grading Failed", "There was an error grading your card. Please try again.");
          }
        }
      })();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/bulk-grade-job", async (req, res) => {
    try {
      const { cards, pushToken } = req.body;
      if (!cards || !Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: "At least one card required" });
      }

      const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
      console.log(`[bulk-grade-job] Creating job ${jobId} for ${cards.length} cards, pushToken: ${pushToken ? pushToken.substring(0, 20) + "..." : "none"}`);
      const job: GradingJob = {
        id: jobId,
        status: "processing",
        type: "bulk",
        totalCards: cards.length,
        completedCards: 0,
        results: [],
        pushToken,
        createdAt: Date.now(),
      };
      gradingJobs.set(jobId, job);

      res.json({ jobId, totalCards: cards.length });

      (async () => {
        try {
          const BATCH_SIZE = 3;
          const results: Array<{ status: "completed" | "failed"; result?: any; error?: string }> = [];

          for (let i = 0; i < cards.length; i += BATCH_SIZE) {
            const batch = cards.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.allSettled(
              batch.map(async (card: { frontImage: string; backImage: string }) => {
                const internalUrl = `http://localhost:5000/api/grade-card`;
                const gradeResp = await fetch(internalUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ frontImage: card.frontImage, backImage: card.backImage }),
                });

                if (!gradeResp.ok) {
                  const errText = await gradeResp.text();
                  throw new Error(errText || "Grading failed");
                }

                return await gradeResp.json();
              })
            );

            for (const r of batchResults) {
              if (r.status === "fulfilled") {
                results.push({ status: "completed", result: r.value });
              } else {
                results.push({ status: "failed", error: r.reason?.message || "Unknown error" });
              }
            }

            job.completedCards = results.length;
            job.results = results;
          }

          job.status = "completed";
          const successCount = results.filter(r => r.status === "completed").length;
          console.log(`[bulk-grade-job] Job ${jobId} completed: ${successCount}/${cards.length} succeeded`);

          if (job.pushToken) {
            sendPushNotification(
              job.pushToken,
              "Bulk Grading Complete",
              `${successCount} of ${cards.length} cards graded successfully!`
            );
          }
        } catch (err: any) {
          console.error(`[bulk-grade-job] Job ${jobId} failed:`, err.message);
          job.status = "failed";
          job.error = err.message || "Unknown error";

          if (job.pushToken) {
            sendPushNotification(job.pushToken, "Bulk Grading Failed", "There was an error with your bulk grading. Please try again.");
          }
        }
      })();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/grade-job/:id", (req, res) => {
    const job = gradingJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (job.type === "single") {
      res.json({
        id: job.id,
        status: job.status,
        type: job.type,
        result: job.status === "completed" ? job.result : undefined,
        error: job.status === "failed" ? job.error : undefined,
      });
    } else {
      res.json({
        id: job.id,
        status: job.status,
        type: job.type,
        totalCards: job.totalCards,
        completedCards: job.completedCards,
        results: job.status === "completed" ? job.results : undefined,
        error: job.status === "failed" ? job.error : undefined,
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
