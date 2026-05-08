import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Animated,
  RefreshControl,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { firestore } from "../firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getIncidentProcedures } from "../services/api";

// ─── helpers ────────────────────────────────────────────────────────────────

const SEVERITY_META = {
  critical: { color: "#d93025", bg: "#fce8e6", label: "CRITICAL", icon: "🚨" },
  high:     { color: "#ea4335", bg: "#fce8e6", label: "HIGH",     icon: "⚠️"  },
  medium:   { color: "#f9ab00", bg: "#fef7e0", label: "MEDIUM",   icon: "⚡"  },
  low:      { color: "#34a853", bg: "#e6f4ea", label: "LOW",      icon: "ℹ️"  },
};

const getMeta = (severity) =>
  SEVERITY_META[(severity || "").toLowerCase()] || {
    color: "#1a73e8", bg: "#e8f0fe", label: "UNKNOWN", icon: "🛡️",
  };

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

// SME / personal-use quick tips shown at the top
const SME_TIPS = [
  { icon: "🔒", text: "Change your passwords immediately on compromised accounts." },
  { icon: "📞", text: "Call your bank if financial credentials may have been exposed." },
  { icon: "📧", text: "Warn colleagues or family who may have received the same message." },
  { icon: "💾", text: "Do NOT delete the suspicious email—forward it as evidence." },
  { icon: "🛡️", text: "Enable 2-factor authentication on all critical accounts." },
];

// ─── component ──────────────────────────────────────────────────────────────

