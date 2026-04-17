import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Linking } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import CompanyLabel from "@/components/CompanyLabel";

type CompanyKey = "psa" | "bgs" | "ace" | "tag" | "cgc";

interface CompanySection {
  key: CompanyKey;
  shortLabel: string;
  name: string;
  color: string;
  officialUrl: string;
  officialUrlLabel: string;
  philosophy: string;
  gradingMethod: string;
  gradeScale: string;
  keyGrades: { grade: string; description: string }[];
  source: string;
}

const COMPANIES: CompanySection[] = [
  {
    key: "psa",
    shortLabel: "PSA",
    name: "PSA",
    color: "#1E56A0",
    officialUrl: "https://www.psacard.com/gradingstandards",
    officialUrlLabel: "psacard.com/gradingstandards",
    philosophy: "10-Point Grading Scale",
    gradingMethod: "PSA grades cards on a 10-point scale evaluating corners, edges, surface, and centering. Half-point grades are available between PSA 2 and PSA 9 for cards that exhibit high-end qualities within a grade.",
    gradeScale: "1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10 (no 9.5)",
    keyGrades: [
      {
        grade: "Gem Mint 10",
        description: "\"A virtually perfect card. Attributes include four perfectly sharp corners, sharp focus and full original gloss. Must be free of staining of any kind, but an allowance may be made for a slight printing imperfection, if it doesn't impair the overall appeal of the card. The image must be centered on the card within a tolerance not to exceed approximately 55/45 percent on the front, and 75/25 percent on the reverse.\"",
      },
      {
        grade: "Mint 9",
        description: "\"A superb condition card that exhibits only one of the following minor flaws: a very slight wax stain on reverse, a minor printing imperfection or slightly off white borders. Centering must be approximately 60/40 or better on the front and 90/10 or better on the reverse.\"",
      },
      {
        grade: "NM-MT 8",
        description: "\"A super high-end card that appears Mint 9 at first glance, but upon closer inspection, the card can exhibit the following: a very slight wax stain on reverse, slightest fraying at one or two corners, a minor printing imperfection, and/or slightly off-white borders. Centering must be approximately 65/35 or better on the front and 90/10 or better on the reverse.\"",
      },
      {
        grade: "NM 7",
        description: "\"A card with just a slight surface wear visible upon close inspection. There may be slight fraying on some corners. Picture focus may be slightly out-of register. A minor printing blemish is acceptable. Slight wax staining is acceptable on the back of the card only. Most of the original gloss is retained. Centering must be approximately 70/30 or better on the front and 90/10 or better on the back.\"",
      },
      {
        grade: "EX-MT 6",
        description: "\"A card may have visible surface wear or a printing defect which does not detract from its overall appeal. A very light scratch may be detected only upon close inspection. Corners may have slightly graduated fraying. Picture focus may be slightly out-of-register. Card may show some loss of original gloss, may have minor wax stain on reverse, may exhibit very slight notching on edges and may also show some off-whiteness on borders. Centering must be 80/20 or better on the front and 90/10 or better on the reverse.\"",
      },
      {
        grade: "EX 5",
        description: "\"Very minor rounding of the corners is becoming evident. Surface wear or printing defects are more visible. There may be minor chipping on edges. Loss of original gloss will be more apparent. Focus of picture may be slightly out-of-register. Several light scratches may be visible upon close inspection, but do not detract from the appeal of the card. Centering must be 85/15 or better on the front and 90/10 or better on the back.\"",
      },
      {
        grade: "VG-EX 4",
        description: "\"Corners may be slightly rounded. Surface wear is noticeable but modest. The card may have light scuffing or light scratches. Some original gloss will be retained. Borders may be slightly off-white. A light crease may be visible. Centering must be 85/15 or better on the front and 90/10 or better on the back.\"",
      },
      {
        grade: "VG 3",
        description: "\"Some rounding of the corners, though not extreme. Some surface wear will be apparent, along with possible light scuffing or light scratches. Focus may be somewhat off-register and edges may exhibit noticeable wear. Much, but not all, of the card's original gloss will be lost. Borders may be somewhat yellowed and/or discolored. A crease may be visible. Centering must be 90/10 or better on the front and back.\"",
      },
      {
        grade: "Good 2",
        description: "\"Corners show accelerated rounding and surface wear is starting to become obvious. May have scratching, scuffing, light staining, or chipping of enamel on obverse. There may be several creases. Original gloss may be completely absent. Card may show considerable discoloration. Centering must be 90/10 or better on the front and back.\"",
      },
      {
        grade: "Fair 1.5",
        description: "\"Corners will show extreme wear, possibly affecting framing of the picture. The surface will show advanced stages of wear, including scuffing, scratching, pitting, chipping and staining. The picture will possibly be quite out-of-register and the borders may have become brown and dirty. The card may have one or more heavy creases. In order to achieve a Fair grade, a card must be fully intact.\"",
      },
      {
        grade: "Poor 1",
        description: "\"Will exhibit many of the same qualities of a PSA 1.5 but the defects may have advanced to such a serious stage that the eye appeal of the card has nearly vanished in its entirety. A Poor card may be missing one or two small pieces, exhibit major creasing that nearly breaks through all the layers of cardboard or it may contain extreme discoloration or dirtiness throughout.\"",
      },
    ],
    source: "PSA Grading Standards (psacard.com)",
  },
  {
    key: "bgs",
    shortLabel: "BGS",
    name: "Beckett (BGS)",
    color: "#C0C0C0",
    officialUrl: "https://www.beckett.com/grading-standards",
    officialUrlLabel: "beckett.com/grading-standards",
    philosophy: "Sub-Grade System with Four Categories",
    gradingMethod: "Beckett is the first and only grading company to offer full transparency by showcasing the four key categories that make up the total grade: centering, corners, edges and surface. Each card is thoroughly analysed and assigned an overall grade based upon the card's individual characteristics.",
    gradeScale: "Half-point increments from 1 to 10 (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10). Black Label = all four sub-grades at 10.",
    keyGrades: [
      {
        grade: "Pristine 10 (Black Label)",
        description: "A BGS Pristine 10 with all four sub-grades at 10 receives the coveted Black Label — the highest achievement in Beckett grading. Centering: 50/50 all around on front, 55/45 or better on back. Corners: Perfect to the naked eye and virtually flawless under intense scrutiny. Edges: Perfect to the naked eye and virtually flawless under intense scrutiny. Surface: No print spots, flawless colour, devoid of registration or focus imperfections, devoid of scratches and metallic print lines.",
      },
      {
        grade: "Gem Mint 9.5",
        description: "Centering: 55/45 or better on front, 60/40 or better on back. Corners: Sharp to the naked eye with minimal imperfection under intense scrutiny. Edges: Virtually smooth, virtually free of chipping. Surface: Clean surface, possibly one tiny line under bright light.",
      },
      {
        grade: "Mint 9",
        description: "Centering: 60/40 or better on front, 65/35 or better on back. Corners: Sharp to the naked eye, slight imperfections under close examination. Edges: Relatively smooth edges, specks of chipping visible. Surface: A few minor print spots; very minor colour/focus imperfections; solid gloss with very minor scratches visible on close inspection only.",
      },
      {
        grade: "Near Mint-Mint 8.5",
        description: "Centering: 65/35 or better on front, 75/25 or better on back. Corners: Slight touch of wear visible on close inspection. Edges: Slight roughness, minor chipping. Surface: Minor print spots; very minor colour imperfections; solid gloss with minor scratches visible on close inspection.",
      },
      {
        grade: "Near Mint 8",
        description: "Centering: 65/35 or better on front, 80/20 or better on back. Corners: Fuzzy corners but no dings or fraying. Edges: Moderate roughness, moderate chipping or minor notching. Surface: Noticeable print spots; minor border discoloration; relatively solid gloss, minor scratches but no scuffing.",
      },
      {
        grade: "Near Mint 7",
        description: "Centering: 70/30 or better on front, 85/15 or better on back. Corners: Slightly rounded, minor dings visible. Edges: Noticeable roughness, visible chipping and notching. Surface: Moderate print spots; some border discoloration; gloss diminishing, light scuffing may be visible.",
      },
      {
        grade: "Excellent-Mint 6",
        description: "Centering: 75/25 or better on front, 90/10 or better on back. Corners: Rounded with moderate wear. Edges: Heavy roughness, noticeable chipping. Surface: Noticeable wear; moderate border discoloration; gloss noticeably diminished, visible scuffing.",
      },
      {
        grade: "Excellent 5",
        description: "Centering: 80/20 or better. Corners: Rounding and wear clearly evident. Edges: Significant roughness and chipping. Surface: Significant wear visible; borders may be off-white; loss of original gloss; scratches and scuffing apparent.",
      },
      {
        grade: "Very Good 4-3",
        description: "Cards show obvious wear. Corners are noticeably rounded. Surface may exhibit creases, scratches, and staining. Edges show heavy wear with major chipping. Significant loss of gloss and possible discoloration throughout.",
      },
      {
        grade: "Good 2",
        description: "Heavy wear throughout. Corners heavily rounded. Surface shows significant damage including heavy creasing, staining, and scratching. Edges heavily worn. Card may show major discoloration.",
      },
      {
        grade: "Poor 1",
        description: "Extreme wear and damage throughout. Card may have catastrophic flaws such as major tears, missing pieces, or extreme damage. Card is intact but barely presentable.",
      },
    ],
    source: "Beckett Grading Standards (beckett.com)",
  },
  {
    key: "ace",
    shortLabel: "ACE",
    name: "Ace Grading",
    color: "#FFD700",
    officialUrl: "https://acegrading.com/grading-scale",
    officialUrlLabel: "acegrading.com/grading-scale",
    philosophy: "Whole Numbers Only with Free Sub-Grades",
    gradingMethod: "Ace Grading provides free sub-grades for Centering, Corners, Edges, and Surface. Cards are authenticated and checked for alteration using multiple technological methods. Centering is calculated using 1/1000th of a millimetre accuracy measurements.",
    gradeScale: "Whole numbers only: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 (no half grades).",
    keyGrades: [
      {
        grade: "Gem Mint 10",
        description: "\"A card that has four undamaged corners, sharp edges and a beautiful surface. An Ace 10 will not be marked, stained or damaged, and will have centering that is less than a 60/40 split. There may be very minor defects that do not detract from the eye appeal of the card as a whole.\"",
      },
      {
        grade: "Mint 9",
        description: "\"A card that exhibits nearly identical quality to that of a Gem Mint 10 card, however may suffer from a minor imperfection, either in the corners, the edges or the surface. The centering for a card must be greater than 65/35 for any opposite pair on the front, and 70/30 for any opposite pair on the rear of the card.\"",
      },
      {
        grade: "Near Mint-Mint 8",
        description: "\"An Ace 8 card will closely resemble the Ace 9, however may suffer from a few minor imperfections, such as whitening, either in the corners, the edges or the surface, or a combination of any of these areas. The centering for a card must be greater than 70/30 for any opposite pair on the front, and 75/25 for any opposite pair on the rear of the card.\"",
      },
      {
        grade: "Near Mint 7",
        description: "\"A card that has slight wear which is more visible than the Near Mint - Mint 8, including more noticeable damage on edges, corners or surfaces, such as whitening. This may include more perceptible printing defects, and the centering for a card must be greater than 75/25 for any opposite pair on the front, and 80/20 for any opposite pair on the rear of the card.\"",
      },
      {
        grade: "Excellent-Mint 6",
        description: "\"A card may have more noticeable damage or printing defects. There may be more than one area of whitening on the corners or edges, and these areas may not be sharp. The centering for a card must be greater than 80/20 for any opposite pair on the front, and 80/20 for any opposite pair on the rear of the card.\"",
      },
      {
        grade: "Excellent 5",
        description: "\"May show more visible printing defects and damage. Corners may be misshapen and whitening / fraying and edges may be more noticeable. Scratches may be obstructing the focal points of a card, including the artwork or text. The centering for a card must be greater than 80/20 for any opposite pair on the front, and 80/20 for any opposite pair on the rear of the card.\"",
      },
      {
        grade: "Very Good 4",
        description: "\"A card may be starting to lose integrity of the card in a single area. This card may exhibit moderate scratching throughout key focal points of the card, for example the artwork or text. Corners may be misshapen and edges may be warped, or not sharp. The centering for a card must be greater than 80/20 for any opposite pair on the front, and 80/20 for any opposite pair on the rear of the card.\"",
      },
      {
        grade: "Good 3",
        description: "\"A card may be starting to lose integrity of the card in multiple areas. This card may exhibit moderate scratching throughout key focal points of the card, for example the artwork or text. Corners may be misshapen and edges may be warped, or not sharp. There may be very obvious defects to any of the key areas of the card. The centering for a card must be greater than 85/15 for any opposite pair on the front, and 85/15 for any opposite pair on the rear of the card.\"",
      },
      {
        grade: "Fair 2",
        description: "\"A card may have lost integrity in the card in any one area. This card may exhibit heavy scratching throughout key focal points of the card, for example the artwork or text. Corners may be misshapen and edges may be warped, or not sharp. There may be very obvious defects to any of the key areas of the card. The centering for a card must be greater than 85/15 for any opposite pair on the front, and 85/15 for any opposite pair on the rear of the card.\"",
      },
      {
        grade: "Poor 1",
        description: "\"A card may have lost integrity in the card in multiple areas. This card may exhibit heavy scratching throughout key focal points of the card, for example the artwork or text. Corners may be misshapen and edges may be warped, or not sharp. There may be very obvious defects to any of the key areas of the card. The centering for a card must be greater than 85/15 for any opposite pair on the front, and 85/15 for any opposite pair on the rear of the card.\"",
      },
    ],
    source: "Ace Grading Scale (acegrading.com)",
  },
  {
    key: "tag",
    shortLabel: "TAG",
    name: "TAG Grading",
    color: "#FFFFFF",
    officialUrl: "https://taggrading.com/pages/scale",
    officialUrlLabel: "taggrading.com/pages/scale",
    philosophy: "1000-Point Precision Scoring System",
    gradingMethod: "TAG uses a technology-driven 1000-point precision scoring system. Each card receives a TAG Score (100-1000) which maps to an industry-standard 1-10 grade. TAG uses patented Photometric Stereoscopic Imaging for fully automated, AI-driven grading. TAG applies different centering tolerances for TCG cards compared to sports cards — the values shown below are TCG-specific.",
    gradeScale: "Half-point increments from 1 to 10 (no 9.5 grade). Pristine 10 (990-1000) and Gem Mint 10 (950-989) are separate tiers.",
    keyGrades: [
      {
        grade: "Pristine 10 (Score 990-1000)",
        description: "\"The TAG Pristine exceeds the industry standard for a Gem Mint 10 and represents less than 1% of the cards TAG'd.\" TCG centering: ~52/48 front, ~52/48 back. Corners and edges virtually flawless with no visible wear or fraying.",
      },
      {
        grade: "Gem Mint 10 (Score 950-989)",
        description: "Industry-standard Gem Mint grade. TCG centering: ~55/45 front, ~65/35 back. Four sharp corners with minor fill/fray artifacts visible only under high-resolution imaging. Extremely attractive surface with at most a slight print imperfection.",
      },
      {
        grade: "Mint 9 (Score 900-949)",
        description: "TCG centering: ~60/40 front, ~75/25 back. Corners still sharp and square with up to two very light corner touches on front. May have small pits, light scratches not penetrating gloss, or a light print line. Minor edge surface wear on one or two edges.",
      },
      {
        grade: "NM-MT+ 8.5 (Score 850-899)",
        description: "TCG centering: ~62.5/37.5 front, ~85/15 back. Multiple light corner touches on front where stock may be compromised. Multiple surface defects presenting — small scratch penetrating gloss, print lines, or very minor scuffing. Visible edge wear on multiple edges.",
      },
      {
        grade: "NM-MT 8 (Score 800-849)",
        description: "TCG centering: ~65/35 front. Corners may start showing minor wear. Visible edge wear or light chipping on multiple edges. Multiple surface defects, print lines, very minor scuffing.",
      },
      {
        grade: "NM+ 7.5 (Score 750-799)",
        description: "TCG centering: ~67.5/32.5. Corners may show touches or fraying on all four. Edges may start to chip and fray. Very minor dent may be visible.",
      },
      {
        grade: "NM 7 (Score 700-749)",
        description: "TCG centering: ~70/30. Corners losing sharpness with visible fraying. All four corners may have touches. Edges chipping and fraying. Surface wear more evident.",
      },
      {
        grade: "EX-MT+ 6.5 (Score 650-699)",
        description: "A card between Excellent-Mint and Near Mint, with visible but moderate wear.",
      },
      {
        grade: "EX-MT 6 (Score 600-649)",
        description: "Visible surface wear or printing defects. Corners may show graduated fraying. Some loss of original gloss.",
      },
      {
        grade: "EX+ 5.5 (Score 550-599)",
        description: "A card between Excellent and Excellent-Mint showing moderate wear across multiple areas.",
      },
      {
        grade: "EX 5 (Score 500-549)",
        description: "Minor rounding of corners evident. More visible surface wear and printing defects. Minor chipping on edges.",
      },
      {
        grade: "VG-EX+ 4.5 (Score 450-499)",
        description: "A card between Very Good-Excellent and Excellent with noticeable wear throughout.",
      },
      {
        grade: "VG-EX 4 (Score 400-449)",
        description: "Corners slightly rounded. Noticeable surface wear including light scuffing or scratches. Light creases may be visible.",
      },
      {
        grade: "VG+ 3.5 (Score 350-399)",
        description: "A card between Very Good and Very Good-Excellent with significant visible wear.",
      },
      {
        grade: "VG 3 (Score 300-349)",
        description: "Rounded corners, surface wear apparent with possible creasing and scratches. Noticeable loss of gloss.",
      },
      {
        grade: "Good+ 2.5 (Score 250-299)",
        description: "A card between Good and Very Good with heavy wear throughout.",
      },
      {
        grade: "Good 2 (Score 200-249)",
        description: "Accelerated corner rounding, obvious surface wear. May have multiple creases and significant discoloration.",
      },
      {
        grade: "Fair 1.5 (Score 150-199)",
        description: "Extreme corner wear, advanced surface damage. Heavy creases possible. Card must still be fully intact.",
      },
      {
        grade: "Poor 1 (Score 100-149)",
        description: "Severe damage throughout. Card may be missing small pieces, exhibit major creasing, or show extreme discoloration.",
      },
    ],
    source: "TAG Grading Scale (taggrading.com)",
  },
  {
    key: "cgc",
    shortLabel: "CGC",
    name: "CGC Cards",
    color: "#E63946",
    officialUrl: "https://www.cgccards.com/card-grading/grading-scale/",
    officialUrlLabel: "cgccards.com/card-grading/grading-scale",
    philosophy: "10-Point Scale with Optional Sub-Grades",
    gradingMethod: "CGC Cards uses a highly accurate 10-point grading scale. CGC offers optional sub-grades for Centering, Corners, Edges, and Surface. The Pristine 10 label is reserved exclusively for cards that are flawless under 10-times magnification. CGC applies TCG-specific criteria at certain grades — for example, TCG cards are evaluated more on manufacturing and handling defects rather than strict centering ratios used for sports cards.",
    gradeScale: "Half-point increments from 1 to 10 (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10). Pristine 10 is a special tier above Gem Mint 10.",
    keyGrades: [
      {
        grade: "Pristine 10",
        description: "\"A virtually flawless card to the naked eye. The centering is 50/50, and the card has flawless color and registration. All cards that merit a CGC Pristine 10 grade will receive a special CGC Cards Pristine 10 label.\"",
      },
      {
        grade: "Gem Mint 10",
        description: "\"A card that has received a 10 grade overall; however, one of the grading criteria does not meet the requirements of a Pristine 10. Corners will appear perfect to the naked eye and Mint+ under 10x magnification. The surface is free of print spots and should also display perfect gloss, devoid of any surface flaws. Centering is not to exceed approximately 55/45, and reverse centering is not to exceed 75/25.\"",
      },
      {
        grade: "Mint+ 9.5",
        description: "\"A card that displays premium eye appeal for a Mint card. Qualities such as exceptional centering, surface qualities/color or other key elements can elevate a card to a Mint+ grade.\"",
      },
      {
        grade: "Mint 9",
        description: "\"A Mint card has four sharp corners with only minor wear visible. Slight minor flaws on the edges may be visible. The surface must have all original gloss; however, a small number of specks or one minor spot or surface defect is allowed. For TCG cards, cards will have only a few minor manufacturing or handling defects. For sports and non-sports cards, centering must be 60/40 or better for the front of the card, and 90/10 for the back.\"",
      },
      {
        grade: "NM/Mint+ 8.5",
        description: "\"A card graded 8.5 has relatively smooth edges with only minor touches of wear. It must have original color borders and gloss. One of the following very minor flaws is allowed: corners are sharp to the naked eye but reveal slight imperfections under magnification; a small amount of minor print spots; subtle focus imperfections of the image. A very slight diamond cut is allowed. TCG cards could show small handling defects.\"",
      },
      {
        grade: "NM/Mint 8",
        description: "\"A card graded 8 must have relatively smooth edges with only minor touches of wear. It must have original color borders and gloss. One of the following very minor flaws is allowed: corners are sharp to the naked eye but reveal slight imperfections under magnification; a small amount of minor print spots; subtle focus imperfections of the image. For sports and non-sports cards, centering must be 65/35 or better.\"",
      },
      {
        grade: "Near Mint+ 7.5",
        description: "\"A card graded 7.5 may also have a touch of wear on two or three corners or slightly rough edges. The image may be slightly out of register. A slight diamond cut is allowed, and very slight wax staining is allowed on the reverse. TCG cards could have a moderate defect or a number of small handling defects.\"",
      },
      {
        grade: "Near Mint 7",
        description: "\"A card graded 7 may also have a touch of wear on three or more corners and/or slightly rough edges. The image may be slightly out of register. A slight diamond cut is allowed, and very slight wax staining is allowed on the reverse. For sports and non-sports cards, centering should be 70/30 or better.\"",
      },
      {
        grade: "Ex/NM+ 6.5",
        description: "\"For a grade of 6.5, no more than one slightly \"dinged\" corner is allowed, or no more than two of the following flaws: two or three fuzzy corners; slightly rough edges; noticeable print spots. A moderate diamond cut is allowed, and light wax staining on the front is acceptable.\"",
      },
      {
        grade: "Ex/NM 6",
        description: "\"For a grade of 6, no more than one \"dinged\" corner is allowed or no more than two of the following flaws: two or three fuzzy corners; slightly rough edges; noticeable print spots. A moderate diamond cut is allowed, and wax staining on the front is acceptable. For sports and non-sports cards, centering may be no worse than 75/25.\"",
      },
      {
        grade: "Excellent+ 5.5",
        description: "\"Corners may exhibit light \"fuzzyness\" and very minor rounding. The corners may come to a point but may have one or two \"dinged\" corners. There may also be chipping on the edges, minor border discoloration, noticeable print spots and/or color or focus imperfections on the surface.\"",
      },
      {
        grade: "Excellent 5",
        description: "\"Corners may exhibit \"fuzzyness\" and very minor rounding. The corners may come to a point but may have two to three \"dinged\" corners. There may also be chipping on the edges, minor border discoloration, noticeable print spots and/or color or focus imperfections on the surface.\"",
      },
      {
        grade: "VG/Ex+ 4.5",
        description: "\"Corners may display slight rounding. Noticeable surface flaws may include scuffing, scratches or one light crease. While some original surface gloss may be visible, the borders may be off-white, and a small amount of minor staining is allowed. For sports and non-sports cards, the centering is 85/15.\"",
      },
      {
        grade: "VG/Ex 4",
        description: "\"Corners may display slight rounding. Noticeable surface flaws may include scuffing, scratches and one or more light creases. While some original surface gloss may be visible, borders may be off-white, and some minor staining is allowed.\"",
      },
      {
        grade: "Very Good+ 3.5",
        description: "\"May have 90/10 centering and four rounded corners, but not extreme rounding. The surface may exhibit one moderate crease or more than one light crease, and may also display scuffing or scratches and loss of original gloss. The edges may have moderate wear.\"",
      },
      {
        grade: "Very Good 3",
        description: "\"Can have four rounded corners, but not extreme rounding. The surface may exhibit one moderate crease or more than one light crease, and may also display scuffing or scratches and loss of original gloss. The edges may have moderate wear, and heavier staining of the stock can be visible on both the front and back.\"",
      },
      {
        grade: "Good+ 2.5",
        description: "\"May have heavier creasing, but the creasing does not travel across the surface from edge to edge. The card may also have some surface damage such as one small writing mark on the back. An extremely heavy diamond cut resulting in a near miscut is allowed.\"",
      },
      {
        grade: "Good 2",
        description: "\"Can have heavier creasing that may travel across the surface of the card from edge to edge. The card may also have some surface damage such as a small amount of writing on the front or back.\"",
      },
      {
        grade: "Fair 1.5",
        description: "\"Can have one catastrophic flaw such as a staple hole, small area of missing surface, severe creasing and/or writing on the surface. The card may be miscut.\"",
      },
      {
        grade: "Poor 1",
        description: "\"May suffer from major surface damage such as severe creasing that breaks the surface, and/or it may be missing a small portion of the cardstock itself such as a portion of the corner that has been torn away from the card. The card will have multiple catastrophic flaws.\"",
      },
    ],
    source: "CGC Cards Grading Scale (cgccards.com)",
  },
];

