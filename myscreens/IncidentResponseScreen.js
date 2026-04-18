import React, { useState, useEffect } from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { firestore } from "../firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getIncidentProcedures } from "../services/api";

const getSeverityColor = (severity) => {
  switch (severity?.toLowerCase()) {
    case 'critical': return '#d93025';
    case 'high': return '#ea4335';
    case 'medium': return '#f9ab00';
    case 'low': return '#34a853';
    default: return '#1a73e8';
  }
};

const getSeverityIcon = (severity) => {
  switch (severity?.toLowerCase()) {
    case 'critical': return '🚨';
    case 'high': return '⚠️';
    case 'medium': return '⚡';
    case 'low': return 'ℹ️';
    default: return '🛡️';
  }
};

const IncidentResponseScreen = ({ navigation }) => {
  const [expandedPhase, setExpandedPhase] = useState("identification");
  const [completedSteps, setCompletedSteps] = useState({});
  const [procedures, setProcedures] = useState([]);
  const [loadingProcedures, setLoadingProcedures] = useState(true);

  useEffect(() => {
    const fetchProcedures = async () => {
      try {
        const data = await getIncidentProcedures();
        if (data && data.procedures) {
          setProcedures(data.procedures);
        }
      } catch (error) {
        console.error("Failed to fetch AI procedures:", error);
      } finally {
        setLoadingProcedures(false);
      }
    };
    fetchProcedures();
  }, []);

  const togglePhase = (phaseId) => {
    setExpandedPhase(expandedPhase === phaseId ? null : phaseId);
  };

  const toggleStep = (phaseId, stepId, optionalPhaseTitle, optionalStepTitle) => {
    const key = `${phaseId}-${stepId}`;
    setCompletedSteps((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));

    // Best-effort: record key incident-response actions in Firestore
    try {
      let phaseTitle = optionalPhaseTitle || String(phaseId);
      let stepTitle = optionalStepTitle || `Step ${stepId}`;

      addDoc(collection(firestore, "incidentSteps"), {
        phaseId,
        stepId,
        phaseTitle,
        stepTitle,
        completed: !completedSteps[key],
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Failed to write incident step to Firestore", err);
    }
  };

  const getPhaseProgress = (phaseId, dynamicStepsCount) => {
    if (dynamicStepsCount !== undefined && dynamicStepsCount > 0) {
      const completed = Array.from({ length: dynamicStepsCount }).filter(
        (_, i) => completedSteps[`${phaseId}-${i + 1}`]
      ).length;
      return Math.round((completed / dynamicStepsCount) * 100);
    }
    return 0;
  };

  const handleAction = (action) => {
    if (action) {
      navigation.navigate(action);
    }
  };

  const openUrl = (url) => {
    Linking.openURL(url).catch((err) => console.error("Failed to open URL:", err));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#ea4335" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Incident Response Plan</Text>
        <Text style={styles.headerSubtitle}>Step-by-step guide when phishing is detected</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Emergency Banner */}
        <View style={styles.emergencyBanner}>
          <Text style={styles.emergencyIcon}>⚠️</Text>
          <View style={styles.emergencyContent}>
            <Text style={styles.emergencyTitle}>Suspected Phishing?</Text>
            <Text style={styles.emergencyText}>
              Don't panic. Follow these steps in order to minimize damage and protect yourself.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            AI-Generated Response Procedures
          </Text>
          
          {loadingProcedures ? (
            <ActivityIndicator size="large" color="#ea4335" style={{ margin: 20 }} />
          ) : procedures.length > 0 ? (
            procedures.map((proc) => (
              <View key={proc.id} style={styles.phaseCard}>
                {/* Phase Header */}
                <TouchableOpacity
                  style={styles.phaseHeader}
                  onPress={() => togglePhase(proc.id)}
                >
                  <View style={[styles.phaseIconContainer, { backgroundColor: getSeverityColor(proc.severity) }]}>
                    <Text style={styles.phaseIcon}>{getSeverityIcon(proc.severity)}</Text>
                  </View>
                  <View style={styles.phaseInfo}>
                    <Text style={styles.phaseTitle}>{proc.title}</Text>
                    <Text style={styles.phaseDuration}>Severity: {proc.severity ? proc.severity.charAt(0).toUpperCase() + proc.severity.slice(1) : 'Unknown'}</Text>
                    <View style={styles.phaseProgressBar}>
                      <View
                        style={[
                          styles.phaseProgressFill,
                          { width: `${getPhaseProgress(proc.id, proc.steps?.length)}%`, backgroundColor: getSeverityColor(proc.severity) },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={styles.expandIcon}>
                    {expandedPhase === proc.id ? "▼" : "▶"}
                  </Text>
                </TouchableOpacity>

                {/* Phase Content */}
                {expandedPhase === proc.id && (
                  <View style={styles.phaseContent}>
                    {proc.steps?.map((step) => (
                      <View key={step.step} style={styles.stepCard}>
                        <TouchableOpacity
                          style={styles.stepHeader}
                          onPress={() => toggleStep(proc.id, step.step, proc.title, step.action)}
                        >
                          <View
                            style={[
                              styles.stepCheckbox,
                              completedSteps[`${proc.id}-${step.step}`] &&
                                styles.stepCheckboxCompleted,
                            ]}
                          >
                            {completedSteps[`${proc.id}-${step.step}`] && (
                              <Text style={styles.stepCheckmark}>✓</Text>
                            )}
                          </View>
                          <View style={styles.stepInfo}>
                            <View style={styles.stepTitleRow}>
                              <Text
                                style={[
                                  styles.stepTitle,
                                  completedSteps[`${proc.id}-${step.step}`] &&
                                    styles.stepTitleCompleted,
                                ]}
                              >
                                Step {step.step}
                              </Text>
                            </View>
                            <Text style={styles.stepDetail}>{step.action}</Text>
                            <Text style={{fontSize: 11, color: "#888", marginTop: 4}}>⏱️ {step.duration}</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    ))}

                    {proc.recovery && proc.recovery.length > 0 && (
                      <View style={styles.stepChecklist}>
                        <Text style={{fontWeight: "bold", marginBottom: 8, color: "#333"}}>Recovery Actions:</Text>
                        {proc.recovery.map((item, index) => (
                          <View key={index} style={styles.checklistItem}>
                            <Text style={styles.checklistBullet}>•</Text>
                            <Text style={styles.checklistText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))
          ) : (
            <Text style={{ color: "#666", marginTop: 10, fontStyle: "italic" }}>
              No incident procedures have been generated yet. When you report an incident, its custom AI response plan will appear here.
            </Text>
          )}
        </View>

        {/* Bottom Padding */}
        <View style={{ height: 30 }} />
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
    backgroundColor: "#ea4335",
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
  emergencyBanner: {
    backgroundColor: "#fef7e0",
    borderRadius: 12,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 25,
    borderLeftWidth: 4,
    borderLeftColor: "#f9ab00",
  },
  emergencyIcon: {
    fontSize: 30,
    marginRight: 15,
  },
  emergencyContent: {
    flex: 1,
  },
  emergencyTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  emergencyText: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 15,
  },
  phaseCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  phaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  phaseIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  phaseIcon: {
    fontSize: 24,
  },
  phaseInfo: {
    flex: 1,
  },
  phaseTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  phaseDuration: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  phaseProgressBar: {
    height: 4,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    marginTop: 8,
  },
  phaseProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  expandIcon: {
    fontSize: 12,
    color: "#888",
    marginLeft: 10,
  },
  phaseContent: {
    padding: 15,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  phaseDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 15,
    fontStyle: "italic",
  },
  stepCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    backgroundColor: "#fff",
  },
  stepCheckboxCompleted: {
    backgroundColor: "#34a853",
    borderColor: "#34a853",
  },
  stepCheckmark: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  stepInfo: {
    flex: 1,
  },
  stepTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginRight: 8,
  },
  stepTitleCompleted: {
    textDecorationLine: "line-through",
    color: "#888",
  },
  criticalBadge: {
    backgroundColor: "#d93025",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  criticalBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  stepDetail: {
    fontSize: 13,
    color: "#555",
    marginTop: 5,
    lineHeight: 18,
  },
  stepChecklist: {
    marginTop: 10,
    marginLeft: 36,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
  },
  checklistItem: {
    flexDirection: "row",
    marginBottom: 6,
  },
  checklistBullet: {
    color: "#666",
    marginRight: 8,
  },
  checklistText: {
    fontSize: 12,
    color: "#555",
    flex: 1,
  },
  resourcesContainer: {
    marginTop: 10,
    marginLeft: 36,
  },
  resourceLink: {
    paddingVertical: 8,
  },
  resourceLinkText: {
    color: "#1a73e8",
    fontSize: 13,
  },
  stepActionButton: {
    marginTop: 10,
    marginLeft: 36,
    backgroundColor: "#1a73e8",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  stepActionButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
});

export default IncidentResponseScreen;
