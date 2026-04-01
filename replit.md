# Grade.IQ - Pokemon Card Grading App

## Overview
Grade.IQ is a mobile application that uses AI vision technology to estimate Pokemon card grades, aligning with PSA, Beckett (BGS), and Ace Grading standards. It allows users to capture card images for AI analysis of centering, corners, edges, and surface, providing estimated grades and market values. The project aims to become a leading AI-powered grading assistant in the collectible card market.

## User Preferences
I want iterative development. Ask before making major changes. I prefer detailed explanations. I prefer simple language. I like functional programming.

## System Architecture

### UI/UX Decisions
The app features a dark-themed interface using red (#FF3C31), black (#000000), white (#FFFFFF), and a surface color of #111111, with the Inter font. Navigation uses a bottom tab bar ("Home," "Grade," "Settings") and Expo Router. Grade displays use a red→yellow→green gradient.

### Technical Implementations
- **Frontend**: Expo React Native with Expo Router.
- **Backend**: Express.js server in TypeScript.
- **AI Integration**: Anthropic's Claude Sonnet 4-6 via Replit AI Integrations for all AI analysis, processing images converted to a base64 format suitable for Claude.
- **Image Processing**:
    - **Auto-Crop**: Images are automatically cropped to the card with padding.
    - **AI Card Boundary Detection**: Claude Sonnet 4-6 primarily detects outer card edges and inner artwork bounds; a multi-resolution Sobel gradient is used as a fallback. For slabs, the physical card top is located using aspect ratio.
    - **Interactive Centering Tool**: Features pinch-to-zoom (1x-4x) and draggable lines with haptic feedback.
    - **Straighten & Auto-Align**: Detects and corrects card tilt; auto-aligns using AI-derived bounds.
    - **Optimization**: Server-side resizing (max 1024px) and JPEG compression, including HEIF/HEIC conversion.
- **Grading Logic**:
    - **Single AI Call**: Handles card identification and condition assessment, including set codes and card numbers.
    - **Deductive Grading**: Starts at grade 10, deducting for visible flaws, with leniency for minor back-only defects.
    - **Comprehensive Set Knowledge**: Uses `server/pokemon-sets.ts` for English, Japanese, Korean, and Chinese TCG set data, enabling accurate AI identification.
    - **Multi-language Support**: AI reads cards in various languages and provides English details.
    - **Vintage Support**: AI identifies older cards using set symbols.
- **User Features**:
    - **Grading Modes**:
        - **Quick Grade**: 2 photos (front + back).
        - **Deep Grade**: 12-16 photos (front, back, angled shots, 8 corner close-ups). Features server-side image enhancement and a modified AI prompt.
        - **Crossover Grade**: For graded slabs (photo-only for free users, cert lookup for pro subscribers with specific company integrations).
    - **Image Enhancement Pipeline**: All images are sharpened, brightness adjusted, and contrast boosted before AI analysis.
    - **Progress UI**: Animated progress bar with mode-specific stages.
    - **Background Grading**: Jobs run in the background, with status indicated on the Home tab and tab icon.
    - **Bulk Grading**: Up to 20 cards simultaneously (Quick Grade only).
    - **Subscription Model**: Tiered access to features (Free, Grade Curious, Grade Enthusiast, Grade Obsessed) managed by RevenueCat.
    - **First-use Company Selection**: Guides users to select preferred grading companies.

### Feature Specifications
- **Core Grading**: Provides estimated grades for PSA, Beckett, ACE, TAG, and CGC based on detailed condition analysis.
- **Crossover Grading**: Allows cert number lookup (for ACE, BGS, TAG) or photo upload of graded slabs.
- **Detailed Results**: Displays comprehensive grading results including sub-grades, card name, set name, and set number.
- **Market Value Estimation**:
    - **Raw/TCGPlayer prices**: From pokemontcg.io and TCGCSV API, for set browsing.
    - **eBay Graded Prices**: Real last-sold prices (PSA10/9, BGS9.5/9, ACE10, TAG10, CGC10, raw eBay) fetched on demand. Utilizes a two-tier cache (in-memory and PostgreSQL `ebay_price_cache` table).
    - **Card Catalog DB**: `card_catalog` PostgreSQL table stores English card data, updated daily.
- **Set Browser**: Displays TCGPlayer raw prices.
- **Grading History**: Stored locally via AsyncStorage.
- **Customization**: Users can toggle grading companies.
- **Share Results**: Branded shareable cards with Grade.IQ logo and grading details, supporting multiple social media formats via `react-native-view-shot` and `expo-sharing`.

## External Dependencies
- **Anthropic Claude Sonnet 4-6**: For AI-powered image analysis and grading.
- **Expo React Native**: Frontend framework.
- **Express.js**: Backend framework.
- **AsyncStorage**: Local data storage.
- **TCGCSV API**: For TCGPlayer market pricing data.
- **RevenueCat**: For in-app subscriptions and purchases.
- **Bulbapedia**: Data source for Asian card database cache.
- **sharp / heif-convert**: Server-side image processing and HEIF/HEIC conversion.
- **expo-sensors**: Used for the SpiritLevel component.