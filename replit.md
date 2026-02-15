# Grade.IQ - Pokemon Card Grading App

## Overview
Grade.IQ is a mobile application designed to estimate Pokemon card grades using AI vision technology, aligning with the grading standards of PSA, Beckett (BGS), and Ace Grading. Users can capture images of their cards, and the AI will analyze key attributes such as centering, corners, edges, and surface condition to provide estimated grades. The project aims to offer a comprehensive tool for collectors to assess their cards' potential grades and market values, supporting a business vision to become a leading AI-powered grading assistant in the collectible card market.

## User Preferences
I want iterative development. Ask before making major changes. I prefer detailed explanations. I prefer simple language. I like functional programming.

## System Architecture

### UI/UX Decisions
The app features a modern, dark-themed interface with a primary color of #FF3C31 (red), a black background (#000000), white text (#FFFFFF), and a surface color of #111111. The Inter font is used throughout the application. The navigation is structured around a bottom tab bar with "Home," "Grade," and "Settings" tabs, utilizing Expo Router for file-based routing. All grade displays use a red→yellow→green gradient color system to visually represent grade quality.

### Technical Implementations
- **Frontend**: Built with Expo React Native, leveraging Expo Router for navigation.
- **Backend**: An Express.js server written in TypeScript handles API requests.
- **AI Integration**: OpenAI GPT-5.2 vision is used for AI analysis, integrated via Replit AI Integrations.
- **Image Processing**:
    - **Auto-Crop to Card**: After photo capture/upload, images are automatically cropped to the card with ~12% padding. If the card fills <70% of the image, the server detects card bounds and crops; otherwise skips. Ensures centering tool works well even with screenshots or wide-angle photos. Re-detects bounds on the cropped image for accurate alignment lines.
    - **AI Card Boundary Detection (Line Profile + Rectangle Fitting)**: Multi-resolution approach (coarse 200px → fine 600px). Algorithm: (1) Build vertical/horizontal line strength profiles using directional Sobel gradients across every column/row. (2) Find peaks in profiles = all significant straight lines in the image. (3) Try all pairs of vertical peaks as L/R edges + pairs of horizontal peaks as T/B edges. (4) Score each rectangle hypothesis by aspect ratio match to 2.5:3.5 card dimensions, size, centering, and edge strength. (5) Pick best-scoring rectangle. This approach is robust against background noise (cloth, hands, sparkles, UI elements) because those don't form card-shaped rectangles.
    - **Pinch-to-Zoom & Draggable Lines**: Interactive centering tool with pinch-to-zoom (1x-4x) and intelligent gesture detection — touch near a handle and drag perpendicular to move it, parallel movement pans instead. Haptic feedback on handle grab, zoom-scaled 44x44pt hit areas.
    - **Separated Centering Controls**: Auto-align button (re-runs edge detection to reposition lines) and Straighten button (detects/corrects tilt without moving lines) are separate controls with distinct functions.
    - **Image Optimization**: Server-side image resizing (max 1024px) and JPEG compression occur before AI processing. HEIF/HEIC image format support is included, with automatic conversion to JPEG.
    - **Auto-Straighten**: Detects and corrects card tilt angle using Sobel edge detection.
- **Grading Logic**:
    - **Single AI Call Architecture**: A streamlined approach where one AI call handles both card identification and condition assessment, reporting exact set codes and card numbers.
    - **Grading Philosophy**: Follows a "start at 10, deduct for visible flaws" methodology. Back-only minor defects (whitening, faint scratches) are treated more leniently than front defects — minor back-corner whitening on 2-3 corners is grade 9 territory, matching real PSA/BGS standards.
    - **Comprehensive Set Knowledge**: `server/pokemon-sets.ts` contains full set code mappings for English (all eras from Base Set through Mega Evolution), Japanese, Korean, and Chinese TCG sets. The AI prompt includes this data so the AI can accurately identify sets from printed set codes. Server-side `resolveSetName()` also validates/corrects set names using this data.
    - **Multi-language Support**: AI can read cards in various languages (Japanese, Korean, Chinese) and provide English names/details.
    - **Card Number Detection**: AI reads card numbers from the card bottom, utilizing multiple strategies for accuracy.
    - **Vintage Card Support**: AI can identify older cards (WOTC, e-Card, EX era) by their set symbols when printed set codes are not available.
