import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Alert, RefreshControl, Modal,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { getReports, getReportStats } from "../services/api";

// ─── helpers ────────────────────────────────────────────────────────────────

// Medium type (how it was submitted)
const MEDIUM_ICON  = { email: "✉️", url: "🔗", sms: "💬", other: "❓" };
const MEDIUM_LABEL = { email: "Email", url: "URL", sms: "SMS", other: "Other" };

// Phishing category definitions (mirrors ReportPhishingScreen CATEGORY_RULES)
const CATEGORY_DEFS = {
  credential_phishing: { label: "Credential Phishing", icon: "🔐", color: "#d93025" },
  financial_fraud:     { label: "Financial Fraud",     icon: "💳", color: "#ea4335" },
  malware_delivery:    { label: "Malware Delivery",    icon: "🦠", color: "#9334ea" },
  impersonation:       { label: "Brand Impersonation", icon: "🎭", color: "#f9ab00" },
  prize_scam:          { label: "Prize / Lottery Scam",icon: "🎰", color: "#ff6d00" },
  tech_support:        { label: "Tech Support Scam",   icon: "🖥️", color: "#1a73e8" },
  romance_scam:        { label: "Social Engineering",  icon: "💔", color: "#e91e63" },
  unknown:             { label: "Suspicious Content",  icon: "❓", color: "#333"    },
};

const CATEGORY_RULES = [
  { id: "credential_phishing", patterns: [/\bpassword\b/gi, /\blogin\b/gi, /\bcredentials?\b/gi, /account.*verify/gi, /\bsign.?in\b/gi, /verify.*identity/gi] },
  { id: "financial_fraud",     patterns: [/\bbank\b/gi, /\bpayment\b/gi, /credit.?card/gi, /wire.?transfer/gi, /\bpaypal\b/gi, /\binvoice\b/gi, /\brefund\b/gi] },
  { id: "malware_delivery",    patterns: [/\bdownload\b/gi, /\battachment\b/gi, /\.exe\b/gi, /\.zip\b/gi, /\binstall\b/gi, /software.?update/gi] },
  { id: "impersonation",       patterns: [/\bamazon\b/gi, /\bgoogle\b/gi, /\bmicrosoft\b/gi, /\bapple\b/gi, /\bnetflix\b/gi, /\bfacebook\b/gi] },
  { id: "prize_scam",          patterns: [/\bwinner\b/gi, /\bwon\b/gi, /\blottery\b/gi, /\bprize\b/gi, /\bcongratulations?\b/gi, /\breward\b/gi] },
  { id: "tech_support",        patterns: [/tech.?support/gi, /virus.?detected/gi, /computer.*infected/gi, /\bhacked\b/gi, /\bmcafee\b/gi] },
  { id: "romance_scam",        patterns: [/\blove\b/gi, /\brelationship\b/gi, /\bdating\b/gi, /meet.?me/gi] },
];

/** Returns the best-matching category definition for a report */
function detectCategory(report) {
  // 1. Use stored aiCategoryId if present
  if (report.aiCategoryId && CATEGORY_DEFS[report.aiCategoryId]) {
    return CATEGORY_DEFS[report.aiCategoryId];
  }
  // 2. Infer from content
  const text = `${report.content ?? ""} ${report.url ?? ""} ${report.senderEmail ?? ""}`;
  let best = null, maxScore = 0;
  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const p of rule.patterns) {
      const m = text.match(p);
      if (m) score += m.length;
    }
    if (score > maxScore) { maxScore = score; best = rule.id; }
  }
  return CATEGORY_DEFS[best ?? "unknown"];
}

// Keep TYPE_ICON/TYPE_LABEL for backward-compat references in PDF builder
const TYPE_ICON  = MEDIUM_ICON;
const TYPE_LABEL = MEDIUM_LABEL;

// Severity colour map used in buildHtml PDF template
const SEVERITY_COLOR = {
  critical: "#d93025",
  high:     "#ea4335",
  medium:   "#f9ab00",
  low:      "#34a853",
  safe:     "#34a853",
};

