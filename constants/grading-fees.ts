// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for grading-company fees on the client.
//
// Three screens read from here so their prices can never drift apart:
//   • app/grading-fees.tsx   → COMPANY_FEES   (the Settings "Grading Fees" page)
//   • app/results.tsx        → COMPANY_FEE_OPTIONS (profit calc on a grading report)
//   • app/card-profit.tsx    → COMPANY_FEE_OPTIONS (profit calc on a card report)
//
// COMPANY_FEE_OPTIONS is DERIVED from COMPANY_FEES below — edit the tiers once and
// every screen updates. The server keeps its own simplified GBP fee constants
// (server/routes.ts: GRADING_COMPANIES.submissionFeeGBP and FEES_GBP); when you
// change a fee here, keep those in sync too (see .agents/memory).
// ─────────────────────────────────────────────────────────────────────────────

export type CompanyKey = "psa" | "bgs" | "cgc" | "ace" | "tag";
export type FeeCurrency = "USD" | "GBP";

export interface FeeTier {
  name: string;
  price: string;
  turnaround: string;
  maxValue?: string;
  minCards?: number;
  note?: string;
}

export interface LabelOption {
  name: string;
  price: string;
  description: string;
}

export interface CompanyFees {
  key: CompanyKey;
  label: string;
  color: string;
  currency: string;
  lastUpdated: string;
  sourceUrl: string;
  sourceLabel: string;
  tiers: FeeTier[];
  labels?: LabelOption[];
  notes?: string;
}

export const COMPANY_FEES: CompanyFees[] = [
  {
    key: "psa",
    label: "PSA",
    color: "#1E56A0",
    currency: "USD",
    lastUpdated: "Jun 2026",
    sourceUrl: "https://www.psacard.com/services/tradingcardgrading",
    sourceLabel: "psacard.com",
    tiers: [
      {
        name: "Value Bulk",
        price: "$24.99",
        turnaround: "~95 business days",
        maxValue: "$199",
        minCards: 20,
        note: "Collectors Club membership required · paused in 2026",
      },
      {
        name: "Value",
        price: "$32.99",
        turnaround: "~75 business days",
        maxValue: "$499",
        note: "Temporarily paused in 2026",
      },
      {
        name: "Value Plus",
        price: "$49.99",
        turnaround: "~45 business days",
        maxValue: "$999",
        note: "Temporarily paused in 2026",
      },
      {
        name: "Value Max",
        price: "$59.99",
        turnaround: "~30 business days",
        maxValue: "$999",
        note: "Temporarily paused in 2026",
      },
      {
        name: "Regular",
        price: "$79.99",
        turnaround: "40–50 business days",
        maxValue: "$1,500",
      },
      {
        name: "Express",
        price: "$149.00",
        turnaround: "20–30 business days",
        maxValue: "$2,500",
      },
      {
        name: "Super Express",
        price: "$349.00",
        turnaround: "7–10 business days",
        maxValue: "$5,000",
      },
      {
        name: "Walk-Through",
        price: "$599.00",
        turnaround: "5–7 business days",
        maxValue: "$10,000",
      },
    ],
    notes: "Value services (Value Bulk → Value Max) are temporarily paused in 2026 due to demand — Regular and above are accepting submissions. Prices exclude shipping, insurance and handling; Collectors Club membership can reduce fees.",
  },
  {
    key: "bgs",
    label: "BGS",
    color: "#1A1A2E",
    currency: "USD",
    lastUpdated: "2026",
    sourceUrl: "https://www.beckett.com/grading",
    sourceLabel: "beckett.com",
    tiers: [
      {
        name: "Standard",
        price: "$25",
        turnaround: "20–30 business days",
        maxValue: "$999",
        minCards: 10,
        note: "Includes all 4 sub-grades free",
      },
      {
        name: "Express",
        price: "$50",
        turnaround: "5–10 business days",
        note: "Includes all 4 sub-grades free",
      },
      {
        name: "Premium",
        price: "$100",
        turnaround: "2–3 business days",
        note: "Includes all 4 sub-grades free",
      },
      {
        name: "Walk-Through",
        price: "$250",
        turnaround: "Same day",
        note: "Includes all 4 sub-grades free",
      },
    ],
    notes: "BGS now includes all four sub-grades (centering, corners, edges, surface) at no extra cost, with no annual membership required. Prices exclude shipping and insurance.",
  },
  {
    key: "cgc",
    label: "CGC",
    color: "#00AEEF",
    currency: "USD",
    lastUpdated: "Mar 2026",
    sourceUrl: "https://www.cgccomics.com/cards/submit/",
    sourceLabel: "cgccomics.com",
    tiers: [
      {
        name: "Bulk",
        price: "$17",
        turnaround: "~70+ business days",
        maxValue: "$500",
        note: "Slowest tier · dealer/volume submissions",
      },
      {
        name: "Economy",
        price: "$20",
        turnaround: "~65 business days",
        maxValue: "$1,000",
      },
      {
        name: "Standard",
        price: "$55",
        turnaround: "~30 business days",
        maxValue: "$3,000",
      },
      {
        name: "Express",
        price: "$100",
        turnaround: "~10 business days",
        maxValue: "$10,000",
      },
      {
        name: "Walkthrough",
        price: "$300",
        turnaround: "~2 business days",
        maxValue: "$100,000",
      },
    ],
    notes: "Reflects CGC's March 2026 Bulk/Economy price update. CGC uses a 10-point scale with half-point grades.",
  },
  {
    key: "ace",
    label: "ACE",
    color: "#C62828",
    currency: "GBP",
    lastUpdated: "Jun 2026",
    sourceUrl: "https://acegrading.com/pricing",
    sourceLabel: "acegrading.com",
    tiers: [
      {
        name: "Core",
        price: "£12",
        turnaround: "~95 business days",
        note: "Ace Select members only",
      },
      {
        name: "Value",
        price: "£15",
        turnaround: "~75 business days",
        note: "Ace Select members only",
      },
      {
        name: "Basic",
        price: "£18",
        turnaround: "~45 business days",
        note: "Everyday public submissions",
      },
      {
        name: "Standard",
        price: "£25",
        turnaround: "~30 business days",
      },
      {
        name: "Premier",
        price: "£32",
        turnaround: "~15 business days",
      },
      {
        name: "Ultra",
        price: "£60",
        turnaround: "~7 business days",
      },
      {
        name: "Luxury",
        price: "£120",
        turnaround: "~2 business days",
      },
    ],
    labels: [
      {
        name: "Standard Label",
        price: "Included",
        description: "Clean white ACE label with card details and grade. Included in all tiers.",
      },
      {
        name: "Colour Match",
        price: "+£1 per card",
        description: "Label coloured to match the card's palette. A subtle upgrade over the standard white label.",
      },
      {
        name: "Custom Ace Label",
        price: "+£3 per card",
        description: "Fully custom artwork label designed around your specific card. Applied by ACE's design team.",
      },
    ],
    notes: "Ace refreshed its entire pricing structure in 2026: member-only Core & Value levels (via Ace Select membership) plus public Basic → Luxury tiers. Luxury rose to £120 and Ultra to £60. Turnaround estimates are in business days; shipping is not included.",
  },
  {
    key: "tag",
    label: "TAG",
    color: "#FF6B00",
    currency: "USD",
    lastUpdated: "Apr 2026",
    sourceUrl: "https://taggrading.com/pages/pricing",
    sourceLabel: "taggrading.com",
    tiers: [
      {
        name: "Basic",
        price: "$22",
        turnaround: "45+ business days",
        minCards: 10,
        note: "DIG report · $300/card insurance · TAG Score optional",
      },
      {
        name: "Standard",
        price: "$39",
        turnaround: "~30 business days",
        note: "Includes TAG Score · $500/card insurance",
      },
      {
        name: "Express",
        price: "$59",
        turnaround: "~15 business days",
        note: "$1,000/card insurance",
      },
      {
        name: "Priority",
        price: "$149",
        turnaround: "~5 business days",
        note: "DIG+ & 360 slab video · $2,500/card insurance",
      },
      {
        name: "Walkthrough",
        price: "$299",
        turnaround: "2–3 business days",
        note: "DIG+ & 360 slab video · $5,000/card insurance",
      },
    ],
    notes: "All tiers include raw card images, HD slab imaging, UV protection and QR-accessible DIG reports. Regular tiers (Basic/Standard/Express) may be temporarily at capacity during high demand.",
  },
];

