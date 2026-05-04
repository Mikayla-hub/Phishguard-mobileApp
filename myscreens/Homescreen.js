import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLearningModules, generateModule } from "../services/api";
import { useTheme } from "../contexts/ThemeContext";

const Homescreen = ({ navigation }) => {
  const [allModules, setAllModules] = useState([]);
  const [dynamicModules, setDynamicModules] = useState([]);
  const [username, setUsername] = useState("User");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState("beginner");
  const { colors, isDarkMode } = useTheme();

  const LEVEL_CONFIG = {
    beginner: { label: "Beginner", color: "#1a73e8", bg: "#e8f0fe", icon: "🌱" },
    intermediate: { label: "Intermediate", color: "#f57c00", bg: "#fef3e0", icon: "⚡" },
    expert: { label: "Expert", color: "#c62828", bg: "#fce4ec", icon: "🔥" },
  };

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const response = await getLearningModules();
        if (response?.modules?.length > 0) {
          const validModules = response.modules.filter(m => (m.totalLessons || 0) >= 6);
          const modulesToUse = validModules.length > 0 ? validModules : response.modules;
          setAllModules(modulesToUse);
        }
      } catch (error) {
        console.error("Failed to fetch modules:", error);
      }
    };

    const initializeModules = async () => {
      try {
        const storedName = await AsyncStorage.getItem("username");
        if (storedName) setUsername(storedName);
        await fetchModules();
      } catch (error) {
        console.error("Failed to initialise modules:", error);
      }
    };

    initializeModules();
    const unsubscribe = navigation.addListener('focus', fetchModules);
    return unsubscribe;
  }, [navigation]);

  // Filter modules whenever selectedLevel or allModules changes
  useEffect(() => {
    const filtered = allModules.filter(m =>
      (m.difficulty || 'beginner').toLowerCase() === selectedLevel
    );
    setDynamicModules(filtered);
  }, [selectedLevel, allModules]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={colors.primary} />

      {/* Header Section */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View>
          <Text style={styles.greetingText}>Welcome back,</Text>
          <Text style={styles.usernameText}>{username}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => navigation.navigate("SettingsScreen")}
            style={[styles.logoutButton, { marginRight: 10 }]}
          >
            <Text style={styles.logoutText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate("LoginScreen")}
            style={styles.logoutButton}
          >
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Real-time Protection Status */}
        <TouchableOpacity 
          style={styles.statusCard}
          onPress={() => navigation.navigate("PhishingAnalyzerScreen")}
        >
          <Text style={styles.statusTitle}>System Status</Text>
          <View style={styles.statusRow}>
            <View style={styles.activeDot} />
            <Text style={styles.statusText}>AI Protection Active</Text>
          </View>
          <Text style={styles.statusSubtext}>Tap to analyze suspicious content →</Text>
        </TouchableOpacity>

        {/* Quick Actions Section */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
        <View style={styles.quickActionsRow}>
          {/* Analyze Button */}
          <TouchableOpacity
            style={styles.analyzeButton}
            onPress={() => navigation.navigate("PhishingAnalyzerScreen")}
          >
            <Text style={styles.actionIcon}>🔍</Text>
            <Text style={styles.analyzeButtonTitle}>ANALYZE</Text>
            <Text style={styles.analyzeButtonSubtitle}>Scan URLs & Emails</Text>
          </TouchableOpacity>

          {/* Report Button */}
          <TouchableOpacity
            style={styles.reportButton}
            onPress={() => navigation.navigate("ReportPhishingScreen")}
          >
            <Text style={styles.actionIcon}>🚨</Text>
            <Text style={styles.reportButtonTitle}>REPORT</Text>
            <Text style={styles.reportButtonSubtitle}>Submit Threats</Text>
          </TouchableOpacity>
        </View>

        {/* Incident Response Card */}
        <TouchableOpacity
          style={styles.incidentCard}
          onPress={() => navigation.navigate("IncidentResponseScreen")}
        >
          <View style={styles.incidentContent}>
            <Text style={styles.incidentIcon}>⚠️</Text>
            <View style={styles.incidentInfo}>
              <Text style={styles.incidentTitle}>Incident Response Plan</Text>
              <Text style={styles.incidentSubtitle}>Step-by-step guide when phishing is detected</Text>
            </View>
            <Text style={styles.moduleArrow}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Learning Hub Section */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Learning Hub</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.subtext }]}>
          Interactive lessons across 3 difficulty levels
        </Text>

        {/* Difficulty Filter Tabs */}
        <View style={styles.levelTabs}>
          {Object.entries(LEVEL_CONFIG).map(([level, config]) => (
            <TouchableOpacity
              key={level}
              style={[
                styles.levelTab,
                selectedLevel === level && { backgroundColor: config.color, borderColor: config.color },
              ]}
              onPress={() => setSelectedLevel(level)}
            >
              <Text style={[
                styles.levelTabText,
                selectedLevel === level && { color: "#fff" },
              ]}>
                {config.icon} {config.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Module Cards */}
        <View style={styles.modulesContainer}>
          {dynamicModules.length > 0 ? (
            dynamicModules.map((mod) => {
              const levelCfg = LEVEL_CONFIG[(mod.difficulty || 'beginner').toLowerCase()] || LEVEL_CONFIG.beginner;
              return (
                <TouchableOpacity 
                  key={mod.id}
                  style={styles.moduleCard}
                  onPress={() => navigation.navigate("LearningModuleScreen", { moduleId: mod.id })}
                >
                  <View style={[styles.iconBox, { backgroundColor: levelCfg.bg }]}>
                     <Text style={styles.iconText}>{levelCfg.icon}</Text>
                  </View>
                  <View style={styles.moduleInfo}>
                    <Text style={styles.moduleTitle}>{mod.title}</Text>
                    <Text style={styles.moduleDuration}>{mod.duration || "15 min"}</Text>
                  </View>
                  <View style={[styles.levelBadge, { backgroundColor: levelCfg.color }]}>
                    <Text style={styles.levelBadgeText}>{levelCfg.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ color: "#666" }}>No {LEVEL_CONFIG[selectedLevel].label.toLowerCase()} modules generated yet.</Text>
              <Text style={{ color: "#999", fontSize: 12, marginTop: 5 }}>Run the generator script to create all modules.</Text>
            </View>
          )}
        </View>
      </ScrollView>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greetingText: {
    color: "#daeaff",
    fontSize: 14,
  },
  usernameText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "bold",
  },
  logoutButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  logoutText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    borderLeftWidth: 4,
    borderLeftColor: "#34a853",
  },
  statusTitle: {
    fontSize: 12,
    color: "#888",
    textTransform: "uppercase",
    fontWeight: "bold",
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34a853",
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  statusSubtext: {
    fontSize: 13,
    color: "#1a73e8",
    marginLeft: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
    marginTop: 10,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 15,
  },
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    marginTop: 10,
  },
  analyzeButton: {
    flex: 1,
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginRight: 8,
    elevation: 3,
    shadowColor: "#1a73e8",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 },
  },
  reportButton: {
    flex: 1,
    backgroundColor: "#d93025",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginLeft: 8,
    elevation: 3,
    shadowColor: "#d93025",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 },
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 5,
  },
  analyzeButtonTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  analyzeButtonSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    marginTop: 3,
  },
  reportButtonTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  reportButtonSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    marginTop: 3,
  },
  incidentCard: {
    backgroundColor: "#fff3cd",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#f9ab00",
    elevation: 2,
  },
  incidentContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  incidentIcon: {
    fontSize: 30,
    marginRight: 12,
  },
  incidentInfo: {
    flex: 1,
  },
  incidentTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
  },
  incidentSubtitle: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  modulesContainer: {
    marginBottom: 20,
  },
  moduleCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  iconText: {
    fontSize: 24,
  },
  moduleInfo: {
    flex: 1,
  },
  moduleTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  moduleDuration: {
    fontSize: 12,
    color: "#888",
  },
  moduleArrow: {
    fontSize: 24,
    color: "#ccc",
    fontWeight: "300",
  },
  levelTabs: {
    flexDirection: "row",
    marginBottom: 15,
  },
  levelTab: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#e0e0e0",
    alignItems: "center",
  },
  levelTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#666",
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  levelBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
});

export default Homescreen;
