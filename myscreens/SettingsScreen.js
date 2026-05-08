import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, Switch, TouchableOpacity,
  ScrollView, TextInput, Alert, Modal, ActivityIndicator, StatusBar,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../contexts/ThemeContext";
import {
  getProfile, updateProfile, changePassword,
  deleteAccount, clearAuthToken, BASE_URL,
} from "../services/api";
import {
  setNotificationsEnabled, getNotificationsEnabled, initDailySecurityTip,
} from "../services/notificationService";

// ─── helpers ────────────────────────────────────────────────────────────────

const SectionHeader = ({ title, icon }) => (
  <View style={s.sectionHeader}>
    <Text style={s.sectionIcon}>{icon}</Text>
    <Text style={s.sectionTitle}>{title}</Text>
  </View>
);

const SettingRow = ({ icon, title, desc, onPress, right, danger = false, colors }) => (
  <TouchableOpacity
    style={[s.row, { backgroundColor: colors.card, borderColor: colors.border }]}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress}
  >
    <View style={[s.rowIconBox, { backgroundColor: danger ? "#fce8e6" : colors.background }]}>
      <Text style={s.rowIcon}>{icon}</Text>
    </View>
    <View style={s.rowBody}>
      <Text style={[s.rowTitle, { color: danger ? "#d93025" : colors.text }]}>{title}</Text>
      {desc ? <Text style={[s.rowDesc, { color: colors.subtext }]}>{desc}</Text> : null}
    </View>
    {right ?? (onPress ? <Text style={[s.rowChevron, { color: colors.subtext }]}>›</Text> : null)}
  </TouchableOpacity>
);

// ─── main component ──────────────────────────────────────────────────────────