export const COMPANY_COLORS: Record<CompanyKey, string> = {
  psa: "#1E56A0",
  bgs: "#4A4A8A",
  cgc: "#00AEEF",
  ace: "#C62828",
  tag: "#FF6B00",
};

// ── Profit-calculator fee options (DERIVED from COMPANY_FEES) ────────────────
// The profit screens index this by their own company identifiers (PSA / Beckett /
// CGC / Ace / TAG), so we map those to the canonical CompanyKey below.
export interface FeeOption {
  label: string;
  amount: number;
  currency: FeeCurrency;
  turnaround: string;
}

export const PROFIT_COMPANY_KEY: Record<string, CompanyKey> = {
  PSA: "psa",
  Beckett: "bgs",
  CGC: "cgc",
  Ace: "ace",
  TAG: "tag",
};

function parseFeePrice(price: string): { amount: number; currency: FeeCurrency } | null {
  const currency: FeeCurrency = price.trim().startsWith("£") ? "GBP" : "USD";
  const amount = parseFloat(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? { amount, currency } : null;
}

function tierToFeeOption(tier: FeeTier): FeeOption | null {
  const parsed = parseFeePrice(tier.price);
  if (!parsed) return null;
  const note = tier.note ?? "";
  const suffix = /paused/i.test(note)
    ? " (paused)"
    : /members only/i.test(note)
      ? " (members)"
      : "";
  return {
    label: tier.name + suffix,
    amount: parsed.amount,
    currency: parsed.currency,
    turnaround: tier.turnaround.replace(/business days/gi, "days"),
  };
}

export const COMPANY_FEE_OPTIONS: Record<string, FeeOption[]> = Object.fromEntries(
  Object.entries(PROFIT_COMPANY_KEY).map(([screenKey, canonicalKey]) => {
    const company = COMPANY_FEES.find((c) => c.key === canonicalKey);
    const options = (company?.tiers ?? [])
      .map(tierToFeeOption)
      .filter((o): o is FeeOption => o !== null);
    return [screenKey, options];
  }),
);

// Submission start URLs per company (verified 2026)
export const COMPANY_SUBMIT_URL: Record<string, string> = {
  PSA: "https://www.psacard.com/submit",
  Beckett: "https://www.beckett.com/submit",
  CGC: "https://www.cgccomics.com/cards/submit/",
  Ace: "https://acegrading.com/submission-portal",
  TAG: "https://my.taggrading.com",
};

// ACE custom-label add-on cost (GBP per card) keyed by the label option id
export const ACE_LABEL_ADDON_GBP: Record<string, number> = {
  standard: 0,
  "colour-match": 1,
  custom: 3,
};
