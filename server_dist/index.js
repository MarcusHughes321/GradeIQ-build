// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

// server/pokemon-sets.ts
var ENGLISH_SETS = {
  // === MEGA EVOLUTION ERA (2025-2026) ===
  "ASC": "Ascended Heroes",
  "PFL": "Phantasmal Flames",
  "PFLen": "Phantasmal Flames",
  "MEG": "Mega Evolution",
  "BLK": "Black Bolt",
  "WHT": "White Flare",
  // === SCARLET & VIOLET ERA (2023-2025) ===
  "DRV": "Destined Rivals",
  "JTG": "Journey Together",
  "PRE": "Prismatic Evolutions",
  "PEV": "Prismatic Evolutions",
  "SSP": "Surging Sparks",
  "SFA": "Surging Sparks",
  "SCR": "Stellar Crown",
  "SHF2": "Shrouded Fable",
  "TWM": "Twilight Masquerade",
  "TEF": "Temporal Forces",
  "PAF": "Paldean Fates",
  "PAR": "Paradox Rift",
  "MEW": "151",
  "OBF": "Obsidian Flames",
  "PAL": "Paldea Evolved",
  "SVI": "Scarlet & Violet",
  // === SWORD & SHIELD ERA (2020-2023) ===
  "CRZ": "Crown Zenith",
  "SIT": "Silver Tempest",
  "LOR": "Lost Origin",
  "PGO": "Pokemon GO",
  "ASR": "Astral Radiance",
  "BRS": "Brilliant Stars",
  "FST": "Fusion Strike",
  "CEL": "Celebrations",
  "EVS": "Evolving Skies",
  "CRE": "Chilling Reign",
  "BST": "Battle Styles",
  "SHF": "Shining Fates",
  "VIV": "Vivid Voltage",
  "CPA": "Champion's Path",
  "DAA": "Darkness Ablaze",
  "RCL": "Rebel Clash",
  "SSH": "Sword & Shield",
  // === SUN & MOON ERA (2017-2019) ===
  "CEC": "Cosmic Eclipse",
  "HIF": "Hidden Fates",
  "UNM": "Unified Minds",
  "UNB": "Unbroken Bonds",
  "DET": "Detective Pikachu",
  "TEU": "Team Up",
  "LOT": "Lost Thunder",
  "DRM": "Dragon Majesty",
  "CES": "Celestial Storm",
  "FLI": "Forbidden Light",
  "UPR": "Ultra Prism",
  "CIN": "Crimson Invasion",
  "SLG": "Shining Legends",
  "BUS": "Burning Shadows",
  "GRI": "Guardians Rising",
  "SM": "Sun & Moon",
  // === XY ERA (2014-2016) ===
  "EVO": "Evolutions",
  "STS": "Steam Siege",
  "FCO": "Fates Collide",
  "GEN": "Generations",
  "BKP": "BREAKpoint",
  "BKT": "BREAKthrough",
  "AOR": "Ancient Origins",
  "ROS": "Roaring Skies",
  "DCR": "Double Crisis",
  "PRC": "Primal Clash",
  "PHF": "Phantom Forces",
  "FFI": "Furious Fists",
  "FLF": "Flashfire",
  "XY": "XY",
  // === BLACK & WHITE ERA (2011-2013) ===
  "LTR": "Legendary Treasures",
  "PLB": "Plasma Blast",
  "PLF": "Plasma Freeze",
  "PLS": "Plasma Storm",
  "BCR": "Boundaries Crossed",
  "DRX": "Dragons Exalted",
  "DRV2": "Dragon Vault",
  "DEX": "Dark Explorers",
  "NXD": "Next Destinies",
  "NVI": "Noble Victories",
  "EPO": "Emerging Powers",
  "BLW": "Black & White",
  // === HEARTGOLD & SOULSILVER ERA (2010-2011) ===
  "CL": "Call of Legends",
  "TM": "Triumphant",
  "UD": "Undaunted",
  "UL": "Unleashed",
  "HS": "HeartGold & SoulSilver",
  // === PLATINUM ERA (2009-2010) ===
  "AR": "Arceus",
  "SV_PLAT": "Supreme Victors",
  "RR": "Rising Rivals",
  "PL": "Platinum",
  // === DIAMOND & PEARL ERA (2007-2009) ===
  "SF": "Stormfront",
  "LA": "Legends Awakened",
  "MD": "Majestic Dawn",
  "GE": "Great Encounters",
  "SW": "Secret Wonders",
  "MT": "Mysterious Treasures",
  "DP": "Diamond & Pearl",
  // === EX ERA (2003-2007) ===
  "PK": "Power Keepers",
  "DF": "Dragon Frontiers",
  "CG": "Crystal Guardians",
  "HP": "Holon Phantoms",
  "LM": "Legend Maker",
  "DS": "Delta Species",
  "UF": "Unseen Forces",
  "EM": "Emerald",
  "DX": "Deoxys",
  "TRR": "Team Rocket Returns",
  "FL": "FireRed & LeafGreen",
  "HL": "Hidden Legends",
  "MA": "Team Magma vs Team Aqua",
  "DR": "Dragon",
  "SS": "Sandstorm",
  "RS": "Ruby & Sapphire",
  // === E-CARD ERA (2002-2003) ===
  "SK": "Skyridge",
  "AQ": "Aquapolis",
  "EX_EXP": "Expedition Base Set",
  // === CLASSIC / WIZARDS ERA (1999-2002) ===
  "N4": "Neo Destiny",
  "N3": "Neo Revelation",
  "N2": "Neo Discovery",
  "N1": "Neo Genesis",
  "G2": "Gym Challenge",
  "G1": "Gym Heroes",
  "TR": "Team Rocket",
  "B2": "Base Set 2",
  "FO": "Fossil",
  "JU": "Jungle",
  "BS": "Base Set",
  // === PROMOS ===
  "SVP": "Scarlet & Violet Promos",
  "SWSHP": "Sword & Shield Promos",
  "SMP": "Sun & Moon Promos",
  "XYP": "XY Promos",
  "BWP": "Black & White Promos",
  "WP": "Wizards Promos"
};
var JAPANESE_SETS = {
  // === MEGA ERA (2025-2026) ===
  "M3": "Nihil Zero",
  "M2a": "Dream ex",
  "M2": "Inferno X",
  "M1S": "Mega Symphonia",
  "M1L": "Mega Brave",
  // === SCARLET & VIOLET ERA ===
  "SV11W": "White Flare",
  "SV11B": "Black Bolt",
  "SV10": "Space-Time Showdown",
  "SV9a": "Heat Wave Arena",
  "SV9": "Battle Partners",
  "SV8a": "Terastal Festival ex",
  "SV8": "Super Electric Breaker",
  "SV7a": "Paradise Dragona",
  "SV7": "Stellar Miracle",
  "SV6a": "Night Wanderer",
  "SV6": "Mask of Change",
  "SV5a": "Crimson Haze",
  "SV5M": "Cyber Judge",
  "SV5K": "Wild Force",
  "SV4a": "Shiny Treasure ex",
  "SV4M": "Future Flash",
  "SV4K": "Ancient Roar",
  "SV3a": "Raging Surf",
  "SV3": "Ruler of the Black Flame",
  "SV2a": "Pokemon Card 151",
  "SV2D": "Clay Burst",
  "SV2P": "Snow Hazard",
  "SV1a": "Triplet Beat",
  "SV1V": "Violet ex",
  "SV1S": "Scarlet ex",
  "sv1": "Scarlet ex / Violet ex",
  // === SWORD & SHIELD ERA ===
  "S12a": "VSTAR Universe",
  "S12": "Paradigm Trigger",
  "S11a": "Incandescent Arcana",
  "S11": "Lost Abyss",
  "S10b": "Pokemon GO",
  "S10a": "Dark Phantasma",
  "S10P": "Space Juggler",
  "S10D": "Time Gazer",
  "S9a": "Battle Region",
  "S9": "Star Birth",
  "S8b": "VMAX Climax",
  "S8a": "25th Anniversary Collection",
  "S8": "Fusion Arts",
  "S7R": "Blue Sky Stream",
  "S7D": "Towering Perfection",
  "S6a": "Eevee Heroes",
  "S6K": "Jet Black Geist",
  "S6H": "White Silver Lance",
  "S5a": "Matchless Fighters",
  "S5R": "Rapid Strike Master",
  "S5I": "Single Strike Master",
  "S4a": "Shiny Star V",
  "S4": "Amazing Volt Tackle",
  "S3a": "Legendary Heartbeat",
  "S3": "Infinity Zone",
  "S2a": "Explosive Walker",
  "S2": "Rebellion Crash",
  "S1a": "VMAX Rising",
  "S1H": "Shield",
  "S1W": "Sword",
  // === SUN & MOON ERA ===
  "SM12a": "Tag All Stars",
  "SM12": "Alter Genesis",
  "SM11b": "Dream League",
  "SM11a": "Remix Bout",
  "SM11": "Miracle Twin",
  "SM10b": "Sky Legend",
  "SM10a": "GG End",
  "SM10": "Double Blaze",
  "SM9b": "Full Metal Wall",
  "SM9a": "Night Unison",
  "SM9": "Tag Bolt",
  "SM8b": "GX Ultra Shiny",
  "SM8a": "Dark Order",
  "SM8": "Super Burst Impact",
  "SM7b": "Fairy Rise",
  "SM7a": "Thunderclap Spark",
  "SM7": "Sky-Splitting Charisma",
  "SM6b": "Champion Road",
  "SM6a": "Dragon Storm",
  "SM6": "Forbidden Light",
  "SM5p": "Ultra Force",
  "SM5M": "Ultra Moon",
  "SM5S": "Ultra Sun",
  "SM4p": "GX Battle Boost",
  "SM4A": "The Best of XY",
  "SM4": "Awakened Heroes / Dimensional Invaders",
  "SM3p": "Shining Legends",
  "SM3N": "Darkness that Consumes Light",
  "SM3H": "To Have Seen the Battle Rainbow",
  "SM3": "Did You See the Fighting Rainbow",
  "SM2p": "Strength Expansion Pack",
  "SM2L": "Alolan Moonlight",
  "SM2K": "Islands Await You",
  "SM2": "Alolan Moonlight / Islands Await You",
  "SM1p": "Pokemon Card Game Sun & Moon",
  "SM1M": "Collection Moon",
  "SM1S": "Collection Sun",
  "SM1": "Collection Sun / Collection Moon",
  // === XY ERA ===
  "XY11": "Explosive Fighter / Cruel Traitor",
  "XY10": "Awakening of Psychic Kings",
  "XY9": "Rage of the Broken Heavens",
  "XY8": "Blue Shock / Red Flash",
  "XY7": "Bandit Ring",
  "XY6": "Emerald Break",
  "XY5": "Gaia Volcano / Tidal Storm",
  "XY4": "Phantom Gate",
  "XY3": "Rising Fist",
  "XY2": "Wild Blaze",
  "XY1": "Collection X / Collection Y",
  // === BLACK & WHITE ERA ===
  "BW11": "Spiral Force / Thunder Knuckle",
  "BW10": "Thunder Knuckle",
  "BW9": "Megalo Cannon",
  "BW8": "Spiral Force",
  "BW7": "Plasma Gale",
  "BW6": "Freeze Bolt / Cold Flare",
  "BW5": "Dragon Blade / Dragon Blast",
  "BW4": "Dark Rush",
  "BW3": "Psycho Drive / Hail Blizzard",
  "BW2": "Red Collection",
  "BW1": "Black Collection / White Collection",
  // === DIAMOND & PEARL ERA ===
  "DPt4": "Advent of Arceus",
  "DPt3": "Pulse of the Frontier",
  "DPt2": "Bonds to the End of Time",
  "DPt1": "Galactic's Conquest",
  "DP5": "Temple of Anger / Cry from the Mysterious",
  "DP4": "Moon Hunting / Night Dashing",
  "DP3": "Shining Darkness",
  "DP2": "Secret of the Lakes",
  "DP1": "Space-Time Creation",
  // === PROMOS ===
  "SV-P": "SV Promo Cards",
  "S-P": "Sword & Shield Promo Cards",
  "SM-P": "Sun & Moon Promo Cards",
  "XY-P": "XY Promo Cards",
  "BW-P": "Black & White Promo Cards"
};
var KOREAN_SETS = {
  // === MEGA ERA ===
  "M2": "Inferno X",
  "M2a": "Dream ex",
  "M1S": "Mega Symphonia",
  "M1L": "Mega Brave",
  // === SCARLET & VIOLET ERA ===
  "SV11W": "White Flare",
  "SV11B": "Black Bolt",
  "SV10": "Glory of Team Rocket",
  "SV9a": "Heat Wave Arena",
  "SV9": "Battle Partners",
  "SV8a": "Terastal Festival ex",
  "SV8": "Super Electric Breaker",
  "SV7a": "Paradise Dragona",
  "SV7": "Stellar Miracle",
  "SV6a": "Night Wanderer",
  "SV6": "Mask of Change",
  "SV5a": "Crimson Haze",
  "SV5M": "Cyber Judge",
  "SV5K": "Wild Force",
  "SV4a": "Shiny Treasure ex",
  "SV4M": "Future Flash",
  "SV4K": "Ancient Roar",
  "SV3a": "Raging Surf",
  "SV3": "Ruler of Black Flame",
  "SV2a": "Pokemon Card 151",
  "SV2D": "Clay Burst",
  "SV2P": "Snow Hazard",
  "SV1a": "Triplet Beat",
  "SV1V": "Violet ex",
  "SV1S": "Scarlet ex",
  // === SWORD & SHIELD ERA ===
  "S12a": "VSTAR Universe",
  "S12": "Paradigm Trigger",
  "S11a": "Incandescent Arcana",
  "S11": "Lost Abyss",
  "S10b": "Pokemon GO",
  "S10a": "Dark Phantasma",
  "S10P": "Space Juggler",
  "S10D": "Time Gazer",
  "S9a": "Battle Region",
  "S9": "Star Birth",
  "S8b": "VMAX Climax",
  "S8a": "25th Anniversary Collection",
  "S8": "Fusion Arts",
  "S7R": "Blue Sky Stream",
  "S7D": "Towering Perfection",
  "S6a": "Eevee Heroes",
  "S6K": "Jet Black Geist",
  "S6H": "White Silver Lance",
  "S5a": "Matchless Fighters",
  "S5R": "Rapid Strike Master",
  "S5I": "Single Strike Master",
  "S4a": "Shiny Star V",
  "S4": "Amazing Volt Tackle",
  "S3a": "Legendary Heartbeat",
  "S3": "Infinity Zone",
  "S2a": "Explosive Walker",
  "S2": "Rebellion Crash",
  "S1a": "VMAX Rising",
  "S1H": "Shield",
  "S1W": "Sword",
  // === SUN & MOON ERA ===
  "SM12a": "Tag All Stars",
  "SM12": "Alter Genesis",
  "SM11b": "Dream League",
  "SM11a": "Remix Bout",
  "SM11": "Miracle Twin",
  "SM10b": "Sky Legend",
  "SM10a": "GG End",
  "SM10": "Double Blaze",
  "SM9": "Tag Bolt",
  "SM8b": "GX Ultra Shiny",
  "SM8": "Super Burst Impact",
  "SM7": "Sky-Splitting Charisma",
  "SM6": "Forbidden Light",
  "SM5M": "Ultra Moon",
  "SM5S": "Ultra Sun",
  "SM4": "Awakened Heroes",
  "SM3": "Did You See the Fighting Rainbow",
  "SM2L": "Alolan Moonlight",
  "SM2K": "Islands Await You",
  "SM1M": "Collection Moon",
  "SM1S": "Collection Sun"
};
var CHINESE_SETS = {
  // === SIMPLIFIED CHINESE (Mainland China) ===
  "CS6": "SV Era Set 6",
  "CS5b": "Brave Stars",
  "CS5a": "SV Era Set 5a",
  "CS4": "SV Era Set 4",
  "CS3": "SV Era Set 3",
  "CS2": "Vivid Portrayals",
  "CS1.5": "Dynamax Tactics",
  "CS1a": "Dynamax Clash A",
  "CS1b": "Dynamax Clash B",
  "CSM1a": "Storming Emergence A",
  "CSM1b": "Storming Emergence B",
  "CSM1c": "Storming Emergence C",
  // === TRADITIONAL CHINESE (Taiwan / Hong Kong) - uses Japanese-style codes ===
  "M3F": "Nihil Zero",
  "M2aF": "Dream ex",
  "AC2a": "Dreams Come True Collection A",
  "AC2b": "Dreams Come True Collection B"
};
var ENGLISH_SET_SYMBOLS = {
  // === WIZARDS OF THE COAST ERA (1999-2003) ===
  "No symbol": "Base Set",
  "1st Edition stamp, no set symbol": "Base Set (Shadowless)",
  "Pokeball with shadow": "Base Set 2",
  "Palm tree / jungle flower": "Jungle",
  "Skeletal claw / fossil bone": "Fossil",
  "Large letter R": "Team Rocket",
  "Stadium / arena": "Gym Heroes",
  "Hexagonal badge": "Gym Challenge",
  "Two overlapping stars": "Neo Genesis",
  "Fossil / ancient ruins": "Neo Discovery",
  "Shining / burst of light": "Neo Revelation",
  "Dark star / black star": "Neo Destiny",
  "Pikachu face / lightning bolt circle": "Legendary Collection",
  // === E-CARD ERA (2002-2003) ===
  "E-reader stripe / dot code border": "Expedition Base Set",
  "E-reader with crystal droplet": "Aquapolis",
  "E-reader with crystal shard": "Skyridge",
  // === EX ERA (2003-2007) ===
  "Red and blue orbs": "EX Ruby & Sapphire",
  "Desert dunes / sandstorm": "EX Sandstorm",
  "Dragon silhouette": "EX Dragon",
  "Two opposing teams (magma/aqua)": "EX Team Magma vs Team Aqua",
  "Leaf / hidden shape": "EX Hidden Legends",
  "Fire / leaf dual symbol": "EX FireRed & LeafGreen",
  "Large R with gear": "EX Team Rocket Returns",
  "DNA helix / triangle": "EX Deoxys",
  "Emerald gem": "EX Emerald",
  "Yin-yang / dual forces": "EX Unseen Forces",
  "Greek delta symbol": "EX Delta Species",
  "Star map / constellation": "EX Legend Maker",
  "Ghost / phantom": "EX Holon Phantoms",
  "Crystal / prism": "EX Crystal Guardians",
  "Dragon in flight / frontier": "EX Dragon Frontiers",
  "Crown / royal symbol": "EX Power Keepers",
  // === DIAMOND & PEARL ERA (2007-2009) ===
  "Diamond shape": "Diamond & Pearl",
  "Treasure / jewels": "Mysterious Treasures",
  "Starry wonders": "Secret Wonders",
  "Dawn / sunrise": "Majestic Dawn",
  "Ruins / ancient statue": "Legends Awakened",
  "Storm cloud / dark sky": "Stormfront",
  // === PLATINUM ERA (2009-2010) ===
  "Platinum emblem": "Platinum",
  "Shield / rivalry": "Rising Rivals",
  "Crown / supreme": "Supreme Victors",
  "Arceus rings": "Arceus",
  // === HEARTGOLD & SOULSILVER ERA (2010-2011) ===
  "Heart / soul wing": "HeartGold & SoulSilver",
  "Chain link / unleashed": "Unleashed",
  "Sword / shield emblem DP-HGSS style": "Undaunted",
  "Trophy / triumph": "Triumphant",
  "Legendary bird silhouette": "Call of Legends",
  // === BLACK & WHITE ERA (2011-2013) ===
  "Stylized BW logo / black and white yin-yang": "Black & White",
  "Green leaf / emerging powers": "Emerging Powers",
  "Red shield / noble victories": "Noble Victories",
  "Blue gear / next destinies": "Next Destinies",
  "Dark swirl / dark explorers": "Dark Explorers",
  "Ice crystal / dragons exalted": "Dragons Exalted",
  "Dragon skull / dragon vault": "Dragon Vault",
  "Frozen snowflake / boundaries crossed": "Boundaries Crossed",
  "Purple plasma bolt": "Plasma Storm",
  "Blue plasma shield": "Plasma Freeze",
  "Orange plasma flame / blast": "Plasma Blast",
  "Red and gold legendary": "Legendary Treasures",
  // === XY ERA (2014-2016) ===
  "Blue X or red Y shape": "XY",
  "Flame / flashfire": "Flashfire",
  "Green leaf / furious fists": "Furious Fists",
  "Yellow bolt / phantom forces": "Phantom Forces",
  "Red omega / blue alpha symbol": "Primal Clash",
  "Swirling dragon / roaring skies": "Roaring Skies",
  "Ancient stone / ancient origins": "Ancient Origins",
  "Red BREAK symbol / BREAKthrough": "BREAKthrough",
  "Blue BREAK symbol / BREAKpoint": "BREAKpoint",
  "Green vines / fates collide": "Fates Collide",
  "Red steam / steam siege": "Steam Siege",
  "Blue and orange evolution symbol": "Evolutions",
  "Generations flower / radiant collection": "Generations",
  "Double crisis / dual team symbol": "Double Crisis",
  // === SUN & MOON ERA (2017-2019) ===
  "Sun and moon logo / dual celestial": "Sun & Moon",
  "Guardians rising shield / guardian": "Guardians Rising",
  "Fire / burning shadows flame": "Burning Shadows",
  "Light / shining legends star": "Shining Legends",
  "Purple ultra prism / prism star": "Ultra Prism",
  "Red / forbidden light beam": "Forbidden Light",
  "Blue storm / celestial storm cloud": "Celestial Storm",
  "Dragon majesty crown / dragon": "Dragon Majesty",
  "Yellow lightning bolt / lost thunder": "Lost Thunder",
  "Green plant / team up fist": "Team Up",
  "Purple dark / unbroken bonds chain": "Unbroken Bonds",
  "Yellow sun / unified minds brain": "Unified Minds",
  "Purple ghost / hidden fates eye": "Hidden Fates",
  "Blue ice / cosmic eclipse moon": "Cosmic Eclipse",
  // === SWORD & SHIELD ERA (2020-2023) ===
  "Sword and shield crossed": "Sword & Shield",
  "Red fist / rebel clash": "Rebel Clash",
  "Purple / darkness ablaze flame": "Darkness Ablaze",
  "Yellow lightning / vivid voltage bolt": "Vivid Voltage",
  "Blue crown / champion's path trophy": "Champion's Path",
  "Shining star / shining fates sparkle": "Shining Fates",
  "Green leaf / battle styles martial": "Battle Styles",
  "Ice / chilling reign snowflake": "Chilling Reign",
  "Red flame / evolving skies dragon": "Evolving Skies",
  "25th anniversary pokeball": "Celebrations",
  "Star / fusion strike energy": "Fusion Strike",
  "Gold / brilliant stars sparkle": "Brilliant Stars",
  "Gear / astral radiance light": "Astral Radiance",
  "Dark / lost origin portal": "Lost Origin",
  "Silver / silver tempest wind": "Silver Tempest",
  "Crown / crown zenith peak": "Crown Zenith",
  "Pokemon GO logo / pokeball with GO": "Pokemon GO",
  // === SCARLET & VIOLET ERA (2023-present) ===
  "Scarlet and violet SV logo": "Scarlet & Violet",
  "Purple / paldea evolved emblem": "Paldea Evolved",
  "Blue / obsidian flames fire": "Obsidian Flames",
  "151 / original 151 logo": "151",
  "Yellow / paradox rift portal": "Paradox Rift",
  "Green / paldean fates star": "Paldean Fates",
  "Red / temporal forces clock": "Temporal Forces",
  "Blue / twilight masquerade mask": "Twilight Masquerade",
  "Gold / shrouded fable shadow": "Shrouded Fable",
  "Red / stellar crown star": "Stellar Crown",
  "Purple / surging sparks bolt": "Surging Sparks",
  "Blue / prismatic evolutions prism": "Prismatic Evolutions",
  "Red / journey together emblem": "Journey Together"
};
function generateSymbolReferenceForPrompt() {
  const lines = ["=== ENGLISH SET SYMBOLS (use when set code is not printed or not readable) ==="];
  let currentEra = "";
  for (const [symbol, setName] of Object.entries(ENGLISH_SET_SYMBOLS)) {
    if (symbol.startsWith("//")) continue;
    lines.push(`  "${symbol}" = ${setName}`);
  }
  return lines.join("\n");
}
function generateSetReferenceForPrompt() {
  const sections = [];
  sections.push("=== ENGLISH SET CODES ===");
  const englishByEra = {};
  let currentEra = "";
  for (const [code, name] of Object.entries(ENGLISH_SETS)) {
    if (code.includes("_")) continue;
    const entry = `${code} = ${name}`;
    if (!englishByEra[currentEra]) englishByEra[currentEra] = [];
    englishByEra[currentEra].push(entry);
  }
  sections.push(Object.values(ENGLISH_SETS).length > 0 ? Object.entries(ENGLISH_SETS).filter(([code]) => !code.includes("_")).map(([code, name]) => `  ${code} = ${name}`).join("\n") : "");
  sections.push("\n=== JAPANESE SET CODES ===");
  sections.push(Object.entries(JAPANESE_SETS).map(([code, name]) => `  ${code} = ${name}`).join("\n"));
  sections.push("\n=== KOREAN SET CODES (same as Japanese with minor name variations) ===");
  sections.push("Korean cards use the same set codes as Japanese cards (S1W, SV2a, SM8b, etc.)");
  sections.push("\n=== CHINESE SET CODES ===");
  sections.push("Simplified Chinese: CS prefix (CS1a, CS2, CS5b, etc.)");
  sections.push("Traditional Chinese: Often matches Japanese codes or uses F suffix (M3F, M2aF, etc.)");
  sections.push(Object.entries(CHINESE_SETS).map(([code, name]) => `  ${code} = ${name}`).join("\n"));
  return sections.join("\n");
}

