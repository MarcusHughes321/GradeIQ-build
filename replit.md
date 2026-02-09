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
- `POST /api/grade-card` - Accepts frontImage and backImage (base64 data URIs), returns grading results from PSA, Beckett, and Ace Grading, plus frontCardBounds and backCardBounds for centering tool line placement

## Key Features
- **AI Card Boundary Detection**: AI returns card edge positions as percentages (frontCardBounds, backCardBounds) so centering lines auto-position on actual card borders
- **Pinch-to-Zoom**: Two-finger pinch gestures zoom 1x-4x in centering tool, single-finger pan when zoomed
- **Draggable Lines**: Single-finger drag moves centering measurement lines
- **Progress UI**: 8-stage animated progress bar shows real-time analysis status during grading
- **Image Rotation**: Fine rotation control for aligning card images in centering tool

## Recent Changes
- 2026-02-09: Initial build with AI-powered Pokemon card grading
- App renamed to Grade.IQ with #FF3C31/black/white color scheme
- Custom logo provided by user, used for app icon and splash screen
- Added AI card boundary detection for precise centering line placement
- Implemented pinch-to-zoom with pan gestures in CenteringTool
- Added 8-stage progress UI with animated progress bar during analysis
