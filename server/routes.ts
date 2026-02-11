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

**TAG Grading (AI-Powered) - Scale 1-10 with HALF-GRADE sub-grades:**
- TAG uses 0.5 increments for BOTH overall grade AND all sub-grades (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10)
- Uses 1000-point precision internally, but final grades are in 0.5 increments
- Overall grade is calculated from sub-grades (weighted average)
- Centering: Front 55/45 and Back 75/25 or better for TAG 10, Front 60/40 and Back 80/20 for TAG 9
- Corners: Must be pristine with no whitening for 10
- Edges: Must be clean with no chipping or wear for 10
- Surface: Must be free from scratches, print defects, and surface damage for 10
- TAG is known for stricter surface grading than BGS

**CGC Cards - Scale 1-10 with HALF-GRADE increments, NO sub-grades:**
- CGC uses 0.5 increments for the overall grade (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10)
- CGC discontinued sub-grades in 2023. Only an overall grade is given with text descriptions per category.
- CGC has TWO types of 10: Pristine 10 (Gold Label) and Gem Mint 10 (Silver Label)
- Pristine 10 (Gold Label): Front centering 50/50, Back centering 55/45 or better. Absolutely flawless in all categories.
- Gem Mint 10 (Silver Label): Front centering 55/45, Back centering 75/25 or better. Near-perfect with only the slightest imperfections.
- Centering: Front 55/45 and Back 75/25 for Gem Mint 10, 60/40 front and 80/20 back for 9.5
- Corners: Inspected for whitening and dings
- Edges: Checked for chipping and rough edges
- Surface: Examined for scratches, print defects, staining

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

