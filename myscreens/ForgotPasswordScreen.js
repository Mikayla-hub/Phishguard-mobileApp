import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { forgotPassword } from "../services/api";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react-native";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail]           = useState("");
  const [isLoading, setIsLoading]   = useState(false);
  const [emailError, setEmailError] = useState("");
  const [resetSent, setResetSent]   = useState(false);

  const handleEmailChange = (text) => {
    setEmail(text);
    setEmailError(text.length > 0 && !isValidEmail(text) ? "Please enter a valid email address." : "");
  };

  const handleSendResetLink = async () => {
    if (!email) { 
      Alert.alert("Required", "Please enter your email address."); 
      return; 
    }
    if (!isValidEmail(email)) { 
      Alert.alert("Invalid Email", "Please enter a valid email address."); 
      return; 
    }
    try {
      setIsLoading(true);
      await forgotPassword(email);
      setResetSent(true);
    } catch (error) {
      Alert.alert("Error", error?.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setResetSent(false);
    setEmail("");
    navigation.goBack();
  };

  if (resetSent) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <CheckCircle size={48} color="#34a853" />
          </View>
          <Text style={styles.title}>Check Your Email! ✅</Text>
          <Text style={styles.subtitle}>
            We've sent a password reset link to {"\n"}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

          <View style={styles.instructionBox}>
            <Text style={styles.instructionTitle}>What to do next:</Text>
            <View style={styles.instructionStep}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepText}>Check your email inbox (and spam folder)</Text>
            </View>
            <View style={styles.instructionStep}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepText}>Click the "Reset Password" button in the email</Text>
            </View>
            <View style={styles.instructionStep}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.stepText}>Set your new password on the secure page</Text>
            </View>
            <View style={styles.instructionStep}>
              <Text style={styles.stepNumber}>4</Text>
              <Text style={styles.stepText}>Return to PhishGuard and log in with your new password</Text>
            </View>
          </View>

          <Text style={styles.note}>
            ⏱️ The reset link expires in <Text style={styles.noteBold}>1 hour</Text>
          </Text>

          <TouchableOpacity style={styles.backButton} onPress={handleBackToLogin}>
            <Text style={styles.backButtonText}>← Back to Login</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <TouchableOpacity style={styles.backNav} onPress={() => navigation.goBack()}>
        <ArrowLeft size={22} color="#1a73e8" />
        <Text style={styles.backText}>Back to Login</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconEmoji}>🔑</Text>
        </View>
        <Text style={styles.title}>Forgot Password?</Text>
        <Text style={styles.subtitle}>
          Enter the email linked to your account. We'll send a password reset link.
        </Text>

        <View style={styles.formContainer}>
          <Text style={styles.label}>Email Address</Text>
          <View style={[styles.inputRow, emailError ? styles.inputError : null]}>
            <Mail size={20} color={emailError ? "#d93025" : "#666"} style={styles.leadingIcon} />
            <TextInput
              style={styles.input}
              placeholder="user@example.com"
              value={email}
              onChangeText={handleEmailChange}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          <TouchableOpacity 
            style={[styles.sendButton, isLoading && {opacity:0.7}]} 
            onPress={handleSendResetLink} 
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.securityNote}>
          🔒 Password reset link will be sent to your registered email. We never share your information.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container:       { flex:1, backgroundColor:"#f5f7fa", padding:20 },
  backNav:         { flexDirection:"row", alignItems:"center", marginTop:50, marginBottom:30 },
  backText:        { color:"#1a73e8", fontSize:15, marginLeft:6, fontWeight:"500" },
  content:         { alignItems:"center" },
  iconCircle:      { width:80, height:80, borderRadius:40, backgroundColor:"#e8f0fe", justifyContent:"center", alignItems:"center", marginBottom:20 },
  iconEmoji:       { fontSize:36 },
  title:           { fontSize:26, fontWeight:"bold", color:"#333", marginBottom:10 },
  subtitle:        { fontSize:14, color: "#555", textAlign:"center", lineHeight:22, marginBottom:30, paddingHorizontal:10 },
  emailHighlight:  { color:"#1a73e8", fontWeight:"600" },
  formContainer:   { width:"100%", backgroundColor:"#fff", borderRadius:12, padding:20, elevation:4, shadowColor:"#000", shadowOffset:{width:0,height:2}, shadowOpacity:0.08, shadowRadius:4 },
  label:           { fontSize:14, fontWeight:"600", color:"#333", marginBottom:6 },
  inputRow:        { flexDirection:"row", alignItems:"center", borderWidth:1, borderColor:"#ddd", borderRadius:8, backgroundColor:"#fafafa" },
  inputError:      { borderColor:"#d93025" },
  leadingIcon:     { marginLeft:12 },
  input:           { flex:1, padding:12, fontSize:16 },
  fieldError:      { color:"#d93025", fontSize:12, marginTop:4 },
  sendButton:      { backgroundColor:"#1a73e8", padding:15, borderRadius:8, alignItems:"center", marginTop:20 },
  sendButtonText:  { color:"#fff", fontSize:17, fontWeight:"bold" },
  securityNote:    { color: "#555", fontSize:12, marginTop:20, textAlign:"center", fontStyle:"italic" },
  // Success screen styles
  instructionBox:  { width:"100%", backgroundColor:"#f0f9ff", borderRadius:12, padding:20, marginBottom:24, borderLeftWidth:4, borderLeftColor:"#34a853" },
  instructionTitle:{ fontSize:16, fontWeight:"bold", color:"#333", marginBottom:16 },
  instructionStep: { flexDirection:"row", alignItems:"flex-start", marginBottom:12 },
  stepNumber:      { width:28, height:28, borderRadius:14, backgroundColor:"#34a853", color:"#fff", fontWeight:"bold", textAlign:"center", paddingTop:2, marginRight:12, fontSize:16 },
  stepText:        { flex:1, fontSize:14, color:"#333", lineHeight:20 },
  note:            { fontSize:13, color:"#f9ab00", fontWeight:"600", marginBottom:24 },
  noteBold:        { fontWeight:"bold", color:"#f9ab00" },
  backButton:      { backgroundColor:"#e8f0fe", padding:12, borderRadius:8, alignItems:"center", width:"100%" },
  backButtonText:  { color:"#1a73e8", fontSize:16, fontWeight:"600" },
});

export default ForgotPasswordScreen;