- **User Features**:
    - **Two Grading Modes**: Quick Grade (2 photos: front + back, fast) and Deep Grade (12 photos: front + back + angled front + angled back + 4 front corner close-ups + 4 back corner close-ups, plus 4 auto-crops backup = up to 16 images to AI, premium accuracy). Mode selector on Grade tab with guided step-by-step capture for Deep Grade.
    - **Deep Grade Features**: Server-side image enhancement (sharpening + contrast boost via Sharp), auto-corner cropping, modified AI prompt analyzing all 8 images for surface detail. First-use onboarding modal (AsyncStorage key: `gradeiq_deep_intro_seen`). Amber/gold (#F59E0B) color accent for Deep Grade UI.
    - **Deep Grade Corner Photos**: Users capture 8 corner close-ups (4 front + 4 back) by holding their phone close to each corner. These are the PRIMARY source for corner/edge grading. Auto-cropped corners serve as fallback when user corners aren't provided.
    - **Image Enhancement Pipeline**: All images sharpened via `sharp().sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 })`, brightness adjusted `.modulate({ brightness: 1.02 })`, and contrast boosted `.linear(1.15, -(128 * 0.15))` before AI analysis.
    - **Progress UI**: Animated progress bar with mode-specific stages (8 for Quick, 10 for Deep) providing real-time analysis status.
    - **Background Grading**: Users can navigate away from the Grade tab while analysis runs in the background. A GradingContext (`lib/grading-context.tsx`) manages the job lifecycle (processing/completed/failed). The Home tab shows a status banner and the tab icon displays a dot badge (red=processing, green=complete). A "Continue browsing" button on the analysis screen lets users return to Home mid-grading. Only one grading job runs at a time.
    - **Bulk Grading**: Allows grading of up to 20 cards simultaneously (Quick Grade only), with parallel processing and average grade summaries.
    - **Subscription Model**: Tiered subscription system controlled by `EXPO_PUBLIC_SUBSCRIPTION_GATE` environment variable. Tiers: Free (3 Quick Grades/month, 0 Deep), Grade Curious (£2.99/month, 15 Quick + 2 Deep), Grade Enthusiast (£5.99/month, 50 Quick + 7 Deep), Grade Obsessed (£9.99/month, unlimited Quick + 30 Deep). Usage tracked monthly via AsyncStorage with automatic reset. RevenueCat handles payment processing via App Store/Google Play. Admin mode bypasses all limits.
    - **First-use Company Selection**: Guides new users to select grading companies, with all companies off by default.

### Feature Specifications
- **Core Grading**: Provides estimated grades for PSA, Beckett, and Ace Grading based on detailed condition analysis (centering, corners, edges, surface).
- **Detailed Results**: Displays comprehensive grading results, including sub-grades, card name, set name, and set number.
- **Market Value Estimation**: Integrates with TCGCSV API for accurate TCGPlayer market prices (USD to GBP conversion) for graded and raw cards, including estimated Grade 10 prices.
- **Grading History**: Local storage (AsyncStorage) maintains a history of graded cards.
- **Customization**: Users can toggle grading companies in settings.
- **Share Results**: Branded shareable results card with Grade.IQ logo, card image, all company grades, and sub-grades. Uses `react-native-view-shot` to capture and `expo-sharing` for the native share sheet. Red "Share Results" button at the bottom of the results screen. Supports multiple social media formats: Instagram Post (1080x1080), Instagram/TikTok Story (1080x1920), and Twitter/Facebook (1200x630).

## External Dependencies
- **OpenAI GPT-5.2 vision**: For AI-powered image analysis and grading.
- **Expo React Native**: Frontend framework.
- **Express.js**: Backend framework.
- **AsyncStorage**: Local data storage for grading history.
- **TCGCSV API**: For retrieving TCGPlayer market pricing data.
- **RevenueCat**: For managing in-app subscriptions and purchases (iOS/Android).
- **Bulbapedia**: Used as a data source for an Asian card database cache (Japanese, Korean, Chinese) for verified card names.
- **sharp / heif-convert**: Libraries used for server-side image processing and HEIF/HEIC conversion.
- **expo-sensors**: Utilized for the SpiritLevel component to assist with phone alignment during photo capture.