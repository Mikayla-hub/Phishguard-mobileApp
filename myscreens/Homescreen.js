import {
  ScrollView, StatusBar, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from "react-native";
import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../contexts/ThemeContext";

const Homescreen = ({ navigation }) => {
  const [username, setUsername] = useState("User");
  const { colors, isDarkMode } = useTheme();

  useEffect(() => {
    AsyncStorage.getItem("username").then(n => { if (n) setUsername(n); });
  }, []);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // ── feature cards config ────────────────────────────────────────────────

  const CARDS = [
    {
      id: "analyze",
      icon: "🔍",
      title: "AI Analyzer",
      subtitle: "Scan URLs, emails & screenshots",
      color: "#1a73e8",
      bg: "#e8f0fe",
      screen: "PhishingAnalyzerScreen",
    },
    {
      id: "report",
      icon: "🚨",
      title: "Report Phishing",
      subtitle: "Submit a threat you found",
      color: "#d93025",
      bg: "#fce8e6",
      screen: "ReportPhishingScreen",
    },
    {
      id: "incidents",
      icon: "⚠️",
      title: "Incident Response",
      subtitle: "Step-by-step recovery plans",
      color: "#f9ab00",
      bg: "#fef7e0",
      screen: "IncidentResponseScreen",
    },
    {
      id: "reports",
      icon: "📊",
      title: "Reports & PDF",
      subtitle: "View history · export & share",
      color: "#1a73e8",
      bg: "#e8f0fe",
      screen: "PhishingReportsDashboard",
    },
    {
      id: "learning",
      icon: "🎓",
      title: "Learning Hub",
      subtitle: "Interactive phishing awareness lessons",
      color: "#34a853",
      bg: "#e6f4ea",
      screen: "LearningHubScreen",
    },
    {
      id: "settings",
      icon: "⚙️",
      title: "Settings",
      subtitle: "Preferences, theme & account",
      color: "#333",
      bg: "#f5f5f5",
      screen: "SettingsScreen",
    },
  ];

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1a73e8" />

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting},</Text>
          <Text style={s.username}>{username} 👋</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate("LoginScreen")}
          style={s.logoutBtn}
        >
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status pill ── */}
        <TouchableOpacity
          style={s.statusPill}
          onPress={() => navigation.navigate("PhishingAnalyzerScreen")}
        >
          <View style={s.statusDot} />
          <Text style={s.statusText}>AI Protection Active</Text>
          <Text style={s.statusArrow}>Tap to analyze →</Text>
        </TouchableOpacity>

        {/* ── Quick action row (Analyze + Report) ── */}
        <View style={s.quickRow}>
          {CARDS.slice(0, 2).map(card => (
            <TouchableOpacity
              key={card.id}
              style={[s.quickCard, { backgroundColor: card.color }]}
              onPress={() => navigation.navigate(card.screen)}
              activeOpacity={0.85}
            >
              <Text style={s.quickIcon}>{card.icon}</Text>
              <Text style={s.quickTitle}>{card.title.toUpperCase()}</Text>
              <Text style={s.quickSub}>{card.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Feature grid ── */}
        <Text style={[s.sectionTitle, { color: colors.text }]}>Features</Text>
        <View style={s.grid}>
          {CARDS.slice(2).map(card => (
            <TouchableOpacity
              key={card.id}
              style={[s.gridCard, { backgroundColor: isDarkMode ? colors.card : "#fff" }]}
              onPress={() => navigation.navigate(card.screen)}
              activeOpacity={0.85}
            >
              <View style={[s.gridIconBox, { backgroundColor: card.bg }]}>
                <Text style={s.gridIcon}>{card.icon}</Text>
              </View>
              <Text style={[s.gridTitle, { color: colors.text }]}>{card.title}</Text>
              <Text style={s.gridSub} numberOfLines={2}>{card.subtitle}</Text>
              <View style={[s.gridAccent, { backgroundColor: card.color }]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Security tip ── */}
        <View style={s.tipCard}>
          <Text style={s.tipTitle}>🛡️ Today's Security Tip</Text>
          <Text style={s.tipBody}>
            Always hover over links before clicking. Phishing URLs often mimic
            legitimate domains with subtle misspellings like{" "}
            <Text style={{ fontWeight: "800", color: "#d93025" }}>paypa1.com</Text>{" "}
            instead of paypal.com.
          </Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
};

// ─── styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1 },

  header: {
    backgroundColor: "#1a73e8",
    paddingTop: 52, paddingBottom: 24, paddingHorizontal: 20,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    elevation: 6, shadowColor: "#1a73e8", shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 10,
  },
  greeting:    { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  username:    { color: "#fff", fontSize: 24, fontWeight: "800" },
  logoutBtn: {
    backgroundColor: "rgba(255,255,255,0.2)", paddingVertical: 7,
    paddingHorizontal: 14, borderRadius: 16,
  },
  logoutText:  { color: "#fff", fontSize: 13, fontWeight: "700" },

  scroll:      { paddingTop: 18, paddingHorizontal: 18, paddingBottom: 10 },

  statusPill: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 20, paddingVertical: 10,
    paddingHorizontal: 16, marginBottom: 18,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 },
  },
  statusDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: "#34a853", marginRight: 10 },
  statusText:  { fontSize: 14, fontWeight: "700", color: "#333", flex: 1 },
  statusArrow: { fontSize: 12, color: "#1a73e8", fontWeight: "600" },

  quickRow:    { flexDirection: "row", gap: 12, marginBottom: 24 },
  quickCard: {
    flex: 1, borderRadius: 16, padding: 18, alignItems: "center",
    elevation: 4, shadowOpacity: 0.2, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
  },
  quickIcon:   { fontSize: 32, marginBottom: 6 },
  quickTitle:  { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  quickSub:    { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 3, textAlign: "center" },

  sectionTitle:{ fontSize: 18, fontWeight: "800", marginBottom: 12 },

  grid: {
    flexDirection: "row", flexWrap: "wrap",
    gap: 12, marginBottom: 22,
  },
  gridCard: {
    width: "47%", borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 },
    overflow: "hidden",
  },
  gridIconBox: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 10 },
  gridIcon:    { fontSize: 24 },
  gridTitle:   { fontSize: 14, fontWeight: "800", marginBottom: 4 },
  gridSub:     { fontSize: 12, color: "#444", lineHeight: 16 },
  gridAccent:  { position: "absolute", bottom: 0, left: 0, right: 0, height: 3, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },

  tipCard: {
    backgroundColor: "#fff3e0", borderRadius: 16, padding: 16,
    borderLeftWidth: 4, borderLeftColor: "#f9ab00",
  },
  tipTitle:    { fontSize: 14, fontWeight: "800", color: "#e65100", marginBottom: 6 },
  tipBody:     { fontSize: 13, color: "#333", lineHeight: 20 },
});

export default Homescreen;
