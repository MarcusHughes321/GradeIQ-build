import React from "react";
import { View, Text, StyleSheet } from "react-native";

const PSA_BLUE = "#1E56A0";
const PSA_RED = "#E63946";
const ACE_GOLD = "#FFD700";
const BGS_GREY = "#C0C0C0";
const CGC_RED = "#E63946";
const TAG_BLACK = "#111111";
const TAG_OUTLINE = "#FFFFFF";

interface CompanyLabelProps {
  company: string;
  fontSize?: number;
  fontFamily?: string;
}

export default function CompanyLabel({ company, fontSize = 14, fontFamily = "Inter_700Bold" }: CompanyLabelProps) {
  const baseStyle = { fontFamily, fontSize };

  if (company === "PSA") {
    return (
      <View style={styles.row}>
        <Text style={[baseStyle, { color: PSA_BLUE }]}>P</Text>
        <Text style={[baseStyle, { color: PSA_RED }]}>S</Text>
        <Text style={[baseStyle, { color: PSA_BLUE }]}>A</Text>
      </View>
    );
  }

  if (company === "BGS" || company === "Beckett") {
    return <Text style={[baseStyle, { color: BGS_GREY }]}>{company === "Beckett" ? "BGS" : company}</Text>;
  }

  if (company === "ACE" || company === "Ace") {
    return <Text style={[baseStyle, { color: ACE_GOLD }]}>{company === "Ace" ? "ACE" : company}</Text>;
  }

  if (company === "CGC") {
    return <Text style={[baseStyle, { color: CGC_RED }]}>{company}</Text>;
  }

  if (company === "TAG") {
    return <Text style={[baseStyle, { color: TAG_OUTLINE }]}>{company}</Text>;
  }

  return <Text style={baseStyle}>{company}</Text>;
}

export function getCompanyColor(company: string): string {
  switch (company) {
    case "PSA": return PSA_BLUE;
    case "BGS":
    case "Beckett": return BGS_GREY;
    case "ACE":
    case "Ace": return ACE_GOLD;
    case "CGC": return CGC_RED;
    case "TAG": return TAG_OUTLINE;
    default: return "#FFFFFF";
  }
}

export { PSA_BLUE, PSA_RED, ACE_GOLD, BGS_GREY, CGC_RED, TAG_BLACK, TAG_OUTLINE };

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
});
