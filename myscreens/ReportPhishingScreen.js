import React, { useState, useEffect } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { submitReport } from "../services/api";

// AI Categorization Rules
const CATEGORY_RULES = [
  {
    id: "credential_phishing",
    name: "Credential Phishing",
    icon: "🔐",
    color: "#d93025",
    patterns: [/\bpassword\b/gi, /\blogin\b/gi, /\bcredentials?\b/gi, /account.*verify/gi, /\bsign.?in\b/gi, /\bauth/gi, /verify.*identity/gi],
    description: "Attempts to steal login credentials",
  },
  {
    id: "financial_fraud",
    name: "Financial Fraud",
    icon: "💳",
    color: "#ea4335",
    patterns: [/\bbank\b/gi, /\bpayment\b/gi, /credit.?card/gi, /wire.?transfer/gi, /\bpaypal\b/gi, /\binvoice\b/gi, /\bbilling\b/gi, /\brefund\b/gi, /\btransaction\b/gi],
    description: "Financial scams targeting money or card details",
  },
  {
    id: "malware_delivery",
    name: "Malware Delivery",
    icon: "🦠",
    color: "#9334ea",
    patterns: [/\bdownload\b/gi, /\battachment\b/gi, /\.exe\b/gi, /\.zip\b/gi, /\binstall\b/gi, /software.?update/gi, /document.*attached/gi, /\bpdf\b/gi],
    description: "Attempts to distribute malicious software",
  },
  {
    id: "impersonation",
    name: "Brand Impersonation",
    icon: "🎭",
    color: "#f9ab00",
    patterns: [/\bamazon\b/gi, /\bgoogle\b/gi, /\bmicrosoft\b/gi, /\bapple\b/gi, /\bnetflix\b/gi, /\bfacebook\b/gi, /\binstagram\b/gi, /\bchase\b/gi, /\bwells fargo\b/gi],
    description: "Fake communications impersonating known brands",
  },
  {
    id: "prize_scam",
    name: "Prize/Lottery Scam",
    icon: "🎰",
    color: "#ff6d00",
    patterns: [/\bwinner\b/gi, /\bwon\b/gi, /\blottery\b/gi, /\bprize\b/gi, /\bcongratulations?\b/gi, /\bselected\b/gi, /\breward\b/gi, /gift.?card/gi],
    description: "Fake prize or lottery winning notifications",
  },
  {
    id: "tech_support",
    name: "Tech Support Scam",
    icon: "🖥️",
    color: "#1a73e8",
    patterns: [/tech.?support/gi, /virus.?detected/gi, /computer.*infected/gi, /call.*now/gi, /help.?desk/gi, /\bmcafee\b/gi, /\bnorton\b/gi, /\bhacked\b/gi],
    description: "Fake technical support requests",
  },
  {
    id: "romance_scam",
    name: "Romance/Social Engineering",
    icon: "💔",
    color: "#e91e63",
    patterns: [/\blove\b/gi, /\brelationship\b/gi, /\bdating\b/gi, /meet.?me/gi, /\blonely\b/gi, /\bprofile\b/gi, /\bchat\b/gi],
    description: "Social engineering through fake relationships",
  },
  {
    id: "unknown",
    name: "Suspicious Content",
    icon: "❓",
    color: "#666",
    patterns: [],
    description: "Requires manual review",
  },
];

const SEVERITY_LEVELS = [
  { id: "critical", label: "Critical", color: "#d93025", description: "Active attack, immediate threat" },
  { id: "high", label: "High", color: "#ea4335", description: "Clear phishing attempt" },
  { id: "medium", label: "Medium", color: "#f9ab00", description: "Suspicious but unclear" },
  { id: "low", label: "Low", color: "#34a853", description: "Minor concern" },
];

