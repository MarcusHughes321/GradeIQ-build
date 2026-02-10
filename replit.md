# Grade.IQ - Pokemon Card Grading App

## Overview
Grade.IQ is a mobile app that uses AI vision to estimate Pokemon card grades based on the grading standards of PSA, Beckett (BGS), and Ace Grading. Users take photos of the front and back of their card, and the AI analyzes centering, corners, edges, and surface condition to provide estimated grades.

## Tech Stack
- **Frontend**: Expo React Native with Expo Router (file-based routing)
- **Backend**: Express.js with TypeScript
- **AI**: OpenAI GPT-5.2 vision via Replit AI Integrations
- **Storage**: AsyncStorage for local grading history
- **Font**: Inter (Google Fonts)

## Color Scheme
- Primary: #FF3C31 (red)
- Background: #000000 (black)
- Text: #FFFFFF (white)
- Surface: #111111

## App Structure
```
app/
  _layout.tsx       - Root layout with providers, fonts, stack navigation
  index.tsx         - Home screen with history list and "Grade a Card" CTA
  grade.tsx         - Photo capture screen with progress UI during analysis
  results.tsx       - Detailed grading results from PSA, Beckett, Ace

components/
  CompanyCard.tsx   - Grade display card for each grading company
  GradeCircle.tsx   - Circular grade display component
  SubGradeRow.tsx   - Sub-grade row with progress bar
  ImageCapture.tsx  - Photo capture/display component
  CenteringCard.tsx - Centering measurement display card
  CenteringTool.tsx - Interactive centering measurement tool with pinch-to-zoom

lib/
  types.ts          - TypeScript interfaces (includes CardBounds for AI boundary detection)
  storage.ts        - AsyncStorage helpers for grading history
  query-client.ts   - React Query client and API helpers

server/
  routes.ts         - /api/grade-card endpoint (GPT-5.2 vision analysis with card boundary detection)
  index.ts          - Express server setup (port 5000)
```

## API Endpoints
- `POST /api/grade-card` - Accepts frontImage and backImage (base64 data URIs), returns grading results from PSA, Beckett, and Ace Grading, plus frontCardBounds and backCardBounds for centering tool line placement. Also returns cardName, setName, setNumber.
- `POST /api/detect-bounds` - Accepts { image: base64 }, returns CardBounds for on-demand card boundary re-detection (used for old gradings missing bounds data)
- `POST /api/regrade-card` - Fast re-grade endpoint accepting { frontImage, backImage, cardName, setName, setNumber }. Skips card identification and online lookup, only re-assesses condition. Used after straightening.
- `POST /api/card-value` - Accepts { cardName, setName, setNumber, grades }, returns estimated eBay sold prices for PSA, BGS, and ACE graded cards plus raw/ungraded value AND Grade 10 prices (psa10Value, bgs10Value, ace10Value)

## Key Features
- **AI Card Boundary Detection**: Sobel edge detection with 400px sampling, multi-row voting, and sub-pixel clustering for precise card edge positions
- **Pinch-to-Zoom**: Two-finger pinch gestures zoom 1x-4x in centering tool, single-finger pan when zoomed
- **Lock/Unlock Pan**: Toggle button locks panning so lines can be dragged without interference when zoomed; floating button appears on image when zoomed
- **Draggable Lines**: Single-finger drag on handles moves centering measurement lines; when pan is locked, hit area doubles for easier line grabbing
- **Card Number Detection**: AI reads card number (e.g., 003/007) from bottom of card for accurate identification
- **Progress UI**: 8-stage animated progress bar shows real-time analysis status during grading
- **Image Rotation**: Fine rotation control for aligning card images in centering tool