export default function SettingsScreen({ navigation }) {
  const { isDarkMode, toggleTheme, colors } = useTheme();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [notifsEnabled, setNotifsEnabled]   = useState(true);
  const [todayTip, setTodayTip]             = useState(null);

  // modals
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [changePassModal, setChangePassModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);

  // edit profile form
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // change password form
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  // delete confirm
  const [deleteText, setDeleteText] = useState("");

  const [saving, setSaving] = useState(false);

  // ── Load profile from backend ─────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await getProfile();
      if (res?.user) {
        setDisplayName(res.user.name || "");
        setEmail(res.user.email || "");
        setEditName(res.user.name || "");
        setEditEmail(res.user.email || "");
        // Persist locally for greeting display
        await AsyncStorage.setItem("username", res.user.name || "");
        await AsyncStorage.setItem("email", res.user.email || "");
      }
    } catch {
      // Fallback to cached values
      const n = await AsyncStorage.getItem("username");
      const e = await AsyncStorage.getItem("email");
      if (n) { setDisplayName(n); setEditName(n); }
      if (e) { setEmail(e); setEditEmail(e); }
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    getNotificationsEnabled().then(setNotifsEnabled);
    // Fetch today's AI tip for the preview card
    fetch(`${BASE_URL}/api/notifications/daily-tip`)
      .then(r => r.json())
      .then(d => { if (d?.tip) setTodayTip(d.tip); })
      .catch(() => {});
  }, [loadProfile]);

  // ── Save profile ──────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!editName.trim()) { Alert.alert("Error", "Name cannot be empty."); return; }
    setSaving(true);
    try {
      const res = await updateProfile(editName.trim(), editEmail.trim());
      setDisplayName(res.user?.name || editName.trim());
      setEmail(res.user?.email || editEmail.trim());
      await AsyncStorage.setItem("username", res.user?.name || editName.trim());
      await AsyncStorage.setItem("email", res.user?.email || editEmail.trim());
      setEditProfileModal(false);
      Alert.alert("✅ Profile Updated", "Your name and email have been saved.");
    } catch (e) {
      Alert.alert("Error", e?.message || "Could not update profile.");
    } finally { setSaving(false); }
  };

  // ── Change password ───────────────────────────────────────────────────────

  const handleChangePassword = async () => {
    if (!currentPass || !newPass) { Alert.alert("Error", "Please fill in all fields."); return; }
    if (newPass !== confirmPass) { Alert.alert("Error", "Passwords do not match."); return; }
    setSaving(true);
    try {
      await changePassword(currentPass, newPass);
      setChangePassModal(false);
      setCurrentPass(""); setNewPass(""); setConfirmPass("");
      Alert.alert("✅ Password Changed", "Your password has been updated successfully.");
    } catch (e) {
      Alert.alert("Error", e?.message || "Could not change password.");
    } finally { setSaving(false); }
  };

  // ── Delete account ────────────────────────────────────────────────────────

  const handleDeleteAccount = async () => {
    if (deleteText !== "DELETE") {
      Alert.alert("Confirmation required", 'Type "DELETE" to confirm.');
      return;
    }
    setSaving(true);
    try {
      await deleteAccount();
      await AsyncStorage.clear();
      clearAuthToken();
      setDeleteModal(false);
      navigation.reset({ index: 0, routes: [{ name: "LoginScreen" }] });
    } catch (e) {
      Alert.alert("Error", e?.message || "Could not delete account.");
    } finally { setSaving(false); }
  };

  // ── Logout ────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout", style: "destructive", onPress: async () => {
          await AsyncStorage.multiRemove(["token", "username", "email"]);
          clearAuthToken();
          navigation.reset({ index: 0, routes: [{ name: "LoginScreen" }] });
        }
      },
    ]);
  };

  // ─── password strength ────────────────────────────────────────────────────
  const strength = newPass.length < 6 ? 0 : newPass.length < 10 ? 1 : newPass.length < 14 ? 2 : 3;
  const strengthLabel = ["Weak", "Fair", "Strong", "Very strong"][strength];
  const strengthColors = ["#d93025", "#f57c00", "#34a853", "#1a73e8"];

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1a73e8" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>⚙️ Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Profile card */}
        {loadingProfile
          ? <ActivityIndicator color="#1a73e8" style={{ marginBottom: 20 }} />
          : (
            <View style={[s.profileCard, { backgroundColor: colors.card }]}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(displayName[0] || "U").toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.profileName, { color: colors.text }]}>{displayName || "—"}</Text>
                <Text style={[s.profileEmail, { color: colors.subtext }]}>{email || "—"}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditProfileModal(true)} style={s.editBtn}>
                <Text style={s.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}

        {/* Account & Security */}
        <SectionHeader icon="🔒" title="Account & Security" />

        <SettingRow colors={colors}
          icon="👤" title="Edit Profile"
          desc="Change your display name and email"
          onPress={() => setEditProfileModal(true)} />

        <SettingRow colors={colors}
          icon="🔑" title="Change Password"
          desc="Update your account password"
          onPress={() => setChangePassModal(true)} />

        <SettingRow colors={colors}
          icon="🚪" title="Logout"
          desc="Sign out of your account"
          onPress={handleLogout} />

        <SettingRow colors={colors} danger
          icon="🗑️" title="Delete Account"
          desc="Permanently remove your account and all data"
          onPress={() => { setDeleteText(""); setDeleteModal(true); }} />

        {/* Appearance */}
        <SectionHeader icon="🎨" title="Appearance" />
        <SettingRow colors={colors}
          icon={isDarkMode ? "🌙" : "☀️"}
          title="Dark Mode"
          desc={isDarkMode ? "Dark theme is on" : "Light theme is on"}
          right={
            <Switch
              trackColor={{ false: "#ccc", true: "#1a73e8" }}
              thumbColor="#fff"
              ios_backgroundColor="#ccc"
              onValueChange={toggleTheme}
              value={isDarkMode}
            />
          } />

        {/* Notifications */}
        <SectionHeader icon="🔔" title="Notifications" />
        <SettingRow colors={colors}
          icon="📨"
          title="Daily Security Tips"
          desc="AI-generated tip every day at 9 AM"
          right={
            <Switch
              trackColor={{ false: "#ccc", true: "#34a853" }}
              thumbColor="#fff"
              onValueChange={async (val) => {
                setNotifsEnabled(val);
                await setNotificationsEnabled(val);
              }}
              value={notifsEnabled}
            />
          } />
        {todayTip && (
          <View style={[s.tipPreview, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.tipPreviewLabel, { color: colors.muted }]}>TODAY'S TIP</Text>
            <Text style={[s.tipPreviewTitle, { color: colors.text }]}>{todayTip.title}</Text>
            <Text style={[s.tipPreviewBody,  { color: colors.subtext }]}>{todayTip.body}</Text>
          </View>
        )}

        {/* About */}
        <SectionHeader icon="ℹ️" title="About" />
        <SettingRow colors={colors}
          icon="🛡️" title="CyberGuardian"
          desc="Version 1.0.0 · AI-powered phishing protection" />

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Edit Profile Modal ────────────────────────────────────────────── */}
      <Modal visible={editProfileModal} transparent animationType="slide" onRequestClose={() => setEditProfileModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setEditProfileModal(false); }}>
            <View style={s.overlay}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[s.sheet, { backgroundColor: colors.card }]}>
                  <View style={s.dragHandle} />
                  <Text style={[s.sheetTitle, { color: colors.text }]}>👤 Edit Profile</Text>

                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <Text style={[s.label, { color: colors.subtext }]}>Display Name</Text>
                    <TextInput
                      style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                      value={editName} onChangeText={setEditName}
                      placeholder="Your name" placeholderTextColor={colors.muted}
                      returnKeyType="next"
                    />

                    <Text style={[s.label, { color: colors.subtext }]}>Email Address</Text>
                    <TextInput
                      style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                      value={editEmail} onChangeText={setEditEmail}
                      placeholder="you@example.com" placeholderTextColor={colors.muted}
                      keyboardType="email-address" autoCapitalize="none"
                      returnKeyType="done" onSubmitEditing={handleSaveProfile}
                    />

                    <View style={[s.btnRow, { marginBottom: 8 }]}>
                      <TouchableOpacity style={s.btnCancel} onPress={() => setEditProfileModal(false)}>
                        <Text style={s.btnCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnPrimary} onPress={handleSaveProfile} disabled={saving}>
                        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Save</Text>}
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Change Password Modal ─────────────────────────────────────────── */}
      <Modal visible={changePassModal} transparent animationType="slide" onRequestClose={() => setChangePassModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setChangePassModal(false); }}>
            <View style={s.overlay}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[s.sheet, { backgroundColor: colors.card }]}>
                  <View style={s.dragHandle} />
                  <Text style={[s.sheetTitle, { color: colors.text }]}>🔑 Change Password</Text>

                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {[
                      { label: "Current Password", val: currentPass, set: setCurrentPass, action: "next" },
                      { label: "New Password", val: newPass, set: setNewPass, action: "next" },
                      { label: "Confirm New Password", val: confirmPass, set: setConfirmPass, action: "done" },
                    ].map(({ label, val, set, action }) => (
                      <View key={label}>
                        <Text style={[s.label, { color: colors.subtext }]}>{label}</Text>
                        <TextInput
                          style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                          value={val} onChangeText={set}
                          secureTextEntry={!showPass}
                          placeholder="••••••••" placeholderTextColor={colors.muted}
                          returnKeyType={action}
                          onSubmitEditing={action === "done" ? handleChangePassword : undefined}
                        />
                      </View>
                    ))}

                    <TouchableOpacity onPress={() => setShowPass(p => !p)} style={s.showPassBtn}>
                      <Text style={s.showPassText}>{showPass ? "🙈 Hide" : "👁 Show"} passwords</Text>
                    </TouchableOpacity>

                    {newPass.length > 0 && (
                      <View style={s.strengthRow}>
                        <Text style={s.strengthLabel}>Strength:</Text>
                        {[0, 1, 2].map(i => (
                          <View key={i} style={[s.strengthSeg, {
                            backgroundColor: strength > i ? strengthColors[strength] : "#e0e0e0"
                          }]} />
                        ))}
                        <Text style={[s.strengthText, { color: strengthColors[strength] }]}>{strengthLabel}</Text>
                      </View>
                    )}

                    <Text style={s.pwHint}>
                      Must contain uppercase, lowercase, number, special character, min 8 characters.
                    </Text>

                    <View style={[s.btnRow, { marginBottom: 8 }]}>
                      <TouchableOpacity style={s.btnCancel} onPress={() => { setChangePassModal(false); setCurrentPass(""); setNewPass(""); setConfirmPass(""); }}>
                        <Text style={s.btnCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnPrimary} onPress={handleChangePassword} disabled={saving}>
                        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Update</Text>}
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Delete Account Modal ──────────────────────────────────────────── */}
      <Modal visible={deleteModal} transparent animationType="slide" onRequestClose={() => setDeleteModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setDeleteModal(false); }}>
            <View style={s.overlay}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[s.sheet, { backgroundColor: colors.card }]}>
                  <View style={s.dragHandle} />
                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <Text style={s.deleteIcon}>⚠️</Text>
                    <Text style={[s.sheetTitle, { color: "#d93025" }]}>Delete Account</Text>
                    <Text style={[s.deleteSub, { color: colors.subtext }]}>
                      This is permanent. All your reports, incidents, learning progress, and account data will be deleted from our servers immediately.
                    </Text>

                    <Text style={[s.label, { color: colors.subtext, marginTop: 14 }]}>
                      Type <Text style={{ fontWeight: "800", color: "#d93025" }}>DELETE</Text> to confirm
                    </Text>
                    <TextInput
                      style={[s.input, { color: "#d93025", borderColor: "#d93025", backgroundColor: colors.background, fontWeight: "700" }]}
                      value={deleteText} onChangeText={setDeleteText}
                      placeholder="DELETE" placeholderTextColor="#ffaaaa"
                      autoCapitalize="characters"
                      returnKeyType="done"
                      onSubmitEditing={handleDeleteAccount}
                    />

                    <View style={[s.btnRow, { marginBottom: 8 }]}>
                      <TouchableOpacity style={s.btnCancel} onPress={() => setDeleteModal(false)}>
                        <Text style={s.btnCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btnPrimary, { backgroundColor: "#d93025", opacity: deleteText === "DELETE" ? 1 : 0.35 }]}
                        onPress={handleDeleteAccount}
                        disabled={saving || deleteText !== "DELETE"}
                      >
                        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Delete Forever</Text>}
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}