function detectBoundsAtResolution(
  pixels: Buffer, sw: number, sh: number,
  scanRange: number, minVoteRatio: number,
  xConstraint?: { minPct: number; maxPct: number },
  yConstraint?: { minPct: number; maxPct: number }
): { leftPct: number; rightPct: number; topPct: number; bottomPct: number; angleDeg: number; confidence: number } {
  const CARD_ASPECT = 3.5 / 2.5;
  const DIRECTION_RATIO = 1.3;

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

  const gradSamples: number[] = [];
  const sampleStep = Math.max(1, Math.round(sw / 40));
  const sampleStepY = Math.max(1, Math.round(sh / 40));
  for (let x = 2; x < sw - 2; x += sampleStep) {
    for (let y = 2; y < sh - 2; y += sampleStepY) {
      const gx = Math.abs(sobelX(x, y));
      const gy = Math.abs(sobelY(x, y));
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 3) gradSamples.push(mag);
    }
  }
  gradSamples.sort((a, b) => a - b);
  const p75 = gradSamples[Math.floor(gradSamples.length * 0.75)] || 20;
  const p90 = gradSamples[Math.floor(gradSamples.length * 0.90)] || 30;
  const adaptiveThreshold = Math.max(12, Math.min(50, Math.round((p75 + p90) / 2 * 0.6)));

  const findEdgeColumn = (startX: number, endX: number, step: number): { x: number; score: number } => {
    const scanYStart = Math.round(sh * 0.1);
    const scanYEnd = Math.round(sh * 0.9);
    const totalScanRows = Math.floor((scanYEnd - scanYStart) / 1);
    const minVotes = Math.max(3, Math.round(totalScanRows * minVoteRatio));

    const colBrightness = new Map<number, number>();
    for (let x = Math.min(startX, endX); x <= Math.max(startX, endX); x++) {
      let sum = 0;
      let count = 0;
      for (let y = scanYStart; y < scanYEnd; y += 2) {
        sum += getPixel(x, y);
        count++;
      }
      colBrightness.set(x, count > 0 ? sum / count : 0);
    }

    const columns: { x: number; score: number; votes: number }[] = [];

    for (let x = startX; step > 0 ? x < endX : x > endX; x += step) {
      let votes = 0;
      let totalGrad = 0;
      let longestRun = 0;
      let currentRun = 0;
      for (let y = scanYStart; y < scanYEnd; y += 1) {
        const gx = Math.abs(sobelX(x, y));
        const gy = Math.abs(sobelY(x, y));
        if (gx >= adaptiveThreshold && gx > gy * DIRECTION_RATIO) {
          votes++;
          totalGrad += gx;
          currentRun++;
          if (currentRun > longestRun) longestRun = currentRun;
        } else {
          currentRun = 0;
        }
      }
      if (votes >= minVotes) {
        const continuityRatio = totalScanRows > 0 ? longestRun / totalScanRows : 0;
        const continuityBonus = Math.pow(continuityRatio, 0.5);
        let finalScore = totalGrad * continuityBonus;

        const adjX = x + step;
        const curBright = colBrightness.get(x) ?? 0;
        const adjBright = colBrightness.get(adjX) ?? curBright;
        const brightDiff = curBright - adjBright;
        const isLeftEdge = step > 0;
        if (isLeftEdge && brightDiff > 15) {
          finalScore *= 1.2;
        } else if (!isLeftEdge && brightDiff < -15) {
          finalScore *= 1.2;
        }

        columns.push({ x, score: finalScore, votes });
      }
    }

    if (columns.length === 0) return { x: startX, score: 0 };

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
    return { x: avgX, score: columns[0].score };
  };

  const findEdgeRow = (startY: number, endY: number, step: number, xStart: number, xEnd: number): { y: number; score: number } => {
    const totalScanCols = Math.floor((xEnd - xStart) / 1);
    const minVotes = Math.max(3, Math.round(totalScanCols * minVoteRatio * 0.7));

    const windowSize = 5;
    const rowBrightness = new Map<number, number>();
    const yLo = Math.min(startY, endY);
    const yHi = Math.max(startY, endY);
    for (let y = Math.max(0, yLo - windowSize); y <= Math.min(sh - 1, yHi + windowSize); y++) {
      let sum = 0;
      let count = 0;
      for (let x = xStart; x < xEnd; x += 2) {
        sum += getPixel(x, y);
        count++;
      }
      rowBrightness.set(y, count > 0 ? sum / count : 0);
    }

    const avgBrightnessAt = (y: number, halfWin: number): number => {
      let s = 0; let c = 0;
      for (let dy = -halfWin; dy <= halfWin; dy++) {
        const v = rowBrightness.get(y + dy);
        if (v !== undefined) { s += v; c++; }
      }
      return c > 0 ? s / c : 0;
    };

    const rows: { y: number; score: number; votes: number }[] = [];
    const lowerThreshold = Math.max(8, Math.round(adaptiveThreshold * 0.7));

    for (let y = startY; step > 0 ? y < endY : y > endY; y += step) {
      let votes = 0;
      let totalGrad = 0;
      let longestRun = 0;
      let currentRun = 0;
      for (let x = xStart; x < xEnd; x += 1) {
        const gy = Math.abs(sobelY(x, y));
        const gx = Math.abs(sobelX(x, y));
        if (gy >= lowerThreshold && gy > gx * DIRECTION_RATIO) {
          votes++;
          totalGrad += gy;
          currentRun++;
          if (currentRun > longestRun) longestRun = currentRun;
        } else {
          currentRun = 0;
        }
      }
      if (votes >= minVotes) {
        const continuityRatio = totalScanCols > 0 ? longestRun / totalScanCols : 0;
        const continuityBonus = Math.pow(continuityRatio, 0.5);
        let finalScore = totalGrad * continuityBonus;

        const beforeBright = avgBrightnessAt(y - step * 3, 2);
        const afterBright = avgBrightnessAt(y + step * 3, 2);
        const transitionDiff = afterBright - beforeBright;

        const isTopEdge = step > 0;
        if (isTopEdge && transitionDiff > 10) {
          finalScore *= 1.0 + Math.min(0.8, transitionDiff / 50);
        } else if (!isTopEdge && transitionDiff < -10) {
          finalScore *= 1.0 + Math.min(0.8, Math.abs(transitionDiff) / 50);
        }

        if (isTopEdge && transitionDiff < -5) {
          finalScore *= 0.4;
        } else if (!isTopEdge && transitionDiff > 5) {
          finalScore *= 0.4;
        }

        rows.push({ y, score: finalScore, votes });
      }
    }

    if (rows.length === 0) return { y: startY, score: 0 };

    rows.sort((a, b) => b.score - a.score);
    const topN = rows.slice(0, Math.max(1, Math.ceil(rows.length * 0.15)));

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
    return { y: avgY, score: rows[0].score };
  };

  const extractAngleFromEdge = (
    edgePos: number, isVertical: boolean,
    searchBand: number, crossStart: number, crossEnd: number
  ): number => {
    const points: { main: number; cross: number }[] = [];
    const numSamples = Math.max(15, Math.min(50, Math.abs(crossEnd - crossStart)));
    const crossStep = (crossEnd - crossStart) / (numSamples - 1);
    const threshold = Math.max(8, Math.round(adaptiveThreshold * 0.5));
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

      if (bestMain >= 0) {
        points.push({ main: bestMain, cross });
      }
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

  const xMinStart = xConstraint ? Math.max(1, Math.round(sw * xConstraint.minPct / 100)) : 1;
  const xMaxEnd = xConstraint ? Math.min(sw - 2, Math.round(sw * xConstraint.maxPct / 100)) : Math.round(sw * scanRange);
  const xMinEndR = xConstraint ? Math.max(1, Math.round(sw * xConstraint.minPct / 100)) : Math.round(sw * (1 - scanRange));
  const xMaxStartR = xConstraint ? Math.min(sw - 2, Math.round(sw * xConstraint.maxPct / 100)) : sw - 2;

  const left = findEdgeColumn(xMinStart, xConstraint ? xMaxEnd : Math.round(sw * scanRange), 1);
  const right = findEdgeColumn(xConstraint ? xMaxStartR : sw - 2, xMinEndR, -1);
  const leftCol = left.x;
  const rightCol = right.x;

  const cardInsetX = Math.round((rightCol - leftCol) * 0.15);
  const rowScanXStart = Math.round(leftCol + cardInsetX);
  const rowScanXEnd = Math.round(rightCol - cardInsetX);

  const cardWidthPx = rightCol - leftCol;
  const expectedHeightPx = cardWidthPx * CARD_ASPECT;
  const imageCenterY = sh / 2;
  const expectedTopY = imageCenterY - expectedHeightPx / 2;
  const expectedBottomY = imageCenterY + expectedHeightPx / 2;
  const searchMargin = Math.round(expectedHeightPx * 0.20);

  let yMinStart: number, yMaxEnd: number, yMinEndB: number, yMaxStartB: number;

  if (yConstraint) {
    yMinStart = Math.max(1, Math.round(sh * yConstraint.minPct / 100));
    yMaxEnd = Math.min(sh - 2, Math.round(sh * yConstraint.maxPct / 100));
    yMinEndB = Math.max(1, Math.round(sh * yConstraint.minPct / 100));
    yMaxStartB = Math.min(sh - 2, Math.round(sh * yConstraint.maxPct / 100));
  } else if (cardWidthPx > sw * 0.15) {
    yMinStart = Math.max(1, Math.round(expectedTopY - searchMargin));
    yMaxEnd = Math.min(sh - 2, Math.round(expectedTopY + searchMargin));
    yMinEndB = Math.max(1, Math.round(expectedBottomY - searchMargin));
    yMaxStartB = Math.min(sh - 2, Math.round(expectedBottomY + searchMargin));
  } else {
    yMinStart = 1;
    yMaxEnd = Math.round(sh * 0.55);
    yMinEndB = Math.round(sh * 0.45);
    yMaxStartB = sh - 2;
  }

  const top = findEdgeRow(yMinStart, yMaxEnd, 1, rowScanXStart, rowScanXEnd);
  const bottom = findEdgeRow(yMaxStartB, yMinEndB, -1, rowScanXStart, rowScanXEnd);
  const topRow = top.y;
  const bottomRow = bottom.y;

  const angleBand = Math.max(3, Math.round(cardWidthPx * 0.04));
  const scanYFor = Math.round(sh * 0.1);
  const scanYTo = Math.round(sh * 0.9);

  let angleDeg = 0;
  const leftAngle = left.score > 0
    ? extractAngleFromEdge(leftCol, true, angleBand, scanYFor, scanYTo) : 0;
  const rightAngle = right.score > 0
    ? extractAngleFromEdge(rightCol, true, angleBand, scanYFor, scanYTo) : 0;

  if (left.score > 0 && right.score > 0) {
    if (Math.abs(leftAngle) < 5 && Math.abs(rightAngle) < 5) {
      if (Math.abs(leftAngle - rightAngle) < 2) {
        angleDeg = (leftAngle + rightAngle) / 2;
      } else {
        angleDeg = left.score >= right.score ? leftAngle : rightAngle;
      }
    } else if (Math.abs(leftAngle) < 5) {
      angleDeg = leftAngle;
    } else if (Math.abs(rightAngle) < 5) {
      angleDeg = rightAngle;
    }
  } else if (left.score > 0 && Math.abs(leftAngle) < 5) {
    angleDeg = leftAngle;
  } else if (right.score > 0 && Math.abs(rightAngle) < 5) {
    angleDeg = rightAngle;
  }

  const detW = rightCol - leftCol;
  const detH = bottomRow - topRow;
  const CARD_WH_RATIO = 2.5 / 3.5;
  const detectedRatio = detH > 0 ? detW / detH : 0;
  const ratioDeviation = Math.abs(detectedRatio - CARD_WH_RATIO) / CARD_WH_RATIO;
  const ratioScore = Math.max(0, 1 - ratioDeviation * 3);
  const sizeScore = (detW > sw * 0.2 && detH > sh * 0.2) ? 1 : 0.3;
  const edgeScore = ((left.score > 0 ? 1 : 0) + (right.score > 0 ? 1 : 0) + (top.score > 0 ? 1 : 0) + (bottom.score > 0 ? 1 : 0)) / 4;
  const overallConfidence = parseFloat((ratioScore * 0.4 + sizeScore * 0.2 + edgeScore * 0.4).toFixed(2));

  return {
    leftPct: (leftCol / sw) * 100,
    rightPct: (rightCol / sw) * 100,
    topPct: (topRow / sh) * 100,
    bottomPct: (bottomRow / sh) * 100,
    angleDeg: parseFloat(angleDeg.toFixed(3)),
    confidence: overallConfidence,
  };
}

