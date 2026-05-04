import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { register, setAuthToken } from "../services/api";
import { Eye, EyeOff } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getPasswordChecks = (password) => [
  { label: "At least 8 characters",      passed: password.length >= 8 },
  { label: "One uppercase letter (A–Z)",  passed: /[A-Z]/.test(password) },
  { label: "One lowercase letter (a–z)",  passed: /[a-z]/.test(password) },
  { label: "One number (0–9)",            passed: /[0-9]/.test(password) },
  { label: "One special character (!@#$%…)", passed: /[^A-Za-z0-9]/.test(password) },
];

const getStrengthColor = (score) => {
  if (score <= 1) return "#d93025";
  if (score <= 3) return "#f9ab00";
  return "#34a853";
};

const getStrengthLabel = (score) => {
  if (score <= 1) return "Weak";
  if (score <= 3) return "Fair";
  if (score === 4) return "Good";
  return "Strong";
};

const SignUpScreen = ({ navigation }) => {
  const [fullName, setFullName]                     = useState("");
  const [email, setEmail]                           = useState("");
  const [password, setPassword]                     = useState("");
  const [confirmPassword, setConfirmPassword]       = useState("");
  const [isLoading, setIsLoading]                   = useState(false);
  const [showPassword, setShowPassword]             = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailError, setEmailError]                 = useState("");

  const passwordChecks = getPasswordChecks(password);
  const strengthScore  = passwordChecks.filter((c) => c.passed).length;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleEmailChange = (text) => {
    setEmail(text);
    if (text.length > 0 && !isValidEmail(text)) {
      setEmailError("Please enter a valid email address.");
    } else {
      setEmailError("");
    }
  };

  const handleSignUp = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    if (strengthScore < 5) {
      Alert.alert("Weak Password", "Your password does not meet all the requirements listed below.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    try {
      setIsLoading(true);
      const response = await register(fullName, email, password);
      if (response?.token) {
        setAuthToken(response.token);
        await AsyncStorage.setItem("token", response.token);
        if (response.user?.name) {
          await AsyncStorage.setItem("username", response.user.name);
        }
      }
      Alert.alert("Account Created! 🎉", "Welcome to CyberGuardian. Please log in.", [
        { text: "Go to Login", onPress: () => navigation.navigate("LoginScreen") },
      ]);
    } catch (error) {
      Alert.alert("Registration Failed", error?.message || "Unable to create account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.appName}>Join CyberGuardian</Text>
          <Text style={styles.tagline}>Start your cybersecurity journey today</Text>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>

          {/* Full Name */}
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Cynthia Ncube"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          {/* Email */}
          <Text style={[styles.label, { marginTop: 16 }]}>Email Address</Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            placeholder="user@example.com"
            value={email}
            onChangeText={handleEmailChange}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          {/* Password */}
          <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Create a strong password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              {showPassword ? <EyeOff size={20} color="#666" /> : <Eye size={20} color="#666" />}
            </TouchableOpacity>
          </View>

          {/* Strength Meter */}
          {password.length > 0 && (
            <View style={styles.strengthContainer}>
              {/* Bar */}
              <View style={styles.strengthBarTrack}>
                <View
                  style={[
                    styles.strengthBarFill,
                    {
                      width: `${(strengthScore / 5) * 100}%`,
                      backgroundColor: getStrengthColor(strengthScore),
                    },
                  ]}
                />
              </View>
              <Text style={[styles.strengthLabel, { color: getStrengthColor(strengthScore) }]}>
                {getStrengthLabel(strengthScore)}
              </Text>
              {/* Checklist */}
              {passwordChecks.map((check) => (
                <View key={check.label} style={styles.checkRow}>
                  <Text style={check.passed ? styles.checkPass : styles.checkFail}>
                    {check.passed ? "✓" : "✗"}
                  </Text>
                  <Text style={[styles.checkLabel, { color: check.passed ? "#34a853" : "#888" }]}>
                    {check.label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Confirm Password */}
          <Text style={[styles.label, { marginTop: 16 }]}>Confirm Password</Text>
          <View
            style={[
              styles.passwordContainer,
              passwordsMismatch ? styles.inputError : null,
              passwordsMatch   ? styles.inputSuccess : null,
            ]}
          >
            <TextInput
              style={styles.passwordInput}
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
              {showConfirmPassword ? <EyeOff size={20} color="#666" /> : <Eye size={20} color="#666" />}
            </TouchableOpacity>
          </View>
          {passwordsMismatch && <Text style={styles.fieldError}>Passwords do not match.</Text>}
          {passwordsMatch    && <Text style={styles.fieldSuccess}>Passwords match ✓</Text>}

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSignUp}
            style={[styles.signupButton, isLoading && { opacity: 0.7 }]}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.signupButtonText}>Create Account</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("LoginScreen")}>
            <Text style={styles.loginLink}>Log In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f7fa" },
  scrollContainer: { flexGrow: 1, justifyContent: "center", padding: 20 },
  headerContainer: { alignItems: "center", marginBottom: 28 },
  appName:  { fontSize: 28, fontWeight: "bold", color: "#1a73e8", letterSpacing: 0.5 },
  tagline:  { fontSize: 13, color: "#5f6368", marginTop: 5, textAlign: "center" },
  formContainer: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  inputError:   { borderColor: "#d93025" },
  inputSuccess: { borderColor: "#34a853" },
  fieldError:   { color: "#d93025", fontSize: 12, marginTop: 4 },
  fieldSuccess: { color: "#34a853", fontSize: 12, marginTop: 4 },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fafafa",
  },
  passwordInput: { flex: 1, padding: 12, fontSize: 16 },
  eyeIcon: { padding: 12 },
  strengthContainer: { marginTop: 10 },
  strengthBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
    marginBottom: 6,
  },
  strengthBarFill: { height: "100%", borderRadius: 3 },
  strengthLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  checkPass: { color: "#34a853", fontWeight: "bold", fontSize: 13, width: 18 },
  checkFail: { color: "#d93025", fontWeight: "bold", fontSize: 13, width: 18 },
  checkLabel: { fontSize: 12 },
  signupButton: {
    backgroundColor: "#34a853",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
  },
  signupButtonText: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 28, marginBottom: 20 },
  footerText: { color: "#555" },
  loginLink: { color: "#1a73e8", fontWeight: "bold" },
});

export default SignUpScreen;