const IncidentResponseScreen = ({ navigation }) => {
  const [expandedId, setExpandedId]         = useState(null);
  const [completedSteps, setCompletedSteps] = useState({});
  const [procedures, setProcedures]         = useState([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [tipIndex, setTipIndex]             = useState(0);

  // cycle tip every 4 s
  useEffect(() => {
    const t = setInterval(() =>
      setTipIndex((i) => (i + 1) % SME_TIPS.length), 4000);
    return () => clearInterval(t);
  }, []);

  const fetchProcedures = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const data = await getIncidentProcedures();
      if (data?.procedures) {
        // Sort newest first using generatedAt
        const sorted = [...data.procedures].sort((a, b) => {
          const ta = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
          const tb = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
          return tb - ta;
        });
        setProcedures(sorted);
        // Auto-expand the most recent one
        if (sorted.length > 0 && expandedId === null) {
          setExpandedId(sorted[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch procedures:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProcedures(); }, [fetchProcedures]);

  const togglePhase = (id) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const toggleStep = (procId, stepId, procTitle, stepTitle) => {
    const key = `${procId}-${stepId}`;
    setCompletedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
    try {
      addDoc(collection(firestore, "incidentSteps"), {
        procId, stepId, procTitle, stepTitle,
        completed: !completedSteps[key],
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.warn("Firestore write failed", e);
    }
  };

  const getProgress = (procId, total) => {
    if (!total) return 0;
    const done = Array.from({ length: total }).filter(
      (_, i) => completedSteps[`${procId}-${i + 1}`]
    ).length;
    return Math.round((done / total) * 100);
  };

  const markAllDone = (proc) => {
    const updates = {};
    (proc.steps || []).forEach((s) => {
      updates[`${proc.id}-${s.step}`] = true;
    });
    setCompletedSteps((prev) => ({ ...prev, ...updates }));
  };

  const confirmMarkAll = (proc) => {
    Alert.alert(
      "Mark all steps complete?",
      `This will mark all ${proc.steps?.length || 0} steps for "${proc.title}" as done.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark All", onPress: () => markAllDone(proc) },
      ]
    );
  };

  // ─── render ───────────────────────────────────────────────────────────────

  const currentTip = SME_TIPS[tipIndex];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#d93025" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🛡️ Incident Response</Text>
        <Text style={styles.headerSub}>
          Personal &amp; SME guide — act fast, stay protected
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchProcedures(true)}
            colors={["#d93025"]}
            tintColor="#d93025"
          />
        }
      >
        {/* ── Rotating SME Tip ── */}
        <View style={styles.tipBanner}>
          <Text style={styles.tipIcon}>{currentTip.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.tipLabel}>QUICK ACTION TIP</Text>
            <Text style={styles.tipText}>{currentTip.text}</Text>
          </View>
        </View>

        {/* ── Dot indicators for tips ── */}
        <View style={styles.dotRow}>
          {SME_TIPS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === tipIndex && styles.dotActive]}
            />
          ))}
        </View>

        {/* ── Emergency Banner ── */}
        <View style={styles.emergencyBanner}>
          <Text style={styles.emergencyIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.emergencyTitle}>Suspected Phishing?</Text>
            <Text style={styles.emergencyText}>
              Don't panic. Work through the plan below{" "}
              <Text style={{ fontWeight: "800" }}>step by step</Text>. Each
              completed step is logged automatically.
            </Text>
          </View>
        </View>

        {/* ── Section header ── */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>AI Response Plans</Text>
            <Text style={styles.sectionSub}>
              Most recent plan shown first · pull to refresh
            </Text>
          </View>
          {procedures.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{procedures.length}</Text>
            </View>
          )}
        </View>

        {/* ── Procedures list ── */}
        {loading ? (
          <ActivityIndicator size="large" color="#d93025" style={{ marginTop: 30 }} />
        ) : procedures.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Response Plans Yet</Text>
            <Text style={styles.emptyText}>
              When you report a phishing incident, PhishGuard will generate a
              personalised AI response plan here — tailored for you or your
              small business.
            </Text>
          </View>
        ) : (
          procedures.map((proc, index) => {
            // severity may be missing on older cached procedures — fall back safely
            const severity  = proc.severity || proc.incidentSeverity || "medium";
            const meta      = getMeta(severity);
            const progress  = getProgress(proc.id, proc.steps?.length);
            const isOpen    = expandedId === proc.id;
            const isNewest  = index === 0;

            return (
              <View key={proc.id} style={[styles.card, isNewest && styles.cardNewest]}>

                {/* Newest badge */}
                {isNewest && (
                  <View style={styles.newestBadge}>
                    <Text style={styles.newestBadgeText}>🆕 LATEST</Text>
                  </View>
                )}

                {/* Card header */}
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() => togglePhase(proc.id)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.severityPill, { backgroundColor: meta.bg }]}>
                    <Text style={styles.severityPillIcon}>{meta.icon}</Text>
                    <Text style={[styles.severityPillText, { color: meta.color }]}>
                      {meta.label}
                    </Text>
                  </View>

                  <View style={styles.cardMeta}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {proc.title}
                    </Text>
                    {proc.generatedAt && (
                      <Text style={styles.cardDate}>
                        🕐 {formatDate(proc.generatedAt)}
                      </Text>
                    )}

                    {/* Progress bar */}
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progress}%`, backgroundColor: meta.color },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressLabel, { color: meta.color }]}>
                      {progress}% complete · {proc.steps?.length || 0} steps
                    </Text>
                  </View>

                  <Text style={styles.chevron}>{isOpen ? "▼" : "▶"}</Text>
                </TouchableOpacity>

                {/* Expanded content */}
                {isOpen && (
                  <View style={styles.cardBody}>

                    {/* Mark-all button */}
                    <TouchableOpacity
                      style={[styles.markAllBtn, { borderColor: meta.color }]}
                      onPress={() => confirmMarkAll(proc)}
                    >
                      <Text style={[styles.markAllText, { color: meta.color }]}>
                        ✅ Mark All Steps Complete
                      </Text>
                    </TouchableOpacity>

                    {/* Steps */}
                    {(proc.steps || []).map((step) => {
                      const key  = `${proc.id}-${step.step}`;
                      const done = !!completedSteps[key];
                      return (
                        <TouchableOpacity
                          key={step.step}
                          style={[styles.stepCard, done && styles.stepCardDone]}
                          onPress={() =>
                            toggleStep(proc.id, step.step, proc.title, step.action)
                          }
                          activeOpacity={0.8}
                        >
                          {/* Checkbox */}
                          <View style={[styles.checkbox, done && { backgroundColor: "#34a853", borderColor: "#34a853" }]}>
                            {done && <Text style={styles.checkmark}>✓</Text>}
                          </View>

                          <View style={{ flex: 1 }}>
                            {/* Step number + duration chip */}
                            <View style={styles.stepTopRow}>
                              <Text style={[styles.stepNum, done && styles.strikeText]}>
                                Step {step.step}
                              </Text>
                              <View style={styles.durationChip}>
                                <Text style={styles.durationText}>
                                  ⏱ {step.duration || "Immediate"}
                                </Text>
                              </View>
                            </View>

                            {/* Action — bold and large */}
                            <Text style={[styles.stepAction, done && styles.strikeText]}>
                              {step.action}
                            </Text>

                            {/* SME hint if present */}
                            {step.hint && (
                              <View style={styles.hintBox}>
                                <Text style={styles.hintText}>💡 {step.hint}</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Recovery actions */}
                    {proc.recovery?.length > 0 && (
                      <View style={styles.recoveryBox}>
                        <Text style={styles.recoveryTitle}>🔄 Recovery Actions</Text>
                        {proc.recovery.map((item, i) => (
                          <View key={i} style={styles.recoveryItem}>
                            <View style={styles.recoveryDot} />
                            <Text style={styles.recoveryText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* SME-specific footer advice */}
                    <View style={styles.smeAdvice}>
                      <Text style={styles.smeAdviceTitle}>
                        👤 For Individuals &amp; Small Businesses
                      </Text>
                      <Text style={styles.smeAdviceText}>
                        • <Text style={{ fontWeight: "700" }}>Individuals:</Text> notify
                        your email provider and check haveibeenpwned.com for data leaks.{"\n"}
                        • <Text style={{ fontWeight: "700" }}>SMEs:</Text> inform your
                        IT contact or ISP, log this incident for compliance records, and
                        brief your team within 24 hours.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

// ─── styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6fb" },

  // Header
  header: {
    backgroundColor: "#d93025",
    paddingTop: 52,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 6,
    shadowColor: "#d93025",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  backBtn:     { marginBottom: 10 },
  backBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  headerTitle: { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: 0.3 },
  headerSub:   { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },

  scroll: { flex: 1, paddingHorizontal: 18 },

  // Tip banner
  tipBanner: {
    backgroundColor: "#1a73e8",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 8,
    elevation: 3,
    shadowColor: "#1a73e8",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  tipIcon:  { fontSize: 28, marginRight: 12 },
  tipLabel: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.7)", letterSpacing: 1 },
  tipText:  { fontSize: 13, color: "#fff", fontWeight: "600", lineHeight: 19, marginTop: 2 },

  dotRow: { flexDirection: "row", justifyContent: "center", marginBottom: 16 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ccc", marginHorizontal: 3 },
  dotActive: { backgroundColor: "#1a73e8", width: 18 },

  // Emergency banner
  emergencyBanner: {
    backgroundColor: "#fef7e0",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
    borderLeftWidth: 5,
    borderLeftColor: "#f9ab00",
  },
  emergencyIcon:  { fontSize: 26, marginRight: 12 },
  emergencyTitle: { fontSize: 15, fontWeight: "800", color: "#5f4b00", marginBottom: 4 },
  emergencyText:  { fontSize: 13, color: "#5f4b00", lineHeight: 19 },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: "#1c1c1e" },
  sectionSub:   { fontSize: 12, color: "#444", marginTop: 2 },
  badge: {
    backgroundColor: "#d93025",
    width: 28, height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  // Empty state
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    elevation: 2,
  },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#333", marginBottom: 8 },
  emptyText:  { fontSize: 13, color: "#777", textAlign: "center", lineHeight: 20 },

  // Procedure card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 14,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
  },
  cardNewest: {
    borderWidth: 2,
    borderColor: "#d93025",
  },
  newestBadge: {
    backgroundColor: "#d93025",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomRightRadius: 10,
  },
  newestBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    gap: 10,
  },
  severityPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  severityPillIcon: { fontSize: 16 },
  severityPillText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },

  cardMeta:  { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#1c1c1e", lineHeight: 21 },
  cardDate:  { fontSize: 12, color: "#555", marginTop: 3 },

  progressTrack: { height: 5, backgroundColor: "#eee", borderRadius: 3, marginTop: 8 },
  progressFill:  { height: "100%", borderRadius: 3 },
  progressLabel: { fontSize: 12, fontWeight: "700", marginTop: 4 },

  chevron: { fontSize: 13, color: "#333", marginLeft: 6 },

  // Card body
  cardBody: {
    paddingHorizontal: 15,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },

  markAllBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 14,
    marginTop: 12,
  },
  markAllText: { fontWeight: "700", fontSize: 13 },

  // Steps
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  stepCardDone: {
    backgroundColor: "#e6f4ea",
    borderColor: "#34a853",
  },
  checkbox: {
    width: 26, height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    marginTop: 2,
  },
  checkmark:  { color: "#fff", fontWeight: "800", fontSize: 14 },

  stepTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  stepNum:    { fontSize: 12, fontWeight: "800", color: "#444", marginRight: 8 },
  strikeText: { textDecorationLine: "line-through", color: "#333" },

  durationChip: {
    backgroundColor: "#e8f0fe",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  durationText: { fontSize: 12, color: "#1a73e8", fontWeight: "700" },

  stepAction: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1c1c1e",
    lineHeight: 22,
  },

  hintBox: {
    backgroundColor: "#fffde7",
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#f9ab00",
  },
  hintText: { fontSize: 12, color: "#5f4b00", fontWeight: "600" },

  // Recovery
  recoveryBox: {
    backgroundColor: "#e8f0fe",
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
    marginBottom: 12,
  },
  recoveryTitle: { fontSize: 14, fontWeight: "800", color: "#1a73e8", marginBottom: 10 },
  recoveryItem:  { flexDirection: "row", alignItems: "flex-start", marginBottom: 7 },
  recoveryDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: "#1a73e8", marginTop: 6, marginRight: 10 },
  recoveryText:  { fontSize: 13, color: "#1c3a6e", flex: 1, fontWeight: "600", lineHeight: 20 },

  // SME advice
  smeAdvice: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: "#34a853",
  },
  smeAdviceTitle: { fontSize: 13, fontWeight: "800", color: "#1b5e20", marginBottom: 8 },
  smeAdviceText:  { fontSize: 13, color: "#2e7d32", lineHeight: 21 },
});

export default IncidentResponseScreen;