## Recent Changes
- 2026-02-09: Initial build with AI-powered Pokemon card grading
- App renamed to Grade.IQ with #FF3C31/black/white color scheme
- Custom logo provided by user, used for app icon and splash screen
- Added AI card boundary detection for precise centering line placement
- Implemented pinch-to-zoom with pan gestures in CenteringTool
- Added 8-stage progress UI with animated progress bar during analysis
- Fixed line hit detection to scale with zoom (LINE_HIT_SCREEN_PX / scale) so only touching near lines moves them
- Enlarged grab handles on lines (28x48 inner, 22x38 outer) with shadow for easier targeting
- Tightened default card bounds to 4/3/96/97 for better auto-snap when AI bounds unavailable
- Fixed stale closure bug in fallback timer using refs to prevent overwriting correct positions
- Fixed expo-image onLoad spam with guard refs
- 2026-02-10: Added server-side `syncCenteringToGrades()` to recalculate PSA/BGS/Ace centering sub-grades from measured centering values
- Added PSAGrade.centeringGrade field to separate centering-specific grade from overall PSA grade
- Created /api/detect-bounds endpoint for on-demand card boundary re-detection
- Implemented auto-detection of card bounds for older graded cards that lack frontCardBounds/backCardBounds data
- Updated CompanyCard to display centering-specific grade for PSA instead of showing overall grade for all sub-categories
- Added red→yellow→green gradient color system for all grade displays (GradeCircle, SubGradeRow, CompanyCard)
- Added cardName, setName, setNumber fields to GradingResult type and AI prompt
- Created /api/card-value endpoint for estimated eBay sold prices via OpenAI
- Added eBay values card to results page showing PSA/BGS/ACE/raw card values
- Implemented Ace special grading: 3 sub-grades at 10 + one at 9 = overall 10 (centering must be 10)
- Updated results page with prominent card name, set name, set number display and condition summary
- Updated home screen to display setName and setNumber in history list
- Upgraded card boundary detection: Sobel operator, 400px sampling (was 200px), sub-pixel precision, multi-row voting with MIN_VOTE_RATIO
- Added lock/unlock pan button in centering tool controls and as floating overlay when zoomed
- When pan locked, dragging is always prioritized over panning; hit area doubles for easier line grabbing
- Fixed line hit detection to ONLY detect handle areas (not along the line), preventing wrong line from moving
- Offset inner handles higher (35%) and outer handles lower (65%) vertically to prevent overlap on parallel lines
- Strict lock/unlock: locked = ONLY move lines (no pan), unlocked = ONLY pan (no line moving)
- Always re-detect card bounds when loading a grading result, improving auto-alignment for previously analyzed cards
- Card number detection: AI prompt now emphasizes reading card number (e.g., 003/007) from bottom of card for accurate identification
- Card value endpoint uses card number prominently for more accurate eBay pricing
- 2026-02-10: Grading philosophy updated to "start at 10, deduct for visible flaws" approach
- eBay pricing prompt updated to search card name + number + set + company + grade for accurate values
- Added multi-language support: AI reads cards in any language (Japanese, Korean, etc.) and responds with English names/details
- Enhanced card number reading: AI uses multiple strategies (set symbol cross-reference, partial digit inference, artwork matching) for better accuracy with glare/camera issues
- Added SpiritLevel component (expo-sensors accelerometer) showing bubble level on grade screen to help users hold phone flat and parallel to card
- Added help overlay to centering tool (? button) with step-by-step instructions for all features
- Added auto-straighten button (magnet icon) using Sobel edge detection on bottom card edge to calculate and correct tilt angle
- Created /api/detect-angle endpoint for server-side card rotation detection via linear regression on bottom edge points
- Improved card lookup scoring: set total mismatch penalty increased to -80, exact set name match required for full bonus, threshold raised to 80
- Multi-candidate lookup: tries primary, grading-alt, and OCR-alt numbers when they disagree
- Created fast /api/regrade-card endpoint for re-analysis after straightening (skips card ID + online lookup, condition-only grading)
- Added progress stages to re-analysis overlay (Preparing → Analysing → Grading → Calculating → Done)
- Added "If Grade 10" pricing column to eBay values card showing PSA 10, BGS 10, ACE 10 estimated prices