async function detectCardBounds(dataUri: string): Promise<{ leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; angleDeg?: number; confidence?: number }> {
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

    const coarse = detectBoundsAtResolution(coarsePixels as any, csw, csh, 0.4, 0.12);

    const FINE_SIZE = 600;
    const fsw = Math.max(40, Math.round(width <= FINE_SIZE ? width : FINE_SIZE * (width / Math.max(width, height))));
    const fsh = Math.max(40, Math.round(height <= FINE_SIZE ? height : FINE_SIZE * (height / Math.max(width, height))));

    const { data: finePixels } = await sharp(buffer)
      .resize(fsw, fsh, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const REFINE_BAND = 12;
    const fine = detectBoundsAtResolution(
      finePixels as any, fsw, fsh, 0.4, 0.15,
      { minPct: Math.max(0, coarse.leftPct - REFINE_BAND), maxPct: Math.min(100, coarse.rightPct + REFINE_BAND) },
      { minPct: Math.max(0, coarse.topPct - REFINE_BAND), maxPct: Math.min(100, coarse.bottomPct + REFINE_BAND) }
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

    const result = {
      leftPercent: parseFloat(clamp(leftPercent, 0, 45).toFixed(1)),
      topPercent: parseFloat(clamp(topPercent, 0, 45).toFixed(1)),
      rightPercent: parseFloat(clamp(rightPercent, 55, 100).toFixed(1)),
      bottomPercent: parseFloat(clamp(bottomPercent, 55, 100).toFixed(1)),
      angleDeg,
      confidence,
    };
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

  let tagCentering: number;
  if (frontWorst <= 55 && backWorst <= 75) tagCentering = 10;
  else if (frontWorst <= 60 && backWorst <= 80) tagCentering = 9;
  else if (frontWorst <= 65 && backWorst <= 85) tagCentering = 8.5;
  else if (frontWorst <= 70 && backWorst <= 90) tagCentering = 8;
  else tagCentering = 7;

  let cgcCentering: number;
  if (frontWorst <= 50 && backWorst <= 55) cgcCentering = 10;
  else if (frontWorst <= 55 && backWorst <= 75) cgcCentering = 10;
  else if (frontWorst <= 60 && backWorst <= 80) cgcCentering = 9.5;
  else if (frontWorst <= 65 && backWorst <= 85) cgcCentering = 9;
  else if (frontWorst <= 70 && backWorst <= 90) cgcCentering = 8.5;
  else cgcCentering = 8;

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

  const httpServer = createServer(app);
  return httpServer;
}