const ReportPhishingScreen = ({ navigation, route }) => {
  const { prefilledContent, analysisResults } = route.params || {};

  const [reportType, setReportType] = useState("email");
  const [suspiciousContent, setSuspiciousContent] = useState(prefilledContent || "");
  const [senderInfo, setSenderInfo] = useState("");
  const [urlLink, setUrlLink] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState(null);
  const [aiCategory, setAiCategory] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [reportId, setReportId] = useState("");

  // AI Auto-categorization
  useEffect(() => {
    categorizeContent();
  }, [suspiciousContent, senderInfo, urlLink]);

  const categorizeContent = () => {
    const fullContent = `${suspiciousContent} ${senderInfo} ${urlLink}`.toLowerCase();
    
    if (!fullContent.trim()) {
      setAiCategory(null);
      return;
    }

    let bestCategory = null;
    let maxScore = 0;

    for (const category of CATEGORY_RULES) {
      let score = 0;
      for (const pattern of category.patterns) {
        const matches = fullContent.match(pattern);
        if (matches) {
          score += matches.length; // Count how many times the patterns hit
        }
      }
      
      if (score > maxScore) {
        maxScore = score;
        bestCategory = category;
      }
    }

    // Assign the highest scoring category, or unknown if 0 hits
    setAiCategory(bestCategory || CATEGORY_RULES.find(c => c.id === "unknown"));
  };

  const generateReportId = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `RPT-${timestamp}-${random}`.toUpperCase();
  };

  const handleSubmit = async () => {
    if (!suspiciousContent.trim()) {
      Alert.alert("Required Field", "Please enter the suspicious content to report.");
      return;
    }

    if (!selectedSeverity) {
      Alert.alert("Required Field", "Please select a severity level.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        reportType,
        content:
          suspiciousContent +
          (additionalNotes
            ? `\n\nAdditional notes:\n${additionalNotes}`
            : ""),
        url:
          reportType === "url"
            ? suspiciousContent
            : reportType === "email"
            ? urlLink || undefined
            : undefined,
        senderEmail:
          reportType === "email" ? senderInfo || undefined : undefined,
        subject: undefined,
        severity: selectedSeverity,
        aiCategoryId: aiCategory?.id || null,
      };

      // 1) Send to existing Node backend (for existing features/achievements)
      const response = await submitReport(payload);
      const backendReportId = response?.report?.id || generateReportId();

      setReportId(backendReportId);
      setShowSuccessModal(true);
    } catch (error) {
      console.error("\n[Troubleshooting] Report submission error caught!");
      console.error("-> Message:", error?.message);
      console.error("-> Status Code:", error?.status);
      console.error("-> Backend Data:", JSON.stringify(error?.data, null, 2));
      console.error("-> Full Error:", error);
      Alert.alert(
        "Submission failed",
        error?.message ||
          "Unable to submit report. Please make sure you are logged in and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewReport = () => {
    setShowSuccessModal(false);
    setSuspiciousContent("");
    setSenderInfo("");
    setUrlLink("");
    setAdditionalNotes("");
    setSelectedSeverity(null);
    setAiCategory(null);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#d93025" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Phishing</Text>
        <Text style={styles.headerSubtitle}>Help protect others by reporting threats</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Report Type Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Report Type</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeOption, reportType === "email" && styles.typeOptionActive]}
                onPress={() => setReportType("email")}
              >
                <Text style={styles.typeIcon}>✉️</Text>
                <Text style={[styles.typeLabel, reportType === "email" && styles.typeLabelActive]}>
                  Suspicious Email
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeOption, reportType === "url" && styles.typeOptionActive]}
                onPress={() => setReportType("url")}
              >
                <Text style={styles.typeIcon}>🔗</Text>
                <Text style={[styles.typeLabel, reportType === "url" && styles.typeLabelActive]}>
                  Malicious URL
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeOption, reportType === "sms" && styles.typeOptionActive]}
                onPress={() => setReportType("sms")}
              >
                <Text style={styles.typeIcon}>💬</Text>
                <Text style={[styles.typeLabel, reportType === "sms" && styles.typeLabelActive]}>
                  SMS/Text
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Main Content Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Suspicious Content *</Text>
            <TextInput
              style={styles.textAreaInput}
              placeholder={
                reportType === "email"
                  ? "Paste the email body content here..."
                  : reportType === "url"
                  ? "Enter the suspicious URL..."
                  : "Paste the SMS message here..."
              }
              value={suspiciousContent}
              onChangeText={setSuspiciousContent}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          {/* Sender Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sender Information</Text>
            <TextInput
              style={styles.textInput}
              placeholder={
                reportType === "email"
                  ? "sender@example.com"
                  : reportType === "sms"
                  ? "Phone number"
                  : "Website domain"
              }
              value={senderInfo}
              onChangeText={setSenderInfo}
              autoCapitalize="none"
            />
          </View>

          {/* URL Link */}
          {reportType === "email" && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Suspicious Link (if any)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="https://suspicious-link.com"
                value={urlLink}
                onChangeText={setUrlLink}
                autoCapitalize="none"
              />
            </View>
          )}

          {/* AI Category */}
          {aiCategory && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AI Category Detection</Text>
              <View style={[styles.categoryCard, { borderLeftColor: aiCategory.color }]}>
                <Text style={styles.categoryIcon}>{aiCategory.icon}</Text>
                <View style={styles.categoryInfo}>
                  <Text style={[styles.categoryName, { color: aiCategory.color }]}>
                    {aiCategory.name}
                  </Text>
                  <Text style={styles.categoryDescription}>{aiCategory.description}</Text>
                </View>
                <View style={[styles.categoryBadge, { backgroundColor: aiCategory.color }]}>
                  <Text style={styles.categoryBadgeText}>Auto</Text>
                </View>
              </View>
            </View>
          )}

          {/* Severity Level */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Severity Level *</Text>
            <View style={styles.severityContainer}>
              {SEVERITY_LEVELS.map((level) => (
                <TouchableOpacity
                  key={level.id}
                  style={[
                    styles.severityOption,
                    selectedSeverity === level.id && { borderColor: level.color, borderWidth: 2 },
                  ]}
                  onPress={() => setSelectedSeverity(level.id)}
                >
                  <View style={[styles.severityDot, { backgroundColor: level.color }]} />
                  <View style={styles.severityInfo}>
                    <Text style={[styles.severityLabel, selectedSeverity === level.id && { color: level.color, fontWeight: "bold" }]}>
                      {level.label}
                    </Text>
                    <Text style={styles.severityDesc}>{level.description}</Text>
                  </View>
                  {selectedSeverity === level.id && (
                    <Text style={[styles.checkMark, { color: level.color }]}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Additional Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Notes</Text>
            <TextInput
              style={styles.textAreaInput}
              placeholder="Any additional context or details that might help..."
              value={additionalNotes}
              onChangeText={setAdditionalNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Analysis Results (if coming from analyzer) */}
          {analysisResults && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Previous Analysis</Text>
              <View style={styles.analysisCard}>
                <View style={styles.analysisRow}>
                  <Text style={styles.analysisLabel}>Risk Score:</Text>
                  <Text style={[styles.analysisValue, { color: analysisResults.riskColor }]}>
                    {analysisResults.riskScore}/100
                  </Text>
                </View>
                <View style={styles.analysisRow}>
                  <Text style={styles.analysisLabel}>Risk Level:</Text>
                  <Text style={[styles.analysisValue, { color: analysisResults.riskColor }]}>
                    {analysisResults.riskLevel}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? "Submitting Report..." : "🚨 Submit Report"}
            </Text>
          </TouchableOpacity>

          {/* Privacy Notice */}
          <View style={styles.privacyNotice}>
            <Text style={styles.privacyText}>
              🔒 Your report is encrypted and helps protect our community. Personal information is kept confidential.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalIcon}>✅</Text>
            <Text style={styles.modalTitle}>Report Submitted!</Text>
            <View style={styles.reportIdContainer}>
              <Text style={styles.reportIdLabel}>Report ID</Text>
              <Text style={styles.reportIdValue}>{reportId}</Text>
            </View>
            <Text style={styles.modalMessage}>
              Thank you for helping keep our community safe. Our security team will review this report and take appropriate action.
            </Text>
            {aiCategory && (
              <View style={styles.modalCategory}>
                <Text style={styles.modalCategoryLabel}>Categorized as:</Text>
                <View style={[styles.modalCategoryBadge, { backgroundColor: aiCategory.color }]}>
                  <Text style={styles.modalCategoryText}>
                    {aiCategory.icon} {aiCategory.name}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={() => {
                  setShowSuccessModal(false);
                  navigation.goBack();
                }}
              >
                <Text style={styles.modalButtonPrimaryText}>Back to Home</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonSecondary} onPress={handleNewReport}>
                <Text style={styles.modalButtonSecondaryText}>Submit Another</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },
  header: {
    backgroundColor: "#d93025",
    paddingTop: 50,
    paddingBottom: 25,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: 5,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  typeSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  typeOption: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 5,
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  typeOptionActive: {
    borderColor: "#d93025",
    backgroundColor: "#fce8e6",
  },
  typeIcon: {
    fontSize: 24,
    marginBottom: 5,
  },
  typeLabel: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
  typeLabelActive: {
    color: "#d93025",
    fontWeight: "600",
  },
  textInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 15,
    fontSize: 14,
  },
  textAreaInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 15,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: "top",
  },
  categoryCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
  },
  categoryIcon: {
    fontSize: 30,
    marginRight: 15,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  categoryDescription: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  categoryBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  severityContainer: {
    backgroundColor: "#fff",
    borderRadius: 10,
    overflow: "hidden",
  },
  severityOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  severityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 15,
  },
  severityInfo: {
    flex: 1,
  },
  severityLabel: {
    fontSize: 14,
    color: "#333",
  },
  severityDesc: {
    fontSize: 11,
    color: "#888",
    marginTop: 2,
  },
  checkMark: {
    fontSize: 18,
    fontWeight: "bold",
  },
  analysisCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
  },
  analysisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  analysisLabel: {
    fontSize: 14,
    color: "#666",
  },
  analysisValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  submitButton: {
    backgroundColor: "#d93025",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 15,
  },
  submitButtonDisabled: {
    backgroundColor: "#ccc",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  privacyNotice: {
    padding: 15,
    backgroundColor: "#e8f0fe",
    borderRadius: 10,
    marginBottom: 30,
  },
  privacyText: {
    fontSize: 12,
    color: "#1a73e8",
    textAlign: "center",
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
  },
  modalIcon: {
    fontSize: 60,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  reportIdContainer: {
    backgroundColor: "#f5f7fa",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 15,
    width: "100%",
  },
  reportIdLabel: {
    fontSize: 12,
    color: "#666",
  },
  reportIdValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginTop: 5,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  modalMessage: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 15,
  },
  modalCategory: {
    alignItems: "center",
    marginBottom: 20,
  },
  modalCategoryLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 8,
  },
  modalCategoryBadge: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modalCategoryText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  modalButtons: {
    width: "100%",
  },
  modalButtonPrimary: {
    backgroundColor: "#1a73e8",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  modalButtonPrimaryText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  modalButtonSecondary: {
    backgroundColor: "#f0f0f0",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  modalButtonSecondaryText: {
    color: "#666",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default ReportPhishingScreen;
