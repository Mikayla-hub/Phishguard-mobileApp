import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { analyzePhishing, generateIncidentPlan } from "../services/api";
import * as ImagePicker from 'expo-image-picker';

const PhishingAnalyzerScreen = ({ navigation }) => {
  const [inputText, setInputText] = useState("");
  const [analysisType, setAnalysisType] = useState("url"); // 'url', 'email', or 'image'
  const [imageUri, setImageUri] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [results, setResults] = useState(null);
  const [scanAnimation] = useState(new Animated.Value(0));

  const startScanAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnimation, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnimation, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopScanAnimation = () => {
    scanAnimation.stopAnimation();
    scanAnimation.setValue(0);
  };

  const getRiskDisplay = (riskLevel) => {
    switch (riskLevel) {
      case "critical":
        return { label: "HIGH RISK", color: "#d93025" };
      case "high":
        return { label: "HIGH RISK", color: "#d93025" };
      case "medium":
        return { label: "MEDIUM RISK", color: "#f9ab00" };
      case "low":
        return { label: "LOW RISK", color: "#34a853" };
      case "safe":
      default:
        return { label: "LOW RISK", color: "#34a853" };
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false, // Disabled to prevent forced square cropping of vertical screenshots
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
      setInputText(result.assets[0].base64); // Store base64 to send to backend
    }
  };

  const analyzeContent = async () => {
    if (!inputText.trim()) return;

    setIsAnalyzing(true);
    setResults(null);
    startScanAnimation();

    try {
      const response = await analyzePhishing(inputText, analysisType);
      const analysis = response?.analysis;

      if (!analysis) {
        throw new Error("No analysis data returned from server.");
      }

      const { label, color } = getRiskDisplay(analysis.riskLevel);
      const riskScorePercent = Math.min(
        100,
        Math.max(0, Math.round((analysis.riskScore || 0) * 100))
      );

      const detectedIndicators = (analysis.indicators || []).map((indicator) =>
        typeof indicator === "string" ? indicator : indicator.indicator || ""
      );

      const recommendation =
        (analysis.recommendations && analysis.recommendations[0]) ||
        "Review the detailed indicators before taking action.";

      const resultForUi = {
        riskScore: riskScorePercent,
        riskLevel: label,
        riskColor: color,
        detectedIndicators,
        recommendation,
        analyzedText:
          analysisType === 'image' ? "Screenshot Analysis" : inputText.substring(0, 100) + (inputText.length > 100 ? "..." : ""),
      };

      setResults(resultForUi);

    } catch (error) {
      console.error("\n[Troubleshooting] Analysis error caught!");
      console.error("-> Message:", error?.message);
      console.error("-> Status Code:", error?.status);
      console.error("-> Backend Data:", JSON.stringify(error?.data, null, 2));
      console.error("-> Full Error:", error);
      Alert.alert(
        "Analysis failed",
        error?.message || "Unable to analyze content. Please try again."
      );
    } finally {
      setIsAnalyzing(false);
      stopScanAnimation();
    }
  };

  const clearAnalysis = () => {
    setInputText("");
    setImageUri(null);
    setResults(null);
  };

  const handleGeneratePlan = async () => {
    if (!results) return;
    
    setIsGeneratingPlan(true);
    try {
      let calculatedSeverity = "low";
      if (results.riskScore >= 80) calculatedSeverity = "critical";
      else if (results.riskScore >= 60) calculatedSeverity = "high";
      else if (results.riskScore >= 40) calculatedSeverity = "medium";
      
      let threatPrefix = analysisType === "url" ? "Malicious URL" : analysisType === "email" ? "Phishing Email" : "Suspicious Content";
      const incidentType = `${threatPrefix} Detection (${results.riskScore}% Risk)`;
      
      const payload = {
        title: `Automated Analyzer Threat: ${threatPrefix}`,
        incidentType: incidentType,
        severity: calculatedSeverity,
        description: `Automated ML scanner detected a risk score of ${results.riskScore}/100.\nIndicators: ${results.detectedIndicators.join(", ")}`
      };
      
      await generateIncidentPlan(payload);
      navigation.navigate("IncidentResponseScreen");
      
    } catch (error) {
       console.error("Failed to generate response plan:", error);
       Alert.alert("Plan Generation Failed", error?.message || "Could not draft response plan. Try again.");
    } finally {
       setIsGeneratingPlan(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a73e8" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Phishing Analyzer</Text>
        <Text style={styles.headerSubtitle}>Real-time threat detection</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Analysis Type Selector */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[styles.typeButton, analysisType === "url" && styles.typeButtonActive]}
              onPress={() => setAnalysisType("url")}
            >
              <Text style={[styles.typeButtonText, analysisType === "url" && styles.typeButtonTextActive]}>
                🔗 URL Scanner
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeButton, analysisType === "email" && styles.typeButtonActive]}
              onPress={() => setAnalysisType("email")}
            >
              <Text style={[styles.typeButtonText, analysisType === "email" && styles.typeButtonTextActive]}>
                ✉️ Email Content
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeButton, analysisType === "image" && styles.typeButtonActive]}
              onPress={() => setAnalysisType("image")}
            >
              <Text style={[styles.typeButtonText, analysisType === "image" && styles.typeButtonTextActive]}>
                🖼️ Screenshot
              </Text>
            </TouchableOpacity>
          </View>

          {/* Input Area */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>
              {analysisType === "url" 
                ? "Enter URL to analyze:" 
                : analysisType === "email" 
                ? "Paste email content:" 
                : "Upload a screenshot:"}
            </Text>
            
            {analysisType === "image" ? (
              <View style={styles.imageUploadContainer}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.previewImage} />
                ) : (
                  <TouchableOpacity style={styles.uploadPlaceholder} onPress={pickImage}>
                    <Text style={styles.uploadIcon}>📸</Text>
                    <Text style={styles.uploadText}>Tap to select screenshot</Text>
                  </TouchableOpacity>
                )}
                {imageUri && (
                  <TouchableOpacity style={styles.changeImageButton} onPress={pickImage}>
                    <Text style={styles.changeImageText}>Change Image</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TextInput
                style={[styles.textInput, analysisType === "email" && styles.textInputMultiline]}
                placeholder={
                  analysisType === "url"
                    ? "https://example.com/suspicious-link"
                    : "Paste the suspicious email content here..."
                }
                value={inputText}
                onChangeText={setInputText}
                multiline={analysisType === "email"}
                numberOfLines={analysisType === "email" ? 6 : 1}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.analyzeButton, !inputText.trim() && styles.analyzeButtonDisabled]}
                onPress={analyzeContent}
                disabled={!inputText.trim() || isAnalyzing}
              >
                <Text style={styles.analyzeButtonText}>
                  {isAnalyzing ? "Analyzing..." : "🔍 Analyze Now"}
                </Text>
              </TouchableOpacity>
              {inputText.length > 0 && (
                <TouchableOpacity style={styles.clearButton} onPress={clearAnalysis}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Scanning Animation */}
          {isAnalyzing && (
            <View style={styles.scanningContainer}>
              <Animated.View
                style={[
                  styles.scannerLine,
                  {
                    opacity: scanAnimation.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.3, 1, 0.3],
                    }),
                  },
                ]}
              />
              <ActivityIndicator size="large" color="#1a73e8" />
              <Text style={styles.scanningText}>AI analyzing content...</Text>
              <Text style={styles.scanningSubtext}>Checking against known phishing patterns</Text>
            </View>
          )}

          {/* Results */}
          {results && (
            <View style={styles.resultsContainer}>
              {/* Risk Score Card */}
              <View style={[styles.riskCard, { borderLeftColor: results.riskColor }]}>
                <View style={styles.riskHeader}>
                  <View style={[styles.riskBadge, { backgroundColor: results.riskColor }]}>
                    <Text style={styles.riskBadgeText}>{results.riskLevel}</Text>
                  </View>
                  <View style={styles.scoreContainer}>
                    <Text style={[styles.scoreNumber, { color: results.riskColor }]}>
                      {results.riskScore}
                    </Text>
                    <Text style={styles.scoreLabel}>Risk Score</Text>
                  </View>
                </View>

                {/* Risk Meter */}
                <View style={styles.riskMeter}>
                  <View style={styles.riskMeterTrack}>
                    <View
                      style={[
                        styles.riskMeterFill,
                        {
                          width: `${results.riskScore}%`,
                          backgroundColor: results.riskColor,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.riskMeterLabels}>
                    <Text style={styles.riskMeterLabel}>Safe</Text>
                    <Text style={styles.riskMeterLabel}>Suspicious</Text>
                    <Text style={styles.riskMeterLabel}>Dangerous</Text>
                  </View>
                </View>
              </View>

              {/* Reasons / Detected Indicators */}
              {results.detectedIndicators.length > 0 && (
                <View style={styles.indicatorsCard}>
                  <Text style={styles.indicatorsTitle}>🔍 Reasons for Risk Score</Text>
                  {results.detectedIndicators.map((indicator, index) => (
                    <View key={index} style={styles.indicatorItem}>
                      <View style={[styles.indicatorDot, { backgroundColor: results.riskColor }]} />
                      <Text style={styles.indicatorText}>{indicator}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Recommendation */}
              <View style={styles.recommendationCard}>
                <Text style={styles.recommendationTitle}>💡 Recommendation</Text>
                <Text style={styles.recommendationText}>{results.recommendation}</Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.reportButton}
                  onPress={() => navigation.navigate("ReportPhishingScreen", { 
                    prefilledContent: inputText,
                    analysisResults: results 
                  })}
                >
                  <Text style={styles.reportButtonText}>🚨 Report This</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.learnButton, isGeneratingPlan && { backgroundColor: "#888" }]}
                  onPress={handleGeneratePlan}
                  disabled={isGeneratingPlan}
                >
                  {isGeneratingPlan ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.learnButtonText}>🛡️ Get Response Plan</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Tips Section */}
          {!results && !isAnalyzing && (
            <View style={styles.tipsSection}>
              <Text style={styles.tipsTitle}>Quick Tips</Text>
              <View style={styles.tipCard}>
                <Text style={styles.tipIcon}>🔗</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipText}>
                    <Text style={styles.tipBold}>For URLs:</Text> Copy the full link address, don't click it first
                  </Text>
                </View>
              </View>
              <View style={styles.tipCard}>
                <Text style={styles.tipIcon}>✉️</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipText}>
                    <Text style={styles.tipBold}>For Emails:</Text> Include the sender address and full message body
                  </Text>
                </View>
              </View>
              <View style={styles.tipCard}>
                <Text style={styles.tipIcon}>⚡</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipText}>
                    <Text style={styles.tipBold}>Real-time:</Text> Our AI analyzes patterns used in known phishing attacks
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },
  header: {
    backgroundColor: "#1a73e8",
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
  typeSelector: {
    flexDirection: "row",
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    padding: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    marginHorizontal: 5,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  typeButtonActive: {
    borderColor: "#1a73e8",
    backgroundColor: "#e8f0fe",
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  typeButtonTextActive: {
    color: "#1a73e8",
  },
  inputSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: "#fafafa",
    marginBottom: 15,
  },
  textInputMultiline: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  imageUploadContainer: {
    marginBottom: 15,
    alignItems: 'center',
  },
  uploadPlaceholder: {
    width: '100%',
    height: 150,
    backgroundColor: '#fafafa',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  uploadText: {
    color: '#666',
    fontSize: 14,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    resizeMode: 'contain',
  },
  changeImageButton: {
    marginTop: 10,
    padding: 8,
  },
  changeImageText: {
    color: '#1a73e8',
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  analyzeButton: {
    flex: 1,
    backgroundColor: "#1a73e8",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  analyzeButtonDisabled: {
    backgroundColor: "#ccc",
  },
  analyzeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  clearButton: {
    marginLeft: 10,
    padding: 15,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
  },
  clearButtonText: {
    color: "#666",
    fontWeight: "600",
  },
  scanningContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 30,
    alignItems: "center",
    marginBottom: 20,
  },
  scannerLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#1a73e8",
    borderRadius: 2,
  },
  scanningText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  scanningSubtext: {
    marginTop: 5,
    fontSize: 13,
    color: "#666",
  },
  resultsContainer: {
    marginBottom: 20,
  },
  riskCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    borderLeftWidth: 5,
    elevation: 2,
  },
  riskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  riskBadge: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  riskBadgeText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  scoreContainer: {
    alignItems: "center",
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: "bold",
  },
  scoreLabel: {
    fontSize: 12,
    color: "#666",
  },
  riskMeter: {
    marginTop: 10,
  },
  riskMeterTrack: {
    height: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 5,
    overflow: "hidden",
  },
  riskMeterFill: {
    height: "100%",
    borderRadius: 5,
  },
  riskMeterLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  riskMeterLabel: {
    fontSize: 10,
    color: "#888",
  },
  indicatorsCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
  },
  indicatorsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  indicatorItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  indicatorText: {
    fontSize: 14,
    color: "#444",
    flex: 1,
  },
  recommendationCard: {
    backgroundColor: "#e8f0fe",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
  },
  recommendationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1a73e8",
    marginBottom: 10,
  },
  recommendationText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: "row",
    marginBottom: 20,
  },
  reportButton: {
    flex: 1,
    backgroundColor: "#d93025",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginRight: 10,
  },
  reportButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  learnButton: {
    flex: 1,
    backgroundColor: "#34a853",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  learnButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  tipsSection: {
    marginBottom: 20,
  },
  tipsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  tipCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  tipIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  tipContent: {
    flex: 1,
  },
  tipText: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
  },
  tipBold: {
    fontWeight: "bold",
  },
});

export default PhishingAnalyzerScreen;