// ─── styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    backgroundColor: "#1a73e8",
    paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20,
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
    elevation: 6, shadowColor: "#1a73e8", shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8,
  },
  backText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },

  scroll: { paddingTop: 18, paddingHorizontal: 16, paddingBottom: 30 },

  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, padding: 16, marginBottom: 22,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 },
  },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#1a73e8", justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "800" },
  profileName: { fontSize: 17, fontWeight: "800" },
  profileEmail: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  editBtn: { backgroundColor: "#e8f0fe", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  editBtnText: { color: "#1a73e8", fontWeight: "800", fontSize: 13 },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 10 },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: "#1a73e8", letterSpacing: 0.8, textTransform: "uppercase" },

  row: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1,
    elevation: 1, shadowColor: "#000", shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 },
  },
  rowIconBox: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: 12 },
  rowIcon: { fontSize: 20 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowDesc: { fontSize: 12, fontWeight: "600", marginTop: 2, lineHeight: 17 },
  rowChevron: { fontSize: 24 },

  // modals
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === "ios" ? 40 : 24,
    maxHeight: "90%",
  },
  dragHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#e0e0e0", alignSelf: "center", marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", marginBottom: 16 },
  deleteIcon: { fontSize: 40, textAlign: "center", marginBottom: 8 },
  deleteSub: { fontSize: 13, fontWeight: "600", lineHeight: 19, marginBottom: 4 },

  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 14, fontWeight: "600" },

  showPassBtn: { alignSelf: "flex-end", marginTop: 6 },
  showPassText: { fontSize: 12, color: "#1a73e8", fontWeight: "700" },

  strengthRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 },
  strengthLabel: { fontSize: 12, fontWeight: "700", color: "#555" },
  strengthSeg: { flex: 1, height: 4, borderRadius: 2 },
  strengthText: { fontSize: 11, fontWeight: "800", marginLeft: 4 },
  pwHint: { fontSize: 11, color: "#888", marginTop: 8, lineHeight: 16 },

  btnRow: { flexDirection: "row", gap: 10, marginTop: 22 },
  btnCancel: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", backgroundColor: "#f0f0f0" },
  btnCancelText: { color: "#444", fontWeight: "700", fontSize: 14 },
  btnPrimary: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", backgroundColor: "#1a73e8" },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // ── Tip preview card ──
  tipPreview: {
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1,
    elevation: 1, shadowColor: "#000", shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 },
  },
  tipPreviewLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 4 },
  tipPreviewTitle: { fontSize: 14, fontWeight: "800", marginBottom: 4 },
  tipPreviewBody:  { fontSize: 13, fontWeight: "600", lineHeight: 20 },
});