const fmt = (iso) => iso ? new Date(iso).toLocaleString(undefined, {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "—";

const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown";

// ─── PDF builder ────────────────────────────────────────────────────────────

function buildHtml(reports, stats) {
  const now = fmt(new Date().toISOString());

  const statRows = `
    <tr><td>Total Reports</td><td><b>${stats.total_reports ?? 0}</b></td></tr>
    <tr><td>Confirmed Phishing</td><td style="color:#d93025"><b>${stats.confirmed_phishing ?? 0}</b></td></tr>
    <tr><td>High-Risk Reports</td><td style="color:#ea4335"><b>${stats.high_risk_reports ?? 0}</b></td></tr>
    <tr><td>Avg. Risk Score</td><td><b>${stats.average_risk_score ?? 0}/100</b></td></tr>
  `;

  const reportRows = reports.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? "#f9f9f9" : "#fff"}">
      <td>${fmt(r.createdAt)}</td>
      <td>${TYPE_ICON[r.reportType] ?? "❓"} ${capitalize(r.reportType)}</td>
      <td style="color:${SEVERITY_COLOR[r.riskLevel] ?? "#333"}"><b>${capitalize(r.riskLevel)}</b></td>
      <td>${r.riskScore ?? 0}/100</td>
      <td>${capitalize(r.status)}</td>
      <td style="max-width:200px;word-break:break-word;font-size:11px">${(r.content ?? "").substring(0, 120)}${r.content?.length > 120 ? "…" : ""}</td>
    </tr>
    ${r.aiAnalysis?.recommendations?.length ? `
    <tr><td colspan="6" style="padding:4px 8px 8px;font-size:11px;color:#555">
      <b>Recovery Actions:</b> ${r.aiAnalysis.recommendations.slice(0, 3).join(" · ")}
    </td></tr>` : ""}
  `).join("");

  return `<!DOCTYPE html><html>
  <head><meta charset="utf-8"/>
  <style>
    body{font-family:Arial,sans-serif;margin:32px;color:#1c1c1e;font-size:13px}
    h1{color:#d93025;font-size:22px;margin-bottom:4px}
    .sub{color:#666;font-size:12px;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    th{background:#d93025;color:#fff;padding:8px 10px;text-align:left;font-size:12px}
    td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}
    .stat-table td{width:50%}
    .footer{color:#aaa;font-size:10px;margin-top:32px;border-top:1px solid #eee;padding-top:12px}
  </style></head>
  <body>
    <h1>🛡️ PhishGuard — Phishing Incident Report</h1>
    <p class="sub">Generated: ${now} &nbsp;|&nbsp; Confidential — Personal &amp; SME Security Report</p>

    <h2 style="font-size:15px;margin-bottom:8px">Summary Statistics</h2>
    <table class="stat-table"><tbody>${statRows}</tbody></table>

    <h2 style="font-size:15px;margin-bottom:8px">Detected Incidents (${reports.length})</h2>
    <table>
      <thead><tr>
        <th>Timestamp</th><th>Type</th><th>Risk Level</th>
        <th>Score</th><th>Status</th><th>Content Preview</th>
      </tr></thead>
      <tbody>${reportRows || "<tr><td colspan='6' style='text-align:center;color:#888'>No reports found</td></tr>"}</tbody>
    </table>

    <div class="footer">PhishGuard · Personal &amp; SME Phishing Detection · Report auto-generated · Do not distribute</div>
  </body></html>`;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function PhishingReportsDashboard({ navigation }) {
  const [reports, setReports]       = useState([]);
  const [stats, setStats]           = useState({});
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview]       = useState(null); // { report } for modal

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const [rData, sData] = await Promise.all([getReports({ limit: 50 }), getReportStats()]);
      setReports(rData?.reports ?? []);
      setStats(sData?.stats ?? {});
    } catch (e) {
      Alert.alert("Error", "Could not load reports. Make sure you are logged in.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── PDF export + share ────────────────────────────────────────────────────

  const exportPDF = async () => {
    setGenerating(true);
    try {
      const html = buildHtml(reports, stats);
      // expo-print saves to a cache file — use that URI directly
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        // Native share sheet: includes Save to Files, Email, WhatsApp, etc.
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Save or Share PhishGuard Report",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          "PDF Generated ✅",
          `Your report is ready.\n\nFile location:\n${uri}`,
          [{ text: "OK" }]
        );
      }
    } catch (e) {
      Alert.alert("PDF Error", e.message);
    } finally {
      setGenerating(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  const byType = {};
  reports.forEach((r) => { byType[r.reportType] = (byType[r.reportType] || 0) + 1; });

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#d93025" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>📊 Phishing Reports</Text>
        <Text style={s.subtitle}>Your incident history · export as PDF</Text>
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#d93025"]} />}
      >
        {/* Stats row */}
        <View style={s.statsRow}>
          {[
            { label: "Total", value: stats.total_reports ?? 0, color: "#1a73e8" },
            { label: "Confirmed", value: stats.confirmed_phishing ?? 0, color: "#d93025" },
            { label: "High Risk", value: stats.high_risk_reports ?? 0, color: "#ea4335" },
            { label: "Avg Score", value: `${stats.average_risk_score ?? 0}`, color: "#f9ab00" },
          ].map((st) => (
            <View key={st.label} style={s.statCard}>
              <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Type breakdown */}
        {Object.keys(byType).length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>📂 By Type</Text>
            <View style={s.typeRow}>
              {Object.entries(byType).map(([type, count]) => (
                <View key={type} style={s.typeChip}>
                  <Text style={s.typeChipIcon}>{TYPE_ICON[type] ?? "❓"}</Text>
                  <Text style={s.typeChipLabel}>{TYPE_LABEL[type] ?? type}</Text>
                  <View style={s.typeChipBadge}><Text style={s.typeChipCount}>{count}</Text></View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={s.btnRow}>
          <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={exportPDF} disabled={generating}>
            {generating
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnText}>📄  Export &amp; Share PDF</Text>}
          </TouchableOpacity>
        </View>

        {/* Report list */}
        <Text style={s.sectionTitle}>Recent Incidents</Text>

        {loading ? (
          <ActivityIndicator color="#d93025" style={{ marginTop: 30 }} size="large" />
        ) : reports.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyText}>No reports yet. Submit a phishing report to see it here.</Text>
          </View>
        ) : (
          reports.map((r) => {
            const SEV = { critical: "#d93025", high: "#ea4335", medium: "#f9ab00", low: "#34a853", safe: "#34a853" };
            const sevColor = SEV[r.riskLevel] ?? "#666";
            const medium   = r.reportType ?? "other";
            const cat      = detectCategory(r);
            const recs     = r.aiAnalysis?.recommendations ?? [];
            return (
              <TouchableOpacity key={r.id} style={s.reportCard} activeOpacity={0.85}
                onPress={() => setPreview(r)}>
                {/* Top row: medium pill + category pill + severity badge */}
                <View style={s.reportTop}>
                  <View style={s.pillRow}>
                    {/* Medium: Email / URL / SMS */}
                    <View style={[s.mediumPill]}>
                      <Text style={s.mediumPillText}>
                        {MEDIUM_ICON[medium] ?? "❓"} {MEDIUM_LABEL[medium] ?? capitalize(medium)}
                      </Text>
                    </View>
                    {/* Phishing category */}
                    <View style={[s.catPill, { backgroundColor: cat.color + "22", borderColor: cat.color }]}>
                      <Text style={[s.catPillText, { color: cat.color }]}>
                        {cat.icon} {cat.label}
                      </Text>
                    </View>
                  </View>
                  <View style={[s.severityBadge, { backgroundColor: sevColor }]}>
                    <Text style={s.severityText}>{capitalize(r.riskLevel)}</Text>
                  </View>
                </View>

                {/* Content preview */}
                <Text style={s.reportContent} numberOfLines={2}>{r.content}</Text>

                {/* Meta row */}
                <View style={s.reportMeta}>
                  <Text style={s.metaText}>🕐 {fmt(r.createdAt)}</Text>
                  <Text style={s.metaText}>Score: <Text style={{ fontWeight: "800", color: sevColor }}>{r.riskScore ?? 0}/100</Text></Text>
                </View>

                {recs.length > 0 && (
                  <View style={s.recoveryPreview}>
                    <Text style={s.recoveryTitle}>🔄 Recovery: </Text>
                    <Text style={s.recoverySnippet} numberOfLines={1}>{recs[0]}</Text>
                  </View>
                )}
                <Text style={s.tapHint}>Tap to view full details</Text>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={!!preview} animationType="slide" transparent onRequestClose={() => setPreview(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {preview && (() => {
                const r = preview;
                const sevColor = { critical: "#d93025", high: "#ea4335", medium: "#f9ab00", low: "#34a853" }[r.riskLevel] ?? "#666";
                const cat = detectCategory(r);
                const recs = r.aiAnalysis?.recommendations ?? [];
                const inds = r.aiAnalysis?.indicators ?? [];
                return (
                  <>                    
                    <View style={s.modalHeader}>
                      <Text style={s.modalTitle}>Incident Detail</Text>
                      <TouchableOpacity onPress={() => setPreview(null)}>
                        <Text style={s.closeBtn}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Severity + Category badges */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                      <View style={[s.severityBadge, { backgroundColor: sevColor }]}>
                        <Text style={s.severityText}>{capitalize(r.riskLevel)} · {r.riskScore ?? 0}/100</Text>
                      </View>
                      <View style={[s.catPill, { backgroundColor: cat.color + "22", borderColor: cat.color }]}>
                        <Text style={[s.catPillText, { color: cat.color }]}>{cat.icon} {cat.label}</Text>
                      </View>
                    </View>

                    <Text style={s.modalLabel}>Type</Text>
                    <Text style={s.modalValue}>
                      {MEDIUM_ICON[r.reportType] ?? "❓"} {MEDIUM_LABEL[r.reportType] ?? capitalize(r.reportType ?? "other")}
                    </Text>

                    <Text style={s.modalLabel}>Timestamp</Text>
                    <Text style={s.modalValue}>{fmt(r.createdAt)}</Text>

                    <Text style={s.modalLabel}>Status</Text>
                    <Text style={s.modalValue}>{capitalize(r.status)}</Text>

                    {r.senderEmail && <><Text style={s.modalLabel}>Sender</Text><Text style={s.modalValue}>{r.senderEmail}</Text></>}
                    {r.url && <><Text style={s.modalLabel}>URL</Text><Text style={[s.modalValue, { color: "#d93025" }]}>{r.url}</Text></>}

                    <Text style={s.modalLabel}>Content</Text>
                    <Text style={[s.modalValue, { fontSize: 12, color: "#555" }]}>{r.content}</Text>

                    {inds.length > 0 && <>
                      <Text style={s.modalLabel}>Risk Indicators</Text>
                      {inds.map((ind, i) => (
                        <View key={i} style={s.indRow}>
                          <View style={[s.indDot, { backgroundColor: sevColor }]} />
                          <Text style={s.indText}>{typeof ind === "string" ? ind : ind.description ?? JSON.stringify(ind)}</Text>
                        </View>
                      ))}
                    </>}

                    {recs.length > 0 && <>
                      <Text style={s.modalLabel}>Recovery Actions</Text>
                      {recs.map((rec, i) => (
                        <View key={i} style={s.recRow}>
                          <Text style={s.recNum}>{i + 1}</Text>
                          <Text style={s.recText}>{rec}</Text>
                        </View>
                      ))}
                    </>}

                    <TouchableOpacity style={[s.btn, s.btnPrimary, { marginTop: 20 }]}
                      onPress={() => { setPreview(null); exportPDF(); }}>
                      <Text style={s.btnText}>📄 Export &amp; Share PDF</Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6fb" },
  header: {
    backgroundColor: "#d93025", paddingTop: 52, paddingBottom: 24,
    paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    elevation: 6, shadowColor: "#d93025", shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8,
  },
  back: { marginBottom: 10 },
  backText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  title: { color: "#fff", fontSize: 26, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },
  scroll: { flex: 1, paddingHorizontal: 18 },

  statsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12,
    alignItems: "center", marginHorizontal: 4,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 },
  },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, color: "#444", fontWeight: "600", marginTop: 2 },

  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 14,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#1c1c1e", marginBottom: 10 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#f4f6fb",
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, gap: 4,
  },
  typeChipIcon: { fontSize: 14 },
  typeChipLabel: { fontSize: 12, fontWeight: "700", color: "#333" },
  typeChipBadge: { backgroundColor: "#d93025", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  typeChipCount: { color: "#fff", fontSize: 12, fontWeight: "800" },

  btnRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  btn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  btnPrimary: { backgroundColor: "#d93025", elevation: 3, shadowColor: "#d93025", shadowOpacity: 0.3, shadowOffset: { width: 0, height: 3 } },
  btnSecondary: { backgroundColor: "#fff", borderWidth: 2, borderColor: "#d93025" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#1c1c1e", marginBottom: 12 },

  reportCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.07, shadowOffset: { width: 0, height: 2 },
  },
  reportTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  typePill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  typePillText: { fontSize: 12, fontWeight: "700", color: "#333" },
  pillRow:      { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  mediumPill:   { backgroundColor: "#f0f0f0", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  mediumPillText: { fontSize: 12, fontWeight: "700", color: "#555" },
  catPill:      { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  catPillText:  { fontSize: 12, fontWeight: "700" },
  severityBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  severityText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  reportContent: { fontSize: 13, color: "#555", lineHeight: 19, marginBottom: 8 },
  reportMeta: { flexDirection: "row", justifyContent: "space-between" },
  metaText: { fontSize: 12, color: "#555" },
  recoveryPreview: { flexDirection: "row", marginTop: 8, backgroundColor: "#e8f0fe", borderRadius: 8, padding: 7 },
  recoveryTitle: { fontSize: 12, fontWeight: "800", color: "#1a73e8" },
  recoverySnippet: { fontSize: 12, color: "#1a73e8", flex: 1 },
  tapHint: { fontSize: 11, color: "#bbb", marginTop: 8, textAlign: "right" },

  emptyCard: { alignItems: "center", padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: "#444", textAlign: "center", lineHeight: 21 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: "90%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#1c1c1e" },
  closeBtn: { fontSize: 20, color: "#444", fontWeight: "700" },
  modalLabel: { fontSize: 12, fontWeight: "800", color: "#333", letterSpacing: 0.8, marginTop: 14, marginBottom: 3 },
  modalValue: { fontSize: 14, fontWeight: "600", color: "#1c1c1e" },
  indRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  indDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 10 },
  indText: { fontSize: 13, color: "#333", flex: 1 },
  recRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8, backgroundColor: "#f4f6fb", borderRadius: 8, padding: 10 },
  recNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#1a73e8", color: "#fff", fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 22, marginRight: 10 },
  recText: { fontSize: 13, fontWeight: "600", color: "#1c1c1e", flex: 1, lineHeight: 20 },
});
