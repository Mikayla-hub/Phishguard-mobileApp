import { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { login, setAuthToken } from "../services/api";
import { Mail, Lock, Eye, EyeOff } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (email === "" || password === "") {
      Alert.alert("Error", "Please enter both email and password.");
      return;
    }

    try {
      console.log(`\n[Troubleshooting] Attempting login for: ${email}`);
      const response = await login(email, password);
      if (response?.token) {
        setAuthToken(response.token);
        await AsyncStorage.setItem("token", response.token);
        if (response.user?.name) {
          await AsyncStorage.setItem("username", response.user.name);
        }
      }
      console.log("[Troubleshooting] Login successful.");
      navigation.replace("Homescreen");
    } catch (error) {
      console.error("\n[Troubleshooting] Login error caught!");
      console.error("-> Message:", error?.message);
      console.error("-> Name:", error?.name);
      console.error("-> Full Error:", error);
      Alert.alert(
        "Login failed",
        error?.message || "Unable to log in. Please check your credentials and try again."
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      {/* App Logo/Header Area */}
      <View style={styles.headerContainer}>
        <Text style={styles.appName}>CyberGuardian</Text>
        <Text style={styles.tagline}>AI-Powered Phishing Response and Learning Hub</Text>
      </View>

      {/* Login Form */}
      <View style={styles.formContainer}>
        <Text style={styles.label}>Email Address</Text>
        <View style={styles.inputContainer}>
          <Mail size={20} color="#666" style={styles.leadingIcon} />
          <TextInput
            style={styles.input}
            placeholder="user@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputContainer}>
          <Lock size={20} color="#666" style={styles.leadingIcon} />
          <TextInput
            style={styles.input}
            placeholder="********"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
            {showPassword ? <EyeOff size={20} color="#666" /> : <Eye size={20} color="#666" />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleLogin} style={styles.loginButton}>
          <Text style={styles.loginButtonText}>Secure Login</Text>
        </TouchableOpacity>

      
        <TouchableOpacity
          onPress={() => console.log("Navigate to Forgot Password")}
        >
          <Text style={styles.forgotPassword}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      {/* Footer / Sign Up Link */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>New to CyberGuardian? </Text>
        <TouchableOpacity onPress={() => navigation.navigate("SignUpScreen")}>
          <Text style={styles.signupLink}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa", // Light, clean background
    justifyContent: "center",
    padding: 20,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  appName: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1a73e8", // Trustworthy Blue
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 14,
    color: "#5f6368",
    marginTop: 5,
  },
  formContainer: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 10,
    elevation: 4, // Android shadow
    shadowColor: "#000", // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 5,
    marginTop: 10,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fafafa",
  },
  leadingIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 12,
  },
  loginButton: {
    backgroundColor: "#1a73e8",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 25,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  forgotPassword: {
    color: "#1a73e8",
    textAlign: "center",
    marginTop: 15,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 30,
  },
  footerText: {
    color: "#555",
  },
  signupLink: {
    color: "#1a73e8",
    fontWeight: "bold",
  },
});

export default LoginScreen;