// server/routes.ts
var anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL
});
function toClaudeImage(url) {
  if (url.startsWith("data:")) {
    const semicolonIdx = url.indexOf(";");
    const mediaType = url.substring(5, semicolonIdx);
    const base64Data = url.substring(url.indexOf(",") + 1);
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64Data }
    };
  }
  return {
    type: "image",
    source: { type: "url", url }
  };
}
function convertToClaudeContent(openAiContent) {
  return openAiContent.map((item) => {
    if (item.type === "image_url") {
      return toClaudeImage(item.image_url.url);
    }
    return item;
  });
}
var SET_CODE_TO_NAME = {};
function initHardcodedSets() {
  for (const [code, name] of Object.entries(ENGLISH_SETS)) {
    SET_CODE_TO_NAME[code.toLowerCase()] = name;
  }
  for (const [code, name] of Object.entries(JAPANESE_SETS)) {
    SET_CODE_TO_NAME[code.toLowerCase()] = name;
  }
  for (const [code, name] of Object.entries(KOREAN_SETS)) {
    if (!SET_CODE_TO_NAME[code.toLowerCase()]) {
      SET_CODE_TO_NAME[code.toLowerCase()] = name;
    }
  }
  for (const [code, name] of Object.entries(CHINESE_SETS)) {
    if (!SET_CODE_TO_NAME[code.toLowerCase()]) {
      SET_CODE_TO_NAME[code.toLowerCase()] = name;
    }
  }
}
initHardcodedSets();
var dynamicSetReference = generateSetReferenceForPrompt();
var apiDiscoveredSets = {};
function mergeApiSetsIntoLookup(apiSets) {
  let newCount = 0;
  for (const s of apiSets) {
    if (s.ptcgoCode && s.name) {
      const key = s.ptcgoCode.toLowerCase();
      if (!SET_CODE_TO_NAME[key]) {
        SET_CODE_TO_NAME[key] = s.name;
        apiDiscoveredSets[s.ptcgoCode] = s.name;
        newCount++;
      }
    }
    if (s.id && s.name) {
      const key = s.id.toLowerCase();
      if (!SET_CODE_TO_NAME[key]) {
        SET_CODE_TO_NAME[key] = s.name;
        apiDiscoveredSets[s.id] = s.name;
        newCount++;
      }
    }
  }
  if (newCount > 0) {
    console.log(`[set-cache] Discovered ${newCount} new set codes from API`);
    const apiSection = Object.entries(apiDiscoveredSets).map(([code, name]) => `  ${code} = ${name}`).join("\n");
    dynamicSetReference = generateSetReferenceForPrompt() + "\n\n=== ADDITIONAL SETS (auto-discovered from Pokemon TCG API) ===\n" + apiSection;
  }
}
function getCurrentSetReference() {
  return dynamicSetReference;
}
function resolveSetName(setCode, aiSetName) {
  if (!setCode) return aiSetName;
  const key = setCode.toLowerCase().trim();
  return SET_CODE_TO_NAME[key] || aiSetName;
}
var cachedSets = [];
var setsLastFetched = 0;
var SET_CACHE_TTL = 24 * 60 * 60 * 1e3;
async function fetchAndCacheSets() {
  try {
    console.log(`[set-cache] Fetching all sets from Pokemon TCG API...`);
    const resp = await fetch(
      "https://api.pokemontcg.io/v2/sets?select=id,name,series,printedTotal,total,ptcgoCode,releaseDate&pageSize=250&orderBy=releaseDate",
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(15e3) }
    );
    if (!resp.ok) {
      console.log(`[set-cache] API returned ${resp.status}`);
      return;
    }
    const data = await resp.json();
    cachedSets = (data?.data || []).map((s) => ({
      id: s.id || "",
      name: s.name || "",
      series: s.series || "",
      printedTotal: s.printedTotal || 0,
      total: s.total || 0,
      ptcgoCode: s.ptcgoCode || "",
      releaseDate: s.releaseDate || ""
    }));
    setsLastFetched = Date.now();
    console.log(`[set-cache] Cached ${cachedSets.length} sets`);
    mergeApiSetsIntoLookup(cachedSets);
  } catch (e) {
    console.log(`[set-cache] Failed to fetch sets: ${e?.message}`);
  }
}
async function ensureSetsCached() {
  if (cachedSets.length === 0 || Date.now() - setsLastFetched > SET_CACHE_TTL) {
    await fetchAndCacheSets();
  }
  return cachedSets;
}
function findSetsByTotal(printedTotal) {
  return cachedSets.filter((s) => s.printedTotal === printedTotal || s.total === printedTotal);
}
var KNOWN_SET_TOTALS = {
  102: ["Base Set"],
  64: ["Jungle"],
  62: ["Fossil"],
  82: ["Team Rocket"],
  75: ["Neo Discovery"],
  66: ["Neo Revelation"],
  92: ["EX Delta Species"],
  93: ["EX Legend Maker"],
  95: ["EX Team Magma vs Team Aqua"],
  97: ["EX Dragon"],
  100: ["EX Sandstorm", "EX Crystal Guardians"],
  101: ["EX Hidden Legends", "EX FireRed & LeafGreen"],
  106: ["EX Emerald", "EX Unseen Forces", "Flashfire"],
  107: ["EX Deoxys"],
  108: ["Roaring Skies", "Evolutions"],
  109: ["EX Ruby & Sapphire"],
  110: ["EX Holon Phantoms"],
  111: ["Neo Genesis", "Furious Fists"],
  113: ["Legendary Collection", "Emerging Powers"],
  114: ["Black & White", "Steam Siege"],
  119: ["Phantom Forces"],
  122: ["Plasma Freeze", "BREAKpoint"],
  123: ["Mysterious Treasures", "HeartGold & SoulSilver"],
  124: ["Fates Collide"],
  127: ["Stormfront"],
  130: ["Diamond & Pearl"],
  131: ["Forbidden Light"],
  132: ["Gym Heroes", "Gym Challenge", "Secret Wonders"],
  135: ["Plasma Storm"],
  144: ["Skyridge"],
  145: ["Guardians Rising"],
  146: ["Legendary Treasures", "XY"],
  147: ["Aquapolis", "Burning Shadows"],
  149: ["Boundaries Crossed", "Sun & Moon"],
  156: ["Ultra Prism"],
  159: ["Crown Zenith"],
  160: ["Primal Clash"],
  162: ["BREAKthrough"],
  163: ["Battle Styles"],
  165: ["Expedition Base Set", "151"],
  167: ["Twilight Masquerade"],
  168: ["Celestial Storm"],
  172: ["Brilliant Stars"],
  175: ["Stellar Crown"],
  181: ["Team Up"],
  182: ["Temporal Forces"],
  185: ["Vivid Voltage"],
  189: ["Darkness Ablaze", "Astral Radiance"],
  191: ["Surging Sparks"],
  192: ["Rebel Clash"],
  193: ["Paldea Evolved"],
  195: ["Silver Tempest"],
  196: ["Cosmic Eclipse", "Lost Origin"],
  197: ["Obsidian Flames"],
  198: ["Chilling Reign", "Scarlet & Violet"],
  202: ["Sword & Shield"],
  203: ["Evolving Skies"],
  207: ["Paradox Rift"],
  214: ["Lost Thunder", "Unbroken Bonds"],
  236: ["Unified Minds"],
  252: ["Prismatic Evolutions"],
  264: ["Fusion Strike"]
};
function crossCheckSetByCardNumber(aiSetName, cardNumber, logPrefix) {
  if (!cardNumber || !cardNumber.includes("/")) return aiSetName;
  const parts = cardNumber.split("/");
  const denominator = parseInt(parts[1], 10);
  if (isNaN(denominator) || denominator <= 0) return aiSetName;
  const normAiName = aiSetName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aiSet = findSetByName(aiSetName);
  if (aiSet && (aiSet.printedTotal === denominator || aiSet.total === denominator)) {
    return aiSetName;
  }
  const knownSets = KNOWN_SET_TOTALS[denominator];
  if (knownSets) {
    const alreadyCorrect = knownSets.some((s) => s.toLowerCase().replace(/[^a-z0-9]/g, "") === normAiName);
    if (alreadyCorrect) return aiSetName;
  }
  if (aiSet) {
    console.log(`${logPrefix} Set cross-check MISMATCH: AI said "${aiSetName}" (${aiSet.printedTotal} cards) but card number says /${denominator}`);
  } else if (knownSets) {
    const aiInKnown = knownSets.some((s) => s.toLowerCase().replace(/[^a-z0-9]/g, "") === normAiName);
    if (!aiInKnown) {
      console.log(`${logPrefix} Set cross-check MISMATCH: AI said "${aiSetName}" but /${denominator} maps to ${knownSets.join(" or ")}`);
    }
  }
  const candidates = cachedSets.length > 0 ? findSetsByTotal(denominator) : [];
  if (candidates.length === 1) {
    console.log(`${logPrefix} Set cross-check corrected: "${aiSetName}" \u2192 "${candidates[0].name}" (matches /${denominator})`);
    return candidates[0].name;
  } else if (candidates.length > 1) {
    const close = candidates.find((c) => {
      const normC = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return normC.includes(normAiName) || normAiName.includes(normC);
    });
    if (close) {
      console.log(`${logPrefix} Set cross-check corrected: "${aiSetName}" \u2192 "${close.name}" (partial match + /${denominator})`);
      return close.name;
    }
  }
  if (knownSets && knownSets.length === 1) {
    console.log(`${logPrefix} Set cross-check corrected (hardcoded): "${aiSetName}" \u2192 "${knownSets[0]}" (matches /${denominator})`);
    return knownSets[0];
  } else if (knownSets && knownSets.length > 1) {
    const close = knownSets.find((s) => {
      const normS = s.toLowerCase().replace(/[^a-z0-9]/g, "");
      return normS.includes(normAiName) || normAiName.includes(normS);
    });
    if (close) {
      console.log(`${logPrefix} Set cross-check corrected (hardcoded): "${aiSetName}" \u2192 "${close}" (partial match + /${denominator})`);
      return close;
    }
    console.log(`${logPrefix} Set cross-check found ${knownSets.length} candidates for /${denominator}: ${knownSets.join(", ")}`);
  }
  return aiSetName;
}
function findSetByName(name) {
  const cleanName = (n) => n.toLowerCase().replace(/\(english\)|\(unlimited\)|\(1st edition\)|\(japanese\)/gi, "").replace(/[—–-]/g, " ").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const lower = cleanName(name);
  if (!lower) return null;
  let best = null;
  let bestScore = 0;
  for (const s of cachedSets) {
    const sLower = cleanName(s.name);
    if (sLower === lower) return s;
    let score = 0;
    if (lower === sLower) {
      score = 1;
    } else if (sLower === lower || lower.startsWith(sLower + " ") || sLower.startsWith(lower + " ")) {
      score = Math.min(sLower.length, lower.length) / Math.max(sLower.length, lower.length);
      score = Math.min(score + 0.1, 1);
    } else if (sLower.includes(lower) || lower.includes(sLower)) {
      score = Math.min(sLower.length, lower.length) / Math.max(sLower.length, lower.length);
    } else {
      const sWords = sLower.split(/\s+/);
      const nWords = lower.split(/\s+/);
      const overlap = sWords.filter((w) => nWords.includes(w)).length;
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
function findSetByCode(code) {
  const lower = code.toLowerCase();
  return cachedSets.find((s) => s.id.toLowerCase() === lower || s.ptcgoCode.toLowerCase() === lower) || null;
}
fetchAndCacheSets();
var japaneseSetCards = /* @__PURE__ */ new Map();
var JP_CACHE_TTL = 7 * 24 * 60 * 60 * 1e3;
var JP_SET_CODE_TO_PAGE = {
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
  "s10b": "Pok\xE9mon_GO_(TCG)",
  "s10d": "Time_Gazer",
  "s10p": "Space_Juggler",
  "s11": "Lost_Abyss",
  "s11a": "Incandescent_Arcana",
  "s12": "Paradigm_Trigger",
  "s12a": "VSTAR_Universe",
  "sv1s": "Scarlet_ex_(TCG)",
  "sv1v": "Violet_ex_(TCG)",
  "sv2a": "Pok\xE9mon_Card_151",
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
  "sm12a": "Tag_All_Stars"
};
async function fetchBulbapediaSetCards(setPageName) {
  try {
    const url = `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(setPageName)}_(TCG)`;
    console.log(`[jp-cache] Fetching card list from Bulbapedia: ${url}`);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GradeIQ/1.0)",
        "Accept": "text/html"
      },
      signal: AbortSignal.timeout(1e4)
    });
    if (!resp.ok) {
      const altUrl = `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(setPageName)}`;
      console.log(`[jp-cache] First URL returned ${resp.status}, trying: ${altUrl}`);
      const resp2 = await fetch(altUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GradeIQ/1.0)", "Accept": "text/html" },
        signal: AbortSignal.timeout(1e4)
      });
      if (!resp2.ok) {
        console.log(`[jp-cache] Alt URL also returned ${resp2.status}`);
        return /* @__PURE__ */ new Map();
      }
      const html2 = await resp2.text();
      return parseBulbapediaCardList(html2);
    }
    const html = await resp.text();
    return parseBulbapediaCardList(html);
  } catch (err) {
    console.log(`[jp-cache] Fetch failed: ${err?.message}`);
    return /* @__PURE__ */ new Map();
  }
}
function parseBulbapediaCardList(html) {
  const cards = /* @__PURE__ */ new Map();
  const regex = /title="([^"]+)\s+(\d+)\)"/g;
  let m;
  const setGroups = /* @__PURE__ */ new Map();
  while (m = regex.exec(html)) {
    const full = m[1];
    const num = parseInt(m[2]);
    const lastParen = full.lastIndexOf("(");
    if (lastParen > 0) {
      const cardName = full.substring(0, lastParen).trim();
      const setName = full.substring(lastParen + 1).trim();
      if (!setGroups.has(setName)) setGroups.set(setName, []);
      setGroups.get(setName).push({ num, name: cardName });
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
    for (const c of setGroups.get(largestSetName)) {
      if (!cards.has(c.num)) {
        cards.set(c.num, c.name);
      }
    }
    console.log(`[jp-cache] Parsed ${cards.size} cards from set "${largestSetName}"`);
  }
  return cards;
}
async function lookupJapaneseCard(setCode, cardNumber, aiSetName) {
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
  const searchName = pageName || aiSetName.replace(/\s+/g, "_").replace(/['']/g, "%27");
  const cards = await fetchBulbapediaSetCards(searchName);
  if (cards.size > 0) {
    japaneseSetCards.set(codeKey, {
      cards,
      setName: searchName,
      fetchedAt: Date.now()
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
function buildGradingSystemPrompt() {
  return GRADING_PROMPT_TEMPLATE.replace("{{SET_REFERENCE}}", getCurrentSetReference()).replace("{{SYMBOL_REFERENCE}}", generateSymbolReferenceForPrompt());
}
var GRADING_PROMPT_TEMPLATE = `You are an expert Pokemon card grading analyst with deep knowledge of card grading standards from PSA, Beckett (BGS), Ace Grading, TAG Grading, and CGC Cards. You will analyze images of a Pokemon card (front and back) and provide estimated grades based on each company's published grading criteria.

IMPORTANT GRADING SCALE RULES - YOU MUST FOLLOW THESE EXACTLY:

**PSA (Professional Sports Authenticator) - Scale 1-10, NO 9.5:**
- PSA uses HALF GRADES from 1.5 to 8.5 (e.g., 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10)
- There is NO PSA 9.5. The top grades are PSA 9 (Mint) and PSA 10 (Gem Mint) ONLY.
- PSA does NOT provide individual sub-grades, only an overall grade. The final grade is determined by the weakest category.
- CENTERING THRESHOLDS (front / back) \u2014 updated 2025:
  * PSA 10 (Gem Mint): Front 55/45 or better, Back 75/25 or better. PSA tightened front centering in 2025 from 60/40 to 55/45.
  * PSA 9 (Mint): Front 60/40 to 65/35, Back ~90/10
  * PSA 8 (NM-MT): Front 65/35 to 70/30, Back ~90/10
  * PSA 7 (NM): Front 70/30 to 75/25, Back ~90/10
  * PSA 6 (EX-MT): Front ~80/20, Back ~90/10
  * PSA 5 (EX): Front ~85/15, Back ~90/10
- CORNERS: PSA 10 requires four pristine, perfectly sharp corners. PSA 9 allows corners that are mint to the naked eye with minimal wear. PSA 8 allows slightest fraying at 1-2 corners. PSA 7 allows slight fraying on some corners. PSA 6 allows slightly graduated fraying.
- EDGES: PSA 10 requires perfect edges to the naked eye, virtually perfect under magnification. PSA 9 allows clean edges with minimal wear. PSA 8 allows clean edges with minimal wear. PSA 7 allows minimal wear visible on close inspection. PSA 6 allows very slight notching.
- SURFACE: PSA 10 requires sharp focus, full original gloss, free of staining, no damage or blemishes. One slight printing imperfection allowed if it doesn't impair appeal. PSA 9 allows ONE minor flaw only (very slight wax stain on reverse, minor printing imperfection, OR slightly off-white borders). PSA 8 allows very slight wax stain, slightest fraying, minor printing imperfection, or slightly off-white borders. PSA 7 allows slight surface wear visible on close inspection, minor printing blemish, most original gloss retained.

**Beckett (BGS) - Scale 1-10 with HALF-GRADE sub-grades:**
- BGS uses 0.5 increments for BOTH overall grade AND all sub-grades (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10)
- The LOWEST subgrade heavily influences the overall grade. The lowest subgrade often CAPS the overall.
- Black Label 10 = ALL FOUR subgrades are perfect 10. This is extremely rare.
- Gold Label 10 = Overall 10 but allows ONE sub-grade at 9.5 (three 10s + one 9.5).
- CENTERING THRESHOLDS (front / back):
  * 10 (Pristine): Front 50/50 perfect, Back 55/45 or better
  * 9.5 (Gem Mint): Front 55/45 or better both ways, Back 55/45 or better
  * 9 (Mint): Front 60/40 or better both ways, Back 80/20 or better
  * 8.5 (NM-Mint+): Front 65/35 or better both ways, Back 90/10 or better. Very slight diamond cutting allowed.
  * 8 (NM-Mint): Front 70/30 or better both ways, Back 95/5 or better. Slight diamond cutting allowed.
  * 7 (Near Mint): Front 75/25 or better both ways, Back 95/5 or better
  * 6 (Excellent-Mint): Front 80/20 or better, Back 100/0 allowed. Moderate diamond cutting allowed.
  * 5 (Excellent): Front 85/15 or better, Back 100/0 allowed
- CORNERS: 10 = Perfect to naked eye, virtually flawless under magnification. 9.5 = Sharp corners, minimal imperfection. 9 = Sharp to naked eye, slight imperfections under close exam. 8.5 = Very minor wear on 2-3 corners. 8 = Fuzzy corners but no dings/fraying. 7 = Four fuzzy corners, touch of notching or minor ding. 6 = Slight notching/layering, moderate dings. 5 = Slightly rounded/notched, slight layering.
- EDGES: 10 = Perfect, no imperfections. 9.5 = Clean edges, minimal flaws. 9 = Relatively smooth, specks of chipping visible. 8.5 = Slight roughness, minor chipping/very minor notching. 8 = Moderate roughness, moderate chipping or minor notching. 7 = Noticeable roughness (no layering), very slight notching/chipping. 6 = Readily chipped/notched, slightly layered. 5 = Heavy notching, moderate layering, heavy chipping.
- SURFACE: 10 = Flawless surface, no print spots, scratches, or imperfections. 9.5 = Clean surface, possibly one tiny line under bright light. 9 = A few minor print spots; very minor color/focus imperfections; solid gloss with very minor scratches (close inspection only). 8.5 = Few noticeable print spots/speckling; minor color/focus issues; solid gloss, few minor scratches. 8 = Noticeable print spots; minor color/focus issues; minor border discoloration; relatively solid gloss, minor scratches (no scuffing). 7 = Noticeable print spots; minor color/focus flaws; minor wax stains or subtle ink marks.

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
- Fully automated grading using computer vision and Photometric Stereoscopic Imaging \u2014 no human subjectivity.
- CENTERING THRESHOLDS for TCG/Pokemon cards (front / back) \u2014 TAG has SEPARATE thresholds for Pristine vs Gem Mint:
  * TAG Pristine 10: Front 51/49, Back 52/48. TAG is the STRICTEST on centering for TCG cards.
  * TAG Gem Mint 10: Front 60/40, Back 75/25.
  * TAG 9 (Mint): Front 60/40, Back 75/25 (same as Gem Mint 10 \u2014 distinguished by other attributes).
  * TAG 8.5 (NM-MT+): Front 62.5/37.5, Back 85/15
  * TAG 8 (NM-MT): Front 65/35, Back 95/5
  * TAG 7.5 (NM+): Front 67.5/32.5
  * TAG 7 (NM): Front 70/30
  * TAG 6.5 (EX-MT+): Front 72.5/27.5
  * TAG 6 (EX-MT): Front 75/25
- CORNERS: Pristine = Virtually flawless, sharp & crisp, no visible wear/fraying. Gem Mint 10 = 4 sharp corners with minor fill/fray artifacts. 9 = Sharp & square, up to 2 very light front touches, multiple back touches. 8.5 = Sharp & square, multiple light front touches, missing stock on back corners. 8 = Sharp & square, corners may start showing minor wear. 7.5 = Corners losing sharpness, all 4 may have touches/fraying. 7 = Same as 7.5 but more pronounced.
- EDGES: Pristine = Virtually flawless, very minor fill/fray under hi-res. Gem Mint 10 = Very minor fill or fray under high-resolution. 9 = Minor fill/fray visible under hi-res. 8.5 = More significant fill/fray artifacts. 8 = Visible edge wear/light chipping on multiple edges. 7 = Edges may chip & fray.
- SURFACE: TAG is STRICTER on surface than other companies. Pristine = Extremely attractive, slight print imperfection only under hi-res (Non-Human Observable Defects only). Gem Mint 10 = Very minor surface wear, tiny pit or light scratch that doesn't penetrate gloss. 9 = Very minor surface wear, small pits, light scratches (no gloss penetration on front), small scratch penetrating gloss on back, multiple print lines, minor scuffing. 8.5 = Multiple defects: deeper pits, scratches penetrating gloss on back, print lines, minor scuffing. 8 = Multiple surface defects, print lines, very minor scuffing. 7 = Very minor dents visible, multiple print lines, focus imperfections.

**CGC Cards - Scale 1-10 with HALF-GRADE increments, OPTIONAL sub-grades:**
- CGC uses 0.5 increments for the overall grade (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10)
- CGC offers OPTIONAL sub-grades (Centering, Corners, Edges, Surface) \u2014 automatically included with Pristine 10 grades. For our grading estimates, we provide text descriptions per category since sub-grades are not always shown.
- CGC has TWO types of 10:
  * Pristine 10 (Gold Label): Virtually flawless. Front centering 50/50, flawless under 5x magnification. Flawless color and registration. No imperfections. This is extremely rare.
  * Gem Mint 10 (Standard): Near-perfect. Corners perfect to naked eye, free of wear and white spots. Surface free of print spots, perfect gloss. One criterion may fall slightly short of Pristine.
- CENTERING THRESHOLDS:
  * Pristine 10: Front 50/50 exactly, Back 55/45 or better
  * Gem Mint 10: Front 55/45, Back 75/25 or better
  * 9.5 (Mint+): Front ~55/45 to 60/40, Back ~75/25 to 80/20. Premium eye appeal, nearly perfect centering.
  * 9 (Mint): Slight centering deviations. Front ~60/40, Back ~80/20.
  * 8.5 (NM/Mint+): Front ~65/35, Back ~85/15. Average-to-above-average centering. Only one minor flaw allowed.
  * 8 (NM/Mint): Front ~65/35, Back ~90/10. Original border colors/gloss. Slight imperfections on corners under magnification.
  * 7.5 (Near Mint+): Front ~70/30. 2-3 worn/rough corners. Image slightly out of focus.
  * 7 (Near Mint): Front ~70/30. Slightly visible wear on edges/corners. Print pattern may be fuzzy.
- CORNERS: Pristine/Gem 10 = Free of wear, white spots, perfectly sharp. 9.5 = Mint to naked eye, slight imperfections under magnification. 9 = Minor wear visible. 8.5-8 = Minor touches of wear. 7.5-7 = 2-3 worn or rough corners. 6 = Fuzzy corners.
- EDGES: Pristine/Gem 10 = Free of wear, white spots. 9-9.5 = Clean, minimal flaws. 8-8.5 = Relatively smooth with minor touches of wear. 7-7.5 = Slightly visible wear. 6 = Slightly rough edges.
- SURFACE: Pristine requires no print spots, flawless color, perfect gloss, devoid of any surface flaws. Gem Mint 10 = Perfect gloss, free of print spots. 9-9.5 = Deep color, no registration/focus imperfections, no scratches. 8-8.5 = Slight print spots or focus imperfections allowed (subtle). Manufacturing defects (print lines, roller marks, ink smears) count against the grade. Holographic/chrome cards show defects easily under light.

Analyze the card images carefully. Look for:
1. Centering - Measure how well centered the card image is on both front and back. You MUST report actual measured values \u2014 do not default to 50. Here is how to measure:
   - Look at the LEFT and RIGHT borders on the front. If the left border is visibly wider than the right, frontLeftRight > 50. If perfectly equal, frontLeftRight = 50. If the right is wider, still report the larger side.
   - Repeat for TOP and BOTTOM borders (frontTopBottom), and both axes on the back.
   - Report the LARGER side's percentage (e.g., if left border is slightly wider: frontLeftRight = 53 means 53/47 left-to-right).
   - IMPORTANT: Only report 50 if the borders appear TRULY IDENTICAL. Most cards have some off-centering. If one border is even marginally wider, report 51 or higher. A card that looks "pretty well centered" to the eye is typically 52-56, not 50. Perfect 50/50 is extremely rare.
   - Scale: 50 = perfect, 52-55 = very slight off-center, 55-65 = noticeable off-center, 70+ = significant off-center, 80+ = severely off-center.
2. Corners - check all four corners for whitening, dings, or damage. Minor imperfections only visible under magnification should not significantly lower grades.
3. Edges - look for whitening, chipping, or rough cuts along all edges. Factory-level minor edge variation is acceptable for high grades.
4. Surface - Examine the card surface for scratches, scuffs, print lines, staining, ink issues, or other surface defects:
   - The ARTWORK AREA: Look for scratches, scuffs, or wear marks across the Pokemon illustration.
   - The HOLOGRAPHIC/FOIL areas: Scratches show up as white or silvery lines. However, NORMAL holographic rainbow patterns, foil texture, and print grain are NOT defects \u2014 these are standard features of holographic, full-art, illustration rare, and textured cards.
   - The BACK of the card: Check the Pokeball area and blue border for scratches, whitening, or scuffing.
   - Only count surface issues that represent ACTUAL PHYSICAL DAMAGE (scratches, dents, scuffs, creases) \u2014 not normal card manufacturing features.
   - A card with clearly visible scratches that catch light differently from the surrounding surface should be graded accordingly. Multiple distinct scratches on the artwork = surface 5-7 depending on severity.
   - Minor factory print texture common to modern Pokemon cards is NORMAL and should not lower surface grades. Standard factory edge cuts with very slight whitening visible only under enhancement are also NORMAL.

DEFECT MAPPING \u2014 For any flaw you identify that causes a sub-grade to drop below 10, report its approximate location on the card image as a "defect" entry. Each defect should include:
- "side": "front" or "back" \u2014 which side of the card the defect is on
- "x": 0-100 \u2014 horizontal position as a percentage of card width (0=left edge, 100=right edge)
- "y": 0-100 \u2014 vertical position as a percentage of card height (0=top edge, 100=bottom edge)
- "type": "corner", "edge", or "surface"
- "severity": "minor" (9\u21928 level), "moderate" (8\u21927 level), or "major" (below 7)
- "description": Brief description of the specific flaw (e.g., "Slight whitening on corner", "Minor edge chipping", "Light surface scratch")
Corner positions: top-left\u2248(5,5), top-right\u2248(95,5), bottom-left\u2248(5,95), bottom-right\u2248(95,95).
Edge positions: top edge\u2248y:2, bottom edge\u2248y:98, left edge\u2248x:2, right edge\u2248x:98.
Only report defects for REAL flaws that lower grades \u2014 do NOT report defects for sub-grades that remain at 10. If a card is perfect (all 10s), the defects array should be empty.

LANGUAGE HANDLING:
- Pokemon cards exist in MANY languages: English, Japanese, Korean, Chinese (Traditional & Simplified), French, German, Spanish, Italian, Portuguese, etc.
- You MUST identify the card regardless of what language it is printed in.
- ALWAYS respond with the ENGLISH name of the Pokemon, set name, and all text fields, even if the card is in another language.
- For example: a Japanese card showing "\u30EA\u30B6\u30FC\u30C9\u30F3ex" should be reported as "Charizard ex" in cardName.
- For Korean cards: \uB9AC\uC790\uBABD = Charizard, \uD53C\uCE74\uCE04 = Pikachu, \uBBA4\uCE20 = Mewtwo, \uB8E8\uCE74\uB9AC\uC624 = Lucario, \uB808\uCFE0\uC790 = Rayquaza, \uAC90\uAC00 = Gengar, \uB2D8\uD53C\uC544 = Sylveon, \uBE14\uB798\uD0A4 = Umbreon
- For Chinese cards: \u5674\u706B\u9F8D = Charizard, \u76AE\u5361\u4E18 = Pikachu, \u8D85\u5922 = Mewtwo, \u8DEF\u5361\u5229\u6B50 = Lucario, \u70C8\u7A7A\u5750 = Rayquaza, \u803F\u9B3C = Gengar, \u4ED9\u5B50\u4F0A\u5E03 = Sylveon, \u6708\u4EAE\u4F0A\u5E03 = Umbreon
- Use the artwork, card number, set symbol, and your knowledge of Pokemon TCG releases across all languages to identify the card.
- IMPORTANT: Japanese, Korean, and Chinese cards all use the SAME set codes (e.g., s8b, sv2a, sm12) and the SAME card numbering. They are regional releases of the same sets.

CRITICAL FOR CARD IDENTIFICATION \u2014 MULTI-STEP VERIFICATION:

Step 1: IDENTIFY THE POKEMON using name text AND artwork
- READ the Pokemon name that is PRINTED on the card (in ANY language).
- ALSO look at the ARTWORK \u2014 use the Pokemon's distinctive visual features (colors, body shape, face, wings, tail, etc.) to confirm your text reading.
- If the name is hard to read (glare, holographic, non-English), rely MORE on the artwork. Every Pokemon has unique visual features that make identification possible even without reading the name.
- For JAPANESE cards: READ the katakana/kanji name at the top of the card and translate to English.
  Key translations: \u30B3\u30ED\u30C8\u30C3\u30AF = Kricketune, \u30B2\u30CE\u30BB\u30AF\u30C8 = Genesect, \u30EA\u30B6\u30FC\u30C9\u30F3 = Charizard, \u30D4\u30AB\u30C1\u30E5\u30A6 = Pikachu, \u30EB\u30AB\u30EA\u30AA = Lucario, \u30DF\u30E5\u30A6\u30C4\u30FC = Mewtwo, \u30EC\u30C3\u30AF\u30A6\u30B6 = Rayquaza
- For KOREAN cards: READ the Hangul name at the top of the card and translate to English.
  Key translations: \uB9AC\uC790\uBABD = Charizard, \uD53C\uCE74\uCE04 = Pikachu, \uBBA4\uCE20 = Mewtwo, \uB8E8\uCE74\uB9AC\uC624 = Lucario, \uB808\uCFE0\uC790 = Rayquaza, \uD32C\uD140 = Gengar, \uB2D8\uD53C\uC544 = Sylveon, \uBE14\uB798\uD0A4 = Umbreon, \uC5D0\uBE0C\uC774 = Eevee, \uAC00\uBE0C\uB9AC\uC544\uC2A4 = Garchomp, \uBA54\uD0C0\uADF8\uB85C\uC2A4 = Metagross
- For CHINESE cards: READ the Chinese characters and translate to English.
  Key translations: \u5674\u706B\u9F8D = Charizard, \u76AE\u5361\u4E18 = Pikachu, \u8D85\u5922 = Mewtwo, \u8DEF\u5361\u5229\u6B50 = Lucario, \u70C8\u7A7A\u5750 = Rayquaza, \u803F\u9B3C = Gengar, \u4ED9\u5B50\u4F0A\u5E03 = Sylveon, \u6708\u4EAE\u4F0A\u5E03 = Umbreon, \u4F0A\u5E03 = Eevee
- Determine the ENGLISH name of the Pokemon (e.g., Japanese "\u30EA\u30B6\u30FC\u30C9\u30F3ex" = "Charizard ex", Korean "\uB9AC\uC790\uBABDex" = "Charizard ex", Chinese "\u5674\u706B\u9F8Dex" = "Charizard ex").
- Note any suffix like "ex", "EX", "GX", "V", "VMAX", "VSTAR", etc.

Step 2: READ THE CARD NUMBER AND SET CODE
- The card number is printed at the bottom of the card, usually bottom-left or bottom-right.
- It typically follows the format "XXX/YYY" (e.g., "012/220").
- Japanese, Korean, and Chinese cards all have a SET CODE like "s6b", "s12a", "sv1" printed near the card number \u2014 READ this too.
- Card numbers can be hard to read due to glare, angle, small font, or holographic effects. Use these strategies:
  * Look for the "/" character that separates card number from set total
  * Asian-language cards may use formats like "003/007" or "S1a 003/007" or "sv1 003/007"
  * Some promo cards have formats like "SWSH039" or "SVP 050"
  * If partially obscured, use visible digits + set symbol to narrow it down

Step 3: READ THE SET CODE AND IDENTIFY THE SET
- READ the actual set code printed on the card near the card number. This is the SHORT ALPHANUMERIC CODE like "s8b", "sv2a", "PFL", "SV5K", "CRZ", etc.
- The set code is your PRIMARY source of truth for identifying the set. Do NOT guess the set from the Pokemon name, artwork, or your training data.
- Report the set code EXACTLY as printed (e.g., "PFL", "PFLen", "s8b", "sv2a", "SV5K", "CRZ").
- IMPORTANT: Do NOT rely on your training data for set names \u2014 your knowledge may be outdated or wrong. Use ONLY the set code mapping below.
- CRITICAL: The card number's denominator (the number after "/") tells you the set size. Use this to VERIFY your set identification:
  * If card says 160/159, the set has 159 cards \u2014 look for sets with ~159 cards (e.g., Crown Zenith = 159 cards, NOT "151" which has 165 cards)
  * If card says 006/197, the set has 197 cards \u2014 look for sets with ~197 cards (e.g., Obsidian Flames)
  * "151" is ONLY the name of the set with code "MEW" / "sv2a" \u2014 do NOT use "151" as a set name unless the set code is MEW/sv2a
- COMMON MISTAKE: Do NOT confuse Crown Zenith (CRZ, 159 cards, Sword & Shield era, yellow border) with 151 (MEW, 165 cards, Scarlet & Violet era). These are completely different sets.
- For OLDER CARDS (WOTC era through Scarlet & Violet era) that may not have a clearly readable set code, identify the set by the SET SYMBOL (the small icon near the card number) combined with the card number range and card design/border style.
- Use this COMPREHENSIVE symbol-to-set mapping for cards without clearly readable set codes:

{{SYMBOL_REFERENCE}}

- Use this COMPREHENSIVE set code mapping to determine the set name:

{{SET_REFERENCE}}

- If the set code is not in the mapping above, still report the exact set code \u2014 do NOT invent a set name.
- Consider the card's era (vintage WOTC, modern Scarlet & Violet, Mega Evolution, etc.) based on card design/border style
- NEVER call a set "Phantom Forces" \u2014 the correct name for the PFL/PFLen set is "Phantasmal Flames". The XY-era set with code PHF is "Phantom Forces" \u2014 these are DIFFERENT sets.

Step 4: REPORT WHAT YOU READ
- The set code and card number you READ from the card are the source of truth.
- Do NOT substitute a different set code or card number based on your knowledge.
- Secret rares have numbers ABOVE the set total (e.g., "125/094") \u2014 this is normal, do NOT "fix" it.
- If the set code is "PFLen", report "PFLen" \u2014 do NOT change it to "EVO" or any other code.
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
  "defects": [
    {"side": "front", "x": 95, "y": 5, "type": "corner", "severity": "minor", "description": "Slight whitening on top-right corner"},
    {"side": "back", "x": 50, "y": 50, "type": "surface", "severity": "minor", "description": "Faint surface scratch across center"}
  ],
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
- CGC grades: use 0.5 increments (7, 7.5, 8, 8.5, 9, 9.5, 10) - optional sub-grades, text descriptions per category

GRADING PHILOSOPHY \u2014 POLARISED GRADING (FAVOUR 10 OR GRADE HONESTLY LOW):
- EVERY sub-grade (centering, corners, edges, surface) starts at 10 (Gem Mint) by default.
- If you CANNOT see any specific flaw in a category, KEEP IT AT 10. Do not hedge with 9 "just in case." Clean cards deserve 10s \u2014 that is the whole point of grading. Users need to trust that a 10 means the card is worth submitting.
- However, when you DO see a real flaw, grade it HONESTLY and do NOT be generous. Real flaws should pull grades down meaningfully \u2014 do not cluster everything in the 8-9 range. A card with clear visible damage should receive grades of 7, 6, or even 5 and below where warranted.
- You are grading from PHONE PHOTOS, not lab-quality scans. Phone cameras can introduce blur, glare, and compression artifacts. However, if you can see a flaw in the photo, it is almost certainly a real flaw \u2014 grade it accordingly. Do NOT dismiss visible scratches, whitening, or wear as "photo artifacts."

DEFECT COUNTING \u2014 THIS IS CRITICAL:
- Each INDIVIDUAL scratch is a SEPARATE defect. If you see 3 scratch lines on the front surface, that is 3 surface defects, NOT 1. Do NOT group multiple scratches as "some scratches" = 1 defect.
- Each INDIVIDUAL corner with whitening is a SEPARATE defect. 4 corners with whitening = 4 corner defects.
- Front and back flaws in the same category are SEPARATE defects. Scratches on the front AND scratches on the back = multiple surface defects (count them individually).
- Warped, bent, or misshapen edges indicate CREASING or BENDING \u2014 this is serious structural damage that affects BOTH edges AND surface grades. A warped/misshapen edge is NOT just "edge roughness" \u2014 it is evidence of physical damage to the card.

FRONT ARTWORK DAMAGE \u2014 HEAVILY PENALISED:
- Scratches across the Pokemon artwork/face area are the MOST damaging surface defect because the artwork is the focal point. A scratch across the face of the Pokemon is far more impactful than a scratch in the border area.
- Multiple visible scratches across the front artwork = surface grade 5-6 MAXIMUM. This is not an 8.
- A single clearly visible scratch across the front artwork = surface grade 7 MAXIMUM.
- Scratches on the front artwork COMBINED with scratches on the back = surface grade 5 or lower.

- Generic deduction guide from the starting point of 10 (see company-specific tolerances below for fine-tuning):
  * KEEP AT 10: No visible flaws in this category. The card looks clean and sharp. Do not lower speculatively.
  * 9: ONE or TWO very minor flaws that require close inspection to see (e.g., slight whitening on 1-2 back corners, a single very faint hairline scratch barely visible, tiny edge roughness in one spot)
  * 8: A few minor flaws OR one clearly visible flaw (e.g., whitening on 3-4 back corners, one noticeable scratch, edge roughness along one side). The card still looks clean overall at arm's length.
  * 7: Multiple clearly visible flaws in this category (e.g., whitening visible on front corners, edge wear visible along multiple sides, 2-3 surface scratches visible without close inspection)
  * 6: Flaws immediately obvious at a glance (e.g., all corners showing clear whitening front AND back, edge chipping along multiple sides, surface covered in scratches or scuffs)
  * 5: Significant damage across the category (e.g., heavily rounded corners, edges with deep chipping and whitening, surface with deep scratches or creases, warping or bending visible)
  * 4: Heavy damage \u2014 corners bent or heavily dinged, edges severely chipped or warped, surface with creases or major scratches across the artwork
  * 3 or below: Severe damage \u2014 card has been heavily played, major creases, bends, tears, water damage, or extensive wear across the entire surface

BACK VS FRONT DEFECT WEIGHTING \u2014 CRITICAL:
- Minor back-corner whitening is EXTREMELY COMMON, even on pack-fresh modern cards, because factory cutting naturally leaves slight marks on the back. Light whitening on 2-3 back corners that requires close inspection to see is a 9-level flaw, NOT an 8 or 7. Many real PSA 9 and BGS 9 cards have minor whitening on multiple back corners.
- FRONT corner or edge whitening is much more impactful than back-only whitening. Front-visible whitening should be graded more strictly.
- Back surface scratches that are only "faintly visible" or require close inspection are VERY minor \u2014 a couple of faint back scratches alone should not drop surface below 9.
- Reserve grades of 8 and below for flaws that are clearly visible at normal viewing distance or that appear on the FRONT of the card.

- KEY PRINCIPLE: The grade range should be WIDE. A clean card = 10. A card with minor back-only flaws = 9. A card with one clearly visible flaw or front-visible issues = 8. A card with multiple visible flaws across categories = 6-7. A card with scratches on front AND back, edge whitening/warping, AND corner wear = 4-5. A heavily played/damaged card = 3 or below. Do NOT compress everything into 7-9. Cards with damage across 3+ categories are NEVER 8s.

COMPANY-SPECIFIC DEFECT TOLERANCE \u2014 Each company has different strictness levels. Apply the generic guide above, then ADJUST for each company:

**PSA Defect Tolerance (weakest-link system):**
- PSA grades by the WEAKEST category \u2014 one bad area drags the whole grade down.
- PSA 10: ZERO defects. No scratches, no whitening, no wear. Perfectly sharp corners, perfect edges, perfect surface. One very slight printing imperfection allowed only if it doesn't affect eye appeal.
- PSA 9: A couple of very minor flaws allowed (e.g., slight whitening on 1-3 back corners, OR one very faint hairline scratch on the back, OR minor printing imperfection). The card should still look excellent overall. Minor back-only whitening on multiple corners is common on PSA 9 cards.
- PSA 8: Slight fraying at 1-2 corners visible from the front, OR whitening across all 4 back corners, OR very slight wax stain, OR a noticeable scratch. Still very clean overall.
- PSA 7: Slight fraying on some corners, minimal edge wear visible on close inspection, slight surface wear, minor printing blemish. Most original gloss retained.
- PSA 6: Slightly graduated corner fraying, very slight edge notching, visible surface wear or light scratch (only on close inspection), some gloss loss.
- PSA 5: Very minor corner rounding, minor edge chipping, several light surface scratches, more apparent gloss loss.
- PSA is the STRICTEST on overall grade because weakest-link means one category pulls everything down.

**BGS Defect Tolerance (weighted averaging system):**
- BGS AVERAGES sub-grades but the lowest sub-grade heavily caps the overall. This means BGS can legitimately be 0.5-1.5 HIGHER than PSA for the same card when one category is weak but others are strong.
- BGS 10 surface: ZERO scratches, zero print spots, zero metallic print lines, flawless colour, perfect gloss.
- BGS 9.5 surface: ZERO scratches, zero metallic print lines, perfect gloss. A few extremely minor print spots detectable only under intense scrutiny allowed.
- BGS 9 surface: 1-2 tiny scratches barely noticeable to the naked eye allowed. One faint metallic print line allowed. A handful of printing specks or one minor spot.
- BGS 8.5 surface: Few noticeable print spots/speckling. Solid gloss, few minor scratches visible under close inspection.
- BGS 8 surface: Noticeable print spots. Minor border discoloration. Relatively solid gloss, minor scratches but NO scuffing.
- BGS 7 surface: Noticeable print spots, minor colour/focus flaws, minor wax stains or subtle ink marks. A few minor scratches on close inspection.
- BGS 10 corners: Perfect to naked eye, virtually flawless under magnification.
- BGS 9.5 corners: Sharp, minimal imperfection under magnification.
- BGS 9 corners: Sharp to naked eye, slight imperfections under close exam.
- BGS 8.5 corners: Very minor wear on 2-3 corners.
- BGS 8 corners: Fuzzy corners but NO dings or fraying.
- BGS 7 corners: Four fuzzy corners, touch of notching or minor ding allowed.
- BGS 10 edges: Perfect, no imperfections.
- BGS 9 edges: Relatively smooth, specks of chipping visible.
- BGS 8 edges: Moderate roughness, moderate chipping or minor notching.
- BGS 7 edges: Noticeable roughness (no layering), very slight notching/chipping.

**Ace Grading Defect Tolerance (whole numbers, strict capping):**
- Ace uses WHOLE NUMBERS only, so a card that BGS would give 8.5 gets Ace 8 \u2014 Ace rounds down.
- Ace 10: Four undamaged sharp corners, sharp edges with no whitening/chipping/kinks, beautiful surface with no marks/stains/damage. Very minor factory defects allowed ONLY if they don't detract from eye appeal.
- Ace 9: Nearly identical to 10. May have ONE minor imperfection in ONE category (corners, edges, or surface). One very minor flaw only.
- Ace 8: Few minor imperfections such as slight whitening. Can be across corners, edges, surface, or a combination. Small amount of damage on all four rear corners is an 8-level flaw.
- Ace 7: More noticeable damage. More visible whitening on corners/edges/surfaces. May include perceptible printing defects. Slight wear more visible than an 8.
- Ace 6: More noticeable damage or printing defects. Multiple areas of whitening on corners or edges. Edges may not be sharp.
- Ace 5: More visible print defects and damage. Corners may be misshapen. Whitening/fraying on edges more noticeable. Scratches may obstruct artwork or text.
- CAPPING: Overall grade can NEVER be more than 1 above the lowest sub-grade. E.g., Edges 7 = maximum overall Ace 8.

**TAG Grading Defect Tolerance (AI-automated, strictest on surface):**
- TAG uses "DINGS" (Defects Identified of Notable Grade Significance) \u2014 they focus on defects that meaningfully affect the grade, not every microscopic flaw.
- TAG Pristine 10: Only "Non-Human Observable Defects" (NHODs) allowed \u2014 flaws so tiny that only high-resolution imaging can detect them. Virtually flawless in every category.
- TAG Gem Mint 10: Very minor defects under high-res imaging. 4 sharp corners with minor fill/fray artifacts. Very minor surface wear, tiny pit or light scratch that does NOT penetrate gloss.
- TAG 9: Sharp & square corners, up to 2 very light front touches, multiple back touches. Minor fill/fray on edges visible under hi-res. Very minor surface wear, small pits, light scratches (NO gloss penetration on front). Back can have small scratch penetrating gloss. Multiple print lines, minor scuffing allowed.
- TAG 8.5: Multiple light front corner touches, missing stock on back corners. More significant edge fill/fray artifacts. Deeper pits, scratches penetrating gloss on back, print lines, minor scuffing.
- TAG 8: Corners may start showing minor wear. Visible edge wear/light chipping on multiple edges. Multiple surface defects, print lines, very minor scuffing.
- TAG 7: Corners losing sharpness, all 4 may have touches/fraying. Edges may chip & fray. Very minor dents visible, multiple print lines, focus imperfections.
- TAG is the STRICTEST company on SURFACE. A surface scratch that PSA or BGS might grade 8 could be a TAG 7-7.5. TAG's automated imaging catches every flaw.

**CGC Cards Defect Tolerance (strict on whitening/silvering):**
- CGC is notably STRICT on silvering/whitening on coloured borders \u2014 even tiny whitening on blue/coloured borders can drop from 10 to 9. This is their hallmark strictness area.
- CGC Pristine 10: Virtually flawless. No defects visible under 5x magnification. Perfect centering, perfect corners, perfect edges, flawless surface.
- CGC Gem Mint 10: Free of wear and white spots on corners/edges. Perfect gloss, no print spots. One criterion may fall very slightly short of Pristine.
- CGC 9.5: Very minor imperfections only. Slight minor printing defects on surface, or very minor white spots on edges/corners. Nearly indistinguishable from 10.
- CGC 9: ONE small imperfection allowed \u2014 slight minor wear on edges and corners, OR very minor surface scratches, OR slightly off-centre print. Corners mint to naked eye but slight imperfections under magnification.
- CGC 8.5: Slight wear on some edges and corners. Minor surface blemishes may be visible. Only one minor flaw.
- CGC 8: Minor wear or printing defects. Surface may have slight scratches and white spots. Wear on edges/corners visible upon closer inspection. Most original border colours and gloss retained.
- CGC 7: Slightly visible wear on some edges and corners. Print pattern may be fuzzy. Retains most original colour and gloss.
- CGC WHITENING RULES: Tiny amount of whitening on coloured borders = often drops to 9. Whitening on 2+ corners = typically caps at 8 or 8.5. Considerable whitening = 7 or lower.
- CGC SCRATCH RULES: Minor surface scratch on holo = 9 instead of 10. Light scratches visible on close inspection = grade 7-8. Obvious scratches = 6 or lower.

OVERALL GRADE COMPOUNDING \u2014 Each company calculates overall grades DIFFERENTLY:

**PSA Overall (weakest-link):**
- PSA overall is determined by the WEAKEST category. One bad area drags everything down.
- PSA overall is CAPPED by the WEAKEST category minus 0.5 to 1. If the worst sub-grade equivalent is a 6, PSA overall should be 5-5.5. If the worst is 7, PSA overall should be 6-6.5.
- If flaws span 2+ categories (e.g., corners + edges), PSA overall should be 6 or lower. If flaws span 3+ categories, PSA should be 4-5 or lower.
- Example: A card with edges showing whitening on multiple sides + corners with rounding + surface scratches = PSA 4-5 maximum.

**BGS Overall (weighted average, capped by lowest):**
- BGS AVERAGES the four sub-grades but the lowest sub-grade caps the overall. BGS can legitimately be 0.5-1.5 HIGHER than PSA for the same card.
- Example: Centering 9.5, Corners 8, Edges 9.5, Surface 9.5 \u2192 BGS overall could be 9 (the strong categories pull it up). PSA for the same card would be 8 or lower (corners cap it).
- A single sub-grade of 6 means BGS overall cannot exceed 6.5. A single sub-grade of 7 means BGS overall cannot exceed 8.
- BGS overall should NOT be more than 1.5 higher than PSA for the same card.

**Ace Overall (capped by lowest + 1, whole numbers):**
- Ace overall can NEVER be more than 1 grade HIGHER than its lowest sub-grade.
- Example: If Edges = 7, maximum overall = Ace 8. If Corners = 6, maximum overall = Ace 7.
- Since Ace uses whole numbers only, a card that might get BGS 8.5 gets Ace 8. Ace effectively rounds down.
- Ace overall should be close to PSA (within 1 grade) since both use "weakest area matters" logic.

**TAG Overall (automated scoring, strict capping):**
- TAG uses a 1000-point composite score. The overall is derived from the score, not averaged manually.
- TAG is the STRICTEST on surface of all companies. If a card has surface issues, TAG will often grade lower than PSA or BGS.
- TAG does NOT use 9.5 grades. A card that BGS calls 9.5 will be TAG 9 or TAG 10 (no in-between).
- TAG overall should generally be EQUAL TO or LOWER than BGS for the same card, especially when surface flaws exist.
- CAPPING: TAG overall can NEVER be more than 1 grade higher than its lowest sub-grade. If Surface = 3, TAG overall CANNOT exceed 4. If Edges = 6, TAG overall CANNOT exceed 7. Apply the same capping logic as Ace.
- Since TAG is strictest on surface, when the surface sub-grade is the lowest, TAG overall should be within 0.5-1 of the surface sub-grade (e.g., Surface 3 = TAG overall 3-4, Surface 5 = TAG overall 5-6).
- TAG overall should NEVER be higher than PSA overall + 1. If PSA is 4, TAG should be 3-5 at most.

**CGC Overall (weighted assessment):**
- CGC evaluates all four categories and gives a single overall grade. CGC is notably stricter on whitening/silvering than PSA.
- A card with minor whitening on coloured borders that PSA might give 9 could get CGC 8.5.
- CGC overall should be similar to BGS (within 0.5-1 grade) since both assess holistically rather than weakest-link.
- CGC is also strict on holo/foil surface scratches \u2014 faint scratches on holo that PSA might allow at 9 could drop CGC to 8.5.

FLAW DETECTION CHECKLIST \u2014 Examine each area systematically:
- CORNERS: Zoom in on each of the four corners individually. Look for whitening (white dots or lines where the color has worn away), soft/rounded edges instead of sharp points, dings, or bends. Compare front corners to back corners \u2014 the back often shows more wear. ANY whitening on a corner means that corner is NOT a 10 or 9. Even light rounding = 7-8 max for corners.
- EDGES: Trace along ALL four edges of both front and back. Look for whitening along the edge line, chipping (small pieces of the card surface lifting), nicks, or roughness. The LEFT and RIGHT edges of the back are the most common places for edge wear. A single edge with whitening along its length = edges grade 7 maximum, NOT 8. Whitening on 2+ edges = 6 or lower.
- SURFACE \u2014 FRONT: Examine the entire artwork area. Look for scratches (faint lines running across the surface), scuffs (hazy areas where gloss is lost), print lines (straight lines from the printing process), staining, or indentations. Tilt-angle photos reveal scratches that catch light \u2014 any scratch visible in the angled photo is a REAL surface defect.
- SURFACE \u2014 BACK: The back Pokeball area and blue border are highly prone to scratches and scuffing. Examine the white Pokeball surface for scratch lines running across it \u2014 these are extremely common and often missed. Look for scuffing on the blue border areas. Back surface scratches should lower the surface grade just as much as front scratches.

CONSISTENCY CHECK \u2014 Before finalizing your grades, verify:
1. Count your defects. If you listed 3+ defects in a SINGLE category, that sub-grade should be 6 or lower. If you listed 2 defects in a category, that sub-grade should be 7 or lower. If you listed 4+ total defects across all categories, the PSA overall should be 5 or lower.
2. SCRATCH COUNT CHECK:
   - Count EVERY individual scratch line as a SEPARATE defect. Do NOT group them.
   - 1 faint hairline scratch (barely visible) = surface 8-9 depending on location.
   - 1 clearly visible scratch on the front artwork = surface 7 MAXIMUM.
   - 2+ visible scratches on the front artwork = surface 5-6 MAXIMUM.
   - Scratches on BOTH front and back = surface 5 or lower. Count all scratches from both sides together.
   - For TAG: subtract an additional 0.5-1 from surface grade (TAG is strictest on surface).
3. EDGE AND STRUCTURAL DAMAGE CHECK:
   - Warped, bent, or misshapen edges = edges grade 5-6 MAXIMUM. This indicates the card has been physically damaged (bent/creased).
   - Warped edges ALSO affect surface grade \u2014 a bent card has structural damage, so surface should drop by at least 1 additional grade.
   - Edge whitening along a full edge = edges grade 6-7 maximum. Whitening on multiple edges = 5-6 or lower.
4. If you identified corner whitening on 2+ corners, corners grade should be 7 or lower for BGS/Ace, 6-7 for PSA equivalent. All four corners with whitening = 5-6.
5. COMPANY RELATIONSHIP CHECK \u2014 the grades across companies must make sense relative to each other for the SAME card:
   - PSA should be the LOWEST or tied for lowest overall (weakest-link is harshest).
   - BGS overall can be 0.5-1.5 HIGHER than PSA (averaging helps when only one category is weak).
   - Ace should be within 1 grade of PSA (both penalise the weakest area, but Ace uses whole numbers so may round down).
   - TAG should be EQUAL TO or LOWER than BGS, especially if surface has flaws (TAG is strictest on surface).
   - CGC should be similar to BGS (within 0.5-1 grade). CGC may be lower if the card has whitening on coloured borders or holo scratches.
   - If you gave PSA 5, BGS should be 5-6.5. Ace should be 5-6. TAG should be 5-6. CGC should be 5-6.5.
   - If you gave PSA 9, BGS could be 9-9.5. Ace should be 8-9. TAG should be 8.5-9. CGC should be 8.5-9.5.
6. CROSS-CHECK \u2014 MANDATORY CATEGORY SPREAD CHECK:
   - Count how many categories have ANY defect at all (centering, corners, edges, surface).
   - 1 category with defects: PSA overall can be 7-9 depending on severity.
   - 2 categories with defects: PSA overall should be 6 or lower.
   - 3 categories with defects: PSA overall should be 4-5 or lower.
   - 4 categories with defects: PSA overall should be 3-4 or lower.
   - Cards with widespread issues across multiple areas are NEVER 7-8 cards. An 8 means the card is nearly perfect with only ONE minor issue.
7. RE-CHECK GRADES AGAINST DEFECTS: After writing your grades, re-read your own defect descriptions. If you described damage using words like "whitening", "ding", "scuffing", "roughness", "rounding", "chipping", "indent", "warped", "misshapen", "bent", or "wear", the corresponding sub-grade CANNOT be 8 or above for any company. These words describe moderate-to-significant damage. Only "very faint", "hairline", or "barely visible" flaws warrant an 8.
8. CGC WHITENING CHECK: If you noted any whitening on coloured borders, CGC overall should be 9 maximum. Whitening on 2+ corners = CGC 8-8.5 maximum.
9. TAG SURFACE CHECK: If you noted ANY surface scratch (even minor), TAG surface sub-grade should be 8.5 or lower. TAG penalises surface more heavily than all other companies.
10. FRONT ARTWORK SCRATCH CHECK: If you identified ANY scratch across the Pokemon artwork/face on the front, surface grade CANNOT be 8 or above. Front artwork scratches are the most impactful surface defect. Multiple front artwork scratches = surface 5-6 maximum.

- When in doubt between two grades for ANY damage, lean toward the LOWER grade \u2014 defects always look less severe in photos than in person. Real-world graders would be stricter.
- Do not speculatively lower grades without evidence, but do grade honestly and strictly when real flaws are visible.
- REMEMBER: Most cards submitted for grading do NOT get 8+. If you are finding multiple visible flaws, the card is likely a 4-6 card, not a 7-8 card. An 8 is a NEAR-MINT card with only one minor issue. A card with flaws visible without close inspection is NOT near-mint.`;
var VALID_PSA_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10];
function roundToNearest(value, validValues) {
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
function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}
function roundToWhole(value) {
  return Math.round(value);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function stripSuffix(name) {
  return name.replace(/[\s-]*(ex|EX|gx|GX|v|V|vmax|VMAX|vstar|VSTAR|☆)\s*$/i, "").trim();
}
function formatSetNumber(num, total) {
  const n = String(num);
  const t = String(total);
  if (t && parseInt(t) > 0) {
    const padLen = Math.max(3, t.length);
    return `${n.padStart(padLen, "0")}/${t.padStart(padLen, "0")}`;
  }
  return n;
}
async function queryPokemonTcgApi(q, includePrices = false) {
  try {
    const fields = includePrices ? "name,set,number,rarity,tcgplayer" : "name,set,number";
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=15&select=${fields}`;
    console.log(`[card-lookup] Querying: ${q}`);
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8e3)
    });
    if (!resp.ok) {
      console.log(`[card-lookup] API returned ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    return data?.data || [];
  } catch (e) {
    console.log(`[card-lookup] Query failed: ${e?.message}`);
    return [];
  }
}
function scoreName(apiName, aiName) {
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
  const overlap = aWords.filter((w) => bWords.includes(w)).length;
  if (overlap > 0) return 20 + overlap / Math.max(aWords.length, bWords.length) * 30;
  return 0;
}
async function lookupCardOnline(cardName, setNumber, setName, setCode) {
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
      const betterMatch = matchingSets.find((s) => {
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
      console.log(`[card-lookup] ${matchingSets.length} sets match total=${numericTotal}: ${matchingSets.map((s) => s.name).join(", ")}`);
    } else if (setIsAsianOnly) {
      console.log(`[card-lookup] Set code "${setCode}" appears to be Asian-exclusive, will search by name+number`);
    } else {
      console.log(`[card-lookup] No cached set match for name="${setName}" code="${setCode || "none"}" total=${numericTotal}`);
    }
    console.log(`[card-lookup] Looking up: name="${cardName}" number="${rawNumber}" total="${setTotal}" set="${setName}" code="${setCode || "none"}"`);
    const queries = [];
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
    let allCards = [];
    const seenIds = /* @__PURE__ */ new Set();
    const results = await Promise.all(queries.map((q) => queryPokemonTcgApi(q)));
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
      console.log(`[card-lookup] Best score too low (${bestScore}), rejecting \u2014 trusting AI identification`);
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
      _score: bestScore
    };
  } catch (err) {
    console.log(`[card-lookup] Lookup failed:`, err?.message);
    return null;
  }
}
function fitLineToEdge(pixels, sw, sh, scanXStart, scanXEnd, scanYFrom, scanYTo, direction) {
  const getPixel = (x, y) => {
    if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
    return pixels[y * sw + x];
  };
  const sobelY = (x, y) => {
    return -getPixel(x - 1, y - 1) - 2 * getPixel(x, y - 1) - getPixel(x + 1, y - 1) + getPixel(x - 1, y + 1) + 2 * getPixel(x, y + 1) + getPixel(x + 1, y + 1);
  };
  const EDGE_THRESHOLD = 12;
  const NUM_SAMPLES = 50;
  const edgePoints = [];
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
  const filtered = edgePoints.filter((p) => Math.abs(p.y - medianY) <= tolerance);
  if (filtered.length < 6) return NaN;
  const bestFit = (pts) => {
    const n = pts.length;
    const sumX = pts.reduce((s, p) => s + p.x, 0);
    const sumY = pts.reduce((s, p) => s + p.y, 0);
    const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-3) return { slope: 0, residual: Infinity };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const residual = pts.reduce((s, p) => s + Math.abs(p.y - (slope * p.x + intercept)), 0) / n;
    return { slope, residual };
  };
  let best = bestFit(filtered);
  for (let iter = 0; iter < 2; iter++) {
    const fit = bestFit(filtered);
    const intercept = (filtered.reduce((s, p) => s + p.y, 0) - fit.slope * filtered.reduce((s, p) => s + p.x, 0)) / filtered.length;
    const residuals = filtered.map((p) => Math.abs(p.y - (fit.slope * p.x + intercept)));
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
async function detectCardAngle(dataUri, boundsHint) {
  try {
    const base64Data = dataUri.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) return 0;
    const SAMPLE_SIZE = 400;
    const scaleW = Math.min(1, SAMPLE_SIZE / width);
    const scaleH = Math.min(1, SAMPLE_SIZE / height);
    const sw = Math.round(width * scaleW);
    const sh = Math.round(height * scaleH);
    const { data: pixels } = await sharp(buffer).resize(sw, sh, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const left = boundsHint?.leftPercent ?? 15;
    const right = boundsHint?.rightPercent ?? 85;
    const top = boundsHint?.topPercent ?? 10;
    const bottom = boundsHint?.bottomPercent ?? 90;
    const scanXStart = Math.round(sw * (left + 3) / 100);
    const scanXEnd = Math.round(sw * (right - 3) / 100);
    const bottomEdgeCenter = Math.round(sh * bottom / 100);
    const bottomScanFrom = Math.min(sh - 2, Math.round(bottomEdgeCenter + sh * 0.1));
    const bottomScanTo = Math.max(1, Math.round(bottomEdgeCenter - sh * 0.1));
    const bottomAngle = fitLineToEdge(pixels, sw, sh, scanXStart, scanXEnd, bottomScanFrom, bottomScanTo, "up");
    const topEdgeCenter = Math.round(sh * top / 100);
    const topScanFrom = Math.max(1, Math.round(topEdgeCenter - sh * 0.1));
    const topScanTo = Math.min(sh - 2, Math.round(topEdgeCenter + sh * 0.1));
    const topAngle = fitLineToEdge(pixels, sw, sh, scanXStart, scanXEnd, topScanFrom, topScanTo, "down");
    const validAngles = [];
    if (!isNaN(bottomAngle)) validAngles.push(bottomAngle);
    if (!isNaN(topAngle)) validAngles.push(topAngle);
    let angleDeg;
    if (validAngles.length === 0) {
      console.log(`[detect-angle] No edges detected`);
      return 0;
    } else if (validAngles.length === 2 && Math.abs(validAngles[0] - validAngles[1]) > 2) {
      angleDeg = Math.abs(validAngles[0]) < Math.abs(validAngles[1]) ? validAngles[0] : validAngles[1];
      console.log(`[detect-angle] Top: ${topAngle.toFixed(3)}\xB0, Bottom: ${bottomAngle.toFixed(3)}\xB0, Divergent - using smaller: ${angleDeg.toFixed(3)}\xB0`);
    } else {
      angleDeg = validAngles.reduce((s, v) => s + v, 0) / validAngles.length;
      console.log(`[detect-angle] Top: ${topAngle?.toFixed(3) ?? "N/A"}\xB0, Bottom: ${bottomAngle?.toFixed(3) ?? "N/A"}\xB0, Average: ${angleDeg.toFixed(3)}\xB0`);
    }
    const clamped = Math.max(-10, Math.min(10, angleDeg));
    return parseFloat(clamped.toFixed(2));
  } catch (err) {
    console.error("Card angle detection failed:", err);
    return 0;
  }
}
var boundsCache = /* @__PURE__ */ new Map();
async function convertHeifToJpeg(buffer) {
  const fs2 = await import("fs");
  const { execSync } = await import("child_process");
  const os = await import("os");
  const path2 = await import("path");
  const tmpDir = os.tmpdir();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const heifPath = path2.join(tmpDir, `card_${id}.heic`);
  const jpegPath = path2.join(tmpDir, `card_${id}.jpg`);
  try {
    fs2.writeFileSync(heifPath, buffer);
    execSync(`heif-convert "${heifPath}" "${jpegPath}"`, { timeout: 1e4 });
    const jpegBuf = fs2.readFileSync(jpegPath);
    return jpegBuf;
  } finally {
    try {
      fs2.unlinkSync(heifPath);
    } catch {
    }
    try {
      fs2.unlinkSync(jpegPath);
    } catch {
    }
  }
}
async function optimizeImageForAI(dataUri, maxDim = 2048) {
  try {
    const mimeMatch = dataUri.match(/^data:(image\/[^;]+);base64,/);
    const mime = (mimeMatch?.[1] || "").toLowerCase();
    const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, "");
    let buffer = Buffer.from(base64Data, "base64");
    const isHeif = mime.includes("heic") || mime.includes("heif") || buffer.length > 12 && buffer.toString("ascii", 4, 12).includes("ftyp");
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
    if (w <= maxDim && h <= maxDim && meta.format === "jpeg" && !isHeif) {
      const enhanced = await sharp(buffer).sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 }).modulate({ brightness: 1.02 }).linear(1.15, -(128 * 0.15)).jpeg({ quality: 92 }).toBuffer();
      return `data:image/jpeg;base64,${enhanced.toString("base64")}`;
    }
    let pipeline = sharp(buffer);
    if (w > maxDim || h > maxDim) {
      pipeline = pipeline.resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true });
    }
    pipeline = pipeline.sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 }).modulate({ brightness: 1.02 }).linear(1.15, -(128 * 0.15));
    const optimized = await pipeline.jpeg({ quality: 92 }).toBuffer();
    return `data:image/jpeg;base64,${optimized.toString("base64")}`;
  } catch (err) {
    console.error("[optimize] Image optimization failed:", err);
    return dataUri;
  }
}
async function enhanceForSurfaceDetection(dataUri) {
  try {
    const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const enhanced = await sharp(buffer).sharpen({ sigma: 1.8, m1: 2, m2: 1 }).modulate({ brightness: 1.03 }).linear(1.2, -(128 * 0.2)).jpeg({ quality: 92 }).toBuffer();
    return `data:image/jpeg;base64,${enhanced.toString("base64")}`;
  } catch (err) {
    console.error("[enhance-surface] Surface enhancement failed:", err);
    return dataUri;
  }
}
async function generateCornerCrops(dataUri) {
  const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const meta = await sharp(buffer).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  const cropW = Math.round(w * 0.2);
  const cropH = Math.round(h * 0.2);
  const corners = [
    { left: 0, top: 0, width: cropW, height: cropH },
    { left: w - cropW, top: 0, width: cropW, height: cropH },
    { left: 0, top: h - cropH, width: cropW, height: cropH },
    { left: w - cropW, top: h - cropH, width: cropW, height: cropH }
  ];
  const crops = await Promise.all(
    corners.map(async (region) => {
      const cropped = await sharp(buffer).extract(region).sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 }).jpeg({ quality: 92 }).toBuffer();
      return `data:image/jpeg;base64,${cropped.toString("base64")}`;
    })
  );
  return crops;
}
async function assessImageQuality(dataUri) {
  const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const warnings = [];
  const originalStats = await sharp(buffer).greyscale().stats();
  const brightnessScore = originalStats.channels[0].mean;
  const originalSharpened = await sharp(buffer).greyscale().sharpen({ sigma: 2, m1: 2, m2: 1 }).toBuffer();
  const sharpenedStats = await sharp(originalSharpened).stats();
  const sharpDiff = Math.abs(sharpenedStats.channels[0].stdev - originalStats.channels[0].stdev);
  const blurScore = Math.max(0, Math.min(100, 100 - sharpDiff * 2));
  if (blurScore > 70) {
    warnings.push("Image appears blurry");
  }
  if (brightnessScore < 50) {
    warnings.push("Image too dark");
  }
  if (brightnessScore > 220) {
    warnings.push("Image too bright");
  }
  const isAcceptable = blurScore <= 70 && brightnessScore >= 50 && brightnessScore <= 220;
  return { blurScore, brightnessScore, isAcceptable, warnings };
}
function detectCardRegionByVariance(pixels, sw, sh) {
  const CARD_WH_RATIO = 2.5 / 3.5;
  const getPixel = (x, y) => {
    if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
    return pixels[y * sw + x];
  };
  const colVariance = new Float64Array(sw);
  const rowSampleStep = Math.max(1, Math.floor(sh / 40));
  for (let x = 0; x < sw; x++) {
    const vals = [];
    for (let y = 0; y < sh; y += rowSampleStep) vals.push(getPixel(x, y));
    if (vals.length < 3) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    colVariance[x] = vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
  }
  const rowVariance = new Float64Array(sh);
  const colSampleStep = Math.max(1, Math.floor(sw / 40));
  for (let y = 0; y < sh; y++) {
    const vals = [];
    for (let x = 0; x < sw; x += colSampleStep) vals.push(getPixel(x, y));
    if (vals.length < 3) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    rowVariance[y] = vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
  }
  const smoothVariance = (profile, radius) => {
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
  const smoothCol = smoothVariance(colVariance, Math.max(1, Math.round(sw * 0.02)));
  const smoothRow = smoothVariance(rowVariance, Math.max(1, Math.round(sh * 0.02)));
  const findEdges = (profile) => {
    let maxVar = 0;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] > maxVar) maxVar = profile[i];
    }
    if (maxVar < 10) return { start: Math.round(profile.length * 0.1), end: Math.round(profile.length * 0.9) };
    const threshold = maxVar * 0.2;
    let start = 0;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] >= threshold) {
        start = i;
        break;
      }
    }
    let end = profile.length - 1;
    for (let i = profile.length - 1; i >= 0; i--) {
      if (profile[i] >= threshold) {
        end = i;
        break;
      }
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
    leftPct: Math.max(0, adjLeft) / sw * 100,
    rightPct: Math.min(sw - 1, adjRight) / sw * 100,
    topPct: Math.max(0, adjTop) / sh * 100,
    bottomPct: Math.min(sh - 1, adjBottom) / sh * 100
  };
}
function detectBoundsAtResolution(pixels, sw, sh, _scanRange, _minVoteRatio, xConstraint, yConstraint, slabMode) {
  const CARD_WH_RATIO = 2.5 / 3.5;
  const CARD_WH_RATIO_ROTATED = 3.5 / 2.5;
  const SLAB_WH_RATIO = 0.76;
  const SLAB_WH_RATIO_ROTATED = 1 / 0.76;
  const RATIO_TOLERANCE = slabMode ? 0.3 : 0.12;
  const getPixel = (x, y) => {
    if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
    return pixels[y * sw + x];
  };
  const sobelX = (x, y) => -getPixel(x - 1, y - 1) + getPixel(x + 1, y - 1) + -2 * getPixel(x - 1, y) + 2 * getPixel(x + 1, y) + -getPixel(x - 1, y + 1) + getPixel(x + 1, y + 1);
  const sobelY = (x, y) => -getPixel(x - 1, y - 1) - 2 * getPixel(x, y - 1) - getPixel(x + 1, y - 1) + getPixel(x - 1, y + 1) + 2 * getPixel(x, y + 1) + getPixel(x + 1, y + 1);
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
  const smooth = (profile, radius) => {
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
  const findPeaks = (profile, minSep, constraintMin, constraintMax) => {
    const cMin = constraintMin ?? 2;
    const cMax = constraintMax ?? profile.length - 3;
    let maxVal = 0;
    for (let i = cMin; i <= cMax; i++) {
      if (profile[i] > maxVal) maxVal = profile[i];
    }
    if (maxVal === 0) return [];
    const threshold = maxVal * 0.08;
    const rawPeaks = [];
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
    const selected = [];
    for (const p of rawPeaks) {
      if (!selected.some((s) => Math.abs(s.pos - p.pos) < minSep)) {
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
  let best = {
    left: Math.round(sw * 0.1),
    right: Math.round(sw * 0.9),
    top: Math.round(sh * 0.1),
    bottom: Math.round(sh * 0.9),
    score: -1,
    lStr: 0,
    rStr: 0,
    tStr: 0,
    bStr: 0
  };
  for (let li = 0; li < vPeaks.length; li++) {
    for (let ri = 0; ri < vPeaks.length; ri++) {
      if (li === ri) continue;
      const lp = vPeaks[li];
      const rp = vPeaks[ri];
      if (rp.pos <= lp.pos) continue;
      const cardW = rp.pos - lp.pos;
      if (cardW < sw * 0.2) continue;
      const ratiosToTry = slabMode ? [CARD_WH_RATIO, SLAB_WH_RATIO, CARD_WH_RATIO_ROTATED, SLAB_WH_RATIO_ROTATED] : [CARD_WH_RATIO, CARD_WH_RATIO_ROTATED];
      for (const targetRatio of ratiosToTry) {
        const expectedH = cardW / targetRatio;
        for (let ti = 0; ti < hPeaks.length; ti++) {
          const tp = hPeaks[ti];
          const expectedBottom = tp.pos + expectedH;
          let bestBotPeak = null;
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
          const tryBottom = (botPos, botStr) => {
            const cardH = botPos - tp.pos;
            if (cardH < sh * 0.2) return;
            const ratio = cardW / cardH;
            const ratioError = Math.abs(ratio - targetRatio) / targetRatio;
            if (ratioError > RATIO_TOLERANCE * 2) return;
            const ratioScore2 = Math.max(0, 1 - ratioError / RATIO_TOLERANCE);
            const sizeRatio = cardW * cardH / (sw * sh);
            let sizeScore2;
            if (sizeRatio > 0.85) {
              sizeScore2 = Math.max(0, 1 - (sizeRatio - 0.85) * 5);
            } else {
              sizeScore2 = Math.min(1, sizeRatio / 0.6);
            }
            const maxEdge = Math.max(lp.strength, rp.strength, tp.strength, botStr, 1);
            const edgeNorm = (lp.strength + rp.strength + tp.strength + botStr) / (4 * maxEdge);
            const margin = Math.max(sw, sh) * 0.03;
            let edgeProximityPenalty = 1;
            if (lp.pos < margin) edgeProximityPenalty *= 0.5;
            if (rp.pos > sw - margin) edgeProximityPenalty *= 0.5;
            if (tp.pos < margin) edgeProximityPenalty *= 0.5;
            if (botPos > sh - margin) edgeProximityPenalty *= 0.5;
            const sampleBand = Math.max(2, Math.round(cardW * 0.05));
            const sampleBrightness = (x1, y1, x2, y2, isVert) => {
              let sum = 0;
              let ct = 0;
              const len = isVert ? y2 - y1 : x2 - x1;
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
            const sampleVariance = (x1, y1, x2, y2, isVert) => {
              const values = [];
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
            const rotatedPenalty = targetRatio === CARD_WH_RATIO ? 1 : 0.85;
            const extUniformityWeight = slabMode ? 2 : 4;
            const totalScore = (ratioScore2 * 4 + sizeScore2 * 3 + edgeNorm * 1 + normalizedContrast * 2.5 + minContrastScore * 1.5 + exteriorUniformity * extUniformityWeight) * edgeProximityPenalty * rotatedPenalty;
            if (totalScore > best.score) {
              best = {
                left: lp.pos,
                right: rp.pos,
                top: tp.pos,
                bottom: botPos,
                score: totalScore,
                lStr: lp.strength,
                rStr: rp.strength,
                tStr: tp.strength,
                bStr: botStr
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
            const ratioScore2 = Math.max(0, 1 - ratioError / RATIO_TOLERANCE);
            const sizeRatio = cardW * (inferredBot - inferredTop) / (sw * sh);
            let sizeScore2;
            if (sizeRatio > 0.8) sizeScore2 = Math.max(0, 1 - (sizeRatio - 0.8) * 5);
            else if (sizeRatio > 0.15) sizeScore2 = 1;
            else sizeScore2 = Math.min(1, sizeRatio / 0.15);
            const totalScore = ratioScore2 * 4 + sizeScore2 * 1.5 + 0.5;
            if (totalScore > best.score) {
              best = {
                left: lp.pos,
                right: rp.pos,
                top: inferredTop,
                bottom: inferredBot,
                score: totalScore,
                lStr: lp.strength,
                rStr: rp.strength,
                tStr: 0,
                bStr: 0
              };
            }
          }
        }
      }
    }
  }
  if (vPeaks.length === 0 && hPeaks.length >= 2) {
    const fallbackRatios = slabMode ? [CARD_WH_RATIO, SLAB_WH_RATIO, CARD_WH_RATIO_ROTATED, SLAB_WH_RATIO_ROTATED] : [CARD_WH_RATIO, CARD_WH_RATIO_ROTATED];
    for (const fallbackRatio of fallbackRatios) {
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
            const ratioScore2 = Math.max(0, 1 - ratioError / RATIO_TOLERANCE);
            const sizeRatio = expectedW * cardH / (sw * sh);
            let sizeScore2;
            if (sizeRatio > 0.8) sizeScore2 = Math.max(0, 1 - (sizeRatio - 0.8) * 5);
            else if (sizeRatio > 0.15) sizeScore2 = 1;
            else sizeScore2 = Math.min(1, sizeRatio / 0.15);
            const totalScore = ratioScore2 * 4 + sizeScore2 * 1.5 + 0.5;
            if (totalScore > best.score) {
              best = {
                left: inferredLeft,
                right: inferredRight,
                top: tp.pos,
                bottom: bp.pos,
                score: totalScore,
                lStr: 0,
                rStr: 0,
                tStr: tp.strength,
                bStr: bp.strength
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
  const extractAngleFromEdge = (edgePos, isVertical, searchBand, crossStart, crossEnd) => {
    const points = [];
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
        if (gPrimary >= threshold && gPrimary > gSecondary * 1 && gPrimary > bestGrad) {
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
    let filtered = points.filter((p) => Math.abs(p.main - medianMain) <= tolerance);
    if (filtered.length < 5) return 0;
    const lineFit = (pts) => {
      const n = pts.length;
      const sC = pts.reduce((s, p) => s + p.cross, 0);
      const sM = pts.reduce((s, p) => s + p.main, 0);
      const sCM = pts.reduce((s, p) => s + p.cross * p.main, 0);
      const sC2 = pts.reduce((s, p) => s + p.cross * p.cross, 0);
      const denom = n * sC2 - sC * sC;
      if (Math.abs(denom) < 1e-3) return { slope: 0, residual: Infinity };
      const slope = (n * sCM - sC * sM) / denom;
      const intercept = (sM - slope * sC) / n;
      const residual = pts.reduce((s, p) => s + Math.abs(p.main - (slope * p.cross + intercept)), 0) / n;
      return { slope, residual };
    };
    for (let iter = 0; iter < 2; iter++) {
      const fit = lineFit(filtered);
      if (fit.residual === Infinity) break;
      const intercept = (filtered.reduce((s, p) => s + p.main, 0) - fit.slope * filtered.reduce((s, p) => s + p.cross, 0)) / filtered.length;
      const residuals = filtered.map((p) => Math.abs(p.main - (fit.slope * p.cross + intercept)));
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
  const cardHeightPx = bottomRow - topRow;
  const angleBand = Math.max(3, Math.round(cardWidthPx * 0.04));
  const hAngleBand = Math.max(3, Math.round(cardHeightPx * 0.04));
  const cardTop10 = Math.round(topRow + cardHeightPx * 0.1);
  const cardBot90 = Math.round(topRow + cardHeightPx * 0.9);
  const cardLeft10 = Math.round(leftCol + cardWidthPx * 0.1);
  const cardRight90 = Math.round(leftCol + cardWidthPx * 0.9);
  let angleDeg = 0;
  if (cardWidthPx > sw * 0.1) {
    const leftAngle = extractAngleFromEdge(leftCol, true, angleBand, cardTop10, cardBot90);
    const rightAngle = extractAngleFromEdge(rightCol, true, angleBand, cardTop10, cardBot90);
    const topAngleRaw = extractAngleFromEdge(topRow, false, hAngleBand, cardLeft10, cardRight90);
    const bottomAngleRaw = extractAngleFromEdge(bottomRow, false, hAngleBand, cardLeft10, cardRight90);
    const topAngle = -topAngleRaw;
    const bottomAngle = -bottomAngleRaw;
    const validAngles = [];
    if (Math.abs(leftAngle) < 8) validAngles.push(leftAngle);
    if (Math.abs(rightAngle) < 8) validAngles.push(rightAngle);
    if (Math.abs(topAngle) < 8) validAngles.push(topAngle);
    if (Math.abs(bottomAngle) < 8) validAngles.push(bottomAngle);
    if (validAngles.length >= 2) {
      validAngles.sort((a, b) => a - b);
      const trimmed = validAngles.length >= 4 ? validAngles.slice(1, -1) : validAngles;
      angleDeg = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
    } else if (validAngles.length === 1) {
      angleDeg = validAngles[0];
    }
    console.log(`[detect-angle] L=${leftAngle.toFixed(2)} R=${rightAngle.toFixed(2)} T=${topAngle.toFixed(2)} B=${bottomAngle.toFixed(2)} \u2192 combined=${angleDeg.toFixed(2)}\xB0`);
  }
  const detW = rightCol - leftCol;
  const detH = bottomRow - topRow;
  const detectedRatio = detH > 0 ? detW / detH : 0;
  const ratioDeviation = Math.abs(detectedRatio - CARD_WH_RATIO) / CARD_WH_RATIO;
  const ratioScore = Math.max(0, 1 - ratioDeviation * 3);
  const sizeScore = detW > sw * 0.2 && detH > sh * 0.2 ? 1 : 0.3;
  const overallConfidence = parseFloat((ratioScore * 0.5 + sizeScore * 0.3 + (best.score > 0 ? 0.2 : 0)).toFixed(2));
  console.log(`[detect-bounds] ${sw}x${sh} found ${vPeaks.length} vLines, ${hPeaks.length} hLines \u2192 rect [${leftCol},${topRow}]-[${rightCol},${bottomRow}] ratio=${detectedRatio.toFixed(3)} conf=${overallConfidence} angle=${angleDeg.toFixed(2)}`);
  const refineEdgeSingle = (edgePos, isVert, isMinEdge, crossStart, crossEnd, searchRad) => {
    const numSamples = 50;
    const outerBand = Math.max(5, Math.round(searchRad * 0.6));
    const dim = isVert ? sw : sh;
    const scoreAt = (pos, crossPos) => {
      if (pos < outerBand + 1 || pos >= dim - outerBand - 2) return -1;
      let outsideSum = 0, insideSum = 0, outsideSqSum = 0, insideSqSum = 0;
      for (let k = 1; k <= outerBand; k++) {
        let outPx, inPx;
        if (isVert) {
          if (isMinEdge) {
            outPx = getPixel(pos - k, crossPos);
            inPx = getPixel(pos + k, crossPos);
          } else {
            outPx = getPixel(pos + k, crossPos);
            inPx = getPixel(pos - k, crossPos);
          }
        } else {
          if (isMinEdge) {
            outPx = getPixel(crossPos, pos - k);
            inPx = getPixel(crossPos, pos + k);
          } else {
            outPx = getPixel(crossPos, pos + k);
            inPx = getPixel(crossPos, pos - k);
          }
        }
        outsideSum += outPx;
        insideSum += inPx;
        outsideSqSum += outPx * outPx;
        insideSqSum += inPx * inPx;
      }
      const outsideAvg = outsideSum / outerBand;
      const insideAvg = insideSum / outerBand;
      const gradient = Math.abs(insideAvg - outsideAvg);
      const outsideVar = outsideSqSum / outerBand - outsideAvg * outsideAvg;
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
    const refinedPositions = [];
    for (let i = 0; i < numSamples; i++) {
      const t = (i + 0.5) / numSamples;
      const crossPos = Math.round(crossStart + (crossEnd - crossStart) * t);
      let bestScore = -1;
      let bestPos = edgePos;
      const scanMin = Math.max(outerBand + 1, edgePos - searchRad);
      const scanMax = Math.min(dim - outerBand - 2, edgePos + searchRad);
      for (let pos = scanMin; pos <= scanMax; pos++) {
        const s = scoreAt(pos, crossPos);
        if (s > bestScore) {
          bestScore = s;
          bestPos = pos;
        }
      }
      if (bestPos > scanMin && bestPos < scanMax && bestScore > 0) {
        const sLeft = scoreAt(bestPos - 1, crossPos);
        const sRight = scoreAt(bestPos + 1, crossPos);
        if (sLeft > 0 && sRight > 0) {
          const denom = 2 * (2 * bestScore - sLeft - sRight);
          if (Math.abs(denom) > 1e-3) {
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
    const tight = iqrSlice.filter((p) => Math.abs(p.pos - medianPos) <= tightTolerance);
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
      const correction = arError * refinedW * 0.3 / 2;
      rLeft += correction;
      rRight -= correction;
    }
  }
  console.log(`[detect-bounds] Refined: [${rLeft.toFixed(1)},${rTop.toFixed(1)}]-[${rRight.toFixed(1)},${rBottom.toFixed(1)}] (from [${leftCol},${topRow}]-[${rightCol},${bottomRow}], pass1=[${p1Left.toFixed(1)},${p1Top.toFixed(1)}]-[${p1Right.toFixed(1)},${p1Bottom.toFixed(1)}])`);
  return {
    leftPct: parseFloat((rLeft / sw * 100).toFixed(2)),
    rightPct: parseFloat((rRight / sw * 100).toFixed(2)),
    topPct: parseFloat((rTop / sh * 100).toFixed(2)),
    bottomPct: parseFloat((rBottom / sh * 100).toFixed(2)),
    angleDeg: parseFloat(angleDeg.toFixed(3)),
    confidence: overallConfidence
  };
}
function detectInnerBorders(pixels, sw, sh, outerLeft, outerRight, outerTop, outerBottom) {
  const cardW = outerRight - outerLeft;
  const cardH = outerBottom - outerTop;
  if (cardW < 10 || cardH < 10) return null;
  const getPixel = (x, y) => {
    if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
    return pixels[y * sw + x];
  };
  const sobelX = (x, y) => -getPixel(x - 1, y - 1) + getPixel(x + 1, y - 1) + -2 * getPixel(x - 1, y) + 2 * getPixel(x + 1, y) + -getPixel(x - 1, y + 1) + getPixel(x + 1, y + 1);
  const sobelY = (x, y) => -getPixel(x - 1, y - 1) - 2 * getPixel(x, y - 1) - getPixel(x + 1, y - 1) + getPixel(x - 1, y + 1) + 2 * getPixel(x, y + 1) + getPixel(x + 1, y + 1);
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
  const findInnerEdge = (searchStart, searchEnd, isVertical, crossStart, crossEnd) => {
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
          if (gx > gy * 1 && gx > 6) sum += gx;
        } else {
          const gy = Math.abs(sobelY(c, p));
          const gx = Math.abs(sobelX(c, p));
          if (gy > gx * 1 && gy > 6) sum += gy;
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
  console.log(`[inner-borders] L=${(iL / sw * 100).toFixed(1)}% R=${(iR / sw * 100).toFixed(1)}% T=${(iT / sh * 100).toFixed(1)}% B=${(iB / sh * 100).toFixed(1)}% | borders: L=${(leftBorder * 100).toFixed(1)}% R=${(rightBorder * 100).toFixed(1)}% T=${(topBorder * 100).toFixed(1)}% B=${(bottomBorder * 100).toFixed(1)}%`);
  return {
    innerLeftPct: iL / sw * 100,
    innerTopPct: iT / sh * 100,
    innerRightPct: iR / sw * 100,
    innerBottomPct: iB / sh * 100
  };
}
async function detectCardBounds(dataUri, slabMode) {
  const cacheKey = (slabMode ? "slab:" : "") + dataUri.slice(dataUri.length - 64);
  const cached = boundsCache.get(cacheKey);
  if (cached) return cached;
  try {
    const base64Data = dataUri.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) throw new Error("Could not get image dimensions");
    const COARSE_SIZE = 200;
    const csw = Math.max(20, Math.round(width <= COARSE_SIZE ? width : COARSE_SIZE * (width / Math.max(width, height))));
    const csh = Math.max(20, Math.round(height <= COARSE_SIZE ? height : COARSE_SIZE * (height / Math.max(width, height))));
    const { data: coarsePixels } = await sharp(buffer).resize(csw, csh, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const varianceHint = detectCardRegionByVariance(coarsePixels, csw, csh);
    const coarse = detectBoundsAtResolution(coarsePixels, csw, csh, 0.4, 0.12, void 0, void 0, slabMode);
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
    const FINE_SIZE = 1e3;
    const fsw = Math.max(40, Math.round(width <= FINE_SIZE ? width : FINE_SIZE * (width / Math.max(width, height))));
    const fsh = Math.max(40, Math.round(height <= FINE_SIZE ? height : FINE_SIZE * (height / Math.max(width, height))));
    const { data: finePixels } = await sharp(buffer).resize(fsw, fsh, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const REFINE_BAND = slabMode ? 25 : 15;
    const fine = detectBoundsAtResolution(
      finePixels,
      fsw,
      fsh,
      0.4,
      0.15,
      { minPct: Math.max(0, unionLeft - REFINE_BAND), maxPct: Math.min(100, unionRight + REFINE_BAND) },
      { minPct: Math.max(0, unionTop - REFINE_BAND), maxPct: Math.min(100, unionBottom + REFINE_BAND) },
      slabMode
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
      finePixels,
      fsw,
      fsh,
      outerLeftPx,
      outerRightPx,
      outerTopPx,
      outerBottomPx
    );
    const result = {
      leftPercent: parseFloat(clamp(leftPercent, 0, 45).toFixed(2)),
      topPercent: parseFloat(clamp(topPercent, 0, 45).toFixed(2)),
      rightPercent: parseFloat(clamp(rightPercent, 55, 100).toFixed(2)),
      bottomPercent: parseFloat(clamp(bottomPercent, 55, 100).toFixed(2)),
      angleDeg,
      confidence
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
function enforceCardBounds(bounds) {
  if (!bounds) return { leftPercent: 4, topPercent: 3, rightPercent: 96, bottomPercent: 97 };
  const result = {
    leftPercent: parseFloat(clamp(bounds.leftPercent ?? 5, 1, 45).toFixed(1)),
    topPercent: parseFloat(clamp(bounds.topPercent ?? 3, 1, 45).toFixed(1)),
    rightPercent: parseFloat(clamp(bounds.rightPercent ?? 95, 55, 99).toFixed(1)),
    bottomPercent: parseFloat(clamp(bounds.bottomPercent ?? 97, 55, 99).toFixed(1))
  };
  if (bounds.innerLeftPercent != null) result.innerLeftPercent = bounds.innerLeftPercent;
  if (bounds.innerTopPercent != null) result.innerTopPercent = bounds.innerTopPercent;
  if (bounds.innerRightPercent != null) result.innerRightPercent = bounds.innerRightPercent;
  if (bounds.innerBottomPercent != null) result.innerBottomPercent = bounds.innerBottomPercent;
  return result;
}
function computeCenteringGrades(centering) {
  const frontWorst = Math.max(centering.frontLeftRight, centering.frontTopBottom);
  const backWorst = Math.max(centering.backLeftRight, centering.backTopBottom);
  let psaCentering;
  if (frontWorst <= 55 && backWorst <= 75) psaCentering = 10;
  else if (frontWorst <= 62 && backWorst <= 85) psaCentering = 9;
  else if (frontWorst <= 67 && backWorst <= 90) psaCentering = 8;
  else if (frontWorst <= 72 && backWorst <= 90) psaCentering = 7;
  else if (frontWorst <= 80 && backWorst <= 90) psaCentering = 6;
  else if (frontWorst <= 85 && backWorst <= 90) psaCentering = 5;
  else psaCentering = 4;
  let bgsCentering;
  if (frontWorst <= 50 && backWorst <= 60) bgsCentering = 10;
  else if (frontWorst <= 55 && backWorst <= 60) bgsCentering = 9.5;
  else if (frontWorst <= 55 && backWorst <= 70) bgsCentering = 9;
  else if (frontWorst <= 60 && backWorst <= 80) bgsCentering = 8.5;
  else if (frontWorst <= 65) bgsCentering = 8;
  else if (frontWorst <= 75 && backWorst <= 95) bgsCentering = 7;
  else if (frontWorst <= 80) bgsCentering = 6;
  else bgsCentering = 5;
  let aceCentering;
  if (frontWorst < 60 && backWorst < 60) aceCentering = 10;
  else if (frontWorst <= 65 && backWorst <= 70) aceCentering = 9;
  else if (frontWorst <= 70 && backWorst <= 75) aceCentering = 8;
  else if (frontWorst <= 75 && backWorst <= 80) aceCentering = 7;
  else if (frontWorst <= 80 && backWorst <= 80) aceCentering = 6;
  else if (frontWorst <= 85 && backWorst <= 85) aceCentering = 5;
  else aceCentering = 4;
  let tagCentering;
  if (frontWorst <= 52 && backWorst <= 52) tagCentering = 10;
  else if (frontWorst <= 55 && backWorst <= 65) tagCentering = 9;
  else if (frontWorst <= 60 && backWorst <= 75) tagCentering = 8.5;
  else if (frontWorst <= 62 && backWorst <= 85) tagCentering = 8;
  else if (frontWorst <= 65 && backWorst <= 95) tagCentering = 7;
  else tagCentering = 6;
  let cgcCentering;
  if (frontWorst <= 50 && backWorst <= 55) cgcCentering = 10.5;
  else if (frontWorst <= 55 && backWorst <= 75) cgcCentering = 10;
  else if (frontWorst <= 60 && backWorst <= 80) cgcCentering = 9.5;
  else if (frontWorst <= 62 && backWorst <= 82) cgcCentering = 9;
  else if (frontWorst <= 65 && backWorst <= 85) cgcCentering = 8.5;
  else if (frontWorst <= 70 && backWorst <= 90) cgcCentering = 8;
  else cgcCentering = 7;
  return { psaCentering, bgsCentering, aceCentering, tagCentering, cgcCentering };
}
function syncCenteringToGrades(result) {
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
    let psaNonCenteringMax;
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
    if (result.ace.overallGrade === 10) {
      const otherGrades = [result.ace.corners.grade, result.ace.edges.grade, result.ace.surface.grade];
      const tensCount = otherGrades.filter((g) => g === 10).length;
      const ninesCount = otherGrades.filter((g) => g === 9).length;
      const meetsAce10 = aceCentering === 10 && tensCount >= 2 && ninesCount <= 1;
      if (!meetsAce10) {
        result.ace.overallGrade = 9;
      }
    }
  }
  if (result.tag) {
    result.tag.centering.grade = tagCentering;
    result.tag.centering.notes = centeringNote;
    const tagGrades = [tagCentering, result.tag.corners.grade, result.tag.edges.grade, result.tag.surface.grade];
    const tagLowest = Math.min(...tagGrades);
    const tagAvg = tagGrades.reduce((a, b) => a + b, 0) / 4;
    const tagFromAvg = roundToHalf(tagAvg);
    result.tag.overallGrade = Math.min(tagFromAvg, roundToHalf(tagLowest + 1));
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
function enforceGradingScales(result) {
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
      if (result.beckett[key]?.grade !== void 0) {
        result.beckett[key].grade = roundToHalf(clamp(result.beckett[key].grade, 1, 10));
      }
    }
  }
  if (result.ace) {
    result.ace.overallGrade = roundToWhole(clamp(result.ace.overallGrade, 1, 10));
    for (const key of ["centering", "corners", "edges", "surface"]) {
      if (result.ace[key]?.grade !== void 0) {
        result.ace[key].grade = roundToWhole(clamp(result.ace[key].grade, 1, 10));
      }
    }
    const aceSubGrades = ["centering", "corners", "edges", "surface"].map((k) => result.ace[k]?.grade).filter((g) => g !== void 0 && g !== null);
    if (aceSubGrades.length > 0) {
      const aceLowest = Math.min(...aceSubGrades);
      const aceMaxOverall = roundToWhole(aceLowest + 1);
      if (result.ace.overallGrade > aceMaxOverall) {
        result.ace.overallGrade = aceMaxOverall;
      }
    }
    if (result.ace.overallGrade === 10) {
      const centering = result.ace.centering?.grade ?? 0;
      const corners = result.ace.corners?.grade ?? 0;
      const edges = result.ace.edges?.grade ?? 0;
      const surface = result.ace.surface?.grade ?? 0;
      const otherGrades = [corners, edges, surface];
      const tensCount = otherGrades.filter((g) => g === 10).length;
      const ninesCount = otherGrades.filter((g) => g === 9).length;
      const meetsAce10 = centering === 10 && tensCount >= 2 && ninesCount <= 1;
      if (!meetsAce10) {
        result.ace.overallGrade = 9;
      }
    }
  }
  if (result.tag) {
    result.tag.overallGrade = roundToHalf(clamp(result.tag.overallGrade, 1, 10));
    for (const key of ["centering", "corners", "edges", "surface"]) {
      if (result.tag[key]?.grade !== void 0) {
        result.tag[key].grade = roundToHalf(clamp(result.tag[key].grade, 1, 10));
      }
    }
    const tagCentering = result.tag.centering?.grade;
    const tagCorners = result.tag.corners?.grade;
    const tagEdges = result.tag.edges?.grade;
    const tagSurface = result.tag.surface?.grade;
    const tagSubGrades = [tagCentering, tagCorners, tagEdges, tagSurface].filter((g) => typeof g === "number");
    if (tagSubGrades.length > 0) {
      const tagLowest = Math.min(...tagSubGrades);
      const tagMaxOverall = roundToHalf(tagLowest + 1);
      if (result.tag.overallGrade > tagMaxOverall) {
        console.log(`[enforce] TAG capped: ${result.tag.overallGrade} -> ${tagMaxOverall} (lowest sub: ${tagLowest})`);
        result.tag.overallGrade = tagMaxOverall;
      }
    }
  }
  if (result.cgc) {
    result.cgc.grade = roundToHalf(clamp(result.cgc.grade, 1, 10));
  }
  return result;
}
async function registerRoutes(app2) {
  const gradingJobs = /* @__PURE__ */ new Map();
  setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1e3;
    for (const [id, job] of gradingJobs) {
      if (job.createdAt < oneHourAgo) gradingJobs.delete(id);
    }
  }, 10 * 60 * 1e3);
  async function sendPushNotification(pushToken, title, body) {
    try {
      console.log(`[push] Sending notification to token: ${pushToken.substring(0, 20)}...`);
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          to: pushToken,
          sound: "default",
          title,
          body,
          data: { type: "grading_complete" }
        })
      });
      const respData = await resp.json();
      console.log(`[push] Expo push response:`, JSON.stringify(respData));
    } catch (err) {
      console.error("[push] Failed to send notification:", err);
    }
  }
  async function performGrading(frontImage, backImage, logPrefix = "[grade]") {
    const gradeStartTime = Date.now();
    const rawFrontUrl = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
    const rawBackUrl = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;
    const [frontUrl, backUrl] = await Promise.all([
      optimizeImageForAI(rawFrontUrl),
      optimizeImageForAI(rawBackUrl)
    ]);
    const optimizeTime = Date.now() - gradeStartTime;
    if (optimizeTime > 50) console.log(`${logPrefix} Image optimization took ${optimizeTime}ms`);
    const [enhancedFrontUrl, enhancedBackUrl] = await Promise.all([
      enhanceForSurfaceDetection(frontUrl),
      enhanceForSurfaceDetection(backUrl)
    ]);
    const enhanceTime = Date.now() - gradeStartTime - optimizeTime;
    if (enhanceTime > 50) console.log(`${logPrefix} Surface enhancement took ${enhanceTime}ms`);
    const gradingResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: buildGradingSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this Pokemon card and provide estimated grades from PSA, Beckett (BGS), Ace Grading, TAG Grading, and CGC Cards.\n\nYou are given 4 images:\n- Image 1: FRONT of card (standard)\n- Image 2: BACK of card (standard)\n- Image 3: FRONT of card (SURFACE-ENHANCED \u2014 contrast-boosted to help reveal scratches and scuffs)\n- Image 4: BACK of card (SURFACE-ENHANCED \u2014 contrast-boosted to help reveal scratches and scuffs)\n\nIMPORTANT: Use images 1 and 2 as your PRIMARY source for ALL grading \u2014 card identification, centering, corners, edges, and surface condition. Images 3 and 4 are SUPPLEMENTARY only.\n\nCRITICAL \u2014 ENHANCED IMAGE RULES:\n- The enhancement process amplifies EVERYTHING, including normal card features like holographic rainbow patterns, foil texture, print grain, and standard edge cuts.\n- A defect ONLY counts if you can also see it (even faintly) in the STANDARD images (1 or 2). If something appears ONLY in the enhanced images but is completely invisible in the standard images, it is likely a normal card feature amplified by the enhancement \u2014 do NOT count it.\n- Holographic, full-art, textured, and illustration rare cards naturally have complex surface patterns (rainbow reflections, embossed texture, foil speckling). These are NOT defects. Do not report holographic patterns, print texture, or foil grain as whitening, scratches, or wear.\n- Normal factory edge cuts can appear as slight whitening when enhanced \u2014 this is standard for all cards and is NOT a defect unless clearly visible as actual chipping or peeling in the standard images.\n- When in doubt, always defer to what you see in the STANDARD images. The enhanced images are a second opinion tool, not the primary judge.\n\nIMPORTANT CARD IDENTIFICATION: Read the card number and set code printed at the bottom of the card. Read the Pokemon name from the top. The set code + card number uniquely identify this card \u2014 report them EXACTLY as printed. Do NOT guess or substitute different values. Common digit misreads: 0\u21948, 3\u21948, 6\u21949, 1\u21947.\n\nSURFACE INSPECTION: First examine images 1 and 2 for any visible surface issues. Then check images 3 and 4 to see if any ADDITIONAL real damage becomes clearer \u2014 but only report it if you can trace it back to something visible in images 1 or 2, even if subtle. Do not report texture, holo patterns, or normal print features as damage."
            },
            toClaudeImage(frontUrl),
            toClaudeImage(backUrl),
            toClaudeImage(enhancedFrontUrl),
            toClaudeImage(enhancedBackUrl)
          ]
        }
      ]
    });
    const aiTime = Date.now() - gradeStartTime;
    console.log(`${logPrefix} AI call completed in ${aiTime}ms`);
    const content = gradingResponse.content[0]?.text || "";
    let gradingResult;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      gradingResult = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in AI response");
    }
    gradingResult = enforceGradingScales(gradingResult);
    const cardName = gradingResult.cardName || "";
    const cardNumber = gradingResult.setNumber || "";
    const setName = gradingResult.setName || "";
    const setCode = gradingResult.setCode || "";
    console.log(`${logPrefix} AI result: name="${cardName}" number="${cardNumber}" set="${setName}" code="${setCode}"`);
    const isAsianCode = /^s\d|^sv\d|^sm\d/i.test(setCode || "");
    const hasNonLatinName = /[^\u0000-\u007F]/.test(cardName);
    const isAsianCard = isAsianCode && hasNonLatinName;
    if (isAsianCard) {
      console.log(`${logPrefix} Asian set code "${setCode}" \u2014 trying Bulbapedia database lookup`);
      const cardNum = parseInt((cardNumber || "").split("/")[0]?.replace(/^0+/, "") || "0");
      const numbersToTry = /* @__PURE__ */ new Set();
      if (cardNum > 0) numbersToTry.add(cardNum);
      const boundsPromise = Promise.all([detectCardBounds(frontUrl), detectCardBounds(backUrl)]);
      const lookupPromises = [...numbersToTry].map(
        (num) => lookupJapaneseCard(setCode, num, setName).then((name) => ({ num, name }))
      );
      const [boundsResults, ...bulbapediaResults] = await Promise.all([boundsPromise, ...lookupPromises]);
      const [detectedFront, detectedBack] = boundsResults;
      gradingResult.frontCardBounds = detectedFront;
      gradingResult.backCardBounds = detectedBack;
      const foundResults = bulbapediaResults.filter((r) => r.name !== null);
      console.log(`${logPrefix} Bulbapedia results: ${foundResults.map((r) => `#${r.num}="${r.name}"`).join(", ") || "none"}`);
      if (foundResults.length > 0) {
        const bestBulbapedia = foundResults[0];
        gradingResult.cardName = bestBulbapedia.name;
        const setTotal = (cardNumber || "").split("/")[1] || "";
        gradingResult.setNumber = setTotal ? formatSetNumber(bestBulbapedia.num, setTotal) : String(bestBulbapedia.num);
        const cachedSetPage = japaneseSetCards.get(setCode.toLowerCase());
        if (cachedSetPage) {
          gradingResult.setName = cachedSetPage.setName.replace(/_/g, " ").replace(/\s*\(TCG\)\s*/g, "");
        }
      }
    } else {
      console.log(`${logPrefix} Looking up card online: name="${cardName}" number="${cardNumber}" set="${setName}" code="${setCode}"`);
      const [boundsResults, lookupResult] = await Promise.all([
        Promise.all([detectCardBounds(frontUrl), detectCardBounds(backUrl)]),
        lookupCardOnline(cardName, cardNumber, setName, setCode).catch(() => null)
      ]);
      const [detectedFront, detectedBack] = boundsResults;
      if (lookupResult) {
        let displayName = lookupResult.cardName;
        if (displayName && cardName) {
          const dbLower = displayName.toLowerCase().replace(/[-\s]/g, "");
          const aiLower = cardName.toLowerCase().replace(/[-\s]/g, "");
          const isAbbreviated = /^m\s/i.test(displayName) && /^mega\s/i.test(cardName);
          const aiIsMoreDescriptive = aiLower.length > dbLower.length && aiLower.includes(dbLower.replace(/ex$/i, "").replace(/gx$/i, "").replace(/vmax$/i, "").replace(/vstar$/i, "").slice(0, Math.max(4, dbLower.length / 2)));
          if (isAbbreviated || aiIsMoreDescriptive && cardName.length <= displayName.length * 2.5) {
            displayName = cardName;
          }
        }
        gradingResult.cardName = displayName;
        gradingResult.setName = lookupResult.setName;
        gradingResult.setNumber = lookupResult.setNumber;
      }
      gradingResult.frontCardBounds = detectedFront;
      gradingResult.backCardBounds = detectedBack;
    }
    if (setCode) {
      const resolvedSet = resolveSetName(setCode, gradingResult.setName || "");
      if (resolvedSet !== gradingResult.setName) {
        console.log(`${logPrefix} Set code correction: "${setCode}" \u2192 "${resolvedSet}" (was "${gradingResult.setName}")`);
        gradingResult.setName = resolvedSet;
      }
    }
    if (gradingResult.setNumber && gradingResult.setName) {
      await ensureSetsCached();
      const crossChecked = crossCheckSetByCardNumber(gradingResult.setName, gradingResult.setNumber, logPrefix);
      if (crossChecked !== gradingResult.setName) {
        gradingResult.setName = crossChecked;
      }
    }
    gradingResult = syncCenteringToGrades(gradingResult);
    const totalTime = Date.now() - gradeStartTime;
    console.log(`${logPrefix} Total time: ${totalTime}ms (AI: ${aiTime}ms, lookup+bounds: ${totalTime - aiTime}ms)`);
    return gradingResult;
  }
  async function performDeepGrading(frontImage, backImage, angledFrontImage, angledBackImage, frontCornerCrops, logPrefix = "[deep-grade]", userFrontCorners, userBackCorners) {
    const gradeStartTime = Date.now();
    const rawFrontUrl = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
    const rawBackUrl = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;
    const rawAngledFrontUrl = angledFrontImage.startsWith("data:") ? angledFrontImage : `data:image/jpeg;base64,${angledFrontImage}`;
    const rawAngledBackUrl = angledBackImage ? angledBackImage.startsWith("data:") ? angledBackImage : `data:image/jpeg;base64,${angledBackImage}` : null;
    const optimizePromises = [
      optimizeImageForAI(rawFrontUrl, 2048),
      optimizeImageForAI(rawBackUrl, 2048),
      optimizeImageForAI(rawAngledFrontUrl, 2048)
    ];
    if (rawAngledBackUrl) {
      optimizePromises.push(optimizeImageForAI(rawAngledBackUrl, 2048));
    }
    const hasUserCorners = userFrontCorners && userFrontCorners.length === 4 && userBackCorners && userBackCorners.length === 4;
    if (hasUserCorners) {
      for (const c of userFrontCorners) {
        const raw = c.startsWith("data:") ? c : `data:image/jpeg;base64,${c}`;
        optimizePromises.push(optimizeImageForAI(raw, 1024));
      }
      for (const c of userBackCorners) {
        const raw = c.startsWith("data:") ? c : `data:image/jpeg;base64,${c}`;
        optimizePromises.push(optimizeImageForAI(raw, 1024));
      }
    }
    const optimizedResults = await Promise.all(optimizePromises);
    const frontUrl = optimizedResults[0];
    const backUrl = optimizedResults[1];
    const angledFrontUrl = optimizedResults[2];
    const angledBackUrl = optimizedResults[3] || null;
    const baseIdx = angledBackUrl ? 4 : 3;
    let userFrontCornerUrls = null;
    let userBackCornerUrls = null;
    if (hasUserCorners) {
      userFrontCornerUrls = optimizedResults.slice(baseIdx, baseIdx + 4);
      userBackCornerUrls = optimizedResults.slice(baseIdx + 4, baseIdx + 8);
      console.log(`${logPrefix} User corner photos: ${userFrontCornerUrls.length} front, ${userBackCornerUrls.length} back`);
    }
    const optimizeTime = Date.now() - gradeStartTime;
    if (optimizeTime > 50) console.log(`${logPrefix} Image optimization took ${optimizeTime}ms`);
    let autoCroppedCorners = [];
    if (!hasUserCorners) {
      if (frontCornerCrops && frontCornerCrops.length === 4) {
        autoCroppedCorners = frontCornerCrops;
      } else {
        console.log(`${logPrefix} Generating corner crops from front image...`);
        autoCroppedCorners = await generateCornerCrops(frontUrl);
      }
    }
    const angledDescription = angledBackUrl ? "Image 3: Front at an angle (to reveal surface scratches). Image 4: Back at an angle (to reveal back surface scratches)." : "Image 3: Front at an angle (to reveal surface scratches).";
    let imageDescription;
    if (hasUserCorners) {
      const cornerStartIdx = angledBackUrl ? 5 : 4;
      imageDescription = `This is a DEEP GRADE analysis with ${angledBackUrl ? 12 : 11} images total. Image 1: Front (straight-on). Image 2: Back (straight-on). ${angledDescription} Images ${cornerStartIdx}-${cornerStartIdx + 3}: User-captured close-up photos of FRONT corners (top-left, top-right, bottom-left, bottom-right). Images ${cornerStartIdx + 4}-${cornerStartIdx + 7}: User-captured close-up photos of BACK corners (top-left, top-right, bottom-left, bottom-right). These corner close-ups are taken by the user holding their phone close to each corner \u2014 they show much more detail than auto-crops. Use them to precisely evaluate corner whitening, edge sharpness, dings, and wear at each individual corner.

IMPORTANT: The corner close-ups are your PRIMARY source for corner and edge grading. Examine each one carefully for whitening (white dots/lines), softness, bends, or chipping.

IMPORTANT CARD IDENTIFICATION: Read the card number and set code printed at the bottom of the card. Read the Pokemon name from the top. The set code + card number uniquely identify this card \u2014 report them EXACTLY as printed. Do NOT guess or substitute different values. Common digit misreads: 0\u21948, 3\u21948, 6\u21949, 1\u21947.

SURFACE INSPECTION: Carefully examine the artwork area and card back for ANY scratches, scuffs, or wear marks. The angled shots reveal scratches that catch light. Report every visible scratch as a defect.`;
    } else {
      const cornerStartIdx = angledBackUrl ? 5 : 4;
      imageDescription = `This is a DEEP GRADE analysis with multiple angles. Image 1: Front (straight-on). Image 2: Back (straight-on). ${angledDescription} Images ${cornerStartIdx}-${cornerStartIdx + 3}: Auto-cropped close-ups of the four front corners (top-left, top-right, bottom-left, bottom-right). Use the angled shots to identify surface scratches, scuffs, and wear that may not be visible in the straight-on photos. Use the corner crops to precisely evaluate corner condition.

IMPORTANT CARD IDENTIFICATION: Read the card number and set code printed at the bottom of the card. Read the Pokemon name from the top. The set code + card number uniquely identify this card \u2014 report them EXACTLY as printed. Do NOT guess or substitute different values. Common digit misreads: 0\u21948, 3\u21948, 6\u21949, 1\u21947.

SURFACE INSPECTION: Carefully examine the artwork area and card back for ANY scratches, scuffs, or wear marks. Zoom in mentally on the Pokemon illustration and the Pokeball on the back \u2014 these areas commonly show scratches that catch light. Report every visible scratch as a defect.`;
    }
    const imageContent = [
      { type: "text", text: imageDescription },
      { type: "image_url", image_url: { url: frontUrl, detail: "high" } },
      { type: "image_url", image_url: { url: backUrl, detail: "high" } },
      { type: "image_url", image_url: { url: angledFrontUrl, detail: "high" } },
      ...angledBackUrl ? [{ type: "image_url", image_url: { url: angledBackUrl, detail: "high" } }] : []
    ];
    if (hasUserCorners && userFrontCornerUrls && userBackCornerUrls) {
      for (const url of userFrontCornerUrls) {
        imageContent.push({ type: "image_url", image_url: { url, detail: "high" } });
      }
      for (const url of userBackCornerUrls) {
        imageContent.push({ type: "image_url", image_url: { url, detail: "high" } });
      }
    } else {
      for (const crop of autoCroppedCorners) {
        imageContent.push({ type: "image_url", image_url: { url: crop, detail: "high" } });
      }
    }
    const gradingResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: buildGradingSystemPrompt(),
      messages: [
        { role: "user", content: convertToClaudeContent(imageContent) }
      ]
    });
    const aiTime = Date.now() - gradeStartTime;
    console.log(`${logPrefix} AI call completed in ${aiTime}ms`);
    const content = gradingResponse.content[0]?.text || "";
    let gradingResult;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      gradingResult = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in AI response");
    }
    gradingResult = enforceGradingScales(gradingResult);
    const cardName = gradingResult.cardName || "";
    const cardNumber = gradingResult.setNumber || "";
    const setName = gradingResult.setName || "";
    const setCode = gradingResult.setCode || "";
    console.log(`${logPrefix} AI result: name="${cardName}" number="${cardNumber}" set="${setName}" code="${setCode}"`);
    const isAsianCode = /^s\d|^sv\d|^sm\d/i.test(setCode || "");
    const hasNonLatinName = /[^\u0000-\u007F]/.test(cardName);
    const isAsianCard = isAsianCode && hasNonLatinName;
    if (isAsianCard) {
      console.log(`${logPrefix} Asian set code "${setCode}" \u2014 trying Bulbapedia database lookup`);
      const cardNum = parseInt((cardNumber || "").split("/")[0]?.replace(/^0+/, "") || "0");
      const numbersToTry = /* @__PURE__ */ new Set();
      if (cardNum > 0) numbersToTry.add(cardNum);
      const boundsPromise = Promise.all([detectCardBounds(frontUrl), detectCardBounds(backUrl)]);
      const lookupPromises = [...numbersToTry].map(
        (num) => lookupJapaneseCard(setCode, num, setName).then((name) => ({ num, name }))
      );
      const [boundsResults, ...bulbapediaResults] = await Promise.all([boundsPromise, ...lookupPromises]);
      const [detectedFront, detectedBack] = boundsResults;
      gradingResult.frontCardBounds = detectedFront;
      gradingResult.backCardBounds = detectedBack;
      const foundResults = bulbapediaResults.filter((r) => r.name !== null);
      if (foundResults.length > 0) {
        const bestBulbapedia = foundResults[0];
        gradingResult.cardName = bestBulbapedia.name;
        const setTotal = (cardNumber || "").split("/")[1] || "";
        gradingResult.setNumber = setTotal ? formatSetNumber(bestBulbapedia.num, setTotal) : String(bestBulbapedia.num);
        const cachedSetPage = japaneseSetCards.get(setCode.toLowerCase());
        if (cachedSetPage) {
          gradingResult.setName = cachedSetPage.setName.replace(/_/g, " ").replace(/\s*\(TCG\)\s*/g, "");
        }
      }
    } else {
      const [boundsResults, lookupResult] = await Promise.all([
        Promise.all([detectCardBounds(frontUrl), detectCardBounds(backUrl)]),
        lookupCardOnline(cardName, cardNumber, setName, setCode).catch(() => null)
      ]);
      const [detectedFront, detectedBack] = boundsResults;
      if (lookupResult) {
        let displayName = lookupResult.cardName;
        if (displayName && cardName) {
          const dbLower = displayName.toLowerCase().replace(/[-\s]/g, "");
          const aiLower = cardName.toLowerCase().replace(/[-\s]/g, "");
          const isAbbreviated = /^m\s/i.test(displayName) && /^mega\s/i.test(cardName);
          const aiIsMoreDescriptive = aiLower.length > dbLower.length && aiLower.includes(dbLower.replace(/ex$/i, "").replace(/gx$/i, "").replace(/vmax$/i, "").replace(/vstar$/i, "").slice(0, Math.max(4, dbLower.length / 2)));
          if (isAbbreviated || aiIsMoreDescriptive && cardName.length <= displayName.length * 2.5) {
            displayName = cardName;
          }
        }
        gradingResult.cardName = displayName;
        gradingResult.setName = lookupResult.setName;
        gradingResult.setNumber = lookupResult.setNumber;
      }
      gradingResult.frontCardBounds = detectedFront;
      gradingResult.backCardBounds = detectedBack;
    }
    if (setCode) {
      const resolvedSet = resolveSetName(setCode, gradingResult.setName || "");
      if (resolvedSet !== gradingResult.setName) {
        console.log(`${logPrefix} Set code correction: "${setCode}" \u2192 "${resolvedSet}" (was "${gradingResult.setName}")`);
        gradingResult.setName = resolvedSet;
      }
    }
    if (gradingResult.setNumber && gradingResult.setName) {
      await ensureSetsCached();
      const crossChecked = crossCheckSetByCardNumber(gradingResult.setName, gradingResult.setNumber, logPrefix);
      if (crossChecked !== gradingResult.setName) {
        gradingResult.setName = crossChecked;
      }
    }
    gradingResult = syncCenteringToGrades(gradingResult);
    const totalTime = Date.now() - gradeStartTime;
    console.log(`${logPrefix} Total time: ${totalTime}ms (AI: ${aiTime}ms, lookup+bounds: ${totalTime - aiTime}ms)`);
    return gradingResult;
  }
  app2.post("/api/check-image-quality", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }
      const uri = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
      const quality = await assessImageQuality(uri);
      res.json(quality);
    } catch (error) {
      console.error("Error checking image quality:", error);
      res.status(500).json({ error: error.message || "Failed to check image quality" });
    }
  });
  app2.post("/api/grade-card", async (req, res) => {
    try {
      const { frontImage, backImage } = req.body;
      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back card images are required" });
      }
      const result = await performGrading(frontImage, backImage, "[grade-card]");
      res.json(result);
    } catch (error) {
      console.error("Error grading card:", error);
      res.status(500).json({ error: error.message || "Failed to grade card" });
    }
  });
  app2.post("/api/regrade-card", async (req, res) => {
    try {
      const { frontImage, backImage, cardName, setName, setNumber } = req.body;
      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back card images are required" });
      }
      const rawFront = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
      const rawBack = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;
      const [frontUrl, backUrl] = await Promise.all([
        optimizeImageForAI(rawFront),
        optimizeImageForAI(rawBack)
      ]);
      console.log(`[regrade] Starting fast re-grade for "${cardName}"`);
      const [gradingResponse, detectedFront, detectedBack] = await Promise.all([
        anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: buildGradingSystemPrompt(),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Re-grade this Pokemon card's CONDITION ONLY. The card has already been identified as: ${cardName || "Unknown"} from ${setName || "Unknown"} (${setNumber || "Unknown"}).

Focus ONLY on grading the physical condition: centering, corners, edges, and surface. Do NOT spend time identifying the card \u2014 use the name/set/number provided above.

The first image is the front, the second is the back.`
                },
                toClaudeImage(frontUrl),
                toClaudeImage(backUrl)
              ]
            }
          ]
        }),
        detectCardBounds(frontUrl),
        detectCardBounds(backUrl)
      ]);
      const content = gradingResponse.content[0]?.text || "";
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
    } catch (error) {
      console.error("Error re-grading card:", error);
      res.status(500).json({ error: error.message || "Failed to re-grade card" });
    }
  });
  app2.post("/api/reidentify-card", async (req, res) => {
    try {
      const { frontImage, backImage, previousCardName, previousSetName, previousSetNumber } = req.body;
      if (!frontImage) {
        return res.status(400).json({ error: "Front card image is required" });
      }
      const rawFront = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
      const imagePromises = [optimizeImageForAI(rawFront)];
      if (backImage) {
        const rawBack = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;
        imagePromises.push(optimizeImageForAI(rawBack));
      }
      const [frontUrl, backUrl] = await Promise.all(imagePromises);
      console.log(`[reidentify] Re-identifying card (was: "${previousCardName}")`);
      const imageMessages = [
        {
          type: "image_url",
          image_url: { url: frontUrl, detail: "high" }
        }
      ];
      if (backUrl) {
        imageMessages.push({
          type: "image_url",
          image_url: { url: backUrl, detail: "high" }
        });
      }
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `You are a Pokemon card identification expert. Your ONLY job is to identify the card name, set name, and set number from the card image. You have extensive knowledge of Pokemon TCG cards in ALL languages (English, Japanese, Korean, Chinese, etc.).

${getCurrentSetReference()}

${generateSymbolReferenceForPrompt()}

Respond with ONLY a JSON object in this EXACT format \u2014 no other text:
{
  "cardName": "English name of the Pokemon card (e.g. Charizard ex)",
  "setName": "English name of the TCG set (e.g. Obsidian Flames, Nihil Zero, Prismatic Evolutions)",
  "setNumber": "card number as printed on the card (e.g. 113/080)"
}

CRITICAL RULES:
- "cardName" = the ENGLISH name of the Pokemon. For Japanese/Korean/Chinese cards, TRANSLATE the Pokemon name to English. Read the actual characters on the card \u2014 do NOT guess based on the artwork alone.
- "setName" = the ENGLISH name of the TCG expansion set (NOT the card number). This must be a real set name like "Nihil Zero", "Obsidian Flames", "Battle Partners", etc. NEVER put a card number (like "113/080") in the setName field.
- "setNumber" = the card's collector number as printed at the bottom (e.g. "113/080", "006/197").
- For Japanese cards: Read the katakana/hiragana/kanji name carefully. For example \u30E1\u30AC\u30B5\u30FC\u30CA\u30A4\u30C8 = Mega Gardevoir, \u30DF\u30E5\u30A6 = Mew, \u30EA\u30B6\u30FC\u30C9\u30F3 = Charizard, \u30EB\u30AE\u30A2 = Lugia, \u30EC\u30C3\u30AF\u30A6\u30B6 = Rayquaza. Look at the actual text, not just the art.
- Use the set code printed at the bottom of the card (e.g. "SV7a", "SV8", "sv2a") to match to the correct set name from the set reference above.
- A previous AI identification was WRONG, so be extra careful. Do not guess \u2014 read what is printed on the card.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `IMPORTANT: A previous AI scan incorrectly identified this card as "${previousCardName || "Unknown"}" from set "${previousSetName || "Unknown"}" with number ${previousSetNumber || "Unknown"}. That was WRONG.

Please re-examine the card image${backUrl ? "s (front and back)" : ""} very carefully:
1. READ the Pokemon name printed on the card. If it's in Japanese, translate the actual characters (katakana/hiragana/kanji) to English \u2014 do NOT guess from the artwork.
2. READ the set code at the bottom of the card and match it to a set name.
3. READ the card number at the bottom.

The name "${previousCardName}" was INCORRECT \u2014 find the real name by reading the card text.`
              },
              ...convertToClaudeContent(imageMessages)
            ]
          }
        ]
      });
      const content = response.content[0]?.text || "";
      let result;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        return res.status(500).json({ error: "Failed to parse identification results", raw: content });
      }
      if (result.setName && /^\d+\s*\/\s*\d+$/.test(result.setName.trim())) {
        console.log(`[reidentify] setName "${result.setName}" looks like a card number, clearing it`);
        result.setName = previousSetName || "";
      }
      if (result.setName) {
        result.setName = resolveSetName(result.setName, result.setNumber);
      }
      console.log(`[reidentify] New identification: "${result.cardName}" from "${result.setName}" (${result.setNumber})`);
      res.json(result);
    } catch (error) {
      console.error("Error re-identifying card:", error);
      res.status(500).json({ error: error.message || "Failed to re-identify card" });
    }
  });
  const USD_TO_GBP = 0.79;
  const EXCHANGE_RATES = {
    GBP: { rate: 0.79, symbol: "\xA3" },
    USD: { rate: 1, symbol: "$" },
    EUR: { rate: 0.92, symbol: "\u20AC" },
    AUD: { rate: 1.55, symbol: "A$" },
    CAD: { rate: 1.38, symbol: "C$" },
    JPY: { rate: 150, symbol: "\xA5" }
  };
  let tcgGroupsCache = null;
  const TCG_CACHE_TTL = 24 * 60 * 60 * 1e3;
  const tcgProductCache = /* @__PURE__ */ new Map();
  async function fetchTCGGroups() {
    if (tcgGroupsCache && Date.now() - tcgGroupsCache.fetchedAt < TCG_CACHE_TTL) {
      return tcgGroupsCache.data;
    }
    try {
      const resp = await fetch("https://tcgcsv.com/tcgplayer/3/groups", { signal: AbortSignal.timeout(1e4) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const raw = await resp.json();
      const data = raw.results || raw;
      tcgGroupsCache = { data, fetchedAt: Date.now() };
      console.log(`[tcgplayer] Cached ${data.length} Pokemon sets`);
      return data;
    } catch (err) {
      console.log(`[tcgplayer] Failed to fetch groups: ${err?.message}`);
      return tcgGroupsCache?.data || [];
    }
  }
  async function fetchTCGSetData(groupId) {
    const cached = tcgProductCache.get(groupId);
    if (cached && Date.now() - cached.fetchedAt < TCG_CACHE_TTL) {
      return { products: cached.products, prices: cached.prices };
    }
    try {
      const [prodResp, priceResp] = await Promise.all([
        fetch(`https://tcgcsv.com/tcgplayer/3/${groupId}/products`, { signal: AbortSignal.timeout(1e4) }),
        fetch(`https://tcgcsv.com/tcgplayer/3/${groupId}/prices`, { signal: AbortSignal.timeout(1e4) })
      ]);
      if (!prodResp.ok || !priceResp.ok) throw new Error(`HTTP products=${prodResp.status} prices=${priceResp.status}`);
      const prodRaw = await prodResp.json();
      const priceRaw = await priceResp.json();
      const products = prodRaw.results || prodRaw;
      const prices = priceRaw.results || priceRaw;
      tcgProductCache.set(groupId, { products, prices, fetchedAt: Date.now() });
      if (tcgProductCache.size > 50) {
        const oldest = [...tcgProductCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
        tcgProductCache.delete(oldest[0]);
      }
      console.log(`[tcgplayer] Cached set ${groupId}: ${products.length} products, ${prices.length} prices`);
      return { products, prices };
    } catch (err) {
      console.log(`[tcgplayer] Failed to fetch set ${groupId}: ${err?.message}`);
      return cached ? { products: cached.products, prices: cached.prices } : { products: [], prices: [] };
    }
  }
  function normalizeForMatch(s) {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  }
  const TCGCSV_SET_ALIASES = {
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
    // Promo sets — exact TCGPlayer names
    "scarlet violet promos": "SV: Scarlet & Violet Promo Cards",
    "scarlet  violet promos": "SV: Scarlet & Violet Promo Cards",
    "sv promos": "SV: Scarlet & Violet Promo Cards",
    "sv promo cards": "SV: Scarlet & Violet Promo Cards",
    "sv black star promos": "SV: Scarlet & Violet Promo Cards",
    "svp black star promos": "SV: Scarlet & Violet Promo Cards",
    "svp promos": "SV: Scarlet & Violet Promo Cards",
    "scarlet  violet promo cards": "SV: Scarlet & Violet Promo Cards",
    "sword shield promos": "SWSH: Sword & Shield Promo Cards",
    "sword  shield promos": "SWSH: Sword & Shield Promo Cards",
    "swsh promos": "SWSH: Sword & Shield Promo Cards",
    "swsh promo cards": "SWSH: Sword & Shield Promo Cards",
    "swsh black star promos": "SWSH: Sword & Shield Promo Cards",
    "swshp promos": "SWSH: Sword & Shield Promo Cards",
    "sun moon promos": "SM Promos",
    "sun  moon promos": "SM Promos",
    "sm promos": "SM Promos",
    "sm black star promos": "SM Promos",
    "smp promos": "SM Promos",
    "xy promos": "XY Promos",
    "xy black star promos": "XY Promos",
    "xyp promos": "XY Promos",
    "black white promos": "Black and White Promos",
    "black  white promos": "Black and White Promos",
    "bw promos": "Black and White Promos",
    "bw black star promos": "Black and White Promos",
    "bwp promos": "Black and White Promos",
    "hgss promos": "HGSS Promos",
    "heartgold soulsilver promos": "HGSS Promos",
    "diamond pearl promos": "Diamond and Pearl Promos",
    "dp promos": "Diamond and Pearl Promos",
    "nintendo promos": "Nintendo Promos",
    "wotc promos": "WoTC Promo",
    "wizards promos": "WoTC Promo",
    "mega evolution promos": "ME: Mega Evolution Promo",
    "me promos": "ME: Mega Evolution Promo",
    // Modern set name aliases
    "151": "SV: Scarlet & Violet 151",
    "scarlet violet 151": "SV: Scarlet & Violet 151",
    "sv 151": "SV: Scarlet & Violet 151",
    "pokemon 151": "SV: Scarlet & Violet 151",
    "crown zenith": "Crown Zenith",
    "crown zenith galarian gallery": "Crown Zenith: Galarian Gallery",
    "hidden fates": "Hidden Fates",
    "hidden fates shiny vault": "Hidden Fates: Shiny Vault",
    "shining fates": "Shining Fates",
    "shining fates shiny vault": "Shining Fates: Shiny Vault",
    "celebrations": "Celebrations",
    "celebrations classic collection": "Celebrations: Classic Collection",
    "pokemon go": "Pokemon GO",
    "champions path": "Champion's Path",
    "paldean fates": "Paldean Fates"
  };
  function findBestGroup(groups, setName) {
    if (!setName) return null;
    const normInput = normalizeForMatch(setName);
    const aliased = TCGCSV_SET_ALIASES[normInput];
    const norm = aliased ? normalizeForMatch(aliased) : normInput;
    let bestMatch = null;
    let bestScore = 0;
    for (const g of groups) {
      const gName = normalizeForMatch(g.name);
      const gNameNoPrefix = gName.replace(/^(me\d*|sv\d*|swsh\d*|sm\d*|xy\d*|bw\d*|dp\d*|hgss\d*|pop\d*|ex\d*)\s*/, "");
      if (gName === norm) {
        return g;
      }
      if (gNameNoPrefix === norm) {
        const lengthDiff = Math.abs(gName.length - norm.length);
        const exactScore = 1e3 - lengthDiff;
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
        if (w.length >= 3 && gWords.some((gw) => gw === w)) matchedWords++;
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
  function findBestProduct(products, cardName, cardNumber) {
    const normName = normalizeForMatch(cardName);
    const fullNumber = cardNumber ? cardNumber.trim() : "";
    const numBefore = fullNumber.includes("/") ? fullNumber.split("/")[0].replace(/^0+/, "") : fullNumber.replace(/^0+/, "");
    const numAfter = fullNumber.includes("/") ? fullNumber.split("/")[1] : "";
    let bestMatch = null;
    let bestScore = 0;
    for (const p of products) {
      let nameScore = 0;
      let numberScore = 0;
      const pName = normalizeForMatch(p.name);
      const pClean = normalizeForMatch(p.cleanName);
      const pNumber = p.extendedData?.find((e) => e.name === "Number")?.value || "";
      const pNumBefore = pNumber.includes("/") ? pNumber.split("/")[0].replace(/^0+/, "") : pNumber.replace(/^0+/, "");
      const pNumAfter = pNumber.includes("/") ? pNumber.split("/")[1] : "";
      if (pName.includes(normName) || pClean.includes(normName)) {
        nameScore = 50;
      } else if (normName.includes("ex") && pClean.includes(normName.replace(/\s*ex$/i, ""))) {
        nameScore = 45;
      } else {
        const nameWords = normName.split(" ");
        let wordMatches = 0;
        for (const w of nameWords) {
          if (w.length >= 3 && (pClean.includes(w) || pName.includes(w))) wordMatches++;
        }
        nameScore = wordMatches / Math.max(nameWords.length, 1) * 35;
      }
      if (numBefore && pNumBefore === numBefore) {
        numberScore += 30;
        if (numAfter && pNumAfter === numAfter) {
          numberScore += 20;
        }
      }
      const score = nameScore + numberScore;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = p;
      }
    }
    if (bestScore >= 35) {
      return bestMatch;
    }
    return null;
  }
  function extractTCGPlayerPrice(card) {
    const prices = card.tcgplayer?.prices || {};
    const priceTypes = ["holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil", "unlimitedHolofoil", "1stEditionNormal", "unlimitedNormal"];
    let bestMarket = 0;
    let bestLow;
    let bestMid;
    let bestHigh;
    for (const pt of priceTypes) {
      const p = prices[pt];
      if (p?.market && p.market > bestMarket) {
        bestMarket = p.market;
        bestLow = p.low || void 0;
        bestMid = p.mid || void 0;
        bestHigh = p.high || void 0;
      }
    }
    if (!bestMarket) return { found: false };
    return {
      found: true,
      productName: card.name,
      setName: card.set?.name || "",
      rarity: card.rarity || "",
      marketPriceUSD: bestMarket,
      lowPriceUSD: bestLow,
      midPriceUSD: bestMid,
      highPriceUSD: bestHigh,
      marketPriceGBP: Math.round(bestMarket * USD_TO_GBP * 100) / 100,
      lowPriceGBP: bestLow ? Math.round(bestLow * USD_TO_GBP * 100) / 100 : void 0,
      midPriceGBP: bestMid ? Math.round(bestMid * USD_TO_GBP * 100) / 100 : void 0,
      tcgplayerUrl: card.tcgplayer?.url || void 0
    };
  }
  function pickBestCardByName(cards, cardName, cardNumber, setName) {
    if (cards.length === 0) return null;
    const normName = normalizeForMatch(cardName);
    const normSet = setName ? normalizeForMatch(setName) : "";
    const fullNum = cardNumber ? cardNumber.trim() : "";
    const numBefore = fullNum.includes("/") ? fullNum.split("/")[0].replace(/^0+/, "") : fullNum.replace(/^0+/, "");
    const numAfter = fullNum.includes("/") ? fullNum.split("/")[1] : "";
    let best = null;
    let bestScore = -1;
    for (const c of cards) {
      const cName = normalizeForMatch(c.name || "");
      const cNum = String(c.number || "").trim();
      const cSetName = normalizeForMatch(c.set?.name || "");
      const cSetTotal = String(c.set?.printedTotal || c.set?.total || "");
      let score = 0;
      if (cName === normName) score += 100;
      else if (cName.includes(normName) || normName.includes(cName)) score += 60;
      else {
        const cWords = cName.split(" ");
        const nWords = normName.split(" ");
        const overlap = nWords.filter((w) => w.length >= 3 && cWords.includes(w)).length;
        score += overlap / Math.max(nWords.length, 1) * 40;
      }
      if (numBefore) {
        const cNumClean = cNum.replace(/^0+/, "");
        if (cNumClean === numBefore) score += 30;
      }
      if (numAfter && cSetTotal === numAfter) score += 20;
      else if (normSet && cSetName.includes(normSet)) score += 20;
      else if (normSet && normSet.includes(cSetName) && cSetName.length > 3) score += 15;
      const hasPrices = c.tcgplayer?.prices && Object.keys(c.tcgplayer.prices).length > 0;
      if (hasPrices) score += 5;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return bestScore >= 30 ? best : null;
  }
  async function lookupTCGPlayerPrice(cardName, setName, cardNumber) {
    try {
      const numberOnly = cardNumber ? cardNumber.split("/")[0].replace(/^0+/, "") : "";
      const baseName = stripSuffix(cardName);
      if (numberOnly) {
        console.log(`[tcgplayer] Step 1: Searching by name "${cardName}" + number ${numberOnly}`);
        const preciseResults = await queryPokemonTcgApi(`name:"${cardName}" number:${numberOnly}`, true);
        if (preciseResults.length > 0) {
          const match = pickBestCardByName(preciseResults, cardName, cardNumber, setName);
          if (match) {
            const result2 = extractTCGPlayerPrice(match);
            if (result2.found) {
              console.log(`[tcgplayer] Found by name+number: "${match.name}" #${match.number} (${match.set?.name}) | Market: $${result2.marketPriceUSD} (\xA3${result2.marketPriceGBP})`);
              return result2;
            }
          }
        }
        if (baseName !== cardName) {
          console.log(`[tcgplayer] Step 1b: Trying base name "${baseName}" + number ${numberOnly}`);
          const baseResults = await queryPokemonTcgApi(`name:"${baseName}*" number:${numberOnly}`, true);
          if (baseResults.length > 0) {
            const match = pickBestCardByName(baseResults, cardName, cardNumber, setName);
            if (match) {
              const result2 = extractTCGPlayerPrice(match);
              if (result2.found) {
                console.log(`[tcgplayer] Found by base name+number: "${match.name}" #${match.number} (${match.set?.name}) | Market: $${result2.marketPriceUSD} (\xA3${result2.marketPriceGBP})`);
                return result2;
              }
            }
          }
        }
      }
      console.log(`[tcgplayer] Step 2: Searching by name only "${cardName}"`);
      const nameResults = await queryPokemonTcgApi(`name:"${cardName}"`, true);
      if (nameResults.length > 0) {
        const match = pickBestCardByName(nameResults, cardName, cardNumber, setName);
        if (match) {
          const result2 = extractTCGPlayerPrice(match);
          if (result2.found) {
            console.log(`[tcgplayer] Found by name: "${match.name}" #${match.number} (${match.set?.name}) | Market: $${result2.marketPriceUSD} (\xA3${result2.marketPriceGBP})`);
            return result2;
          }
        }
      }
      if (numberOnly && setName) {
        console.log(`[tcgplayer] Step 3: Searching by number ${numberOnly} + set "${setName}"`);
        const setResults = await queryPokemonTcgApi(`number:${numberOnly} set.name:"${setName}*"`, true);
        if (setResults.length > 0) {
          const match = pickBestCardByName(setResults, cardName, cardNumber, setName);
          if (match) {
            const result2 = extractTCGPlayerPrice(match);
            if (result2.found) {
              console.log(`[tcgplayer] Found by number+set: "${match.name}" #${match.number} (${match.set?.name}) | Market: $${result2.marketPriceUSD} (\xA3${result2.marketPriceGBP})`);
              return result2;
            }
          }
        }
      }
      console.log(`[tcgplayer] Step 4: Falling back to TCGCSV set-based lookup`);
      const groups = await fetchTCGGroups();
      if (groups.length === 0) return { found: false };
      const matchedGroup = findBestGroup(groups, setName);
      if (!matchedGroup) {
        console.log(`[tcgplayer] No matching set for "${setName}" in TCGCSV`);
        return { found: false };
      }
      console.log(`[tcgplayer] TCGCSV matched set "${setName}" -> "${matchedGroup.name}" (groupId=${matchedGroup.groupId})`);
      const { products, prices } = await fetchTCGSetData(matchedGroup.groupId);
      if (products.length === 0) return { found: false };
      const matchedProduct = findBestProduct(products, cardName, cardNumber);
      if (!matchedProduct) {
        console.log(`[tcgplayer] No matching card for "${cardName}" #${cardNumber} in ${matchedGroup.name}`);
        return { found: false };
      }
      const matchedNum = matchedProduct.extendedData?.find((e) => e.name === "Number")?.value || "";
      console.log(`[tcgplayer] TCGCSV matched: "${matchedProduct.name}" #${matchedNum}`);
      const rarity = matchedProduct.extendedData?.find((e) => e.name === "Rarity")?.value || "";
      const cardPrices = prices.filter((p) => p.productId === matchedProduct.productId);
      const bestPrice = cardPrices.sort((a, b) => (b.marketPrice || 0) - (a.marketPrice || 0))[0];
      if (!bestPrice || !bestPrice.marketPrice) {
        console.log(`[tcgplayer] Found card but no price data for "${matchedProduct.name}"`);
        return { found: false };
      }
      const result = {
        found: true,
        productName: matchedProduct.name,
        setName: matchedGroup.name,
        rarity,
        marketPriceUSD: bestPrice.marketPrice,
        lowPriceUSD: bestPrice.lowPrice || void 0,
        midPriceUSD: bestPrice.midPrice || void 0,
        highPriceUSD: bestPrice.highPrice || void 0,
        marketPriceGBP: Math.round(bestPrice.marketPrice * USD_TO_GBP * 100) / 100,
        lowPriceGBP: bestPrice.lowPrice ? Math.round(bestPrice.lowPrice * USD_TO_GBP * 100) / 100 : void 0,
        midPriceGBP: bestPrice.midPrice ? Math.round(bestPrice.midPrice * USD_TO_GBP * 100) / 100 : void 0
      };
      console.log(`[tcgplayer] TCGCSV found: "${matchedProduct.name}" | Market: $${bestPrice.marketPrice} (\xA3${result.marketPriceGBP})`);
      return result;
    } catch (err) {
      console.log(`[tcgplayer] Lookup error: ${err?.message}`);
      return { found: false };
    }
  }
  app2.post("/api/card-value", async (req, res) => {
    try {
      const { cardName, setName, setNumber, psaGrade, bgsGrade, aceGrade, tagGrade, cgcGrade, currency = "GBP" } = req.body;
      console.log("[card-value] Request received:", { cardName, setName, setNumber, psaGrade, bgsGrade, aceGrade, tagGrade, cgcGrade, currency });
      if (!cardName) {
        return res.status(400).json({ error: "Card name is required" });
      }
      let correctedSetName = setName || "";
      if (setNumber && correctedSetName) {
        await ensureSetsCached();
        const crossChecked = crossCheckSetByCardNumber(correctedSetName, setNumber, "[card-value]");
        if (crossChecked !== correctedSetName) {
          console.log(`[card-value] Set corrected: "${correctedSetName}" \u2192 "${crossChecked}"`);
          correctedSetName = crossChecked;
        }
      }
      const tcgResult = await lookupTCGPlayerPrice(cardName, correctedSetName, setNumber);
      const allKeys = ["psaValue", "psa10Value", "bgsValue", "bgs10Value", "aceValue", "ace10Value", "tagValue", "tag10Value", "cgcValue", "cgc10Value", "rawValue"];
      const cx = EXCHANGE_RATES[currency] || EXCHANGE_RATES.GBP;
      const convertUSD = (usd) => Math.round(usd * cx.rate * 100) / 100;
      const marketConverted = tcgResult.marketPriceUSD ? convertUSD(tcgResult.marketPriceUSD) : void 0;
      const lowConverted = tcgResult.lowPriceUSD ? convertUSD(tcgResult.lowPriceUSD) : void 0;
      const midConverted = tcgResult.midPriceUSD ? convertUSD(tcgResult.midPriceUSD) : void 0;
      const tcgContext = tcgResult.found ? `REAL TCGPlayer Market Data (verified, daily-updated):
- Card: ${tcgResult.productName}
- Set: ${tcgResult.setName}
- Rarity: ${tcgResult.rarity}
- TCGPlayer Market Price: $${tcgResult.marketPriceUSD} USD (${cx.symbol}${marketConverted} ${currency})
${tcgResult.lowPriceUSD ? `- TCGPlayer Low: $${tcgResult.lowPriceUSD} USD (${cx.symbol}${lowConverted} ${currency})` : ""}
${tcgResult.midPriceUSD ? `- TCGPlayer Mid: $${tcgResult.midPriceUSD} USD (${cx.symbol}${midConverted} ${currency})` : ""}

This is the UNGRADED raw card price from TCGPlayer. Use it as your primary baseline.` : "";
      console.log(`[card-value] TCGPlayer data: ${tcgResult.found ? `Found - $${tcgResult.marketPriceUSD} / ${cx.symbol}${marketConverted} ${currency}` : "Not found"}`);
      const cheapThreshold = currency === "JPY" ? "\xA5750" : `${cx.symbol}5`;
      const expThreshold = currency === "JPY" ? "\xA515000" : `${cx.symbol}100`;
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `You are an expert Pokemon TCG market price analyst. Your job is to estimate graded card values in ${currency}.

${tcgResult.found ? `You have been given REAL TCGPlayer market data for the raw/ungraded card price. This is AUTHORITATIVE \u2014 base ALL your estimates on this verified price.

The TCGPlayer market price is the UNGRADED Near Mint value. Use it to calculate graded premiums:
- Raw/ungraded value = TCGPlayer market price converted to ${currency} (already provided)
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

For very cheap cards (raw < ${cheapThreshold}): grading premiums are minimal.
For expensive cards (raw > ${expThreshold}): premiums scale significantly, especially for grade 10s.` : `TCGPlayer data was not available. Use your expert knowledge of Pokemon TCG market prices (2024-2025) to estimate.`}

RULES:
1. All prices in ${currency} using the "${cx.symbol}" symbol. Format: "${cx.symbol}XX.XX" or "${cx.symbol}XX - ${cx.symbol}XX" for ranges.${currency === "JPY" ? " For JPY, use whole numbers (no decimals)." : ""}
2. Use TIGHT price ranges based on the TCGPlayer data.
3. NEVER say "No value data found" \u2014 every card has value.
4. Raw value should closely reflect the TCGPlayer market price when available.

Respond ONLY with valid JSON:
{
  "psaValue": "${cx.symbol}XX - ${cx.symbol}XX",
  "bgsValue": "${cx.symbol}XX - ${cx.symbol}XX",
  "aceValue": "${cx.symbol}XX - ${cx.symbol}XX",
  "tagValue": "${cx.symbol}XX - ${cx.symbol}XX",
  "cgcValue": "${cx.symbol}XX - ${cx.symbol}XX",
  "rawValue": "${cx.symbol}XX - ${cx.symbol}XX",
  "psa10Value": "${cx.symbol}XX - ${cx.symbol}XX",
  "bgs10Value": "${cx.symbol}XX - ${cx.symbol}XX",
  "ace10Value": "${cx.symbol}XX - ${cx.symbol}XX",
  "tag10Value": "${cx.symbol}XX - ${cx.symbol}XX",
  "cgc10Value": "${cx.symbol}XX - ${cx.symbol}XX",
  "source": "${tcgResult.found ? "Based on TCGPlayer market data" : "Estimated from market data"}"
}`,
        messages: [
          {
            role: "user",
            content: `Card: ${cardName}
Set: ${setName || "Unknown"}
Card Number: ${setNumber || "Unknown"}
Grades: PSA ${psaGrade}, BGS ${bgsGrade}, Ace ${aceGrade}, TAG ${tagGrade}, CGC ${cgcGrade}

${tcgContext || "No external price data available. Estimate using your expert knowledge of current Pokemon TCG values."}`
          }
        ]
      });
      const content = response.content[0]?.text || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiData = JSON.parse(jsonMatch[0]);
        aiData.source = tcgResult.found ? "Based on TCGPlayer market data" : "Estimated from market data";
        if (tcgResult.found) {
          aiData.tcgplayerMarketPrice = `${cx.symbol}${marketConverted}`;
          aiData.tcgplayerMarketPriceUSD = `$${tcgResult.marketPriceUSD}`;
        }
        console.log("[card-value] Success, returning:", aiData);
        res.json(aiData);
      } else {
        console.log("[card-value] No JSON in AI response:", content);
        const fallback = {};
        for (const k of allKeys) fallback[k] = "No value data found";
        fallback.source = "Unable to estimate";
        res.json(fallback);
      }
    } catch (error) {
      console.error("[card-value] Error:", error?.message || error);
      res.json({
        psaValue: "No value data found",
        bgsValue: "No value data found",
        aceValue: "No value data found",
        tagValue: "No value data found",
        cgcValue: "No value data found",
        rawValue: "No value data found",
        psa10Value: "No value data found",
        bgs10Value: "No value data found",
        ace10Value: "No value data found",
        tag10Value: "No value data found",
        cgc10Value: "No value data found",
        source: "Error fetching values"
      });
    }
  });
  app2.post("/api/crop-to-card", async (req, res) => {
    try {
      const { image, padding = 20 } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }
      let uri = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
      const initialBounds = await detectCardBounds(uri);
      const angle = initialBounds.angleDeg ?? 0;
      if (Math.abs(angle) > 0.15) {
        try {
          const rotBase64 = uri.replace(/^data:image\/\w+;base64,/, "");
          const rotBuffer = Buffer.from(rotBase64, "base64");
          const straightened = await sharp(rotBuffer).rotate(-angle, { background: { r: 0, g: 0, b: 0, alpha: 1 } }).jpeg({ quality: 90 }).toBuffer();
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
      let cardLeft = bounds.leftPercent / 100 * imgW;
      let cardRight = bounds.rightPercent / 100 * imgW;
      let cardTop = bounds.topPercent / 100 * imgH;
      let cardBottom = bounds.bottomPercent / 100 * imgH;
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
      const cardAreaRatio = cardW * cardH / (imgW * imgH);
      if (cardAreaRatio > 0.7) {
        console.log(`[crop-to-card] Card already fills ${(cardAreaRatio * 100).toFixed(0)}% of image, skipping crop`);
        return res.json({ croppedImage: uri, wasCropped: false, bounds });
      }
      const cropped = await sharp(buffer).extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH }).jpeg({ quality: 90 }).toBuffer();
      const croppedBase64 = `data:image/jpeg;base64,${cropped.toString("base64")}`;
      const newBounds = await detectCardBounds(croppedBase64);
      console.log(`[crop-to-card] Cropped ${imgW}x${imgH} -> ${cropW}x${cropH} (card was ${(cardAreaRatio * 100).toFixed(0)}% of image)`);
      res.json({ croppedImage: croppedBase64, wasCropped: true, bounds: newBounds });
    } catch (error) {
      console.error("Error cropping to card:", error);
      res.status(500).json({ error: error.message || "Failed to crop to card" });
    }
  });
  app2.post("/api/detect-bounds", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }
      const uri = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
      const bounds = await detectCardBounds(uri);
      console.log(`[detect-bounds] Result: L=${bounds.leftPercent.toFixed(1)} T=${bounds.topPercent.toFixed(1)} R=${bounds.rightPercent.toFixed(1)} B=${bounds.bottomPercent.toFixed(1)} angle=${bounds.angleDeg ?? 0} confidence=${bounds.confidence ?? 0}`);
      res.json(bounds);
    } catch (error) {
      console.error("Error detecting bounds:", error);
      res.status(500).json({ error: error.message || "Failed to detect bounds" });
    }
  });
  app2.post("/api/detect-angle", async (req, res) => {
    try {
      const { image, bounds } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }
      const uri = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
      const angle = await detectCardAngle(uri, bounds);
      console.log(`[detect-angle] Detected angle: ${angle} degrees`);
      res.json({ angle });
    } catch (error) {
      console.error("Error detecting angle:", error);
      res.status(500).json({ error: error.message || "Failed to detect angle" });
    }
  });
  async function detectSlabCardBoundsWithAI(imageUrl) {
    const CARD_RATIO = 2.5 / 3.5;
    const RATIO_TOLERANCE = 0.15;
    try {
      const aiPrompt = `You are analyzing an image of a graded Pokemon card slab. Your ONLY task is to find the exact outer boundary of the POKEMON CARD'S PRINTED SURFACE visible through the transparent plastic window.

CRITICAL RULES:
- Find the card's PRINTED BORDER \u2014 the colored/white border that is part of the card's print, NOT the plastic slab case outer edges
- A standard Pokemon card is 63mm \xD7 88mm (width-to-height ratio = 0.714)
- DO NOT mark the outer slab case boundary
- DO NOT include the grading company label panel at the top of the slab \u2014 the label is above the card window
- The card face typically occupies the lower 75-85% of the slab's visible area; the label panel occupies the upper portion
- Look for the card's printed white or colored border \u2014 this is the inner rectangle inside the slab window
- The card corners are typically rounded or squared within the slab window

Return ONLY this JSON (no markdown, no explanation):
{
  "leftPercent": <0-100, position of card's left printed edge as % of full image width>,
  "topPercent": <0-100, position of card's top printed edge as % of full image height>,
  "rightPercent": <0-100, position of card's right printed edge as % of full image width>,
  "bottomPercent": <0-100, position of card's bottom printed edge as % of full image height>,
  "confidence": <0.0-1.0, your confidence in this measurement>
}

Verify: (rightPercent - leftPercent) / (bottomPercent - topPercent) should be close to 0.714. If not, re-examine \u2014 you may have marked the slab border instead of the card border.`;
      const aiResp = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{ role: "user", content: [
          { type: "text", text: aiPrompt },
          toClaudeImage(imageUrl)
        ] }]
      });
      const raw = aiResp.content[0]?.text || "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      const { leftPercent, topPercent, rightPercent, bottomPercent, confidence } = parsed;
      if (typeof leftPercent !== "number" || typeof topPercent !== "number" || typeof rightPercent !== "number" || typeof bottomPercent !== "number") return null;
      if (leftPercent < 0 || topPercent < 0 || rightPercent > 100 || bottomPercent > 100) {
        console.log(`[slab-ai-bounds] Rejected \u2014 coords out of range: L=${leftPercent} T=${topPercent} R=${rightPercent} B=${bottomPercent}`);
        return null;
      }
      if (leftPercent >= rightPercent || topPercent >= bottomPercent) {
        console.log(`[slab-ai-bounds] Rejected \u2014 invalid ordering: L=${leftPercent} R=${rightPercent} T=${topPercent} B=${bottomPercent}`);
        return null;
      }
      const w = rightPercent - leftPercent;
      const h = bottomPercent - topPercent;
      if (w < 5 || h < 5) return null;
      const ratio = w / h;
      const ratioError = Math.abs(ratio - CARD_RATIO) / CARD_RATIO;
      if (ratioError > RATIO_TOLERANCE) {
        console.log(`[slab-ai-bounds] Rejected AI result \u2014 ratio ${ratio.toFixed(3)} vs expected ${CARD_RATIO.toFixed(3)} (error ${(ratioError * 100).toFixed(1)}%)`);
        return null;
      }
      console.log(`[slab-ai-bounds] AI bounds: L=${leftPercent.toFixed(1)} T=${topPercent.toFixed(1)} R=${rightPercent.toFixed(1)} B=${bottomPercent.toFixed(1)} conf=${confidence?.toFixed(2)} ratio=${ratio.toFixed(3)}`);
      return { leftPercent, topPercent, rightPercent, bottomPercent, confidence: confidence ?? 0.8 };
    } catch (err) {
      console.warn("[slab-ai-bounds] AI detection failed:", err?.message);
      return null;
    }
  }
  async function performCrossoverGrading(slabImage, logPrefix = "[crossover-grade]", slabBackImage) {
    const gradeStartTime = Date.now();
    const rawSlabUrl = slabImage.startsWith("data:") ? slabImage : `data:image/jpeg;base64,${slabImage}`;
    const slabUrl = await optimizeImageForAI(rawSlabUrl, 2048);
    const slabBackUrl = slabBackImage ? await optimizeImageForAI(slabBackImage.startsWith("data:") ? slabBackImage : `data:image/jpeg;base64,${slabBackImage}`, 2048) : null;
    console.log(`${logPrefix} Optimized slab image(s) in ${Date.now() - gradeStartTime}ms`);
    const setRef = getCurrentSetReference();
    const prompt = `You are an expert Pokemon card crossover grader. You are looking at a Pokemon card currently in a graded slab.

FIRST: Read the slab label in the image to identify the grading company and the grade assigned. This is essential \u2014 do not skip this step.

Your task is to visually analyse the card inside the slab and estimate what grade it would receive from PSA, BGS (Beckett), ACE, TAG, and CGC.

VISUAL ANALYSIS \u2014 examine everything visible through the plastic case:
- CENTERING: You MUST measure the card's border ratios \u2014 do not guess or default to 50. Look at the card borders visible inside the slab. Compare the left border width to the right border width, and the top border to the bottom border, on both the front and back. Report the larger side as a percentage (e.g., if the left border appears slightly wider than the right, report frontLeftRight = 53 meaning 53/47). Only report 50 if the borders look TRULY IDENTICAL \u2014 a card that looks "well centered" is typically 52-56, not 50. PSA is lenient on back centering (up to 75/25 still grades PSA 10 on back), but strict on front (must be 55/45 or better for PSA 10 since 2025).
- CORNERS: Look for whitening, fraying, or damage at all four corners. Corner whitening through the case is a key differentiator \u2014 ACE and TAG penalise even minor corner wear more than PSA.
- EDGES: Look for nicks, chips, or wear along all four edges. Any chipping is a significant deduction at all companies.
- SURFACE: Look for scratches, print lines, stains, haze, or loss of gloss on both front and back. CGC is the strictest on surface scratches \u2014 even faint scratches that PSA ignores can cost a grade at CGC. TAG also grades surface very strictly.

COMPANY-SPECIFIC STANDARDS (apply these precisely):
- PSA (grades 1-10, whole numbers): Lenient on back centering, moderate on corners, strict on front centering. PSA 9 tolerates minor imperfections. PSA 10 requires near-perfect centering (60/40 or better front, 75/25 or better back), sharp corners, clean edges, and glossy surface.
- BGS/Beckett (sub-grades in 0.5 increments, 1-10; overall = lowest sub-grade or slightly above): Each sub-grade (centering, corners, edges, surface) graded independently. BGS Pristine 10 requires all four sub-grades at 10. BGS Gem Mint 9.5 is achievable with one 9 sub-grade. A BGS 9 overall typically means one or two sub-grades at 8.5. BGS is stricter than PSA across all attributes.
- ACE (grades 1-10, whole numbers): UK-based. Stricter than PSA on corner whitening \u2014 even minor corner wear that PSA overlooks can drop ACE from 10 to 9. Similar centering tolerance to PSA on front, but more strict on back centering than PSA.
- TAG (grades 1-10, halves possible): Premium ultra-strict grader. Extremely strict on surface scratches and centering. TAG 10 requires essentially perfect cards. TAG 9 is common where PSA/ACE would give 10. Surface scratches visible under the case will cost at least half a grade.
- CGC (grades 1-10, halves possible): Stricter on surface scratches than PSA. CGC uses a different label system but similar 1-10 scale. Surface micro-scratches that PSA ignores will typically cost CGC a grade. Centering standards similar to PSA.

CROSSOVER PATTERNS TO CONSIDER:
- PSA 10 \u2192 BGS: Often BGS 9-9.5 (Beckett is stricter). Only becomes BGS Pristine 10 if all four attributes are visually flawless.
- PSA 9 \u2192 BGS: Often BGS 8.5-9, rarely BGS 9.5.
- BGS 9.5 \u2192 PSA: Often PSA 10 if centering and surface are clean.
- ACE 10 \u2192 PSA: Often PSA 9-10. ACE 10s with clean surfaces usually crossover PSA 10.
- TAG 9 \u2192 PSA: Often PSA 10, as TAG grades more strictly.

For each company, explicitly state WHICH specific attribute (centering, corners, edges, or surface) would differ from the current slab's grade, and why. Do not just repeat the same notes for every company.

${setRef}

IDENTIFICATION: Read the card name, set, and number from the slab label or from the card visible through the case.

RESPONSE FORMAT (JSON only, no markdown):
{
  "cardName": "Card name",
  "setName": "Set name",
  "setNumber": "Set number or null",
  "overallCondition": "Brief visual condition summary of what is visible through the slab",
  "currentGrade": {
    "company": "Company name read from slab label (PSA/BGS/CGC/ACE/TAG/OTHER)",
    "grade": "Grade read from slab label (e.g. 10, 9.5, 9)",
    "certNumber": null
  },
  "isCrossover": true,
  "centering": {
    "frontLeftRight": 53,
    "frontTopBottom": 52,
    "backLeftRight": 57,
    "backTopBottom": 54
  },
  "psa": {
    "grade": 9,
    "centeringGrade": 9,
    "centering": "Specific centering observation and how it compares to the current slab grade",
    "corners": "Specific corner observation",
    "edges": "Specific edge observation",
    "surface": "Specific surface observation",
    "notes": "Overall PSA crossover assessment \u2014 which attribute(s) drive any grade difference"
  },
  "beckett": {
    "overallGrade": 9,
    "centering": { "grade": 9, "notes": "Centering sub-grade reasoning" },
    "corners": { "grade": 9, "notes": "Corner sub-grade reasoning" },
    "edges": { "grade": 9, "notes": "Edge sub-grade reasoning" },
    "surface": { "grade": 9, "notes": "Surface sub-grade reasoning" },
    "notes": "Overall BGS assessment \u2014 note which sub-grade limits the overall"
  },
  "ace": {
    "overallGrade": 9,
    "centering": { "grade": 9, "notes": "ACE centering assessment" },
    "corners": { "grade": 9, "notes": "ACE corner assessment \u2014 note if their stricter standard changes the grade" },
    "edges": { "grade": 9, "notes": "ACE edge assessment" },
    "surface": { "grade": 9, "notes": "ACE surface assessment" },
    "notes": "Overall ACE crossover assessment"
  },
  "tag": {
    "overallGrade": 9,
    "centering": { "grade": 9, "notes": "TAG centering \u2014 note if TAG's stricter standard changes the assessment" },
    "corners": { "grade": 9, "notes": "TAG corner assessment" },
    "edges": { "grade": 9, "notes": "TAG edge assessment" },
    "surface": { "grade": 9, "notes": "TAG surface \u2014 note if surface scratches visible that TAG would penalise" },
    "notes": "Overall TAG crossover assessment"
  },
  "cgc": {
    "grade": 9,
    "centering": "CGC centering assessment",
    "corners": "CGC corner assessment",
    "edges": "CGC edge assessment",
    "surface": "CGC surface assessment \u2014 note if surface scratches CGC would penalise more than the current slab grade",
    "notes": "Overall CGC crossover assessment"
  }
}`;
    const contentParts = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: slabUrl, detail: "high" } }
    ];
    if (slabBackUrl) {
      contentParts.push({ type: "image_url", image_url: { url: slabBackUrl, detail: "high" } });
    }
    const [response, detectedFront, detectedBack, aiFront, aiBack] = await Promise.all([
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2e3,
        messages: [
          {
            role: "user",
            content: convertToClaudeContent(contentParts)
          }
        ]
      }),
      detectCardBounds(slabUrl, true),
      slabBackUrl ? detectCardBounds(slabBackUrl, true) : Promise.resolve(null),
      detectSlabCardBoundsWithAI(slabUrl),
      slabBackUrl ? detectSlabCardBoundsWithAI(slabBackUrl) : Promise.resolve(null)
    ]);
    const rawContent = response.content[0]?.text || "";
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in crossover response");
    const result = JSON.parse(jsonMatch[0]);
    if (!result.psa?.grade) throw new Error("Invalid crossover result structure");
    const resolvedSetName = resolveSetName(result.setNumber || "", result.setName || "");
    result.setName = resolvedSetName;
    const frontBoundsToUse = aiFront ?? detectedFront;
    console.log(`${logPrefix} Front bounds source: ${aiFront ? "AI" : "Sobel"}`);
    result.frontCardBounds = enforceCardBounds(frontBoundsToUse);
    if (detectedBack || aiBack) {
      const backBoundsToUse = aiBack ?? detectedBack;
      console.log(`${logPrefix} Back bounds source: ${aiBack ? "AI" : "Sobel"}`);
      result.backCardBounds = enforceCardBounds(backBoundsToUse);
    }
    console.log(`${logPrefix} Crossover complete in ${Date.now() - gradeStartTime}ms`);
    return result;
  }
  app2.post("/api/crossover-grade-job", async (req, res) => {
    try {
      const { slabImage, slabBackImage, pushToken } = req.body;
      if (!slabImage) {
        return res.status(400).json({ error: "slabImage is required" });
      }
      const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
      console.log(`[crossover-grade-job] Creating job ${jobId}`);
      const job = {
        id: jobId,
        status: "processing",
        type: "single",
        pushToken,
        createdAt: Date.now()
      };
      gradingJobs.set(jobId, job);
      res.json({ jobId });
      (async () => {
        try {
          const result = await performCrossoverGrading(slabImage, `[crossover-grade-job:${jobId}]`, slabBackImage);
          job.status = "completed";
          job.result = result;
          if (job.pushToken) {
            const resultName = result.cardName || "your card";
            sendPushNotification(job.pushToken, "Crossover Complete", `${resultName} crossover analysis done!`);
          }
        } catch (err) {
          console.error(`[crossover-grade-job] Job ${jobId} failed:`, err.message);
          job.status = "failed";
          job.error = err.message || "Unknown error";
          if (job.pushToken) {
            sendPushNotification(job.pushToken, "Crossover Failed", "There was an error analyzing your slab. Please try again.");
          }
        }
      })();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/grade-job", async (req, res) => {
    try {
      const { frontImage, backImage, pushToken } = req.body;
      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back images required" });
      }
      const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
      console.log(`[grade-job] Creating job ${jobId}, pushToken: ${pushToken ? pushToken.substring(0, 20) + "..." : "none"}`);
      const job = {
        id: jobId,
        status: "processing",
        type: "single",
        pushToken,
        createdAt: Date.now()
      };
      gradingJobs.set(jobId, job);
      res.json({ jobId });
      (async () => {
        try {
          const result = await performGrading(frontImage, backImage, `[grade-job:${jobId}]`);
          job.status = "completed";
          job.result = result;
          if (job.pushToken) {
            const resultName = result.cardName || "your card";
            sendPushNotification(job.pushToken, "Grading Complete", `${resultName} has been graded!`);
          }
        } catch (err) {
          console.error(`[grade-job] Job ${jobId} failed:`, err.message);
          job.status = "failed";
          job.error = err.message || "Unknown error";
          if (job.pushToken) {
            sendPushNotification(job.pushToken, "Grading Failed", "There was an error grading your card. Please try again.");
          }
        }
      })();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/bulk-grade-job", async (req, res) => {
    try {
      const { cards, pushToken } = req.body;
      if (!cards || !Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: "At least one card required" });
      }
      const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
      console.log(`[bulk-grade-job] Creating job ${jobId} for ${cards.length} cards, pushToken: ${pushToken ? pushToken.substring(0, 20) + "..." : "none"}`);
      const job = {
        id: jobId,
        status: "processing",
        type: "bulk",
        totalCards: cards.length,
        completedCards: 0,
        results: [],
        pushToken,
        createdAt: Date.now()
      };
      gradingJobs.set(jobId, job);
      res.json({ jobId, totalCards: cards.length });
      (async () => {
        try {
          const BATCH_SIZE = 3;
          const results = [];
          for (let i = 0; i < cards.length; i += BATCH_SIZE) {
            const batch = cards.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(
              batch.map(async (card, idx) => {
                return await performGrading(card.frontImage, card.backImage, `[bulk-grade:${jobId}:${i + idx}]`);
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
          const successCount = results.filter((r) => r.status === "completed").length;
          console.log(`[bulk-grade-job] Job ${jobId} completed: ${successCount}/${cards.length} succeeded`);
          if (job.pushToken) {
            sendPushNotification(
              job.pushToken,
              "Bulk Grading Complete",
              `${successCount} of ${cards.length} cards graded successfully!`
            );
          }
        } catch (err) {
          console.error(`[bulk-grade-job] Job ${jobId} failed:`, err.message);
          job.status = "failed";
          job.error = err.message || "Unknown error";
          if (job.pushToken) {
            sendPushNotification(job.pushToken, "Bulk Grading Failed", "There was an error with your bulk grading. Please try again.");
          }
        }
      })();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/deep-grade-job", async (req, res) => {
    try {
      const { frontImage, backImage, angledImage, angledBackImage, frontCorners, backCorners, pushToken } = req.body;
      if (!frontImage || !backImage || !angledImage) {
        return res.status(400).json({ error: "Front, back, and angled images are all required" });
      }
      const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
      console.log(`[deep-grade-job] Creating job ${jobId}, pushToken: ${pushToken ? pushToken.substring(0, 20) + "..." : "none"}, frontCorners: ${frontCorners?.length || 0}, backCorners: ${backCorners?.length || 0}`);
      const job = {
        id: jobId,
        status: "processing",
        type: "deep",
        pushToken,
        createdAt: Date.now()
      };
      gradingJobs.set(jobId, job);
      res.json({ jobId });
      (async () => {
        try {
          const result = await performDeepGrading(frontImage, backImage, angledImage, angledBackImage || void 0, void 0, `[deep-grade-job:${jobId}]`, frontCorners, backCorners);
          job.status = "completed";
          job.result = result;
          if (job.pushToken) {
            const resultName = result.cardName || "your card";
            sendPushNotification(job.pushToken, "Deep Grading Complete", `${resultName} has been deep graded!`);
          }
        } catch (err) {
          console.error(`[deep-grade-job] Job ${jobId} failed:`, err.message);
          job.status = "failed";
          job.error = err.message || "Unknown error";
          if (job.pushToken) {
            sendPushNotification(job.pushToken, "Deep Grading Failed", "There was an error deep grading your card. Please try again.");
          }
        }
      })();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  function respondWithJob(res, job) {
    if (job.type === "single" || job.type === "deep") {
      res.json({
        id: job.id,
        status: job.status,
        type: job.type,
        result: job.status === "completed" ? job.result : void 0,
        error: job.status === "failed" ? job.error : void 0
      });
    } else {
      res.json({
        id: job.id,
        status: job.status,
        type: job.type,
        totalCards: job.totalCards,
        completedCards: job.completedCards,
        results: job.status === "completed" ? job.results : void 0,
        error: job.status === "failed" ? job.error : void 0
      });
    }
  }
  app2.get("/api/grade-job/:id", (req, res) => {
    const job = gradingJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    respondWithJob(res, job);
  });
  app2.get("/api/crossover-grade-job/:id", (req, res) => {
    const job = gradingJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    respondWithJob(res, job);
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      limit: "50mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false, limit: "50mb" }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  const privacyPolicyPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "privacy-policy.html"
  );
  const privacyPolicyHtml = fs.readFileSync(privacyPolicyPath, "utf-8");
  app2.get("/privacy", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(privacyPolicyHtml);
  });
  app2.get("/privacy-policy", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(privacyPolicyHtml);
  });
  const termsPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "terms.html"
  );
  const termsHtml = fs.readFileSync(termsPath, "utf-8");
  app2.get("/terms", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(termsHtml);
  });
  app2.get("/terms-of-use", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(termsHtml);
  });
  app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app2.use("/subscription-images", express.static(path.resolve(process.cwd(), "public", "subscription-images")));
  app2.use(express.static(path.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
