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
        grade: "Near Mint 8",
        description: "Centering: 65/35 or better on front, 80/20 or better on back. Corners: Fuzzy corners but no dings or fraying. Edges: Moderate roughness, moderate chipping or minor notching. Surface: Noticeable print spots; minor border discoloration; relatively solid gloss, minor scratches but no scuffing.",
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
        description: "\"A card that has slight wear which is more visible than the Near Mint - Mint 8, including more noticeable damage on edges, corners or surfaces, such as whitening. This may include more perceptible printing defects. Centering must be greater than 75/25 on the front, and 80/20 on the rear.\"",
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
    gradingMethod: "TAG uses a technology-driven 1000-point precision scoring system. Each card receives a TAG Score (100-1000) which maps to an industry-standard 1-10 grade. TAG uses patented Photometric Stereoscopic Imaging for fully automated, AI-driven grading.",
    gradeScale: "Half-point increments from 1 to 10 (no 9.5 grade). Pristine 10 (990-1000) and Gem Mint 10 (950-989) are separate tiers.",
    keyGrades: [
      {
        grade: "Pristine 10 (Score 990-1000)",
        description: "The TAG Pristine exceeds the industry standard for a Gem Mint 10 and represents less than 1% of the cards graded by TAG. Reserved for cards with only Non-Human Observable Defects (NHODs).",
      },
      {
        grade: "Gem Mint 10 (Score 950-989)",
        description: "Industry-standard Gem Mint grade. Cards display very minor defects under high-resolution imaging. Four sharp corners with minor fill/fray artifacts. Very minor surface wear.",
      },
      {
        grade: "Mint 9 (Score 900-949)",
        description: "Sharp and square corners, minor edge fill/fray visible under high-resolution imaging. Very minor surface wear, small pits, light scratches. Multiple print lines and minor scuffing allowed.",
      },
      {
        grade: "NM-MT 8 (Score 800-849)",
        description: "Corners may start showing minor wear. Visible edge wear or light chipping on multiple edges. Multiple surface defects, print lines, very minor scuffing.",
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
    gradingMethod: "CGC Cards uses a highly accurate 10-point grading scale to evaluate TCGs, sports cards and non-sports cards. CGC offers optional sub-grades for Centering, Corners, Edges, and Surface. The Pristine 10 label is reserved exclusively for cards that are flawless under 10-times magnification.",
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
        grade: "Mint 9",
        description: "\"A Mint card has four sharp corners with only minor wear visible. Slight minor flaws on the edges may be visible. The surface must have all original gloss; however, a small number of specks or one minor spot or surface defect is allowed. For TCG cards, cards will have only a few minor manufacturing or handling defects.\"",
      },
      {
        grade: "NM/Mint 8",
        description: "\"A card graded 8 must have relatively smooth edges with only minor touches of wear. It must have original color borders and gloss. One of the following very minor flaws is allowed: corners are sharp to the naked eye but reveal slight imperfections under magnification; a small amount of minor print spots; subtle focus imperfections of the image.\"",
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
                    <Text style={[styles.gradeSectionTitle, { color: company.color }]}>Key Grade Definitions</Text>
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
