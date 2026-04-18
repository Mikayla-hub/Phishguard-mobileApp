import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Vibration,
} from "react-native";
import { firestore } from "../firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getLearningModule, saveLearningProgress } from "../services/api";
import { useTheme } from "../contexts/ThemeContext";

const { width } = Dimensions.get("window");


const LearningModuleScreen = ({ navigation, route }) => {
  const { moduleId } = route.params || { moduleId: "phishingEmails" };
  const { colors } = useTheme();

  const [module, setModule] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [expandedFlag, setExpandedFlag] = useState(null);
  const [practiceAnswers, setPracticeAnswers] = useState({});
  const [checklistItems, setChecklistItems] = useState({});
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [score, setScore] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);

  useEffect(() => {
    const loadModuleData = async () => {
      try {
        setIsLoadingData(true);
        const res = await getLearningModule(moduleId);
        if (res && res.module) {
          const mod = res.module;
          // Firebase may return arrays as objects with numeric keys — normalize to a real array
          if (mod.lessons && !Array.isArray(mod.lessons)) {
            mod.lessons = Object.values(mod.lessons);
          }
          // Ensure lessons is always an array
          if (!mod.lessons) {
            mod.lessons = [];
          }
          // Deep-normalize nested arrays inside each lesson (Firebase converts ALL arrays to objects)
          mod.lessons = mod.lessons.map((lesson) => {
            const normalized = { ...lesson };
            // Quiz options
            if (normalized.options && !Array.isArray(normalized.options)) {
              normalized.options = Object.values(normalized.options);
            }
            // Interactive flags
            if (normalized.flags && !Array.isArray(normalized.flags)) {
              normalized.flags = Object.values(normalized.flags);
            }
            // Practice emails
            if (normalized.emails && !Array.isArray(normalized.emails)) {
              normalized.emails = Object.values(normalized.emails);
            }
            // Practice websites
            if (normalized.websites && !Array.isArray(normalized.websites)) {
              normalized.websites = Object.values(normalized.websites);
            }
            // Practice checklist
            if (normalized.checklist && !Array.isArray(normalized.checklist)) {
              normalized.checklist = Object.values(normalized.checklist);
            }
            // Summary points
            if (normalized.points && !Array.isArray(normalized.points)) {
              normalized.points = Object.values(normalized.points);
            }
            // Scenario URLs
            if (normalized.scenario && normalized.scenario.urls && !Array.isArray(normalized.scenario.urls)) {
              normalized.scenario = { ...normalized.scenario, urls: Object.values(normalized.scenario.urls) };
            }
            return normalized;
          });
          console.log(`[LearningModule] Loaded ${mod.lessons.length} lessons:`, mod.lessons.map(l => `${l.id}(${l.type})`));
          setModule(mod);
        } else {
          Alert.alert("Error", "Module data not found.");
          navigation.goBack();
        }
      } catch (err) {
        console.error("Failed to load module", err);
        Alert.alert("Error", "Could not load learning module.");
        navigation.goBack();
      } finally {
        setIsLoadingData(false);
      }
    };
    loadModuleData();
  }, [moduleId]);

  const handleNext = async () => {
    if (currentLessonIndex < module.lessons.length - 1) {
      setCurrentLessonIndex(currentLessonIndex + 1);
      setShowExplanation(false);
      setSelectedAnswer(null);
      setExpandedFlag(null);
      setPracticeAnswers({});
    } else {
      // Module completed
      try {
        await saveLearningProgress({
          moduleId: module.id,
          score,
          totalQuestions,
          checklistScore: getCheckedCount()
        });
      } catch (err) {
        console.warn("Failed to save progress to backend", err);
      }
      setShowCompletionModal(true);
    }
  };

  const handlePrevious = () => {
    if (currentLessonIndex > 0) {
      setCurrentLessonIndex(currentLessonIndex - 1);
      setShowExplanation(false);
      setSelectedAnswer(null);
      setExpandedFlag(null);
    }
  };

  const handleAnswerSelect = (option) => {
    setSelectedAnswer(option.id);
    setShowExplanation(true);
    if (option.correct) {
      setScore((prev) => prev + 1);
      Vibration.vibrate(60); // Short haptic for correct
    } else {
      Vibration.vibrate([0, 50, 100, 50]); // Double haptic for incorrect
    }
    setTotalQuestions((prev) => prev + 1);
  };

  const handlePracticeAnswer = (itemId, answer) => {
    Vibration.vibrate(40);
    setPracticeAnswers((prev) => ({
      ...prev,
      [itemId]: answer,
    }));
  };

  const handleChecklistToggle = (itemId) => {
    Vibration.vibrate(40);
    setChecklistItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const getCheckedCount = () => {
    return Object.values(checklistItems).filter(Boolean).length;
  };

  const renderInfoLesson = () => (
    <View style={styles.lessonContent}>
      <Text style={[styles.lessonTitle, { color: colors.text }]}>{currentLesson.title}</Text>
      <Text style={[styles.lessonText, { color: colors.text }]}>{currentLesson.content}</Text>
      {currentLesson.tip && (
        <View style={[styles.tipBox, { backgroundColor: module.color }]}>
          <Text style={styles.tipText}>{currentLesson.tip}</Text>
        </View>
      )}
    </View>
  );

  const renderInteractiveLesson = () => (
    <View style={styles.lessonContent}>
      <Text style={styles.lessonTitle}>{currentLesson.title}</Text>
      <Text style={styles.lessonSubtext}>{currentLesson.content}</Text>
      <View style={styles.flagsContainer}>
        {currentLesson.flags.map((flag, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.flagCard,
              expandedFlag === index && {
                borderColor: module.accentColor,
                borderWidth: 2,
              },
            ]}
            onPress={() => setExpandedFlag(expandedFlag === index ? null : index)}
          >
            <View style={styles.flagHeader}>
              <Text style={styles.flagIcon}>{flag.icon}</Text>
              <Text style={styles.flagTitle}>{flag.title}</Text>
              <Text style={styles.expandIcon}>
                {expandedFlag === index ? "▼" : "▶"}
              </Text>
            </View>
            {expandedFlag === index && (
              <View style={styles.flagDescription}>
                <Text style={styles.flagDescriptionText}>{flag.description}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderQuizLesson = () => (
    <View style={styles.lessonContent}>
      <Text style={styles.lessonTitle}>{currentLesson.title}</Text>

      {/* Scenario Display */}
      {currentLesson.scenario && currentLesson.scenario.from && (
        <View style={styles.emailPreview}>
          <View style={styles.emailHeader}>
            <Text style={styles.emailLabel}>From:</Text>
            <Text style={styles.emailValue}>{currentLesson.scenario.from}</Text>
          </View>
          <View style={styles.emailHeader}>
            <Text style={styles.emailLabel}>Subject:</Text>
            <Text style={styles.emailSubject}>{currentLesson.scenario.subject}</Text>
          </View>
          <View style={styles.emailBody}>
            <Text style={styles.emailBodyText}>{currentLesson.scenario.body}</Text>
          </View>
        </View>
      )}

      {currentLesson.scenario && currentLesson.scenario.urls && (
        <View style={styles.urlList}>
          {currentLesson.scenario.urls.map((url, index) => (
            <View key={index} style={styles.urlItem}>
              <Text style={styles.urlNumber}>{index + 1}.</Text>
              <Text style={styles.urlText}>{url}</Text>
            </View>
          ))}
        </View>
      )}

      {currentLesson.scenario && currentLesson.scenario.description && (
        <View style={styles.scenarioBox}>
          <Text style={styles.scenarioText}>{currentLesson.scenario.description}</Text>
        </View>
      )}

      <Text style={styles.questionText}>{currentLesson.question || "Question missing."}</Text>

      {/* Answer Options */}
      <View style={styles.optionsContainer}>
        {currentLesson.options && currentLesson.options.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.optionButton,
              selectedAnswer === option.id &&
                (option.correct ? styles.correctOption : styles.incorrectOption),
              selectedAnswer && selectedAnswer !== option.id && option.correct && styles.correctOption,
            ]}
            onPress={() => !selectedAnswer && handleAnswerSelect(option)}
            disabled={selectedAnswer !== null}
          >
            <Text
              style={[
                styles.optionText,
                selectedAnswer === option.id && styles.selectedOptionText,
              ]}
            >
              {option.text}
            </Text>
            {selectedAnswer && option.correct && (
              <Text style={styles.checkMark}>✓</Text>
            )}
            {selectedAnswer === option.id && !option.correct && (
              <Text style={styles.crossMark}>✗</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Explanation */}
      {showExplanation && (
        <View style={[styles.explanationBox, { backgroundColor: module.color }]}>
          <Text style={styles.explanationTitle}>
            {selectedAnswer &&
            currentLesson.options &&
            currentLesson.options.find((o) => o.id === selectedAnswer)?.correct
              ? "✓ Correct!"
              : "✗ Not quite right"}
          </Text>
          <Text style={styles.explanationText}>{currentLesson.explanation || ""}</Text>
        </View>
      )}
    </View>
  );

  const renderPracticeLesson = () => {
    if (currentLesson.emails) {
      return (
        <View style={styles.lessonContent}>
          <Text style={styles.lessonTitle}>{currentLesson.title}</Text>
          <Text style={styles.practiceInstruction}>
            Identify each email as Real or Phishing:
          </Text>
          {currentLesson.emails.map((email) => (
            <View key={email.id} style={styles.practiceEmailCard}>
              <View style={styles.practiceEmailHeader}>
                <Text style={styles.practiceFrom}>From: {email.from}</Text>
                <Text style={styles.practiceSubject}>{email.subject}</Text>
              </View>
              <Text style={styles.practicePreview}>{email.preview}</Text>

              <View style={styles.practiceButtons}>
                <TouchableOpacity
                  style={[
                    styles.practiceButton,
                    practiceAnswers[email.id] === "real" && styles.selectedPracticeButton,
                    practiceAnswers[email.id] === "real" && !email.isPhishing && styles.correctPractice,
                    practiceAnswers[email.id] === "real" && email.isPhishing && styles.incorrectPractice,
                  ]}
                  onPress={() => handlePracticeAnswer(email.id, "real")}
                >
                  <Text style={styles.practiceButtonText}>✓ Real</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.practiceButton,
                    practiceAnswers[email.id] === "phishing" && styles.selectedPracticeButton,
                    practiceAnswers[email.id] === "phishing" && email.isPhishing && styles.correctPractice,
                    practiceAnswers[email.id] === "phishing" && !email.isPhishing && styles.incorrectPractice,
                  ]}
                  onPress={() => handlePracticeAnswer(email.id, "phishing")}
                >
                  <Text style={styles.practiceButtonText}>⚠️ Phishing</Text>
                </TouchableOpacity>
              </View>

              {practiceAnswers[email.id] && (
                <View style={styles.practiceExplanation}>
                  <Text style={styles.practiceExplanationText}>
                    {email.explanation}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      );
    }

    if (currentLesson.websites) {
      return (
        <View style={styles.lessonContent}>
          <Text style={styles.lessonTitle}>{currentLesson.title}</Text>
          <Text style={styles.practiceInstruction}>
            Evaluate each website's trust indicators:
          </Text>
          {currentLesson.websites.map((site) => (
            <View key={site.id} style={styles.websiteCard}>
              <Text style={styles.websiteUrl}>{site.url}</Text>
              <View style={styles.indicatorsList}>
                <View style={styles.indicatorRow}>
                  <Text style={site.hasHttps ? styles.indicatorGood : styles.indicatorBad}>
                    {site.hasHttps ? "✓" : "✗"} HTTPS
                  </Text>
                  <Text style={site.hasContactInfo ? styles.indicatorGood : styles.indicatorBad}>
                    {site.hasContactInfo ? "✓" : "✗"} Contact Info
                  </Text>
                </View>
                <Text style={styles.designQuality}>Design: {site.designQuality}</Text>
              </View>

              <View style={styles.practiceButtons}>
                <TouchableOpacity
                  style={[
                    styles.practiceButton,
                    practiceAnswers[site.id] === "legit" && styles.selectedPracticeButton,
                    practiceAnswers[site.id] === "legit" && site.isLegit && styles.correctPractice,
                    practiceAnswers[site.id] === "legit" && !site.isLegit && styles.incorrectPractice,
                  ]}
                  onPress={() => handlePracticeAnswer(site.id, "legit")}
                >
                  <Text style={styles.practiceButtonText}>✓ Legitimate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.practiceButton,
                    practiceAnswers[site.id] === "fake" && styles.selectedPracticeButton,
                    practiceAnswers[site.id] === "fake" && !site.isLegit && styles.correctPractice,
                    practiceAnswers[site.id] === "fake" && site.isLegit && styles.incorrectPractice,
                  ]}
                  onPress={() => handlePracticeAnswer(site.id, "fake")}
                >
                  <Text style={styles.practiceButtonText}>⚠️ Fake</Text>
                </TouchableOpacity>
              </View>

              {practiceAnswers[site.id] && (
                <View style={styles.practiceExplanation}>
                  <Text style={styles.practiceExplanationText}>{site.explanation}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      );
    }

    if (currentLesson.checklist) {
      return (
        <View style={styles.lessonContent}>
          <Text style={styles.lessonTitle}>{currentLesson.title}</Text>
          <Text style={styles.practiceInstruction}>
            Check the security practices you currently follow:
          </Text>
          <View style={styles.checklistContainer}>
            {currentLesson.checklist.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.checklistItem}
                onPress={() => handleChecklistToggle(item.id)}
              >
                <View
                  style={[
                    styles.checkbox,
                    checklistItems[item.id] && styles.checkboxChecked,
                  ]}
                >
                  {checklistItems[item.id] && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <View style={styles.checklistTextContainer}>
                  <Text style={styles.checklistText}>{item.text}</Text>
                  <Text style={styles.checklistCategory}>{item.category}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.checklistScore}>
            <Text style={styles.checklistScoreText}>
              Your Security Score: {getCheckedCount()}/{currentLesson.checklist.length}
            </Text>
            <Text style={styles.checklistScoreHint}>
              {getCheckedCount() < 4
                ? "⚠️ Consider implementing more security practices"
                : getCheckedCount() < 7
                ? "👍 Good progress! Keep improving"
                : "🌟 Excellent security habits!"}
            </Text>
          </View>
        </View>
      );
    }

    return null;
  };

  const renderSummaryLesson = () => (
    <View style={styles.lessonContent}>
      <Text style={styles.lessonTitle}>{currentLesson.title}</Text>
      <View style={styles.summaryContainer}>
        {currentLesson.points.map((point, index) => (
          <View key={index} style={styles.summaryPoint}>
            <View style={[styles.summaryNumber, { backgroundColor: module.accentColor }]}>
              <Text style={styles.summaryNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.summaryText}>{point}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderLesson = () => {
    switch (currentLesson.type) {
      case "info":
        return renderInfoLesson();
      case "interactive":
        return renderInteractiveLesson();
      case "quiz":
        return renderQuizLesson();
      case "practice":
        return renderPracticeLesson();
      case "summary":
        return renderSummaryLesson();
      default:
        return renderInfoLesson();
    }
  };

  if (isLoadingData || !module) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <Text style={{ marginTop: 10, color: "#666" }}>Loading Module...</Text>
      </View>
    );
  }

  const currentLesson = module.lessons[currentLessonIndex];
  const progress = ((currentLessonIndex + 1) / module.lessons.length) * 100;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={module.accentColor} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: module.accentColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{module.title}</Text>
          <Text style={styles.headerMeta}>
            {module.duration} • {module.level}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%`, backgroundColor: module.accentColor },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {currentLessonIndex + 1} of {module.lessons.length}
        </Text>
      </View>

      {/* Lesson Content */}
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {renderLesson()}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navButtons}>
        <TouchableOpacity
          style={[styles.navButton, styles.prevButton]}
          onPress={handlePrevious}
          disabled={currentLessonIndex === 0}
        >
          <Text
            style={[
              styles.navButtonText,
              currentLessonIndex === 0 && styles.navButtonDisabled,
            ]}
          >
            ← Previous
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, styles.nextButton, { backgroundColor: module.accentColor }]}
          onPress={handleNext}
        >
          <Text style={styles.nextButtonText}>
            {currentLessonIndex === module.lessons.length - 1 ? "Complete ✓" : "Next →"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Completion Modal */}
      <Modal visible={showCompletionModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalIcon}>🎉</Text>
            <Text style={styles.modalTitle}>Module Complete!</Text>
            <Text style={styles.modalSubtitle}>{module.title}</Text>
            {totalQuestions > 0 && (
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreText}>
                  Quiz Score: {score}/{totalQuestions}
                </Text>
                <Text style={styles.scorePercentage}>
                  {Math.round((score / totalQuestions) * 100)}%
                </Text>
              </View>
            )}
            <Text style={styles.modalMessage}>
              Great job! You've completed this learning module. Practice these skills
              regularly to stay safe online.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: module.accentColor }]}
              onPress={() => {
                setShowCompletionModal(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.modalButtonText}>Back to Learning Hub</Text>
            </TouchableOpacity>
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
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
  },
  headerInfo: {
    alignItems: "center",
  },
  headerTitle: {
    color: "#000",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  headerMeta: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: 5,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    marginRight: 10,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  scrollContent: {
    flex: 1,
  },
  lessonContent: {
    padding: 20,
  },
  lessonTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000",
    marginBottom: 15,
  },
  lessonText: {
    fontSize: 16,
    color: "#000",
    fontWeight: "bold",
    lineHeight: 26,
    marginBottom: 20,
  },
  lessonSubtext: {
    fontSize: 14,
    color: "#000",
    fontWeight: "bold",
    marginBottom: 15,
  },
  tipBox: {
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  tipText: {
    fontSize: 15,
    color: "#333",
    fontWeight: "500",
  },
  flagsContainer: {
    marginTop: 10,
  },
  flagCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  flagHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  flagIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  flagTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  expandIcon: {
    fontSize: 12,
    color: "#666",
  },
  flagDescription: {
    padding: 15,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    marginTop: 5,
    paddingTop: 15,
  },
  flagDescriptionText: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
  },
  emailPreview: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  emailHeader: {
    flexDirection: "row",
    marginBottom: 8,
  },
  emailLabel: {
    fontSize: 12,
    color: "#888",
    width: 60,
    fontWeight: "600",
  },
  emailValue: {
    fontSize: 12,
    color: "#d93025",
    flex: 1,
  },
  emailSubject: {
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
    flex: 1,
  },
  emailBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  emailBodyText: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
  },
  urlList: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  urlItem: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-start",
  },
  urlNumber: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#666",
    marginRight: 10,
    width: 20,
  },
  urlText: {
    fontSize: 13,
    color: "#333",
    flex: 1,
    fontFamily: "monospace",
  },
  scenarioBox: {
    backgroundColor: "#fff3cd",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  scenarioText: {
    fontSize: 14,
    color: "#856404",
    lineHeight: 20,
  },
  questionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  optionsContainer: {
    marginBottom: 20,
  },
  optionButton: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  optionText: {
    fontSize: 15,
    color: "#333",
    flex: 1,
  },
  selectedOptionText: {
    fontWeight: "600",
  },
  correctOption: {
    borderColor: "#34a853",
    backgroundColor: "#e6f4ea",
  },
  incorrectOption: {
    borderColor: "#d93025",
    backgroundColor: "#fce8e6",
  },
  checkMark: {
    fontSize: 18,
    color: "#34a853",
    fontWeight: "bold",
  },
  crossMark: {
    fontSize: 18,
    color: "#d93025",
    fontWeight: "bold",
  },
  explanationBox: {
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  explanationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  explanationText: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
  },
  practiceInstruction: {
    fontSize: 14,
    color: "#666",
    marginBottom: 15,
  },
  practiceEmailCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
  },
  practiceEmailHeader: {
    marginBottom: 10,
  },
  practiceFrom: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  practiceSubject: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  practicePreview: {
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
    marginBottom: 15,
  },
  practiceButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  practiceButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    marginHorizontal: 5,
  },
  selectedPracticeButton: {
    backgroundColor: "#ddd",
  },
  correctPractice: {
    backgroundColor: "#d4edda",
  },
  incorrectPractice: {
    backgroundColor: "#f8d7da",
  },
  practiceButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  practiceExplanation: {
    marginTop: 12,
    padding: 10,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
  },
  practiceExplanationText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
  },
  websiteCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
  },
  websiteUrl: {
    fontSize: 14,
    fontFamily: "monospace",
    color: "#1a73e8",
    marginBottom: 10,
  },
  indicatorsList: {
    marginBottom: 15,
  },
  indicatorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  indicatorGood: {
    fontSize: 13,
    color: "#34a853",
  },
  indicatorBad: {
    fontSize: 13,
    color: "#d93025",
  },
  designQuality: {
    fontSize: 13,
    color: "#666",
  },
  checklistContainer: {
    marginBottom: 20,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ddd",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#34a853",
    borderColor: "#34a853",
  },
  checkboxMark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  checklistTextContainer: {
    flex: 1,
  },
  checklistText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 2,
  },
  checklistCategory: {
    fontSize: 12,
    color: "#888",
  },
  checklistScore: {
    backgroundColor: "#e8f0fe",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  checklistScoreText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1a73e8",
  },
  checklistScoreHint: {
    fontSize: 14,
    color: "#666",
    marginTop: 5,
  },
  summaryContainer: {
    marginTop: 10,
  },
  summaryPoint: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 15,
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
  },
  summaryNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  summaryNumberText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  summaryText: {
    flex: 1,
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
  },
  navButtons: {
    flexDirection: "row",
    padding: 20,
    paddingBottom: 30,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  navButton: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  prevButton: {
    marginRight: 10,
    backgroundColor: "#f0f0f0",
  },
  nextButton: {
    marginLeft: 10,
  },
  navButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  navButtonDisabled: {
    color: "#bbb",
  },
  nextButtonText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
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
    marginBottom: 5,
  },
  modalSubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 15,
  },
  scoreContainer: {
    backgroundColor: "#e8f0fe",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 15,
    width: "100%",
  },
  scoreText: {
    fontSize: 16,
    color: "#1a73e8",
    fontWeight: "600",
  },
  scorePercentage: {
    fontSize: 28,
    color: "#1a73e8",
    fontWeight: "bold",
    marginTop: 5,
  },
  modalMessage: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  modalButton: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default LearningModuleScreen;
