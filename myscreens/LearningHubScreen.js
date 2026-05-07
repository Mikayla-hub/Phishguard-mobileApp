import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { getLearningModules, generateModule } from "../services/api";
import { useTheme } from "../contexts/ThemeContext";

// ─── config ─────────────────────────────────────────────────────────────────

const LEVELS = {
  beginner:     { label: "Beginner",     icon: "🌱", color: "#34a853", bg: "#e6f4ea" },
  intermediate: { label: "Intermediate", icon: "⚡", color: "#f57c00", bg: "#fff3e0" },
  expert:       { label: "Expert",       icon: "🔥", color: "#c62828", bg: "#fce4ec" },
};

const TOPIC_ICONS = {
  email:        "✉️",
  url:          "🔗",
  sms:          "💬",
  social:       "👥",
  password:     "🔐",
  malware:      "🦠",
  credential:   "🎭",
  financial:    "💳",
  default:      "📚",
};

function topicIcon(title = "") {
  const t = title.toLowerCase();
  if (t.includes("email"))      return TOPIC_ICONS.email;
  if (t.includes("url") || t.includes("link")) return TOPIC_ICONS.url;
  if (t.includes("sms") || t.includes("text")) return TOPIC_ICONS.sms;
  if (t.includes("social"))     return TOPIC_ICONS.social;
  if (t.includes("password"))   return TOPIC_ICONS.password;
  if (t.includes("malware"))    return TOPIC_ICONS.malware;
  if (t.includes("impersonat") || t.includes("brand")) return TOPIC_ICONS.credential;
  if (t.includes("financ") || t.includes("fraud"))     return TOPIC_ICONS.financial;
  return TOPIC_ICONS.default;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function LearningHubScreen({ navigation }) {
  const { colors, isDarkMode } = useTheme();
  const [allModules, setAllModules]   = useState([]);
  const [level, setLevel]             = useState("beginner");
  const [refreshing, setRefreshing]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [generating, setGenerating]   = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const res = await getLearningModules();
      if (res?.modules?.length > 0) {
        const valid = res.modules.filter(m => (m.totalLessons || 0) >= 1);
        setAllModules(valid.length > 0 ? valid : res.modules);
      }
    } catch {
      // silently fail — empty state shown
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // re-fetch when navigating back to this screen
  useEffect(() => {
    const unsub = navigation.addListener("focus", () => load());
    return unsub;
  }, [navigation, load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateModule({ difficulty: level });
      await load();
      Alert.alert("✅ Module Generated", `A new ${LEVELS[level].label} module is ready!`);
    } catch (e) {
      Alert.alert("Error", e?.message || "Could not generate module.");
    } finally {
      setGenerating(false);
    }
  };

  const filtered = allModules.filter(
    m => (m.difficulty || "beginner").toLowerCase() === level
  );

  const cfg = LEVELS[level];

  // ── stats ────────────────────────────────────────────────────────────────

  const totalModules   = allModules.length;
  const beginnerCount  = allModules.filter(m => (m.difficulty || "beginner").toLowerCase() === "beginner").length;
  const intermedCount  = allModules.filter(m => (m.difficulty || "").toLowerCase() === "intermediate").length;
  const expertCount    = allModules.filter(m => (m.difficulty || "").toLowerCase() === "expert").length;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1a73e8" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>🎓 Learning Hub</Text>
        <Text style={s.subtitle}>Master phishing awareness at your pace</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#1a73e8"]} />
        }
      >
        {/* Stats bar */}
        <View style={s.statsRow}>
          {[
            { label: "Total", value: totalModules, color: "#1a73e8" },
            { label: "🌱 Beginner", value: beginnerCount, color: "#34a853" },
            { label: "⚡ Inter.", value: intermedCount, color: "#f57c00" },
            { label: "🔥 Expert", value: expertCount, color: "#c62828" },
          ].map(st => (
            <View key={st.label} style={s.statCard}>
              <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Level tabs */}
        <View style={s.tabRow}>
          {Object.entries(LEVELS).map(([key, lv]) => (
            <TouchableOpacity
              key={key}
              style={[s.tab, level === key && { backgroundColor: lv.color, borderColor: lv.color }]}
              onPress={() => setLevel(key)}
            >
              <Text style={[s.tabText, level === key && { color: "#fff" }]}>
                {lv.icon} {lv.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Generate button */}
        <TouchableOpacity
          style={[s.genBtn, { backgroundColor: cfg.color }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.genBtnText}>✨ Generate New {cfg.label} Module</Text>}
        </TouchableOpacity>

        {/* Module list */}
        <Text style={[s.sectionTitle, { color: colors.text }]}>
          {cfg.icon} {cfg.label} Modules ({filtered.length})
        </Text>

        {loading ? (
          <ActivityIndicator color="#1a73e8" size="large" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={s.emptyTitle}>No {cfg.label} modules yet</Text>
            <Text style={s.emptyText}>
              Tap "Generate New Module" above to create your first {cfg.label.toLowerCase()} lesson.
            </Text>
          </View>
        ) : (
          <View style={s.moduleList}>
            {filtered.map(mod => {
              const lv  = LEVELS[(mod.difficulty || "beginner").toLowerCase()] || LEVELS.beginner;
              const icon = topicIcon(mod.title);
              return (
                <TouchableOpacity
                  key={mod.id}
                  style={s.moduleCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate("LearningModuleScreen", { moduleId: mod.id })}
                >
                  {/* Icon box */}
                  <View style={[s.iconBox, { backgroundColor: lv.bg }]}>
                    <Text style={s.iconText}>{icon}</Text>
                  </View>

                  {/* Info */}
                  <View style={s.moduleInfo}>
                    <Text style={[s.moduleTitle, { color: colors.text }]} numberOfLines={2}>
                      {mod.title}
                    </Text>
                    <View style={s.moduleMeta}>
                      <Text style={s.metaChip}>⏱ {mod.duration || "15 min"}</Text>
                      <Text style={s.metaChip}>📖 {mod.totalLessons ?? "?"} lessons</Text>
                    </View>
                    {mod.description && (
                      <Text style={s.moduleDesc} numberOfLines={2}>{mod.description}</Text>
                    )}
                  </View>

                  {/* Level badge + arrow */}
                  <View style={s.rightCol}>
                    <View style={[s.levelBadge, { backgroundColor: lv.color }]}>
                      <Text style={s.levelBadgeText}>{lv.icon}</Text>
                    </View>
                    <Text style={s.arrow}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Tips footer */}
        <View style={s.tipsCard}>
          <Text style={s.tipsTitle}>💡 Learning Tips</Text>
          {[
            "Complete modules in order for best results",
            "Quiz yourself regularly to reinforce knowledge",
            "Apply lessons immediately — spot real phishing in your inbox",
          ].map((tip, i) => (
            <View key={i} style={s.tipRow}>
              <View style={s.tipDot} />
              <Text style={s.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:  { flex: 1 },
  header: {
    backgroundColor: "#1a73e8",
    paddingTop: 52, paddingBottom: 24, paddingHorizontal: 20,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    elevation: 6, shadowColor: "#1a73e8", shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8,
  },
  back:       { marginBottom: 10 },
  backText:   { color: "#fff", fontSize: 16, fontWeight: "600" },
  title:      { color: "#fff", fontSize: 26, fontWeight: "800" },
  subtitle:   { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },

  statsRow:   { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 18, marginBottom: 12 },
  statCard:   {
    flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 10,
    alignItems: "center", marginHorizontal: 3,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 },
  },
  statValue:  { fontSize: 20, fontWeight: "800" },
  statLabel:  { fontSize: 9, color: "#888", fontWeight: "700", marginTop: 2, textAlign: "center" },

  tabRow:     { flexDirection: "row", paddingHorizontal: 16, marginBottom: 14, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: "#fff", borderWidth: 2, borderColor: "#e0e0e0",
    alignItems: "center",
    elevation: 1,
  },
  tabText:    { fontSize: 12, fontWeight: "700", color: "#666" },

  genBtn: {
    marginHorizontal: 16, paddingVertical: 14, borderRadius: 12,
    alignItems: "center", marginBottom: 20,
    elevation: 3, shadowOpacity: 0.25, shadowOffset: { width: 0, height: 3 },
  },
  genBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  sectionTitle: { fontSize: 18, fontWeight: "800", paddingHorizontal: 16, marginBottom: 12 },

  moduleList: { paddingHorizontal: 16 },
  moduleCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 },
  },
  iconBox:    { width: 52, height: 52, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 12 },
  iconText:   { fontSize: 26 },
  moduleInfo: { flex: 1 },
  moduleTitle:{ fontSize: 15, fontWeight: "700", marginBottom: 5 },
  moduleMeta: { flexDirection: "row", gap: 8 },
  metaChip:   { fontSize: 11, color: "#888", backgroundColor: "#f4f6fb", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  moduleDesc: { fontSize: 12, color: "#888", marginTop: 5, lineHeight: 17 },
  rightCol:   { alignItems: "center", marginLeft: 8 },
  levelBadge: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center", marginBottom: 4 },
  levelBadgeText: { fontSize: 14 },
  arrow:      { fontSize: 22, color: "#ccc" },

  empty:      { alignItems: "center", padding: 40 },
  emptyIcon:  { fontSize: 50, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#333", marginBottom: 6 },
  emptyText:  { fontSize: 14, color: "#888", textAlign: "center", lineHeight: 21 },

  tipsCard: {
    margin: 16, backgroundColor: "#e8f0fe", borderRadius: 14, padding: 16,
    borderLeftWidth: 4, borderLeftColor: "#1a73e8",
  },
  tipsTitle:  { fontSize: 14, fontWeight: "800", color: "#1a73e8", marginBottom: 10 },
  tipRow:     { flexDirection: "row", alignItems: "flex-start", marginBottom: 7 },
  tipDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: "#1a73e8", marginTop: 6, marginRight: 10 },
  tipText:    { fontSize: 13, color: "#1c1c1e", flex: 1, lineHeight: 19 },
});
