import type { Express } from "express";
import { createServer, type Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { parse as parseHtml } from "node-html-parser";
import { Pool } from "pg";

// ─── SET IMAGE DISK CACHE ────────────────────────────────────────────────────
// Downloads and permanently caches set logos + symbols on disk so the client
// always fetches from our server instead of the external Pokémon TCG / TCGdex CDNs.

const SET_IMG_CACHE_DIR = path.join(process.cwd(), "server", "set-image-cache");
if (!fs.existsSync(SET_IMG_CACHE_DIR)) {
  fs.mkdirSync(SET_IMG_CACHE_DIR, { recursive: true });
}

function imgUrlToFilename(url: string): string {
  return Buffer.from(url).toString("base64url");
}

async function getOrFetchSetImage(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  const filename = imgUrlToFilename(url);
  const filepath = path.join(SET_IMG_CACHE_DIR, filename);
  if (fs.existsSync(filepath)) {
    const data = fs.readFileSync(filepath);
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "png";
    const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/png";
    return { data, contentType };
  }
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get("content-type") || "image/png";
    fs.writeFileSync(filepath, buffer);
    return { data: buffer, contentType };
  } catch {
    return null;
  }
}

async function prewarmSetImages(urls: string[]): Promise<void> {
  const toFetch = urls.filter(u => u && !fs.existsSync(path.join(SET_IMG_CACHE_DIR, imgUrlToFilename(u))));
  if (toFetch.length === 0) return;
  console.log(`[set-img-cache] Pre-warming ${toFetch.length} new images...`);
  let downloaded = 0;
  for (const url of toFetch) {
    try {
      const result = await getOrFetchSetImage(url);
      if (result) downloaded++;
      if (downloaded > 0 && downloaded % 20 === 0) {
        await new Promise(r => setTimeout(r, 300));
      }
    } catch {}
  }
  console.log(`[set-img-cache] Downloaded ${downloaded}/${toFetch.length} images`);
}

function proxifyImageUrl(req: any, url: string | null | undefined): string | null {
  if (!url) return null;
  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}/api/set-img?u=${encodeURIComponent(url)}`;
}
// ─────────────────────────────────────────────────────────────────────────────

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function logGradeEvent(jobId: string, mode: string, cardCount = 1): Promise<void> {
  try {
    await db.query(
      "INSERT INTO grade_analytics (job_id, mode, card_count) VALUES ($1, $2, $3)",
      [jobId, mode, cardCount]
    );
  } catch (e) {
    console.error("[analytics] Failed to log grade event:", e);
  }
}

async function completeGradeEvent(jobId: string, status: "completed" | "failed"): Promise<void> {
  try {
    await db.query(
      "UPDATE grade_analytics SET status = $1, completed_at = NOW() WHERE job_id = $2",
      [status, jobId]
    );
  } catch (e) {
    console.error("[analytics] Failed to complete grade event:", e);
  }
}

// ─── SERVER-SIDE USAGE TRACKING ───────────────────────────────────────────

function getYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function getServerUsage(rcUserId: string): Promise<{ quickCount: number; deepCount: number; crossoverCount: number }> {
  if (!rcUserId) return { quickCount: 0, deepCount: 0, crossoverCount: 0 };
  try {
    const result = await db.query(
      "SELECT quick_count, deep_count, crossover_count FROM usage_tracking WHERE rc_user_id = $1 AND year_month = $2",
      [rcUserId, getYearMonth()]
    );
    if (!result.rows.length) return { quickCount: 0, deepCount: 0, crossoverCount: 0 };
    const r = result.rows[0];
    return { quickCount: r.quick_count, deepCount: r.deep_count, crossoverCount: r.crossover_count };
  } catch {
    return { quickCount: 0, deepCount: 0, crossoverCount: 0 };
  }
}

async function recordServerUsage(rcUserId: string, type: "quick" | "deep" | "crossover"): Promise<void> {
  if (!rcUserId) return;
  try {
    const col = type === "quick" ? "quick_count" : type === "deep" ? "deep_count" : "crossover_count";
    await db.query(
      `INSERT INTO usage_tracking (rc_user_id, year_month, ${col})
       VALUES ($1, $2, 1)
       ON CONFLICT (rc_user_id, year_month)
       DO UPDATE SET ${col} = usage_tracking.${col} + 1, updated_at = NOW()`,
      [rcUserId, getYearMonth()]
    );
  } catch (e) {
    console.error("[usage] Failed to record server usage:", e);
  }
}

async function checkHasPaidEntitlement(rcUserId: string): Promise<boolean> {
  try {
    const key = process.env.REVENUECAT_SECRET_KEY;
    if (!key || !rcUserId) return false;
    const resp = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return false;
    const data = await resp.json() as any;
    return !!data?.subscriber?.entitlements?.["Grade.IQ Pro"];
  } catch {
    return false;
  }
}

async function isAdminUser(rcUserId: string): Promise<boolean> {
  if (!rcUserId) return false;
  try {
    const result = await db.query("SELECT 1 FROM admin_users WHERE rc_user_id = $1", [rcUserId]);
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

// Returns an error message string if over quota, or null if the request should be allowed.
async function enforceServerQuota(
  rcUserId: string,
  type: "quick" | "deep" | "crossover"
): Promise<string | null> {
  if (!rcUserId) return null;
  if (await isAdminUser(rcUserId)) return null;
  const usage = await getServerUsage(rcUserId);
  const count = type === "quick" ? usage.quickCount : type === "deep" ? usage.deepCount : usage.crossoverCount;
  const freeLimits: Record<string, number> = { quick: 3, deep: 0, crossover: 0 };
  const freeLimit = freeLimits[type] ?? 0;
  if (count < freeLimit) return null;
  const hasPaid = await checkHasPaidEntitlement(rcUserId);
  if (hasPaid) return null;
  return `Monthly ${type} grade limit reached. Please upgrade to continue.`;
}
import { ENGLISH_SETS, JAPANESE_SETS, KOREAN_SETS, CHINESE_SETS, generateSetReferenceForPrompt, generateSymbolReferenceForPrompt } from "./pokemon-sets";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

function toClaudeImage(url: string): Anthropic.ImageBlockParam {
  if (url.startsWith("data:")) {
    const semicolonIdx = url.indexOf(";");
    const mediaType = url.substring(5, semicolonIdx) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    const base64Data = url.substring(url.indexOf(",") + 1);
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64Data },
    };
  }
  return {
    type: "image",
    source: { type: "url", url },
  };
}

function convertToClaudeContent(openAiContent: any[]): Anthropic.MessageParam["content"] {
  return openAiContent.map((item: any) => {
    if (item.type === "image_url") {
      return toClaudeImage(item.image_url.url);
    }
    return item as Anthropic.TextBlockParam;
  });
}

function repairAndParseJSON(raw: string): any | null {
  const attempt = (s: string): any | null => {
    try { return JSON.parse(s); } catch { return null; }
  };

  let result = attempt(raw);
  if (result !== null) return result;

  let s = raw;

  s = raw
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  result = attempt(s);
  if (result !== null) return result;

  s = raw.replace(/,(\s*[}\]])/g, '$1');
  result = attempt(s);
  if (result !== null) return result;

  s = raw
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,(\s*[}\]])/g, '$1');
  result = attempt(s);
  if (result !== null) return result;

  for (let i = raw.length - 1; i > 10; i--) {
    const ch = raw[i];
    if (ch !== ',' && ch !== '}' && ch !== '"' && ch !== ']') continue;
    const slice = raw.substring(0, i + (ch === ',' ? 0 : 1));
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (const c of slice) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{' || c === '[') depth++;
      if (c === '}' || c === ']') depth--;
    }
    if (depth === 1 && !inStr) {
      result = attempt(slice + '}');
      if (result !== null) return result;
    }
  }

  return null;
}

const SET_CODE_TO_NAME: Record<string, string> = {};
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

let dynamicSetReference = generateSetReferenceForPrompt();
let apiDiscoveredSets: Record<string, string> = {};

function mergeApiSetsIntoLookup(apiSets: CachedSet[]) {
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
    const apiSection = Object.entries(apiDiscoveredSets)
      .map(([code, name]) => `  ${code} = ${name}`)
      .join("\n");
    dynamicSetReference = generateSetReferenceForPrompt() +
      "\n\n=== ADDITIONAL SETS (auto-discovered from Pokemon TCG API) ===\n" + apiSection;
  }
}

function getCurrentSetReference(): string {
  return dynamicSetReference;
}

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
  logo?: string;
  symbol?: string;
}

let cachedSets: CachedSet[] = [];
let setsLastFetched = 0;
const SET_CACHE_TTL = 24 * 60 * 60 * 1000;

let topGradingPicksCache: any[] | null = null;
let topGradingPicksLastFetch = 0;
const TOP_PICKS_TTL = 2 * 60 * 60 * 1000;
topGradingPicksLastFetch = 0; // bust on startup

// ── eBay Graded Price Cache ────────────────────────────────────────────────
interface GradeDetail {
  avg7d?: number | null;
  avg30d?: number | null;
  avg1d?: number | null;
  low?: number | null;
  high?: number | null;
  saleCount?: number | null;
  lastUpdated?: string | null;
}

interface EbayAllGrades {
  // PSA (whole grades)
  psa10: number; psa9: number; psa8: number; psa7: number;
  // BGS/Beckett (half-step grades)
  bgs10: number; bgs95: number; bgs9: number; bgs85: number; bgs8: number;
  // ACE
  ace10: number; ace9: number; ace8: number;
  // TAG
  tag10: number; tag9: number; tag8: number;
  // CGC
  cgc10: number; cgc95: number; cgc9: number; cgc8: number;
  // Ungraded eBay last-sold price (USD) — 0 if none found
  raw: number;
  // Richer per-grade detail (avg7d, avg30d, low, high, saleCount)
  gradeDetails?: Record<string, GradeDetail>;
  fetchedAt: number;
  // true when cache is expired but we are serving archived data (e.g. API limit hit)
  isStale?: boolean;
}
// ── Persistent eBay Cache ─────────────────────────────────────────────────
// Survives server restarts so we don't burn rate limits on every reload.
// 3-day TTL — data stays fresh long enough to be useful but not stale
const EBAY_PRICE_TTL = 3 * 24 * 60 * 60 * 1000;
// L1: in-memory map (fast, per-process — warmed from DB on first hit)
const ebayPriceCache = new Map<string, EbayAllGrades>();

// Ensure the shared DB cache table exists (called once at startup)
async function initEbayPriceCacheTable(): Promise<void> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ebay_price_cache (
        cache_key   TEXT PRIMARY KEY,
        data        JSONB NOT NULL,
        fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[ebay-cache] DB table ready");
  } catch (e: any) {
    console.error("[ebay-cache] Failed to create table:", e.message);
  }
}

// ── Price History ─────────────────────────────────────────────────────────
// Logs a price snapshot each time fresh PokeTrace data is fetched.
// Over time this builds a real time-series for charting.
async function initPriceHistoryTable(): Promise<void> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS price_history (
        id          SERIAL PRIMARY KEY,
        cache_key   TEXT NOT NULL,
        grade       TEXT NOT NULL,
        price_usd   NUMERIC(12,2) NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_price_history_lookup
        ON price_history (cache_key, grade, recorded_at DESC);
    `);
    console.log("[price-history] DB table ready");
  } catch (e: any) {
    console.error("[price-history] Failed to create table:", e.message);
  }
}

async function initGradingFeedbackTable(): Promise<void> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS grading_feedback (
        id          SERIAL PRIMARY KEY,
        card_name   TEXT,
        set_name    TEXT,
        set_number  TEXT,
        grade_psa   NUMERIC(4,1),
        is_positive BOOLEAN NOT NULL,
        comment     TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[grading-feedback] DB table ready");
  } catch (e: any) {
    console.error("[grading-feedback] Failed to create table:", e.message);
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS price_flags (
        id               SERIAL PRIMARY KEY,
        card_name        TEXT NOT NULL,
        set_name         TEXT,
        set_code         TEXT,
        card_number      TEXT,
        card_lang        TEXT DEFAULT 'en',
        company          TEXT NOT NULL,
        flagged_grades   JSONB NOT NULL DEFAULT '[]',
        flagged_values   JSONB NOT NULL DEFAULT '{}',
        user_note        TEXT,
        status           TEXT NOT NULL DEFAULT 'pending',
        ai_analysis      TEXT,
        admin_response   TEXT,
        corrected_search TEXT,
        clean_search_term TEXT,
        correction_applied BOOLEAN DEFAULT FALSE,
        resolution_method TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at      TIMESTAMPTZ
      )
    `);
    // Migrate existing tables that predate new columns
    await db.query(`ALTER TABLE price_flags ADD COLUMN IF NOT EXISTS clean_search_term TEXT`);
    await db.query(`ALTER TABLE price_flags ADD COLUMN IF NOT EXISTS resolution_method TEXT`);
    await db.query(`ALTER TABLE price_flags ADD COLUMN IF NOT EXISTS suggested_prices JSONB`);
    await db.query(`ALTER TABLE price_flags ADD COLUMN IF NOT EXISTS suggested_card TEXT`);
    console.log("[price-flags] DB table ready");
  } catch (e: any) {
    console.error("[price-flags] Failed to create table:", e.message);
  }

  // ── Corrections log — institutional memory for Claude ─────────────────
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS corrections_log (
        id                SERIAL PRIMARY KEY,
        flag_id           INTEGER,
        cache_key         TEXT NOT NULL,
        card_name         TEXT NOT NULL,
        set_name          TEXT,
        card_number       TEXT,
        card_lang         TEXT DEFAULT 'en',
        old_prices        JSONB,
        new_prices        JSONB,
        correction_method TEXT NOT NULL,
        search_term_used  TEXT,
        admin_note        TEXT,
        ai_reasoning      TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS corrections_log_card_name_idx ON corrections_log (card_name)`);
    await db.query(`CREATE INDEX IF NOT EXISTS corrections_log_created_at_idx ON corrections_log (created_at DESC)`);

    // Backfill from existing resolved price_flags (best-effort, skips duplicates)
    await db.query(`
      INSERT INTO corrections_log (flag_id, cache_key, card_name, set_name, card_number,
        card_lang, old_prices, correction_method, search_term_used, ai_reasoning, created_at)
      SELECT
        pf.id,
        CASE WHEN pf.card_number IS NOT NULL
          THEN pf.card_name || ' ' || split_part(pf.card_number, '/', 1)
          ELSE pf.card_name
        END AS cache_key,
        pf.card_name,
        pf.set_name,
        pf.card_number,
        pf.card_lang,
        pf.flagged_values AS old_prices,
        COALESCE(pf.resolution_method, 'unknown') AS correction_method,
        pf.clean_search_term,
        pf.ai_analysis,
        COALESCE(pf.resolved_at, pf.created_at)
      FROM price_flags pf
      WHERE pf.correction_applied = true
        AND NOT EXISTS (
          SELECT 1 FROM corrections_log cl WHERE cl.flag_id = pf.id
        )
    `);
    console.log("[corrections-log] DB table ready");
  } catch (e: any) {
    console.error("[corrections-log] Failed to create table:", e.message);
  }

  // ── card_variants: stamp/promo variant catalog ─────────────────────────
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS card_variants (
        id                    SERIAL PRIMARY KEY,
        base_card_name        TEXT NOT NULL,
        base_set_name         TEXT,
        base_set_id           TEXT,
        base_card_number      TEXT,
        stamp_type            TEXT NOT NULL,
        display_name          TEXT NOT NULL,
        image_url             TEXT,
        poketrace_search_term TEXT,
        lang                  TEXT DEFAULT 'en',
        cached_prices         JSONB,
        prices_fetched_at     TIMESTAMPTZ,
        notes                 TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_card_variants_lookup ON card_variants (LOWER(base_card_name))`);
    console.log("[card-variants] DB table ready");
  } catch (e: any) {
    console.error("[card-variants] Failed to create table:", e.message);
  }
}

async function writePriceHistorySnapshot(
  cacheKey: string,
  grades: Record<string, number>   // { psa10: 150, psa9: 80, … } — zeroes excluded
): Promise<void> {
  try {
    // Only write grades with a real price
    const entries = Object.entries(grades).filter(([, v]) => v > 0);
    if (entries.length === 0) return;

    // Dedup: skip any grade whose last snapshot is < 12 h old
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { rows: recent } = await db.query<{ grade: string }>(
      `SELECT DISTINCT grade FROM price_history
        WHERE cache_key = $1 AND recorded_at > $2`,
      [cacheKey, twelveHoursAgo]
    );
    const recentGrades = new Set(recent.map(r => r.grade));

    const fresh = entries.filter(([g]) => !recentGrades.has(g));
    if (fresh.length === 0) return;

    // Bulk insert
    const valPlaceholders = fresh.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3}, NOW())`).join(", ");
    const valParams: (string | number)[] = [cacheKey];
    for (const [grade, price] of fresh) valParams.push(grade, price);

    await db.query(
      `INSERT INTO price_history (cache_key, grade, price_usd, recorded_at) VALUES ${valPlaceholders}`,
      valParams
    );
    console.log(`[price-history] Wrote ${fresh.length} snapshot(s) for "${cacheKey}"`);
  } catch (e: any) {
    console.error("[price-history] Snapshot write failed:", e.message);
  }
}

// ── Price flag AI analysis ─────────────────────────────────────────────────
async function autoApplyPriceFix(
  flagId: number,
  cardName: string,
  cardNumber: string | null,
  cleanSearchTerm: string
): Promise<boolean> {
  try {
    const apiKey = process.env.POKETRACE_API_KEY;
    if (!apiKey) return false;

    const url = `https://api.poketrace.com/v1/cards?search=${encodeURIComponent(cleanSearchTerm)}&market=US&limit=10`;
    const resp = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.warn(`[price-flags] Auto-fix PokeTrace ${resp.status} for flag #${flagId}`);
      return false;
    }

    const data = await resp.json() as any;
    const cards: any[] = data?.data || [];
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normCard = normalize(cardName);
    const baseNum = cardNumber ? cardNumber.split("/")[0].trim() : "";

    const numMatches = (c: any) =>
      baseNum && (c.cardNumber?.startsWith(baseNum + "/") || c.cardNumber === baseNum);

    const ptCard =
      cards.find(c => numMatches(c) && normalize(c.name) === normCard) ||
      cards.find(c => numMatches(c)) ||
      cards.find(c => normalize(c.name) === normCard) ||
      null;

    if (!ptCard) {
      console.log(`[price-flags] Auto-fix found no matching card for flag #${flagId}`);
      return false;
    }

    const ebayPrices = ptCard?.prices?.ebay || {};
    const graded: Partial<EbayAllGrades> = {};
    const gradeDetails: Record<string, GradeDetail> = {};
    for (const [ptKey, ourKey] of Object.entries(PT_GRADE_MAP)) {
      const gd = ebayPrices[ptKey];
      const avg = gd?.avg;
      (graded as any)[ourKey] = avg && avg > 0 ? Math.round(avg * 100) / 100 : 0;
      if (gd) {
        gradeDetails[ourKey as string] = {
          avg1d: gd.avg1d ?? null,
          avg7d: gd.avg7d ?? null,
          avg30d: gd.avg30d ?? null,
          low: gd.low ?? null,
          high: gd.high ?? null,
          saleCount: gd.saleCount ?? null,
          lastUpdated: gd.lastUpdated ?? null,
        };
      }
    }

    const rawAvg = ebayPrices["NEAR_MINT"]?.avg;
    const result: EbayAllGrades = {
      psa10: 0, psa9: 0, psa8: 0, psa7: 0,
      bgs10: 0, bgs95: 0, bgs9: 0, bgs85: 0, bgs8: 0,
      ace10: 0, ace9: 0, ace8: 0,
      tag10: 0, tag9: 0, tag8: 0,
      cgc10: 0, cgc95: 0, cgc9: 0, cgc8: 0,
      raw: rawAvg && rawAvg > 0 ? Math.round(rawAvg * 100) / 100 : 0,
      gradeDetails,
      fetchedAt: Date.now(),
      ...graded,
    };

    const hasData = result.psa10 > 0 || result.psa9 > 0 || result.bgs95 > 0 || result.raw > 0;
    if (!hasData) {
      console.log(`[price-flags] Auto-fix returned no price data for flag #${flagId}`);
      return false;
    }

    // Overwrite the original cache entry so the next card-profit load gets fixed prices
    const originalCacheKey = [cardName, baseNum].filter(Boolean).join(" ");

    // Snapshot old prices before overwriting (for corrections_log)
    let oldPrices: Record<string, number> | null = null;
    try {
      const oldRow = await db.query<{ data: any }>(
        `SELECT data FROM ebay_price_cache WHERE cache_key = $1`, [originalCacheKey]
      );
      if (oldRow.rows.length > 0) {
        const d = oldRow.rows[0].data;
        oldPrices = { psa10: d.psa10 ?? 0, psa9: d.psa9 ?? 0, psa8: d.psa8 ?? 0, raw: d.raw ?? 0 };
      }
    } catch { /* non-fatal */ }

    ebayPriceCache.set(originalCacheKey, result);
    const { fetchedAt: _fa, isStale: _is, gradeDetails: _gd, ...dbData } = result;
    await db.query(
      `INSERT INTO ebay_price_cache (cache_key, data, fetched_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET data = $2, fetched_at = NOW()`,
      [originalCacheKey, JSON.stringify({ ...dbData, gradeDetails: result.gradeDetails })]
    );

    // Log the correction for institutional memory
    void logCorrection({
      flagId,
      cacheKey: originalCacheKey,
      cardName,
      oldPrices,
      newPrices: { psa10: result.psa10, psa9: result.psa9, psa8: result.psa8, raw: result.raw },
      correctionMethod: "auto_fix",
      searchTermUsed: cleanSearchTerm,
    });

    console.log(`[price-flags] Auto-fix applied for flag #${flagId} — matched: ${ptCard.name} ${ptCard.cardNumber} | PSA10 $${result.psa10}`);
    return true;
  } catch (e: any) {
    console.error(`[price-flags] autoApplyPriceFix(${flagId}) error:`, e.message);
    return false;
  }
}

// Like autoApplyPriceFix but stores found prices in suggested_prices column without touching cache.
// Returns true if prices were found and stored.
async function previewPriceFix(
  flagId: number,
  cardName: string,
  cardNumber: string | null,
  cleanSearchTerm: string
): Promise<boolean> {
  try {
    const apiKey = process.env.POKETRACE_API_KEY;
    if (!apiKey) return false;

    const url = `https://api.poketrace.com/v1/cards?search=${encodeURIComponent(cleanSearchTerm)}&market=US&limit=10`;
    const resp = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.warn(`[price-flags] Preview PokeTrace ${resp.status} for flag #${flagId}`);
      return false;
    }

    const data = await resp.json() as any;
    const cards: any[] = data?.data || [];
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normCard = normalize(cardName);
    const baseNum = cardNumber ? cardNumber.split("/")[0].trim() : "";

    const numMatches = (c: any) =>
      baseNum && (c.cardNumber?.startsWith(baseNum + "/") || c.cardNumber === baseNum);

    const ptCard =
      cards.find(c => numMatches(c) && normalize(c.name) === normCard) ||
      cards.find(c => numMatches(c)) ||
      cards.find(c => normalize(c.name) === normCard) ||
      null;

    if (!ptCard) {
      console.log(`[price-flags] Preview found no matching card for flag #${flagId}`);
      return false;
    }

    const ebayPrices = ptCard?.prices?.ebay || {};
    const graded: Record<string, number> = {};
    for (const [ptKey, ourKey] of Object.entries(PT_GRADE_MAP)) {
      const gd = ebayPrices[ptKey];
      const avg = gd?.avg;
      graded[ourKey as string] = avg && avg > 0 ? Math.round(avg * 100) / 100 : 0;
    }
    const rawAvg = ebayPrices["NEAR_MINT"]?.avg;
    graded["raw"] = rawAvg && rawAvg > 0 ? Math.round(rawAvg * 100) / 100 : 0;

    const hasData = (graded["psa10"] ?? 0) > 0 || (graded["psa9"] ?? 0) > 0 ||
                    (graded["bgs95"] ?? 0) > 0 || (graded["raw"] ?? 0) > 0;
    if (!hasData) {
      console.log(`[price-flags] Preview returned no price data for flag #${flagId}`);
      return false;
    }

    const matchedCardLabel = `${ptCard.name} ${ptCard.cardNumber ?? ""}`.trim();
    await db.query(
      `UPDATE price_flags SET suggested_prices = $1, suggested_card = $2 WHERE id = $3`,
      [JSON.stringify(graded), matchedCardLabel, flagId]
    );

    console.log(`[price-flags] Preview stored for flag #${flagId} — matched: ${matchedCardLabel} | PSA10 $${graded["psa10"] ?? 0}`);
    return true;
  } catch (e: any) {
    console.error(`[price-flags] previewPriceFix(${flagId}) error:`, e.message);
    return false;
  }
}

// ── Corrections Log — write one entry every time a price is fixed ──────────
// This builds the institutional memory Claude uses to get smarter over time.
async function logCorrection(opts: {
  flagId?: number;
  cacheKey: string;
  cardName: string;
  setName?: string | null;
  cardNumber?: string | null;
  cardLang?: string;
  oldPrices?: Record<string, number> | null;
  newPrices?: Record<string, number> | null;
  correctionMethod: string;   // 'auto_fix' | 'admin_applied' | 'manual_prices' | 'sanity_flag'
  searchTermUsed?: string | null;
  adminNote?: string | null;
  aiReasoning?: string | null;
}): Promise<void> {
  try {
    await db.query(
      `INSERT INTO corrections_log
         (flag_id, cache_key, card_name, set_name, card_number, card_lang,
          old_prices, new_prices, correction_method, search_term_used,
          admin_note, ai_reasoning)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        opts.flagId ?? null,
        opts.cacheKey,
        opts.cardName,
        opts.setName ?? null,
        opts.cardNumber ?? null,
        opts.cardLang ?? "en",
        opts.oldPrices ? JSON.stringify(opts.oldPrices) : null,
        opts.newPrices ? JSON.stringify(opts.newPrices) : null,
        opts.correctionMethod,
        opts.searchTermUsed ?? null,
        opts.adminNote ?? null,
        opts.aiReasoning ?? null,
      ]
    );
  } catch (e: any) {
    console.error("[corrections-log] Failed to log correction:", e.message);
  }
}

// ── Fetch recent corrections for Claude context ───────────────────────────
async function getCorrectionsContext(limit = 60): Promise<string> {
  try {
    const { rows } = await db.query(
      `SELECT card_name, set_name, card_number, old_prices, new_prices,
              correction_method, search_term_used, admin_note, ai_reasoning
       FROM corrections_log
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    if (rows.length === 0) return "";

    const lines = rows.map((r: any) => {
      const oldP10 = r.old_prices?.psa10 ?? r.old_prices?.PSA10;
      const newP10 = r.new_prices?.psa10 ?? r.new_prices?.PSA10;
      const priceStr = oldP10 != null
        ? `PSA10 was $${oldP10}${newP10 != null ? ` → corrected to $${newP10}` : " (flagged)"}`
        : "(prices unknown)";
      const method = r.correction_method === "manual_prices" ? "manual override"
        : r.correction_method === "auto_fix" ? "AI auto-fix"
        : r.correction_method === "admin_applied" ? "admin confirmed AI fix"
        : r.correction_method === "sanity_flag" ? "sanity check auto-flag"
        : r.correction_method;
      const extra = r.search_term_used ? ` via search "${r.search_term_used}"` : "";
      const note = r.admin_note ? ` [note: ${r.admin_note}]` : "";
      const card = [r.card_name, r.set_name, r.card_number].filter(Boolean).join(" / ");
      return `• ${card}: ${priceStr} — ${method}${extra}${note}`;
    });

    return `\n\nPAST PRICE CORRECTIONS (institutional memory — use these to spot patterns):\n${lines.join("\n")}`;
  } catch (e: any) {
    console.error("[corrections-log] Failed to fetch context:", e.message);
    return "";
  }
}

async function analyzePriceFlag(flagId: number, previewOnly?: boolean): Promise<void> {
  try {
    await db.query(`UPDATE price_flags SET status = 'ai_processing' WHERE id = $1`, [flagId]);

    const { rows } = await db.query(
      `SELECT card_name, set_name, set_code, card_number, card_lang, company,
              flagged_grades, flagged_values, user_note, admin_response
       FROM price_flags WHERE id = $1`,
      [flagId]
    );
    if (rows.length === 0) return;
    const flag = rows[0];

    const gradeLines = (flag.flagged_grades as string[]).map((g: string) => {
      const val = (flag.flagged_values as Record<string, number>)[g];
      return `  - ${g}: ${val != null ? `$${val.toFixed(2)} USD` : "no data"}`;
    }).join("\n");

    const adminNote = flag.admin_response
      ? `\n\nAdmin hint: "${flag.admin_response}"`
      : "";

    // Fetch corrections history to give Claude institutional memory
    const correctionsContext = await getCorrectionsContext(60);

    const prompt = `You are a Pokemon card market data analyst with growing expertise from past price corrections. A user has flagged eBay sold prices as looking incorrect for the following card:

Card: ${flag.card_name}
Set: ${flag.set_name ?? "unknown"} (code: ${flag.set_code ?? "unknown"})
Card number: ${flag.card_number ?? "unknown"}
Language: ${flag.card_lang === "ja" ? "Japanese" : "English"}
Grading company: ${flag.company}

Flagged grades and their current prices:
${gradeLines}

User note: ${flag.user_note ?? "(none)"}${adminNote}

The prices are sourced from PokeTrace, which searches eBay sold listings by card name. The MOST COMMON reason for wrong prices — accounting for the vast majority of cases — is that PokeTrace has returned data for the WRONG CARD, specifically a different printing or set that shares the same card name. The key causes to consider in order of likelihood:

1. WRONG SET / ERA (most common): Same card name exists in multiple sets. e.g. "Dark Blastoise" appears in both Team Rocket (1st ed/unlimited, ~$9,500 PSA10) and Legendary Collection (~$380 PSA10). PokeTrace may return the wrong one. Other examples: Base Set vs Base Set 2 vs Legendary Collection, original WoTC sets vs later reprints.
2. SPECIAL STAMP or VARIANT: The card has a special marking that dramatically affects value but PokeTrace is returning generic results:
   - 1st Edition stamp: typically 3-10x more valuable than unlimited
   - Shadowless (Base Set only): more valuable than shadowed prints
   - Promo stamp: e.g. "STAFF", "PRERELEASE", "WINNER" stamped promos
   - Pokémon Center stamp: exclusive retail variants (Japan and some Western markets)
   - Build & Battle stamp: exclusive to sealed Build & Battle kits
   - Prerelease stamp or regional exclusive stamps
3. HOLO vs NON-HOLO CONFUSION: The card exists as both a holo and non-holo, and PokeTrace is blending the two or returning the wrong variant.
4. NAME COLLISION: A different card with a very similar name is being returned (e.g. "Gengar" vs "Gengar EX" vs "Gengar VMAX").
5. JAPANESE vs ENGLISH: For Japanese cards, the English name search may be pulling English card results instead of Japanese eBay sales.

Examine the set name, card number, and price level to determine which of these is most likely. Then suggest the most specific search term possible.

The cleanSearchTerm should be the card name plus enough context to distinguish the right printing — e.g. "Charizard Base Set", "Dark Blastoise Legendary Collection", "Pikachu Promo" — keep it concise and use only inclusion terms (no minus signs or exclusion operators).

IMPORTANT: If the card has a special stamp or variant (1st Edition, Promo, Pokémon Center, Build & Battle, etc.) that is likely causing the price mismatch, set confidence to "low" to route this to admin review, since PokeTrace may not be able to distinguish these variants. Similarly, if a past correction below shows this is a known set-confusion pattern, set confidence to "low".${correctionsContext}

Respond in this JSON format only:
{
  "analysis": "Your detailed analysis of why the prices are wrong (2-4 sentences). State specifically which cause you believe applies and why.",
  "correctedSearch": "Human-readable strategy for the admin to understand what went wrong and how to verify",
  "cleanSearchTerm": "Simple search term for PokeTrace API, e.g. 'Dark Blastoise Legendary Collection' (or null if no better search exists)",
  "confidence": "high|medium|low"
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (response.content[0] as Anthropic.TextBlock)?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");

    const parsed = JSON.parse(jsonMatch[0]);
    const analysis = parsed.analysis ?? "Could not determine reason.";
    const correctedSearch = parsed.correctedSearch ?? null;
    const cleanSearchTerm = parsed.cleanSearchTerm ?? null;
    const confidence = parsed.confidence ?? "low";

    let newStatus: string;
    let correctionApplied = false;
    let resolutionMethod: string | null = null;

    if (previewOnly) {
      // Admin re-analysis: always show a price preview rather than auto-applying.
      // Run PokeTrace lookup and store found prices in suggested_prices for admin confirmation.
      newStatus = "needs_admin";
      if (cleanSearchTerm) {
        const previewed = await previewPriceFix(flagId, flag.card_name, flag.card_number, cleanSearchTerm);
        if (!previewed) {
          // Clear any stale preview so we don't show old data
          await db.query(`UPDATE price_flags SET suggested_prices = NULL, suggested_card = NULL WHERE id = $1`, [flagId]);
        }
      } else {
        await db.query(`UPDATE price_flags SET suggested_prices = NULL, suggested_card = NULL WHERE id = $1`, [flagId]);
      }
    } else if (confidence === "high" && cleanSearchTerm) {
      console.log(`[price-flags] Flag #${flagId} high confidence — attempting auto-fix with "${cleanSearchTerm}"`);
      correctionApplied = await autoApplyPriceFix(flagId, flag.card_name, flag.card_number, cleanSearchTerm);
      if (correctionApplied) {
        newStatus = "resolved";
        resolutionMethod = "auto_fix";
      } else {
        newStatus = "no_fix";
      }
    } else {
      newStatus = "needs_admin";
    }

    await db.query(
      `UPDATE price_flags
       SET status = $1, ai_analysis = $2, corrected_search = $3,
           clean_search_term = $4, correction_applied = $5, resolution_method = $6,
           resolved_at = CASE WHEN $1 IN ('resolved', 'no_fix') THEN NOW() ELSE NULL END
       WHERE id = $7`,
      [newStatus, analysis, correctedSearch, cleanSearchTerm, correctionApplied, resolutionMethod, flagId]
    );
    console.log(`[price-flags] Flag #${flagId} → ${newStatus} (${confidence} confidence, previewOnly=${!!previewOnly})`);
  } catch (e: any) {
    console.error(`[price-flags] analyzePriceFlag(${flagId}) failed:`, e.message);
    await db.query(
      `UPDATE price_flags SET status = 'needs_admin', ai_analysis = $1 WHERE id = $2`,
      [`AI analysis failed: ${e.message}`, flagId]
    ).catch(() => {});
  }
}

// ── Live Exchange Rates (frankfurter.app — free, no auth) ─────────────────
interface ExchangeRateData {
  rates: Record<string, number>; // USD-based (USD = 1.0)
  updatedAt: string;             // YYYY-MM-DD
  fetchedAt: number;             // epoch ms
}
let exchangeRatesCache: ExchangeRateData | null = null;
const EXCHANGE_RATE_TTL = 22 * 60 * 60 * 1000; // 22h — refresh daily

async function fetchExchangeRates(): Promise<ExchangeRateData> {
  const resp = await fetch("https://api.frankfurter.app/latest?base=USD", {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error("Exchange rate API unavailable");
  const data = await resp.json() as any;
  return {
    rates: { USD: 1.0, ...data.rates },
    updatedAt: data.date ?? new Date().toISOString().slice(0, 10),
    fetchedAt: Date.now(),
  };
}

async function getExchangeRates(): Promise<ExchangeRateData> {
  if (exchangeRatesCache && Date.now() - exchangeRatesCache.fetchedAt < EXCHANGE_RATE_TTL) {
    return exchangeRatesCache;
  }
  try {
    exchangeRatesCache = await fetchExchangeRates();
    console.log(`[exchange-rates] Fetched for ${exchangeRatesCache.updatedAt}`);
  } catch (err: any) {
    console.warn("[exchange-rates] Fetch failed, using fallback:", err.message);
    if (!exchangeRatesCache) {
      exchangeRatesCache = {
        rates: { USD: 1.0, GBP: 0.79, EUR: 0.92, AUD: 1.55, CAD: 1.38, JPY: 150 },
        updatedAt: new Date().toISOString().slice(0, 10),
        fetchedAt: Date.now(),
      };
    }
  }
  return exchangeRatesCache!;
}

// ── Set Price Status — PostgreSQL persistence ─────────────────────────────
async function initSetPriceStatusTable(): Promise<void> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS set_price_status (
        set_id     VARCHAR(60) PRIMARY KEY,
        has_cards  BOOLEAN NOT NULL,
        has_prices BOOLEAN NOT NULL,
        checked_at BIGINT NOT NULL
      )
    `);
    console.log("[price-status] DB table ready");
  } catch (e: any) {
    console.error("[price-status] Failed to create table:", e.message);
  }
}

// ── Top Picks Precomputed — PostgreSQL persistence ────────────────────────
// Stores server-side pre-computed grading picks per price tier, with eBay
// last-sold data refreshed daily. Historic values are never deleted — if eBay
// returns no data (e.g. API limit hit), the existing prices are kept and
// marked stale so the app can still show something useful.
async function initTopPicksPrecomputedTable(): Promise<void> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS top_picks_precomputed (
        card_id         VARCHAR(120) NOT NULL,
        tier_max_gbp    INTEGER NOT NULL,
        card_name       VARCHAR(200) NOT NULL,
        set_name        VARCHAR(200) NOT NULL,
        set_id          VARCHAR(60),
        number          VARCHAR(30),
        image_url       TEXT,
        raw_price_usd   NUMERIC(10,2),
        ebay_psa10      NUMERIC(10,2),
        ebay_psa9       NUMERIC(10,2),
        ebay_bgs95      NUMERIC(10,2),
        ebay_bgs9       NUMERIC(10,2),
        ebay_ace10      NUMERIC(10,2),
        ebay_tag10      NUMERIC(10,2),
        ebay_cgc10      NUMERIC(10,2),
        ebay_raw        NUMERIC(10,2),
        ebay_all_grades JSONB,
        ebay_fetched_at TIMESTAMPTZ,
        is_stale        BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (card_id, tier_max_gbp)
      )
    `);
    await db.query(`ALTER TABLE top_picks_precomputed ADD COLUMN IF NOT EXISTS ebay_all_grades JSONB`);
    await db.query(`ALTER TABLE top_picks_precomputed ADD COLUMN IF NOT EXISTS lang VARCHAR(5) DEFAULT 'en'`);
    await db.query(`ALTER TABLE top_picks_precomputed ADD COLUMN IF NOT EXISTS raw_price_eur NUMERIC(10,2)`);

    // History table — one snapshot per card/tier/day; used for trend scoring after ≥7 days
    await db.query(`
      CREATE TABLE IF NOT EXISTS top_picks_history (
        card_id       VARCHAR(120) NOT NULL,
        tier_max_gbp  INTEGER      NOT NULL,
        lang          VARCHAR(5)   NOT NULL DEFAULT 'en',
        snapshot_date DATE         NOT NULL,
        card_name     VARCHAR(200),
        ebay_psa10    NUMERIC(10,2),
        ebay_ace10    NUMERIC(10,2),
        ebay_tag10    NUMERIC(10,2),
        ebay_bgs95    NUMERIC(10,2),
        ebay_cgc10    NUMERIC(10,2),
        raw_price_usd NUMERIC(10,2),
        PRIMARY KEY (card_id, tier_max_gbp, lang, snapshot_date)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tph_date ON top_picks_history (snapshot_date DESC)`);
    console.log("[top-picks] DB tables ready");
  } catch (e: any) {
    console.error("[top-picks] Failed to create table:", e.message);
  }
}

// ── Card Catalog — PostgreSQL persistence ─────────────────────────────────
// Stores all English card data (name, number, image, TCGPlayer price) so the
// set browser loads instantly from the DB rather than hitting external APIs.
async function initCardCatalogTable(): Promise<void> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS card_catalog (
        card_id          VARCHAR(120) PRIMARY KEY,
        set_id           VARCHAR(60)  NOT NULL,
        set_name         VARCHAR(200) NOT NULL,
        name             VARCHAR(200) NOT NULL,
        number           VARCHAR(30)  NOT NULL DEFAULT '',
        rarity           VARCHAR(100),
        image_url        TEXT,
        price_usd        NUMERIC(10,2),
        prices_json      JSONB,
        price_updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        card_updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`ALTER TABLE card_catalog ADD COLUMN IF NOT EXISTS prices_json JSONB`);
    await db.query(`ALTER TABLE card_catalog ADD COLUMN IF NOT EXISTS lang VARCHAR(5) NOT NULL DEFAULT 'en'`);
    await db.query(`ALTER TABLE card_catalog ADD COLUMN IF NOT EXISTS name_en VARCHAR(200)`);
    await db.query(`ALTER TABLE card_catalog ADD COLUMN IF NOT EXISTS price_eur NUMERIC(10,2)`);
    await db.query(`ALTER TABLE card_catalog ADD COLUMN IF NOT EXISTS set_name_en VARCHAR(200)`);
    await db.query(`CREATE INDEX IF NOT EXISTS card_catalog_set_id_idx ON card_catalog (set_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS card_catalog_lang_set_idx ON card_catalog (lang, set_id)`);
    console.log("[card-catalog] DB table ready");
  } catch (e: any) {
    console.error("[card-catalog] Failed to create table:", e.message);
  }
}

// ── PokeTrace Grade Key → EbayAllGrades field mapping ────────────────────
const PT_GRADE_MAP: Record<string, keyof EbayAllGrades> = {
  PSA_10:  "psa10", PSA_9:   "psa9",  PSA_8:   "psa8",  PSA_7:   "psa7",
  BGS_10:  "bgs10", BGS_9_5: "bgs95", BGS_9:   "bgs9",  BGS_8_5: "bgs85", BGS_8: "bgs8",
  ACE_10:  "ace10", ACE_9:   "ace9",  ACE_8:   "ace8",
  TAG_10:  "tag10", TAG_9:   "tag9",  TAG_8:   "tag8",
  CGC_10:  "cgc10", CGC_9_5: "cgc95", CGC_9:   "cgc9",  CGC_8:   "cgc8",
};

async function fetchEbayGradedPrices(
  cardName: string,
  setName: string,
  cardNumber?: string,
  edition?: "1st" | "unlimited" | null
): Promise<EbayAllGrades> {
  const baseNum    = cardNumber ? cardNumber.split("/")[0].trim() : "";
  const editionTag = edition === "1st" ? "1st" : "";
  const cardIdStr  = [cardName, baseNum, editionTag].filter(Boolean).join(" ");
  const cacheKey   = cardIdStr;

  // L1: in-memory (fresh only)
  const memHit = ebayPriceCache.get(cacheKey);
  if (memHit && Date.now() - memHit.fetchedAt < EBAY_PRICE_TTL) return memHit;

  // L2: PostgreSQL — return if fresh, or save as stale fallback for later
  let staleDbData: EbayAllGrades | null = null;
  try {
    const dbRes = await db.query<{ data: EbayAllGrades; fetched_ms: string }>(
      `SELECT data, EXTRACT(EPOCH FROM fetched_at) * 1000 AS fetched_ms
         FROM ebay_price_cache WHERE cache_key = $1`,
      [cacheKey]
    );
    if (dbRes.rows.length > 0) {
      const fetchedAt = parseFloat(dbRes.rows[0].fetched_ms);
      if (Date.now() - fetchedAt < EBAY_PRICE_TTL) {
        const result: EbayAllGrades = { ...dbRes.rows[0].data, fetchedAt };
        ebayPriceCache.set(cacheKey, result);
        return result;
      }
      // Expired but worth keeping as a fallback
      staleDbData = { ...dbRes.rows[0].data, fetchedAt };
    }
  } catch { /* fall through */ }

  const apiKey = process.env.POKETRACE_API_KEY;
  if (!apiKey) throw new Error("POKETRACE_API_KEY not configured");

  // Search PokeTrace — include card number for better matching
  const searchQuery = [cardName, baseNum].filter(Boolean).join(" ");
  const url = `https://api.poketrace.com/v1/cards?search=${encodeURIComponent(searchQuery)}&market=US&limit=10`;

  let ptCard: any = null;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normSet   = normalize(setName);

  // Retry up to 3 times with backoff on 429
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(15000),
      });
      if (resp.status === 429) {
        const retryAfterSec = parseInt(resp.headers.get("retry-after") || "10", 10);
        const waitMs = Math.min(retryAfterSec * 1000, 30_000);
        console.warn(`[poketrace] 429 for "${cardIdStr}" — waiting ${waitMs}ms before retry ${attempt}/3`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (!resp.ok) throw new Error(`PokeTrace HTTP ${resp.status}`);
      const data = await resp.json() as any;
      const cards: any[] = data?.data || [];

      // Set-name substring check: "SV: Black Bolt" should match when we look for "Black Bolt"
      const setMatches = (c: any) => {
        const ptNorm = normalize(c.set?.name || "");
        return ptNorm === normSet || ptNorm.includes(normSet) || normSet.includes(ptNorm);
      };
      const numMatches = (c: any) =>
        baseNum && (c.cardNumber?.startsWith(baseNum + "/") || c.cardNumber === baseNum);

      // For the "regular" fetch we prefer the non-stamped, non-reverse-holo card.
      // PokeTrace sometimes returns a Prerelease Stamp as the top result for a card
      // that also has an unstamped form. For vintage holo cards (e.g. Gengar 5/92
      // from Legend Maker), the Prerelease Stamp is listed under "Reverse_Holofoil"
      // while the real regular holo is listed under "Holofoil" — so we skip reverse
      // holos first, then fall back if no non-reverse match exists.
      const REGULAR_STAMP_KWS = ["prerelease", "stamp", "gym challenge", "gym-challenge",
        "pokemon center", "pokemon centre", "build and battle", "trick or trade", "staff"];
      const isStamped = (c: any) => {
        const txt = ((c.variant || "") + " " + (c.name || "")).toLowerCase();
        return REGULAR_STAMP_KWS.some(kw => txt.includes(kw));
      };
      const isReverseHolo = (c: any) =>
        (c.variant || "").toLowerCase().includes("reverse");

      // Priority ladder: prefer non-stamped AND non-reverse at each tier,
      // gracefully degrading to reverse/stamped only when no better match exists.
      ptCard =
        cards.find(c => numMatches(c) && setMatches(c) && !isStamped(c) && !isReverseHolo(c)) ||
        cards.find(c => numMatches(c) && setMatches(c) && !isStamped(c)) ||
        cards.find(c => numMatches(c) && setMatches(c)) ||
        cards.find(c => numMatches(c) && !isStamped(c) && !isReverseHolo(c)) ||
        cards.find(c => numMatches(c) && !isStamped(c)) ||
        cards.find(c => numMatches(c)) ||
        cards.find(c => setMatches(c) && !isStamped(c) && !isReverseHolo(c)) ||
        cards.find(c => setMatches(c) && !isStamped(c)) ||
        cards.find(c => setMatches(c)) ||
        cards.find(c => c.hasGraded && !isStamped(c) && !isReverseHolo(c)) ||
        cards.find(c => c.hasGraded && !isStamped(c)) ||
        cards.find(c => c.hasGraded) ||
        null;
      break;
    } catch (e: any) {
      console.warn(`[poketrace] Fetch failed for "${cardIdStr}" (attempt ${attempt}/3):`, e.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }

  // Build result from PokeTrace price data
  const ebayPrices = ptCard?.prices?.ebay || {};
  const graded: Partial<EbayAllGrades> = {};
  const gradeDetails: Record<string, GradeDetail> = {};
  for (const [ptKey, ourKey] of Object.entries(PT_GRADE_MAP)) {
    const gd = ebayPrices[ptKey];
    const avg = gd?.avg;
    (graded as any)[ourKey] = avg && avg > 0 ? Math.round(avg * 100) / 100 : 0;
    if (gd) {
      gradeDetails[ourKey as string] = {
        avg1d: gd.avg1d ?? null,
        avg7d: gd.avg7d ?? null,
        avg30d: gd.avg30d ?? null,
        low: gd.low ?? null,
        high: gd.high ?? null,
        saleCount: gd.saleCount ?? null,
        lastUpdated: gd.lastUpdated ?? null,
      };
    }
  }

  // Raw price — use eBay NEAR_MINT if available
  const rawAvg = ebayPrices["NEAR_MINT"]?.avg;
  const result: EbayAllGrades = {
    psa10: 0, psa9: 0, psa8: 0, psa7: 0,
    bgs10: 0, bgs95: 0, bgs9: 0, bgs85: 0, bgs8: 0,
    ace10: 0, ace9: 0, ace8: 0,
    tag10: 0, tag9: 0, tag8: 0,
    cgc10: 0, cgc95: 0, cgc9: 0, cgc8: 0,
    raw: rawAvg && rawAvg > 0 ? Math.round(rawAvg * 100) / 100 : 0,
    gradeDetails,
    fetchedAt: Date.now(),
    ...graded,
  };

  const matched = ptCard ? `${ptCard.name} ${ptCard.cardNumber} [${ptCard.variant}] (${ptCard.set?.name})` : "no match";
  console.log(
    `[poketrace] ${cardIdStr} → ${matched} | PSA10 $${result.psa10} PSA9 $${result.psa9}` +
    ` BGS9.5 $${result.bgs95} ACE10 $${result.ace10} TAG10 $${result.tag10} Raw $${result.raw}`
  );

  // If PokeTrace returned no useful data, serve the archived cache with an isStale flag
  const hasData = result.psa10 > 0 || result.psa9 > 0 || result.raw > 0;
  if (!hasData && staleDbData) {
    console.log(`[poketrace] No fresh data for "${cardIdStr}" — serving archived cache from ${new Date(staleDbData.fetchedAt).toISOString()}`);
    return { ...staleDbData, isStale: true };
  }

  if (hasData) {
    // ── Sanity checks before caching — auto-flag suspicious prices ────────
    void checkAndFlagSuspiciousPrices(cacheKey, cardName, setName, cardNumber ?? null, result);

    ebayPriceCache.set(cacheKey, result);
    const { fetchedAt: _fa, isStale: _is, gradeDetails: _gd, ...dbData } = result;
    db.query(
      `INSERT INTO ebay_price_cache (cache_key, data, fetched_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET data = $2, fetched_at = NOW()`,
      [cacheKey, JSON.stringify({ ...dbData, gradeDetails: result.gradeDetails })]
    ).catch(e => console.error("[poketrace-cache] DB write failed:", e.message));

    // Write price history snapshot (fire-and-forget, deduped to once per 12h)
    const gradeSnapshot: Record<string, number> = {};
    for (const [ptKey, ourKey] of Object.entries(PT_GRADE_MAP)) {
      const price = (result as any)[ourKey];
      if (price > 0) gradeSnapshot[ourKey as string] = price;
    }
    if (result.raw > 0) gradeSnapshot["raw"] = result.raw;
    void writePriceHistorySnapshot(cacheKey, gradeSnapshot);
  }

  return result;
}

// ── Sanity checks on newly fetched PokeTrace prices ───────────────────────
// Runs async / fire-and-forget. Auto-creates a price_flag when prices look
// structurally wrong (grade inversion, extreme ratio, known-bad pattern).
async function checkAndFlagSuspiciousPrices(
  cacheKey: string,
  cardName: string,
  setName: string,
  cardNumber: string | null,
  result: EbayAllGrades
): Promise<void> {
  try {
    const issues: string[] = [];

    // Rule 1: PSA10 should never be less than PSA9 (when both > 0)
    if (result.psa10 > 0 && result.psa9 > 0 && result.psa10 < result.psa9) {
      issues.push(`PSA10 ($${result.psa10}) is LOWER than PSA9 ($${result.psa9}) — grade inversion`);
    }

    // Rule 2: Adjacent grade ratio > 8x is suspicious (e.g. PSA10 $9,500 vs PSA9 $800)
    if (result.psa10 > 0 && result.psa9 > 0 && result.psa10 / result.psa9 > 8) {
      issues.push(`PSA10/PSA9 ratio is ${(result.psa10 / result.psa9).toFixed(1)}x — possible data contamination (PSA10 $${result.psa10}, PSA9 $${result.psa9})`);
    }

    // Rule 3: PSA10 exactly equal to PSA9 when both > $50 — PokeTrace sometimes
    //         returns the same avg for all grades when the underlying data is wrong
    if (result.psa10 > 50 && result.psa9 > 50 && result.psa10 === result.psa9) {
      issues.push(`PSA10 and PSA9 are identical ($${result.psa10}) — likely a data quality issue`);
    }

    // Rule 4: Raw price > PSA9 (not impossible but very unusual for sealed graded cards)
    if (result.raw > 0 && result.psa9 > 0 && result.raw > result.psa9 * 1.5) {
      issues.push(`Raw price ($${result.raw}) is higher than PSA9 ($${result.psa9}) — unusual`);
    }

    // Rule 5: Check against known corrections — if this card has been corrected before
    //         and the new price is wildly different, auto-flag for review
    const knownCorrection = await db.query(
      `SELECT new_prices FROM corrections_log
       WHERE cache_key = $1 AND new_prices IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [cacheKey]
    );
    if (knownCorrection.rows.length > 0) {
      const knownNew = knownCorrection.rows[0].new_prices;
      const knownP10 = knownNew?.psa10 ?? 0;
      if (knownP10 > 0 && result.psa10 > 0 && Math.abs(result.psa10 - knownP10) / knownP10 > 0.6) {
        issues.push(`Price differs by ${Math.round(Math.abs(result.psa10 - knownP10) / knownP10 * 100)}% from a previous manual correction (was $${knownP10}, now $${result.psa10}) — may have regressed`);
      }
    }

    if (issues.length === 0) return;

    // Check if a pending/needs_admin flag already exists for this card
    const existing = await db.query(
      `SELECT id FROM price_flags
       WHERE card_name = $1 AND status IN ('pending', 'needs_admin', 'ai_processing')
       LIMIT 1`,
      [cardName]
    );
    if (existing.rows.length > 0) return; // Don't duplicate

    const issueText = issues.join("; ");
    console.log(`[sanity-check] Auto-flagging "${cacheKey}": ${issueText}`);

    await db.query(
      `INSERT INTO price_flags
         (card_name, set_name, card_number, company, flagged_grades, flagged_values,
          user_note, status)
       VALUES ($1, $2, $3, 'PSA', $4, $5, $6, 'pending')`,
      [
        cardName,
        setName,
        cardNumber,
        JSON.stringify(["PSA10", "PSA9"]),
        JSON.stringify({ PSA10: result.psa10, PSA9: result.psa9 }),
        `[Auto-detected] ${issueText}`,
      ]
    );

    void logCorrection({
      cacheKey,
      cardName,
      setName,
      cardNumber,
      oldPrices: { psa10: result.psa10, psa9: result.psa9, raw: result.raw },
      correctionMethod: "sanity_flag",
      aiReasoning: issueText,
    });
  } catch (e: any) {
    console.error("[sanity-check] Error:", e.message);
  }
}

// ── Japanese raw price (PokeTrace EU / Cardmarket NM price) ───────────────────
// Returns the Near-Mint EUR price for a card from the EU market (Cardmarket).
// Cache key is prefixed "jp-raw:" to avoid collisions with US eBay cache.
const JP_RAW_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h
interface JpRawPrice {
  priceEUR: number;
  avg7dEUR: number | null;
  avg30dEUR: number | null;
  saleCount: number | null;
  imageUrl: string | null;
  fetchedAt: number;
}
const jpRawPriceCache = new Map<string, JpRawPrice>();

async function fetchJpRawPrice(
  cardName: string,
  setName: string,
  cardNumber?: string
): Promise<JpRawPrice> {
  const baseNum   = cardNumber ? cardNumber.split("/")[0].trim() : "";
  const cacheKey  = `jp-raw:${[cardName, baseNum].filter(Boolean).join(" ")}`;

  const memHit = jpRawPriceCache.get(cacheKey);
  if (memHit && Date.now() - memHit.fetchedAt < JP_RAW_CACHE_TTL) return memHit;

  // L2: DB cache
  let stale: JpRawPrice | null = null;
  try {
    const dbRes = await db.query<{ data: JpRawPrice; fetched_ms: string }>(
      `SELECT data, EXTRACT(EPOCH FROM fetched_at) * 1000 AS fetched_ms
         FROM ebay_price_cache WHERE cache_key = $1`,
      [cacheKey]
    );
    if (dbRes.rows.length > 0) {
      const fa = parseFloat(dbRes.rows[0].fetched_ms);
      if (Date.now() - fa < JP_RAW_CACHE_TTL) {
        const r = { ...dbRes.rows[0].data, fetchedAt: fa };
        jpRawPriceCache.set(cacheKey, r);
        return r;
      }
      stale = { ...dbRes.rows[0].data, fetchedAt: parseFloat(dbRes.rows[0].fetched_ms) };
    }
  } catch { /* fall through */ }

  const apiKey = process.env.POKETRACE_API_KEY;
  const empty: JpRawPrice = { priceEUR: 0, avg7dEUR: null, avg30dEUR: null, saleCount: null, imageUrl: null, fetchedAt: Date.now() };
  if (!apiKey) return stale ?? empty;

  const searchQuery = [cardName, baseNum].filter(Boolean).join(" ");
  const url = `https://api.poketrace.com/v1/cards?search=${encodeURIComponent(searchQuery)}&market=EU&limit=10`;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normSet = normalize(setName);

  let ptCard: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(15000) });
      if (resp.status === 429) {
        const wait = Math.min(parseInt(resp.headers.get("retry-after") || "10", 10) * 1000, 30_000);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!resp.ok) throw new Error(`PokeTrace EU HTTP ${resp.status}`);
      const data = await resp.json() as any;
      const cards: any[] = data?.data || [];
      const setMatches = (c: any) => {
        const n = normalize(c.set?.name || "");
        return n === normSet || n.includes(normSet) || normSet.includes(n);
      };
      const numMatches = (c: any) =>
        baseNum && (c.cardNumber?.startsWith(baseNum + "/") || c.cardNumber === baseNum);
      ptCard =
        cards.find(c => numMatches(c) && setMatches(c)) ||
        cards.find(c => numMatches(c)) ||
        cards.find(c => setMatches(c)) ||
        null;
      break;
    } catch (e: any) {
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }

  const nm  = ptCard?.prices?.cardmarket_unsold?.NEAR_MINT;
  const agg = ptCard?.prices?.cardmarket?.AGGREGATED;
  const result: JpRawPrice = {
    priceEUR:   nm?.avg    && nm.avg > 0    ? Math.round(nm.avg * 100) / 100 : 0,
    avg7dEUR:   agg?.avg7d  && agg.avg7d > 0 ? Math.round(agg.avg7d * 100) / 100 : null,
    avg30dEUR:  agg?.avg30d && agg.avg30d > 0 ? Math.round(agg.avg30d * 100) / 100 : null,
    saleCount:  nm?.saleCount ?? null,
    imageUrl:   ptCard?.image ?? null,
    fetchedAt:  Date.now(),
  };

  console.log(`[jp-raw] ${cardName} (${setName}) → €${result.priceEUR} NM | ${ptCard ? "matched" : "no match"}`);

  if (result.priceEUR > 0) {
    jpRawPriceCache.set(cacheKey, result);
    const { fetchedAt: _fa, ...dbData } = result;
    db.query(
      `INSERT INTO ebay_price_cache (cache_key, data, fetched_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET data = $2, fetched_at = NOW()`,
      [cacheKey, JSON.stringify(dbData)]
    ).catch(e => console.error("[jp-raw-cache] DB write failed:", e.message));
  }

  return result.priceEUR > 0 ? result : (stale ?? empty);
}

async function fetchAndCacheSets(): Promise<void> {
  try {
    console.log(`[set-cache] Fetching all sets from Pokemon TCG API...`);
    const resp = await fetch(
      "https://api.pokemontcg.io/v2/sets?select=id,name,series,printedTotal,total,ptcgoCode,releaseDate,images&pageSize=250&orderBy=releaseDate",
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
      logo: s.images?.logo || "",
      symbol: s.images?.symbol || "",
    }));
    setsLastFetched = Date.now();
    console.log(`[set-cache] Cached ${cachedSets.length} sets`);
    mergeApiSetsIntoLookup(cachedSets);
    // Pre-warm image cache in background (non-blocking)
    const imageUrls = cachedSets.flatMap(s => [s.logo, s.symbol]).filter(Boolean) as string[];
    prewarmSetImages(imageUrls).catch(() => {});
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

const KNOWN_SET_TOTALS: Record<number, string[]> = {
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
  264: ["Fusion Strike"],
};

function crossCheckSetByCardNumber(aiSetName: string, cardNumber: string, logPrefix: string): string {
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
    const alreadyCorrect = knownSets.some(s => s.toLowerCase().replace(/[^a-z0-9]/g, "") === normAiName);
    if (alreadyCorrect) return aiSetName;
  }

  if (aiSet) {
    console.log(`${logPrefix} Set cross-check MISMATCH: AI said "${aiSetName}" (${aiSet.printedTotal} cards) but card number says /${denominator}`);
  } else if (knownSets) {
    const aiInKnown = knownSets.some(s => s.toLowerCase().replace(/[^a-z0-9]/g, "") === normAiName);
    if (!aiInKnown) {
      console.log(`${logPrefix} Set cross-check MISMATCH: AI said "${aiSetName}" but /${denominator} maps to ${knownSets.join(" or ")}`);
    }
  }

  const candidates = cachedSets.length > 0 ? findSetsByTotal(denominator) : [];
  if (candidates.length === 1) {
    console.log(`${logPrefix} Set cross-check corrected: "${aiSetName}" → "${candidates[0].name}" (matches /${denominator})`);
    return candidates[0].name;
  } else if (candidates.length > 1) {
    const close = candidates.find(c => {
      const normC = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return normC.includes(normAiName) || normAiName.includes(normC);
    });
    if (close) {
      console.log(`${logPrefix} Set cross-check corrected: "${aiSetName}" → "${close.name}" (partial match + /${denominator})`);
      return close.name;
    }
  }

  if (knownSets && knownSets.length === 1) {
    console.log(`${logPrefix} Set cross-check corrected (hardcoded): "${aiSetName}" → "${knownSets[0]}" (matches /${denominator})`);
    return knownSets[0];
  } else if (knownSets && knownSets.length > 1) {
    const close = knownSets.find(s => {
      const normS = s.toLowerCase().replace(/[^a-z0-9]/g, "");
      return normS.includes(normAiName) || normAiName.includes(normS);
    });
    if (close) {
      console.log(`${logPrefix} Set cross-check corrected (hardcoded): "${aiSetName}" → "${close}" (partial match + /${denominator})`);
      return close;
    }
    console.log(`${logPrefix} Set cross-check found ${knownSets.length} candidates for /${denominator}: ${knownSets.join(", ")}`);
  }

  return aiSetName;
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

function buildGradingSystemPrompt(): string {
  return GRADING_PROMPT_TEMPLATE
    .replace("{{SET_REFERENCE}}", getCurrentSetReference())
    .replace("{{SYMBOL_REFERENCE}}", generateSymbolReferenceForPrompt());
}

const GRADING_PROMPT_TEMPLATE = `You are an expert Pokemon card grading analyst with deep knowledge of card grading standards from PSA, Beckett (BGS), Ace Grading, TAG Grading, and CGC Cards. You will analyze images of a Pokemon card (front and back) and provide estimated grades based on each company's published grading criteria.

IMPORTANT GRADING SCALE RULES - YOU MUST FOLLOW THESE EXACTLY:

**PSA (Professional Sports Authenticator) - Scale 1-10, NO 9.5:**
- PSA uses HALF GRADES from 1.5 to 8.5 (e.g., 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10)
- There is NO PSA 9.5. The top grades are PSA 9 (Mint) and PSA 10 (Gem Mint) ONLY.
- PSA does NOT provide individual sub-grades, only an overall grade. The final grade is determined by the weakest category.
- CENTERING THRESHOLDS (front / back) — updated 2025:
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
- Fully automated grading using computer vision and Photometric Stereoscopic Imaging — no human subjectivity.
- CENTERING THRESHOLDS for TCG/Pokemon cards (front / back) — TAG has SEPARATE thresholds for Pristine vs Gem Mint:
  * TAG Pristine 10: Front 51/49, Back 52/48. TAG is the STRICTEST on centering for TCG cards.
  * TAG Gem Mint 10: Front 60/40, Back 75/25.
  * TAG 9 (Mint): Front 60/40, Back 75/25 (same as Gem Mint 10 — distinguished by other attributes).
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
- CGC offers OPTIONAL sub-grades (Centering, Corners, Edges, Surface) — automatically included with Pristine 10 grades. For our grading estimates, we provide text descriptions per category since sub-grades are not always shown.
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
1. Centering - Measure how well centered the card image is on both front and back. You MUST report actual measured values — do not default to 50. Here is how to measure:
   - Look at the LEFT and RIGHT borders on the front. If the left border is visibly wider than the right, frontLeftRight > 50. If perfectly equal, frontLeftRight = 50. If the right is wider, still report the larger side.
   - Repeat for TOP and BOTTOM borders (frontTopBottom), and both axes on the back.
   - Report the LARGER side's percentage (e.g., if left border is slightly wider: frontLeftRight = 53 means 53/47 left-to-right).
   - IMPORTANT: Only report 50 if the borders appear TRULY IDENTICAL. Most cards have some off-centering. If one border is even marginally wider, report 51 or higher. A card that looks "pretty well centered" to the eye is typically 52-56, not 50. Perfect 50/50 is extremely rare.
   - Scale: 50 = perfect, 52-55 = very slight off-center, 55-65 = noticeable off-center, 70+ = significant off-center, 80+ = severely off-center.
2. Corners - check all four corners for whitening, dings, or damage. Minor imperfections only visible under magnification should not significantly lower grades.
3. Edges - look for whitening, chipping, or rough cuts along all edges. Factory-level minor edge variation is acceptable for high grades.
4. Surface - Examine the card surface for scratches, scuffs, print lines, staining, ink issues, or other surface defects:
   - The ARTWORK AREA: Look for scratches, scuffs, or wear marks across the Pokemon illustration.
   - The HOLOGRAPHIC/FOIL areas: Scratches show up as white or silvery lines. However, NORMAL holographic rainbow patterns, foil texture, and print grain are NOT defects — these are standard features of holographic, full-art, illustration rare, and textured cards.
   - The BACK of the card: Check the Pokeball area and blue border for scratches, whitening, or scuffing.
   - Only count surface issues that represent ACTUAL PHYSICAL DAMAGE (scratches, dents, scuffs, creases) — not normal card manufacturing features.
   - A card with clearly visible scratches that catch light differently from the surrounding surface should be graded accordingly. Multiple distinct scratches on the artwork = surface 5-7 depending on severity.
   - Minor factory print texture common to modern Pokemon cards is NORMAL and should not lower surface grades. Standard factory edge cuts with very slight whitening visible only under enhancement are also NORMAL.

DEFECT MAPPING — For any flaw you identify that causes a sub-grade to drop below 10, report its approximate location on the card image as a "defect" entry. Each defect should include:
- "side": "front" or "back" — which side of the card the defect is on
- "x": 0-100 — horizontal position as a percentage of card width (0=left edge, 100=right edge)
- "y": 0-100 — vertical position as a percentage of card height (0=top edge, 100=bottom edge)
- "type": "corner", "edge", or "surface"
- "severity": "minor" (9→8 level), "moderate" (8→7 level), or "major" (below 7)
- "description": Brief description of the specific flaw (e.g., "Slight whitening on corner", "Minor edge chipping", "Light surface scratch")
Corner positions: top-left≈(5,5), top-right≈(95,5), bottom-left≈(5,95), bottom-right≈(95,95).
Edge positions: top edge≈y:2, bottom edge≈y:98, left edge≈x:2, right edge≈x:98.
Only report defects for REAL flaws that lower grades — do NOT report defects for sub-grades that remain at 10. If a card is perfect (all 10s), the defects array should be empty.

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
- READ the actual set code printed on the card near the card number. This is the SHORT ALPHANUMERIC CODE like "s8b", "sv2a", "PFL", "SV5K", "CRZ", etc.
- The set code is your PRIMARY source of truth for identifying the set. Do NOT guess the set from the Pokemon name, artwork, or your training data.
- Report the set code EXACTLY as printed (e.g., "PFL", "PFLen", "s8b", "sv2a", "SV5K", "CRZ").
- IMPORTANT: Do NOT rely on your training data for set names — your knowledge may be outdated or wrong. Use ONLY the set code mapping below.
- CRITICAL: The card number's denominator (the number after "/") tells you the set size. Use this to VERIFY your set identification:
  * If card says 160/159, the set has 159 cards — look for sets with ~159 cards (e.g., Crown Zenith = 159 cards, NOT "151" which has 165 cards)
  * If card says 006/197, the set has 197 cards — look for sets with ~197 cards (e.g., Obsidian Flames)
  * "151" is ONLY the name of the set with code "MEW" / "sv2a" — do NOT use "151" as a set name unless the set code is MEW/sv2a
- COMMON MISTAKE: Do NOT confuse Crown Zenith (CRZ, 159 cards, Sword & Shield era, yellow border) with 151 (MEW, 165 cards, Scarlet & Violet era). These are completely different sets.
- For OLDER CARDS (WOTC era through Scarlet & Violet era) that may not have a clearly readable set code, identify the set by the SET SYMBOL (the small icon near the card number) combined with the card number range and card design/border style.
- Use this COMPREHENSIVE symbol-to-set mapping for cards without clearly readable set codes:

{{SYMBOL_REFERENCE}}

- Use this COMPREHENSIVE set code mapping to determine the set name:

{{SET_REFERENCE}}

- If the set code is not in the mapping above, still report the exact set code — do NOT invent a set name.
- Consider the card's era (vintage WOTC, modern Scarlet & Violet, Mega Evolution, etc.) based on card design/border style
- NEVER call a set "Phantom Forces" — the correct name for the PFL/PFLen set is "Phantasmal Flames". The XY-era set with code PHF is "Phantom Forces" — these are DIFFERENT sets.

Step 4: REPORT WHAT YOU READ
- The set code and card number you READ from the card are the source of truth.
- Do NOT substitute a different set code or card number based on your knowledge.
- Secret rares have numbers ABOVE the set total (e.g., "125/094") — this is normal, do NOT "fix" it.
- If the set code is "PFLen", report "PFLen" — do NOT change it to "EVO" or any other code.
- If you cannot read a digit clearly, note the uncertainty but report your best reading.

Step 5: FINAL DETERMINATION
- Combine: Pokemon name (from text + artwork) + card number (as read) + set code (as read)
- Report the verified cardName, setName, and setNumber in the JSON response.

Step 5b: IDENTIFY CARD VARIANT
Look at the FRONT of the card and determine which areas have holographic foil (rainbow shimmer):
- "holo": The ARTWORK/ILLUSTRATION inside the card frame shines with rainbow foil. The outer border is plain. Includes: standard Holo Rare, Full Art Trainer, Illustration Rare, Special Illustration Rare, Secret Rare, Rainbow Rare, Gold card.
- "reverseHolo": ONLY the BORDER, FRAME, or BACKGROUND of the card has rainbow foil — the artwork area itself is flat/plain. Any common, uncommon, or rare can come as a Reverse Holo.
- "normal": No holographic foil anywhere on the card. Fully flat finish with no rainbow shimmer.
NOTE: Foil appears in photos as bright iridescent or rainbow-colored areas. If the card is inside a graded slab and difficult to read, use "holo" for any card with Rare rarity, and "normal" for Common/Uncommon.

Step 6: CARD BOUNDS MEASUREMENT
Estimate the card boundary in BOTH the outer edges (physical card edge) AND the inner artwork boundary (where the printed border ends and the artwork begins). Report these for both front and back images.
- OUTER bounds (leftPercent/topPercent/rightPercent/bottomPercent): the physical card edge (white/colored card border). If the card fills most of the image, leftPercent ≈ 3-8% and rightPercent ≈ 92-97%.
- INNER bounds (innerLeftPercent/innerTopPercent/innerRightPercent/innerBottomPercent): where the card's printed border/frame ends and the main artwork area begins. These must be strictly INSIDE the outer bounds.
  - Art Rare / Full Art / Secret Rare cards: very thin border (~1-4% of card width per side)
  - Standard Pokemon cards: border ~5-10% of card width per side; top/bottom borders slightly larger
- The card width-to-height ratio should be approximately 0.714 (2.5 inches wide × 3.5 inches tall).
- Do NOT report outer values close to 0/100 unless the card literally touches the image edge.

Respond ONLY with valid JSON in this exact format:
{
  "cardName": "ENGLISH name of the Pokemon card (e.g. 'Charizard ex') - translate if card is in another language",
  "setCode": "The set code EXACTLY as printed on the card (e.g. 'PFLen', 's8b', 'sv2a', 'OBF'). READ THIS FROM THE CARD.",
  "setName": "ENGLISH name of the set derived from the set code (e.g. PFLen = 'Phantasmal Flames', s8b = 'VMAX Climax')",
  "setNumber": "Card number exactly as printed at the bottom of the card (e.g. '012/220')",
  "cardVariant": "holo | reverseHolo | normal — holo if the illustration/artwork shines with rainbow foil; reverseHolo if ONLY the border/frame has rainbow foil (artwork is plain); normal if no foil anywhere",
  "overallCondition": "Brief 1-2 sentence summary of the card's overall condition",
  "frontCardBounds": { "leftPercent": 5, "topPercent": 3, "rightPercent": 95, "bottomPercent": 97, "innerLeftPercent": 9, "innerTopPercent": 9, "innerRightPercent": 91, "innerBottomPercent": 91 },
  "backCardBounds": { "leftPercent": 5, "topPercent": 3, "rightPercent": 95, "bottomPercent": 97, "innerLeftPercent": 9, "innerTopPercent": 9, "innerRightPercent": 91, "innerBottomPercent": 91 },
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

GRADING PHILOSOPHY — POLARISED GRADING (FAVOUR 10 OR GRADE HONESTLY LOW):
- EVERY sub-grade (centering, corners, edges, surface) starts at 10 (Gem Mint) by default.
- If you CANNOT see any specific flaw in a category, KEEP IT AT 10. Do not hedge with 9 "just in case." Clean cards deserve 10s — that is the whole point of grading. Users need to trust that a 10 means the card is worth submitting.
- However, when you DO see a real flaw, grade it HONESTLY and do NOT be generous. Real flaws should pull grades down meaningfully — do not cluster everything in the 8-9 range. A card with clear visible damage should receive grades of 7, 6, or even 5 and below where warranted.
- You are grading from PHONE PHOTOS, not lab-quality scans. Phone cameras can introduce blur, glare, and compression artifacts. However, if you can see a flaw in the photo, it is almost certainly a real flaw — grade it accordingly. Do NOT dismiss visible scratches, whitening, or wear as "photo artifacts."

DEFECT COUNTING — THIS IS CRITICAL:
- Each INDIVIDUAL scratch is a SEPARATE defect. If you see 3 scratch lines on the front surface, that is 3 surface defects, NOT 1. Do NOT group multiple scratches as "some scratches" = 1 defect.
- Each INDIVIDUAL corner with whitening is a SEPARATE defect. 4 corners with whitening = 4 corner defects.
- Front and back flaws in the same category are SEPARATE defects. Scratches on the front AND scratches on the back = multiple surface defects (count them individually).
- Warped, bent, or misshapen edges indicate CREASING or BENDING — this is serious structural damage that affects BOTH edges AND surface grades. A warped/misshapen edge is NOT just "edge roughness" — it is evidence of physical damage to the card.

FRONT ARTWORK DAMAGE — HEAVILY PENALISED:
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
  * 4: Heavy damage — corners bent or heavily dinged, edges severely chipped or warped, surface with creases or major scratches across the artwork
  * 3 or below: Severe damage — card has been heavily played, major creases, bends, tears, water damage, or extensive wear across the entire surface

BACK VS FRONT DEFECT WEIGHTING — CRITICAL:
- Minor back-corner whitening is EXTREMELY COMMON, even on pack-fresh modern cards, because factory cutting naturally leaves slight marks on the back. Light whitening on 2-3 back corners that requires close inspection to see is a 9-level flaw, NOT an 8 or 7. Many real PSA 9 and BGS 9 cards have minor whitening on multiple back corners.
- FRONT corner or edge whitening is much more impactful than back-only whitening. Front-visible whitening should be graded more strictly.
- Back surface scratches that are only "faintly visible" or require close inspection are VERY minor — a couple of faint back scratches alone should not drop surface below 9.
- Reserve grades of 8 and below for flaws that are clearly visible at normal viewing distance or that appear on the FRONT of the card.

- KEY PRINCIPLE: The grade range should be WIDE. A clean card = 10. A card with minor back-only flaws = 9. A card with one clearly visible flaw or front-visible issues = 8. A card with multiple visible flaws across categories = 6-7. A card with scratches on front AND back, edge whitening/warping, AND corner wear = 4-5. A heavily played/damaged card = 3 or below. Do NOT compress everything into 7-9. Cards with damage across 3+ categories are NEVER 8s.

COMPANY-SPECIFIC DEFECT TOLERANCE — Each company has different strictness levels. Apply the generic guide above, then ADJUST for each company:

**PSA Defect Tolerance (weakest-link system):**
- PSA grades by the WEAKEST category — one bad area drags the whole grade down.
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
- Ace uses WHOLE NUMBERS only, so a card that BGS would give 8.5 gets Ace 8 — Ace rounds down.
- Ace 10: Four undamaged sharp corners, sharp edges with no whitening/chipping/kinks, beautiful surface with no marks/stains/damage. Very minor factory defects allowed ONLY if they don't detract from eye appeal.
- Ace 9: Nearly identical to 10. May have ONE minor imperfection in ONE category (corners, edges, or surface). One very minor flaw only.
- Ace 8: Few minor imperfections such as slight whitening. Can be across corners, edges, surface, or a combination. Small amount of damage on all four rear corners is an 8-level flaw.
- Ace 7: More noticeable damage. More visible whitening on corners/edges/surfaces. May include perceptible printing defects. Slight wear more visible than an 8.
- Ace 6: More noticeable damage or printing defects. Multiple areas of whitening on corners or edges. Edges may not be sharp.
- Ace 5: More visible print defects and damage. Corners may be misshapen. Whitening/fraying on edges more noticeable. Scratches may obstruct artwork or text.
- CAPPING: Overall grade can NEVER be more than 1 above the lowest sub-grade. E.g., Edges 7 = maximum overall Ace 8.

**TAG Grading Defect Tolerance (AI-automated, strictest on surface):**
- TAG uses "DINGS" (Defects Identified of Notable Grade Significance) — they focus on defects that meaningfully affect the grade, not every microscopic flaw.
- TAG Pristine 10: Only "Non-Human Observable Defects" (NHODs) allowed — flaws so tiny that only high-resolution imaging can detect them. Virtually flawless in every category.
- TAG Gem Mint 10: Very minor defects under high-res imaging. 4 sharp corners with minor fill/fray artifacts. Very minor surface wear, tiny pit or light scratch that does NOT penetrate gloss.
- TAG 9: Sharp & square corners, up to 2 very light front touches, multiple back touches. Minor fill/fray on edges visible under hi-res. Very minor surface wear, small pits, light scratches (NO gloss penetration on front). Back can have small scratch penetrating gloss. Multiple print lines, minor scuffing allowed.
- TAG 8.5: Multiple light front corner touches, missing stock on back corners. More significant edge fill/fray artifacts. Deeper pits, scratches penetrating gloss on back, print lines, minor scuffing.
- TAG 8: Corners may start showing minor wear. Visible edge wear/light chipping on multiple edges. Multiple surface defects, print lines, very minor scuffing.
- TAG 7: Corners losing sharpness, all 4 may have touches/fraying. Edges may chip & fray. Very minor dents visible, multiple print lines, focus imperfections.
- TAG is the STRICTEST company on SURFACE. A surface scratch that PSA or BGS might grade 8 could be a TAG 7-7.5. TAG's automated imaging catches every flaw.

**CGC Cards Defect Tolerance (strict on whitening/silvering):**
- CGC is notably STRICT on silvering/whitening on coloured borders — even tiny whitening on blue/coloured borders can drop from 10 to 9. This is their hallmark strictness area.
- CGC Pristine 10: Virtually flawless. No defects visible under 5x magnification. Perfect centering, perfect corners, perfect edges, flawless surface.
- CGC Gem Mint 10: Free of wear and white spots on corners/edges. Perfect gloss, no print spots. One criterion may fall very slightly short of Pristine.
- CGC 9.5: Very minor imperfections only. Slight minor printing defects on surface, or very minor white spots on edges/corners. Nearly indistinguishable from 10.
- CGC 9: ONE small imperfection allowed — slight minor wear on edges and corners, OR very minor surface scratches, OR slightly off-centre print. Corners mint to naked eye but slight imperfections under magnification.
- CGC 8.5: Slight wear on some edges and corners. Minor surface blemishes may be visible. Only one minor flaw.
- CGC 8: Minor wear or printing defects. Surface may have slight scratches and white spots. Wear on edges/corners visible upon closer inspection. Most original border colours and gloss retained.
- CGC 7: Slightly visible wear on some edges and corners. Print pattern may be fuzzy. Retains most original colour and gloss.
- CGC WHITENING RULES: Tiny amount of whitening on coloured borders = often drops to 9. Whitening on 2+ corners = typically caps at 8 or 8.5. Considerable whitening = 7 or lower.
- CGC SCRATCH RULES: Minor surface scratch on holo = 9 instead of 10. Light scratches visible on close inspection = grade 7-8. Obvious scratches = 6 or lower.

OVERALL GRADE COMPOUNDING — Each company calculates overall grades DIFFERENTLY:

**PSA Overall (weakest-link):**
- PSA overall is determined by the WEAKEST category. One bad area drags everything down.
- PSA overall is CAPPED by the WEAKEST category minus 0.5 to 1. If the worst sub-grade equivalent is a 6, PSA overall should be 5-5.5. If the worst is 7, PSA overall should be 6-6.5.
- If flaws span 2+ categories (e.g., corners + edges), PSA overall should be 6 or lower. If flaws span 3+ categories, PSA should be 4-5 or lower.
- Example: A card with edges showing whitening on multiple sides + corners with rounding + surface scratches = PSA 4-5 maximum.

**BGS Overall (weighted average, capped by lowest):**
- BGS AVERAGES the four sub-grades but the lowest sub-grade caps the overall. BGS can legitimately be 0.5-1.5 HIGHER than PSA for the same card.
- Example: Centering 9.5, Corners 8, Edges 9.5, Surface 9.5 → BGS overall could be 9 (the strong categories pull it up). PSA for the same card would be 8 or lower (corners cap it).
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
- CGC is also strict on holo/foil surface scratches — faint scratches on holo that PSA might allow at 9 could drop CGC to 8.5.

FLAW DETECTION CHECKLIST — Examine each area systematically:
- CORNERS: Zoom in on each of the four corners individually. Look for whitening (white dots or lines where the color has worn away), soft/rounded edges instead of sharp points, dings, or bends. Compare front corners to back corners — the back often shows more wear. ANY whitening on a corner means that corner is NOT a 10 or 9. Even light rounding = 7-8 max for corners.
- EDGES: Trace along ALL four edges of both front and back. Look for whitening along the edge line, chipping (small pieces of the card surface lifting), nicks, or roughness. The LEFT and RIGHT edges of the back are the most common places for edge wear. A single edge with whitening along its length = edges grade 7 maximum, NOT 8. Whitening on 2+ edges = 6 or lower.
- SURFACE — FRONT: Examine the entire artwork area. Look for scratches (faint lines running across the surface), scuffs (hazy areas where gloss is lost), print lines (straight lines from the printing process), staining, or indentations. Tilt-angle photos reveal scratches that catch light — any scratch visible in the angled photo is a REAL surface defect.
- SURFACE — BACK: The back Pokeball area and blue border are highly prone to scratches and scuffing. Examine the white Pokeball surface for scratch lines running across it — these are extremely common and often missed. Look for scuffing on the blue border areas. Back surface scratches should lower the surface grade just as much as front scratches.

CONSISTENCY CHECK — Before finalizing your grades, verify:
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
   - Warped edges ALSO affect surface grade — a bent card has structural damage, so surface should drop by at least 1 additional grade.
   - Edge whitening along a full edge = edges grade 6-7 maximum. Whitening on multiple edges = 5-6 or lower.
4. If you identified corner whitening on 2+ corners, corners grade should be 7 or lower for BGS/Ace, 6-7 for PSA equivalent. All four corners with whitening = 5-6.
5. COMPANY RELATIONSHIP CHECK — the grades across companies must make sense relative to each other for the SAME card:
   - PSA should be the LOWEST or tied for lowest overall (weakest-link is harshest).
   - BGS overall can be 0.5-1.5 HIGHER than PSA (averaging helps when only one category is weak).
   - Ace should be within 1 grade of PSA (both penalise the weakest area, but Ace uses whole numbers so may round down).
   - TAG should be EQUAL TO or LOWER than BGS, especially if surface has flaws (TAG is strictest on surface).
   - CGC should be similar to BGS (within 0.5-1 grade). CGC may be lower if the card has whitening on coloured borders or holo scratches.
   - If you gave PSA 5, BGS should be 5-6.5. Ace should be 5-6. TAG should be 5-6. CGC should be 5-6.5.
   - If you gave PSA 9, BGS could be 9-9.5. Ace should be 8-9. TAG should be 8.5-9. CGC should be 8.5-9.5.
6. CROSS-CHECK — MANDATORY CATEGORY SPREAD CHECK:
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

- When in doubt between two grades for ANY damage, lean toward the LOWER grade — defects always look less severe in photos than in person. Real-world graders would be stricter.
- Do not speculatively lower grades without evidence, but do grade honestly and strictly when real flaws are visible.
- REMEMBER: Most cards submitted for grading do NOT get 8+. If you are finding multiple visible flaws, the card is likely a 4-6 card, not a 7-8 card. An 8 is a NEAR-MINT card with only one minor issue. A card with flaws visible without close inspection is NOT near-mint.`;

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

async function queryPokemonTcgApi(q: string, includePrices = false): Promise<any[]> {
  try {
    const fields = includePrices ? "name,set,number,rarity,tcgplayer" : "name,set,number";
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=15&select=${fields}`;
    console.log(`[card-lookup] Querying: ${q}`);
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
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

async function optimizeImageForAI(dataUri: string, maxDim: number = 2048): Promise<string> {
  try {
    const mimeMatch = dataUri.match(/^data:(image\/[^;]+);base64,/);
    const mime = (mimeMatch?.[1] || "").toLowerCase();
    const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, "");
    let buffer = Buffer.from(base64Data, "base64");

    const isHeif = mime.includes("heic") || mime.includes("heif") ||
      (buffer.length > 12 && buffer.toString("ascii", 4, 12).includes("ftyp"));

    if (isHeif) {
      console.log(`[optimize] Converting HEIF/HEIC image (${Math.round(buffer.length / 1024)}KB) to JPEG`);
      let heifConverted = false;
      try {
        buffer = Buffer.from(await sharp(buffer).jpeg({ quality: 90 }).toBuffer());
        heifConverted = true;
      } catch {
        console.log(`[optimize] Sharp HEIF failed, trying heif-convert CLI...`);
      }
      if (!heifConverted) {
        try {
          buffer = Buffer.from(await convertHeifToJpeg(buffer));
          heifConverted = true;
        } catch (cliErr) {
          console.error(`[optimize] heif-convert CLI also failed:`, cliErr);
        }
      }
      if (!heifConverted) {
        throw new Error("HEIC_UNSUPPORTED: Could not convert HEIC/HEIF image. Please ensure your app is up to date, or select a JPEG photo.");
      }
    }

    const meta = await sharp(buffer).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (w <= maxDim && h <= maxDim && meta.format === "jpeg" && !isHeif) {
      const enhanced = await sharp(buffer)
        .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 })
        .modulate({ brightness: 1.02 })
        .linear(1.15, -(128 * 0.15))
        .jpeg({ quality: 92 })
        .toBuffer();
      return `data:image/jpeg;base64,${enhanced.toString("base64")}`;
    }
    let pipeline = sharp(buffer);
    if (w > maxDim || h > maxDim) {
      pipeline = pipeline.resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true });
    }
    pipeline = pipeline
      .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 })
      .modulate({ brightness: 1.02 })
      .linear(1.15, -(128 * 0.15));
    const optimized = await pipeline.jpeg({ quality: 92 }).toBuffer();
    return `data:image/jpeg;base64,${optimized.toString("base64")}`;
  } catch (err) {
    console.error("[optimize] Image optimization failed:", err);
    return dataUri;
  }
}

async function enhanceForSurfaceDetection(dataUri: string): Promise<string> {
  try {
    const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const enhanced = await sharp(buffer)
      .sharpen({ sigma: 1.8, m1: 2.0, m2: 1.0 })
      .modulate({ brightness: 1.03 })
      .linear(1.2, -(128 * 0.2))
      .jpeg({ quality: 92 })
      .toBuffer();
    return `data:image/jpeg;base64,${enhanced.toString("base64")}`;
  } catch (err) {
    console.error("[enhance-surface] Surface enhancement failed:", err);
    return dataUri;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAHE GRADING ENHANCEMENT FLAG
// Set to `true` to send multi-filter CLAHE images to the AI for deeper defect
// detection (edge whitening, corner curvature, surface scratches).
// Set to `false` to revert to the previous sharpen-only 4-image pipeline.
// ─────────────────────────────────────────────────────────────────────────────
const CLAHE_GRADING_ENABLED = true;

interface CLAHEFilterSet {
  colourClahe: string;   // Colour CLAHE — local contrast boost; preserves holo colour
  laplacianEdge: string; // Laplacian edge detection — corner chips, edge whitening
  emboss: string;        // Emboss relief — surface scratches, corner curvature
}

async function generateCLAHEFilters(dataUri: string): Promise<CLAHEFilterSet> {
  const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  const [colourClaheBuf, laplacianEdgeBuf, embossBuf] = await Promise.all([
    // 1. Colour CLAHE — adaptive histogram equalisation per colour channel.
    //    Reveals edge whitening and micro-scratches while keeping holographic
    //    rainbow colours distinct from actual damage (scratches are grey/silver;
    //    holo patterns remain multi-coloured).
    sharp(buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .clahe({ width: 32, height: 32, maxSlope: 3 })
      .sharpen({ sigma: 0.6 })
      .jpeg({ quality: 88 })
      .toBuffer(),

    // 2. Greyscale Laplacian edge detection — shows every edge, chip, nick, and
    //    crack as a bright highlight. Best for catching corner whitening and edge
    //    chipping that are invisible in the standard image.
    sharp(buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .greyscale()
      .clahe({ width: 48, height: 48, maxSlope: 5 })
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
        scale: 1,
        offset: 0,
      })
      .normalise()
      .linear(2.2, 0)
      .jpeg({ quality: 88 })
      .toBuffer(),

    // 3. Emboss surface relief — converts card surface into a pseudo-3D height-
    //    map. Physical scratches, corner bends, and dents appear as raised or
    //    sunken ridges. Most effective for detecting surface wear and curvature.
    sharp(buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .greyscale()
      .clahe({ width: 48, height: 48, maxSlope: 6 })
      .convolve({
        width: 3,
        height: 3,
        kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
        scale: 1,
        offset: 128,
      })
      .normalise()
      .linear(1.6, -30)
      .jpeg({ quality: 88 })
      .toBuffer(),
  ]);

  return {
    colourClahe: `data:image/jpeg;base64,${colourClaheBuf.toString("base64")}`,
    laplacianEdge: `data:image/jpeg;base64,${laplacianEdgeBuf.toString("base64")}`,
    emboss: `data:image/jpeg;base64,${embossBuf.toString("base64")}`,
  };
}

async function generateCornerCrops(dataUri: string): Promise<string[]> {
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
    { left: w - cropW, top: h - cropH, width: cropW, height: cropH },
  ];

  const crops = await Promise.all(
    corners.map(async (region) => {
      const cropped = await sharp(buffer)
        .extract(region)
        .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 })
        .jpeg({ quality: 92 })
        .toBuffer();
      return `data:image/jpeg;base64,${cropped.toString("base64")}`;
    })
  );

  return crops;
}

async function assessImageQuality(dataUri: string): Promise<{
  blurScore: number;
  brightnessScore: number;
  isAcceptable: boolean;
  warnings: string[];
}> {
  const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const warnings: string[] = [];

  const originalStats = await sharp(buffer).greyscale().stats();
  const brightnessScore = originalStats.channels[0].mean;

  const originalSharpened = await sharp(buffer)
    .greyscale()
    .sharpen({ sigma: 2.0, m1: 2.0, m2: 1.0 })
    .toBuffer();
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
  yConstraint?: { minPct: number; maxPct: number },
  slabMode?: boolean
): { leftPct: number; rightPct: number; topPct: number; bottomPct: number; angleDeg: number; confidence: number } {
  const CARD_WH_RATIO = 2.5 / 3.5;
  const CARD_WH_RATIO_ROTATED = 3.5 / 2.5;
  const SLAB_WH_RATIO = 0.76;
  const SLAB_WH_RATIO_ROTATED = 1 / 0.76;
  const RATIO_TOLERANCE = slabMode ? 0.30 : 0.12;

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

      const ratiosToTry = slabMode
        ? [CARD_WH_RATIO, SLAB_WH_RATIO, CARD_WH_RATIO_ROTATED, SLAB_WH_RATIO_ROTATED]
        : [CARD_WH_RATIO, CARD_WH_RATIO_ROTATED];

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
          const extUniformityWeight = slabMode ? 2.0 : 4.0;
          const totalScore = (ratioScore * 4.0 + sizeScore * 3.0 + edgeNorm * 1.0 + normalizedContrast * 2.5 + minContrastScore * 1.5 + exteriorUniformity * extUniformityWeight) * edgeProximityPenalty * rotatedPenalty;

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
    const fallbackRatios = slabMode
      ? [CARD_WH_RATIO, SLAB_WH_RATIO, CARD_WH_RATIO_ROTATED, SLAB_WH_RATIO_ROTATED]
      : [CARD_WH_RATIO, CARD_WH_RATIO_ROTATED];
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

    const validAngles: number[] = [];
    if (Math.abs(leftAngle) < 8) validAngles.push(leftAngle);
    if (Math.abs(rightAngle) < 8) validAngles.push(rightAngle);
    if (Math.abs(topAngle) < 8) validAngles.push(topAngle);
    if (Math.abs(bottomAngle) < 8) validAngles.push(bottomAngle);

    if (validAngles.length >= 2) {
      validAngles.sort((a, b) => a - b);
      const trimmed = validAngles.length >= 4
        ? validAngles.slice(1, -1)
        : validAngles;
      angleDeg = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
    } else if (validAngles.length === 1) {
      angleDeg = validAngles[0];
    }

    console.log(`[detect-angle] L=${leftAngle.toFixed(2)} R=${rightAngle.toFixed(2)} T=${topAngle.toFixed(2)} B=${bottomAngle.toFixed(2)} → combined=${angleDeg.toFixed(2)}°`);
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

async function detectCardBounds(dataUri: string, slabMode?: boolean): Promise<{ leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; angleDeg?: number; confidence?: number; innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number }> {
  const cacheKey = (slabMode ? "slab:" : "") + dataUri.slice(dataUri.length - 64);
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
      .clahe({ width: 20, height: 20, maxSlope: 4 })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const varianceHint = detectCardRegionByVariance(coarsePixels as any, csw, csh);
    const coarse = detectBoundsAtResolution(coarsePixels as any, csw, csh, 0.4, 0.12, undefined, undefined, slabMode);

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
      .clahe({ width: 64, height: 64, maxSlope: 4 })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const REFINE_BAND = slabMode ? 25 : 15;
    const fine = detectBoundsAtResolution(
      finePixels as any, fsw, fsh, 0.4, 0.15,
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

function isValidCardBounds(bounds: any): boolean {
  if (!bounds) return false;
  const { leftPercent, topPercent, rightPercent, bottomPercent } = bounds;
  if (typeof leftPercent !== "number" || typeof rightPercent !== "number" ||
      typeof topPercent !== "number" || typeof bottomPercent !== "number") return false;
  const w = rightPercent - leftPercent;
  const h = bottomPercent - topPercent;
  if (w < 30 || h < 30) return false;
  if (w > 94 || h > 94) return false;
  if (leftPercent < 1 || topPercent < 1) return false;
  if (rightPercent > 99 || bottomPercent > 99) return false;
  return true;
}

function computeCenteringGrades(centering: any) {
  const frontWorst = Math.max(centering.frontLeftRight, centering.frontTopBottom);
  const backWorst = Math.max(centering.backLeftRight, centering.backTopBottom);

  let psaCentering: number;
  if (frontWorst <= 55 && backWorst <= 75) psaCentering = 10;
  else if (frontWorst <= 62 && backWorst <= 85) psaCentering = 9;
  else if (frontWorst <= 67 && backWorst <= 90) psaCentering = 8;
  else if (frontWorst <= 72 && backWorst <= 90) psaCentering = 7;
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

    if (result.ace.overallGrade === 10) {
      const otherGrades = [result.ace.corners.grade, result.ace.edges.grade, result.ace.surface.grade];
      const tensCount = otherGrades.filter((g: number) => g === 10).length;
      const ninesCount = otherGrades.filter((g: number) => g === 9).length;
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
    const tagAvg = tagGrades.reduce((a: number, b: number) => a + b, 0) / 4;
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

    const aceSubGrades = ["centering", "corners", "edges", "surface"]
      .map(k => result.ace[k]?.grade)
      .filter((g): g is number => g !== undefined && g !== null);
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

      const meetsAce10 =
        centering === 10 && tensCount >= 2 && ninesCount <= 1;

      if (!meetsAce10) {
        result.ace.overallGrade = 9;
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

    const tagCentering = result.tag.centering?.grade;
    const tagCorners = result.tag.corners?.grade;
    const tagEdges = result.tag.edges?.grade;
    const tagSurface = result.tag.surface?.grade;
    const tagSubGrades = [tagCentering, tagCorners, tagEdges, tagSurface].filter((g): g is number => typeof g === "number");
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

// ── Startup repair: fix any card_catalog / top_picks rows with blank set_name ─
async function repairEmptySetNames(): Promise<void> {
  // Hardcoded corrections for sets that historically ended up with blank names
  const SET_NAME_MAP: Record<string, string> = {
    swsh2:  "Rebel Clash",
    base3:  "Fossil",
    dpp:    "DP Black Star Promos",
  };
  try {
    for (const [setId, setName] of Object.entries(SET_NAME_MAP)) {
      const { rowCount: cc } = await db.query(
        `UPDATE card_catalog SET set_name = $1 WHERE set_id = $2 AND (set_name IS NULL OR set_name = '')`,
        [setName, setId]
      );
      if ((cc ?? 0) > 0) console.log(`[repair] Fixed ${cc} card_catalog rows for ${setId} → "${setName}"`);
      const { rowCount: tp } = await db.query(
        `UPDATE top_picks_precomputed SET set_name = $1 WHERE set_id = $2 AND (set_name IS NULL OR set_name = '')`,
        [setName, setId]
      );
      if ((tp ?? 0) > 0) console.log(`[repair] Fixed ${tp} top_picks_precomputed rows for ${setId} → "${setName}"`);
    }
  } catch (e: any) {
    console.warn("[repair] repairEmptySetNames failed:", e.message);
  }
}

async function initUsageTrackingTable(): Promise<void> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS usage_tracking (
        id              SERIAL PRIMARY KEY,
        rc_user_id      VARCHAR NOT NULL,
        year_month      VARCHAR NOT NULL,
        quick_count     INTEGER NOT NULL DEFAULT 0,
        deep_count      INTEGER NOT NULL DEFAULT 0,
        crossover_count INTEGER NOT NULL DEFAULT 0,
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT usage_tracking_user_month_unique UNIQUE (rc_user_id, year_month)
      )
    `);
    console.log("[usage] usage_tracking table ready");
  } catch (e: any) {
    console.error("[usage] Failed to init usage_tracking:", e.message);
  }
}

async function initAdminUsersTable(): Promise<void> {
  const SEEDED_ADMIN_IDS: Array<{ rcUserId: string; note: string }> = [
    { rcUserId: "$RCAnonymousID:4257e3bd35f1455a827f8d965e21434a", note: "Marcus iOS" },
    { rcUserId: "$RCAnonymousID:6fcbd255d306411a8c77772ac9cb9c60", note: "Marcus Android" },
  ];
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        rc_user_id VARCHAR PRIMARY KEY,
        note       TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    for (const admin of SEEDED_ADMIN_IDS) {
      await db.query(
        `INSERT INTO admin_users (rc_user_id, note) VALUES ($1, $2) ON CONFLICT (rc_user_id) DO NOTHING`,
        [admin.rcUserId, admin.note]
      );
    }
    console.log("[admin] admin_users table ready and seeded");
  } catch (e: any) {
    console.error("[admin] Failed to init admin_users:", e.message);
  }
}

async function initGradingHistoryTable(): Promise<void> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS grading_history (
        id            SERIAL PRIMARY KEY,
        rc_user_id    VARCHAR NOT NULL,
        local_id      VARCHAR NOT NULL,
        result_json   JSONB NOT NULL,
        timestamp     BIGINT NOT NULL,
        is_deep_grade BOOLEAN NOT NULL DEFAULT FALSE,
        is_crossover  BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT grading_history_user_local_unique UNIQUE (rc_user_id, local_id)
      )
    `);
    console.log("[history] grading_history table ready");
  } catch (e: any) {
    console.error("[history] Failed to init grading_history:", e.message);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Ensure DB tables exist before any requests come in
  await initUsageTrackingTable();
  await initAdminUsersTable();
  await initGradingHistoryTable();
  await initEbayPriceCacheTable();
  await initPriceHistoryTable();
  await initSetPriceStatusTable();
  await initCardCatalogTable();
  await initTopPicksPrecomputedTable();
  await initGradingFeedbackTable();
  // Non-blocking: repair any rows that historically ended up with blank set names
  void repairEmptySetNames();

  // Pre-fetch today's exchange rates on startup (non-blocking)
  void getExchangeRates();

  // Expose live exchange rates to the frontend
  app.get("/api/exchange-rates", async (_req, res) => {
    try {
      const data = await getExchangeRates();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Anonymous grading feedback (thumbs up / down + optional comment)
  app.post("/api/grading-feedback", async (req, res) => {
    try {
      const { cardName, setName, setNumber, gradePsa, isPositive, comment } = req.body ?? {};
      if (typeof isPositive !== "boolean") {
        return res.status(400).json({ error: "isPositive (boolean) is required" });
      }
      await db.query(
        `INSERT INTO grading_feedback (card_name, set_name, set_number, grade_psa, is_positive, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          cardName ?? null,
          setName ?? null,
          setNumber ?? null,
          gradePsa != null ? Number(gradePsa) : null,
          isPositive,
          comment ?? null,
        ]
      );
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[grading-feedback] Error:", err.message);
      return res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  // ── Price flag: user reports a suspicious eBay price ───────────────────
  app.post("/api/price-flags", async (req, res) => {
    try {
      const { cardName, setName, setCode, cardNumber, cardLang, company, flaggedGrades, flaggedValues, userNote } = req.body ?? {};
      if (!cardName || !company || !Array.isArray(flaggedGrades) || flaggedGrades.length === 0) {
        return res.status(400).json({ error: "cardName, company and flaggedGrades are required" });
      }
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO price_flags (card_name, set_name, set_code, card_number, card_lang, company, flagged_grades, flagged_values, user_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          cardName,
          setName ?? null,
          setCode ?? null,
          cardNumber ?? null,
          cardLang ?? "en",
          company,
          JSON.stringify(flaggedGrades),
          JSON.stringify(flaggedValues ?? {}),
          userNote ?? null,
        ]
      );
      const flagId = rows[0].id;
      // Kick off background AI analysis (fire-and-forget)
      analyzePriceFlag(flagId).catch(e => console.error("[price-flags] Background analysis error:", e.message));
      return res.json({ ok: true, id: flagId });
    } catch (err: any) {
      console.error("[price-flags] POST error:", err.message);
      return res.status(500).json({ error: "Failed to save price flag" });
    }
  });

  // ── Price flags admin: count of flags needing review (lightweight) ────
  app.get("/api/admin/price-flags/count", async (_req, res) => {
    try {
      const { rows } = await db.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM price_flags WHERE status = 'needs_admin'`
      );
      return res.json({ needsReview: parseInt(rows[0]?.cnt ?? "0", 10) });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to count flags" });
    }
  });

  app.get("/api/admin/price-flags", async (req, res) => {
    try {
      const { status } = req.query;
      let whereClause: string;
      let params: any[] = [];
      if (status === "all") {
        whereClause = "";
      } else if (status === "completed") {
        whereClause = `WHERE pf.status IN ('resolved', 'no_fix')`;
      } else if (status && status !== "needs_admin") {
        whereClause = `WHERE pf.status = $1`;
        params = [status];
      } else {
        whereClause = `WHERE pf.status = 'needs_admin'`;
      }
      const { rows } = await db.query(
        `SELECT pf.id, pf.card_name, pf.set_name, pf.set_code, pf.card_number, pf.card_lang,
                pf.company, pf.flagged_grades, pf.flagged_values, pf.user_note, pf.status,
                pf.ai_analysis, pf.admin_response, pf.corrected_search, pf.clean_search_term,
                pf.correction_applied, pf.resolution_method, pf.created_at, pf.resolved_at,
                pf.suggested_prices, pf.suggested_card,
                cc.image_url AS card_image_url
         FROM price_flags pf
         LEFT JOIN LATERAL (
           SELECT image_url FROM card_catalog
           WHERE LOWER(name) = LOWER(pf.card_name)
             AND lang = COALESCE(pf.card_lang, 'en')
           ORDER BY
             CASE WHEN pf.set_code IS NOT NULL AND set_id = pf.set_code THEN 0 ELSE 1 END,
             CASE WHEN pf.card_number IS NOT NULL
                   AND number = SPLIT_PART(pf.card_number, '/', 1) THEN 0 ELSE 1 END
           LIMIT 1
         ) cc ON true
         ${whereClause}
         ORDER BY pf.created_at DESC
         LIMIT 100`,
        params
      );
      return res.json({ flags: rows });
    } catch (err: any) {
      console.error("[price-flags] GET admin error:", err.message);
      return res.status(500).json({ error: "Failed to fetch price flags" });
    }
  });

  // ── Price flags admin: manual resolve ─────────────────────────────────
  app.post("/api/admin/price-flags/:id/resolve", async (req, res) => {
    try {
      const flagId = parseInt(req.params.id, 10);
      const { outcome } = req.body ?? {}; // "resolved" | "no_fix"
      const finalStatus = outcome === "no_fix" ? "no_fix" : "resolved";
      await db.query(
        `UPDATE price_flags
         SET status = $1, resolution_method = 'admin', resolved_at = NOW()
         WHERE id = $2`,
        [finalStatus, flagId]
      );
      return res.json({ ok: true, status: finalStatus });
    } catch (err: any) {
      console.error("[price-flags] resolve error:", err.message);
      return res.status(500).json({ error: "Failed to resolve flag" });
    }
  });

  // ── Price flags admin: apply Claude's suggested fix now ───────────────
  app.post("/api/admin/price-flags/:id/apply-fix", async (req, res) => {
    try {
      const flagId = parseInt(req.params.id, 10);
      let { rows } = await db.query(
        `SELECT card_name, card_number, clean_search_term, suggested_prices, suggested_card FROM price_flags WHERE id = $1`,
        [flagId]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Flag not found" });
      let flag = rows[0];

      let fixed = false;

      // If admin confirmed a price preview, apply those stored prices directly (no re-analysis needed)
      if (flag.suggested_prices) {
        try {
          const suggestedData: Record<string, number> = typeof flag.suggested_prices === "string"
            ? JSON.parse(flag.suggested_prices)
            : flag.suggested_prices;
          const baseNum = flag.card_number ? flag.card_number.split("/")[0].trim() : "";
          const originalCacheKey = [flag.card_name, baseNum].filter(Boolean).join(" ");

          const result: EbayAllGrades = {
            psa10: 0, psa9: 0, psa8: 0, psa7: 0,
            bgs10: 0, bgs95: 0, bgs9: 0, bgs85: 0, bgs8: 0,
            ace10: 0, ace9: 0, ace8: 0,
            tag10: 0, tag9: 0, tag8: 0,
            cgc10: 0, cgc95: 0, cgc9: 0, cgc8: 0,
            raw: 0,
            gradeDetails: {},
            fetchedAt: Date.now(),
            ...suggestedData,
          };

          ebayPriceCache.set(originalCacheKey, result);
          const { fetchedAt: _fa, isStale: _is, gradeDetails: _gd, ...dbData } = result;
          await db.query(
            `INSERT INTO ebay_price_cache (cache_key, data, fetched_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (cache_key) DO UPDATE SET data = $2, fetched_at = NOW()`,
            [originalCacheKey, JSON.stringify({ ...dbData, gradeDetails: {} })]
          );
          console.log(`[price-flags] apply-fix #${flagId} — applied suggested_prices for "${originalCacheKey}" | PSA10 $${result.psa10}`);
          fixed = true;
        } catch (parseErr: any) {
          console.error(`[price-flags] apply-fix #${flagId} — failed to parse suggested_prices:`, parseErr.message);
        }
      }

      // Fallback: use clean_search_term to re-query PokeTrace if no suggested_prices
      if (!fixed) {
        if (!flag.clean_search_term) {
          console.log(`[price-flags] apply-fix #${flagId} — no clean_search_term, re-analysing first`);
          await analyzePriceFlag(flagId).catch(() => {});
          const refreshed = await db.query(
            `SELECT card_name, card_number, clean_search_term, status FROM price_flags WHERE id = $1`,
            [flagId]
          );
          flag = refreshed.rows[0] ?? flag;
        }

        if (!flag.clean_search_term) {
          return res.status(422).json({ error: "Claude could not determine a clean search term for this flag" });
        }

        fixed = await autoApplyPriceFix(flagId, flag.card_name, flag.card_number, flag.clean_search_term);
      }

      const newStatus = fixed ? "resolved" : "no_fix";

      // Fetch flag details for the corrections log
      const flagForLog = await db.query(
        `SELECT card_name, set_name, card_number, card_lang, flagged_values, clean_search_term, ai_analysis FROM price_flags WHERE id = $1`,
        [flagId]
      );
      const fl = flagForLog.rows[0];

      if (fixed && fl) {
        // Get the new prices that were just written to cache
        const cacheKeyForLog = [fl.card_name, fl.card_number ? fl.card_number.split("/")[0].trim() : ""]
          .filter(Boolean).join(" ");
        const newCacheRow = await db.query<{ data: any }>(
          `SELECT data FROM ebay_price_cache WHERE cache_key = $1`, [cacheKeyForLog]
        ).catch(() => ({ rows: [] as any[] }));
        const nd = newCacheRow.rows[0]?.data ?? {};
        void logCorrection({
          flagId,
          cacheKey: cacheKeyForLog,
          cardName: fl.card_name,
          setName: fl.set_name,
          cardNumber: fl.card_number,
          cardLang: fl.card_lang,
          oldPrices: fl.flagged_values ? { psa10: fl.flagged_values.psa10 ?? 0, psa9: fl.flagged_values.psa9 ?? 0 } : null,
          newPrices: { psa10: nd.psa10 ?? 0, psa9: nd.psa9 ?? 0, raw: nd.raw ?? 0 },
          correctionMethod: "admin_applied",
          searchTermUsed: fl.clean_search_term,
          aiReasoning: fl.ai_analysis,
        });
      }

      await db.query(
        `UPDATE price_flags
         SET status = $1, correction_applied = $2, resolution_method = 'admin_applied',
             resolved_at = NOW()
         WHERE id = $3`,
        [newStatus, fixed, flagId]
      );
      return res.json({ ok: true, status: newStatus, fixed });
    } catch (err: any) {
      console.error("[price-flags] apply-fix error:", err.message);
      return res.status(500).json({ error: "Failed to apply fix" });
    }
  });

  // ── Price flags admin: manual price override ──────────────────────────
  // Admin enters correct USD prices directly — writes to cache, marks resolved.
  app.post("/api/admin/price-flags/:id/manual-prices", async (req, res) => {
    try {
      const flagId = parseInt(req.params.id, 10);
      const { prices } = req.body ?? {}; // e.g. { psa10: 380, psa9: 220, psa8: 120, raw: 60 }
      if (!prices || typeof prices !== "object") {
        return res.status(400).json({ error: "prices object is required" });
      }

      const { rows } = await db.query(
        `SELECT card_name, card_number FROM price_flags WHERE id = $1`, [flagId]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Flag not found" });
      const flag = rows[0];

      const baseNum = flag.card_number ? flag.card_number.split("/")[0].trim() : "";
      const cacheKey = [flag.card_name, baseNum].filter(Boolean).join(" ");

      const numPrice = (v: any): number => {
        const n = parseFloat(String(v));
        return isNaN(n) || n < 0 ? 0 : Math.round(n * 100) / 100;
      };

      const result: EbayAllGrades = {
        psa10: numPrice(prices.psa10), psa9: numPrice(prices.psa9),
        psa8: numPrice(prices.psa8), psa7: numPrice(prices.psa7),
        bgs10: numPrice(prices.bgs10), bgs95: numPrice(prices.bgs95),
        bgs9: numPrice(prices.bgs9), bgs85: numPrice(prices.bgs85),
        bgs8: numPrice(prices.bgs8),
        ace10: numPrice(prices.ace10), ace9: numPrice(prices.ace9), ace8: numPrice(prices.ace8),
        tag10: numPrice(prices.tag10), tag9: numPrice(prices.tag9), tag8: numPrice(prices.tag8),
        cgc10: numPrice(prices.cgc10), cgc95: numPrice(prices.cgc95),
        cgc9: numPrice(prices.cgc9), cgc8: numPrice(prices.cgc8),
        raw: numPrice(prices.raw),
        gradeDetails: {},
        fetchedAt: Date.now(),
      };

      const hasData = result.psa10 > 0 || result.psa9 > 0 || result.bgs95 > 0 || result.raw > 0;
      if (!hasData) {
        return res.status(400).json({ error: "At least one non-zero price is required" });
      }

      ebayPriceCache.set(cacheKey, result);
      const { fetchedAt: _fa, isStale: _is, gradeDetails: _gd, ...dbData } = result;
      await db.query(
        `INSERT INTO ebay_price_cache (cache_key, data, fetched_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (cache_key) DO UPDATE SET data = $2, fetched_at = NOW()`,
        [cacheKey, JSON.stringify({ ...dbData, gradeDetails: {} })]
      );

      // Fetch old prices + flag metadata for corrections log
      const oldCacheRow = await db.query<{ data: any }>(
        `SELECT data FROM ebay_price_cache WHERE cache_key = $1`, [cacheKey]
      ).catch(() => ({ rows: [] as any[] }));
      const oldD = oldCacheRow.rows[0]?.data ?? {};
      const flagMeta = await db.query(
        `SELECT set_name, card_number, card_lang, user_note FROM price_flags WHERE id = $1`, [flagId]
      ).catch(() => ({ rows: [] as any[] }));
      const fm = flagMeta.rows[0] ?? {};

      await db.query(
        `UPDATE price_flags
         SET status = 'resolved', correction_applied = true,
             resolution_method = 'manual_prices', resolved_at = NOW()
         WHERE id = $1`,
        [flagId]
      );

      void logCorrection({
        flagId,
        cacheKey,
        cardName: flag.card_name,
        setName: fm.set_name,
        cardNumber: fm.card_number,
        cardLang: fm.card_lang,
        oldPrices: { psa10: oldD.psa10 ?? 0, psa9: oldD.psa9 ?? 0, raw: oldD.raw ?? 0 },
        newPrices: { psa10: result.psa10, psa9: result.psa9, psa8: result.psa8, psa7: result.psa7, raw: result.raw },
        correctionMethod: "manual_prices",
        adminNote: fm.user_note,
      });

      console.log(`[price-flags] Manual prices applied for flag #${flagId} — key "${cacheKey}" | PSA10 $${result.psa10}`);
      return res.json({ ok: true, cacheKey, psa10: result.psa10 });
    } catch (err: any) {
      console.error("[price-flags] manual-prices error:", err.message);
      return res.status(500).json({ error: "Failed to apply manual prices" });
    }
  });

  // ── Proactive cache scanner — Claude reviews all cached prices ──────────
  // Fetches all ebay_price_cache entries, batches them to Claude with the
  // corrections history as context, and auto-creates flags for suspicious ones.
  app.post("/api/admin/scan-cache", async (req, res) => {
    try {
      // Fetch all cache entries
      const { rows: cacheRows } = await db.query<{
        cache_key: string; data: any;
      }>(`SELECT cache_key, data FROM ebay_price_cache ORDER BY fetched_at DESC`);

      if (cacheRows.length === 0) {
        return res.json({ scanned: 0, flagged: 0, flags: [] });
      }

      // Get existing pending/needs_admin flags to avoid duplicating
      const { rows: existingFlags } = await db.query<{ card_name: string }>(
        `SELECT card_name FROM price_flags WHERE status IN ('pending', 'needs_admin', 'ai_processing')`
      );
      const existingFlaggedNames = new Set(existingFlags.map((r: any) => r.card_name.toLowerCase()));

      // Get corrections context for Claude
      const correctionsContext = await getCorrectionsContext(80);

      // Filter out JP-raw cache entries and already-flagged cards
      const candidates = cacheRows.filter(r => {
        if (r.cache_key.startsWith("jp-raw:")) return false;
        const cardName = r.cache_key.split(" ").slice(0, -1).join(" ") || r.cache_key;
        if (existingFlaggedNames.has(cardName.toLowerCase())) return false;
        const d = r.data;
        // Must have at least PSA10 or PSA9 > 0 to be worth scanning
        return (d.psa10 > 0 || d.psa9 > 0);
      });

      // Apply structural sanity pre-filter to avoid wasting Claude calls on obvious issues
      // (they'll have been auto-flagged by checkAndFlagSuspiciousPrices already)
      const needsClaudeReview = candidates.filter(r => {
        const d = r.data;
        const p10 = d.psa10 ?? 0;
        const p9 = d.psa9 ?? 0;
        // Skip if structurally fine AND cheap (< $200 PSA10 is low risk)
        return !(p10 < p9) && !(p10 === p9 && p10 > 50) && !(p10 / p9 > 8 && p10 > 0 && p9 > 0);
      });

      // Process in batches of 25 cards
      const BATCH_SIZE = 25;
      const batches: typeof needsClaudeReview[] = [];
      for (let i = 0; i < needsClaudeReview.length; i += BATCH_SIZE) {
        batches.push(needsClaudeReview.slice(i, i + BATCH_SIZE));
      }

      const flaggedResults: { cacheKey: string; reason: string; severity: string }[] = [];

      for (const batch of batches) {
        const cardList = batch.map(r => {
          const d = r.data;
          return `${r.cache_key} | PSA10: $${d.psa10 ?? 0} | PSA9: $${d.psa9 ?? 0} | PSA8: $${d.psa8 ?? 0} | Raw: $${d.raw ?? 0}`;
        }).join("\n");

        const scanPrompt = `You are a Pokemon TCG card price intelligence expert with deep knowledge of card values across all sets, eras, and printings.

Review these eBay sold price cache entries and identify any with suspicious or incorrect prices. The MOST COMMON cause of wrong prices in this system is PokeTrace returning data for the WRONG PRINTING — the same card name exists in multiple sets or with special variants that have very different values. Key patterns to spot:

1. WRONG SET / REPRINT: A card name that exists across multiple sets (e.g. Base Set, Base Set 2, Legendary Collection all share many card names). The cache may have the expensive original when the app is tracking the cheap reprint, or vice versa.
2. SPECIAL STAMP CONFUSION: 1st Edition vs Unlimited, Shadowless vs Shadowed, Promo stamps (STAFF, PRERELEASE, WINNER), Pokémon Center stamps, Build & Battle stamps. These dramatically affect value.
3. HOLO vs NON-HOLO CONFUSION: Prices are way too high for what would be a common non-holo card, suggesting holo data bled in.
4. IMPOSSIBLE GRADE RATIOS: PSA10 price is less than PSA9, or two grades are identical, or ratio between adjacent grades is unrealistic (>8x is suspicious).
5. IMPLAUSIBLE VALUE FOR THE CARD: You know Pokemon card values — a common Base Set card shouldn't be $5,000 PSA10 unless it's a very specific variant.${correctionsContext}

CACHE ENTRIES TO REVIEW:
${cardList}

Return a JSON array of ONLY the suspicious entries. Each entry:
{
  "cacheKey": "exact cache key from the list",
  "reason": "concise explanation of which pattern applies and why the price looks wrong",
  "severity": "high|medium|low"
}

Return [] if all prices look reasonable. Only flag genuine data quality concerns — not cards that are legitimately expensive.`;

        try {
          const aiResp = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            messages: [{ role: "user", content: scanPrompt }],
          });
          const aiText = (aiResp.content[0] as Anthropic.TextBlock)?.text ?? "";
          const arrMatch = aiText.match(/\[[\s\S]*\]/);
          if (!arrMatch) continue;
          const suspicious: { cacheKey: string; reason: string; severity: string }[] = JSON.parse(arrMatch[0]);
          flaggedResults.push(...suspicious.filter(s => s.cacheKey && s.reason));
        } catch (e: any) {
          console.error("[scan-cache] Batch AI call failed:", e.message);
        }
      }

      // Create price_flags for each suspicious entry
      let created = 0;
      for (const item of flaggedResults) {
        try {
          const cacheRow = cacheRows.find(r => r.cache_key === item.cacheKey);
          if (!cacheRow) continue;
          const d = cacheRow.data;

          // Parse card name + number from cache key (format: "CardName NUM")
          const parts = item.cacheKey.split(" ");
          const lastPart = parts[parts.length - 1];
          const hasNumber = /^\d+$/.test(lastPart);
          const cardName = hasNumber ? parts.slice(0, -1).join(" ") : item.cacheKey;
          const cardNumber = hasNumber ? lastPart : null;

          // Check not already flagged
          const dup = await db.query(
            `SELECT id FROM price_flags WHERE card_name = $1 AND status IN ('pending','needs_admin','ai_processing') LIMIT 1`,
            [cardName]
          );
          if (dup.rows.length > 0) continue;

          await db.query(
            `INSERT INTO price_flags
               (card_name, card_number, company, flagged_grades, flagged_values, user_note, status)
             VALUES ($1, $2, 'PSA', $3, $4, $5, 'pending')`,
            [
              cardName,
              cardNumber,
              JSON.stringify(["PSA10", "PSA9"]),
              JSON.stringify({ PSA10: d.psa10 ?? 0, PSA9: d.psa9 ?? 0 }),
              `[Cache scan · ${item.severity}] ${item.reason}`,
            ]
          );
          created++;

          void logCorrection({
            cacheKey: item.cacheKey,
            cardName,
            cardNumber,
            oldPrices: { psa10: d.psa10 ?? 0, psa9: d.psa9 ?? 0, raw: d.raw ?? 0 },
            correctionMethod: "sanity_flag",
            aiReasoning: item.reason,
          });
        } catch (e: any) {
          console.error("[scan-cache] Failed to create flag:", e.message);
        }
      }

      console.log(`[scan-cache] Scanned ${candidates.length} cards (${batches.length} Claude batches) — flagged ${created} new issues`);
      return res.json({
        scanned: candidates.length,
        claudeReviewed: needsClaudeReview.length,
        flagged: created,
        flags: flaggedResults,
      });
    } catch (err: any) {
      console.error("[scan-cache] Error:", err.message);
      return res.status(500).json({ error: "Cache scan failed" });
    }
  });

  // ── Price flags admin: submit admin response → re-trigger AI ──────────
  app.post("/api/admin/price-flags/:id/respond", async (req, res) => {
    try {
      const flagId = parseInt(req.params.id, 10);
      const { adminResponse } = req.body ?? {};
      if (!adminResponse) return res.status(400).json({ error: "adminResponse is required" });

      await db.query(
        `UPDATE price_flags SET admin_response = $1, status = 'ai_processing' WHERE id = $2`,
        [adminResponse, flagId]
      );
      // Re-run AI with admin context in preview mode — stores found prices in suggested_prices for admin confirmation
      analyzePriceFlag(flagId, true).catch(e => console.error("[price-flags] Admin re-analysis error:", e.message));
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[price-flags] admin respond error:", err.message);
      return res.status(500).json({ error: "Failed to process admin response" });
    }
  });

  // ── Card Variants API ──────────────────────────────────────────────────────

  // In-memory set: "cardname|setname|number" keys — avoids repeated TCGdex lookups per session
  const tcgdexCheckedCards = new Set<string>();

  // Maps TCGdex stamp identifiers → display name + PokeTrace keyword
  const STAMP_LABEL_MAP: Record<string, { display: string; keyword: string }> = {
    "set-logo":         { display: "Prerelease Stamp",   keyword: "prerelease" },
    "gym-challenge":    { display: "Gym Challenge",       keyword: "gym challenge" },
    "pre-release":      { display: "Prerelease Stamp",    keyword: "prerelease" },
    "pokemon-center":   { display: "Pokémon Centre",      keyword: "pokemon center" },
    "build-and-battle": { display: "Build & Battle",      keyword: "build battle" },
    "trick-or-trade":   { display: "Trick or Trade",      keyword: "trick or trade" },
    "staff":            { display: "Staff Stamp",          keyword: "prerelease staff" },
    "league":           { display: "League Promo",         keyword: "league promo" },
  };

  // Helper: look up a specific card on TCGdex by set_id + localId, then
  // parse variants_detailed for stamp entries and upsert them into card_variants.
  async function discoverCardVariants(
    cardName: string,
    setName: string | null,
    cardNumber: string | null
  ): Promise<void> {
    if (!cardNumber) return;
    const localId = cardNumber.split("/")[0].trim();

    // Find the TCGdex set_id from our card catalog (set_id = TCGdex set code, e.g. "ex12")
    let setId: string | null = null;
    if (setName) {
      const { rows } = await db.query<{ set_id: string }>(
        `SELECT set_id FROM card_catalog
          WHERE lang = 'en'
            AND LOWER(set_name) ILIKE $1
            AND number = $2
          LIMIT 1`,
        [`%${setName.toLowerCase()}%`, localId]
      );
      setId = rows[0]?.set_id ?? null;
    }

    if (!setId) return;

    // Fetch the individual card from TCGdex
    const cardUrl = `https://api.tcgdex.net/v2/en/sets/${setId}/${localId}`;
    let cardData: any;
    try {
      const resp = await fetch(cardUrl, { signal: AbortSignal.timeout(6000) });
      if (!resp.ok) return;
      cardData = await resp.json();
    } catch (_) { return; }

    const variantsDetailed: Array<{ type: string; size?: string; stamp?: string[] }> =
      cardData.variants_detailed || [];
    const imageUrl: string | null = cardData.image ? `${cardData.image}/high.webp` : null;

    // Collect unique stamp identifiers
    const seenStamps = new Set<string>();
    for (const v of variantsDetailed) {
      if (!v.stamp || v.stamp.length === 0) continue;
      for (const stampId of v.stamp) {
        if (seenStamps.has(stampId)) continue;
        seenStamps.add(stampId);

        const def = STAMP_LABEL_MAP[stampId] ?? { display: stampId, keyword: stampId };

        // Skip if already in DB for this card + set + stamp combination
        const { rows: ex } = await db.query(
          `SELECT id FROM card_variants
            WHERE LOWER(base_card_name) = LOWER($1)
              AND stamp_type = $2
              AND LOWER(COALESCE(base_set_name,'')) = LOWER($3)`,
          [cardName, stampId, setName || ""]
        );
        if (ex.length > 0) continue;

        const searchTerm = [cardName, localId, def.keyword, setName].filter(Boolean).join(" ");
        await db.query(
          `INSERT INTO card_variants
             (base_card_name, base_set_name, base_card_number, stamp_type, display_name, image_url, poketrace_search_term)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [cardName, setName, localId, stampId, def.display, imageUrl, searchTerm]
        );
        console.log(`[card-variants] Auto-discovered "${def.display}" for "${cardName}" (${setName || "?"}) — stamp: ${stampId}`);
      }
    }
  }

  // Public: lookup variants for a card — auto-discovers from TCGdex per-card on first view
  app.get("/api/card-variants", async (req, res) => {
    try {
      const { name, setName, cardNumber } = req.query;
      if (!name) return res.json([]);
      const cardName   = String(name);
      const setNameStr = setName   ? String(setName)   : null;
      const cardNumStr = cardNumber ? String(cardNumber) : null;
      const cacheKey   = `${cardName.toLowerCase()}|${(setNameStr || "").toLowerCase()}|${(cardNumStr || "").toLowerCase()}`;

      const getRows = () =>
        db.query(
          `SELECT id, stamp_type, display_name, image_url, notes, prices_fetched_at, poketrace_search_term
             FROM card_variants
            WHERE LOWER(base_card_name) = LOWER($1)
              AND ($2::text IS NULL OR LOWER(COALESCE(base_set_name,'')) ILIKE '%' || LOWER($2) || '%')
            ORDER BY stamp_type`,
          [cardName, setNameStr]
        ).then(r => r.rows);

      // First view of this card+set combination → query TCGdex, then return
      if (!tcgdexCheckedCards.has(cacheKey)) {
        tcgdexCheckedCards.add(cacheKey);
        await discoverCardVariants(cardName, setNameStr, cardNumStr);
      }

      return res.json(await getRows());
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Public: get (or refresh) eBay prices for a specific variant
  app.get("/api/card-variants/:id/prices", async (req, res) => {
    try {
      const variantId = parseInt(req.params.id, 10);
      if (isNaN(variantId)) return res.status(400).json({ error: "Invalid id" });

      const { rows } = await db.query<{
        id: number; base_card_name: string; base_set_name: string | null;
        base_card_number: string | null; poketrace_search_term: string | null;
        stamp_type: string; cached_prices: any; prices_fetched_at: string | null;
      }>(
        `SELECT id, base_card_name, base_set_name, base_card_number,
                poketrace_search_term, stamp_type, cached_prices, prices_fetched_at
           FROM card_variants WHERE id = $1`,
        [variantId]
      );
      if (!rows[0]) return res.status(404).json({ error: "Variant not found" });
      const v = rows[0];

      const VARIANT_TTL = 12 * 60 * 60 * 1000;
      const isFresh = v.prices_fetched_at &&
        Date.now() - new Date(v.prices_fetched_at).getTime() < VARIANT_TTL;
      if (isFresh && v.cached_prices) return res.json({ ...v.cached_prices, fromVariantCache: true });

      // Fetch fresh from PokeTrace using the variant-specific search term
      const searchTerm = v.poketrace_search_term ||
        [v.base_card_name, v.base_card_number?.split("/")[0]].filter(Boolean).join(" ");
      const apiKey = process.env.POKETRACE_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "POKETRACE_API_KEY not configured" });

      const url = `https://api.poketrace.com/v1/cards?search=${encodeURIComponent(searchTerm)}&market=US&limit=10`;
      const resp = await fetch(url, { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(15000) });
      if (!resp.ok) return res.status(502).json({ error: `PokeTrace HTTP ${resp.status}` });

      const data = await resp.json() as any;
      const cards: any[] = data?.data || [];

      // Match PokeTrace result using stamp-type-specific keywords
      const STAMP_MATCH_KEYWORDS: Record<string, string[]> = {
        "set-logo":         ["prerelease", "stamp"],
        "gym-challenge":    ["gym", "challenge"],
        "pre-release":      ["prerelease"],
        "pokemon-center":   ["center", "centre", "pokemon center"],
        "build-and-battle": ["build", "battle"],
        "trick-or-trade":   ["trick", "trade"],
        "staff":            ["staff"],
        "league":           ["league"],
      };
      const matchWords = STAMP_MATCH_KEYWORDS[v.stamp_type] ?? [v.stamp_type];
      let ptCard = cards.find((c: any) => {
        const text = ((c.variant || "") + " " + (c.name || "")).toLowerCase();
        return matchWords.some(kw => text.includes(kw));
      }) ?? cards[0] ?? null;

      const ebayPrices = ptCard?.prices?.ebay || {};
      const gradeMap: Record<string, string> = {
        PSA_10: "psa10", PSA_9: "psa9", PSA_8: "psa8", PSA_7: "psa7",
        BGS_10: "bgs10", BGS_9_5: "bgs95", BGS_9: "bgs9", BGS_8_5: "bgs85", BGS_8: "bgs8",
        ACE_10: "ace10", ACE_9: "ace9", ACE_8: "ace8",
        TAG_10: "tag10", TAG_9: "tag9", TAG_8: "tag8",
        CGC_10: "cgc10", CGC_9_5: "cgc95", CGC_9: "cgc9", CGC_8: "cgc8",
      };
      const graded: Record<string, number> = {};
      const gradeDetails: Record<string, any> = {};
      for (const [ptKey, ourKey] of Object.entries(gradeMap)) {
        const gd = ebayPrices[ptKey];
        const avg = gd?.avg;
        graded[ourKey] = avg && avg > 0 ? Math.round(avg * 100) / 100 : 0;
        if (gd) gradeDetails[ourKey] = { avg7d: gd.avg7d ?? null, avg30d: gd.avg30d ?? null, low: gd.low ?? null, high: gd.high ?? null, saleCount: gd.saleCount ?? null };
      }
      const rawAvg = ebayPrices["NEAR_MINT"]?.avg;
      const result = {
        psa10: 0, psa9: 0, psa8: 0, psa7: 0,
        bgs10: 0, bgs95: 0, bgs9: 0, bgs85: 0, bgs8: 0,
        ace10: 0, ace9: 0, ace8: 0, tag10: 0, tag9: 0, tag8: 0,
        cgc10: 0, cgc95: 0, cgc9: 0, cgc8: 0,
        raw: rawAvg && rawAvg > 0 ? Math.round(rawAvg * 100) / 100 : 0,
        gradeDetails, fetchedAt: Date.now(), variantName: ptCard?.name, variantField: ptCard?.variant,
        ...graded,
      };

      // Cache in card_variants row
      await db.query(
        `UPDATE card_variants SET cached_prices = $1, prices_fetched_at = NOW() WHERE id = $2`,
        [JSON.stringify(result), variantId]
      );
      console.log(`[card-variants] Fetched prices for variant ${variantId} via "${searchTerm}" → ${ptCard ? `${ptCard.name} (${ptCard.variant})` : "no match"} | PSA10 $${result.psa10}`);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin: list all variants (searchable)
  app.get("/api/admin/card-variants", async (req, res) => {
    try {
      const { search } = req.query;
      const { rows } = await db.query(
        search
          ? `SELECT * FROM card_variants WHERE LOWER(base_card_name) ILIKE $1 OR LOWER(display_name) ILIKE $1 ORDER BY base_card_name, stamp_type LIMIT 200`
          : `SELECT * FROM card_variants ORDER BY base_card_name, stamp_type LIMIT 200`,
        search ? [`%${String(search).toLowerCase()}%`] : []
      );
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin: create a variant
  app.post("/api/admin/card-variants", async (req, res) => {
    try {
      const { base_card_name, base_set_name, base_set_id, base_card_number,
              stamp_type, display_name, image_url, poketrace_search_term, notes } = req.body;
      if (!base_card_name || !stamp_type || !display_name)
        return res.status(400).json({ error: "base_card_name, stamp_type, and display_name are required" });
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO card_variants
           (base_card_name, base_set_name, base_set_id, base_card_number, stamp_type, display_name, image_url, poketrace_search_term, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [base_card_name, base_set_name || null, base_set_id || null, base_card_number || null,
         stamp_type, display_name, image_url || null, poketrace_search_term || null, notes || null]
      );
      return res.json({ id: rows[0].id, ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin: update a variant
  app.patch("/api/admin/card-variants/:id", async (req, res) => {
    try {
      const { display_name, image_url, poketrace_search_term, notes } = req.body;
      await db.query(
        `UPDATE card_variants
            SET display_name          = COALESCE($1, display_name),
                image_url             = COALESCE($2, image_url),
                poketrace_search_term = COALESCE($3, poketrace_search_term),
                notes                 = COALESCE($4, notes),
                cached_prices         = NULL,
                prices_fetched_at     = NULL
          WHERE id = $5`,
        [display_name || null, image_url || null, poketrace_search_term || null, notes || null, req.params.id]
      );
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin: delete a variant
  app.delete("/api/admin/card-variants/:id", async (req, res) => {
    try {
      await db.query(`DELETE FROM card_variants WHERE id = $1`, [req.params.id]);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin: sync from TCGdex stamp endpoints
  app.post("/api/admin/card-variants/sync-tcgdex", async (_req, res) => {
    try {
      const stampTypes = [
        { tcgdex: "pre-release",      display: "Prerelease Stamp", type: "prerelease",       keyword: "prerelease" },
        { tcgdex: "pokemon-center",   display: "Pokémon Centre",   type: "pokemon-center",   keyword: "pokemon center" },
        { tcgdex: "staff",            display: "Staff Stamp",      type: "staff",            keyword: "prerelease staff" },
        { tcgdex: "build-and-battle", display: "Build & Battle",   type: "build-and-battle", keyword: "build battle" },
        { tcgdex: "trick-or-trade",   display: "Trick or Trade",   type: "trick-or-trade",   keyword: "trick or trade" },
      ];
      let added = 0; let skipped = 0;
      for (const st of stampTypes) {
        const resp = await fetch(`https://api.tcgdex.net/v2/en/cards?stamp=${encodeURIComponent(st.tcgdex)}&limit=1000`, {
          signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) continue;
        const cards: any[] = await resp.json();
        for (const card of cards) {
          const name = card.name; if (!name) continue;
          const number = card.localId || null;
          const setName = card.set?.name || null;
          const imageUrl = card.image ? `${card.image}/high.webp` : null;
          const { rows: ex } = await db.query(
            `SELECT id FROM card_variants WHERE LOWER(base_card_name) = LOWER($1) AND stamp_type = $2 AND (base_set_name IS NULL OR LOWER(base_set_name) = LOWER($3))`,
            [name, st.type, setName || ""]
          );
          if (ex.length > 0) { skipped++; continue; }
          const searchTerm = `${name}${number ? " " + number : ""} ${st.keyword}`;
          await db.query(
            `INSERT INTO card_variants (base_card_name, base_set_name, base_card_number, stamp_type, display_name, image_url, poketrace_search_term)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [name, setName, number, st.type, st.display, imageUrl, searchTerm]
          );
          added++;
        }
      }
      return res.json({ ok: true, added, skipped });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── End Card Variants API ──────────────────────────────────────────────────

  // ── Collection Scan API ────────────────────────────────────────────────────

  const CONDITION_MULTIPLIERS: Record<string, number> = {
    "Mint": 1.0,
    "Near Mint": 1.0,
    "Light Played": 0.85,
    "Played": 0.75,
    "Heavy Played": 0.57,
    "Damaged": 0.25,
  };

  const SESSION_CARD_LIMIT = 100;
  const MONTHLY_CARD_LIMIT = 300;

  interface CollectionCard {
    index: number;
    status: "pending" | "processing" | "done" | "failed" | "limit_reached";
    cardName?: string;
    setName?: string;
    cardNumber?: string;
    language?: string;
    condition?: string;
    conditionNotes?: string;
    nmPriceUsd?: number | null;
    conditionPriceUsd?: number | null;
    error?: string;
  }

  interface CollectionJob {
    id: string;
    status: "processing" | "completed" | "failed";
    cards: CollectionCard[];
    totalCards: number;
    completedCards: number;
    createdAt: number;
  }

  const collectionJobs = new Map<string, CollectionJob>();

  // Initialize collection scan tables
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS collection_scan_usage (
        device_id   TEXT NOT NULL,
        month_key   TEXT NOT NULL,
        cards_scanned INT NOT NULL DEFAULT 0,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (device_id, month_key)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS collection_jobs (
        job_id       TEXT PRIMARY KEY,
        device_id    TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'processing',
        total_cards  INT NOT NULL DEFAULT 0,
        cards        JSONB NOT NULL DEFAULT '[]',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_collection_jobs_device ON collection_jobs(device_id, created_at DESC)`);
    console.log("[collection-scan] DB table ready");
  } catch (e: any) {
    console.error("[collection-scan] Failed to create usage table:", e.message);
  }

  async function saveJobToDB(job: CollectionJob, deviceId: string): Promise<void> {
    try {
      await db.query(
        `INSERT INTO collection_jobs (job_id, device_id, status, total_cards, cards, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), NOW())
         ON CONFLICT (job_id)
         DO UPDATE SET status = $3, total_cards = $4, cards = $5, updated_at = NOW()`,
        [job.id, deviceId, job.status, job.totalCards, JSON.stringify(job.cards), job.createdAt]
      );
    } catch (e: any) {
      console.error("[collection-scan] Failed to save job to DB:", e.message);
    }
  }

  async function loadJobFromDB(jobId: string): Promise<CollectionJob | null> {
    try {
      const { rows } = await db.query(
        `SELECT job_id, status, total_cards, cards, EXTRACT(EPOCH FROM created_at)*1000 AS created_ms
         FROM collection_jobs WHERE job_id = $1`,
        [jobId]
      );
      if (!rows[0]) return null;
      const r = rows[0];
      const cards: CollectionCard[] = Array.isArray(r.cards) ? r.cards : JSON.parse(r.cards);
      return {
        id: r.job_id,
        status: r.status,
        cards,
        totalCards: r.total_cards,
        completedCards: cards.filter((c: CollectionCard) => c.status === "done" || c.status === "failed" || c.status === "limit_reached").length,
        createdAt: Math.round(parseFloat(r.created_ms)),
      };
    } catch (e: any) {
      console.error("[collection-scan] Failed to load job from DB:", e.message);
      return null;
    }
  }

  async function getMonthlyUsage(deviceId: string): Promise<number> {
    const monthKey = new Date().toISOString().substring(0, 7);
    const { rows } = await db.query(
      `SELECT cards_scanned FROM collection_scan_usage WHERE device_id = $1 AND month_key = $2`,
      [deviceId, monthKey]
    );
    return rows[0]?.cards_scanned ?? 0;
  }

  async function incrementMonthlyUsage(deviceId: string, count: number): Promise<void> {
    const monthKey = new Date().toISOString().substring(0, 7);
    await db.query(
      `INSERT INTO collection_scan_usage (device_id, month_key, cards_scanned, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (device_id, month_key)
       DO UPDATE SET cards_scanned = collection_scan_usage.cards_scanned + $3, updated_at = NOW()`,
      [deviceId, monthKey, count]
    );
  }

  /**
   * Extract candidate set name variants to try, from the AI-supplied set name.
   * The AI often adds era prefixes like "Scarlet & Violet: " or "Scarlet & Violet—"
   * which don't appear in our DB. We produce multiple shorter forms to try.
   */
  function setNameCandidates(raw: string): string[] {
    const candidates = new Set<string>();
    candidates.add(raw.trim());
    // Strip era prefix before ":" e.g. "Scarlet & Violet: Mega Evolution" → "Mega Evolution"
    const colonIdx = raw.lastIndexOf(":");
    if (colonIdx !== -1) candidates.add(raw.slice(colonIdx + 1).trim());
    // Strip era prefix before "—" e.g. "Scarlet & Violet—Paldea Evolved" → "Paldea Evolved"
    const dashIdx = raw.lastIndexOf("—");
    if (dashIdx !== -1) candidates.add(raw.slice(dashIdx + 1).trim());
    // Strip era prefix before " - " e.g. "Black & White - Boundaries Crossed" → "Boundaries Crossed"
    const spaceDashIdx = raw.lastIndexOf(" - ");
    if (spaceDashIdx !== -1) candidates.add(raw.slice(spaceDashIdx + 3).trim());
    return [...candidates].filter(Boolean);
  }

  async function lookupCardPrice(cardName: string, cardNumber: string, language: string, setName?: string): Promise<number | null> {
    try {
      const numPart = cardNumber.split("/")[0].replace(/^0+/, "").trim();
      const isJp = language === "ja" || language === "ko" || language === "zh";

      if (isJp) {
        if (setName) {
          for (const candidate of setNameCandidates(setName)) {
            const { rows } = await db.query(
              `SELECT price_eur::float as price FROM card_catalog
               WHERE lang = $1
               AND (LOWER(name) = LOWER($2) OR LOWER(name_en) = LOWER($2))
               AND (LOWER(number) = LOWER($3) OR LOWER(SPLIT_PART(number, '/', 1)) = LOWER($3))
               AND LOWER(set_name) ILIKE $4
               ORDER BY price_eur DESC NULLS LAST LIMIT 1`,
              [language, cardName, numPart, `%${candidate.toLowerCase()}%`]
            );
            if (rows[0]?.price) {
              console.log(`[collection-scan] JP price matched with set candidate "${candidate}"`);
              return rows[0].price;
            }
          }
        }
        // Fallback: name + number, no set filter
        const { rows } = await db.query(
          `SELECT price_eur::float as price FROM card_catalog
           WHERE lang = $1
           AND (LOWER(name) = LOWER($2) OR LOWER(name_en) = LOWER($2))
           AND (LOWER(number) = LOWER($3) OR LOWER(SPLIT_PART(number, '/', 1)) = LOWER($3))
           ORDER BY price_eur DESC NULLS LAST LIMIT 1`,
          [language, cardName, numPart]
        );
        return rows[0]?.price ?? null;

      } else {
        // Priority 1: try each set name candidate (most specific match)
        if (setName) {
          for (const candidate of setNameCandidates(setName)) {
            const { rows } = await db.query(
              `SELECT price_usd::float as price FROM card_catalog
               WHERE (lang IS NULL OR lang = 'en')
               AND LOWER(name) = LOWER($1)
               AND (LOWER(number) = LOWER($2) OR LOWER(SPLIT_PART(number, '/', 1)) = LOWER($2))
               AND LOWER(set_name) ILIKE $3
               ORDER BY price_usd DESC NULLS LAST LIMIT 1`,
              [cardName, numPart, `%${candidate.toLowerCase()}%`]
            );
            if (rows[0]?.price != null) {
              console.log(`[collection-scan] EN price matched with set candidate "${candidate}"`);
              return rows[0].price;
            }
          }
        }

        // Priority 2: exact name + card number only (no set — last resort)
        const { rows } = await db.query(
          `SELECT price_usd::float as price FROM card_catalog
           WHERE (lang IS NULL OR lang = 'en')
           AND LOWER(name) = LOWER($1)
           AND (LOWER(number) = LOWER($2) OR LOWER(SPLIT_PART(number, '/', 1)) = LOWER($2))
           ORDER BY price_usd ASC NULLS LAST LIMIT 1`,
          [cardName, numPart]
        );
        if (rows[0]?.price != null) return rows[0].price;

        // Priority 3: fuzzy name + card number
        const { rows: fuzzy } = await db.query(
          `SELECT price_usd::float as price FROM card_catalog
           WHERE (lang IS NULL OR lang = 'en')
           AND LOWER(name) ILIKE LOWER($1)
           AND (LOWER(number) = LOWER($2) OR LOWER(SPLIT_PART(number, '/', 1)) = LOWER($2))
           ORDER BY price_usd ASC NULLS LAST LIMIT 1`,
          [`%${cardName}%`, numPart]
        );
        return fuzzy[0]?.price ?? null;
      }
    } catch (e: any) {
      console.error("[collection-scan] Price lookup error:", e.message);
      return null;
    }
  }

  async function performConditionScan(frontBase64: string, backBase64: string, logPrefix: string): Promise<{
    cardName: string; setName: string; cardNumber: string;
    language: string; condition: string; conditionNotes: string;
  }> {
    const optimizedFront = await optimizeImageForAI(frontBase64, 1024);
    const optimizedBack = await optimizeImageForAI(backBase64, 1024);

    const setReference = getCurrentSetReference();
    const symbolReference = generateSymbolReferenceForPrompt();

    const prompt = `You are an expert Pokemon card identification and condition analyst. Examine the front and back images carefully.

=== STEP 1: IDENTIFY THE POKEMON ===
- READ the Pokemon name printed on the card (any language).
- ALSO confirm using the artwork — visual features (colors, shape, face) are reliable even when text is hard to read.
- Note any suffix: ex, EX, GX, V, VMAX, VSTAR, etc.
- ALWAYS report the ENGLISH name even for non-English cards.
- Japanese katakana key translations: リザードン=Charizard, ピカチュウ=Pikachu, ミュウツー=Mewtwo, ルカリオ=Lucario, レックウザ=Rayquaza, コロトック=Kricketune, ゲノセクト=Genesect
- Korean Hangul key translations: 리자몽=Charizard, 피카츄=Pikachu, 뮤츠=Mewtwo, 루카리오=Lucario, 레쿠자=Rayquaza, 님피아=Sylveon, 블래키=Umbreon
- Chinese key translations: 噴火龍=Charizard, 皮卡丘=Pikachu, 超夢=Mewtwo, 路卡利歐=Lucario, 烈空坐=Rayquaza

=== STEP 2: READ THE CARD NUMBER ===
- Find the number at the bottom of the card (usually bottom-left or bottom-right).
- Format is typically "XXX/YYY" (e.g. "062/100"). Report it exactly as printed.
- The denominator (YYY) is the set size — use it to verify the set in Step 3.
- Secret rares have numbers ABOVE the set total (e.g. "125/094") — this is correct, do NOT change it.

=== STEP 3: IDENTIFY THE SET ===
- READ the set code printed near the card number (e.g. "sv2a", "PFL", "CRZ", "s8b").
- IMPORTANT: Do NOT rely on your training data for set names — use ONLY the mapping below.
- Do NOT add era prefixes like "Scarlet & Violet:" — report the set name exactly as it appears in the mapping.
- For older WOTC-era cards without a printed set code, use the set symbol (small icon) and card design/border style.

Symbol-to-set reference:
${symbolReference}

Set code to set name mapping:
${setReference}

If the set code is not in the mapping, report the code exactly as read — do NOT invent a set name.

=== STEP 4: ASSESS CONDITION ===
- Mint: Perfect, no visible flaws whatsoever
- Near Mint: Very minor handling marks only, looks essentially new
- Light Played: Light edge wear, minor surface marks, slightly worn corners
- Played: Visible wear on edges/corners, moderate scratches, light creasing
- Heavy Played: Heavy edge wear, creases, significant scratches or corner whitening
- Damaged: Tears, heavy creasing, water damage, writing, or severe physical damage

=== OUTPUT ===
Return ONLY a valid JSON object with these exact fields:
{
  "cardName": "English Pokemon name as identified",
  "setName": "Set name from the mapping above — no era prefixes",
  "cardNumber": "Card number exactly as printed",
  "language": "en",
  "condition": "Near Mint",
  "conditionNotes": "one sentence describing the main reason for this condition rating"
}

The "language" field must be exactly one of: en, ja, ko, zh
The "condition" field must be exactly one of: Mint, Near Mint, Light Played, Played, Heavy Played, Damaged

Return ONLY the JSON object. No other text.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            toClaudeImage(optimizedFront),
            toClaudeImage(optimizedBack),
          ],
        },
      ],
    });

    const text = (response.content[0] as Anthropic.TextBlock)?.text || "";
    console.log(`${logPrefix} Haiku raw response: ${text.substring(0, 200)}`);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      cardName: parsed.cardName || "Unknown Card",
      setName: parsed.setName || "Unknown Set",
      cardNumber: parsed.cardNumber || "?",
      language: parsed.language || "en",
      condition: parsed.condition || "Near Mint",
      conditionNotes: parsed.conditionNotes || "",
    };
  }

  async function processCollectionJob(jobId: string, cards: { frontBase64: string; backBase64: string }[], deviceId: string) {
    const job = collectionJobs.get(jobId);
    if (!job) return;
    let successCount = 0;
    for (let i = 0; i < cards.length; i++) {
      const card = job.cards[i];
      if (card.status === "limit_reached") continue;
      card.status = "processing";
      try {
        const result = await performConditionScan(cards[i].frontBase64, cards[i].backBase64, `[collection-scan:${jobId}:${i + 1}/${cards.length}]`);
        const nmPrice = await lookupCardPrice(result.cardName, result.cardNumber, result.language, result.setName);
        const multiplier = CONDITION_MULTIPLIERS[result.condition] ?? 1.0;
        const conditionPrice = nmPrice != null ? Math.round(nmPrice * multiplier * 100) / 100 : null;
        card.cardName = result.cardName;
        card.setName = result.setName;
        card.cardNumber = result.cardNumber;
        card.language = result.language;
        card.condition = result.condition;
        card.conditionNotes = result.conditionNotes;
        card.nmPriceUsd = nmPrice;
        card.conditionPriceUsd = conditionPrice;
        card.status = "done";
        successCount++;
      } catch (err: any) {
        console.error(`[collection-scan] Card ${i + 1} error:`, err.message);
        card.status = "failed";
        card.error = err.message;
      }
      job.completedCards++;
    }
    job.status = "completed";
    if (successCount > 0) {
      try { await incrementMonthlyUsage(deviceId, successCount); } catch {}
    }
    // Persist completed job to DB
    await saveJobToDB(job, deviceId);
    // Clean up from memory after 30 minutes (DB is the durable store)
    setTimeout(() => collectionJobs.delete(jobId), 30 * 60 * 1000);
  }

  app.post("/api/collection/job", async (req, res) => {
    try {
      const { deviceId, cards } = req.body as { deviceId?: string; cards?: { frontBase64: string; backBase64: string }[] };
      if (!deviceId || !Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: "deviceId and cards[] are required" });
      }
      // Check monthly limit
      let monthlyUsed = 0;
      try { monthlyUsed = await getMonthlyUsage(deviceId); } catch {}
      const monthlyRemaining = Math.max(0, MONTHLY_CARD_LIMIT - monthlyUsed);
      // Apply limits
      const sessionAllowed = Math.min(cards.length, SESSION_CARD_LIMIT, monthlyRemaining);

      const jobId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
      const jobCards: CollectionCard[] = cards.map((_, i) => ({
        index: i,
        status: i < sessionAllowed ? "pending" : "limit_reached",
      }));

      const job: CollectionJob = {
        id: jobId,
        status: "processing",
        cards: jobCards,
        totalCards: sessionAllowed,
        completedCards: 0,
        createdAt: Date.now(),
      };
      collectionJobs.set(jobId, job);
      // Save initial processing state to DB so device can associate this jobId with itself
      await saveJobToDB(job, deviceId);

      // Process async
      void processCollectionJob(jobId, cards, deviceId);

      return res.json({ jobId, totalCards: sessionAllowed, limitedCount: cards.length - sessionAllowed });
    } catch (err: any) {
      console.error("[collection/job] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/collection/jobs", async (req, res) => {
    const { deviceId } = req.query as { deviceId?: string };
    if (!deviceId) return res.status(400).json({ error: "deviceId required" });
    try {
      const { rows } = await db.query(
        `SELECT job_id, status, total_cards, cards, created_at
         FROM collection_jobs
         WHERE device_id = $1 AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 50`,
        [deviceId]
      );
      const jobs = rows.map((r) => {
        const cards: CollectionCard[] = Array.isArray(r.cards) ? r.cards : JSON.parse(r.cards);
        const doneCards = cards.filter((c) => c.status === "done");
        const totalNM = doneCards.reduce((s, c) => s + (c.nmPriceUsd ?? 0), 0);
        const totalCondition = doneCards.reduce((s, c) => s + (c.conditionPriceUsd ?? 0), 0);
        const conditionCounts: Record<string, number> = {};
        doneCards.forEach((c) => {
          if (c.condition) conditionCounts[c.condition] = (conditionCounts[c.condition] ?? 0) + 1;
        });
        return {
          jobId: r.job_id,
          status: r.status,
          totalCards: r.total_cards,
          doneCards: doneCards.length,
          totalNMUsd: totalNM,
          totalConditionUsd: totalCondition,
          conditionCounts,
          createdAt: r.created_at,
        };
      });
      return res.json({ jobs });
    } catch (err: any) {
      console.error("[collection/jobs] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/collection/job/:jobId", async (req, res) => {
    let job = collectionJobs.get(req.params.jobId);
    // Fall back to DB if not in memory (e.g. after server restart or 30-min expiry)
    if (!job) {
      job = await loadJobFromDB(req.params.jobId) ?? undefined;
    }
    if (!job) return res.status(404).json({ error: "Job not found" });
    return res.json({
      status: job.status,
      totalCards: job.totalCards,
      completedCards: job.completedCards,
      cards: job.cards,
    });
  });

  app.delete("/api/collection/job/:jobId", async (req, res) => {
    const { deviceId } = req.query as { deviceId?: string };
    if (!deviceId) return res.status(400).json({ error: "deviceId required" });
    try {
      await db.query(
        `DELETE FROM collection_jobs WHERE job_id = $1 AND device_id = $2`,
        [req.params.jobId, deviceId]
      );
      collectionJobs.delete(req.params.jobId);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[collection/delete] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/collection/job/:jobId/card/:idx", async (req, res) => {
    try {
      // Try memory first, fall back to DB
      let job = collectionJobs.get(req.params.jobId);
      if (!job) {
        job = await loadJobFromDB(req.params.jobId) ?? undefined;
      }
      if (!job) return res.status(404).json({ error: "Job not found" });
      const idx = parseInt(req.params.idx);
      const card = job.cards[idx];
      if (!card) return res.status(404).json({ error: "Card not found" });
      const { cardName, setName, cardNumber, language } = req.body as {
        cardName?: string; setName?: string; cardNumber?: string; language?: string;
      };
      if (cardName) card.cardName = cardName;
      if (setName) card.setName = setName;
      if (cardNumber) card.cardNumber = cardNumber;
      if (language) card.language = language;
      // Re-fetch price with updated details
      const nmPrice = await lookupCardPrice(card.cardName || "", card.cardNumber || "", card.language || "en", card.setName);
      const multiplier = CONDITION_MULTIPLIERS[card.condition || "Near Mint"] ?? 1.0;
      card.nmPriceUsd = nmPrice;
      card.conditionPriceUsd = nmPrice != null ? Math.round(nmPrice * multiplier * 100) / 100 : null;
      // Persist the update — get deviceId from DB since we may not have it in memory
      try {
        const { rows } = await db.query(`SELECT device_id FROM collection_jobs WHERE job_id = $1`, [job.id]);
        if (rows[0]) await saveJobToDB(job, rows[0].device_id);
      } catch {}
      return res.json({ ok: true, card });
    } catch (err: any) {
      console.error("[collection/card-update] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── End Collection Scan API ────────────────────────────────────────────────

  interface GradingJob {
    id: string;
    status: "processing" | "completed" | "failed";
    type: "single" | "bulk" | "deep";
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

  async function performGrading(frontImage: string, backImage: string, logPrefix: string = "[grade]"): Promise<any> {
    const gradeStartTime = Date.now();
    const rawFrontUrl = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
    const rawBackUrl = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;

    const [frontUrl, backUrl] = await Promise.all([
      optimizeImageForAI(rawFrontUrl),
      optimizeImageForAI(rawBackUrl),
    ]);
    const optimizeTime = Date.now() - gradeStartTime;
    if (optimizeTime > 50) console.log(`${logPrefix} Image optimization took ${optimizeTime}ms`);

    const [enhancedFrontUrl, enhancedBackUrl] = await Promise.all([
      enhanceForSurfaceDetection(frontUrl),
      enhanceForSurfaceDetection(backUrl),
    ]);
    const enhanceTime = Date.now() - gradeStartTime - optimizeTime;
    if (enhanceTime > 50) console.log(`${logPrefix} Surface enhancement took ${enhanceTime}ms`);

    // Optionally generate CLAHE multi-filter images for deeper defect detection
    let claheFront: CLAHEFilterSet | null = null;
    let claheBack: CLAHEFilterSet | null = null;
    if (CLAHE_GRADING_ENABLED) {
      const claheStart = Date.now();
      [claheFront, claheBack] = await Promise.all([
        generateCLAHEFilters(frontUrl),
        generateCLAHEFilters(backUrl),
      ]);
      const claheTime = Date.now() - claheStart;
      if (claheTime > 50) console.log(`${logPrefix} CLAHE filter generation took ${claheTime}ms`);
    }

    const claheActive = CLAHE_GRADING_ENABLED && claheFront && claheBack;
    const imageList = claheActive
      ? [
          toClaudeImage(frontUrl),
          toClaudeImage(backUrl),
          toClaudeImage(enhancedFrontUrl),
          toClaudeImage(enhancedBackUrl),
          toClaudeImage(claheFront!.colourClahe),
          toClaudeImage(claheBack!.colourClahe),
          toClaudeImage(claheFront!.laplacianEdge),
          toClaudeImage(claheBack!.laplacianEdge),
          toClaudeImage(claheFront!.emboss),
          toClaudeImage(claheBack!.emboss),
        ]
      : [
          toClaudeImage(frontUrl),
          toClaudeImage(backUrl),
          toClaudeImage(enhancedFrontUrl),
          toClaudeImage(enhancedBackUrl),
        ];

    const promptText = claheActive
      ? `Please analyze this Pokemon card and provide estimated grades from PSA, Beckett (BGS), Ace Grading, TAG Grading, and CGC Cards.

You are given 10 images across 5 filter types (front then back for each):
- Images 1-2: STANDARD — front and back at optimised quality. Use these as your PRIMARY source for card identification, centering, corners, edges, and overall surface condition.
- Images 3-4: SHARPEN-ENHANCED — stronger sharpening and contrast boost to help reveal scuffs and scratches.
- Images 5-6: COLOUR CLAHE — Adaptive histogram equalisation applied per colour channel. Reveals edge whitening, micro-scratches, and corner wear while preserving the card full colour. CRITICAL: Holographic patterns remain multi-coloured (rainbow/iridescent) in this view. Genuine scratches appear as GREY or SILVER linear marks. If a mark is multi-coloured, it is holo texture — NOT a defect.
- Images 7-8: LAPLACIAN EDGE — Greyscale edge-detection filter. Every physical boundary (card edges, corner points, chips, nicks) appears as a bright white line. Use this to identify corner whitening and edge chipping. A smooth bright border line all the way round is NORMAL factory output — only isolated breaks, dots, or gaps in the border line indicate actual chipping.
- Images 9-10: EMBOSS RELIEF — Greyscale surface-relief filter. Physical scratches, corner bends, and dents appear as raised ridges or dark grooves. Uniform low-level texture across the whole surface is NORMAL card stock grain — only distinct ridges/grooves that run across an otherwise flat region indicate actual damage.

CRITICAL — HOW TO USE THESE FILTERS:
1. Standard images (1-2) are your primary judge. Always start there.
2. A defect ONLY counts if visible in standard images (even faintly) AND confirmed by at least one filter. If something only appears in filtered images but is invisible in standard images, treat it as normal card texture — do NOT count it as a defect.
3. Holographic, Full Art, Illustration Rare, Special Illustration Rare, and textured cards have complex surfaces by design. Apply extra leniency for these card types when reading filtered images.
4. Use Laplacian (7-8) specifically for corner and edge assessment. Use Colour CLAHE (5-6) specifically for surface scratches and edge whitening. Use Emboss (9-10) specifically for surface wear depth and corner curvature.

IMPORTANT CARD IDENTIFICATION: Read the card number and set code printed at the bottom of the card. Read the Pokemon name from the top. The set code + card number uniquely identify this card — report them EXACTLY as printed. Do NOT guess or substitute different details.`
      : `Please analyze this Pokemon card and provide estimated grades from PSA, Beckett (BGS), Ace Grading, TAG Grading, and CGC Cards.\n\nYou are given 4 images:\n- Image 1: FRONT of card (standard)\n- Image 2: BACK of card (standard)\n- Image 3: FRONT of card (SURFACE-ENHANCED — contrast-boosted to help reveal scratches and scuffs)\n- Image 4: BACK of card (SURFACE-ENHANCED — contrast-boosted to help reveal scratches and scuffs)\n\nIMPORTANT: Use images 1 and 2 as your PRIMARY source for ALL grading — card identification, centering, corners, edges, and surface condition. Images 3 and 4 are SUPPLEMENTARY only.\n\nCRITICAL — ENHANCED IMAGE RULES:\n- The enhancement process amplifies EVERYTHING, including normal card features like holographic rainbow patterns, foil texture, print grain, and standard edge cuts.\n- A defect ONLY counts if you can also see it (even faintly) in the STANDARD images (1 or 2). If something appears ONLY in the enhanced images but is completely invisible in the standard images, it is likely a normal card feature amplified by the enhancement — do NOT count it.\n- Holographic, full-art, textured, and illustration rare cards naturally have complex surface patterns (rainbow reflections, embossed texture, foil speckling). These are NOT defects. Do not report holographic patterns, print texture, or foil grain as whitening, scratches, or wear.\n- Normal factory edge cuts can appear as slight whitening when enhanced — this is standard for all cards and is NOT a defect unless clearly visible as actual chipping or peeling in the standard images.\n- When in doubt, always defer to what you see in the STANDARD images. The enhanced images are a second opinion tool, not the primary judge.\n\nIMPORTANT CARD IDENTIFICATION: Read the card number and set code printed at the bottom of the card. Read the Pokemon name from the top. The set code + card number uniquely identify this card — report them EXACTLY as printed. Do NOT guess or substitute different details.`;

    const gradingResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: buildGradingSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            ...imageList,
          ],
        },
      ],
    });

    const aiTime = Date.now() - gradeStartTime;
    console.log(`${logPrefix} AI call completed in ${aiTime}ms`);

    const content = (gradingResponse.content[0] as Anthropic.TextBlock)?.text || "";

    let gradingResult: any;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      gradingResult = repairAndParseJSON(jsonMatch[0]);
      if (!gradingResult) throw new Error("Failed to parse AI response JSON (repair exhausted)");
    } else {
      throw new Error("No JSON found in AI response");
    }

    gradingResult = enforceGradingScales(gradingResult);

    const cardName = gradingResult.cardName || "";
    const cardNumber = gradingResult.setNumber || "";
    const setName = gradingResult.setName || "";
    const setCode = (gradingResult as any).setCode || "";

    console.log(`${logPrefix} AI result: name="${cardName}" number="${cardNumber}" set="${setName}" code="${setCode}"`);

    const isAsianCode = /^s\d|^sv\d|^sm\d/i.test(setCode || "");
    const hasNonLatinName = /[^\u0000-\u007F]/.test(cardName);
    const isAsianCard = isAsianCode && hasNonLatinName;

    const aiBoundsValid = isValidCardBounds(gradingResult.frontCardBounds) && isValidCardBounds(gradingResult.backCardBounds);
    console.log(`${logPrefix} AI card bounds: front=${JSON.stringify(gradingResult.frontCardBounds)} back=${JSON.stringify(gradingResult.backCardBounds)} valid=${aiBoundsValid}`);

    if (isAsianCard) {
      console.log(`${logPrefix} Asian set code "${setCode}" — trying Bulbapedia database lookup`);

      const cardNum = parseInt((cardNumber || "").split("/")[0]?.replace(/^0+/, "") || "0");
      const numbersToTry = new Set<number>();
      if (cardNum > 0) numbersToTry.add(cardNum);

      const lookupPromises = [...numbersToTry].map(num =>
        lookupJapaneseCard(setCode, num, setName).then(name => ({ num, name }))
      );

      if (aiBoundsValid) {
        const bulbapediaResults = await Promise.all(lookupPromises);
        const foundResults = bulbapediaResults.filter(r => r.name !== null) as Array<{ num: number; name: string }>;
        console.log(`${logPrefix} Bulbapedia results: ${foundResults.map(r => `#${r.num}="${r.name}"`).join(", ") || "none"}`);

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
        const boundsPromise = Promise.all([detectCardBounds(frontUrl), detectCardBounds(backUrl)]);
        const [boundsResults, ...bulbapediaResults] = await Promise.all([boundsPromise, ...lookupPromises]);
        const [detectedFront, detectedBack] = boundsResults;
        gradingResult.frontCardBounds = detectedFront;
        gradingResult.backCardBounds = detectedBack;

        const foundResults = bulbapediaResults.filter(r => r.name !== null) as Array<{ num: number; name: string }>;
        console.log(`${logPrefix} Bulbapedia results: ${foundResults.map(r => `#${r.num}="${r.name}"`).join(", ") || "none"}`);

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
      }
    } else {
      console.log(`${logPrefix} Looking up card online: name="${cardName}" number="${cardNumber}" set="${setName}" code="${setCode}"`);

      if (aiBoundsValid) {
        const lookupResult = await lookupCardOnline(cardName, cardNumber, setName, setCode).catch(() => null);
        if (lookupResult) {
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
        }
      } else {
        const [boundsResults, lookupResult] = await Promise.all([
          Promise.all([detectCardBounds(frontUrl), detectCardBounds(backUrl)]),
          lookupCardOnline(cardName, cardNumber, setName, setCode).catch(() => null),
        ]);

        const [detectedFront, detectedBack] = boundsResults;

        if (lookupResult) {
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
        }
        gradingResult.frontCardBounds = detectedFront;
        gradingResult.backCardBounds = detectedBack;
      }
    }

    if (setCode) {
      const resolvedSet = resolveSetName(setCode, gradingResult.setName || "");
      if (resolvedSet !== gradingResult.setName) {
        console.log(`${logPrefix} Set code correction: "${setCode}" → "${resolvedSet}" (was "${gradingResult.setName}")`);
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

  async function performDeepGrading(
    frontImage: string,
    backImage: string,
    angledFrontImage: string,
    angledBackImage?: string,
    frontCornerCrops?: string[],
    logPrefix: string = "[deep-grade]",
    userFrontCorners?: string[],
    userBackCorners?: string[],
  ): Promise<any> {
    const gradeStartTime = Date.now();
    const rawFrontUrl = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
    const rawBackUrl = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;
    const rawAngledFrontUrl = angledFrontImage.startsWith("data:") ? angledFrontImage : `data:image/jpeg;base64,${angledFrontImage}`;
    const rawAngledBackUrl = angledBackImage ? (angledBackImage.startsWith("data:") ? angledBackImage : `data:image/jpeg;base64,${angledBackImage}`) : null;

    const optimizePromises: Promise<string>[] = [
      optimizeImageForAI(rawFrontUrl, 2048),
      optimizeImageForAI(rawBackUrl, 2048),
      optimizeImageForAI(rawAngledFrontUrl, 2048),
    ];
    if (rawAngledBackUrl) {
      optimizePromises.push(optimizeImageForAI(rawAngledBackUrl, 2048));
    }

    const hasUserCorners = userFrontCorners && userFrontCorners.length === 4 && userBackCorners && userBackCorners.length === 4;
    if (hasUserCorners) {
      for (const c of userFrontCorners!) {
        const raw = c.startsWith("data:") ? c : `data:image/jpeg;base64,${c}`;
        optimizePromises.push(optimizeImageForAI(raw, 1024));
      }
      for (const c of userBackCorners!) {
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

    let userFrontCornerUrls: string[] | null = null;
    let userBackCornerUrls: string[] | null = null;
    if (hasUserCorners) {
      userFrontCornerUrls = optimizedResults.slice(baseIdx, baseIdx + 4);
      userBackCornerUrls = optimizedResults.slice(baseIdx + 4, baseIdx + 8);
      console.log(`${logPrefix} User corner photos: ${userFrontCornerUrls.length} front, ${userBackCornerUrls.length} back`);
    }

    const optimizeTime = Date.now() - gradeStartTime;
    if (optimizeTime > 50) console.log(`${logPrefix} Image optimization took ${optimizeTime}ms`);

    let autoCroppedCorners: string[] = [];
    if (!hasUserCorners) {
      if (frontCornerCrops && frontCornerCrops.length === 4) {
        autoCroppedCorners = frontCornerCrops;
      } else {
        console.log(`${logPrefix} Generating corner crops from front image...`);
        autoCroppedCorners = await generateCornerCrops(frontUrl);
      }
    }

    const angledDescription = angledBackUrl
      ? "Image 3: Front at an angle (to reveal surface scratches). Image 4: Back at an angle (to reveal back surface scratches)."
      : "Image 3: Front at an angle (to reveal surface scratches).";

    let imageDescription: string;
    if (hasUserCorners) {
      const cornerStartIdx = angledBackUrl ? 5 : 4;
      imageDescription = `This is a DEEP GRADE analysis with ${angledBackUrl ? 12 : 11} images total. Image 1: Front (straight-on). Image 2: Back (straight-on). ${angledDescription} Images ${cornerStartIdx}-${cornerStartIdx + 3}: User-captured close-up photos of FRONT corners (top-left, top-right, bottom-left, bottom-right). Images ${cornerStartIdx + 4}-${cornerStartIdx + 7}: User-captured close-up photos of BACK corners (top-left, top-right, bottom-left, bottom-right). These corner close-ups are taken by the user holding their phone close to each corner — they show much more detail than auto-crops. Use them to precisely evaluate corner whitening, edge sharpness, dings, and wear at each individual corner.\n\nIMPORTANT: The corner close-ups are your PRIMARY source for corner and edge grading. Examine each one carefully for whitening (white dots/lines), softness, bends, or chipping.\n\nIMPORTANT CARD IDENTIFICATION: Read the card number and set code printed at the bottom of the card. Read the Pokemon name from the top. The set code + card number uniquely identify this card — report them EXACTLY as printed. Do NOT guess or substitute different values. Common digit misreads: 0↔8, 3↔8, 6↔9, 1↔7.\n\nSURFACE INSPECTION: Carefully examine the artwork area and card back for ANY scratches, scuffs, or wear marks. The angled shots reveal scratches that catch light. Report every visible scratch as a defect.`;
    } else {
      const cornerStartIdx = angledBackUrl ? 5 : 4;
      imageDescription = `This is a DEEP GRADE analysis with multiple angles. Image 1: Front (straight-on). Image 2: Back (straight-on). ${angledDescription} Images ${cornerStartIdx}-${cornerStartIdx + 3}: Auto-cropped close-ups of the four front corners (top-left, top-right, bottom-left, bottom-right). Use the angled shots to identify surface scratches, scuffs, and wear that may not be visible in the straight-on photos. Use the corner crops to precisely evaluate corner condition.\n\nIMPORTANT CARD IDENTIFICATION: Read the card number and set code printed at the bottom of the card. Read the Pokemon name from the top. The set code + card number uniquely identify this card — report them EXACTLY as printed. Do NOT guess or substitute different values. Common digit misreads: 0↔8, 3↔8, 6↔9, 1↔7.\n\nSURFACE INSPECTION: Carefully examine the artwork area and card back for ANY scratches, scuffs, or wear marks. Zoom in mentally on the Pokemon illustration and the Pokeball on the back — these areas commonly show scratches that catch light. Report every visible scratch as a defect.`;
    }

    const imageContent: any[] = [
      { type: "text", text: imageDescription },
      { type: "image_url", image_url: { url: frontUrl, detail: "high" } },
      { type: "image_url", image_url: { url: backUrl, detail: "high" } },
      { type: "image_url", image_url: { url: angledFrontUrl, detail: "high" } },
      ...(angledBackUrl ? [{ type: "image_url" as const, image_url: { url: angledBackUrl, detail: "high" as const } }] : []),
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
        { role: "user", content: convertToClaudeContent(imageContent) },
      ],
    });

    const aiTime = Date.now() - gradeStartTime;
    console.log(`${logPrefix} AI call completed in ${aiTime}ms`);

    const content = (gradingResponse.content[0] as Anthropic.TextBlock)?.text || "";
    let gradingResult: any;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      gradingResult = repairAndParseJSON(jsonMatch[0]);
      if (!gradingResult) throw new Error("Failed to parse AI response JSON (repair exhausted)");
    } else {
      throw new Error("No JSON found in AI response");
    }

    gradingResult = enforceGradingScales(gradingResult);

    const cardName = gradingResult.cardName || "";
    const cardNumber = gradingResult.setNumber || "";
    const setName = gradingResult.setName || "";
    const setCode = (gradingResult as any).setCode || "";

    console.log(`${logPrefix} AI result: name="${cardName}" number="${cardNumber}" set="${setName}" code="${setCode}"`);

    const isAsianCode = /^s\d|^sv\d|^sm\d/i.test(setCode || "");
    const hasNonLatinName = /[^\u0000-\u007F]/.test(cardName);
    const isAsianCard = isAsianCode && hasNonLatinName;

    const deepAiBoundsValid = isValidCardBounds(gradingResult.frontCardBounds) && isValidCardBounds(gradingResult.backCardBounds);
    console.log(`${logPrefix} AI card bounds: front=${JSON.stringify(gradingResult.frontCardBounds)} back=${JSON.stringify(gradingResult.backCardBounds)} valid=${deepAiBoundsValid}`);

    if (isAsianCard) {
      console.log(`${logPrefix} Asian set code "${setCode}" — trying Bulbapedia database lookup`);
      const cardNum = parseInt((cardNumber || "").split("/")[0]?.replace(/^0+/, "") || "0");
      const numbersToTry = new Set<number>();
      if (cardNum > 0) numbersToTry.add(cardNum);

      const lookupPromises = [...numbersToTry].map(num =>
        lookupJapaneseCard(setCode, num, setName).then(name => ({ num, name }))
      );

      if (deepAiBoundsValid) {
        const bulbapediaResults = await Promise.all(lookupPromises);
        const foundResults = bulbapediaResults.filter(r => r.name !== null) as Array<{ num: number; name: string }>;
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
        const boundsPromise = Promise.all([detectCardBounds(frontUrl), detectCardBounds(backUrl)]);
        const [boundsResults, ...bulbapediaResults] = await Promise.all([boundsPromise, ...lookupPromises]);
        const [detectedFront, detectedBack] = boundsResults;
        gradingResult.frontCardBounds = detectedFront;
        gradingResult.backCardBounds = detectedBack;

        const foundResults = bulbapediaResults.filter(r => r.name !== null) as Array<{ num: number; name: string }>;
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
      }
    } else {
      if (deepAiBoundsValid) {
        const lookupResult = await lookupCardOnline(cardName, cardNumber, setName, setCode).catch(() => null);
        if (lookupResult) {
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
        }
      } else {
        const [boundsResults, lookupResult] = await Promise.all([
          Promise.all([detectCardBounds(frontUrl), detectCardBounds(backUrl)]),
          lookupCardOnline(cardName, cardNumber, setName, setCode).catch(() => null),
        ]);

        const [detectedFront, detectedBack] = boundsResults;

        if (lookupResult) {
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
        }
        gradingResult.frontCardBounds = detectedFront;
        gradingResult.backCardBounds = detectedBack;
      }
    }

    if (setCode) {
      const resolvedSet = resolveSetName(setCode, gradingResult.setName || "");
      if (resolvedSet !== gradingResult.setName) {
        console.log(`${logPrefix} Set code correction: "${setCode}" → "${resolvedSet}" (was "${gradingResult.setName}")`);
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

  app.post("/api/check-image-quality", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }
      const uri = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
      const quality = await assessImageQuality(uri);
      res.json(quality);
    } catch (error: any) {
      console.error("Error checking image quality:", error);
      res.status(500).json({ error: error.message || "Failed to check image quality" });
    }
  });

  app.post("/api/grade-card", async (req, res) => {
    try {
      const { frontImage, backImage } = req.body;

      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back card images are required" });
      }

      const result = await performGrading(frontImage, backImage, "[grade-card]");
      res.json(result);
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
                  text: `Re-grade this Pokemon card's CONDITION ONLY. The card has already been identified as: ${cardName || "Unknown"} from ${setName || "Unknown"} (${setNumber || "Unknown"}).\n\nFocus ONLY on grading the physical condition: centering, corners, edges, and surface. Do NOT spend time identifying the card — use the name/set/number provided above.\n\nThe first image is the front, the second is the back.`,
                },
                toClaudeImage(frontUrl),
                toClaudeImage(backUrl),
              ],
            },
          ],
        }),
        detectCardBounds(frontUrl),
        detectCardBounds(backUrl),
      ]);

      const content = (gradingResponse.content[0] as Anthropic.TextBlock)?.text || "";

      let gradingResult;
      const jsonMatchReg = content.match(/\{[\s\S]*\}/);
      if (jsonMatchReg) {
        gradingResult = repairAndParseJSON(jsonMatchReg[0]);
      }
      if (!gradingResult) {
        return res.status(500).json({ error: "Failed to parse grading results", raw: content });
      }

      gradingResult = enforceGradingScales(gradingResult);

      gradingResult.cardName = cardName || gradingResult.cardName;
      gradingResult.setName = setName || gradingResult.setName;
      gradingResult.setNumber = setNumber || gradingResult.setNumber;
      if (!isValidCardBounds(gradingResult.frontCardBounds)) gradingResult.frontCardBounds = detectedFront;
      if (!isValidCardBounds(gradingResult.backCardBounds)) gradingResult.backCardBounds = detectedBack;
      gradingResult = syncCenteringToGrades(gradingResult);

      console.log(`[regrade] Complete for "${cardName}"`);
      res.json(gradingResult);
    } catch (error: any) {
      console.error("Error re-grading card:", error);
      res.status(500).json({ error: error.message || "Failed to re-grade card" });
    }
  });


  app.post("/api/reidentify-card", async (req, res) => {
    try {
      const { frontImage, backImage, previousCardName, previousSetName, previousSetNumber } = req.body;

      if (!frontImage) {
        return res.status(400).json({ error: "Front card image is required" });
      }

      const rawFront = frontImage.startsWith("data:") ? frontImage : `data:image/jpeg;base64,${frontImage}`;
      const imagePromises: Promise<string>[] = [optimizeImageForAI(rawFront)];
      if (backImage) {
        const rawBack = backImage.startsWith("data:") ? backImage : `data:image/jpeg;base64,${backImage}`;
        imagePromises.push(optimizeImageForAI(rawBack));
      }
      const [frontUrl, backUrl] = await Promise.all(imagePromises);

      console.log(`[reidentify] Re-identifying card (was: "${previousCardName}")`);

      const imageMessages: any[] = [
        {
          type: "image_url",
          image_url: { url: frontUrl, detail: "high" },
        },
      ];
      if (backUrl) {
        imageMessages.push({
          type: "image_url",
          image_url: { url: backUrl, detail: "high" },
        });
      }

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `You are a Pokemon card identification expert. Your ONLY job is to identify the card name, set name, and set number from the card image. You have extensive knowledge of Pokemon TCG cards in ALL languages (English, Japanese, Korean, Chinese, etc.).

${getCurrentSetReference()}

${generateSymbolReferenceForPrompt()}

Respond with ONLY a JSON object in this EXACT format — no other text:
{
  "cardName": "English name of the Pokemon card (e.g. Charizard ex)",
  "setName": "English name of the TCG set (e.g. Obsidian Flames, Nihil Zero, Prismatic Evolutions)",
  "setNumber": "card number as printed on the card (e.g. 113/080)"
}

CRITICAL RULES:
- "cardName" = the ENGLISH name of the Pokemon. For Japanese/Korean/Chinese cards, TRANSLATE the Pokemon name to English. Read the actual characters on the card — do NOT guess based on the artwork alone.
- "setName" = the ENGLISH name of the TCG expansion set (NOT the card number). This must be a real set name like "Nihil Zero", "Obsidian Flames", "Battle Partners", etc. NEVER put a card number (like "113/080") in the setName field.
- "setNumber" = the card's collector number as printed at the bottom (e.g. "113/080", "006/197").
- For Japanese cards: Read the katakana/hiragana/kanji name carefully. For example メガサーナイト = Mega Gardevoir, ミュウ = Mew, リザードン = Charizard, ルギア = Lugia, レックウザ = Rayquaza. Look at the actual text, not just the art.
- Use the set code printed at the bottom of the card (e.g. "SV7a", "SV8", "sv2a") to match to the correct set name from the set reference above.
- A previous AI identification was WRONG, so be extra careful. Do not guess — read what is printed on the card.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `IMPORTANT: A previous AI scan incorrectly identified this card as "${previousCardName || "Unknown"}" from set "${previousSetName || "Unknown"}" with number ${previousSetNumber || "Unknown"}. That was WRONG.

Please re-examine the card image${backUrl ? "s (front and back)" : ""} very carefully:
1. READ the Pokemon name printed on the card. If it's in Japanese, translate the actual characters (katakana/hiragana/kanji) to English — do NOT guess from the artwork.
2. READ the set code at the bottom of the card and match it to a set name.
3. READ the card number at the bottom.

The name "${previousCardName}" was INCORRECT — find the real name by reading the card text.`,
              },
              ...convertToClaudeContent(imageMessages),
            ],
          },
        ],
      });

      const content = (response.content[0] as Anthropic.TextBlock)?.text || "";

      let result;
      const jsonMatchId = content.match(/\{[\s\S]*\}/);
      if (jsonMatchId) {
        result = repairAndParseJSON(jsonMatchId[0]);
      }
      if (!result) {
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
    } catch (error: any) {
      console.error("Error re-identifying card:", error);
      res.status(500).json({ error: error.message || "Failed to re-identify card" });
    }
  });

  // --- TCGPlayer pricing via TCGCSV (free, no auth, daily-updated TCGPlayer market data) ---
  const USD_TO_GBP = 0.79;
  const EXCHANGE_RATES: Record<string, { rate: number; symbol: string }> = {
    GBP: { rate: 0.79, symbol: "£" },
    USD: { rate: 1.0, symbol: "$" },
    EUR: { rate: 0.92, symbol: "€" },
    AUD: { rate: 1.55, symbol: "A$" },
    CAD: { rate: 1.38, symbol: "C$" },
    JPY: { rate: 150, symbol: "¥" },
  };

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
    "paldean fates": "Paldean Fates",
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
    const fullNumber = cardNumber ? cardNumber.trim() : "";
    const numBefore = fullNumber.includes("/") ? fullNumber.split("/")[0].replace(/^0+/, "") : fullNumber.replace(/^0+/, "");
    const numAfter = fullNumber.includes("/") ? fullNumber.split("/")[1] : "";

    let bestMatch: TCGProduct | null = null;
    let bestScore = 0;

    for (const p of products) {
      let nameScore = 0;
      let numberScore = 0;
      const pName = normalizeForMatch(p.name);
      const pClean = normalizeForMatch(p.cleanName);

      const pNumber = p.extendedData?.find(e => e.name === "Number")?.value || "";
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
        nameScore = (wordMatches / Math.max(nameWords.length, 1)) * 35;
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

  function extractTCGPlayerPrice(card: any): TCGPlayerLookupResult {
    const prices = card.tcgplayer?.prices || {};
    const priceTypes = ["holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil", "unlimitedHolofoil", "1stEditionNormal", "unlimitedNormal"];
    let bestMarket = 0;
    let bestLow: number | undefined;
    let bestMid: number | undefined;
    let bestHigh: number | undefined;
    for (const pt of priceTypes) {
      const p = prices[pt];
      if (p?.market && p.market > bestMarket) {
        bestMarket = p.market;
        bestLow = p.low || undefined;
        bestMid = p.mid || undefined;
        bestHigh = p.high || undefined;
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
      lowPriceGBP: bestLow ? Math.round(bestLow * USD_TO_GBP * 100) / 100 : undefined,
      midPriceGBP: bestMid ? Math.round(bestMid * USD_TO_GBP * 100) / 100 : undefined,
      tcgplayerUrl: card.tcgplayer?.url || undefined,
    };
  }

  function pickBestCardByName(cards: any[], cardName: string, cardNumber: string, setName?: string): any | null {
    if (cards.length === 0) return null;
    const normName = normalizeForMatch(cardName);
    const normSet = setName ? normalizeForMatch(setName) : "";
    const fullNum = cardNumber ? cardNumber.trim() : "";
    const numBefore = fullNum.includes("/") ? fullNum.split("/")[0].replace(/^0+/, "") : fullNum.replace(/^0+/, "");
    const numAfter = fullNum.includes("/") ? fullNum.split("/")[1] : "";

    let best: any = null;
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
        const overlap = nWords.filter((w: string) => w.length >= 3 && cWords.includes(w)).length;
        score += (overlap / Math.max(nWords.length, 1)) * 40;
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

  async function lookupTCGPlayerPrice(cardName: string, setName: string, cardNumber: string): Promise<TCGPlayerLookupResult> {
    try {
      const numberOnly = cardNumber ? cardNumber.split("/")[0].replace(/^0+/, "") : "";
      const baseName = stripSuffix(cardName);

      // STEP 1: Search by name + number together (most precise)
      if (numberOnly) {
        console.log(`[tcgplayer] Step 1: Searching by name "${cardName}" + number ${numberOnly}`);
        const preciseResults = await queryPokemonTcgApi(`name:"${cardName}" number:${numberOnly}`, true);
        if (preciseResults.length > 0) {
          const match = pickBestCardByName(preciseResults, cardName, cardNumber, setName);
          if (match) {
            const result = extractTCGPlayerPrice(match);
            if (result.found) {
              console.log(`[tcgplayer] Found by name+number: "${match.name}" #${match.number} (${match.set?.name}) | Market: $${result.marketPriceUSD} (£${result.marketPriceGBP})`);
              return result;
            }
          }
        }

        // Also try base name + number if card has a suffix like "ex", "V", etc.
        if (baseName !== cardName) {
          console.log(`[tcgplayer] Step 1b: Trying base name "${baseName}" + number ${numberOnly}`);
          const baseResults = await queryPokemonTcgApi(`name:"${baseName}*" number:${numberOnly}`, true);
          if (baseResults.length > 0) {
            const match = pickBestCardByName(baseResults, cardName, cardNumber, setName);
            if (match) {
              const result = extractTCGPlayerPrice(match);
              if (result.found) {
                console.log(`[tcgplayer] Found by base name+number: "${match.name}" #${match.number} (${match.set?.name}) | Market: $${result.marketPriceUSD} (£${result.marketPriceGBP})`);
                return result;
              }
            }
          }
        }
      }

      // STEP 2: Search by name only (for unique card names or when no number available)
      console.log(`[tcgplayer] Step 2: Searching by name only "${cardName}"`);
      const nameResults = await queryPokemonTcgApi(`name:"${cardName}"`, true);
      if (nameResults.length > 0) {
        const match = pickBestCardByName(nameResults, cardName, cardNumber, setName);
        if (match) {
          const result = extractTCGPlayerPrice(match);
          if (result.found) {
            console.log(`[tcgplayer] Found by name: "${match.name}" #${match.number} (${match.set?.name}) | Market: $${result.marketPriceUSD} (£${result.marketPriceGBP})`);
            return result;
          }
        }
      }

      // STEP 3: Search by number + set name (when name search fails entirely)
      if (numberOnly && setName) {
        console.log(`[tcgplayer] Step 3: Searching by number ${numberOnly} + set "${setName}"`);
        const setResults = await queryPokemonTcgApi(`number:${numberOnly} set.name:"${setName}*"`, true);
        if (setResults.length > 0) {
          const match = pickBestCardByName(setResults, cardName, cardNumber, setName);
          if (match) {
            const result = extractTCGPlayerPrice(match);
            if (result.found) {
              console.log(`[tcgplayer] Found by number+set: "${match.name}" #${match.number} (${match.set?.name}) | Market: $${result.marketPriceUSD} (£${result.marketPriceGBP})`);
              return result;
            }
          }
        }
      }

      // STEP 4: Last resort — old TCGCSV set-based lookup
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
      const matchedNum = matchedProduct.extendedData?.find(e => e.name === "Number")?.value || "";
      console.log(`[tcgplayer] TCGCSV matched: "${matchedProduct.name}" #${matchedNum}`);
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
      console.log(`[tcgplayer] TCGCSV found: "${matchedProduct.name}" | Market: $${bestPrice.marketPrice} (£${result.marketPriceGBP})`);
      return result;
    } catch (err: any) {
      console.log(`[tcgplayer] Lookup error: ${err?.message}`);
      return { found: false };
    }
  }

  // ======================================================================
  // Card Value Explorer — card search and profit calculation endpoints
  // ======================================================================

  const GRADING_COMPANIES = [
    {
      id: "PSA",
      name: "PSA",
      submissionFeeGBP: 18,
      turnaround: "45–60 business days",
      gradeMultipliers: { 7: 1.2, 8: 1.6, 8.5: 0, 9: 2.2, 9.5: 0, 10: 5.5 },
    },
    {
      id: "BGS",
      name: "BGS (Beckett)",
      submissionFeeGBP: 22,
      turnaround: "45–75 business days",
      gradeMultipliers: { 7: 1.1, 8: 1.5, 8.5: 1.9, 9: 2.1, 9.5: 3.8, 10: 6.0 },
    },
    {
      id: "ACE",
      name: "ACE",
      submissionFeeGBP: 10,
      turnaround: "14–21 business days",
      gradeMultipliers: { 7: 1.0, 8: 1.3, 8.5: 1.6, 9: 1.8, 9.5: 2.5, 10: 3.5 },
    },
    {
      id: "CGC",
      name: "CGC",
      submissionFeeGBP: 15,
      turnaround: "30–45 business days",
      gradeMultipliers: { 7: 1.1, 8: 1.4, 8.5: 1.7, 9: 1.9, 9.5: 2.8, 10: 4.2 },
    },
    {
      id: "TAG",
      name: "TAG",
      submissionFeeGBP: 12,
      turnaround: "21–35 business days",
      gradeMultipliers: { 7: 0.9, 8: 1.2, 8.5: 1.5, 9: 1.7, 9.5: 2.3, 10: 3.2 },
    },
  ] as const;

  const PROFIT_GRADES = [7, 8, 8.5, 9, 9.5, 10] as const;

  app.get("/api/cards/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) {
        return res.status(400).json({ error: "q is required" });
      }
      console.log(`[cards/search] Query: "${q}"`);

      // Build search queries with natural language parsing
      const lower = q.toLowerCase();

      // Known set keyword -> pokemontcg.io set ID mappings
      const knownSets: Record<string, string> = {
        "151": "sv3pt5",
        "paldea evolved": "sv2",
        "obsidian flames": "sv3",
        "paradox rift": "sv4",
        "temporal forces": "sv5",
        "twilight masquerade": "sv6",
        "shrouded fable": "sv7",
        "stellar crown": "sv7",
        "surging sparks": "sv8",
        "prismatic evolutions": "sv8pt5",
        "paldean fates": "sv4pt5",
        "scarlet violet": "sv1",
        "shining fates": "swsh45",
        "champions path": "cpa",
        "vivid voltage": "viv",
        "rebel clash": "swsh2",
        "brilliant stars": "brs",
        "astral radiance": "asr",
        "lost origin": "lor",
        "silver tempest": "sit",
        "crown zenith": "crz",
        "evolving skies": "evs",
        "fusion strike": "fst",
        "chilling reign": "cre",
        "battle styles": "bst",
        "darkness ablaze": "daa",
        "sword shield": "swsh1",
        "team rocket": "g1",
        "base set": "base1",
        "jungle": "jungle",
        "fossil": "fossil",
        "gym heroes": "gym1",
        "gym challenge": "gym2",
        "neo genesis": "neo1",
        "hidden fates": "sm115",
        "burning shadows": "sm3",
        "guardians rising": "sm2",
        "sun moon": "sm1",
      };

      // Detect if query contains a set keyword
      let matchedSetId: string | null = null;
      let cardNamePart = q;
      for (const [keyword, setId] of Object.entries(knownSets)) {
        if (lower.includes(keyword)) {
          matchedSetId = setId;
          // Remove the matched keyword from the card name part
          cardNamePart = q.replace(new RegExp(keyword, "gi"), "").trim();
          break;
        }
      }

      // Also detect card number in the query (e.g. "Charizard 006")
      const numMatch = q.match(/\b(\d{1,4})\b/);
      let cardNumberPart: string | null = null;
      if (numMatch) {
        cardNumberPart = numMatch[1];
        // Remove it from name part if we already have a name
        cardNamePart = cardNamePart.replace(numMatch[0], "").trim() || cardNamePart;
      }

      const seenIds = new Set<string>();
      const allCards: any[] = [];

      const fields = "id,name,set,number,images";
      const fetchQuery = async (query: string): Promise<any[]> => {
        try {
          const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=10&select=${fields}&orderBy=-set.releaseDate`;
          const resp = await fetch(url, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (!resp.ok) return [];
          const data = await resp.json() as any;
          return data?.data || [];
        } catch { return []; }
      };

      // Build priority query list — set-specific queries first when detected
      const priorityQueries: string[] = [];
      const fallbackQueries: string[] = [];

      if (matchedSetId && cardNamePart) {
        // Best: name + set ID (e.g. "151 Charizard ex" → name:"Charizard ex*" set.id:sv3pt5)
        priorityQueries.push(`name:"${cardNamePart}*" set.id:${matchedSetId}`);
        // Also number + set if we have both
        if (cardNumberPart) {
          priorityQueries.push(`number:${cardNumberPart} set.id:${matchedSetId}`);
        }
      } else if (matchedSetId) {
        // Only set keyword, no card name
        priorityQueries.push(`set.id:${matchedSetId}`);
      }

      if (cardNamePart && cardNumberPart) {
        priorityQueries.push(`name:"${cardNamePart}*" number:${cardNumberPart}`);
      }

      if (cardNamePart) {
        fallbackQueries.push(`name:"${cardNamePart}*"`);
      }

      // Always include general name search as fallback
      fallbackQueries.push(`name:"${q}*"`);

      // Deduplicate and run priority queries first, then fallbacks
      const allQueries = [...new Set([...priorityQueries, ...fallbackQueries])];
      const results = await Promise.all(allQueries.map(fetchQuery));
      for (const cards of results) {
        for (const c of cards) {
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            allCards.push(c);
          }
        }
      }

      const mapped = allCards.slice(0, 10).map((c: any) => ({
        id: c.id,
        name: c.name,
        setName: c.set?.name || "",
        setId: c.set?.id || "",
        number: c.number || "",
        imageUrl: c.images?.large || c.images?.small || null,
      }));

      console.log(`[cards/search] Returning ${mapped.length} results`);
      res.json({ results: mapped });
    } catch (err: any) {
      console.error("[cards/search] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cards/profit", async (req, res) => {
    try {
      const cardId = String(req.query.cardId || "").trim();
      if (!cardId) {
        return res.status(400).json({ error: "cardId is required" });
      }
      console.log(`[cards/profit] Looking up card: ${cardId}`);

      // Fetch card details from pokemontcg.io
      const cardResp = await fetch(
        `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(cardId)}?select=id,name,set,number,images,tcgplayer`,
        { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
      );
      if (!cardResp.ok) {
        return res.status(404).json({ error: "Card not found" });
      }
      const cardData = await cardResp.json() as any;
      const card = cardData?.data;
      if (!card) {
        return res.status(404).json({ error: "Card not found" });
      }

      // Extract TCGPlayer price from the card's data first
      let tcgResult = extractTCGPlayerPrice(card);

      // If not found in card data, fall back to lookup by name+number+set
      if (!tcgResult.found) {
        console.log(`[cards/profit] Price not in card data, doing lookup for "${card.name}" #${card.number} in ${card.set?.name}`);
        tcgResult = await lookupTCGPlayerPrice(card.name, card.set?.name || "", card.number || "");
      }

      if (!tcgResult.found || !tcgResult.marketPriceGBP) {
        return res.json({
          card: {
            id: card.id,
            name: card.name,
            setName: card.set?.name || "",
            setId: card.set?.id || "",
            number: card.number || "",
            imageUrl: card.images?.large || card.images?.small || null,
          },
          rawPriceGBP: null,
          noPriceData: true,
          companies: [],
        });
      }

      const rawPriceGBP = tcgResult.marketPriceGBP;

      const companies = GRADING_COMPANIES.map((company) => {
        const grades = PROFIT_GRADES
          .filter(g => company.gradeMultipliers[g as keyof typeof company.gradeMultipliers] > 0)
          .map((grade) => {
            const multiplier = company.gradeMultipliers[grade as keyof typeof company.gradeMultipliers];
            const gradedValueGBP = Math.round(rawPriceGBP * multiplier * 100) / 100;
            const profitGBP = Math.round((gradedValueGBP - rawPriceGBP - company.submissionFeeGBP) * 100) / 100;
            return {
              grade,
              gradedValueGBP,
              profitGBP,
              isProfitable: profitGBP >= 0,
            };
          });

        // Find minimum grade needed to break even or profit (>= 0)
        const minProfitableGrade = grades.find(g => g.profitGBP >= 0);

        return {
          id: company.id,
          name: company.name,
          submissionFeeGBP: company.submissionFeeGBP,
          turnaround: company.turnaround,
          grades,
          minProfitableGrade: minProfitableGrade?.grade ?? null,
        };
      });

      res.json({
        card: {
          id: card.id,
          name: card.name,
          setName: card.set?.name || "",
          setId: card.set?.id || "",
          number: card.number || "",
          imageUrl: card.images?.large || card.images?.small || null,
        },
        rawPriceGBP,
        noPriceData: false,
        companies,
        priceLastUpdated: "Prices updated daily via TCGPlayer",
      });
    } catch (err: any) {
      console.error("[cards/profit] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/card-value", async (req, res) => {
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
          console.log(`[card-value] Set corrected: "${correctedSetName}" → "${crossChecked}"`);
          correctedSetName = crossChecked;
        }
      }

      const tcgResult = await lookupTCGPlayerPrice(cardName, correctedSetName, setNumber);

      const allKeys = ["psaValue", "psa10Value", "bgsValue", "bgs10Value", "aceValue", "ace10Value", "tagValue", "tag10Value", "cgcValue", "cgc10Value", "rawValue"];

      const cx = EXCHANGE_RATES[currency] || EXCHANGE_RATES.GBP;
      const convertUSD = (usd: number) => Math.round(usd * cx.rate * 100) / 100;

      const marketConverted = tcgResult.marketPriceUSD ? convertUSD(tcgResult.marketPriceUSD) : undefined;
      const lowConverted = tcgResult.lowPriceUSD ? convertUSD(tcgResult.lowPriceUSD) : undefined;
      const midConverted = tcgResult.midPriceUSD ? convertUSD(tcgResult.midPriceUSD) : undefined;

      const tcgContext = tcgResult.found
        ? `REAL TCGPlayer Market Data (verified, daily-updated):
- Card: ${tcgResult.productName}
- Set: ${tcgResult.setName}
- Rarity: ${tcgResult.rarity}
- TCGPlayer Market Price: $${tcgResult.marketPriceUSD} USD (${cx.symbol}${marketConverted} ${currency})
${tcgResult.lowPriceUSD ? `- TCGPlayer Low: $${tcgResult.lowPriceUSD} USD (${cx.symbol}${lowConverted} ${currency})` : ""}
${tcgResult.midPriceUSD ? `- TCGPlayer Mid: $${tcgResult.midPriceUSD} USD (${cx.symbol}${midConverted} ${currency})` : ""}

This is the UNGRADED raw card price from TCGPlayer. Use it as your primary baseline.`
        : "";

      console.log(`[card-value] TCGPlayer data: ${tcgResult.found ? `Found - $${tcgResult.marketPriceUSD} / ${cx.symbol}${marketConverted} ${currency}` : "Not found"}`);

      const cheapThreshold = currency === "JPY" ? "¥750" : `${cx.symbol}5`;
      const expThreshold = currency === "JPY" ? "¥15000" : `${cx.symbol}100`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `You are an expert Pokemon TCG market price analyst. Your job is to estimate graded card values in ${currency}.

${tcgResult.found ? `You have been given REAL TCGPlayer market data for the raw/ungraded card price. This is AUTHORITATIVE — base ALL your estimates on this verified price.

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
3. NEVER say "No value data found" — every card has value.
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

${tcgContext || "No external price data available. Estimate using your expert knowledge of current Pokemon TCG values."}`,
          },
        ],
      });

      const content = (response.content[0] as Anthropic.TextBlock)?.text || "";
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

      if (Math.abs(angle) > 0.15) {
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

  async function detectRawCardBoundsWithAI(imageUrl: string): Promise<{ leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; confidence: number; innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number } | null> {
    const CARD_RATIO = 2.5 / 3.5;
    const RATIO_TOLERANCE = 0.25;
    try {
      const aiPrompt = `You are analyzing an image of a raw (ungraded) Pokemon card. Your goal is to find TWO sets of boundaries:
1. The physical OUTER edges of the card (the cut cardboard boundary)
2. The INNER artwork boundary (where the card's printed border/frame ends and the artwork begins)

STEP 1 — Find the card OUTER edges:
The card is a physical rectangular card. Find where the card material meets the background (table, mat, hand, etc.).
- LEFT edge: leftmost edge of the card's physical material
- RIGHT edge: rightmost edge of the card's physical material
- TOP edge: top edge of the card's physical material
- BOTTOM edge: bottom edge of the card's physical material
- For cards with dark/black backgrounds (Art Rare, Full Art, Secret Rare): look for the subtle material boundary where the card ends and the background begins
- Report the OUTER physical edge, not the holographic foil or inner printed border

STEP 2 — Find the INNER artwork boundary:
Inside the card face there is a printed border/frame. The artwork area starts INSIDE this border. Find the inner boundary.
- Art Rare / Full Art / Secret Rare cards: the artwork fills almost the entire card face with a very thin border (about 1-4% of card width per side)
- Standard Pokemon cards (white or colored borders): the border is about 5-10% of card width per side; TOP border is similar to or slightly larger than the side borders; BOTTOM border is similar to the top
- Express inner bounds as % of the TOTAL IMAGE (same coordinate system as outer bounds)
- The inner boundary should always be INSIDE (between) the outer boundaries

Return ONLY this JSON, no explanation:
{
  "leftPercent": <outer card left edge as % of image width, 0-100>,
  "topPercent": <outer card top edge as % of image height, 0-100>,
  "rightPercent": <outer card right edge as % of image width, 0-100>,
  "bottomPercent": <outer card bottom edge as % of image height, 0-100>,
  "innerLeftPercent": <where artwork begins on left, as % of image width>,
  "innerTopPercent": <where artwork begins at top, as % of image height>,
  "innerRightPercent": <where artwork ends on right, as % of image width>,
  "innerBottomPercent": <where artwork ends at bottom, as % of image height>,
  "confidence": <0.0-1.0>
}`;

      const aiResp = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: "user", content: [
          { type: "text", text: aiPrompt },
          toClaudeImage(imageUrl),
        ]}],
      });

      const raw = (aiResp.content[0] as Anthropic.TextBlock)?.text || "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log("[raw-ai-bounds] No JSON in response");
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const { leftPercent, topPercent, rightPercent, bottomPercent, confidence,
              innerLeftPercent, innerTopPercent, innerRightPercent, innerBottomPercent } = parsed;

      if (typeof leftPercent !== "number" || typeof topPercent !== "number" ||
          typeof rightPercent !== "number" || typeof bottomPercent !== "number") {
        console.log("[raw-ai-bounds] Missing numeric fields");
        return null;
      }

      const clamped = {
        leftPercent:   Math.max(0, Math.min(100, leftPercent)),
        topPercent:    Math.max(0, Math.min(100, topPercent)),
        rightPercent:  Math.max(0, Math.min(100, rightPercent)),
        bottomPercent: Math.max(0, Math.min(100, bottomPercent)),
      };

      if (clamped.leftPercent >= clamped.rightPercent || clamped.topPercent >= clamped.bottomPercent) {
        console.log(`[raw-ai-bounds] Rejected — invalid ordering`);
        return null;
      }

      const w = clamped.rightPercent - clamped.leftPercent;
      const h = clamped.bottomPercent - clamped.topPercent;
      if (w < 10 || h < 10) {
        console.log(`[raw-ai-bounds] Rejected — region too small: ${w.toFixed(1)}×${h.toFixed(1)}`);
        return null;
      }

      const ratio = w / h;
      const ratioError = Math.abs(ratio - CARD_RATIO) / CARD_RATIO;
      if (ratioError > RATIO_TOLERANCE) {
        console.log(`[raw-ai-bounds] Rejected — ratio ${ratio.toFixed(3)} vs expected ${CARD_RATIO.toFixed(3)} (error ${(ratioError * 100).toFixed(1)}%)`);
        return null;
      }

      const result: { leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; confidence: number; innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number } = { ...clamped, confidence: confidence ?? 0.8 };

      // Attach inner bounds if returned and valid (must be inside outer bounds)
      if (typeof innerLeftPercent === "number" && typeof innerTopPercent === "number" &&
          typeof innerRightPercent === "number" && typeof innerBottomPercent === "number") {
        const iL = Math.max(0, Math.min(100, innerLeftPercent));
        const iT = Math.max(0, Math.min(100, innerTopPercent));
        const iR = Math.max(0, Math.min(100, innerRightPercent));
        const iB = Math.max(0, Math.min(100, innerBottomPercent));
        if (iL > clamped.leftPercent && iR < clamped.rightPercent &&
            iT > clamped.topPercent && iB < clamped.bottomPercent &&
            iL < iR && iT < iB) {
          result.innerLeftPercent = iL;
          result.innerTopPercent = iT;
          result.innerRightPercent = iR;
          result.innerBottomPercent = iB;
          console.log(`[raw-ai-bounds] Inner bounds: iL=${iL.toFixed(1)} iT=${iT.toFixed(1)} iR=${iR.toFixed(1)} iB=${iB.toFixed(1)}`);
        }
      }

      console.log(`[raw-ai-bounds] Initial: L=${clamped.leftPercent.toFixed(1)} T=${clamped.topPercent.toFixed(1)} R=${clamped.rightPercent.toFixed(1)} B=${clamped.bottomPercent.toFixed(1)} conf=${confidence?.toFixed(2)} ratio=${ratio.toFixed(3)}`);

      // ── Verification pass: show Claude the original image + text coordinates ──
      // Claude looks at the image and checks whether the estimated positions are right.
      try {
        const imageForVerify = await drawBoundsOnImage(imageUrl, result).catch(() => imageUrl);
        const verified = await verifyAndCorrectBoundsWithAI(imageForVerify, result, "raw");
        if (verified) {
          console.log(`[raw-ai-bounds] Verified: L=${verified.leftPercent.toFixed(1)} T=${verified.topPercent.toFixed(1)} R=${verified.rightPercent.toFixed(1)} B=${verified.bottomPercent.toFixed(1)} conf=${verified.confidence.toFixed(2)}`);
          return verified;
        }
      } catch (verifyErr) {
        console.warn("[raw-ai-bounds] Verification step failed, using initial bounds:", (verifyErr as any)?.message);
      }

      return result;
    } catch (err) {
      console.warn("[raw-ai-bounds] AI detection failed:", (err as any)?.message);
      return null;
    }
  }

  app.post("/api/detect-bounds", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }
      const uri = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

      const aiBounds = await detectRawCardBoundsWithAI(uri);

      if (aiBounds) {
        console.log(`[detect-bounds] Claude result: L=${aiBounds.leftPercent.toFixed(1)} T=${aiBounds.topPercent.toFixed(1)} R=${aiBounds.rightPercent.toFixed(1)} B=${aiBounds.bottomPercent.toFixed(1)} conf=${aiBounds.confidence.toFixed(2)}`);
        res.json(aiBounds);
        return;
      }

      console.log(`[detect-bounds] Claude failed or rejected, falling back to Sobel`);
      const bounds = await detectCardBounds(uri);

      console.log(`[detect-bounds] Sobel result: L=${bounds.leftPercent.toFixed(1)} T=${bounds.topPercent.toFixed(1)} R=${bounds.rightPercent.toFixed(1)} B=${bounds.bottomPercent.toFixed(1)} angle=${bounds.angleDeg ?? 0} confidence=${bounds.confidence ?? 0}`);
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

  /**
   * Draw centering bounds as colored lines on an image (for AI verification).
   * Outer bounds = white lines; inner bounds = yellow lines.
   * Returns a base64 JPEG of the composite image.
   */
  async function drawBoundsOnImage(
    imageUrl: string,
    bounds: { leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number },
  ): Promise<string> {
    const buf = Buffer.from(imageUrl.split(",")[1] ?? imageUrl, "base64");
    const metadata = await sharp(buf).metadata();
    const imgW = metadata.width || 800;
    const imgH = metadata.height || 1100;

    const px = (pct: number) => Math.round((pct / 100) * imgW);
    const py = (pct: number) => Math.round((pct / 100) * imgH);

    const oL = px(bounds.leftPercent);
    const oR = px(bounds.rightPercent);
    const oT = py(bounds.topPercent);
    const oB = py(bounds.bottomPercent);

    let svgLines = `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">`;
    // Outer card boundary — bright white lines
    svgLines += `<line x1="${oL}" y1="0" x2="${oL}" y2="${imgH}" stroke="white" stroke-width="4" opacity="0.9"/>`;
    svgLines += `<line x1="${oR}" y1="0" x2="${oR}" y2="${imgH}" stroke="white" stroke-width="4" opacity="0.9"/>`;
    svgLines += `<line x1="0" y1="${oT}" x2="${imgW}" y2="${oT}" stroke="white" stroke-width="4" opacity="0.9"/>`;
    svgLines += `<line x1="0" y1="${oB}" x2="${imgW}" y2="${oB}" stroke="white" stroke-width="4" opacity="0.9"/>`;

    // Inner artwork boundary — yellow lines (only between outer lines)
    if (bounds.innerLeftPercent != null && bounds.innerRightPercent != null &&
        bounds.innerTopPercent != null && bounds.innerBottomPercent != null) {
      const iL = px(bounds.innerLeftPercent);
      const iR = px(bounds.innerRightPercent);
      const iT = py(bounds.innerTopPercent);
      const iB = py(bounds.innerBottomPercent);
      svgLines += `<line x1="${iL}" y1="${oT}" x2="${iL}" y2="${oB}" stroke="yellow" stroke-width="3" opacity="0.9"/>`;
      svgLines += `<line x1="${iR}" y1="${oT}" x2="${iR}" y2="${oB}" stroke="yellow" stroke-width="3" opacity="0.9"/>`;
      svgLines += `<line x1="${oL}" y1="${iT}" x2="${oR}" y2="${iT}" stroke="yellow" stroke-width="3" opacity="0.9"/>`;
      svgLines += `<line x1="${oL}" y1="${iB}" x2="${oR}" y2="${iB}" stroke="yellow" stroke-width="3" opacity="0.9"/>`;
    }
    svgLines += `</svg>`;

    const composite = await sharp(buf)
      .composite([{ input: Buffer.from(svgLines), blend: "over" }])
      .jpeg({ quality: 80 })
      .toBuffer();

    return `data:image/jpeg;base64,${composite.toString("base64")}`;
  }

  /**
   * Verify and correct centering bounds using the ORIGINAL image + text description of current estimates.
   * Claude reads the current estimates, looks at the image, and corrects any that are wrong.
   * This replicates how a human can look at a card photo and judge whether "20% from left = card edge" is correct.
   */
  async function verifyAndCorrectBoundsWithAI(
    originalImageUrl: string,
    initial: { leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number },
    mode: "slab" | "raw",
  ): Promise<{ leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; confidence: number; innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number } | null> {
    try {
      const iL0 = initial.innerLeftPercent;
      const iT0 = initial.innerTopPercent;
      const iR0 = initial.innerRightPercent;
      const iB0 = initial.innerBottomPercent;
      const hasInner = iL0 != null && iT0 != null && iR0 != null && iB0 != null;

      const slabContext = mode === "slab" ? `
SLAB-SPECIFIC NOTES:
⚠️ DO NOT CHANGE topPercent FOR SLABS — it is pre-measured as the bottom edge of the grading label and is correct. The current value (${initial.topPercent.toFixed(1)}%) is where the printed label panel ends and the card becomes visible through the clear plastic window. This is a fixed measurement. Do NOT adjust topPercent.

- LEFT/RIGHT card edges: where card material meets the clear/transparent inner plastic wall. Clear plastic is visible between the card edge and the outer slab frame. The card occupies 65-85% of the image width.
- BOTTOM card edge: where card material meets slab bottom plastic.
- INNER bounds: these mark the card's OWN PRINTED BORDER edges (where the colored frame/design starts, inside the physical card edge). For Inner TOP: this is 1-5% BELOW the outer topPercent (just inside the card's top border). For Illustration Rare / Full Art: inner top is 1-2% below outer top. For standard cards: 3-6% below outer top.
- Do NOT place inner TOP at the Pokemon name bar or HP text — it should be close to the outer top.
- Do NOT use outer slab frame edges as card edges.` : `
RAW CARD NOTES:
- The card edges are where the physical card material meets the background
- For dark Art Rare cards: the card edge is where the dark material ends (even if subtle against a dark background)`;

      const prompt = `I estimated these Pokemon card centering boundaries, and I need you to check them by looking at the image.

Current estimates (as % of image dimensions):
- Outer LEFT card edge:   ${initial.leftPercent.toFixed(1)}% from left
- Outer RIGHT card edge:  ${initial.rightPercent.toFixed(1)}% from left  
- Outer BOTTOM card edge: ${initial.bottomPercent.toFixed(1)}% from top
- Outer TOP card edge:    ${initial.topPercent.toFixed(1)}% from top${hasInner ? `
- Inner LEFT (artwork start):  ${iL0!.toFixed(1)}% from left
- Inner RIGHT (artwork end):   ${iR0!.toFixed(1)}% from left
- Inner TOP (artwork start):   ${iT0!.toFixed(1)}% from top
- Inner BOTTOM (artwork end):  ${iB0!.toFixed(1)}% from top` : ""}
${slabContext}

For each edge: imagine a line at that percentage position. Does it land on the actual card edge?
- If a value looks WRONG, provide the corrected value
- If a value looks CORRECT, keep the same number
- Be especially careful about LEFT and RIGHT — these are the physical card edge, not the artwork boundary

Return ONLY this JSON (all numbers required):
{
  "leftPercent": ${initial.leftPercent.toFixed(1)},
  "topPercent": ${initial.topPercent.toFixed(1)},
  "rightPercent": ${initial.rightPercent.toFixed(1)},
  "bottomPercent": ${initial.bottomPercent.toFixed(1)},
  "innerLeftPercent": ${(iL0 ?? (initial.leftPercent + 2)).toFixed(1)},
  "innerTopPercent": ${(iT0 ?? (initial.topPercent + 5)).toFixed(1)},
  "innerRightPercent": ${(iR0 ?? (initial.rightPercent - 2)).toFixed(1)},
  "innerBottomPercent": ${(iB0 ?? (initial.bottomPercent - 5)).toFixed(1)},
  "confidence": 0.9
}`;

      const aiResp = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        temperature: 0,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          toClaudeImage(originalImageUrl),
        ]}],
      });

      const raw = (aiResp.content[0] as Anthropic.TextBlock)?.text || "";
      console.log(`[bounds-verify] Raw response: ${raw.substring(0, 200)}`);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log("[bounds-verify] No JSON in response");
        return null;
      }

      const p = JSON.parse(jsonMatch[0]);
      console.log(`[bounds-verify] Parsed: L=${p.leftPercent} T=${p.topPercent} R=${p.rightPercent} B=${p.bottomPercent} conf=${p.confidence}`);

      const vL = Math.max(0, Math.min(100, typeof p.leftPercent   === "number" ? p.leftPercent   : initial.leftPercent));
      const vR = Math.max(0, Math.min(100, typeof p.rightPercent  === "number" ? p.rightPercent  : initial.rightPercent));
      const vB = Math.max(0, Math.min(100, typeof p.bottomPercent === "number" ? p.bottomPercent : initial.bottomPercent));

      // For slabs: pin topPercent to the initial value (label bottom, pre-measured).
      // The verification Claude tends to "correct" it toward card content which is wrong.
      // Allow at most ±4% drift to fix genuinely bad initial detections.
      let vT: number;
      if (mode === "slab") {
        const rawT = typeof p.topPercent === "number" ? Math.max(0, Math.min(100, p.topPercent)) : initial.topPercent;
        const drift = Math.abs(rawT - initial.topPercent);
        if (drift > 4) {
          console.log(`[bounds-verify] Slab top PINNED: verification tried ${rawT.toFixed(1)} (drift=${drift.toFixed(1)}%), keeping initial ${initial.topPercent.toFixed(1)}%`);
          vT = initial.topPercent;
        } else {
          vT = rawT;
        }
      } else {
        vT = Math.max(0, Math.min(100, typeof p.topPercent === "number" ? p.topPercent : initial.topPercent));
      }

      if (vL >= vR || vT >= vB) {
        console.log(`[bounds-verify] Rejected — invalid ordering: L=${vL} T=${vT} R=${vR} B=${vB}`);
        return null;
      }

      const result: typeof initial & { confidence: number } = {
        leftPercent: vL, topPercent: vT, rightPercent: vR, bottomPercent: vB,
        confidence: typeof p.confidence === "number" ? p.confidence : 0.85,
      };

      console.log(`[bounds-verify] Accepted: L=${vL.toFixed(1)} T=${vT.toFixed(1)} R=${vR.toFixed(1)} B=${vB.toFixed(1)} conf=${result.confidence.toFixed(2)}`);

      // Attach inner bounds if returned and valid
      const iLv = typeof p.innerLeftPercent   === "number" ? Math.max(0, Math.min(100, p.innerLeftPercent))   : null;
      let   iTv = typeof p.innerTopPercent    === "number" ? Math.max(0, Math.min(100, p.innerTopPercent))    : null;
      const iRv = typeof p.innerRightPercent  === "number" ? Math.max(0, Math.min(100, p.innerRightPercent))  : null;
      const iBv = typeof p.innerBottomPercent === "number" ? Math.max(0, Math.min(100, p.innerBottomPercent)) : null;

      // For slabs: clamp inner top to within 10% of the outer top (label bottom).
      // Prevents it drifting into the artwork area (e.g. below the Pokémon name bar).
      if (mode === "slab" && iTv !== null && iTv > vT + 10) {
        console.log(`[bounds-verify] Slab innerTop clamped: ${iTv.toFixed(1)} → ${(vT + 3).toFixed(1)} (was >10% below outer top)`);
        iTv = vT + 3;
      }

      if (iLv != null && iTv != null && iRv != null && iBv != null &&
          iLv > vL && iRv < vR && iTv > vT && iBv < vB && iLv < iRv && iTv < iBv) {
        result.innerLeftPercent   = iLv;
        result.innerTopPercent    = iTv;
        result.innerRightPercent  = iRv;
        result.innerBottomPercent = iBv;
        console.log(`[bounds-verify] Inner accepted: iL=${iLv.toFixed(1)} iT=${iTv.toFixed(1)} iR=${iRv.toFixed(1)} iB=${iBv.toFixed(1)}`);
      } else {
        console.log(`[bounds-verify] Inner rejected or not present (iL=${iLv} iT=${iTv} iR=${iRv} iB=${iBv})`);
      }

      return result;
    } catch (err) {
      console.warn("[bounds-verify] Verification failed:", (err as any)?.message);
      return null;
    }
  }

  /**
   * Post-detection calibration of inner bounds for slab images.
   *
   * Key insight: the card's physical top border is mostly hidden behind the grading label.
   * So the AI cannot accurately measure the top white border from the visible image alone.
   * We use the bottom border (fully visible) as a proxy for the top border — since a standard
   * Pokemon card has equal white borders on all 4 sides (~3mm each).
   *
   * For L/R: the AI can see both borders. We use the physical card geometry to cross-check
   * and nudge the inner bounds if they're significantly off from the expected physical width.
   *
   * @param bounds - detected bounds (outer + inner)
   * @param AR - image aspect ratio (width/height). 0 = unknown.
   * @param borderFracW - border as fraction of card width (3/63 ≈ 0.0476)
   * @param borderFracH - border as fraction of card height (3/88 ≈ 0.0341)
   */
  function calibrateSlabInnerBounds(
    bounds: { leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; confidence: number;
              innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number },
    AR: number, borderFracW: number, borderFracH: number
  ): typeof bounds {
    const { leftPercent: L, topPercent: T, rightPercent: R, bottomPercent: B } = bounds;
    const cardWidthPct  = R - L;
    const iL0 = bounds.innerLeftPercent;
    const iT0 = bounds.innerTopPercent;
    const iR0 = bounds.innerRightPercent;
    const iB0 = bounds.innerBottomPercent;

    if (iL0 == null || iT0 == null || iR0 == null || iB0 == null) return bounds;

    const result = { ...bounds };

    // ── L/R calibration ──────────────────────────────────────────────────────────
    // Physical expected white border on each side = borderFracW × cardWidth (as % image width)
    const expectedLRBorder = borderFracW * cardWidthPct; // in % of image width

    const detectedLBorder = iL0 - L;
    const detectedRBorder = R - iR0;

    // Only nudge if the AI's value is more than 50% off the expected (i.e., clearly wrong)
    // and the nudge would move it TOWARD the expected, not away from it.
    const LR_TOLERANCE = 0.5; // allow 50% deviation before calibrating
    const calibLBorder = Math.abs(detectedLBorder - expectedLRBorder) > expectedLRBorder * LR_TOLERANCE
      ? expectedLRBorder : detectedLBorder;
    const calibRBorder = Math.abs(detectedRBorder - expectedLRBorder) > expectedLRBorder * LR_TOLERANCE
      ? expectedLRBorder : detectedRBorder;

    if (calibLBorder !== detectedLBorder)
      console.log(`[slab-calibrate] L border nudged: ${detectedLBorder.toFixed(1)}% → ${calibLBorder.toFixed(1)}% (expected ${expectedLRBorder.toFixed(1)}%)`);
    if (calibRBorder !== detectedRBorder)
      console.log(`[slab-calibrate] R border nudged: ${detectedRBorder.toFixed(1)}% → ${calibRBorder.toFixed(1)}% (expected ${expectedLRBorder.toFixed(1)}%)`);

    result.innerLeftPercent  = L + calibLBorder;
    result.innerRightPercent = R - calibRBorder;

    // ── T/B calibration ──────────────────────────────────────────────────────────
    // The top white border is mostly hidden behind the label, so the AI can only see
    // a sliver (or none) of it. Use the bottom border (fully visible) to estimate the
    // physical top border size via symmetry (3mm border on all sides).
    //
    // Method: bottom border is accurately measured. The physical border is the same size
    // on top. Convert: topBorderPct = bottomBorderPct (if image scale is uniform vertically,
    // which it is for non-distorted photos).
    const measuredBottomBorder = B - iB0; // in % of image height

    // Also compute from physical geometry if image dimensions are known
    let physicalBorderH: number | null = null;
    if (AR > 0) {
      // Card total height as % of image height = cardWidthPct × (88/63) × AR
      const cardHeightPct = cardWidthPct * (88 / 63) * AR;
      physicalBorderH = borderFracH * cardHeightPct; // expected border in % of image height
    }

    // Best estimate: use bottom border (most reliable). Cross-check with physical geometry.
    let estimatedTopBorder = measuredBottomBorder;
    if (physicalBorderH !== null) {
      // If physical geometry gives a very different estimate, blend them
      // (physical geometry is less reliable due to unknown exact image aspect ratio)
      const physBias = 0.3; // weight toward physical geometry
      estimatedTopBorder = measuredBottomBorder * (1 - physBias) + physicalBorderH * physBias;
    }

    // Only override the AI's inner top if the symmetry estimate is meaningfully different
    // and if the AI's value seems too small or too large
    const calibInnerTop = T + estimatedTopBorder;
    const AI_inner_top_gap = iT0 - T;
    const TOP_TOLERANCE = 0.4; // allow 40% deviation from the symmetry estimate

    if (Math.abs(AI_inner_top_gap - estimatedTopBorder) > estimatedTopBorder * TOP_TOLERANCE) {
      console.log(`[slab-calibrate] innerTop adjusted: AI gave T+${AI_inner_top_gap.toFixed(1)}% (${iT0.toFixed(1)}%), symmetry says T+${estimatedTopBorder.toFixed(1)}% → using ${calibInnerTop.toFixed(1)}%`);
      result.innerTopPercent = calibInnerTop;
    }

    // Keep inner bottom as-is (it's the most directly measurable)
    result.innerBottomPercent = iB0;

    // Final validity check
    const fL = result.innerLeftPercent!;
    const fT = result.innerTopPercent!;
    const fR = result.innerRightPercent!;
    const fB = result.innerBottomPercent!;
    if (fL <= L || fT <= T || fR >= R || fB >= B || fL >= fR || fT >= fB) {
      console.log(`[slab-calibrate] Calibrated inner bounds invalid, reverting to original`);
      return bounds;
    }

    console.log(`[slab-calibrate] Final inner: iL=${fL.toFixed(1)} iT=${fT.toFixed(1)} iR=${fR.toFixed(1)} iB=${fB.toFixed(1)}`);
    console.log(`[slab-calibrate] Centering: L/R=${((fL-L)/((fL-L)+(R-fR))*100).toFixed(0)}/${((R-fR)/((fL-L)+(R-fR))*100).toFixed(0)} T/B=${((fT-T)/((fT-T)+(B-fB))*100).toFixed(0)}/${((B-fB)/((fT-T)+(B-fB))*100).toFixed(0)}`);

    return result;
  }

  async function detectSlabCardBoundsWithAI(imageUrl: string): Promise<{ leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; confidence: number; innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number } | null> {
    const CARD_RATIO = 2.5 / 3.5; // 0.714
    const RATIO_TOLERANCE = 0.25; // relaxed — slabs with dark cards can appear slightly non-square
    try {
      // Extract image dimensions for calibration hints
      let imgW = 0, imgH = 0;
      try {
        const buf = Buffer.from(imageUrl.replace(/^data:[^;]+;base64,/, ""), "base64");
        const meta = await sharp(buf).metadata();
        imgW = meta.width ?? 0;
        imgH = meta.height ?? 0;
      } catch (_) {}

      // Physical calibration constants (standard Pokemon card: 63mm × 88mm, ~3mm white border)
      const BORDER_FRAC_WIDTH  = 3 / 63;  // border as fraction of card width  (~0.0476)
      const BORDER_FRAC_HEIGHT = 3 / 88;  // border as fraction of card height (~0.0341)
      const AR = imgW > 0 && imgH > 0 ? imgW / imgH : 0; // image width/height ratio (e.g. 0.67 for portrait)

      const calibrationNote = imgW > 0 && imgH > 0 ? `
IMAGE DIMENSIONS: ${imgW}px wide × ${imgH}px tall (W/H ratio = ${AR.toFixed(3)})
PHYSICAL CALIBRATION for standard cards (63mm × 88mm, ~3mm white border):
  If you detect the card as X% of image width (outer right − outer left = X):
    • Expected left/right white border = X × ${BORDER_FRAC_WIDTH.toFixed(4)} % of image width ≈ X × 0.048%
      e.g. card is 80% wide → each side border ≈ 3.8% of image width
    • Card total height (as % of image height) = X × (88/63) × (${imgW}/${imgH}) = X × ${(88/63 * imgW/imgH).toFixed(4)}%
    • Expected top/bottom white border = X × ${BORDER_FRAC_HEIGHT.toFixed(4)} × (${imgW}/${imgH}) % of image height = X × ${(BORDER_FRAC_HEIGHT * imgW / imgH).toFixed(4)}%
      e.g. card is 80% wide → each top/bottom border ≈ ${(80 * BORDER_FRAC_HEIGHT * imgW / imgH).toFixed(1)}% of image height
  Use these formulas to sanity-check your inner bounds before returning.` : "";

      // Ask Claude for all four visible edges including labelBottomPercent.
      // labelBottomPercent = where the grading label ends and card becomes visible = the effective TOP line.
      const aiPrompt = `You are analyzing a Pokemon card inside a graded plastic slab case. Find the card boundaries for the centering measurement tool.
${calibrationNote}

SLAB ANATOMY (from outside to inside):
1. OUTER SLAB FRAME: Rigid coloured plastic border around the outside. NOT the card.
2. GRADING LABEL: Printed label at the top of the slab showing the card name and grade. The CARD IS BEHIND THIS LABEL — the card extends up under the label.
3. TRANSPARENT WINDOW: Clear plastic through which you see the card below the label.
4. THE CARD ITSELF: The printed Pokemon card material. THIS is what you measure.

WHAT TO FIND:
- leftPercent: LEFT physical edge of the card — where card material meets the clear inner slab plastic. Clear plastic is visible to the LEFT of this point.
- rightPercent: RIGHT physical edge of the card — same on the right side. Clear plastic is visible to the RIGHT of this point.
- bottomPercent: BOTTOM physical edge of the card — where card material meets the slab bottom plastic.
- labelBottomPercent: Where the GRADING LABEL ends and the card becomes VISIBLE. This is the bottom edge of the printed label panel. Below this line, the card artwork is clearly visible through the clear plastic window. This is the most important value for the centering tool top line.

VISUAL GUIDANCE for left/right:
- The card occupies 65-85% of the image width, centred horizontally.
- Clear/transparent plastic is visible between the card edge and the outer slab frame on both sides.
- Standard cards with white border: LEFT edge = where white printed border meets transparent plastic.
- Illustration Rare / Full Art / Special Illustration Rare cards: LEFT edge = where dark artwork meets transparent plastic — a subtle but visible material boundary.
- Do NOT use the outer slab frame edges. The card is INSIDE the frame. Left edge is typically 8-18% from image left; right edge is typically 82-92% from image left.

VISUAL GUIDANCE for labelBottomPercent:
- Look for the horizontal line where the printed grading label panel ends.
- Below this line: card artwork is clearly visible through clear plastic.
- Above/at this line: the label (with text, barcode, certification number) is printed.
- Typically 15-35% from the top of the image for standard slab photos.
- For ACE slabs: label typically covers the top 20-30% of the image.
- For PSA slabs: label typically covers the top 15-25% of the image.

INNER BORDER BOUNDARY — CRITICAL FOR CENTERING ACCURACY:
The "inner bounds" define the card's OWN PRINTED BORDER edges — NOT the central artwork area. This is the thin coloured strip that forms the card's printed frame, just inside the physical card edge. This is what grading companies measure for centering.

STEP 1 — Identify the card type first:
A) "Standard card" — has a visible white border strip (3-8mm) between the card's physical edge and the coloured card frame. The inner bound is at the INNER EDGE of this white strip.
B) "Illustration Rare / Special Illustration Rare / Full Art" — the design extends almost to the physical card edge with only a very thin (1-2mm) or no white border. Inner bound is 1-3% inside the outer card edge.
C) "Art Rare / ex / V card" — thin coloured border with minimal white strip. Inner bound is 2-5% inside the outer card edge.

STEP 2 — INNER TOP (most important line — use color-transition detection):
For standard cards: just below the label, you'll see a thin WHITE strip before the colored card frame begins. The inner top is the horizontal line where this WHITE area ends and the COLORED FRAME begins — look for the color change from white/light to the card's frame color (yellow, blue, brown, red etc.).
For Illustration Rare / Full Art / Special Illustration Rare: there is no visible white strip below the label — the card's design (artwork or colored border) begins almost immediately at the label bottom. Inner top = labelBottomPercent + 1-2%.
⚠️ Do NOT place innerTopPercent at the bottom of the Pokémon name/HP bar — that is far too low. Look at the very first color change just below the label.

STEP 3 — INNER LEFT and INNER RIGHT (use color-transition detection):
On the left side of the card (moving from the physical card edge toward the center):
- Standard cards: you'll see a WHITE strip, then a color change where the card's COLORED FRAME begins. Inner left = where the white ends and colored frame starts.
- Illustration Rare / Full Art: almost no white — the colored design starts within 1-3% of the physical card edge. Inner left = outer left + 1-3%.
On the right side: mirror image. Inner right = where the colored frame ends before the right white border begins (standard), or outer right − 1-3% (Illustration Rare).

STEP 4 — INNER BOTTOM (use color-transition detection):
Below the main card content area, for standard cards there's a white border strip. Inner bottom = where the card's colored design ends and the white bottom border begins. For Illustration Rare: inner bottom = outer bottom − 1-3%.

Return ONLY this JSON:
{
  "leftPercent": <CARD left edge as % of image width, NOT the slab frame>,
  "rightPercent": <CARD right edge as % of image width, NOT the slab frame>,
  "bottomPercent": <CARD bottom edge as % of image height>,
  "labelBottomPercent": <bottom edge of grading label where card becomes visible, as % of image height>,
  "cardType": <"standard" | "illustration_rare" | "full_art" | "art_rare">,
  "innerLeftPercent": <inner left border edge, as % of image width>,
  "innerTopPercent": <inner top border edge, slightly below labelBottomPercent, as % of image height>,
  "innerRightPercent": <inner right border edge, as % of image width>,
  "innerBottomPercent": <inner bottom border edge, as % of image height>,
  "confidence": <0.0-1.0>
}`;

      const aiResp = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        temperature: 0,
        messages: [{ role: "user", content: [
          { type: "text", text: aiPrompt },
          toClaudeImage(imageUrl),
        ]}],
      });

      const raw = (aiResp.content[0] as Anthropic.TextBlock)?.text || "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log("[slab-ai-bounds] No JSON in response");
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const { leftPercent, rightPercent, bottomPercent, labelBottomPercent, confidence,
              innerLeftPercent, innerTopPercent, innerRightPercent, innerBottomPercent } = parsed;

      // Validate left/right/bottom
      if (typeof leftPercent !== "number" || typeof rightPercent !== "number" ||
          typeof bottomPercent !== "number") {
        console.log("[slab-ai-bounds] Missing numeric fields");
        return null;
      }

      const cL = Math.max(0, Math.min(100, leftPercent));
      const cR = Math.max(0, Math.min(100, rightPercent));
      const cB = Math.max(0, Math.min(100, bottomPercent));

      if (cL >= cR) {
        console.log(`[slab-ai-bounds] Rejected — invalid L/R: L=${cL} R=${cR}`);
        return null;
      }

      const cardWidth = cR - cL;
      if (cardWidth < 10) {
        console.log(`[slab-ai-bounds] Rejected — card too narrow: ${cardWidth.toFixed(1)}%`);
        return null;
      }

      // Use labelBottomPercent as effective topPercent if valid (visible card top below label).
      // This is what the user sees and what grading companies measure against.
      // Fall back to aspect-ratio computation if labelBottomPercent is not usable.
      let cT: number;
      if (typeof labelBottomPercent === "number" && labelBottomPercent > 5 && labelBottomPercent < cB - 10) {
        cT = Math.max(0, Math.min(100, labelBottomPercent));
        console.log(`[slab-ai-bounds] Using labelBottomPercent=${cT.toFixed(1)} as effective top`);
      } else {
        // Fallback: compute from aspect ratio (physical card top behind label)
        const cardHeight = cardWidth / CARD_RATIO;
        cT = Math.max(0, cB - cardHeight);
        console.log(`[slab-ai-bounds] labelBottomPercent invalid (${labelBottomPercent}), using aspect-ratio top=${cT.toFixed(1)}`);
      }

      if (cT >= cB) {
        console.log(`[slab-ai-bounds] Rejected — computed top >= bottom`);
        return null;
      }

      const result: { leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; confidence: number; innerLeftPercent?: number; innerTopPercent?: number; innerRightPercent?: number; innerBottomPercent?: number } = {
        leftPercent: cL, topPercent: cT, rightPercent: cR, bottomPercent: cB,
        confidence: confidence ?? 0.8,
      };

      // Attach inner bounds if returned and valid
      if (typeof innerLeftPercent === "number" && typeof innerTopPercent === "number" &&
          typeof innerRightPercent === "number" && typeof innerBottomPercent === "number") {
        const iL = Math.max(0, Math.min(100, innerLeftPercent));
        let iT = Math.max(0, Math.min(100, innerTopPercent));
        const iR = Math.max(0, Math.min(100, innerRightPercent));
        const iB = Math.max(0, Math.min(100, innerBottomPercent));

        // Clamp inner top to be close to label bottom (cT).
        // If AI places it more than 12% below the outer top, it has drifted into
        // the artwork area (e.g. below the Pokémon name bar). Clamp it back.
        const maxInnerTopOffset = 12; // percent of image height
        if (iT > cT + maxInnerTopOffset) {
          const cardType = parsed.cardType ?? "";
          const defaultOffset = cardType === "standard" ? 5 : 2;
          iT = cT + defaultOffset;
          console.log(`[slab-ai-bounds] innerTop clamped from ${innerTopPercent.toFixed(1)} → ${iT.toFixed(1)} (was too far below label bottom ${cT.toFixed(1)})`);
        }

        if (iL > cL && iR < cR && iT > cT && iB < cB && iL < iR && iT < iB) {
          result.innerLeftPercent   = iL;
          result.innerTopPercent    = iT;
          result.innerRightPercent  = iR;
          result.innerBottomPercent = iB;
        }
      }

      console.log(`[slab-ai-bounds] Initial: L=${cL.toFixed(1)} T=${cT.toFixed(1)} R=${cR.toFixed(1)} B=${cB.toFixed(1)} conf=${confidence?.toFixed(2)} (top calculated from aspect ratio)`);

      // ── Verification pass: show Claude the image + text coordinates to check ──
      // Tries to draw lines on the image first; falls back to original image.
      // Claude looks at the image and corrects any edges that are off.
      try {
        const imageForVerify = await drawBoundsOnImage(imageUrl, result).catch(() => imageUrl);
        const verified = await verifyAndCorrectBoundsWithAI(imageForVerify, result, "slab");
        if (verified) {
          console.log(`[slab-ai-bounds] Verified: L=${verified.leftPercent.toFixed(1)} T=${verified.topPercent.toFixed(1)} R=${verified.rightPercent.toFixed(1)} B=${verified.bottomPercent.toFixed(1)} conf=${verified.confidence.toFixed(2)}`);
          return calibrateSlabInnerBounds(verified, AR, BORDER_FRAC_WIDTH, BORDER_FRAC_HEIGHT);
        }
      } catch (verifyErr) {
        console.warn("[slab-ai-bounds] Verification step failed, using initial bounds:", (verifyErr as any)?.message);
      }

      return calibrateSlabInnerBounds(result, AR, BORDER_FRAC_WIDTH, BORDER_FRAC_HEIGHT);
    } catch (err) {
      console.warn("[slab-ai-bounds] AI detection failed:", (err as any)?.message);
      return null;
    }
  }

  /**
   * Fallback heuristic for slab card bounds when both AI and Sobel fail.
   * Uses known slab geometry: label ~15% top, card inset ~12% each side.
   */
  function slabGeometryFallback(sobelBounds: { leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number } | null): { leftPercent: number; topPercent: number; rightPercent: number; bottomPercent: number; confidence: number } {
    const CARD_RATIO = 0.714; // 2.5 / 3.5
    if (sobelBounds) {
      const sw = sobelBounds.rightPercent - sobelBounds.leftPercent;
      const sh = sobelBounds.bottomPercent - sobelBounds.topPercent;
      const ratio = sw / sh;
      if (Math.abs(ratio - CARD_RATIO) < 0.20) {
        // Sobel found a card-shaped rectangle — fix the top edge using aspect ratio
        // (Sobel may have found the label-card boundary as "top", so recalculate from bottom+width)
        const cardBottom = sobelBounds.bottomPercent;
        const cardLeft   = sobelBounds.leftPercent;
        const cardRight  = sobelBounds.rightPercent;
        const cardTop    = cardBottom - sw / CARD_RATIO;
        return { leftPercent: cardLeft, topPercent: cardTop, rightPercent: cardRight, bottomPercent: cardBottom, confidence: 0.5 };
      }
      // Sobel found the slab case — derive card bounds from it:
      // Card inset ≈ 6% each side horizontally; card bottom inset ≈ 3% from slab bottom
      // Card top is computed from card bottom and card width (aspect ratio), not from label position
      const sideInset = 0.06;
      const bottomInset = 0.03;
      const cardLeft   = sobelBounds.leftPercent  + sw * sideInset;
      const cardRight  = sobelBounds.rightPercent - sw * sideInset;
      const cardBottom = sobelBounds.bottomPercent - sh * bottomInset;
      const cardWidth  = cardRight - cardLeft;
      const cardTop    = cardBottom - cardWidth / CARD_RATIO;
      return { leftPercent: cardLeft, topPercent: cardTop, rightPercent: cardRight, bottomPercent: cardBottom, confidence: 0.4 };
    }
    // Absolute fallback: card fills roughly 70% of image width, centred
    // Compute top from bottom using aspect ratio
    const cardLeft = 15, cardRight = 85, cardBottom = 94;
    const cardTop = cardBottom - (cardRight - cardLeft) / CARD_RATIO;
    return { leftPercent: cardLeft, topPercent: cardTop, rightPercent: cardRight, bottomPercent: cardBottom, confidence: 0.3 };
  }

  async function performCrossoverGrading(
    slabImage: string,
    logPrefix: string = "[crossover-grade]",
    slabBackImage?: string,
    certData?: { company: string; grade: string; certNumber: string },
  ): Promise<any> {
    const gradeStartTime = Date.now();
    const rawSlabUrl = slabImage.startsWith("data:") ? slabImage : `data:image/jpeg;base64,${slabImage}`;
    const slabUrl = await optimizeImageForAI(rawSlabUrl, 2048);
    const slabBackUrl = slabBackImage
      ? await optimizeImageForAI(slabBackImage.startsWith("data:") ? slabBackImage : `data:image/jpeg;base64,${slabBackImage}`, 2048)
      : null;
    console.log(`${logPrefix} Optimized slab image(s) in ${Date.now() - gradeStartTime}ms`);

    const setRef = getCurrentSetReference();

    const prompt = `You are an expert Pokemon card crossover grader. You are looking at a Pokemon card currently in a graded slab.

FIRST: Read the slab label in the image to identify the grading company and the grade assigned. This is essential — do not skip this step.

Your task is to visually analyse the card inside the slab and estimate what grade it would receive from PSA, BGS (Beckett), ACE, TAG, and CGC.

VISUAL ANALYSIS — examine everything visible through the plastic case:
- CENTERING: You MUST measure the card's border ratios — do not guess or default to 50. Look at the card borders visible inside the slab. Compare the left border width to the right border width, and the top border to the bottom border, on both the front and back. Report the larger side as a percentage (e.g., if the left border appears slightly wider than the right, report frontLeftRight = 53 meaning 53/47). Only report 50 if the borders look TRULY IDENTICAL — a card that looks "well centered" is typically 52-56, not 50. PSA is lenient on back centering (up to 75/25 still grades PSA 10 on back), but strict on front (must be 55/45 or better for PSA 10 since 2025).
- CORNERS: Look for whitening, fraying, or damage at all four corners. Corner whitening through the case is a key differentiator — ACE and TAG penalise even minor corner wear more than PSA.
- EDGES: Look for nicks, chips, or wear along all four edges. Any chipping is a significant deduction at all companies.
- SURFACE: Look for scratches, print lines, stains, haze, or loss of gloss on both front and back. CGC is the strictest on surface scratches — even faint scratches that PSA ignores can cost a grade at CGC. TAG also grades surface very strictly.

COMPANY-SPECIFIC STANDARDS (apply these precisely):
- PSA (grades 1-10, whole numbers): Lenient on back centering, moderate on corners, strict on front centering. PSA 9 tolerates minor imperfections. PSA 10 requires near-perfect centering (60/40 or better front, 75/25 or better back), sharp corners, clean edges, and glossy surface.
- BGS/Beckett (sub-grades in 0.5 increments, 1-10; overall = lowest sub-grade or slightly above): Each sub-grade (centering, corners, edges, surface) graded independently. BGS Pristine 10 requires all four sub-grades at 10. BGS Gem Mint 9.5 is achievable with one 9 sub-grade. A BGS 9 overall typically means one or two sub-grades at 8.5. BGS is stricter than PSA across all attributes.
- ACE (grades 1-10, whole numbers): UK-based. Stricter than PSA on corner whitening — even minor corner wear that PSA overlooks can drop ACE from 10 to 9. Similar centering tolerance to PSA on front, but more strict on back centering than PSA.
- TAG (grades 1-10, halves possible): Premium ultra-strict grader. Extremely strict on surface scratches and centering. TAG 10 requires essentially perfect cards. TAG 9 is common where PSA/ACE would give 10. Surface scratches visible under the case will cost at least half a grade.
- CGC (grades 1-10, halves possible): Stricter on surface scratches than PSA. CGC uses a different label system but similar 1-10 scale. Surface micro-scratches that PSA ignores will typically cost CGC a grade. Centering standards similar to PSA.

CROSSOVER PATTERNS TO CONSIDER:
- PSA 10 → BGS: Often BGS 9-9.5 (Beckett is stricter). Only becomes BGS Pristine 10 if all four attributes are visually flawless.
- PSA 9 → BGS: Often BGS 8.5-9, rarely BGS 9.5.
- BGS 9.5 → PSA: Often PSA 10 if centering and surface are clean.
- ACE 10 → PSA: Often PSA 9-10. ACE 10s with clean surfaces usually crossover PSA 10.
- TAG 9 → PSA: Often PSA 10, as TAG grades more strictly.

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
    "notes": "Overall PSA crossover assessment — which attribute(s) drive any grade difference"
  },
  "beckett": {
    "overallGrade": 9,
    "centering": { "grade": 9, "notes": "Centering sub-grade reasoning" },
    "corners": { "grade": 9, "notes": "Corner sub-grade reasoning" },
    "edges": { "grade": 9, "notes": "Edge sub-grade reasoning" },
    "surface": { "grade": 9, "notes": "Surface sub-grade reasoning" },
    "notes": "Overall BGS assessment — note which sub-grade limits the overall"
  },
  "ace": {
    "overallGrade": 9,
    "centering": { "grade": 9, "notes": "ACE centering assessment" },
    "corners": { "grade": 9, "notes": "ACE corner assessment — note if their stricter standard changes the grade" },
    "edges": { "grade": 9, "notes": "ACE edge assessment" },
    "surface": { "grade": 9, "notes": "ACE surface assessment" },
    "notes": "Overall ACE crossover assessment"
  },
  "tag": {
    "overallGrade": 9,
    "centering": { "grade": 9, "notes": "TAG centering — note if TAG's stricter standard changes the assessment" },
    "corners": { "grade": 9, "notes": "TAG corner assessment" },
    "edges": { "grade": 9, "notes": "TAG edge assessment" },
    "surface": { "grade": 9, "notes": "TAG surface — note if surface scratches visible that TAG would penalise" },
    "notes": "Overall TAG crossover assessment"
  },
  "cgc": {
    "grade": 9,
    "centering": "CGC centering assessment",
    "corners": "CGC corner assessment",
    "edges": "CGC edge assessment",
    "surface": "CGC surface assessment — note if surface scratches CGC would penalise more than the current slab grade",
    "notes": "Overall CGC crossover assessment"
  }
}`;

    const contentParts: any[] = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: slabUrl, detail: "high" } },
    ];
    if (slabBackUrl) {
      contentParts.push({ type: "image_url", image_url: { url: slabBackUrl, detail: "high" } });
    }

    const [response, detectedFront, detectedBack, aiFront, aiBack] = await Promise.all([
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        temperature: 0.2,
        timeout: 120_000, // 2-minute hard cap on Claude API call
        messages: [
          {
            role: "user",
            content: convertToClaudeContent(contentParts),
          },
        ],
      }),
      detectCardBounds(slabUrl, true),
      slabBackUrl ? detectCardBounds(slabBackUrl, true) : Promise.resolve(null),
      detectSlabCardBoundsWithAI(slabUrl),
      slabBackUrl ? detectSlabCardBoundsWithAI(slabBackUrl) : Promise.resolve(null),
    ]);

    const rawContent = (response.content[0] as Anthropic.TextBlock)?.text || "";
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in crossover response");

    const result = repairAndParseJSON(jsonMatch[0]);
    if (!result) throw new Error("Failed to parse crossover response JSON (repair exhausted)");

    if (!result.psa?.grade) throw new Error("Invalid crossover result structure");

    const resolvedSetName = resolveSetName(result.setNumber || "", result.setName || "");
    result.setName = resolvedSetName;

    // Prefer AI bounds (Claude-detected), fall back to Sobel, then geometry heuristic
    const frontSource = aiFront ? "AI" : detectedFront ? "Sobel" : "heuristic";
    // If Sobel ran but not AI, apply geometry heuristic to check if Sobel found the card or outer slab
    const frontBoundsResolved = aiFront
      ? aiFront
      : detectedFront
        ? slabGeometryFallback(detectedFront)
        : slabGeometryFallback(null);
    console.log(`${logPrefix} Front bounds source: ${frontSource} (conf=${frontBoundsResolved.confidence?.toFixed(2) ?? "?"})`);
    result.frontCardBounds = enforceCardBounds(frontBoundsResolved);

    const backSource = aiBack ? "AI" : detectedBack ? "Sobel" : "none";
    if (detectedBack || aiBack) {
      const backBoundsResolved = aiBack
        ? aiBack
        : slabGeometryFallback(detectedBack!);
      console.log(`${logPrefix} Back bounds source: ${backSource} (conf=${backBoundsResolved.confidence?.toFixed(2) ?? "?"})`);
      result.backCardBounds = enforceCardBounds(backBoundsResolved);
    }

    // If cert data was provided (from cert lookup), override the AI-read slab label with known values
    if (certData) {
      result.currentGrade = {
        company:    certData.company,
        grade:      certData.grade,
        certNumber: certData.certNumber,
      };
    }

    console.log(`${logPrefix} Crossover complete in ${Date.now() - gradeStartTime}ms`);
    return result;
  }

  // ─── Cert Lookup Helpers ──────────────────────────────────────────────────

  async function downloadImageAsBase64(url: string): Promise<string | null> {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return null;
      const arrayBuf = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const contentType = resp.headers.get("content-type") || "image/jpeg";
      const mime = contentType.split(";")[0].trim();
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return null;
    }
  }

  async function fetchPSACertFromAPI(certNumber: string) {
    const apiUrl = `https://api.psacard.com/publicapi/cert/GetByCertNumber/${certNumber}`;
    const resp = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://www.psacard.com",
        "Referer": "https://www.psacard.com/",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (resp.status === 429) throw new Error("RATE_LIMITED");
    if (resp.status === 401 || resp.status === 403) throw new Error("AUTH_REQUIRED");
    if (resp.status === 404) throw new Error(`PSA cert #${certNumber} not found. Please check the number and try again.`);
    if (!resp.ok) throw new Error(`PSA cert lookup failed (${resp.status}).`);
    const data = await resp.json() as any;
    const cert = data?.PSACert;
    if (!cert) throw new Error("PSA cert not found.");
    return cert;
  }

  async function fetchPSACertFromHTML(certNumber: string) {
    // Try HTML page which may have SSR/embedded JSON data (__NEXT_DATA__ or similar)
    const pageUrl = `https://www.psacard.com/cert/${certNumber}`;
    const resp = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // Try Next.js __NEXT_DATA__ embedded JSON
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // Navigate into Next.js page props to find cert data
        const props = nextData?.props?.pageProps;
        const cert = props?.cert || props?.certData || props?.data?.PSACert;
        if (cert) return cert;
      } catch { /* continue */ }
    }

    // Try looking for JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        // May have image and name
        if (ld.image || ld.name) {
          return { Subject: ld.name, Front: Array.isArray(ld.image) ? ld.image[0] : ld.image, PSAGrade: null, Year: null };
        }
      } catch { /* continue */ }
    }

    return null;
  }

  async function fetchPSACert(certNumber: string) {
    let cert: any = null;
    let usedFallback = false;

    try {
      cert = await fetchPSACertFromAPI(certNumber);
    } catch (apiErr: any) {
      if (apiErr.message === "RATE_LIMITED" || apiErr.message === "AUTH_REQUIRED") {
        console.log(`[cert-lookup] PSA API ${apiErr.message === "RATE_LIMITED" ? "rate-limited" : "requires auth"}, trying HTML fallback`);
        usedFallback = true;
        cert = await fetchPSACertFromHTML(certNumber);
        if (!cert) {
          throw new Error(
            apiErr.message === "RATE_LIMITED"
              ? "PSA lookup is temporarily unavailable (rate limited). Please try again in a moment, or add photos manually."
              : "PSA cert lookup is currently unavailable. Please add photos of your slab manually."
          );
        }
      } else {
        throw apiErr;
      }
    }

    const [frontImageBase64, backImageBase64] = await Promise.all([
      cert.Front ? downloadImageAsBase64(cert.Front) : null,
      cert.Back  ? downloadImageAsBase64(cert.Back)  : null,
    ]);

    if (!frontImageBase64) {
      if (usedFallback) {
        throw new Error("PSA lookup is temporarily unavailable. Please add photos of your slab manually.");
      }
      throw new Error("Could not download card image from PSA. Please try again or add photos manually.");
    }

    const cardName = [cert.Subject, cert.CardNumber ? `#${cert.CardNumber}` : ""].filter(Boolean).join(" ").trim();
    return {
      cardName: cardName || "Unknown Card",
      setName:  cert.Year  || "",
      grade:    String(cert.PSAGrade || ""),
      company:  "PSA",
      certNumber,
      frontImageBase64,
      backImageBase64: backImageBase64 ?? undefined,
    };
  }

  async function fetchACECert(certNumber: string) {
    const url = `https://www.acegradingcards.com/verify/?cert_number=${certNumber}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`ACE cert lookup failed (${resp.status})`);
    const html = await resp.text();
    const root = parseHtml(html);

    const cardImg = root.querySelector(".cert-image img, .card-image img, .cert-front img");
    const gradeEl = root.querySelector(".cert-grade, .grade-value, [class*='grade']");
    const nameEl  = root.querySelector(".cert-name, .card-name, h1, h2");

    if (!cardImg && !gradeEl) throw new Error("ACE cert not found — this cert number may not exist or ACE lookup requires JavaScript. Please add a photo manually.");

    const imgSrc = cardImg?.getAttribute("src") || cardImg?.getAttribute("data-src");
    const frontImageBase64 = imgSrc ? await downloadImageAsBase64(imgSrc.startsWith("http") ? imgSrc : `https://www.acegradingcards.com${imgSrc}`) : null;
    if (!frontImageBase64) throw new Error("ACE cert image unavailable. Please add a photo manually.");

    return {
      cardName:        nameEl?.text?.trim()  || "Unknown Card",
      setName:         "",
      grade:           gradeEl?.text?.trim() || "",
      company:         "ACE",
      certNumber,
      frontImageBase64,
      backImageBase64: undefined,
    };
  }

  async function fetchBGSCert(certNumber: string) {
    const url = `https://www.beckett.com/grading/submit-certification/?certNum=${certNumber}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`BGS lookup failed (${resp.status}). Beckett requires photos — please add photos manually.`);
    const html = await resp.text();
    const root = parseHtml(html);

    const imgEl = root.querySelector(".cert-img img, .certification-image img, .card-front img");
    const gradeEl = root.querySelector(".cert-grade, .overall-grade, [class*='grade-value']");
    const nameEl  = root.querySelector(".cert-subject, .card-title, h1");

    if (!imgEl && !gradeEl) throw new Error("BGS (Beckett) cert lookup requires a browser session. Please add photos manually instead.");

    const imgSrc = imgEl?.getAttribute("src");
    const frontImageBase64 = imgSrc ? await downloadImageAsBase64(imgSrc.startsWith("http") ? imgSrc : `https://www.beckett.com${imgSrc}`) : null;
    if (!frontImageBase64) throw new Error("BGS cert image unavailable. Please add photos manually.");

    return {
      cardName:        nameEl?.text?.trim()  || "Unknown Card",
      setName:         "",
      grade:           gradeEl?.text?.trim() || "",
      company:         "BGS",
      certNumber,
      frontImageBase64,
      backImageBase64: undefined,
    };
  }

  async function fetchCGCCert(certNumber: string) {
    const url = `https://app.cgccards.com/certlookup/${certNumber}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "text/html,application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`CGC lookup failed (${resp.status}). Please add photos manually.`);
    const text = await resp.text();

    // CGC may return JSON
    try {
      const json = JSON.parse(text) as any;
      const item = json?.item || json?.data || json;
      if (item?.imageFrontUrl || item?.front_image_url) {
        const imgUrl = item.imageFrontUrl || item.front_image_url;
        const frontImageBase64 = await downloadImageAsBase64(imgUrl);
        if (!frontImageBase64) throw new Error("CGC cert image unavailable. Please add photos manually.");
        return {
          cardName:        item.name || item.subjectName || "Unknown Card",
          setName:         item.set  || item.setName     || "",
          grade:           String(item.grade || item.gradeCode || ""),
          company:         "CGC",
          certNumber,
          frontImageBase64,
          backImageBase64: item.imageBackUrl ? (await downloadImageAsBase64(item.imageBackUrl)) ?? undefined : undefined,
        };
      }
    } catch { /* not JSON, parse HTML */ }

    const root = parseHtml(text);
    const imgEl   = root.querySelector(".cert-image img, .card-front img, img[class*='cert']");
    const gradeEl = root.querySelector(".grade, .cert-grade, [class*='grade-value']");
    if (!imgEl && !gradeEl) throw new Error("CGC cert lookup requires JavaScript. Please add photos manually instead.");

    const imgSrc = imgEl?.getAttribute("src");
    const frontImageBase64 = imgSrc ? await downloadImageAsBase64(imgSrc.startsWith("http") ? imgSrc : `https://app.cgccards.com${imgSrc}`) : null;
    if (!frontImageBase64) throw new Error("CGC cert image unavailable. Please add photos manually.");

    return {
      cardName:        root.querySelector("h1, .cert-name")?.text?.trim() || "Unknown Card",
      setName:         "",
      grade:           gradeEl?.text?.trim() || "",
      company:         "CGC",
      certNumber,
      frontImageBase64,
      backImageBase64: undefined,
    };
  }

  async function fetchTAGCert(certNumber: string): Promise<CertLookupResult> {
    const crypto = await import("node:crypto");

    // TAG grading uses a crypto-authenticated API at api.taggrading.com.
    // Authentication: x-tag-key = SHA256(HASH_KEY + ":" + certNumber) in hex.
    // Response: AES-256-CBC encrypted — key = SHA256(DECRYPT_KEY) raw bytes,
    //           format = "ivHex:ciphertextHex".
    const HASH_KEY    = "TZYOj76MKF1Aw0QK0gpAGySALCNgKG";
    const DECRYPT_KEY = "K6ucGQIf7viQW9IT0XLUk5MjSIxssgisqj";

    const xTagKey = crypto.createHash("sha256").update(HASH_KEY + ":" + certNumber).digest("hex");
    const apiUrl  = `https://api.taggrading.com/graded-cards/public/detail/${encodeURIComponent(certNumber)}`;
    console.log(`[cert-lookup] TAG API: ${apiUrl}`);

    let resp: Response;
    try {
      resp = await fetch(apiUrl, {
        headers: {
          "Accept":         "application/json",
          "Content-Type":   "application/json",
          "Origin":         "https://my.taggrading.com",
          "Referer":        "https://my.taggrading.com/",
          "x-tag-key":      xTagKey,
          "User-Agent":     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(20000),
      });
    } catch (e: any) {
      throw new Error("TAG cert lookup couldn't be reached. Please photograph your TAG slab instead.");
    }

    if (resp.status === 404) throw new Error(`TAG cert #${certNumber} was not found. Please check the cert number.`);
    if (!resp.ok) throw new Error(`TAG cert lookup failed (${resp.status}). Please photograph your TAG slab instead.`);

    const encryptedText = await resp.text();

    // Decrypt AES-256-CBC response
    let cardData: any;
    try {
      const key = crypto.createHash("sha256").update(DECRYPT_KEY).digest();
      const colonIdx = encryptedText.indexOf(":");
      if (colonIdx < 0) throw new Error("Unexpected response format");
      const iv         = Buffer.from(encryptedText.substring(0, colonIdx), "hex");
      const ciphertext = encryptedText.substring(colonIdx + 1);
      const decipher   = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted    = decipher.update(ciphertext, "hex", "utf8");
      decrypted       += decipher.final("utf8");
      const parsed     = JSON.parse(decrypted);
      cardData         = parsed?.data;
    } catch {
      throw new Error("TAG cert lookup: could not parse response. Please photograph your TAG slab instead.");
    }

    if (!cardData) throw new Error("TAG cert data not found. Please photograph your TAG slab instead.");

    // Extract card info
    const cardName = cardData.cardName || cardData.card?.cardName || `TAG Cert #${certNumber}`;
    const setParts = [cardData.cardSet?.setName, cardData.cardSet?.subsetName].filter(Boolean);
    const setName  = setParts.join(" – ");
    const grade    = (cardData.grade || cardData.tagXGrade || "").toString().trim();

    // Prefer deskewed (flat) card images over slab photos for analysis accuracy
    const frontUrl = cardData.imageFileDeskewedFront || cardData.imageFileOriginalFront || cardData.imageSlabbedFront;
    const backUrl  = cardData.imageFileDeskewedBack  || cardData.imageSlabbedBack;

    console.log(`[cert-lookup] TAG cert ${certNumber} → ${cardName} | ${setName} | grade: ${grade}`);
    console.log(`[cert-lookup] TAG images → front: ${frontUrl ? "✓" : "✗"} | back: ${backUrl ? "✓" : "✗"}`);

    // Download and resize TAG images — originals are 4000×6000px (high-res scan).
    // We resize to max 1200px on the longer side for efficient transfer & AI analysis.
    async function downloadTagImage(url: string): Promise<string> {
      const raw = await downloadImageAsBase64(url, "https://my.taggrading.com/");
      if (!raw) return "";
      try {
        const base64Data = raw.substring(raw.indexOf(",") + 1);
        const buffer = Buffer.from(base64Data, "base64");
        const resized = await sharp(buffer)
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();
        return `data:image/jpeg;base64,${resized.toString("base64")}`;
      } catch {
        return raw;
      }
    }

    const [frontImageBase64, backImageBase64] = await Promise.all([
      frontUrl ? downloadTagImage(frontUrl).catch(() => "") : Promise.resolve(""),
      backUrl  ? downloadTagImage(backUrl).catch(() => "")  : Promise.resolve(""),
    ]);

    if (!frontImageBase64) throw new Error("TAG cert found but card image could not be downloaded. Please photograph your TAG slab instead.");

    return {
      cardName,
      setName,
      grade,
      company: "TAG",
      certNumber,
      frontImageBase64,
      backImageBase64: backImageBase64 || undefined,
    };
  }

  app.post("/api/cert-lookup", async (req, res) => {
    try {
      const { certNumber, company } = req.body;
      if (!certNumber || !company) {
        return res.status(400).json({ error: "certNumber and company are required" });
      }

      const upper = (company as string).toUpperCase();
      // TAG cert numbers include an alphabetic prefix (e.g. "C5964402") — preserve it.
      // All other companies use purely numeric cert numbers.
      const certStr = upper === "TAG"
        ? certNumber.toString().trim().toUpperCase()
        : certNumber.toString().replace(/\D/g, "");
      if (!certStr) return res.status(400).json({ error: "Invalid cert number" });

      console.log(`[cert-lookup] ${company} cert ${certStr}`);

      let result: any;
      if (upper === "PSA") result = await fetchPSACert(certStr);
      else if (upper === "ACE") result = await lookupACE(certStr);
      else if (upper === "BGS" || upper === "BECKETT") result = await fetchBGSCert(certStr);
      else if (upper === "CGC") result = await fetchCGCCert(certStr);
      else if (upper === "TAG") result = await fetchTAGCert(certStr);
      else throw new Error(`Unsupported company: ${company}`);

      console.log(`[cert-lookup] Found: ${result.cardName} — ${result.company} ${result.grade}`);
      res.json(result);
    } catch (err: any) {
      console.error(`[cert-lookup] Error:`, err.message);
      res.status(422).json({ error: err.message || "Cert lookup failed" });
    }
  });

  app.post("/api/crossover-grade-job", async (req, res) => {
    try {
      const { slabImage, slabBackImage, pushToken, certData, rcUserId } = req.body;
      if (!slabImage) {
        return res.status(400).json({ error: "slabImage is required" });
      }

      const quotaError = await enforceServerQuota(rcUserId, "crossover");
      if (quotaError) return res.status(429).json({ error: quotaError, quotaExceeded: true });

      const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
      console.log(`[crossover-grade-job] Creating job ${jobId}${certData ? ` (cert: ${certData.company} #${certData.certNumber})` : ""}`);
      const job: GradingJob = {
        id: jobId,
        status: "processing",
        type: "single",
        pushToken,
        createdAt: Date.now(),
      };
      gradingJobs.set(jobId, job);
      await logGradeEvent(jobId, "crossover");

      res.json({ jobId });

      (async () => {
        const CROSSOVER_TIMEOUT_MS = 4 * 60 * 1000;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Crossover grading timed out — please try again.")), CROSSOVER_TIMEOUT_MS)
        );
        try {
          const result = await Promise.race([
            performCrossoverGrading(slabImage, `[crossover-grade-job:${jobId}]`, slabBackImage, certData),
            timeoutPromise,
          ]);
          job.status = "completed";
          job.result = result;
          await completeGradeEvent(jobId, "completed");
          await recordServerUsage(rcUserId, "crossover");

          if (job.pushToken) {
            const resultName = result.cardName || "your card";
            sendPushNotification(job.pushToken, "Crossover Complete", `${resultName} crossover analysis done!`);
          }
        } catch (err: any) {
          console.error(`[crossover-grade-job] Job ${jobId} failed:`, err.message);
          job.status = "failed";
          job.error = err.message || "Unknown error";
          await completeGradeEvent(jobId, "failed");

          if (job.pushToken) {
            sendPushNotification(job.pushToken, "Crossover Failed", "There was an error analyzing your slab. Please try again.");
          }
        }
      })();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/usage", async (req, res) => {
    const rcUserId = req.query.rcUserId as string;
    if (!rcUserId) return res.status(400).json({ error: "rcUserId required" });
    const usage = await getServerUsage(rcUserId);
    res.json({ yearMonth: getYearMonth(), ...usage });
  });

  // ─── SET IMAGE PROXY (serves cached set logos + symbols from disk) ──────────
  app.get("/api/set-img", async (req, res) => {
    const url = req.query.u as string;
    if (!url) return res.status(400).end();
    const cached = await getOrFetchSetImage(url);
    if (!cached) return res.status(404).end();
    res.set({
      "Content-Type": cached.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(cached.data.length),
    });
    res.end(cached.data);
  });

  // ─── GRADING HISTORY SYNC ─────────────────────────────────────────────────

  app.get("/api/history", async (req, res) => {
    const rcUserId = req.query.rcUserId as string;
    if (!rcUserId) return res.status(400).json({ error: "rcUserId required" });
    try {
      const result = await db.query(
        `SELECT local_id, result_json, timestamp, is_deep_grade, is_crossover
         FROM grading_history
         WHERE rc_user_id = $1
         ORDER BY timestamp DESC
         LIMIT 100`,
        [rcUserId]
      );
      const rows = result.rows.map((r: any) => ({
        id: r.local_id,
        result: r.result_json,
        timestamp: r.timestamp,
        isDeepGrade: r.is_deep_grade,
        isCrossover: r.is_crossover,
      }));
      res.json(rows);
    } catch (e: any) {
      console.error("[history] GET failed:", e.message);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.post("/api/history", async (req, res) => {
    const { rcUserId, localId, result, timestamp, isDeepGrade, isCrossover } = req.body;
    if (!rcUserId || !localId || !result) return res.status(400).json({ error: "rcUserId, localId, result required" });
    try {
      await db.query(
        `INSERT INTO grading_history (rc_user_id, local_id, result_json, timestamp, is_deep_grade, is_crossover)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (rc_user_id, local_id) DO NOTHING`,
        [rcUserId, localId, JSON.stringify(result), timestamp || Date.now(), !!isDeepGrade, !!isCrossover]
      );
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[history] POST failed:", e.message);
      res.status(500).json({ error: "Failed to save grading" });
    }
  });

  app.post("/api/history/bulk", async (req, res) => {
    const { rcUserId, gradings } = req.body;
    if (!rcUserId || !Array.isArray(gradings)) return res.status(400).json({ error: "rcUserId and gradings array required" });
    try {
      for (const g of gradings) {
        if (!g.localId || !g.result) continue;
        await db.query(
          `INSERT INTO grading_history (rc_user_id, local_id, result_json, timestamp, is_deep_grade, is_crossover)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (rc_user_id, local_id) DO NOTHING`,
          [rcUserId, g.localId, JSON.stringify(g.result), g.timestamp || Date.now(), !!g.isDeepGrade, !!g.isCrossover]
        );
      }
      res.json({ ok: true, count: gradings.length });
    } catch (e: any) {
      console.error("[history] POST /bulk failed:", e.message);
      res.status(500).json({ error: "Failed to bulk save gradings" });
    }
  });

  app.delete("/api/history/:localId", async (req, res) => {
    const { localId } = req.params;
    const rcUserId = req.query.rcUserId as string;
    if (!rcUserId || !localId) return res.status(400).json({ error: "rcUserId and localId required" });
    try {
      await db.query(
        "DELETE FROM grading_history WHERE rc_user_id = $1 AND local_id = $2",
        [rcUserId, localId]
      );
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[history] DELETE failed:", e.message);
      res.status(500).json({ error: "Failed to delete grading" });
    }
  });

  app.post("/api/grade-job", async (req, res) => {
    try {
      const { frontImage, backImage, pushToken, rcUserId } = req.body;
      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back images required" });
      }

      const quotaError = await enforceServerQuota(rcUserId, "quick");
      if (quotaError) return res.status(429).json({ error: quotaError, quotaExceeded: true });

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
      await logGradeEvent(jobId, "quick");

      res.json({ jobId });

      (async () => {
        try {
          const result = await performGrading(frontImage, backImage, `[grade-job:${jobId}]`);
          job.status = "completed";
          job.result = result;
          await completeGradeEvent(jobId, "completed");
          await recordServerUsage(rcUserId, "quick");

          if (job.pushToken) {
            const resultName = result.cardName || "your card";
            sendPushNotification(job.pushToken, "Grading Complete", `${resultName} has been graded!`);
          }
        } catch (err: any) {
          console.error(`[grade-job] Job ${jobId} failed:`, err.message);
          job.status = "failed";
          job.error = err.message || "Unknown error";
          await completeGradeEvent(jobId, "failed");

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
      await logGradeEvent(jobId, "bulk", cards.length);

      res.json({ jobId, totalCards: cards.length });

      (async () => {
        try {
          const BATCH_SIZE = 3;
          const results: Array<{ status: "completed" | "failed"; result?: any; error?: string }> = [];

          for (let i = 0; i < cards.length; i += BATCH_SIZE) {
            const batch = cards.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.allSettled(
              batch.map(async (card: { frontImage: string; backImage: string }, idx: number) => {
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
          const successCount = results.filter(r => r.status === "completed").length;
          console.log(`[bulk-grade-job] Job ${jobId} completed: ${successCount}/${cards.length} succeeded`);
          await completeGradeEvent(jobId, "completed");

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
          await completeGradeEvent(jobId, "failed");

          if (job.pushToken) {
            sendPushNotification(job.pushToken, "Bulk Grading Failed", "There was an error with your bulk grading. Please try again.");
          }
        }
      })();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/deep-grade-job", async (req, res) => {
    try {
      const { frontImage, backImage, angledImage, angledBackImage, frontCorners, backCorners, pushToken, rcUserId } = req.body;
      if (!frontImage || !backImage || !angledImage) {
        return res.status(400).json({ error: "Front, back, and angled images are all required" });
      }

      const quotaError = await enforceServerQuota(rcUserId, "deep");
      if (quotaError) return res.status(429).json({ error: quotaError, quotaExceeded: true });

      const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
      console.log(`[deep-grade-job] Creating job ${jobId}, pushToken: ${pushToken ? pushToken.substring(0, 20) + "..." : "none"}, frontCorners: ${frontCorners?.length || 0}, backCorners: ${backCorners?.length || 0}`);
      const job: GradingJob = {
        id: jobId,
        status: "processing",
        type: "deep",
        pushToken,
        createdAt: Date.now(),
      };
      gradingJobs.set(jobId, job);
      await logGradeEvent(jobId, "deep");

      res.json({ jobId });

      (async () => {
        try {
          const result = await performDeepGrading(frontImage, backImage, angledImage, angledBackImage || undefined, undefined, `[deep-grade-job:${jobId}]`, frontCorners, backCorners);
          job.status = "completed";
          job.result = result;
          await completeGradeEvent(jobId, "completed");
          await recordServerUsage(rcUserId, "deep");

          if (job.pushToken) {
            const resultName = result.cardName || "your card";
            sendPushNotification(job.pushToken, "Deep Grading Complete", `${resultName} has been deep graded!`);
          }
        } catch (err: any) {
          console.error(`[deep-grade-job] Job ${jobId} failed:`, err.message);
          job.status = "failed";
          job.error = err.message || "Unknown error";
          await completeGradeEvent(jobId, "failed");

          if (job.pushToken) {
            sendPushNotification(job.pushToken, "Deep Grading Failed", "There was an error deep grading your card. Please try again.");
          }
        }
      })();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  function respondWithJob(res: any, job: GradingJob) {
    if (job.type === "single" || job.type === "deep") {
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
  }

  app.get("/api/grade-job/:id", (req, res) => {
    const job = gradingJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    // Auto-fail jobs that have been processing for over 10 minutes
    if (job.status === "processing" && job.createdAt && Date.now() - job.createdAt > 10 * 60 * 1000) {
      job.status = "failed";
      job.error = "Grading timed out — please try again.";
    }
    respondWithJob(res, job);
  });

  app.get("/api/crossover-grade-job/:id", (req, res) => {
    const job = gradingJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    // Auto-fail jobs that have been processing for over 5 minutes (handles server restarts / hangs)
    if (job.status === "processing" && job.createdAt && Date.now() - job.createdAt > 5 * 60 * 1000) {
      job.status = "failed";
      job.error = "Crossover grading timed out — please try again.";
    }
    respondWithJob(res, job);
  });

  // ======================================================================
  // Cert Lookup endpoint
  // ======================================================================

  interface CertLookupResult {
    cardName: string;
    setName: string;
    grade: string;
    company: string;
    certNumber: string;
    frontImageBase64: string;
    backImageBase64?: string;
    labelImageBase64?: string;
  }

  async function downloadImageAsBase64(url: string, referer?: string): Promise<string> {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
    };
    if (referer) headers["Referer"] = referer;
    const resp = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`Image download failed: ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.split(";")[0].trim() || "image/jpeg";
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  async function lookupPSA(certNumber: string): Promise<CertLookupResult> {
    // PSA's public API requires authentication and rate-limits unauthenticated
    // server-side requests. Their website also blocks server requests via
    // Cloudflare. Cert lookup for PSA is therefore not reliably available —
    // guide users to photograph their slab instead.
    const apiUrl = `https://api.psacard.com/publicapi/cert/GetByCertNumber/${certNumber}`;
    console.log(`[cert-lookup] PSA API: ${apiUrl}`);

    let resp: Response;
    try {
      resp = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Origin": "https://www.psacard.com",
          "Referer": "https://www.psacard.com/",
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (e: any) {
      throw new Error("PSA's website couldn't be reached — please photograph your PSA slab instead.");
    }

    if (resp.status === 429 || resp.status === 401 || resp.status === 403) {
      throw new Error("PSA's cert lookup is unavailable right now. Please photograph your PSA slab to analyze it.");
    }

    if (resp.ok) {
      const data = await resp.json() as any;
      const certData = data?.PSACert || data?.cert || data;
      if (certData && (certData.CardName || certData.SubjectName)) {
        const cardName = certData.CardName || certData.SubjectName || "";
        const setName = certData.SetName || certData.Category || "";
        const grade = certData.PSAGrade || certData.GradeDescription || certData.Grade || "";
        let frontImageBase64 = "";
        if (certData.FrontImageURL || certData.CertImageURL) {
          try {
            frontImageBase64 = await downloadImageAsBase64(certData.FrontImageURL || certData.CertImageURL, "https://www.psacard.com/");
          } catch (e) {
            console.log(`[cert-lookup] PSA image download failed: ${e}`);
          }
        }
        if (!frontImageBase64) throw new Error("PSA cert found but image could not be downloaded — please photograph your PSA slab instead.");
        return { cardName, setName, grade: String(grade), company: "PSA", certNumber, frontImageBase64 };
      }
    }

    throw new Error("PSA cert not found. Check the cert number, or photograph your PSA slab instead.");
  }

  async function lookupBGS(certNumber: string): Promise<CertLookupResult> {
    const url = `https://www.beckett.com/grading/card/${certNumber}`;
    console.log(`[cert-lookup] BGS: ${url}`);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`BGS cert lookup unavailable for this company — please add photos manually`);
    const html = await resp.text();
    const root = parseHtml(html);

    const cardName = root.querySelector(".card-title")?.text?.trim()
      || root.querySelector("h1")?.text?.trim()
      || root.querySelector(".item-title")?.text?.trim()
      || "";
    const grade = root.querySelector(".grade-value")?.text?.trim()
      || root.querySelector(".bgs-grade")?.text?.trim()
      || root.querySelector("[class*='grade']")?.text?.trim()
      || "";
    const imgEl = root.querySelector(".card-image img") || root.querySelector(".item-image img") || root.querySelector("img[src*='beckett']");
    const imgSrc = imgEl?.getAttribute("src") || "";

    if (!cardName && !grade) throw new Error("BGS cert lookup unavailable for this company — please add photos manually");

    let frontImageBase64 = "";
    if (imgSrc) {
      const imgUrl = imgSrc.startsWith("http") ? imgSrc : `https://www.beckett.com${imgSrc}`;
      try { frontImageBase64 = await downloadImageAsBase64(imgUrl, "https://www.beckett.com/"); } catch {}
    }
    if (!frontImageBase64) throw new Error("BGS cert found but image could not be downloaded — please add photos manually");
    return { cardName, setName: "", grade, company: "BGS", certNumber, frontImageBase64 };
  }

  async function lookupCGC(certNumber: string): Promise<CertLookupResult> {
    // CGC's cert lookup website blocks server-side requests (returns 403).
    // Guide users to photograph their CGC slab instead.
    throw new Error("CGC's cert lookup is not accessible. Please photograph your CGC slab to analyze it.");
  }

  async function lookupACE(certNumber: string): Promise<CertLookupResult> {
    // ACE Grading (acegrading.com) — page is accessible with browser UA via curl.
    // Node.js fetch/https.request are blocked by Cloudflare JA3 TLS fingerprinting.
    // We shell out to curl which uses libcurl's TLS stack (different fingerprint → 200).
    // Grade is extracted from the Livewire snapshot pop data embedded in the initial HTML.
    // Livewire POST (/livewire/update) is also CF-protected so card name/image unavailable.
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    const certUrl = `https://acegrading.com/cert/${encodeURIComponent(certNumber)}`;
    const curlCmd = [
      "curl", "-s", "--max-time", "25", "--compressed",
      "-H", `"User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"`,
      "-H", `"Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"`,
      "-H", `"Accept-Language: en-GB,en;q=0.9"`,
      "-H", `"Referer: https://acegrading.com/"`,
      "-w", `"\n__HTTP_STATUS__:%{http_code}"`,
      `"${certUrl}"`,
    ].join(" ");

    let html: string;
    try {
      const { stdout, stderr } = await execAsync(curlCmd, { maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
      const statusMatch = stdout.match(/\n__HTTP_STATUS__:(\d+)$/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
      html = stdout.replace(/\n__HTTP_STATUS__:\d+$/, "");

      if (status >= 400) {
        throw new Error(`ACE returned HTTP ${status}. Please photograph your ACE slab instead.`);
      }
      if (!html.includes("acegrading.com") && !html.includes("collectible-certification")) {
        throw new Error("ACE cert page did not load correctly. Please photograph your ACE slab instead.");
      }
    } catch (execErr: any) {
      if (execErr.message && !execErr.message.startsWith("ACE")) {
        throw new Error("ACE cert lookup unavailable. Please photograph your ACE slab instead.");
      }
      throw execErr;
    }

    // All cert data is server-side rendered in the initial HTML — no Livewire POST needed.
    // Extract grade, subgrades, card name, set name and label image from the rendered HTML.

    // 1. Check the cert was found by looking for the Subgrades block
    if (!html.includes("Subgrades") && !html.includes("subgrades")) {
      throw new Error(`ACE cert #${certNumber} was not found. Please check the cert number.`);
    }

    // 2. Extract the cert content block as plain text for easy regex parsing
    // The cert data lives between the search form and the population chart
    const certBlockStart = html.indexOf("#" + certNumber);
    const certBlockEnd = html.indexOf("Population With Label", certBlockStart > 0 ? certBlockStart : 0);
    const certBlock = certBlockStart > 0 && certBlockEnd > 0
      ? html.substring(certBlockStart, certBlockEnd + 500)
      : html;
    const certText = certBlock.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // 3. Parse grade and label — handles "Grade NM-MT 8", "Grade MINT 9", "Grade GEM MINT 10", "Grade 8 NM-MT", etc.
    // Try label-first: "Grade NM-MT 8" / "Grade MINT 9"
    const gradeMatchLabelFirst = certText.match(/Grade\s+([A-Z][A-Z\s\-]*?)\s+(\d+(?:\.\d+)?)/i);
    // Try number-first: "Grade 8 NM-MT"
    const gradeMatchNumberFirst = certText.match(/Grade\s+(\d+(?:\.\d+)?)\s+([A-Z][A-Z\s\-]+)/i);
    // Try number only: "Grade 8"
    const gradeMatchNumberOnly = certText.match(/Grade\s+(\d+(?:\.\d+)?)/i);

    let gradeLabel = "";
    let gradeNumber = "";
    if (gradeMatchLabelFirst) {
      gradeLabel = gradeMatchLabelFirst[1].trim();
      gradeNumber = gradeMatchLabelFirst[2];
    } else if (gradeMatchNumberFirst) {
      gradeNumber = gradeMatchNumberFirst[1];
      gradeLabel = gradeMatchNumberFirst[2].trim();
    } else if (gradeMatchNumberOnly) {
      gradeNumber = gradeMatchNumberOnly[1];
    }
    // ACE format: "NM-MT 8", "GEM MINT 10", etc.
    const grade = gradeNumber ? (gradeLabel ? `${gradeLabel} ${gradeNumber}` : gradeNumber) : "Unknown";

    // 4. Parse subgrades (Surface, Centering, Edges, Corners)
    const subgradeMatch = certText.match(/Surface\s+(\d+(?:\.\d+)?)\s+Centering\s+(\d+(?:\.\d+)?)\s+Edges\s+(\d+(?:\.\d+)?)\s+Corners\s+(\d+(?:\.\d+)?)/i);
    const subgrades = subgradeMatch ? {
      surface: subgradeMatch[1],
      centering: subgradeMatch[2],
      edges: subgradeMatch[3],
      corners: subgradeMatch[4],
    } : null;

    // 5. Parse card name and set from the Card Details section
    const detailsIdx = html.indexOf("Card Details");
    const detailsBlock = detailsIdx > 0 ? html.substring(detailsIdx, detailsIdx + 3000) : "";
    const detailsText = detailsBlock.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

    const nameMatch = detailsText.match(/\bName\s+(.+?)\s+(?:Release Year|Set|Category|Label)/i);
    const setMatch = detailsText.match(/\bSet\s+(.+?)(?:\s+(?:Category|Release Year|Name|Label)|$)/i);
    const yearMatch = detailsText.match(/Release Year\s+(\d{4})/i);
    const cardName = nameMatch?.[1]?.trim().replace(/\s+/g, " ") || `ACE Cert #${certNumber}`;
    const setName = setMatch?.[1]?.trim().replace(/\s+/g, " ") || "";

    // 6. Extract image URLs from the HTML.
    //    Two CDNs are used by ACE:
    //    a) collectible-images.ams3.cdn.digitaloceanspaces.com/public/collectible/{id}/{id}_front.webp
    //       → The actual slab photo (card inside the graded case). Present for newer certs.
    //    b) ace.ams3.digitaloceanspaces.com/assets/labels/ace/*.jpg
    //       → The printed label/sticker artwork. Always present but NOT useful for grading analysis.
    const slabFrontMatch = html.match(/src="(https:\/\/collectible-images\.ams3\.[^"]+_front\.[a-z]+)"/i);
    const slabFrontUrl = slabFrontMatch?.[1] || null;

    // Back slab URL follows the same pattern — try by replacing _front with _back
    const slabBackUrl = slabFrontUrl ? slabFrontUrl.replace("_front.", "_back.") : null;

    // Label sticker image (always present, for UI preview confirmation only)
    const labelMatch = html.match(/src="(https:\/\/ace\.ams3\.[^"]+\.(jpg|jpeg|png|webp))"/i);
    const labelUrl = labelMatch?.[1] || null;

    const setWithYear = setName && yearMatch?.[1] ? `${setName} (${yearMatch[1]})` : setName;
    console.log(`[cert-lookup] ACE cert ${certNumber} → ${cardName} | ${setWithYear || setName} | grade: ${grade}`);
    console.log(`[cert-lookup] ACE images → slab front: ${slabFrontUrl ? "✓" : "✗"} | label: ${labelUrl ? "✓" : "✗"}`);
    if (subgrades) console.log(`[cert-lookup] ACE subgrades → Surface:${subgrades.surface} Center:${subgrades.centering} Edge:${subgrades.edges} Corner:${subgrades.corners}`);

    // 7. Download images in parallel
    const [frontImageBase64, backImageBase64, labelImageBase64] = await Promise.all([
      slabFrontUrl
        ? downloadImageAsBase64(slabFrontUrl, "https://acegrading.com/").catch(() => "")
        : Promise.resolve(""),
      slabBackUrl
        ? downloadImageAsBase64(slabBackUrl, "https://acegrading.com/").catch(() => "")
        : Promise.resolve(""),
      labelUrl
        ? downloadImageAsBase64(labelUrl, "https://acegrading.com/").catch(() => "")
        : Promise.resolve(""),
    ]);

    console.log(`[cert-lookup] ACE downloads → front: ${frontImageBase64 ? frontImageBase64.length + " chars" : "none"} | back: ${backImageBase64 ? backImageBase64.length + " chars" : "none"} | label: ${labelImageBase64 ? "✓" : "✗"}`);

    return {
      cardName,
      setName: setWithYear || setName,
      grade,
      company: "ACE",
      certNumber,
      frontImageBase64,          // Actual slab photo — empty for older certs (user must photograph)
      backImageBase64: backImageBase64 || undefined,
      labelImageBase64,          // Label sticker artwork — always shown in cert preview card
    };
  }

  async function lookupTAG(certNumber: string): Promise<CertLookupResult> {
    // Delegate to fetchTAGCert which implements the crypto-authenticated API.
    return fetchTAGCert(certNumber.trim().toUpperCase());
  }

  app.post("/api/cert-lookup", async (req, res) => {
    try {
      const { certNumber, company } = req.body;
      if (!certNumber || !company) {
        return res.status(400).json({ error: "certNumber and company are required" });
      }

      const cert = String(certNumber).trim();
      const comp = String(company).toUpperCase();

      console.log(`[cert-lookup] Looking up cert ${cert} for company ${comp}`);

      let result: CertLookupResult;
      try {
        if (comp === "PSA") {
          result = await lookupPSA(cert);
        } else if (comp === "BGS" || comp === "BECKETT") {
          result = await lookupBGS(cert);
        } else if (comp === "CGC") {
          result = await lookupCGC(cert);
        } else if (comp === "ACE") {
          result = await lookupACE(cert);
        } else if (comp === "TAG") {
          result = await lookupTAG(cert);
        } else {
          return res.status(400).json({ error: `Unknown company: ${company}` });
        }
      } catch (err: any) {
        console.log(`[cert-lookup] Lookup failed for ${comp} ${cert}: ${err.message}`);
        return res.status(422).json({ error: err.message || "Cert lookup failed — please add photos manually" });
      }

      res.json(result);
    } catch (error: any) {
      console.error("[cert-lookup] Unexpected error:", error.message);
      res.status(500).json({ error: "Server error during cert lookup" });
    }
  });

  app.post("/api/admin/verify", (req, res) => {
    const { password } = req.body as { password?: string };
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({ ok: false, error: "ADMIN_PASSWORD not configured" });
    }
    if (password && password === adminPassword) {
      return res.json({ ok: true });
    }
    return res.status(401).json({ ok: false });
  });

  // Registers the caller's RC user ID as an admin permanently (requires admin password).
  // Called by the app immediately after admin mode is successfully verified.
  app.post("/api/admin/register-device", async (req, res) => {
    const { password, rcUserId } = req.body as { password?: string; rcUserId?: string };
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || !password || password !== adminPassword) {
      return res.status(401).json({ ok: false });
    }
    if (!rcUserId) return res.status(400).json({ ok: false, error: "rcUserId required" });
    try {
      await db.query(
        `INSERT INTO admin_users (rc_user_id, note) VALUES ($1, 'self-registered via app')
         ON CONFLICT (rc_user_id) DO NOTHING`,
        [rcUserId]
      );
      console.log(`[admin] Registered device as admin: ${rcUserId}`);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[admin] register-device failed:", e.message);
      res.status(500).json({ ok: false });
    }
  });

  async function fetchRCOverview() {
    const key = process.env.REVENUECAT_V2_KEY;
    const projectId = process.env.REVENUECAT_PROJECT_ID;
    if (!key || !projectId) return null;
    try {
      const r = await fetch(`https://api.revenuecat.com/v2/projects/${projectId}/metrics/overview`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return null;
      const json = await r.json() as { metrics: { id: string; value: number; unit: string }[] };
      const m: Record<string, number> = {};
      for (const item of json.metrics) m[item.id] = item.value;
      return m;
    } catch {
      return null;
    }
  }

  // Cache tier breakdown for 10 minutes to avoid 100+ API calls per request
  let rcTiersCache: { data: RCTiers; ts: number } | null = null;
  const RC_TIERS_CACHE_TTL = 10 * 60 * 1000;

  type RCTiers = { curious: number; enthusiast: number; obsessed: number; other: number; productIds: string[] };

  async function fetchRCTierBreakdown(): Promise<RCTiers | null> {
    if (rcTiersCache && Date.now() - rcTiersCache.ts < RC_TIERS_CACHE_TTL) {
      return rcTiersCache.data;
    }

    const v2Key = process.env.REVENUECAT_V2_KEY;
    const secretKey = process.env.REVENUECAT_SECRET_KEY;
    const projectId = process.env.REVENUECAT_PROJECT_ID;
    if (!v2Key || !secretKey || !projectId) return null;

    try {
      const tiers: RCTiers = { curious: 0, enthusiast: 0, obsessed: 0, other: 0, productIds: [] };
      const seenProductIds = new Set<string>();

      // Step 1: Get all customer IDs via the V2 customers list endpoint
      const customerIds: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      while (pages < 10) {
        const url = new URL(`https://api.revenuecat.com/v2/projects/${projectId}/customers`);
        url.searchParams.set("limit", "200");
        if (cursor) url.searchParams.set("starting_after", cursor);
        const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${v2Key}` } });
        if (!r.ok) break;
        const json = await r.json() as any;
        const items: any[] = json.items ?? [];
        customerIds.push(...items.map((c: any) => c.id).filter(Boolean));
        cursor = json.next_page ?? undefined;
        pages++;
        if (!cursor || items.length < 200) break;
      }

      // Step 2: Use RC v1 REST API per subscriber — it returns entitlements with product_identifier
      // Process in batches of 10 to avoid hammering the API
      for (let i = 0; i < Math.min(customerIds.length, 1000); i += 10) {
        const batch = customerIds.slice(i, i + 10);
        await Promise.all(batch.map(async (customerId) => {
          try {
            const r = await fetch(
              `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(customerId)}`,
              { headers: { Authorization: `Bearer ${secretKey}` } }
            );
            if (!r.ok) return;
            const data = await r.json() as any;
            const entitlements: Record<string, any> = data.subscriber?.entitlements ?? {};
            for (const [, ent] of Object.entries(entitlements)) {
              const productId = ((ent as any).product_identifier ?? "").toLowerCase();
              if (!productId) continue;
              seenProductIds.add(productId);
              if (productId.includes("curious")) tiers.curious++;
              else if (productId.includes("enthusiast")) tiers.enthusiast++;
              else if (productId.includes("obsessed")) tiers.obsessed++;
              else tiers.other++;
            }
          } catch {}
        }));
      }

      tiers.productIds = Array.from(seenProductIds).sort();
      console.log("[rc-tiers] Breakdown:", { curious: tiers.curious, enthusiast: tiers.enthusiast, obsessed: tiers.obsessed, other: tiers.other });
      console.log("[rc-tiers] All product IDs found:", tiers.productIds);

      rcTiersCache = { data: tiers, ts: Date.now() };
      return tiers;
    } catch (e: any) {
      console.error("[rc-tiers]", e.message);
      return null;
    }
  }

  const COST_PER_GRADE_USD: Record<string, number> = {
    quick: 0.018,
    deep: 0.040,
    crossover: 0.030,
    bulk: 0.018,
  };

  app.get("/api/admin/analytics", async (req, res) => {
    try {
      const [totals, daily, byMode, recent] = await Promise.all([
        db.query(`
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS this_week,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS this_month,
            COALESCE(SUM(card_count), 0) AS total_cards
          FROM grade_analytics
        `),
        db.query(`
          SELECT
            DATE(created_at) AS day,
            COUNT(*) AS count,
            COALESCE(SUM(card_count), 0) AS cards
          FROM grade_analytics
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY DATE(created_at)
          ORDER BY day ASC
        `),
        db.query(`
          SELECT
            mode,
            COUNT(*) AS count,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed
          FROM grade_analytics
          GROUP BY mode
          ORDER BY count DESC
        `),
        db.query(`
          SELECT job_id, mode, card_count, status, created_at, completed_at,
            EXTRACT(EPOCH FROM (completed_at - created_at)) AS duration_secs
          FROM grade_analytics
          ORDER BY created_at DESC
          LIMIT 20
        `),
      ]);

      const [rcMetrics, rcTiers] = await Promise.all([fetchRCOverview(), fetchRCTierBreakdown()]);

      const costByMode: Record<string, number> = {};
      let totalCostUsd = 0;
      for (const row of byMode.rows) {
        const costPer = COST_PER_GRADE_USD[row.mode] ?? 0.018;
        const cards = parseInt(row.count);
        const cost = parseFloat((cards * costPer).toFixed(2));
        costByMode[row.mode] = cost;
        totalCostUsd += cost;
      }

      const mrrUsd = rcMetrics?.mrr ?? 0;
      const revenueUsd = rcMetrics?.revenue ?? 0;
      const profitUsd = parseFloat((mrrUsd - totalCostUsd).toFixed(2));
      const marginPct = mrrUsd > 0 ? Math.round((profitUsd / mrrUsd) * 100) : 0;

      res.json({
        totals: totals.rows[0],
        daily: daily.rows,
        byMode: byMode.rows,
        recent: recent.rows,
        rc: rcMetrics,
        rcTiers,
        costs: {
          byMode: costByMode,
          totalUsd: parseFloat(totalCostUsd.toFixed(2)),
        },
        revenue: {
          mrrUsd,
          revenueUsd,
          profitUsd,
          marginPct,
        },
      });
    } catch (err: any) {
      console.error("[admin/analytics] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ======================================================================
  // Set Browser Endpoints — English (pokemontcg.io), Japanese & Korean (TCGdex)
  // ======================================================================

  const setCardsCache = new Map<string, { cards: any[]; fetchedAt: number }>();
  const SET_CARDS_CACHE_TTL = 6 * 60 * 60 * 1000;
  // Tracks card/price availability per set — backed by PostgreSQL for persistence across restarts
  const setPriceStatusCache = new Map<string, { hasCards: boolean; hasPrices: boolean; checkedAt: number }>();

  // ── Card Catalog helpers ─────────────────────────────────────────────────

  // WOTC-era English sets that were printed in both 1st Edition and Unlimited runs
  const WOTC_1ST_EDITION_SET_IDS = new Set([
    "base1",  // Base Set
    "base2",  // Jungle
    "base3",  // Fossil
    "base5",  // Team Rocket
    "gym1",   // Gym Heroes
    "gym2",   // Gym Challenge
    "neo1",   // Neo Genesis
    "neo2",   // Neo Discovery
    "neo3",   // Neo Revelation
    "neo4",   // Neo Destiny
  ]);

  const CATALOG_PRICE_TYPES = [
    "holofoil", "reverseHolofoil", "normal",
    "1stEditionHolofoil", "1stEditionNormal",
    "unlimitedHolofoil", "unlimited",
  ];

  function pickBestTcgPrice(tcgplayer: any): number | null {
    const prices = tcgplayer?.prices ?? {};
    for (const pt of CATALOG_PRICE_TYPES) {
      const t = prices[pt];
      if (!t) continue;
      const v = t.market ?? t.mid ?? null;
      if (v != null) return Math.round(v * 100) / 100;
    }
    return null;
  }

  // Edition-aware price picker: "1st" → 1stEdition buckets (fallback to holofoil/normal),
  // "unlimited" → unlimited/holofoil buckets
  function pickEditionTcgPrice(tcgplayer: any, edition: "1st" | "unlimited" | null): number | null {
    if (!edition) return pickBestTcgPrice(tcgplayer);
    const prices = tcgplayer?.prices ?? {};
    // For 1st edition: prefer edition-specific buckets, but fall back to generic ones.
    // Many WOTC cards on TCGPlayer only list "holofoil"/"normal" without separating editions.
    const types = edition === "1st"
      ? ["1stEditionHolofoil", "1stEditionNormal", "holofoil", "normal"]
      : ["unlimitedHolofoil", "unlimitedNormal", "holofoil", "normal"];
    for (const pt of types) {
      const t = prices[pt];
      if (!t) continue;
      const v = t.market ?? t.mid ?? null;
      if (v != null) return Math.round(v * 100) / 100;
    }
    return null;
  }

  // Fetch all cards for one set from Pokemon TCG API and return shaped rows
  async function fetchSetCardsFromApi(setId: string, setName: string): Promise<any[]> {
    const allCards: any[] = [];
    let page = 1;
    while (true) {
      const resp = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(setId)}&pageSize=250&page=${page}&select=id,name,number,rarity,images,tcgplayer`,
        { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(15000) }
      );
      if (!resp.ok) throw new Error(`Pokemon TCG API returned ${resp.status}`);
      const data = await resp.json() as any;
      const pageCards: any[] = data?.data || [];
      allCards.push(...pageCards);
      // Stop when we've received all cards (totalCount is available in the response)
      const totalCount: number = data?.totalCount ?? pageCards.length;
      if (allCards.length >= totalCount || pageCards.length === 0) break;
      page++;
      // Polite delay between page fetches
      await new Promise(r => setTimeout(r, 300));
    }
    return allCards.map((c: any) => {
      const tcgPrices = c.tcgplayer?.prices || {};
      return {
        id: c.id,
        name: c.name,
        number: c.number || "",
        rarity: c.rarity || null,
        imageUrl: c.images?.large || c.images?.small || null,
        price: pickBestTcgPrice(c.tcgplayer),
        prices: {
          holofoil: tcgPrices.holofoil?.market ?? null,
          reverseHolofoil: tcgPrices.reverseHolofoil?.market ?? null,
          normal: tcgPrices.normal?.market ?? null,
        },
        setId,
        setName,
      };
    });
  }

  // Bulk-upsert an array of shaped card rows into card_catalog
  async function upsertCardsForSet(cards: any[]): Promise<void> {
    if (cards.length === 0) return;
    const now = new Date();
    // Process in chunks of 50 to stay within parameter limits
    const CHUNK = 50;
    for (let i = 0; i < cards.length; i += CHUNK) {
      const chunk = cards.slice(i, i + CHUNK);
      const placeholders = chunk.map((_, j) => {
        const base = j * 10;
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10})`;
      }).join(",");
      const values: any[] = [];
      for (const c of chunk) {
        values.push(c.id, c.setId, c.setName, c.name, c.number, c.rarity ?? null, c.imageUrl ?? null, c.price ?? null, c.prices ? JSON.stringify(c.prices) : null, now);
      }
      await db.query(
        `INSERT INTO card_catalog (card_id, set_id, set_name, name, number, rarity, image_url, price_usd, prices_json, price_updated_at)
         VALUES ${placeholders}
         ON CONFLICT (card_id) DO UPDATE SET
           name             = EXCLUDED.name,
           number           = EXCLUDED.number,
           rarity           = EXCLUDED.rarity,
           image_url        = COALESCE(EXCLUDED.image_url, card_catalog.image_url),
           price_usd        = COALESCE(EXCLUDED.price_usd, card_catalog.price_usd),
           prices_json      = COALESCE(EXCLUDED.prices_json, card_catalog.prices_json),
           price_updated_at = EXCLUDED.price_updated_at`,
        values
      );
    }
  }

  // Read all cards for a set from the DB (returns null if set not found in catalog)
  async function getCardsFromCatalog(setId: string): Promise<any[] | null> {
    try {
      const { rows } = await db.query(
        `SELECT card_id as id, name, number, rarity, image_url as "imageUrl", price_usd::float as price, prices_json as prices
         FROM card_catalog WHERE set_id = $1 ORDER BY number`,
        [setId]
      );
      if (rows.length === 0) return null;
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        number: r.number || "",
        imageUrl: r.imageUrl || null,
        price: r.price != null ? Math.round(r.price * 100) / 100 : null,
        prices: r.prices ?? null,
      }));
    } catch (err: any) {
      console.error(`[card-catalog] DB read error for ${setId}:`, err.message);
      return null;
    }
  }

  // Read JP/Korean cards for a set from the DB (returns null if not yet synced)
  async function getJpCardsFromCatalog(setId: string, lang: "ja" | "ko" = "ja"): Promise<any[] | null> {
    try {
      const { rows } = await db.query(
        `SELECT card_id as id, name, name_en as "nameEn", number, image_url as "imageUrl",
                price_eur::float as "priceEUR", set_name_en as "setNameEn"
         FROM card_catalog WHERE set_id = $1 AND lang = $2
         ORDER BY LPAD(regexp_replace(number, '[^0-9]', '', 'g'), 4, '0'), number`,
        [setId, lang]
      );
      if (rows.length === 0) return null;
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        nameEn: r.nameEn || null,
        number: r.number || "",
        imageUrl: r.imageUrl || null,
        priceEUR: r.priceEUR != null ? Math.round(r.priceEUR * 100) / 100 : null,
        setNameEn: r.setNameEn || null,
      }));
    } catch (err: any) {
      console.error(`[jp-catalog] DB read error for ${setId}:`, err.message);
      return null;
    }
  }

  // Bulk-upsert an array of JP/Korean shaped card rows into card_catalog
  async function upsertJpCardsForSet(
    setId: string, setName: string, setNameEn: string, cards: any[], lang: "ja" | "ko" = "ja"
  ): Promise<void> {
    if (cards.length === 0) return;
    const now = new Date();
    const CHUNK = 50;
    // 11 fields per row: card_id, set_id, set_name, name, number, image_url, name_en, price_eur, set_name_en, price_updated_at, lang
    const FIELDS = 11;
    for (let i = 0; i < cards.length; i += CHUNK) {
      const chunk = cards.slice(i, i + CHUNK);
      const placeholders = chunk.map((_, j) => {
        const b = j * FIELDS;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11})`;
      }).join(",");
      const values: any[] = [];
      for (const c of chunk) {
        values.push(
          c.id, setId, setName, c.name || c.nameEn || "", c.number,
          c.imageUrl ?? null, c.nameEn ?? null, c.priceEUR ?? null, setNameEn, now, lang
        );
      }
      await db.query(
        `INSERT INTO card_catalog (card_id, set_id, set_name, name, number, image_url, name_en, price_eur, set_name_en, price_updated_at, lang)
         VALUES ${placeholders}
         ON CONFLICT (card_id) DO UPDATE SET
           name             = EXCLUDED.name,
           number           = EXCLUDED.number,
           image_url        = EXCLUDED.image_url,
           name_en          = EXCLUDED.name_en,
           price_eur        = EXCLUDED.price_eur,
           set_name_en      = EXCLUDED.set_name_en,
           price_updated_at = EXCLUDED.price_updated_at,
           lang             = EXCLUDED.lang`,
        values
      );
    }
  }

  // Count JP cards per set in the DB — used to derive hasCardData for the set list
  async function getJpCardCountsFromDB(): Promise<Map<string, number>> {
    try {
      const { rows } = await db.query(
        `SELECT set_id, COUNT(*) as cnt FROM card_catalog WHERE lang = 'ja' GROUP BY set_id`
      );
      return new Map(rows.map((r: any) => [r.set_id, parseInt(r.cnt, 10)]));
    } catch (err: any) {
      console.error("[jp-catalog] Failed to read card counts:", err.message);
      return new Map();
    }
  }

  // Returns the TCGdex CDN series path for sets with known high-res image support
  function getTcgdexSeriesForSet(setId: string): string | null {
    if (setId.startsWith("SV")) return "SV";
    // All S-series sets verified to have Japanese assets on assets.tcgdex.net
    const S_COVERED = new Set([
      "S2a","S3","S5a",                            // SwSh mid (newly confirmed)
      "S9","S9a",                                   // SwSh late
      "S10a","S10b","S10D","S10P",                 // SwSh final
      "S11","S11a","S12","S12a",                   // SwSh final
    ]);
    if (S_COVERED.has(setId)) return "S";
    return null;
  }

  // Build a TCGdex high-res image URL for a JP card using setId + card number
  function buildTcgdexUrlFromSetId(setId: string, number: string): string | null {
    const series = getTcgdexSeriesForSet(setId);
    if (!series || !number || !/^\d+$/.test(number)) return null;
    const padded = number.padStart(3, "0");
    return `https://assets.tcgdex.net/ja/${series}/${setId}/${padded}/high.webp`;
  }

  // Fetch JP/Korean cards for a set from TCGdex + PokeTrace (extracted from the set-cards endpoint)
  async function fetchJpSetCards(
    setId: string, langCode: "ja" | "ko", setNameEnHint?: string
  ): Promise<{ cards: any[]; setNameEn: string; setName: string }> {
    const resp = await fetch(
      `https://api.tcgdex.net/v2/${langCode}/sets/${encodeURIComponent(setId)}`,
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(15000) }
    );
    // TCGdex may return 404 for some JP-exclusive sets — gracefully fall through to PokeTrace
    let data: any = { cards: [], name: setId };
    if (resp.ok) {
      data = await resp.json() as any;
    } else {
      console.warn(`[jp-catalog] TCGdex ${resp.status} for ${setId} — falling back to PokeTrace only`);
    }

    const enNamesMap = await getTcgdexEnNames();
    const setNameEn: string = setNameEnHint
      || JP_TCGDEX_EN_NAMES[setId]
      || enNamesMap.get(setId)
      || data.nameEn
      || data.name
      || setId;
    const setName: string = data.name || setId;

    // PokeTrace EU enrichment (JP only)
    const ptCardsByNumber = new Map<string, { nameEn: string; priceEUR: number; imageUrl: string | null }>();
    if (langCode === "ja") {
      // Use explicit override if set, even if empty string (empty = skip PokeTrace for this set)
      const ptSlug = setId in JP_POKETRACE_SLUG_OVERRIDES
        ? JP_POKETRACE_SLUG_OVERRIDES[setId]
        : toPokeTraceSlug(setNameEn);
      if (ptSlug) {
        try {
          let cursor: string | null = null;
          let pageCount = 0;
          const PT_MAX_PAGES = 15;
          do {
            const ptUrl = `https://api.poketrace.com/v1/cards?set=${encodeURIComponent(ptSlug)}&market=EU&limit=100`
              + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
            const ptResp = await fetch(ptUrl, {
              headers: { "X-API-Key": process.env.POKETRACE_API_KEY || "" },
              signal: AbortSignal.timeout(10000),
            });
            if (!ptResp.ok) { console.warn(`[jp-catalog] PokeTrace ${ptResp.status} for ${ptSlug}`); break; }
            const ptData = await ptResp.json() as any;
            for (const c of (ptData?.data || [])) {
              const baseNum = (c.cardNumber || "").split("/")[0].trim();
              if (baseNum) {
                const nm = c.prices?.cardmarket_unsold?.NEAR_MINT?.avg ?? 0;
                ptCardsByNumber.set(baseNum, {
                  nameEn:   c.name || "",
                  priceEUR: nm > 0 ? Math.round(nm * 100) / 100 : 0,
                  imageUrl: c.image ?? null,
                });
              }
            }
            pageCount++;
            cursor = ptData?.pagination?.nextCursor ?? null;
          } while (cursor && pageCount < PT_MAX_PAGES);
        } catch (e: any) {
          console.warn(`[jp-catalog] PokeTrace enrichment failed for ${ptSlug}:`, e.message);
        }
      }
    }

    let cards = (data?.cards || []).map((c: any) => {
      const localId = c.localId || "";
      const pt = ptCardsByNumber.get(localId) ?? null;
      // Prefer TCGdex high-res (600×825 webp) over PokeTrace low-res (255×361)
      const tcgdexUrl = c.image
        ? (c.image.endsWith(".jpg") || c.image.endsWith(".png") || c.image.endsWith(".webp") ? c.image : `${c.image}/high.webp`)
        : (langCode === "ja" ? buildTcgdexUrlFromSetId(setId, localId) : null);
      const imageUrl = tcgdexUrl || pt?.imageUrl || null;
      return {
        id: c.id,
        name: c.name,
        nameEn: pt?.nameEn || c.nameEn || null,
        number: localId,
        imageUrl,
        priceEUR: pt ? (pt.priceEUR > 0 ? pt.priceEUR : null) : null,
        setNameEn,
      };
    });

    // Append PokeTrace-only cards (SARs, full arts, etc.) not returned by TCGdex
    if (langCode === "ja" && ptCardsByNumber.size > 0) {
      const tcgdexNums = new Set(cards.map((c: any) => c.number));
      const extras = Array.from(ptCardsByNumber.entries())
        .filter(([num]) => !tcgdexNums.has(num))
        .sort(([a], [b]) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
        .map(([num, pt]) => {
          // Prefer TCGdex JA CDN image if this set has verified assets (S_COVERED / SV)
          // Falls back to PokeTrace CDN (may be English for vintage sets)
          const tcgdexJaUrl = buildTcgdexUrlFromSetId(setId, num);
          return {
            id: `${setId}-${num}`,
            name: pt.nameEn,
            nameEn: pt.nameEn,
            number: num,
            imageUrl: tcgdexJaUrl ?? pt.imageUrl,
            priceEUR: pt.priceEUR > 0 ? pt.priceEUR : null,
            setNameEn,
          };
        });
      if (extras.length > 0) {
        cards = [...cards, ...extras];
      }
    }

    // Fallback: TCGdex has no cards — build list entirely from PokeTrace data
    if (cards.length === 0 && ptCardsByNumber.size > 0) {
      console.log(`[jp-catalog] TCGdex empty for ${setId} — building ${ptCardsByNumber.size} cards from PokeTrace`);
      cards = Array.from(ptCardsByNumber.entries())
        .sort(([a], [b]) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
        .map(([num, pt]) => {
          // Prefer TCGdex JA CDN if set has verified assets (handles sets where TCGdex API
          // has no card data but CDN assets exist, e.g. S2a, S3, S5a)
          const tcgdexJaUrl = buildTcgdexUrlFromSetId(setId, num);
          return {
            id: `${setId}-${num}`,
            name: pt.nameEn,
            nameEn: pt.nameEn,
            number: num,
            imageUrl: tcgdexJaUrl ?? pt.imageUrl,
            priceEUR: pt.priceEUR > 0 ? pt.priceEUR : null,
            setNameEn,
          };
        });
    }

    return { cards, setNameEn, setName };
  }

  // Check how many cards are stored in the catalog (used to detect first-run)
  async function getCardCatalogCount(): Promise<number> {
    try {
      const { rows } = await db.query(`SELECT COUNT(*) as cnt FROM card_catalog`);
      return parseInt(rows[0]?.cnt ?? "0", 10);
    } catch { return 0; }
  }

  // Sync all English sets into card_catalog — fetches from Pokemon TCG API
  // On first run this populates the whole catalog; subsequent runs only refresh
  // sets whose prices might be stale (fetched > 20h ago) or new sets.
  let cardCatalogSyncRunning = false;
  async function syncAllEnglishSets(mode: "full" | "prices-only" = "full"): Promise<void> {
    if (cardCatalogSyncRunning) { console.log("[card-catalog] Sync already in progress — skipping"); return; }
    cardCatalogSyncRunning = true;
    try {
      const allSets = await ensureSetsCached();
      console.log(`[card-catalog] Starting ${mode} sync for ${allSets.length} English sets...`);
      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const s of allSets) {
        try {
          // In prices-only mode skip sets whose prices were updated < 20h ago
          if (mode === "prices-only") {
            const { rows } = await db.query(
              `SELECT MIN(price_updated_at) as oldest FROM card_catalog WHERE set_id = $1`,
              [s.id]
            );
            const oldest = rows[0]?.oldest;
            if (oldest && Date.now() - new Date(oldest).getTime() < 20 * 60 * 60 * 1000) {
              skipped++;
              continue;
            }
          }

          const cards = await fetchSetCardsFromApi(s.id, s.name);
          await upsertCardsForSet(cards);

          const hasPrices = cards.some(c => c.price != null);
          upsertSetPriceStatus(s.id, cards.length > 0, hasPrices);

          // Warm the in-memory cache too so the next request is instant
          setCardsCache.set(`english:${s.id}`, { cards: cards.map(c => ({ id: c.id, name: c.name, number: c.number, imageUrl: c.imageUrl, price: c.price, prices: c.prices ?? null })), fetchedAt: Date.now() });

          synced++;
          if (synced % 20 === 0) console.log(`[card-catalog] Synced ${synced}/${allSets.length} sets...`);
        } catch (err: any) {
          console.warn(`[card-catalog] Failed to sync set ${s.id}: ${err.message}`);
          errors++;
        }
        // Polite delay between API calls — 300ms
        await new Promise(r => setTimeout(r, 300));
      }
      console.log(`[card-catalog] Sync complete — ${synced} synced, ${skipped} skipped (fresh), ${errors} errors`);
    } finally {
      cardCatalogSyncRunning = false;
    }
  }

  // ── Top Grading Picks — server-side pre-computation ──────────────────────
  // Runs once daily after the eBay limit resets (9 AM UTC). Queries card_catalog
  // for the top 20 holofoil candidates per price tier, fetches their eBay
  // last-sold prices, and upserts results into top_picks_precomputed.
  // Historic prices are NEVER overwritten with zeros — if eBay returns nothing,
  // the existing row is marked stale so users still see something useful.

  const TOP_PICKS_TIERS = [
    { maxGBP: 5,    minGBP: 3 },
    { maxGBP: 10,   minGBP: 5 },
    { maxGBP: 20,   minGBP: 10 },
    { maxGBP: 50,   minGBP: 20 },
    { maxGBP: 100,  minGBP: 50 },
    { maxGBP: 200,  minGBP: 100 },
    { maxGBP: 500,  minGBP: 200 },
    { maxGBP: 1000, minGBP: 500 },
  ] as const;

  let topPicksJobRunning = false;
  let topPicksLastRun: Date | null = null;

  async function runTopPicksJob(): Promise<void> {
    if (topPicksJobRunning) {
      console.log("[top-picks] Job already running, skipping");
      return;
    }
    topPicksJobRunning = true;
    console.log("[top-picks] Starting precomputed picks job (smart scoring)...");

    type CatalogCard = {
      card_id: string; set_id: string; set_name: string; name: string;
      number: string; rarity: string | null; image_url: string | null; price_usd: string;
    };

    try {
      const rates = await getExchangeRates();
      const gbpRate = rates.rates.GBP ?? 0.79;
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

      for (const tier of TOP_PICKS_TIERS) {
        const minUSD = tier.minGBP / gbpRate;
        const maxUSD = tier.maxGBP / gbpRate;

        // ── Step 1: Wide candidate pool (100 cards) ──────────────────────────
        const { rows: pool } = await db.query<CatalogCard>(
          `SELECT card_id, set_id, set_name, name, number, rarity, image_url, price_usd
             FROM card_catalog
            WHERE price_usd >= $1 AND price_usd < $2 AND COALESCE(lang,'en') = 'en'
            ORDER BY
              CASE WHEN rarity ILIKE '%holo%' THEN 0 ELSE 1 END,
              price_usd DESC
            LIMIT 100`,
          [minUSD, maxUSD]
        );

        // ── Step 2: Bulk-load eBay cache for all candidates ───────────────────
        const cacheKeys = pool.map(c => `${c.name} ${c.number}`);
        const { rows: cacheRows } = await db.query<{ cache_key: string; data: any }>(
          `SELECT cache_key, data FROM ebay_price_cache WHERE cache_key = ANY($1)`,
          [cacheKeys]
        );
        const cacheMap = new Map(cacheRows.map(r => [r.cache_key, r.data]));

        // ── Step 3: Load last 7 days of history for week-over-week trend ──────
        const cardIds = pool.map(c => c.card_id);
        const { rows: histRows } = await db.query<{
          card_id: string; snapshot_date: string; ebay_psa10: string; ebay_ace10: string;
        }>(
          `SELECT card_id, snapshot_date, ebay_psa10, ebay_ace10
             FROM top_picks_history
            WHERE card_id = ANY($1) AND tier_max_gbp = $2 AND lang = 'en'
              AND snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
            ORDER BY card_id, snapshot_date ASC`,
          [cardIds, tier.maxGBP]
        );
        const histMap = new Map<string, { psa10: number; ace10: number }[]>();
        for (const h of histRows) {
          if (!histMap.has(h.card_id)) histMap.set(h.card_id, []);
          histMap.get(h.card_id)!.push({
            psa10: parseFloat(h.ebay_psa10) || 0,
            ace10: parseFloat(h.ebay_ace10) || 0,
          });
        }

        // ── Step 4: Score every candidate ────────────────────────────────────
        const scored = pool.map(card => {
          const rawUSD = parseFloat(card.price_usd) || 1;
          const cache  = cacheMap.get(`${card.name} ${card.number}`);

          if (!cache) {
            // No prior data — neutral score so fresh cards still get a chance
            return { card, score: 1.0 };
          }

          // Profit ratio: best graded sale price vs raw TCGPlayer price
          const bestGrade = Math.max(
            cache.psa10 || 0, cache.ace10 || 0, cache.tag10 || 0,
            cache.bgs95 || 0, cache.cgc10 || 0
          );
          const profitRatio = bestGrade > 0 ? bestGrade / rawUSD : 0.5;

          // Liquidity: total sale count across all grades in the cache
          let totalSales = 0;
          if (cache.gradeDetails) {
            for (const g of Object.values(cache.gradeDetails) as any[]) {
              totalSales += (g.saleCount as number) || 0;
            }
          }
          const liquidityMult = 1 + Math.min(totalSales / 20, 1.5);

          // Short-term trend: avg1d > avg7d (rising this week) or avg7d > avg30d
          let trendMult = 1.0;
          if (cache.gradeDetails) {
            for (const g of Object.values(cache.gradeDetails) as any[]) {
              if (g.avg1d && g.avg7d && g.avg1d > g.avg7d * 1.05) {
                trendMult = Math.max(trendMult, 1.5); // rising fast (>5% day-over-day)
              } else if (g.avg7d && g.avg30d && g.avg7d > g.avg30d * 1.05) {
                trendMult = Math.max(trendMult, 1.25); // rising steadily this month
              }
            }
          }

          // Week-over-week history trend: price higher now than 7 days ago
          const hist = histMap.get(card.card_id);
          if (hist && hist.length >= 2) {
            const oldest = hist[0].psa10 || hist[0].ace10;
            const newest = hist[hist.length - 1].psa10 || hist[hist.length - 1].ace10;
            if (oldest > 0 && newest > oldest * 1.05) {
              trendMult = Math.max(trendMult, 1.3);
            }
          }

          return { card, score: profitRatio * liquidityMult * trendMult };
        });

        // ── Step 5: Sort by score, take top 20 for live eBay fetch ───────────
        scored.sort((a, b) => b.score - a.score);
        const candidates = scored.slice(0, 20).map(s => s.card);
        console.log(`[top-picks] Tier £${tier.maxGBP}: scored ${pool.length} candidates → fetching top ${candidates.length}`);

        // ── Step 6: Fetch live eBay prices and upsert ─────────────────────────
        for (const card of candidates) {
          try {
            const ebay = await fetchEbayGradedPrices(card.name, card.set_name, card.number || undefined);
            const hasData = [
              ebay.psa10, ebay.psa9, ebay.bgs95, ebay.bgs9,
              ebay.ace10, ebay.tag10, ebay.cgc10, ebay.raw,
            ].some(v => v > 0);

            if (hasData) {
              const { fetchedAt: _fa, ...gradesOnly } = ebay;
              await db.query(
                `INSERT INTO top_picks_precomputed
                   (card_id, tier_max_gbp, card_name, set_name, set_id, number, image_url, raw_price_usd,
                    ebay_psa10, ebay_psa9, ebay_bgs95, ebay_bgs9, ebay_ace10, ebay_tag10, ebay_cgc10, ebay_raw,
                    ebay_all_grades, ebay_fetched_at, is_stale, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),FALSE,NOW())
                 ON CONFLICT (card_id, tier_max_gbp) DO UPDATE SET
                   card_name=$3, set_name=$4, image_url=$7, raw_price_usd=$8,
                   ebay_psa10=$9, ebay_psa9=$10, ebay_bgs95=$11, ebay_bgs9=$12,
                   ebay_ace10=$13, ebay_tag10=$14, ebay_cgc10=$15, ebay_raw=$16,
                   ebay_all_grades=$17, ebay_fetched_at=NOW(), is_stale=FALSE, updated_at=NOW()`,
                [
                  card.card_id, tier.maxGBP, card.name, card.set_name, card.set_id,
                  card.number || "", card.image_url, parseFloat(card.price_usd),
                  ebay.psa10, ebay.psa9, ebay.bgs95, ebay.bgs9,
                  ebay.ace10, ebay.tag10, ebay.cgc10, ebay.raw,
                  JSON.stringify(gradesOnly),
                ]
              );

              // ── Step 7: Snapshot to history (once per card per day) ─────────
              await db.query(
                `INSERT INTO top_picks_history
                   (card_id, tier_max_gbp, lang, snapshot_date, card_name,
                    ebay_psa10, ebay_ace10, ebay_tag10, ebay_bgs95, ebay_cgc10, raw_price_usd)
                 VALUES ($1,$2,'en',$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (card_id, tier_max_gbp, lang, snapshot_date) DO NOTHING`,
                [
                  card.card_id, tier.maxGBP, today, card.name,
                  ebay.psa10, ebay.ace10, ebay.tag10, ebay.bgs95, ebay.cgc10,
                  parseFloat(card.price_usd),
                ]
              );
              console.log(`[top-picks] ✓ ${card.name} (£${tier.maxGBP}) score=${scored.find(s => s.card.card_id === card.card_id)?.score.toFixed(2)} PSA10=$${ebay.psa10}`);
            } else {
              await db.query(
                `UPDATE top_picks_precomputed SET is_stale=TRUE, updated_at=NOW()
                  WHERE card_id=$1 AND tier_max_gbp=$2`,
                [card.card_id, tier.maxGBP]
              );
              console.log(`[top-picks] – ${card.name} (£${tier.maxGBP}) no eBay data (stale preserved)`);
            }
          } catch (err: any) {
            console.error(`[top-picks] Error processing ${card.name}:`, err.message);
          }
          // 350ms gap → ~2.8 req/sec, well under PokeTrace burst limit
          await new Promise(r => setTimeout(r, 350));
        }
      }

      topPicksLastRun = new Date();
      console.log("[top-picks] Smart picks job complete");
    } finally {
      topPicksJobRunning = false;
    }
  }

  async function scheduleDailyTopPicksJob() {
    const now = new Date();

    // Work out when today's 9am UTC window was
    const todayAt9 = new Date();
    todayAt9.setUTCHours(9, 0, 0, 0);

    // Work out the next 9am UTC (always tomorrow if we're past today's 9am)
    const nextAt9 = new Date(todayAt9);
    if (nextAt9 <= now) nextAt9.setUTCDate(nextAt9.getUTCDate() + 1);

    // Check DB for when the job last ran
    let lastRanAt: Date | null = null;
    try {
      const row = await db.query<{ latest: string }>(
        `SELECT MAX(ebay_fetched_at) AS latest FROM top_picks_precomputed`
      );
      const ts = row.rows[0]?.latest;
      if (ts) lastRanAt = new Date(ts);
    } catch { /* ignore */ }

    // Also honour the in-memory timestamp so a no-data run doesn't re-trigger every 2 min
    const hasRunToday =
      (topPicksLastRun && topPicksLastRun >= todayAt9) ||
      (lastRanAt     && lastRanAt     >= todayAt9);
    const missedToday = now >= todayAt9 && !hasRunToday;

    if (missedToday) {
      // Server restarted after 9am and job hasn't run today — catch up in 2 min
      console.log(`[top-picks] Missed today's 9am run — catching up in 2 min`);
      setTimeout(async () => {
        await runTopPicksJob().catch(e => console.error("[top-picks] Job error:", e.message));
        scheduleDailyTopPicksJob();
      }, 2 * 60 * 1000);
    } else {
      const delay = nextAt9.getTime() - now.getTime();
      console.log(`[top-picks] Daily job scheduled in ${Math.round(delay / 60000)} min`);
      setTimeout(async () => {
        await runTopPicksJob().catch(e => console.error("[top-picks] Job error:", e.message));
        scheduleDailyTopPicksJob();
      }, delay);
    }
  }

  // ── Japanese top picks job ────────────────────────────────────────────────
  // Queries PokeTrace EU for highest-priced Japanese cards across popular sets,
  // then fetches graded eBay prices (US market) for each, storing results in
  // top_picks_precomputed with lang='ja' and raw_price_eur.

  let jpTopPicksJobRunning = false;
  let jpTopPicksLastRun: Date | null = null;

  // Maps Japanese TCGdex set IDs → English display names.
  // These are used in the browse list and to derive PokeTrace EU slugs.
  // TCGdex JP IDs are uppercase (e.g. "SV8a", "SV2D"); PokeTrace slugs are derived
  // by lowercasing, stripping accents, and replacing spaces with hyphens.
  const JP_TCGDEX_EN_NAMES: Record<string, string> = {
    // ── Scarlet & Violet era ─────────────────────────────────────────────────
    "SV1S":  "Scarlet ex",
    "SV1V":  "Violet ex",
    "SV1a":  "Triplet Beat",
    "SV2P":  "Snow Hazard",
    "SV2D":  "Clay Burst",
    "SV2a":  "Pokémon Card 151",
    "SV3":   "Ruler of the Black Flame",
    "SV3a":  "Raging Surf",
    "SV4K":  "Ancient Roar",
    "SV4M":  "Future Flash",
    "SV4a":  "Shiny Treasure ex",
    "SV5a":  "Crimson Haze",
    "SV5K":  "Wild Force",
    "SV5M":  "Cyber Judge",
    "SV6":   "Mask of Change",
    "SV6a":  "Night Wanderer",
    "SV7":   "Stellar Miracle",
    "SV7a":  "Paradise Dragona",
    "SV8":   "Super Electric Breaker",
    "SV8a":  "Terastal Fest ex",
    "SV9":   "Battle Partners",
    "SV9a":  "Heat Wave Arena",
    "SV10":  "Glory of Team Rocket",
    "SV11W": "White Flare",
    "SV11B": "Black Bolt",
    // ── M series (new 2025/2026 Japanese sets) ────────────────────────────────
    "M1S":   "Mega Symphonia",
    "M1B":   "Mega Brave",
    "M1":    "Mega Symphonia",
    "M2":    "Inferno X",
    "M2A":   "MEGA Dream ex",
    "M3":    "Nihil Zero",
    "M4":    "Ninja Spinner",
    // ── Sword & Shield era ───────────────────────────────────────────────────
    "S1W":   "Sword",
    "S1H":   "Shield",
    "S1a":   "VMAX Rising",
    "S2":    "Rebel Clash",
    "S3":    "Infinity Zone",
    "S3a":   "Legendary Heartbeat",
    "S4":    "Amazing Volt Tackle",
    "S4a":   "Shiny Star V",
    "S5I":   "Single Strike Master",
    "S5R":   "Rapid Strike Master",
    "S5a":   "Matchless Fighters",
    "S6H":   "Silver Lance",
    "S6K":   "Jet-Black Spirit",
    "S6a":   "Eevee Heroes",
    "S7R":   "Blue Sky Stream",
    "S7D":   "Skyscraping Perfection",
    "S8":    "Fusion Arts",
    "S8a":   "25th Anniversary Collection",
    "S8b":   "VMAX Climax",
    "S9":    "Star Birth",
    "S9a":   "Battle Region",
    "S10b":  "Pokémon GO",
    "S10D":  "Time Gazer",
    "S10P":  "Space Juggler",
    "S10a":  "Dark Phantasma",
    "S11":   "Lost Abyss",
    "S11a":  "Incandescent Arcana",
    "S12":   "Paradigm Trigger",
    "S12a":  "VSTAR Universe",
    "SMP2":  "Detective Pikachu",
    // ── Sun & Moon era ────────────────────────────────────────────────────────
    "SM0":   "Pikachu's New Friends",
    "SM1S":  "Collection Sun",
    "SM1M":  "Collection Moon",
    "SM1+":  "Sun & Moon",
    "SM2K":  "Islands Await You",
    "SM2L":  "Alolan Moonlight",
    "SM3N":  "Light Consuming Darkness",
    "SM3H":  "Did You See The Fighting Rainbow",
    "SM3+":  "Shining Legends",
    "SM4A":  "Beasts from the Ultradimension",
    "SM4S":  "Awakened Heroes",
    "SM4+":  "GX Battle Boost",
    "SM5M":  "Ultra Moon",
    "SM5S":  "Ultra Sun",
    "SM5+":  "Ultra Force",
    "SM6":   "Forbidden Light",
    "SM6a":  "Dragon Storm",
    "SM6b":  "Champion's Road",
    "SM7":   "Charisma of the Ripped Sky",
    "SM7a":  "Thunderclap Spark",
    "SM7b":  "Fairy Rise",
    "SM8":   "Super Burst Impact",
    "SM8a":  "Dark Order",
    "SM8b":  "GX Ultra Shiny",
    "SM9":   "Tag Bolt",
    "SM9a":  "Night Unison",
    "SM9b":  "Full Metal Force",
    "SM10":  "Double Blaze",
    "SM10b": "Sky Legend",
    "SM11a": "Remix Bout",
    "SM11b": "Dream League",
    "SM12":  "Alter Genesis",
    "SM12a": "Tag All Stars",
    // SM era subsets (lowercase TCGdex IDs)
    "sm2+":  "Let's Face New Trials",
    "sn10a": "GG End",
    "sn11":  "Miracle Twin",
    // ── Sword & Shield era (additional) ─────────────────────────────────────
    "S2a":   "Explosive Walker",
    // ── Scarlet & Violet era (additional / deck products) ────────────────────
    "sv1a":  "Triplet Beat",
    "CS1a":  "Triplet Beat CS (1A)",
    "CS1b":  "Triplet Beat CS (1B)",
    "CS1.5": "Triplet Beat CS 1.5",
    "CS2a":  "Triplet Beat CS (2A)",
    "CS2b":  "Triplet Beat CS (2B)",
    "CS2.5": "Triplet Beat CS 2.5",
    "CS3.5": "Triplet Beat CS 3.5",
    "SVK":   "Stellar Miracle Deck Build Box",
    "SVLN":  "Stellar Nymphia ex Starter Set",
    "SVLS":  "Stellar Soublade ex Starter Set",
    // ── XY era ───────────────────────────────────────────────────────────────
    "XY1a":  "Collection X",
    "XY1b":  "Collection Y",
    "XY2":   "Flashfire",
    "XY3":   "Furious Fists",
    "XY4":   "Phantom Forces",
    "XY5a":  "Gaia Volcano",
    "XY6":   "Roaring Skies",
    "XY7":   "Ancient Origins",
    "XY8a":  "Blue Shock",
    "XY8b":  "Red Flash",
    "XY9":   "BREAKpoint",
    "XY10":  "Fates Collide",
    "XY11a": "Fever-Burst Fighter",
    // ── XY Concept Packs ─────────────────────────────────────────────────────
    "CP1":   "Double Crisis",
    "CP2":   "Legendary Shine Collection",
    "CP3":   "PokéKyun Collection",
    "CP4":   "Premium Champion Pack",
    "CP5":   "Cruel Traitor",
    "CP6":   "20th Anniversary",
    // ── LEGEND era (HeartGold / SoulSilver) ──────────────────────────────────
    "L1a":   "HeartGold Collection",
    "L1b":   "SoulSilver Collection",
    "L2":    "Reviving Legends",
    "L3":    "Clash at the Summit",
    "LL":    "Lost Link",
    // ── ADV era (EX Ruby & Sapphire era) ─────────────────────────────────────
    "ADV1":  "EX Ruby & Sapphire",
    "ADV2":  "EX Sandstorm",
    "ADV3":  "EX Dragon",
    "ADV4":  "Team Magma vs. Team Aqua",
    "ADV5":  "EX Hidden Legends",
    // ── PCG era (EX FireRed & LeafGreen era) ─────────────────────────────────
    "PCG1":  "EX FireRed & LeafGreen",
    "PCG2":  "EX Team Rocket Returns",
    "PCG3":  "EX Deoxys",
    "PCG4":  "EX Unseen Forces",
    "PCG5":  "EX Delta Species",
    "PCG6":  "EX Legend Maker",
    "PCG7":  "EX Holon Phantoms",
    "PCG8":  "EX Crystal Guardians",
    "PCG9":  "EX Dragon Frontiers",
    "PCG10": "World Champions Pack",
    // ── e-Card era ────────────────────────────────────────────────────────────
    "E1":    "Base Expansion Pack",
    "E2":    "The Town on No Map",
    "E3":    "Wind from the Sea",
    "E4":    "Split Earth",
    "E5":    "Mysterious Mountains",
    // ── VS / web era ─────────────────────────────────────────────────────────
    "VS1":   "Pokémon VS",
    "web1":  "Pokémon Web",
    // ── Original era (Base Set era) ──────────────────────────────────────────
    "PMCG1": "Base Set",
    "PMCG2": "Jungle",
    "PMCG3": "Fossil",
    "PMCG4": "Team Rocket",
    "PMCG5": "Gym Heroes",
    "PMCG6": "Gym Challenge",
  };

  // Sets where toPokeTraceSlug(displayName) produces the wrong PokeTrace slug.
  // IMPORTANT: Vintage JP sets (ADV/PCG/E/L/PMCG/neo era) use their JP-romanized PokeTrace slug,
  // NOT their English equivalent name — otherwise PokeTrace returns the English TCG set instead
  // of the Japanese original, resulting in English card images in the JP browse section.
  const JP_POKETRACE_SLUG_OVERRIDES: Record<string, string> = {
    "SV8a": "terastal-festival-ex",           // display name "Terastal Fest ex" → wrong slug
    "SV10": "the-glory-of-team-rocket",       // PokeTrace slug (not the sv10- prefixed variant)
    "M2A":  "mega-dream-ex",                  // "MEGA Dream ex" → explicit slug

    // ── ADV era: EN names like "EX Dragon" hit the English TCG set on PokeTrace ──
    "ADV2": "desert-miracle",                 // 砂漠のきせき (not EX Sandstorm)
    "ADV3": "rulers-of-the-heavens",          // 天空の覇者 (not EX Dragon)
    "ADV4": "magma-vs-aqua-double-trouble",   // マグマvsアクア (not Team Magma vs Team Aqua)
    "ADV5": "broken-seal",                    // とかれた封印 (not EX Hidden Legends)
    // ── PCG era ──────────────────────────────────────────────────────────────────
    "PCG1": "legend-flight",                  // 伝説の飛翔 (not EX FireRed & LeafGreen)
    "PCG2": "blue-sky-exploration",           // 蒼空の激突 (not EX Team Rocket Returns)
    "PCG3": "rocket-gang-strikes-back",       // ロケット団の逆襲 (not EX Deoxys)
    "PCG4": "gold-sky-silver-sea",            // 金の空、銀の海 (not EX Unseen Forces)
    "PCG5": "phantom-forest",                 // まぼろしの森 (not EX Delta Species)
    "PCG6": "holon-research-tower",           // ホロンの研究塔 (not EX Legend Maker)
    "PCG7": "holon-phantoms",                 // ホロンの幻影 (not EX Holon Phantoms)
    "PCG8": "miracle-crystal",                // きせきの結晶 (not EX Crystal Guardians)
    "PCG9": "end-of-battle",                  // さいはての攻防 (not EX Dragon Frontiers)
    "PCG10": "world-champions-pack",          // same in both JP/EN — keep
    // ── LEGEND era ────────────────────────────────────────────────────────────────
    "L1a": "heartgold-collection",            // ハートゴールドコレクション
    "L1b": "soulsilver-collection",           // ソウルシルバーコレクション
    "L2":  "reviving-legends",                // よみがえる伝説
    "L3":  "clash-at-the-summit",             // 頂上大激突
    "LL":  "lost-link",                       // 強化パック ロストリンク
    // ── e-Card era ────────────────────────────────────────────────────────────────
    "E1":  "base-expansion-pack",             // 基本拡張パック (not English Base Set)
    "E2":  "the-town-on-no-map",              // 地図にない町
    // ── Original era: EN names "Base Set"/"Jungle" hit English sets on PokeTrace ─
    "PMCG1": "",                              // No JP-specific PokeTrace data — skip
    "PMCG2": "",                              // No JP-specific PokeTrace data — skip
    "PMCG3": "",                              // No JP-specific PokeTrace data — skip
    "PMCG4": "",                              // No JP-specific PokeTrace data — skip
    "PMCG5": "",                              // No JP-specific PokeTrace data — skip
    "PMCG6": "",                              // No JP-specific PokeTrace data — skip
  };

  // Japanese sets that exist on PokeTrace but are NOT listed on TCGdex.
  // These are appended to the TCGdex set list so they still get synced.
  const EXTRA_JP_POKETRACE_SETS: Array<{ id: string; nameEn: string; releaseDate: string | null }> = [
    { id: "M1B", nameEn: "Mega Brave",    releaseDate: "2025-08-01" },
    { id: "M2",  nameEn: "Inferno X",     releaseDate: "2025-09-26" },
    { id: "M2A", nameEn: "MEGA Dream ex", releaseDate: "2025-11-28" },
  ];

  // Derives a PokeTrace-compatible slug from an English set name.
  // Normalises accents (é→e) so "Pokémon GO" → "pokemon-go" etc.
  function toPokeTraceSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip accents
      .replace(/['\u2019]/g, "")                          // remove apostrophes
      .replace(/[&]/g, "and")                             // & → and
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  // Maps PokeTrace slug → TCGdex {series, setId} for high-res card images (600×825)
  // Sets not listed here fall back to PokeTrace CDN (255×361) images
  const SLUG_TO_TCGDEX: Record<string, { series: string; setId: string }> = {
    // SV era — all confirmed working on TCGdex
    "scarlet-ex":               { series: "SV", setId: "SV1S" },
    "violet-ex":                { series: "SV", setId: "SV1V" },
    "triplet-beat":             { series: "SV", setId: "SV1a" },
    "snow-hazard":              { series: "SV", setId: "SV2P" },
    "clay-burst":               { series: "SV", setId: "SV2D" },
    "151":                      { series: "SV", setId: "SV2a" },
    "raging-surf":              { series: "SV", setId: "SV3a" },
    "ruler-of-the-black-flame": { series: "SV", setId: "SV3"  },
    "ancient-roar":             { series: "SV", setId: "SV4K" },
    "future-flash":             { series: "SV", setId: "SV4M" },
    "shiny-treasure-ex":        { series: "SV", setId: "SV4a" },
    "crimson-haze":             { series: "SV", setId: "SV5a" },
    "wild-force":               { series: "SV", setId: "SV5K" },
    "cyber-judge":              { series: "SV", setId: "SV5M" },
    "mask-of-change":           { series: "SV", setId: "SV6"  },
    "night-wanderer":           { series: "SV", setId: "SV6a" },
    "stellar-miracle":          { series: "SV", setId: "SV7"  },
    "paradise-dragona":         { series: "SV", setId: "SV7a" },
    "super-electric-breaker":   { series: "SV", setId: "SV8"  },
    "terastal-festival-ex":     { series: "SV", setId: "SV8a" },
    "battle-partners":          { series: "SV", setId: "SV9"  },
    "hot-wind-arena":           { series: "SV", setId: "SV9a" },
    // SwSh era — only confirmed working sets included
    "star-birth":               { series: "S",  setId: "S9"   },
    "battle-region":            { series: "S",  setId: "S9a"  },
    "dark-phantasma":           { series: "S",  setId: "S10a" },
    "incandescent-arcana":      { series: "S",  setId: "S11a" },
    "lost-abyss":               { series: "S",  setId: "S11"  },
    "vstar-universe":           { series: "S",  setId: "S12a" },
    "vmax-climax":              { series: "S",  setId: "S12"  },
    // S6a/S7R/S8/S8a not available on TCGdex — fall back to PokeTrace
  };

  function buildTcgdexImageUrl(slug: string, cardNumber: string): string | null {
    const info = SLUG_TO_TCGDEX[slug];
    if (!info || !cardNumber) return null;
    const padded = String(cardNumber).padStart(3, "0");
    return `https://assets.tcgdex.net/ja/${info.series}/${info.setId}/${padded}/high.webp`;
  }

  // Popular modern Japanese sets — slugs that PokeTrace EU recognises
  const JP_SET_SLUGS = [
    // SV era
    "triplet-beat", "snow-hazard", "clay-burst", "scarlet-ex", "violet-ex",
    "151", "raging-surf", "ruler-of-the-black-flame",
    "ancient-roar", "future-flash", "shiny-treasure-ex",
    "crimson-haze", "wild-force", "cyber-judge",
    "mask-of-change", "night-wanderer",
    "stellar-miracle", "paradise-dragona",
    "super-electric-breaker", "terastal-festival-ex",
    "battle-partners", "hot-wind-arena",
    "the-glory-of-team-rocket",
    "white-flare", "black-bolt",
    "mega-symphony", "munkis-zero",
    // SwSh era
    "vstar-universe", "lost-abyss", "incandescent-arcana",
    "dark-phantasma", "battle-region",
    "fusion-arts",
    "eevee-heroes", "peerless-fighters", "matchless-fighters",
    "blue-sky-stream", "towering-perfection",
    "s-p-promotional-cards",
    "star-birth", "vmax-climax", "shiny-star-v",
  ];

  async function runJapaneseTopPicksJob(): Promise<void> {
    if (jpTopPicksJobRunning) {
      console.log("[jp-top-picks] Job already running, skipping");
      return;
    }
    jpTopPicksJobRunning = true;
    console.log("[jp-top-picks] Starting Japanese precomputed picks job...");
    try {
      const rates = await getExchangeRates();
      const eurRate = rates.rates.EUR ?? 0.86; // USD per EUR
      const gbpRate = rates.rates.GBP ?? 0.79;
      const apiKey  = process.env.POKETRACE_API_KEY;
      if (!apiKey) throw new Error("POKETRACE_API_KEY not configured");

      // Remove any stale picks for sets that are no longer in JP_SET_SLUGS
      // (e.g. English sets accidentally included in a previous run)
      if (JP_SET_SLUGS.length > 0) {
        const slugPlaceholders = JP_SET_SLUGS.map((_: string, i: number) => `$${i + 1}`).join(',');
        const delResult = await db.query(
          `DELETE FROM top_picks_precomputed WHERE lang='ja' AND set_id NOT IN (${slugPlaceholders})`,
          JP_SET_SLUGS
        );
        if (delResult.rowCount && delResult.rowCount > 0) {
          console.log(`[jp-top-picks] Cleaned up ${delResult.rowCount} stale picks for removed/English sets`);
        }
      }

      // Collect candidate cards from each set (PokeTrace EU, sorted by NM price desc)
      const candidates: Array<{
        cardId: string; name: string; setName: string; setSlug: string;
        number: string; imageUrl: string | null; nmEUR: number;
      }> = [];

      for (const slug of JP_SET_SLUGS) {
        try {
          // Paginate through all cards in this set — PokeTrace has no price sort,
          // so we must fetch all cards and pick the most valuable ourselves.
          let cursor: string | null = null;
          let pageCount = 0;
          const MAX_PAGES = 15; // safety cap (~1500 cards max)
          const setCards: any[] = [];
          do {
            const pageUrl = `https://api.poketrace.com/v1/cards?set=${encodeURIComponent(slug)}&market=EU&limit=100`
              + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
            const resp = await fetch(pageUrl, { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(15000) });
            if (!resp.ok) { console.warn(`[jp-top-picks] Set ${slug}: HTTP ${resp.status}`); break; }
            const data = await resp.json() as any;
            const page: any[] = data?.data || [];
            setCards.push(...page);
            cursor = data?.pagination?.nextCursor ?? null;
            pageCount++;
            if (!cursor) break; // rely on cursor, not page size (PokeTrace pages vary in size)
            await new Promise(r => setTimeout(r, 200));
          } while (pageCount < MAX_PAGES);

          // Take the top 8 most valuable cards from this set
          const topCards = setCards
            .map(c => ({ c, nm: c.prices?.cardmarket_unsold?.NEAR_MINT?.avg ?? 0 }))
            .filter(x => x.nm > 0)
            .sort((a, b) => b.nm - a.nm)
            .slice(0, 8);

          for (const { c, nm } of topCards) {
            const tcgdexUrl = buildTcgdexImageUrl(slug, c.cardNumber || "");
            candidates.push({
              cardId:   c.id || `jp-${c.name}-${c.cardNumber}`,
              name:     c.name || "Unknown",
              setName:  c.set?.name || slug,
              setSlug:  slug,
              number:   c.cardNumber || "",
              imageUrl: tcgdexUrl ?? c.image ?? null,
              nmEUR:    Math.round(nm * 100) / 100,
            });
          }
          await new Promise(r => setTimeout(r, 300));
        } catch (e: any) {
          console.warn(`[jp-top-picks] Set ${slug} error:`, e.message);
        }
      }

      console.log(`[jp-top-picks] Collected ${candidates.length} candidates across ${JP_SET_SLUGS.length} sets`);

      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

      // Convert EUR prices to GBP for tier bucketing
      for (const tier of TOP_PICKS_TIERS) {
        const minEUR = (tier.minGBP / gbpRate) * eurRate;
        const maxEUR = (tier.maxGBP / gbpRate) * eurRate;

        const tieredCandidates = candidates
          .filter(c => c.nmEUR >= minEUR && c.nmEUR < maxEUR)
          .sort((a, b) => b.nmEUR - a.nmEUR)
          .slice(0, 15);

        console.log(`[jp-top-picks] Tier £${tier.maxGBP}: ${tieredCandidates.length} candidates (€${minEUR.toFixed(2)}–€${maxEUR.toFixed(2)})`);

        for (const card of tieredCandidates) {
          try {
            const ebay = await fetchEbayGradedPrices(card.name, card.setName, card.number || undefined);
            const hasData = [
              ebay.psa10, ebay.psa9, ebay.bgs95, ebay.bgs9,
              ebay.ace10, ebay.tag10, ebay.cgc10, ebay.raw,
            ].some(v => v > 0);

            if (hasData) {
              const { fetchedAt: _fa, ...gradesOnly } = ebay;
              await db.query(
                `INSERT INTO top_picks_precomputed
                   (card_id, tier_max_gbp, card_name, set_name, set_id, number, image_url,
                    raw_price_usd, raw_price_eur, lang,
                    ebay_psa10, ebay_psa9, ebay_bgs95, ebay_bgs9, ebay_ace10, ebay_tag10, ebay_cgc10, ebay_raw,
                    ebay_all_grades, ebay_fetched_at, is_stale, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ja',$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),FALSE,NOW())
                 ON CONFLICT (card_id, tier_max_gbp) DO UPDATE SET
                   card_name=$3, set_name=$4, image_url=$7, raw_price_usd=$8, raw_price_eur=$9, lang='ja',
                   ebay_psa10=$10, ebay_psa9=$11, ebay_bgs95=$12, ebay_bgs9=$13,
                   ebay_ace10=$14, ebay_tag10=$15, ebay_cgc10=$16, ebay_raw=$17,
                   ebay_all_grades=$18, ebay_fetched_at=NOW(), is_stale=FALSE, updated_at=NOW()`,
                [
                  card.cardId, tier.maxGBP, card.name, card.setName, card.setSlug,
                  card.number, card.imageUrl,
                  Math.round(card.nmEUR / eurRate * 100) / 100, // raw_price_usd (approx)
                  card.nmEUR,                                    // raw_price_eur
                  ebay.psa10, ebay.psa9, ebay.bgs95, ebay.bgs9,
                  ebay.ace10, ebay.tag10, ebay.cgc10, ebay.raw,
                  JSON.stringify(gradesOnly),
                ]
              );
              // Snapshot to history (once per card per day)
              await db.query(
                `INSERT INTO top_picks_history
                   (card_id, tier_max_gbp, lang, snapshot_date, card_name,
                    ebay_psa10, ebay_ace10, ebay_tag10, ebay_bgs95, ebay_cgc10, raw_price_usd)
                 VALUES ($1,$2,'ja',$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (card_id, tier_max_gbp, lang, snapshot_date) DO NOTHING`,
                [
                  card.cardId, tier.maxGBP, today, card.name,
                  ebay.psa10, ebay.ace10, ebay.tag10, ebay.bgs95, ebay.cgc10,
                  Math.round(card.nmEUR / eurRate * 100) / 100,
                ]
              );
              console.log(`[jp-top-picks] ✓ ${card.name} (£${tier.maxGBP}) €${card.nmEUR} PSA10=$${ebay.psa10}`);
            } else {
              await db.query(
                `UPDATE top_picks_precomputed SET is_stale=TRUE, updated_at=NOW()
                  WHERE card_id=$1 AND tier_max_gbp=$2`,
                [card.cardId, tier.maxGBP]
              );
            }
          } catch (err: any) {
            console.error(`[jp-top-picks] Error processing ${card.name}:`, err.message);
          }
          await new Promise(r => setTimeout(r, 400));
        }
      }

      jpTopPicksLastRun = new Date();
      console.log("[jp-top-picks] Japanese precomputed picks job complete");
    } finally {
      jpTopPicksJobRunning = false;
    }
  }

  async function scheduleDailyJpTopPicksJob() {
    const now = new Date();
    const todayAt10 = new Date();
    todayAt10.setUTCHours(10, 0, 0, 0); // 10am UTC (1h after English job)
    const nextAt10 = new Date(todayAt10);
    if (nextAt10 <= now) nextAt10.setUTCDate(nextAt10.getUTCDate() + 1);

    let lastRanAt: Date | null = null;
    try {
      const row = await db.query<{ latest: string }>(
        `SELECT MAX(ebay_fetched_at) AS latest FROM top_picks_precomputed WHERE lang='ja'`
      );
      const ts = row.rows[0]?.latest;
      if (ts) lastRanAt = new Date(ts);
    } catch { /* ignore */ }

    const hasRunToday =
      (jpTopPicksLastRun && jpTopPicksLastRun >= todayAt10) ||
      (lastRanAt         && lastRanAt         >= todayAt10);
    const missedToday = now >= todayAt10 && !hasRunToday;

    if (missedToday) {
      console.log(`[jp-top-picks] Missed today's 10am run — catching up in 3 min`);
      setTimeout(async () => {
        await runJapaneseTopPicksJob().catch(e => console.error("[jp-top-picks] Job error:", e.message));
        scheduleDailyJpTopPicksJob();
      }, 3 * 60 * 1000);
    } else {
      const delay = nextAt10.getTime() - now.getTime();
      console.log(`[jp-top-picks] Daily job scheduled in ${Math.round(delay / 60000)} min`);
      setTimeout(async () => {
        await runJapaneseTopPicksJob().catch(e => console.error("[jp-top-picks] Job error:", e.message));
        scheduleDailyJpTopPicksJob();
      }, delay);
    }
  }

  // ── ME-series PokeTrace price fill ──────────────────────────────────────────
  // pokemontcg.io has no TCGPlayer prices for newer ME sets (me2pt5, me3 etc.).
  // PokeTrace has both TCGPlayer and eBay graded prices for them — this job
  // fills the gap by searching PokeTrace per-card and upserting price_usd.
  const ME_POKETRACE_SLUGS: Record<string, { slug: string; shortName: string }> = {
    "me1":    { slug: "me-mega-evolution",    shortName: "Mega Evolution" },
    "me2":    { slug: "me-phantasmal-flames", shortName: "Phantasmal Flames" },
    "me2pt5": { slug: "me-ascended-heroes",   shortName: "Ascended Heroes" },
    "me3":    { slug: "me03-perfect-order",   shortName: "Perfect Order" },
  };

  let mePriceFillRunning = false;

  async function fillMeSetPricesFromPokeTrace(): Promise<void> {
    if (mePriceFillRunning) { console.log("[me-prices] Fill already running — skipping"); return; }
    mePriceFillRunning = true;
    try {
      const apiKey = process.env.POKETRACE_API_KEY;
      if (!apiKey) { console.warn("[me-prices] No POKETRACE_API_KEY — skipping"); return; }

      const targetSetIds = Object.keys(ME_POKETRACE_SLUGS);
      const { rows: unpricedCards } = await db.query(
        `SELECT card_id, set_id, set_name, name, number
           FROM card_catalog
          WHERE set_id = ANY($1) AND price_usd IS NULL AND name IS NOT NULL AND name <> ''
                AND COALESCE(lang, 'en') = 'en'
          ORDER BY set_id, number`,
        [targetSetIds]
      );

      if (unpricedCards.length === 0) {
        console.log("[me-prices] All ME set cards already priced — nothing to fill");
        return;
      }

      console.log(`[me-prices] Fetching PokeTrace prices for ${unpricedCards.length} unpriced ME cards...`);
      let priced = 0;
      let notFound = 0;
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

      for (const card of unpricedCards as any[]) {
        const meta = ME_POKETRACE_SLUGS[card.set_id];
        if (!meta) continue;

        const { slug: ptSlug, shortName } = meta;
        const searchQuery = `${card.name} ${shortName}`;
        const url = `https://api.poketrace.com/v1/cards?search=${encodeURIComponent(searchQuery)}&market=US&limit=10`;

        try {
          let resp = await fetch(url, { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(12000) });

          if (resp.status === 429) {
            const waitSec = Math.min(parseInt(resp.headers.get("retry-after") || "30", 10), 60);
            console.warn(`[me-prices] 429 rate limit — waiting ${waitSec}s`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            resp = await fetch(url, { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(12000) });
          }

          if (!resp.ok) {
            console.warn(`[me-prices] HTTP ${resp.status} for "${card.name}"`);
            notFound++;
            await new Promise(r => setTimeout(r, 500));
            continue;
          }

          const data = await resp.json() as any;
          const results: any[] = data?.data || [];

          const baseNum = (card.number || "").split("/")[0].replace(/[^0-9]/g, "");
          const slugMatch  = (c: any) => c.set?.slug === ptSlug;
          const numMatch   = (c: any) => baseNum && (c.cardNumber?.split("/")[0] === baseNum || c.cardNumber === baseNum);
          const nameMatch  = (c: any) => normalize(c.name || "") === normalize(card.name || "");
          const notReverse = (c: any) => !(c.variant || "").toLowerCase().includes("reverse");

          // Build candidate priority: prefer non-reverse, then anything from the set slug
          const candidates =
            results.filter(c => slugMatch(c) && numMatch(c) && notReverse(c)).concat(
            results.filter(c => slugMatch(c) && numMatch(c))).concat(
            results.filter(c => slugMatch(c) && nameMatch(c) && notReverse(c))).concat(
            results.filter(c => slugMatch(c) && nameMatch(c))).concat(
            results.filter(c => slugMatch(c)));
          // Deduplicate by card ID
          const seen = new Set<string>();
          const ranked = candidates.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

          // Among candidates, pick the one with the best available price
          const hasNM  = (c: any) => (c.prices?.tcgplayer?.NEAR_MINT?.avg ?? null) != null;
          const hasEbayNM = (c: any) => (c.prices?.ebay?.NEAR_MINT?.avg ?? null) != null;
          const match = ranked.find(c => hasNM(c)) || ranked.find(c => hasEbayNM(c)) || ranked[0];

          if (!match) { notFound++; await new Promise(r => setTimeout(r, 200)); continue; }

          const tcgpPrices = match.prices?.tcgplayer || {};
          const ebayPrices = match.prices?.ebay || {};
          // TCGPlayer NM is the preferred raw price; fall back to eBay NM raw if unavailable
          const nmPrice: number | null = tcgpPrices.NEAR_MINT?.avg ?? ebayPrices.NEAR_MINT?.avg ?? null;
          if (nmPrice == null) { notFound++; await new Promise(r => setTimeout(r, 200)); continue; }

          const variantLower = (match.variant || "").toLowerCase();
          const variantKey = variantLower.includes("reverse") ? "reverseHolofoil"
                           : variantLower.includes("holo")    ? "holofoil"
                           : "normal";
          const pricesJson = {
            [variantKey]: {
              low: tcgpPrices.LIGHTLY_PLAYED?.avg ?? null,
              mid: null,
              high: null,
              market: nmPrice,
              directLow: null,
            },
          };

          await db.query(
            `UPDATE card_catalog SET price_usd = $1, prices_json = $2, price_updated_at = NOW() WHERE card_id = $3`,
            [nmPrice, JSON.stringify(pricesJson), card.card_id]
          );
          priced++;
        } catch (err: any) {
          console.warn(`[me-prices] Error for "${card.name}" (${card.set_id}): ${err.message}`);
          notFound++;
        }

        await new Promise(r => setTimeout(r, 250));
      }

      console.log(`[me-prices] Fill complete — priced: ${priced}, not found/no data: ${notFound}`);

      const affectedSetIds = [...new Set<string>((unpricedCards as any[]).map(c => c.set_id))];
      for (const sid of affectedSetIds) {
        const { rows } = await db.query(
          `SELECT COUNT(price_usd)::int AS priced FROM card_catalog WHERE set_id = $1 AND COALESCE(lang,'en')='en'`,
          [sid]
        );
        upsertSetPriceStatus(sid, true, ((rows[0] as any)?.priced ?? 0) > 0);
      }
    } finally {
      mePriceFillRunning = false;
    }
  }

  // Schedule daily card catalog price refresh (3:30 AM UTC — 30 min after status refresh)
  function scheduleDailyCardCatalogSync() {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(3, 30, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    const delayMin = Math.round(delay / 60000);
    console.log(`[card-catalog] Daily sync scheduled in ${delayMin} min`);
    setTimeout(async () => {
      await syncAllEnglishSets("prices-only");
      await fillMeSetPricesFromPokeTrace();
      scheduleDailyCardCatalogSync();
    }, delay);
  }

  // Sync all Japanese sets into card_catalog (same pattern as syncAllEnglishSets)
  let jpCatalogSyncRunning = false;
  async function syncAllJapaneseSets(mode: "full" | "prices-only" = "full"): Promise<void> {
    if (jpCatalogSyncRunning) { console.log("[jp-catalog] Sync already in progress — skipping"); return; }
    jpCatalogSyncRunning = true;
    try {
      const allSets = await buildTcgdexSetList("ja");
      // Append PokeTrace-only sets that TCGdex doesn't track, then re-sort
      for (const extra of EXTRA_JP_POKETRACE_SETS) {
        if (!allSets.some((s: any) => s.id.toLowerCase() === extra.id.toLowerCase())) {
          allSets.push({ id: extra.id, name: extra.id, nameEn: extra.nameEn, cardCount: 0, releaseDate: extra.releaseDate, logo: null, _serieIdx: 999, _setIdx: 0 });
        }
      }
      allSets.sort((a: any, b: any) => {
        const da = a.releaseDate ?? "9999-99-99"; const db = b.releaseDate ?? "9999-99-99";
        if (da !== db) return db.localeCompare(da);
        if (a._serieIdx !== b._serieIdx) return b._serieIdx - a._serieIdx;
        return b._setIdx - a._setIdx;
      });
      console.log(`[jp-catalog] Starting ${mode} sync for ${allSets.length} JP sets...`);
      let synced = 0; let skipped = 0; let errors = 0;

      for (const s of allSets) {
        try {
          // In prices-only mode, skip sets whose prices were updated within the last 20h
          if (mode === "prices-only") {
            const { rows } = await db.query(
              `SELECT MIN(price_updated_at) as oldest FROM card_catalog WHERE set_id = $1 AND lang = 'ja'`,
              [s.id]
            );
            const oldest = rows[0]?.oldest;
            if (oldest && Date.now() - new Date(oldest).getTime() < 20 * 60 * 60 * 1000) {
              skipped++;
              continue;
            }
          }

          const { cards, setNameEn, setName } = await fetchJpSetCards(s.id, "ja", s.nameEn || undefined);
          if (cards.length > 0) {
            await upsertJpCardsForSet(s.id, setName, setNameEn, cards, "ja");
          }
          upsertSetPriceStatus(s.id, cards.length > 0, cards.some(c => c.priceEUR != null && c.priceEUR > 0));
          // Warm L1 cache
          setCardsCache.set(`japanese:${s.id}`, {
            cards: cards.map(c => ({ ...c, price: null, prices: null })),
            fetchedAt: Date.now(),
          });

          synced++;
          if (synced % 20 === 0) console.log(`[jp-catalog] Synced ${synced}/${allSets.length} JP sets...`);
        } catch (err: any) {
          console.warn(`[jp-catalog] Failed to sync ${s.id}: ${err.message}`);
          errors++;
        }
        // Polite delay — PokeTrace has rate limits
        await new Promise(r => setTimeout(r, 600));
      }
      console.log(`[jp-catalog] Sync complete — ${synced} synced, ${skipped} skipped, ${errors} errors`);
    } finally {
      jpCatalogSyncRunning = false;
    }
  }

  // Schedule daily JP catalog price refresh (4:00 AM UTC — 30 min after EN refresh)
  function scheduleDailyJpCatalogSync() {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(4, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    const delayMin = Math.round(delay / 60000);
    console.log(`[jp-catalog] Daily sync scheduled in ${delayMin} min`);
    setTimeout(async () => {
      await syncAllJapaneseSets("prices-only");
      scheduleDailyJpCatalogSync();
    }, delay);
  }
  const PRICE_STATUS_TTL = 23 * 60 * 60 * 1000; // 23h — re-check after 1 day
  let priceStatusPrePopStarted = false;

  // Write to both memory cache and DB atomically
  function upsertSetPriceStatus(setId: string, hasCards: boolean, hasPrices: boolean) {
    const checkedAt = Date.now();
    setPriceStatusCache.set(setId, { hasCards, hasPrices, checkedAt });
    db.query(
      `INSERT INTO set_price_status (set_id, has_cards, has_prices, checked_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (set_id) DO UPDATE SET has_cards=$2, has_prices=$3, checked_at=$4`,
      [setId, hasCards, hasPrices, checkedAt]
    ).catch(err => console.error(`[price-status] DB write error for ${setId}:`, err.message));
  }

  // Load persisted statuses from DB into memory on first call to set browser
  let dbStatusLoaded = false;
  async function loadSetPriceStatusFromDB() {
    if (dbStatusLoaded) return;
    dbStatusLoaded = true;
    try {
      const { rows } = await db.query<{ set_id: string; has_cards: boolean; has_prices: boolean; checked_at: string }>(
        `SELECT set_id, has_cards, has_prices, checked_at FROM set_price_status`
      );
      for (const row of rows) {
        if (!setPriceStatusCache.has(row.set_id)) {
          setPriceStatusCache.set(row.set_id, {
            hasCards: row.has_cards,
            hasPrices: row.has_prices,
            checkedAt: Number(row.checked_at),
          });
        }
      }
      console.log(`[price-status] Loaded ${rows.length} set statuses from DB`);
    } catch (err: any) {
      console.error("[price-status] Failed to load from DB:", err.message);
    }
  }

  // Background task: sample cards per English set to determine TCGPlayer price availability
  // Processes sets that haven't been checked yet OR whose status is older than PRICE_STATUS_TTL
  // ME-series sets use PokeTrace prices (not TCGPlayer), so we check card_catalog for those.
  const ME_SERIES_SET_IDS = new Set(["me1", "me2", "me2pt5", "me3"]);
  async function backgroundPrePopulatePriceStatus(sets: CachedSet[]) {
    const PRICE_TYPES = ["holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil", "1stEditionNormal", "unlimitedHolofoil", "unlimited"];
    const stale = sets.filter(s => {
      const status = setPriceStatusCache.get(s.id);
      return !status || Date.now() - status.checkedAt > PRICE_STATUS_TTL;
    });
    if (stale.length === 0) { console.log("[price-status] All sets up-to-date — no refresh needed"); return; }
    console.log(`[price-status] Pre-populating ${stale.length} sets in background...`);
    for (const s of stale) {
      try {
        // ME-series sets have PokeTrace prices stored in card_catalog, not TCGPlayer prices.
        // Check card_catalog directly so we don't incorrectly mark them as having no prices.
        if (ME_SERIES_SET_IDS.has(s.id)) {
          const { rows } = await db.query<{ cnt: string }>(
            `SELECT COUNT(*) AS cnt FROM card_catalog WHERE set_id = $1 AND price_usd IS NOT NULL AND price_usd > 0`,
            [s.id]
          );
          const hasCards = (s.printedTotal || s.total) > 0;
          const hasPrices = parseInt(rows[0]?.cnt ?? "0", 10) > 0;
          upsertSetPriceStatus(s.id, hasCards, hasPrices);
          await new Promise(r => setTimeout(r, 50));
          continue;
        }
        const resp = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(s.id)}&pageSize=10&select=id,tcgplayer`,
          { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
        );
        if (resp.ok) {
          const data = await resp.json() as any;
          const cards: any[] = data?.data ?? [];
          const hasCards = (s.printedTotal || s.total) > 0;
          const hasPrices = cards.some((c: any) => {
            const prices = c.tcgplayer?.prices ?? {};
            return PRICE_TYPES.some(pt => { const t = prices[pt]; return t && (t.market ?? t.mid) != null; });
          });
          upsertSetPriceStatus(s.id, hasCards, hasPrices);
        }
      } catch { /* ignore individual set failures */ }
      // Be polite to the Pokemon TCG API — 200ms between requests
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`[price-status] Pre-population complete — ${setPriceStatusCache.size} sets tracked.`);
  }

  // Schedule a daily full refresh so price status stays current (2 AM UTC)
  function scheduleDailySetStatusRefresh() {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(2, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    console.log(`[price-status] Daily refresh scheduled in ${Math.round(delay / 60000)} min`);
    setTimeout(async () => {
      console.log("[price-status] Daily refresh starting...");
      priceStatusPrePopStarted = false;
      const sets = await ensureSetsCached().catch(() => [] as CachedSet[]);
      if (sets.length > 0) await backgroundPrePopulatePriceStatus(sets);
      scheduleDailySetStatusRefresh();
    }, delay);
  }

  // --- TCGdex series metadata cache (set → serie mapping for logo URLs & sort order) ---
  interface TcgdexSeriesInfo {
    /** setId → { serieId, serieReleaseDate, setIndex, logoUrl } */
    sets: Map<string, { serieId: string; serieReleaseDate: string | null; setIndex: number; logoUrl: string | null }>;
    /** Ordered series IDs (oldest → newest), for fallback ordering when dates absent */
    seriesOrder: string[];
    fetchedAt: number;
  }
  const tcgdexSeriesCache = new Map<string, TcgdexSeriesInfo>();
  const TCGDEX_SERIES_CACHE_TTL = 24 * 60 * 60 * 1000;

  /** setId → English name (from TCGdex /v2/en/sets) */
  let tcgdexEnNameCache: Map<string, string> | null = null;
  let tcgdexEnNameFetchedAt = 0;

  async function getTcgdexEnNames(): Promise<Map<string, string>> {
    if (tcgdexEnNameCache && Date.now() - tcgdexEnNameFetchedAt < TCGDEX_SERIES_CACHE_TTL) {
      return tcgdexEnNameCache;
    }
    try {
      const resp = await fetch("https://api.tcgdex.net/v2/en/sets", {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return tcgdexEnNameCache ?? new Map();
      const list = await resp.json() as any[];
      const map = new Map<string, string>();
      for (const s of list) {
        if (s.id && s.name) map.set(s.id as string, s.name as string);
      }
      tcgdexEnNameCache = map;
      tcgdexEnNameFetchedAt = Date.now();
      return map;
    } catch {
      return tcgdexEnNameCache ?? new Map();
    }
  }

  async function fetchTcgdexSeriesInfo(langCode: string): Promise<TcgdexSeriesInfo> {
    const cached = tcgdexSeriesCache.get(langCode);
    if (cached && Date.now() - cached.fetchedAt < TCGDEX_SERIES_CACHE_TTL) return cached;

    const empty: TcgdexSeriesInfo = { sets: new Map(), seriesOrder: [], fetchedAt: Date.now() };
    try {
      const listResp = await fetch(`https://api.tcgdex.net/v2/${langCode}/series`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!listResp.ok) return empty;
      const seriesList = await listResp.json() as any[];

      const details = await Promise.all(
        seriesList.map((s: any) =>
          fetch(`https://api.tcgdex.net/v2/${langCode}/series/${s.id}`, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(8000),
          }).then(r => r.json()).catch(() => null)
        )
      );

      // Sort series by releaseDate ascending (oldest first); null dates = treat as newest
      const sortedDetails = [...details].sort((a, b) => {
        const da = (a?.releaseDate as string | null) ?? "9999-99-99";
        const db = (b?.releaseDate as string | null) ?? "9999-99-99";
        return da.localeCompare(db);
      });

      const setsMap = new Map<string, { serieId: string; serieReleaseDate: string | null; setIndex: number; logoUrl: string | null }>();
      const seriesOrder: string[] = [];
      sortedDetails.forEach((detail: any) => {
        if (!detail?.sets) return;
        seriesOrder.push(detail.id as string);
        const serieReleaseDate: string | null = (detail.releaseDate as string | undefined) ?? null;
        (detail.sets as any[]).forEach((set: any, setIdx: number) => {
          // Use the logo URL as-is — TCGdex serves extension-less URLs (adding .png returns 404)
          const rawLogo: string | null = set.logo || null;
          const logoUrl = rawLogo || null;
          setsMap.set(set.id, {
            serieId: detail.id as string,
            serieReleaseDate,
            setIndex: setIdx,
            logoUrl,
          });
        });
      });

      const result: TcgdexSeriesInfo = { sets: setsMap, seriesOrder, fetchedAt: Date.now() };
      tcgdexSeriesCache.set(langCode, result);
      console.log(`[tcgdex-series] Cached ${setsMap.size} sets across ${seriesOrder.length} series for lang=${langCode}`);
      return result;
    } catch (e: any) {
      console.error(`[tcgdex-series] Failed for ${langCode}:`, e.message);
      return empty;
    }
  }

  async function buildTcgdexSetList(langCode: string): Promise<any[]> {
    const [listResp, seriesInfo, enNames] = await Promise.all([
      fetch(`https://api.tcgdex.net/v2/${langCode}/sets`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(12000),
      }),
      fetchTcgdexSeriesInfo(langCode),
      getTcgdexEnNames(),
    ]);
    if (!listResp.ok) throw new Error("TCGdex unavailable");
    const list = await listResp.json() as any[];

    const seriesOrderMap = new Map(seriesInfo.seriesOrder.map((id, i) => [id, i]));

    // Deduplicate by set ID — TCGdex sometimes returns the same set ID multiple times
    // (e.g. sv1a × 8, SV1a × 1) — use case-insensitive comparison to catch all variants
    const seenSetIds = new Set<string>();
    const enriched = list
      .filter((s: any) => {
        const normalizedId = (s.id as string).toLowerCase();
        if (seenSetIds.has(normalizedId)) return false;
        seenSetIds.add(normalizedId);
        return true;
      })
      .map((s: any) => {
        const info = seriesInfo.sets.get(s.id);
        // TCGdex does NOT host logo images for Japanese/Korean sets — the extension-less URL
        // returns an HTML error page, and appending .webp/.png returns 404.
        // Set logo to null so the frontend shows the placeholder icon instead of a broken image.
        const logo: string | null = null;
        const serieReleaseDate = info?.serieReleaseDate ?? null;
        const serieIdx = info ? (seriesOrderMap.get(info.serieId) ?? 0) : 0;
        // English name: static map first (most reliable), then TCGdex English flat-list
        // cross-ref (works for sets shared between EN and JP), then TCGdex-provided nameEn
        const nameEn = JP_TCGDEX_EN_NAMES[s.id as string]
          || enNames.get(s.id)
          || (s.nameEn as string | undefined)
          || null;
        return {
          id: s.id as string,
          name: s.name as string,
          nameEn,
          cardCount: (s.cardCount?.official || s.cardCount?.total || 0) as number,
          releaseDate: serieReleaseDate,
          logo,
          _serieIdx: serieIdx,
          _setIdx: info?.setIndex ?? 0,
        };
      });

    // Sort newest first: by serie release date desc, then serie list-order desc, then set index desc
    // Null dates treated as newest (9999-99-99) so undated sets float to top
    enriched.sort((a, b) => {
      const dateA = a.releaseDate ?? "9999-99-99";
      const dateB = b.releaseDate ?? "9999-99-99";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      if (a._serieIdx !== b._serieIdx) return b._serieIdx - a._serieIdx;
      return b._setIdx - a._setIdx;
    });

    return enriched.map(({ _serieIdx, _setIdx, ...rest }) => rest);
  }

  // Warm TCGdex series caches in the background on server start
  void fetchTcgdexSeriesInfo("ja");
  void fetchTcgdexSeriesInfo("ko");
  void getTcgdexEnNames();

  // Start the daily refresh schedulers
  scheduleDailySetStatusRefresh();
  scheduleDailyCardCatalogSync();
  scheduleDailyJpCatalogSync();
  scheduleDailyTopPicksJob();
  scheduleDailyJpTopPicksJob();

  // Kick off first-run catalog population if the DB is empty (non-blocking)
  void (async () => {
    const count = await getCardCatalogCount();
    if (count === 0) {
      console.log("[card-catalog] Empty catalog — starting initial EN population in background...");
      void syncAllEnglishSets("full");
    } else {
      console.log(`[card-catalog] EN catalog ready with ${count} cards`);
    }
    // Also kick off first-run JP population if no JP cards are in DB
    const jpCounts = await getJpCardCountsFromDB();
    const jpTotal = Array.from(jpCounts.values()).reduce((a, b) => a + b, 0);
    if (jpTotal === 0) {
      console.log("[jp-catalog] No JP cards in DB — starting initial JP population in background...");
      void syncAllJapaneseSets("full");
    } else {
      console.log(`[jp-catalog] JP catalog ready: ${jpCounts.size} sets, ${jpTotal} cards`);
    }

    // Re-sync sets known to have been truncated at 250 cards (pagination bug now fixed).
    // ME price fill runs AFTER so it can price any newly added cards in one pass.
    void (async () => {
      // me2pt5 included: orderBy=number caused alphabetical sorting which produced duplicate
      // page-2 results — fixed by removing orderBy. Now fetches all 295 unique cards correctly.
      const truncatedSets = ["swshp", "sm11", "sv1", "sv2", "sv4", "sv8", "swsh8", "me2pt5"];
      for (const sid of truncatedSets) {
        try {
          const { rows } = await db.query(
            `SELECT COUNT(*)::int AS n FROM card_catalog WHERE set_id = $1 AND COALESCE(lang,'en') = 'en'`,
            [sid]
          );
          const dbCount: number = (rows[0] as any)?.n ?? 0;
          // Fetch the set metadata to compare against API total
          const apiResp = await fetch(`https://api.pokemontcg.io/v2/sets/${sid}`, { signal: AbortSignal.timeout(8000) });
          if (!apiResp.ok) continue;
          const apiSet = (await apiResp.json() as any)?.data;
          const apiTotal: number = apiSet?.total ?? 0;
          if (apiTotal > dbCount) {
            console.log(`[card-catalog] ${sid}: DB has ${dbCount} cards, API has ${apiTotal} — re-syncing missing ${apiTotal - dbCount} cards...`);
            const setName = apiSet?.name ?? sid;
            const cards = await fetchSetCardsFromApi(sid, setName);
            await upsertCardsForSet(cards);
            const hasPrices = cards.some((c: any) => c.price != null);
            upsertSetPriceStatus(sid, cards.length > 0, hasPrices);
            setCardsCache.delete(`english:${sid}`);
            console.log(`[card-catalog] ${sid}: re-sync complete (${cards.length} cards total)`);
          }
        } catch (err: any) {
          console.warn(`[card-catalog] Re-sync check failed for ${sid}:`, err.message);
        }
        await new Promise(r => setTimeout(r, 500));
      }
      // Fill any ME-series cards that still have no price — runs after re-sync so newly
      // added cards (e.g. me2pt5 SIR/MAR cards) are included in this pass.
      await fillMeSetPricesFromPokeTrace();
    })();
  })();


  app.get("/api/sets/english", async (req, res) => {
    try {
      // Load persisted statuses from DB (no-op after first call)
      await loadSetPriceStatusFromDB();
      const sets = await ensureSetsCached();
      const sorted = [...sets].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
      res.json({
        sets: sorted.map(s => {
          const status = setPriceStatusCache.get(s.id);
          return {
            id: s.id,
            name: s.name,
            series: s.series,
            cardCount: s.printedTotal || s.total,
            releaseDate: s.releaseDate,
            logo: proxifyImageUrl(req, s.logo || null),
            symbol: proxifyImageUrl(req, s.symbol || null),
            // All English sets from the Pokemon TCG API have card data
            hasCardData: (s.printedTotal || s.total) > 0,
            // null = not yet determined; true/false = checked (from DB or background task)
            hasPrices: status ? status.hasPrices : null,
          };
        })
      });
      // Kick off background price-status pre-population on first request (or if stale)
      if (!priceStatusPrePopStarted) {
        priceStatusPrePopStarted = true;
        void backgroundPrePopulatePriceStatus(sets);
      }
    } catch (err: any) {
      console.error("[sets/english] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Top Grading Picks (all English sets) ──────────────────────────────────
  app.get("/api/cards/top-grading-picks", async (req, res) => {
    try {
      if (topGradingPicksCache && Date.now() - topGradingPicksLastFetch < TOP_PICKS_TTL) {
        return res.json({ cards: topGradingPicksCache });
      }

      // Fetch pools covering all 8 "Under £X" tiers.
      // GBP/USD ≈ 0.79, so: £5=$6.3, £10=$12.7, £20=$25.3, £50=$63, £100=$127, £200=$253, £500=$633, £1000=$1266
      const opts = { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) };
      const base = "https://api.pokemontcg.io/v2/cards?select=id,name,set,number,images,tcgplayer&pageSize=25";
      const [r1k, r500, r200, r100, r50, r20, r10, r5, rNorm20, rNorm10, rNorm5] = await Promise.all([
        // High-value holofoil pools
        fetch(`${base}&q=tcgplayer.prices.holofoil.market:[280 TO *]&orderBy=-tcgplayer.prices.holofoil.market`, opts),
        fetch(`${base}&q=tcgplayer.prices.holofoil.market:[140 TO 290]&orderBy=-tcgplayer.prices.holofoil.market`, opts),
        fetch(`${base}&q=tcgplayer.prices.holofoil.market:[59 TO 148]&orderBy=-tcgplayer.prices.holofoil.market`, opts),
        fetch(`${base}&q=tcgplayer.prices.holofoil.market:[30 TO 63]&orderBy=-tcgplayer.prices.holofoil.market`, opts),
        fetch(`${base}&q=tcgplayer.prices.holofoil.market:[17 TO 35]&orderBy=-tcgplayer.prices.holofoil.market`, opts),
        // Lower-value holofoil pools (Under £20, £10, £5)
        fetch(`${base}&q=tcgplayer.prices.holofoil.market:[10 TO 20]&orderBy=-tcgplayer.prices.holofoil.market`, opts),
        fetch(`${base}&q=tcgplayer.prices.holofoil.market:[5 TO 13]&orderBy=-tcgplayer.prices.holofoil.market`, opts),
        fetch(`${base}&q=tcgplayer.prices.holofoil.market:[1 TO 7]&orderBy=-tcgplayer.prices.holofoil.market`, opts),
        // Normal price pools for lower tiers (many cheap cards are non-holo)
        fetch(`${base}&q=tcgplayer.prices.normal.market:[10 TO 26]&orderBy=-tcgplayer.prices.normal.market`, opts),
        fetch(`${base}&q=tcgplayer.prices.normal.market:[5 TO 13]&orderBy=-tcgplayer.prices.normal.market`, opts),
        fetch(`${base}&q=tcgplayer.prices.normal.market:[1 TO 7]&orderBy=-tcgplayer.prices.normal.market`, opts),
      ]);

      const poolData = await Promise.all([r1k, r500, r200, r100, r50, r20, r10, r5, rNorm20, rNorm10, rNorm5].map(r => r.ok ? r.json() : { data: [] }));
      const allCards: any[] = poolData.flatMap((d: any) => d.data || []);

      // Dedupe by id and extract best market price
      const seen = new Set<string>();
      const unique = allCards
        .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
        .map(c => {
          const prices = c.tcgplayer?.prices || {};
          let bestPriceUSD = 0;
          for (const pt of Object.values(prices) as any[]) {
            const m = pt?.market || 0;
            if (m > bestPriceUSD) bestPriceUSD = m;
          }
          return { ...c, bestPriceUSD };
        })
        .filter(c => c.bestPriceUSD > 0)
        .sort((a, b) => b.bestPriceUSD - a.bestPriceUSD)
        .slice(0, 250); // return a large pool so frontend can filter by all 8 price tiers

      const mapped = unique.map(c => ({
        id: c.id,
        name: c.name,
        setName: c.set?.name || "",
        setId: c.set?.id || "",
        number: c.number || "",
        imageUrl: c.images?.large || c.images?.small || null,
        rawPriceUSD: Math.round(c.bestPriceUSD * 100) / 100,
      }));

      topGradingPicksCache = mapped;
      topGradingPicksLastFetch = Date.now();

      console.log(`[top-grading-picks] Cached ${mapped.length} picks`);
      res.json({ cards: mapped });
    } catch (err: any) {
      console.error("[top-grading-picks] Error:", err.message);
      if (topGradingPicksCache) return res.json({ cards: topGradingPicksCache });
      res.status(500).json({ error: err.message });
    }
  });

  // ── Top Picks Precomputed — reads from server-side daily job results ────────
  // Returns pre-computed grading picks for the requested price tier, including
  // all eBay grade prices so the frontend can compute profit per company.
  // is_stale=true means prices are from a previous day (eBay API was unavailable
  // during the last refresh) — show as-is with an "updated X ago" note.
  app.get("/api/top-picks-precomputed", async (req, res) => {
    const VALID_TIERS = [5, 10, 20, 50, 100, 200, 500, 1000];
    const tierMaxGbp = parseInt(req.query.tierMaxGbp as string);
    if (!VALID_TIERS.includes(tierMaxGbp)) {
      return res.status(400).json({ error: `tierMaxGbp must be one of: ${VALID_TIERS.join(", ")}` });
    }
    const lang = (req.query.lang as string) === "ja" ? "ja" : "en";
    // Whitelist company → DB column so we can ORDER BY safely without SQL injection
    const COMPANY_ORDER_COL: Record<string, string> = {
      PSA:     "ebay_psa10",
      Beckett: "ebay_bgs95",
      Ace:     "ebay_ace10",
      TAG:     "ebay_tag10",
      CGC:     "ebay_cgc10",
    };
    const company = (req.query.company as string) ?? "PSA";
    const orderCol = COMPANY_ORDER_COL[company] ?? "ebay_psa10";
    try {
      const { rows } = await db.query(
        `SELECT card_id, card_name, set_name, set_id, number, image_url, raw_price_usd, raw_price_eur,
                ebay_psa10, ebay_psa9, ebay_bgs95, ebay_bgs9,
                ebay_ace10, ebay_tag10, ebay_cgc10, ebay_raw,
                ebay_all_grades, ebay_fetched_at, is_stale, updated_at
           FROM top_picks_precomputed
          WHERE tier_max_gbp = $1 AND COALESCE(lang, 'en') = $2
          ORDER BY COALESCE(${orderCol}, 0) DESC
          LIMIT 20`,
        [tierMaxGbp, lang]
      );
      // For English picks, look up set totals from the English sets cache
      const allSets = lang === "en" ? await ensureSetsCached() : [];
      const setTotalMap = new Map(allSets.map(s => [s.id, s.printedTotal || s.total || 0]));

      res.json({
        picks: rows.map(r => ({
          cardId:       r.card_id,
          cardName:     r.card_name,
          setName:      r.set_name,
          setId:        r.set_id,
          number:       r.number,
          setTotal:     setTotalMap.get(r.set_id) ? String(setTotalMap.get(r.set_id)) : undefined,
          imageUrl:     r.image_url,
          rawPriceUSD:  parseFloat(r.raw_price_usd) || 0,
          rawPriceEUR:  r.raw_price_eur ? parseFloat(r.raw_price_eur) : null,
          lang,
          ebay: {
            ...(r.ebay_all_grades ?? {}),
            psa10:     parseFloat(r.ebay_psa10)  || 0,
            psa9:      parseFloat(r.ebay_psa9)   || 0,
            bgs95:     parseFloat(r.ebay_bgs95)  || 0,
            bgs9:      parseFloat(r.ebay_bgs9)   || 0,
            ace10:     parseFloat(r.ebay_ace10)  || 0,
            tag10:     parseFloat(r.ebay_tag10)  || 0,
            cgc10:     parseFloat(r.ebay_cgc10)  || 0,
            raw:       parseFloat(r.ebay_raw)    || 0,
            fetchedAt: r.ebay_fetched_at ?? null,
            isStale:   r.is_stale ?? false,
          },
        })),
        lastJobRun: lang === "en" ? (topPicksLastRun?.toISOString() ?? null) : (jpTopPicksLastRun?.toISOString() ?? null),
        hasData:    rows.length > 0,
      });
    } catch (err: any) {
      console.error("[top-picks-precomputed]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Japanese raw NM price from PokeTrace EU market ────────────────────────
  app.get("/api/jp-raw-price", async (req, res) => {
    const { name, setName, number } = req.query;
    if (!name || !setName) return res.status(400).json({ error: "name and setName required" });
    try {
      const result = await fetchJpRawPrice(
        String(name), String(setName), number ? String(number) : undefined
      );
      res.json(result);
    } catch (err: any) {
      console.error("[jp-raw-price]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Japanese set top picks from PokeTrace EU ──────────────────────────────
  // Returns the top N most expensive cards in a Japanese set from Cardmarket (EU market),
  // enriched with eBay graded prices. Used for the Top Picks section inside set-cards.
  const jpSetPicksCache = new Map<string, { picks: any[]; fetchedAt: number }>();
  const JP_SET_PICKS_TTL = 6 * 60 * 60 * 1000; // 6h

  app.get("/api/jp-set-picks", async (req, res) => {
    const { setSlug, setNameEn } = req.query;
    if (!setSlug) return res.status(400).json({ error: "setSlug required" });
    const limit = Math.min(parseInt(req.query.limit as string) || 15, 20);
    const slug = String(setSlug);
    const setName = String(setNameEn || slug);

    const cacheHit = jpSetPicksCache.get(slug);
    if (cacheHit && Date.now() - cacheHit.fetchedAt < JP_SET_PICKS_TTL) {
      return res.json({ picks: cacheHit.picks.slice(0, limit) });
    }

    try {
      // Primary: use card_catalog which has ALL cards pre-populated and sorted by price.
      // This ensures SARs, full arts, and alt arts are included — not just the first
      // 20 cards PokeTrace returns in its default (non-price) ordering.
      const dbResult = await db.query(
        `SELECT card_id, name_en, name, number, image_url, price_eur
         FROM card_catalog
         WHERE lang = 'ja' AND set_name_en ILIKE $1 AND price_eur > 0
         ORDER BY price_eur DESC
         LIMIT 20`,
        [setName]
      );

      if (dbResult.rows.length >= 5) {
        const picks = dbResult.rows.map((r: any) => ({
          id:       r.card_id,
          name:     r.name_en || r.name,
          number:   r.number || "",
          imageUrl: r.image_url || null,
          nmEUR:    parseFloat(r.price_eur) || 0,
          avg7dEUR: null,
        }));
        jpSetPicksCache.set(slug, { picks, fetchedAt: Date.now() });
        return res.json({ picks: picks.slice(0, limit) });
      }

      // Fallback: paginate through all PokeTrace cards so we don't miss SARs/full arts
      // that appear later in the set (PokeTrace default order is not by price).
      // Some sets need a slug override because the frontend-derived slug doesn't match PokeTrace.
      const JP_SET_PICKS_FALLBACK_SLUGS: Record<string, string> = {
        "glory-of-team-rocket": "the-glory-of-team-rocket",
      };
      const ptSlug = JP_SET_PICKS_FALLBACK_SLUGS[slug] || slug;

      const apiKey = process.env.POKETRACE_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "API key not configured" });

      let cursor: string | null = null;
      const allCards: any[] = [];
      for (let page = 0; page < 15; page++) {
        const pageUrl = `https://api.poketrace.com/v1/cards?set=${encodeURIComponent(ptSlug)}&market=EU&limit=100`
          + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
        const resp = await fetch(pageUrl, { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(15000) });
        if (!resp.ok) break;
        const data = await resp.json() as any;
        allCards.push(...(data?.data || []));
        cursor = data?.pagination?.nextCursor ?? null;
        if (!cursor) break;
        await new Promise(r => setTimeout(r, 200));
      }

      const sorted = allCards
        .map((c: any) => ({
          id:       c.id || "",
          name:     c.name || "Unknown",
          number:   c.cardNumber || "",
          imageUrl: c.image ?? null,
          nmEUR:    c.prices?.cardmarket_unsold?.NEAR_MINT?.avg ?? 0,
          avg7dEUR: c.prices?.cardmarket?.AGGREGATED?.avg7d ?? null,
        }))
        .filter(c => c.nmEUR > 0)
        .sort((a, b) => b.nmEUR - a.nmEUR)
        .slice(0, 20);

      jpSetPicksCache.set(slug, { picks: sorted, fetchedAt: Date.now() });
      res.json({ picks: sorted.slice(0, limit) });
    } catch (err: any) {
      console.error("[jp-set-picks]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: manually trigger picks job ─────────────────────────────────────
  app.post("/api/admin/trigger-picks", async (req, res) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    if (secret !== "@dm!nM@rceus2026") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const lang = (req.query.lang as string) === "ja" ? "ja" : "en";
    if (lang === "ja") {
      if (jpTopPicksJobRunning) return res.json({ status: "already_running" });
      jpTopPicksLastRun = null;
      runJapaneseTopPicksJob()
        .then(() => console.log("[jp-top-picks] Manual trigger complete"))
        .catch(e => console.error("[jp-top-picks] Manual trigger error:", e.message));
      return res.json({ status: "started", lang: "ja" });
    }
    if (topPicksJobRunning) {
      return res.json({ status: "already_running" });
    }
    topPicksLastRun = null;
    runTopPicksJob()
      .then(() => console.log("[top-picks] Manual trigger complete"))
      .catch(e => console.error("[top-picks] Manual trigger error:", e.message));
    res.json({ status: "started", lang: "en" });
  });

  // ── Admin: trigger JP catalog image refresh (re-syncs all JP sets with updated image logic) ──
  app.post("/api/admin/trigger-jp-catalog-sync", async (req, res) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    if (secret !== "@dm!nM@rceus2026") return res.status(401).json({ error: "Unauthorized" });
    if (jpCatalogSyncRunning) return res.json({ status: "already_running" });
    syncAllJapaneseSets("full")
      .then(() => console.log("[jp-catalog] Manual trigger complete"))
      .catch(e => console.error("[jp-catalog] Manual trigger error:", e.message));
    res.json({ status: "started", message: "JP catalog full sync started — this takes ~30-40 min" });
  });

  // ── eBay Graded Price Lookup (PSA 10 / PSA 9 — backward compat) ──────────
  app.get("/api/ebay-graded-price", async (req, res) => {
    const { name, setName, cardNumber } = req.query;
    if (!name || !setName) {
      return res.status(400).json({ error: "name and setName query params required" });
    }
    try {
      const r = await fetchEbayGradedPrices(String(name), String(setName), cardNumber ? String(cardNumber) : undefined);
      res.json({ psa10Last: r.psa10, psa9Last: r.psa9 });
    } catch (err: any) {
      console.error("[ebay-graded-price]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── eBay All Grades Lookup (all companies + raw) ──────────────────────────
  // Returns last eBay sold price for PSA 10/9, BGS 9.5/9, ACE 10, TAG 10, CGC 10, raw.
  app.get("/api/ebay-all-grades", async (req, res) => {
    const { name, setName, cardNumber, edition } = req.query;
    if (!name) {
      return res.status(400).json({ error: "name query param required" });
    }
    const editionVal = edition === "1st" || edition === "unlimited" ? edition : null;
    try {
      const { fetchedAt, isStale, ...grades } = await fetchEbayGradedPrices(
        String(name),
        setName ? String(setName) : "",
        cardNumber ? String(cardNumber) : undefined,
        editionVal
      );
      res.json({ ...grades, fetchedAt, isStale: isStale ?? false });
    } catch (err: any) {
      console.error("[ebay-all-grades]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Price History ────────────────────────────────────────────────────────
  // Returns time-series price snapshots for a specific card + grade.
  // ?cacheKey=Charizard+4&grade=psa10&days=90
  app.get("/api/price-history", async (req, res) => {
    const { cacheKey, grade, days } = req.query;
    if (!cacheKey || !grade) {
      return res.status(400).json({ error: "cacheKey and grade are required" });
    }
    const lookbackDays = Math.min(parseInt(String(days || "365"), 10), 365);
    try {
      const { rows } = await db.query<{ price_usd: string; recorded_at: string }>(
        `SELECT price_usd, recorded_at
           FROM price_history
          WHERE cache_key = $1
            AND grade = $2
            AND recorded_at > NOW() - ($3 || ' days')::interval
          ORDER BY recorded_at ASC`,
        [String(cacheKey), String(grade), lookbackDays]
      );
      const history = rows.map(r => ({
        price_usd: parseFloat(r.price_usd),
        recorded_at: r.recorded_at,
      }));
      res.json({ history, cacheKey, grade });
    } catch (err: any) {
      console.error("[price-history]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sets/japanese", async (req, res) => {
    try {
      await loadSetPriceStatusFromDB();
      const [sets, dbCardCounts] = await Promise.all([
        buildTcgdexSetList("ja"),
        getJpCardCountsFromDB(),
      ]);
      // Append PokeTrace-only sets that TCGdex doesn't track, then re-sort
      for (const extra of EXTRA_JP_POKETRACE_SETS) {
        if (!sets.some((s: any) => s.id.toLowerCase() === extra.id.toLowerCase())) {
          sets.push({ id: extra.id, name: extra.id, nameEn: extra.nameEn, cardCount: 0, releaseDate: extra.releaseDate, logo: null, _serieIdx: 999, _setIdx: 0 });
        }
      }
      sets.sort((a: any, b: any) => {
        const da = a.releaseDate ?? "9999-99-99"; const db = b.releaseDate ?? "9999-99-99";
        if (da !== db) return db.localeCompare(da);
        if (a._serieIdx !== b._serieIdx) return b._serieIdx - a._serieIdx;
        return b._setIdx - a._setIdx;
      });
      // Enrich each set with price/card status.
      // hasCardData: DB card count is the most reliable source (pre-populated by daily sync).
      // Falls back to status cache for sets that have been opened but not yet in DB.
      const enriched = sets.map((s: any) => {
        const status = setPriceStatusCache.get(s.id);
        const dbCount = dbCardCounts.get(s.id) ?? 0;
        return {
          ...s,
          logo: proxifyImageUrl(req, s.logo ?? null),
          cardCount: dbCount > 0 ? dbCount : s.cardCount,
          hasPrices: status ? status.hasPrices : null,
          hasCardData: dbCount > 0 ? true : (status ? status.hasCards : null),
        };
      });
      // Also pre-warm Japanese set images in background
      const jpUrls = sets.map((s: any) => s.logo).filter(Boolean) as string[];
      prewarmSetImages(jpUrls).catch(() => {});
      res.json({ sets: enriched });
    } catch (err: any) {
      console.error("[sets/japanese] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sets/korean", async (req, res) => {
    try {
      const sets = await buildTcgdexSetList("ko");
      const proxied = sets.map((s: any) => ({ ...s, logo: proxifyImageUrl(req, s.logo ?? null) }));
      const koUrls = sets.map((s: any) => s.logo).filter(Boolean) as string[];
      prewarmSetImages(koUrls).catch(() => {});
      res.json({ sets: proxied });
    } catch (err: any) {
      console.error("[sets/korean] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sets/:lang/:setId/cards", async (req, res) => {
    const { lang, setId } = req.params;
    if (!["english", "japanese", "korean"].includes(lang)) {
      return res.status(400).json({ error: "Invalid language. Use english, japanese, or korean." });
    }

    // Optional edition filter for WOTC-era sets that have both 1st Edition and Unlimited prints
    const editionParam = req.query.edition;
    const edition: "1st" | "unlimited" | null =
      editionParam === "1st" ? "1st" : editionParam === "unlimited" ? "unlimited" : null;

    // For WOTC sets with an edition param, always fetch fresh from the API (edition-aware pricing)
    const isWotcEdition = edition !== null && WOTC_1ST_EDITION_SET_IDS.has(setId);
    const cacheKey = isWotcEdition ? `${lang}:${setId}:${edition}` : `${lang}:${setId}`;

    // L1: in-memory cache (fastest path — same server process)
    const cached = setCardsCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < SET_CARDS_CACHE_TTL) {
      console.log(`[sets/cards] L1 cache hit: ${cacheKey}`);
      if (lang === "english" && !setPriceStatusCache.has(setId)) {
        upsertSetPriceStatus(setId, cached.cards.length > 0, cached.cards.some((c: any) => c.price != null));
      }
      return res.json({ cards: cached.cards });
    }

    // L2: PostgreSQL card_catalog (fast — survives restarts, pre-populated daily)
    // Skip for WOTC edition requests — catalog stores only one price per card
    if (lang === "english" && !isWotcEdition) {
      try {
        const dbCards = await getCardsFromCatalog(setId);
        if (dbCards !== null) {
          // If prices_json is missing for all cards (old cache rows before column was added),
          // fall through to L3 to get fresh variant prices and update the DB
          const missingVariantPrices = dbCards.length > 0 && dbCards.every((c: any) => c.prices == null);
          if (!missingVariantPrices) {
            console.log(`[sets/cards] L2 DB hit: ${setId} (${dbCards.length} cards)`);
            setCardsCache.set(cacheKey, { cards: dbCards, fetchedAt: Date.now() });
            upsertSetPriceStatus(setId, dbCards.length > 0, dbCards.some(c => c.price != null));
            return res.json({ cards: dbCards });
          }
          console.log(`[sets/cards] L2 DB hit but prices_json missing — refreshing from API: ${setId}`);
        }
      } catch (err: any) {
        console.warn(`[sets/cards] DB read failed for ${setId}, falling back to API:`, err.message);
      }
    }

    // L2 (JP/Korean): card_catalog with lang='ja'/'ko' — populated by daily sync
    if ((lang === "japanese" || lang === "korean") && !isWotcEdition) {
      try {
        const langCode = lang === "japanese" ? "ja" : "ko";
        const dbCards = await getJpCardsFromCatalog(setId, langCode);
        if (dbCards !== null) {
          console.log(`[sets/cards] L2 JP DB hit: ${setId} (${dbCards.length} cards)`);
          setCardsCache.set(cacheKey, { cards: dbCards, fetchedAt: Date.now() });
          upsertSetPriceStatus(setId, dbCards.length > 0, dbCards.some((c: any) => c.priceEUR != null && c.priceEUR > 0));
          return res.json({ cards: dbCards });
        }
      } catch (err: any) {
        console.warn(`[sets/cards] JP DB read failed for ${setId}, falling back to live fetch:`, err.message);
      }
    }

    // L3: External API (slow — only when DB has no data for this set, or WOTC edition request)
    try {
      let cards: any[] = [];

      if (lang === "english") {
        if (isWotcEdition) {
          console.log(`[sets/cards] L3 API fetch (edition=${edition}): ${setId}`);
          // Fetch from API with pagination (sets can exceed 250 cards)
          const wotcAll: any[] = [];
          let wotcPage = 1;
          while (true) {
            const resp = await fetch(
              `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(setId)}&pageSize=250&page=${wotcPage}&select=id,name,number,rarity,images,tcgplayer`,
              { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(15000) }
            );
            if (!resp.ok) throw new Error(`Pokemon TCG API returned ${resp.status}`);
            const data = await resp.json() as any;
            const pageData: any[] = data?.data || [];
            wotcAll.push(...pageData);
            const totalCount: number = data?.totalCount ?? pageData.length;
            if (wotcAll.length >= totalCount || pageData.length === 0) break;
            wotcPage++;
            await new Promise(r => setTimeout(r, 300));
          }
          cards = wotcAll.map((c: any) => {
            const tcgPrices = c.tcgplayer?.prices || {};
            return {
              id: c.id,
              name: c.name,
              number: c.number || "",
              rarity: c.rarity || null,
              imageUrl: c.images?.large || c.images?.small || null,
              price: pickEditionTcgPrice(c.tcgplayer, edition),
              prices: {
                holofoil: tcgPrices.holofoil?.market ?? null,
                reverseHolofoil: tcgPrices.reverseHolofoil?.market ?? null,
                normal: tcgPrices.normal?.market ?? null,
              },
              setId,
            };
          });
        } else {
          console.log(`[sets/cards] L3 API fetch: ${setId} (not yet in catalog)`);
          cards = await fetchSetCardsFromApi(setId, "");
          // Write to DB catalog immediately so future requests are fast
          void upsertCardsForSet(cards);
        }
      } else {
        // JP/Korean: use the shared fetchJpSetCards helper (TCGdex + PokeTrace)
        const langCode = lang === "japanese" ? "ja" : "ko";
        const { cards: fetchedCards, setNameEn, setName } = await fetchJpSetCards(setId, langCode);
        cards = fetchedCards;
        // Write to DB so future requests hit L2 instead of live APIs
        if (lang === "japanese" && cards.length > 0) {
          void upsertJpCardsForSet(setId, setName, setNameEn, cards, "ja");
        }
      }

      const shaped = cards.map((c: any) => ({
        id: c.id,
        name: c.name,
        nameEn: c.nameEn ?? null,
        number: c.number || "",
        imageUrl: c.imageUrl || null,
        price: c.price ?? null,
        prices: c.prices ?? null,
        priceEUR: c.priceEUR ?? null,
        setNameEn: c.setNameEn ?? null,
      }));

      console.log(`[sets/cards] Fetched ${shaped.length} cards for ${cacheKey}`);
      setCardsCache.set(cacheKey, { cards: shaped, fetchedAt: Date.now() });
      if (lang === "english") {
        upsertSetPriceStatus(setId, shaped.length > 0, shaped.some((c: any) => c.price != null));
      } else {
        // JP/Korean: hasPrices = true when any card has a EUR price from PokeTrace EU
        upsertSetPriceStatus(setId, shaped.length > 0, shaped.some((c: any) => c.priceEUR != null && c.priceEUR > 0));
      }
      res.json({ cards: shaped });
    } catch (err: any) {
      console.error(`[sets/cards] Error for ${lang}/${setId}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Image filter endpoint ──────────────────────────────────────────────────
  app.post("/api/filter-image", async (req, res) => {
    const { imageBase64, filterType } = req.body as { imageBase64?: string; filterType?: string };
    if (!imageBase64 || !filterType) {
      return res.status(400).json({ error: "Missing imageBase64 or filterType" });
    }
    try {
      const buffer = Buffer.from(imageBase64, "base64");
      let pipeline = sharp(buffer).resize(900, 900, { fit: "inside", withoutEnlargement: true });

      switch (filterType) {
        case "texture":
          // CLAHE adaptive histogram equalization — reveals card surface texture / micro-scratches
          pipeline = pipeline
            .greyscale()
            .clahe({ width: 48, height: 48, maxSlope: 6 });
          break;

        case "emboss":
          // Emboss convolution — 3-D surface relief (TAG-style defect view)
          pipeline = pipeline
            .greyscale()
            .convolve({
              width: 3,
              height: 3,
              kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
              scale: 1,
              offset: 128,
            })
            .normalise()
            .linear(1.6, -30);
          break;

        case "edge":
          // Laplacian edge detection — highlights all edges, scratches, print lines
          pipeline = pipeline
            .greyscale()
            .convolve({
              width: 3,
              height: 3,
              kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
              scale: 1,
              offset: 0,
            })
            .normalise()
            .linear(2.5, 0);
          break;

        case "sharpen_strong":
          // Unsharp mask — sharpens micro detail significantly
          pipeline = pipeline
            .sharpen({ sigma: 4, m1: 2, m2: 4 })
            .normalise();
          break;

        default:
          return res.status(400).json({ error: "Unknown filterType" });
      }

      const resultBuffer = await pipeline.jpeg({ quality: 82 }).toBuffer();
      return res.json({ resultBase64: resultBuffer.toString("base64") });
    } catch (err: any) {
      console.error("[filter-image] Error:", err?.message);
      return res.status(500).json({ error: "Filter processing failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
