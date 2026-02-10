export interface SubGrade {
  grade: number;
  notes: string;
}

export interface CenteringMeasurement {
  frontLeftRight: number;
  frontTopBottom: number;
  backLeftRight: number;
  backTopBottom: number;
}

export interface CardBounds {
  leftPercent: number;
  topPercent: number;
  rightPercent: number;
  bottomPercent: number;
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

export interface CardValueEstimate {
  psaValue: string;
  bgsValue: string;
  aceValue: string;
  rawValue: string;
  psa10Value?: string;
  bgs10Value?: string;
  ace10Value?: string;
  source: string;
}

export interface GradingResult {
  cardName: string;
  setName?: string;
  setNumber?: string;
  setInfo?: string;
  overallCondition: string;
  centering: CenteringMeasurement;
  frontCardBounds?: CardBounds;
  backCardBounds?: CardBounds;
  psa: PSAGrade;
  beckett: BeckettGrade;
  ace: AceGrade;
  cardValue?: CardValueEstimate;
}

export interface SavedGrading {
  id: string;
  frontImage: string;
  backImage: string;
  result: GradingResult;
  timestamp: number;
}
