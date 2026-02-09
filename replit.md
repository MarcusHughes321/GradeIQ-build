# Grade.IQ - Pokemon Card Grading App

## Overview
Grade.IQ is a mobile app that uses AI vision to estimate Pokemon card grades based on the grading standards of PSA, Beckett (BGS), and Ace Grading. Users take photos of the front and back of their card, and the AI analyzes centering, corners, edges, and surface condition to provide estimated grades.

## Tech Stack
- **Frontend**: Expo React Native with Expo Router (file-based routing)
- **Backend**: Express.js with TypeScript
- **AI**: OpenAI GPT-4.1 vision via Replit AI Integrations (fast ~5-10s response)
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
  grade.tsx         - Photo capture screen (front/back of card)
  results.tsx       - Detailed grading results from PSA, Beckett, Ace

components/
  CompanyCard.tsx   - Grade display card for each grading company
  GradeCircle.tsx   - Circular grade display component
  SubGradeRow.tsx   - Sub-grade row with progress bar
  ImageCapture.tsx  - Photo capture/display component

lib/
  types.ts          - TypeScript interfaces for grading data
  storage.ts        - AsyncStorage helpers for grading history
  query-client.ts   - React Query client and API helpers

server/
  routes.ts         - /api/grade-card endpoint (GPT-4.1 vision analysis)
  index.ts          - Express server setup (port 5000)
```

## API Endpoints
- `POST /api/grade-card` - Accepts frontImage and backImage (base64 data URIs), returns grading results from PSA, Beckett, and Ace Grading

## Recent Changes
- 2026-02-09: Initial build with AI-powered Pokemon card grading
- App renamed to Grade.IQ with #FF3C31/black/white color scheme
- Custom logo provided by user, used for app icon and splash screen
- Switched AI model from GPT-5.2 to GPT-4.1 for 5x faster analysis (~5-10s vs ~28s)
- Added AnalysisProgress overlay with animated stages, percentage, and elapsed time
- Fixed native image conversion using expo-file-system for reliable base64 encoding
- Added 90-second client-side timeout with clear error messaging
