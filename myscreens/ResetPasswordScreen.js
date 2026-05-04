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
import { resetPassword } from "../services/api";
import { Eye, EyeOff, ArrowLeft } from "lucide-react-native";

const getPasswordChecks = (pw) => [
  { label: "At least 8 characters",         passed: pw.length >= 8 },
  { label: "One uppercase letter (A–Z)",     passed: /[A-Z]/.test(pw) },
  { label: "One lowercase letter (a–z)",     passed: /[a-z]/.test(pw) },
  { label: "One number (0–9)",               passed: /[0-9]/.test(pw) },
  { label: "One special character (!@#$%…)", passed: /[^A-Za-z0-9]/.test(pw) },
];

const getStrengthColor = (s) => s <= 1 ? "#d93025" : s <= 3 ? "#f9ab00" : "#34a853";
const getStrengthLabel = (s) => s <= 1 ? "Weak" : s <= 3 ? "Fair" : s === 4 ? "Good" : "Strong";

const ResetPasswordScreen = ({ navigation, route }) => {
  const emailFromParams = route?.params?.email || "";

  const [otp, setOtp]                         = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw]                   = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [isLoading, setIsLoading]             = useState(false);

  const checks        = getPasswordChecks(newPassword);
  const strengthScore = checks.filter((c) => c.passed).length;
  const pwMatch       = confirmPassword.length > 0 && newPassword === confirmPassword;
  const pwMismatch    = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleReset = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert("Invalid Code", "Please enter the 6-digit code sent to your email.");
      return;
    }
    if (strengthScore < 5) {
      Alert.alert("Weak Password", "Your password must meet all the requirements listed.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }
    try {
      setIsLoading(true);
      await resetPassword(emailFromParams, otp, newPassword);
      Alert.alert("Password Reset! ✅", "Your password has been updated. Please log in.", [
        { text: "Go to Login", onPress: () => navigation.navigate("LoginScreen") },
      ]);
    } catch (error) {
      Alert.alert("Reset Failed", error?.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color="#1a73e8" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.iconCircle}>
          <Text style={styles.iconEmoji}>🔒</Text>
        </View>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to{"\n"}
          <Text style={styles.emailHighlight}>{emailFromParams}</Text>
        </Text>

        <View style={styles.formContainer}>
          {/* OTP */}
          <Text style={styles.label}>6-Digit Reset Code</Text>
          <TextInput
            style={[styles.input, styles.otpInput]}
            placeholder="• • • • • •"
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            textAlign="center"
          />

          {/* New Password */}
          <Text style={[styles.label, { marginTop: 18 }]}>New Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputFlex}
              placeholder="Create a strong password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeIcon}>
              {showPw ? <EyeOff size={20} color="#666" /> : <Eye size={20} color="#666" />}
            </TouchableOpacity>
          </View>

          {/* Strength Meter */}
          {newPassword.length > 0 && (
            <View style={styles.strengthContainer}>
              <View style={styles.strengthTrack}>
                <View style={[styles.strengthFill, { width: `${(strengthScore/5)*100}%`, backgroundColor: getStrengthColor(strengthScore) }]} />
              </View>
              <Text style={[styles.strengthLabel, { color: getStrengthColor(strengthScore) }]}>
                {getStrengthLabel(strengthScore)}
              </Text>
              {checks.map((c) => (
                <View key={c.label} style={styles.checkRow}>
                  <Text style={c.passed ? styles.checkPass : styles.checkFail}>{c.passed ? "✓" : "✗"}</Text>
                  <Text style={[styles.checkText, { color: c.passed ? "#34a853" : "#888" }]}>{c.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Confirm Password */}
          <Text style={[styles.label, { marginTop: 18 }]}>Confirm New Password</Text>
          <View style={[styles.inputRow, pwMismatch ? styles.inputError : pwMatch ? styles.inputSuccess : null]}>
            <TextInput
              style={styles.inputFlex}
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
            />
            <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeIcon}>
              {showConfirm ? <EyeOff size={20} color="#666" /> : <Eye size={20} color="#666" />}
            </TouchableOpacity>
          </View>
          {pwMismatch && <Text style={styles.fieldError}>Passwords do not match.</Text>}
          {pwMatch    && <Text style={styles.fieldSuccess}>Passwords match ✓</Text>}

          {/* Submit */}
          <TouchableOpacity style={[styles.resetButton, isLoading && { opacity:0.7 }]} onPress={handleReset} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.resetButtonText}>Update Password</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.resendNote}>
          Didn't receive a code?{" "}
          <Text style={styles.resendLink} onPress={() => navigation.navigate("ForgotPasswordScreen")}>
            Resend
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container:        { flex:1, backgroundColor:"#f5f7fa" },
  scroll:           { flexGrow:1, padding:20, alignItems:"center" },
  backButton:       { flexDirection:"row", alignItems:"center", alignSelf:"flex-start", marginTop:40, marginBottom:20 },
  backText:         { color:"#1a73e8", fontSize:15, marginLeft:6, fontWeight:"500" },
  iconCircle:       { width:80, height:80, borderRadius:40, backgroundColor:"#e8f0fe", justifyContent:"center", alignItems:"center", marginBottom:16 },
  iconEmoji:        { fontSize:36 },
  title:            { fontSize:26, fontWeight:"bold", color:"#333", marginBottom:8 },
  subtitle:         { fontSize:14, color:"#666", textAlign:"center", lineHeight:22, marginBottom:28 },
  emailHighlight:   { color:"#1a73e8", fontWeight:"600" },
  formContainer:    { width:"100%", backgroundColor:"#fff", borderRadius:12, padding:20, elevation:4, shadowColor:"#000", shadowOffset:{width:0,height:2}, shadowOpacity:0.08, shadowRadius:4 },
  label:            { fontSize:14, fontWeight:"600", color:"#333", marginBottom:6 },
  input:            { borderWidth:1, borderColor:"#ddd", borderRadius:8, padding:12, fontSize:16, backgroundColor:"#fafafa" },
  otpInput:         { fontSize:28, fontWeight:"bold", letterSpacing:10, color:"#1a73e8" },
  inputRow:         { flexDirection:"row", alignItems:"center", borderWidth:1, borderColor:"#ddd", borderRadius:8, backgroundColor:"#fafafa" },
  inputError:       { borderColor:"#d93025" },
  inputSuccess:     { borderColor:"#34a853" },
  inputFlex:        { flex:1, padding:12, fontSize:16 },
  eyeIcon:          { padding:12 },
  fieldError:       { color:"#d93025", fontSize:12, marginTop:4 },
  fieldSuccess:     { color:"#34a853", fontSize:12, marginTop:4 },
  strengthContainer:{ marginTop:10 },
  strengthTrack:    { height:6, borderRadius:3, backgroundColor:"#e0e0e0", overflow:"hidden", marginBottom:6 },
  strengthFill:     { height:"100%", borderRadius:3 },
  strengthLabel:    { fontSize:12, fontWeight:"700", marginBottom:6 },
  checkRow:         { flexDirection:"row", alignItems:"center", marginBottom:2 },
  checkPass:        { color:"#34a853", fontWeight:"bold", fontSize:13, width:18 },
  checkFail:        { color:"#d93025", fontWeight:"bold", fontSize:13, width:18 },
  checkText:        { fontSize:12 },
  resetButton:      { backgroundColor:"#1a73e8", padding:15, borderRadius:8, alignItems:"center", marginTop:24 },
  resetButtonText:  { color:"#fff", fontSize:17, fontWeight:"bold" },
  resendNote:       { color:"#888", fontSize:13, marginTop:24, textAlign:"center" },
  resendLink:       { color:"#1a73e8", fontWeight:"600" },
});

export default ResetPasswordScreen;