export default function GradingStandardsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const [expanded, setExpanded] = useState<CompanyKey | null>(null);

  const toggleExpand = (key: CompanyKey) => {
    setExpanded(prev => prev === key ? null : key);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Grading Standards</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.disclaimerCard}>
          <View style={styles.disclaimerHeader}>
            <Ionicons name="information-circle" size={22} color={Colors.warning} />
            <Text style={styles.disclaimerTitle}>Important Notice</Text>
          </View>
          <Text style={styles.disclaimerBody}>
            Grade.IQ is not affiliated with, endorsed by, or partnered with any grading company. Our AI grading estimates are built from our own analysis of each company's publicly available grading standards and documentation.
          </Text>
          <Text style={[styles.disclaimerBody, { marginTop: 8 }]}>
            These estimates should not be treated as official grades. You should not expect the grades you receive from Grade.IQ to match what a professional grading company would give. Real-world graders use specialist equipment, controlled lighting, and years of expertise that AI cannot fully replicate.
          </Text>
          <Text style={[styles.disclaimerBody, { marginTop: 8 }]}>
            We encourage you to read each company's official standards (linked below) so you can understand what they look for and make your own informed decisions.
          </Text>
        </View>

        <View style={styles.howCard}>
          <View style={styles.howHeader}>
            <View style={styles.howIcon}>
              <Ionicons name="construct" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.howTitle}>How We Built Our Standards</Text>
          </View>
          <Text style={styles.howBody}>
            We studied each company's published grading criteria and official documentation to build our AI grading model. Our approach:
          </Text>
          <View style={styles.howList}>
            <HowItem text="Read and referenced each company's official grading scale, centering tolerances, and defect descriptions" />
            <HowItem text="Mapped each company's grading methodology and the categories they evaluate" />
            <HowItem text="Calibrated our AI to reflect each company's published criteria as closely as possible" />
            <HowItem text="Continuously refine based on user feedback and real grade comparisons shared by the community" />
          </View>
          <Text style={[styles.howBody, { marginTop: 12, fontStyle: "italic" }]}>
            Despite our best efforts, our estimates are approximations. We always recommend reading the official standards yourself and using Grade.IQ as a helpful guide alongside your own judgement.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Company Standards</Text>
        <Text style={styles.sectionSubLabel}>Tap a company to view their grading criteria</Text>

        {COMPANIES.map((company) => {
          const isExpanded = expanded === company.key;
          return (
            <View key={company.key} style={styles.companyCard}>
              <Pressable
                onPress={() => toggleExpand(company.key)}
                style={({ pressed }) => [styles.companyHeader, { opacity: pressed ? 0.85 : 1 }]}
              >
                <View style={styles.companyHeaderLeft}>
                  <View style={styles.companyLabelWrap}>
                    <CompanyLabel company={company.shortLabel} fontSize={18} />
                  </View>
                  <View style={styles.companyHeaderText}>
                    <Text style={styles.companyName}>{company.name}</Text>
                    <Text style={styles.companyPhilosophy}>{company.philosophy}</Text>
                  </View>
                </View>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={Colors.textMuted}
                />
              </Pressable>

              {isExpanded && (
                <View style={styles.companyDetails}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: company.color }]}>How They Grade</Text>
                    <Text style={styles.detailValue}>{company.gradingMethod}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: company.color }]}>Grade Scale</Text>
                    <Text style={styles.detailValue}>{company.gradeScale}</Text>
                  </View>

                  <View style={styles.gradeSection}>
                    <Text style={[styles.gradeSectionTitle, { color: company.color }]}>Grade Definitions</Text>
                    {company.keyGrades.map((g, i) => (
                      <View key={i} style={styles.gradeItem}>
                        <Text style={styles.gradeName}>{g.grade}</Text>
                        <Text style={styles.gradeDesc}>{g.description}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.sourceRow}>
                    <Text style={styles.sourceLabel}>Source: {company.source}</Text>
                    <Pressable
                      onPress={() => Linking.openURL(company.officialUrl)}
                      style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.7 : 1, borderColor: company.color + "40" }]}
                    >
                      <Ionicons name="open-outline" size={14} color={company.color} />
                      <Text style={[styles.linkText, { color: company.color }]}>View Official Standards</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.footnoteCard}>
          <Ionicons name="document-text-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.footnoteText}>
            All grade definitions quoted above are sourced from each company's official website. Where direct quotes are used, they are shown in quotation marks. We encourage you to visit each company's standards page for the full and most up-to-date information.
          </Text>
        </View>

        <Text style={styles.footer}>
          Last reviewed: February 2026
        </Text>
      </ScrollView>
    </View>
  );
}

function HowItem({ text }: { text: string }) {
  return (
    <View style={styles.howRow}>
      <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
      <Text style={styles.howItemText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  content: {
    paddingHorizontal: 20,
  },
  disclaimerCard: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  disclaimerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  disclaimerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.warning,
  },
  disclaimerBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  howCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  howHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  howIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255, 60, 49, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  howTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  howBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  howList: {
    gap: 10,
  },
  howRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  howItemText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    flex: 1,
  },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionSubLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 14,
  },
  companyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  companyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  companyHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  companyLabelWrap: {
    width: 44,
    alignItems: "center",
  },
  companyHeaderText: {
    flex: 1,
    gap: 2,
  },
  companyName: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  companyPhilosophy: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  companyDetails: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: 14,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  detailValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  gradeSection: {
    marginTop: 4,
    gap: 10,
  },
  gradeSectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    marginBottom: 2,
  },
  gradeItem: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  gradeName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  gradeDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  sourceRow: {
    marginTop: 4,
    gap: 8,
  },
  sourceLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: "italic" as const,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  linkText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  footnoteCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  footnoteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
    flex: 1,
  },
  footer: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
});
