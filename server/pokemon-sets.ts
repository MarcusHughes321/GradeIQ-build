export interface PokemonSet {
  code: string;
  name: string;
  era: string;
  region: "english" | "japanese" | "korean" | "chinese_simplified" | "chinese_traditional";
  year?: number;
  symbol?: string;
}

export const ENGLISH_SETS: Record<string, string> = {
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
  "WP": "Wizards Promos",
};

export const JAPANESE_SETS: Record<string, string> = {
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
  "BW-P": "Black & White Promo Cards",
};

export const KOREAN_SETS: Record<string, string> = {
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
  "SM1S": "Collection Sun",
};

export const CHINESE_SETS: Record<string, string> = {
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
  "AC2b": "Dreams Come True Collection B",
};

export const ENGLISH_SET_SYMBOLS: Record<string, string> = {
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
  "Red / journey together emblem": "Journey Together",
};

export function getSetNameBySymbol(symbolDescription: string): string | null {
  if (!symbolDescription) return null;
  const desc = symbolDescription.toLowerCase().trim();
  for (const [key, name] of Object.entries(ENGLISH_SET_SYMBOLS)) {
    if (key.toLowerCase().includes(desc) || desc.includes(key.toLowerCase())) {
      return name;
    }
  }
  return null;
}

export function generateSymbolReferenceForPrompt(): string {
  const lines: string[] = ["=== ENGLISH SET SYMBOLS (use when set code is not printed or not readable) ==="];
  let currentEra = "";
  for (const [symbol, setName] of Object.entries(ENGLISH_SET_SYMBOLS)) {
    if (symbol.startsWith("//")) continue;
    lines.push(`  "${symbol}" = ${setName}`);
  }
  return lines.join("\n");
}

export function getEnglishSetName(code: string): string | null {
  if (!code) return null;
  const cleaned = code.trim();
  return ENGLISH_SETS[cleaned] || null;
}

export function getJapaneseSetName(code: string): string | null {
  if (!code) return null;
  const cleaned = code.trim();
  return JAPANESE_SETS[cleaned] || null;
}

export function getAnySetName(code: string): string | null {
  if (!code) return null;
  const cleaned = code.trim();
  return ENGLISH_SETS[cleaned]
    || JAPANESE_SETS[cleaned]
    || KOREAN_SETS[cleaned]
    || CHINESE_SETS[cleaned]
    || null;
}

export function generateSetReferenceForPrompt(): string {
  const sections: string[] = [];

  sections.push("=== ENGLISH SET CODES ===");
  const englishByEra: Record<string, string[]> = {};
  let currentEra = "";
  for (const [code, name] of Object.entries(ENGLISH_SETS)) {
    if (code.includes("_")) continue;
    const entry = `${code} = ${name}`;
    if (!englishByEra[currentEra]) englishByEra[currentEra] = [];
    englishByEra[currentEra].push(entry);
  }
  sections.push(Object.values(ENGLISH_SETS)
    .length > 0
    ? Object.entries(ENGLISH_SETS)
      .filter(([code]) => !code.includes("_"))
      .map(([code, name]) => `  ${code} = ${name}`)
      .join("\n")
    : "");

  sections.push("\n=== JAPANESE SET CODES ===");
  sections.push(Object.entries(JAPANESE_SETS)
    .map(([code, name]) => `  ${code} = ${name}`)
    .join("\n"));

  sections.push("\n=== KOREAN SET CODES (same as Japanese with minor name variations) ===");
  sections.push("Korean cards use the same set codes as Japanese cards (S1W, SV2a, SM8b, etc.)");

  sections.push("\n=== CHINESE SET CODES ===");
  sections.push("Simplified Chinese: CS prefix (CS1a, CS2, CS5b, etc.)");
  sections.push("Traditional Chinese: Often matches Japanese codes or uses F suffix (M3F, M2aF, etc.)");
  sections.push(Object.entries(CHINESE_SETS)
    .map(([code, name]) => `  ${code} = ${name}`)
    .join("\n"));

  return sections.join("\n");
}
