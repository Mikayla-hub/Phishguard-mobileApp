import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from "react-native";

const WelcomeScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#020817" />
      <View style={styles.headerBackground} />

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Icon area */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🛡️</Text>
          </View>
          <Text style={styles.appName}>CyberGuardian</Text>
          <Text style={styles.tagline}>
            AI-powered phishing defense, incident response, and learning hub.
          </Text>
        </View>

        {/* Feature highlights */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Stay safe in three ways</Text>

          <View style={styles.featureRow}>
            <View style={styles.featureIconCircle}>
              <Text style={styles.featureIcon}>🔍</Text>
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Analyze suspicious content</Text>
              <Text style={styles.featureSubtitle}>
                Paste emails or URLs and let the AI risk engine inspect them for
                phishing indicators.
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureIconCircle, { backgroundColor: "#fef3c7" }]}>
              <Text style={styles.featureIcon}>🚨</Text>
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Respond and report fast</Text>
              <Text style={styles.featureSubtitle}>
                Follow an incident playbook, log reports, and keep a clear audit
                trail.
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureIconCircle, { backgroundColor: "#ecfeff" }]}>
              <Text style={styles.featureIcon}>📚</Text>
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Learn with micro‑lessons</Text>
              <Text style={styles.featureSubtitle}>
                Short, interactive modules that train you and your team to spot
                attacks before they land.
              </Text>
            </View>
          </View>
        </View>

        {/* Call to action buttons */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate("LoginScreen")}
          >
            <Text style={styles.primaryButtonText}>Secure Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("SignUpScreen")}
          >
            <Text style={styles.secondaryButtonText}>Create an account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ghostButton}
            onPress={() => navigation.navigate("PhishingAnalyzerScreen")}
          >
            <Text style={styles.ghostButtonText}>Try analyzer without account →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  headerBackground: {
    position: "absolute",
    top: -120,
    left: -60,
    right: -60,
    height: 260,
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 120,
    backgroundColor: "#0f172a",
    opacity: 0.98,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 32,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(237, 240, 243, 1)",
    borderWidth: 2,
    borderColor: "#38bdf8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#0ea5e9",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  logoEmoji: {
    fontSize: 40,
  },
  appName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#010c17ff",
    letterSpacing: 0.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
    color: "#94a3b8",
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#020617",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
    marginBottom: 28,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e2e8f0",
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  featureIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  featureIcon: {
    fontSize: 22,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e5e7eb",
    marginBottom: 4,
  },
  featureSubtitle: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 18,
  },
  buttonGroup: {
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: "#0ea5e9",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryButtonText: {
    color: "#0b1120",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#38bdf8",
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: "#e0f2fe",
    fontSize: 14,
    fontWeight: "600",
  },
  ghostButton: {
    paddingVertical: 8,
    alignItems: "center",
  },
  ghostButtonText: {
    color: "#7dd3fc",
    fontSize: 12,
  },
});

export default WelcomeScreen;

