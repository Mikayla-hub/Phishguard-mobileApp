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
import { Mail, ArrowLeft } from "lucide-react-native";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail]           = useState("");
  const [isLoading, setIsLoading]   = useState(false);
  const [emailError, setEmailError] = useState("");

  const handleEmailChange = (text) => {
    setEmail(text);
    setEmailError(text.length > 0 && !isValidEmail(text) ? "Please enter a valid email address." : "");
  };

  const handleSendCode = async () => {
    if (!email) { Alert.alert("Required", "Please enter your email address."); return; }
    if (!isValidEmail(email)) { Alert.alert("Invalid Email", "Please enter a valid email address."); return; }
    try {
      setIsLoading(true);
      await forgotPassword(email);
      navigation.navigate("ResetPasswordScreen", { email });
    } catch (error) {
      Alert.alert("Error", error?.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <ArrowLeft size={22} color="#1a73e8" />
        <Text style={styles.backText}>Back to Login</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconEmoji}>🔑</Text>
        </View>
        <Text style={styles.title}>Forgot Password?</Text>
        <Text style={styles.subtitle}>
          Enter the email linked to your account. We'll send a 6-digit reset code that expires in 15 minutes.
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

          <TouchableOpacity style={[styles.sendButton, isLoading && {opacity:0.7}]} onPress={handleSendCode} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>Send Reset Code</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>
          Already have a code?{" "}
          <Text style={styles.noteLink} onPress={() => navigation.navigate("ResetPasswordScreen", { email })}>
            Enter it here
          </Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container:    { flex:1, backgroundColor:"#f5f7fa", padding:20 },
  backButton:   { flexDirection:"row", alignItems:"center", marginTop:50, marginBottom:30 },
  backText:     { color:"#1a73e8", fontSize:15, marginLeft:6, fontWeight:"500" },
  content:      { alignItems:"center" },
  iconCircle:   { width:80, height:80, borderRadius:40, backgroundColor:"#e8f0fe", justifyContent:"center", alignItems:"center", marginBottom:20 },
  iconEmoji:    { fontSize:36 },
  title:        { fontSize:26, fontWeight:"bold", color:"#333", marginBottom:10 },
  subtitle:     { fontSize:14, color: "#333", textAlign:"center", lineHeight:22, marginBottom:30, paddingHorizontal:10 },
  formContainer:{ width:"100%", backgroundColor:"#fff", borderRadius:12, padding:20, elevation:4, shadowColor:"#000", shadowOffset:{width:0,height:2}, shadowOpacity:0.08, shadowRadius:4 },
  label:        { fontSize:14, fontWeight:"600", color:"#333", marginBottom:6 },
  inputRow:     { flexDirection:"row", alignItems:"center", borderWidth:1, borderColor:"#ddd", borderRadius:8, backgroundColor:"#fafafa" },
  inputError:   { borderColor:"#d93025" },
  leadingIcon:  { marginLeft:12 },
  input:        { flex:1, padding:12, fontSize:16 },
  fieldError:   { color:"#d93025", fontSize:12, marginTop:4 },
  sendButton:   { backgroundColor:"#1a73e8", padding:15, borderRadius:8, alignItems:"center", marginTop:20 },
  sendButtonText:{ color:"#fff", fontSize:17, fontWeight:"bold" },
  note:         { color: "#444", fontSize:13, marginTop:24, textAlign:"center" },
  noteLink:     { color:"#1a73e8", fontWeight:"600" },
});

export default ForgotPasswordScreen;
