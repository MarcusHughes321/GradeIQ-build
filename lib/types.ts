export interface SubGrade {
  grade: number;
  notes: string;
}

export interface SavedLinePositions {
  outerLeftPct: number;
  innerLeftPct: number;
  innerRightPct: number;
  outerRightPct: number;
  outerTopPct: number;
  innerTopPct: number;
  innerBottomPct: number;
  outerBottomPct: number;
}

export interface CenteringMeasurement {
  frontLeftRight: number;
  frontTopBottom: number;
  backLeftRight: number;
  backTopBottom: number;
  frontLinePositions?: SavedLinePositions;
  backLinePositions?: SavedLinePositions;
  frontRotation?: number;
  backRotation?: number;
}

export interface CardBounds {
  leftPercent: number;
  topPercent: number;
  rightPercent: number;
  bottomPercent: number;
  innerLeftPercent?: number;
  innerTopPercent?: number;
  innerRightPercent?: number;
  innerBottomPercent?: number;
}

export interface PSAGrade {
  grade: number;
  centeringGrade?: number;
  centering: string;
  corners: string;
  edges: string;
  surface: string;
  notes: string;
}

export interface BeckettGrade {
  overallGrade: number;
  centering: SubGrade;
  corners: SubGrade;
  edges: SubGrade;
  surface: SubGrade;
  notes: string;
}

export interface AceGrade {
  overallGrade: number;
  centering: SubGrade;
  corners: SubGrade;
  edges: SubGrade;
  surface: SubGrade;
  notes: string;
}

export interface TAGGrade {
  overallGrade: number;
  centering: SubGrade;
  corners: SubGrade;
  edges: SubGrade;
  surface: SubGrade;
  notes: string;
}

export interface CGCGrade {
  grade: number;
  centering: string;
  corners: string;
  edges: string;
  surface: string;
  notes: string;
}

export interface CardValueEstimate {
  psaValue: string;
  bgsValue: string;
  aceValue: string;
  tagValue: string;
  cgcValue: string;
  rawValue: string;
  psa10Value?: string;
  bgs10Value?: string;
  ace10Value?: string;
  tag10Value?: string;
  cgc10Value?: string;
  source: string;
}

export interface DefectMarker {
  side: "front" | "back";
  x: number;
  y: number;
  type: "corner" | "edge" | "surface";
  severity: "minor" | "moderate" | "major";
  description: string;
}

export interface CurrentGrade {
  company: "PSA" | "BGS" | "CGC" | "ACE" | "TAG" | "OTHER";
  grade: string;
  certNumber?: string;
  label?: string;
}

export interface GradingResult {
  cardName: string;
  setName?: string;
  setNumber?: string;
  setInfo?: string;
  cardVariant?: "holo" | "reverseHolo" | "normal";
  overallCondition: string;
  centering: CenteringMeasurement;
  frontCardBounds?: CardBounds;
  backCardBounds?: CardBounds;
  defects?: DefectMarker[];
  psa: PSAGrade;
  beckett: BeckettGrade;
  ace: AceGrade;
  tag: TAGGrade;
  cgc: CGCGrade;
  cardValue?: CardValueEstimate;
  savedEbayPrices?: Record<string, number>;
  currentGrade?: CurrentGrade;
  isCrossover?: boolean;
}

export interface SavedGrading {
  id: string;
  frontImage: string;
  backImage: string;
  angledFrontImage?: string;
  angledBackImage?: string;
  frontCornerImages?: string[];
  backCornerImages?: string[];
  isDeepGrade?: boolean;
  isCrossover?: boolean;
  result: GradingResult;
  timestamp: number;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
}
