import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { COLORS, SPACING, RADIUS } from "../../theme";
import { useAuth } from "../../lib/auth-context";
import { useRouter } from "expo-router";

const PRESET_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80",
];

const FREQUENCY_TAGS = [
  "AI & Neural Nets",
  "Zero-Knowledge",
  "Decentralized Mesh",
  "Ambient Audio",
  "Cybersecurity",
  "Space & Quantum",
  "Creative Tech",
  "Zero-Copy Pipes",
  "Philosophy",
  "Mobile Runtimes",
  "Digital Art",
  "Robotics",
];

export default function ProfileSetupWizard() {
  const { user, updateProfile } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatar, setAvatar] = useState(user?.avatar || PRESET_AVATARS[0]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    user?.interests || [],
  );
  const [isSaving, setIsSaving] = useState(false);

  // Laser scanner vertical scan beam animation
  const scanBeamY = useSharedValue(0);
  // Audio waveform pulse heights

  useEffect(() => {
    scanBeamY.value = withRepeat(
      withSequence(
        withTiming(120, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [scanBeamY]);



  const scanBeamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanBeamY.value }],
  }));


  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setAvatar(result.assets[0].uri);
      }
    } catch {
      Alert.alert(
        "Permission needed",
        "Please allow gallery access to upload a hologram avatar.",
      );
    }
  };

  const toggleInterest = (tag: string) => {
    setSelectedInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleNext = () => {
    if (step === 1) {
      if (!displayName.trim()) {
        Alert.alert(
          "Entity Name Required",
          "Please enter your display entity name.",
        );
        return;
      }
      setStep(2);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      // "operator" is shared by everyone who skips, and username is unique —
      // the second skipper would eat a UNIQUE violation. Suffix with the
      // user id so the default is always their own.
      const fallback = `operator-${(user?.id ?? Math.random().toString(36).slice(2)).slice(-6)}`;
      await updateProfile({
        displayName: displayName.trim() || "Node Operator",
        username: (username.trim().toLowerCase() || fallback).slice(0, 32),
        avatar,
        bio: bio.trim(),
        interests: selectedInterests,
      });
      router.replace("/(tabs)");
    } catch {
      Alert.alert(
        "Calibration Error",
        "Failed to synchronize profile with node network.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.select({ ios: "padding", android: undefined })}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Protocol Stepper */}
          <View style={styles.header}>
            <View style={styles.stepBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.stepBadgeText}>
                {step === 1
                  ? "STEP 01 // IDENTITY MATRIX"
                  : "STEP 02 // FREQUENCY CALIBRATION"}
              </Text>
            </View>

            <View style={styles.stepProgressRow}>
              <View
                style={[styles.stepProgressLine, styles.stepProgressLineActive]}
              />
              <View
                style={[
                  styles.stepProgressLine,
                  step === 2 && styles.stepProgressLineActive,
                ]}
              />
            </View>
          </View>

          {step === 1 ? (
            /* STEP 1: BIOMETRICS & IDENTITY */
            <View style={styles.stepContainer}>
              {/* Holographic Scanner Core */}
              <View style={styles.scannerWrapper}>
                <View style={styles.reticleContainer}>
                  {/* Scanner Corners */}
                  <View style={[styles.reticleCorner, styles.cornerTL]} />
                  <View style={[styles.reticleCorner, styles.cornerTR]} />
                  <View style={[styles.reticleCorner, styles.cornerBL]} />
                  <View style={[styles.reticleCorner, styles.cornerBR]} />

                  {/* Avatar Hologram Viewport */}
                  <View style={styles.avatarViewport}>
                    <Image
                      source={{ uri: avatar }}
                      style={styles.avatarImage}
                    />
                    <View style={styles.avatarDarken} />

                    {/* Animated Vertical Laser Beam */}
                    <Animated.View style={[styles.laserBeam, scanBeamStyle]} />
                  </View>

                  {/* Edit Camera Button */}
                  <Pressable style={styles.cameraBtn} onPress={pickImage}>
                    <Ionicons name="camera" size={18} color="#00363a" />
                  </Pressable>
                </View>

                {/* Scanner Status Pill */}
                <View style={styles.scannerPill}>
                  <Ionicons
                    name="scan-outline"
                    size={12}
                    color={COLORS.primaryContainer}
                  />
                  <Text style={styles.scannerPillText}>
                    Biometric Node Avatar Initialized
                  </Text>
                </View>

                {/* Preset Node Holograms Selector */}
                <View style={styles.presetRow}>
                  {PRESET_AVATARS.map((url, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => setAvatar(url)}
                      style={[
                        styles.presetThumbWrapper,
                        avatar === url && styles.presetThumbSelected,
                      ]}
                    >
                      <Image source={{ uri: url }} style={styles.presetThumb} />
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Form Input Fields */}
              <View style={styles.fieldsDeck}>
                {/* Display Name */}
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
                    <View style={styles.verifiedNodeBadge}>
                      <Ionicons
                        name="checkmark-circle"
                        size={11}
                        color={COLORS.primaryContainer}
                      />
                      <Text style={styles.verifiedNodeText}>Verified Node</Text>
                    </View>
                  </View>
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={COLORS.onSurfaceVariant}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.inputText}
                      placeholder="Your entity name"
                      placeholderTextColor={COLORS.outlineVariant}
                      value={displayName}
                      onChangeText={setDisplayName}
                    />
                  </View>
                </View>

                {/* Network Handle (Immutable ID) */}
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.fieldLabel}>NETWORK HANDLE</Text>
                    <Ionicons
                      name="lock-closed-outline"
                      size={13}
                      color={COLORS.tertiaryContainer}
                    />
                  </View>
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="at"
                      size={18}
                      color={COLORS.outline}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.inputText}
                      placeholder="node_handle"
                      placeholderTextColor={COLORS.outlineVariant}
                      value={username}
                      onChangeText={(val) =>
                        setUsername(
                          val.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                        )
                      }
                      autoCapitalize="none"
                    />
                    <View style={styles.tagPill}>
                      <Text style={styles.tagPillText}>L1-MESH</Text>
                    </View>
                  </View>
                </View>

                {/* Bio Transmission */}
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.fieldLabel}>BIO TRANSMISSION</Text>
                    <Text
                      style={[
                        styles.charCountText,
                        bio.length >= 150 && styles.charCountWarning,
                      ]}
                    >
                      {bio.length} / 160
                    </Text>
                  </View>
                  <View style={[styles.inputWrapper, styles.bioWrapper]}>
                    <TextInput
                      style={[styles.inputText, styles.bioText]}
                      placeholder="Broadcast your frequency, protocol tags, or interests..."
                      placeholderTextColor={COLORS.outlineVariant}
                      value={bio}
                      onChangeText={setBio}
                      multiline
                      maxLength={160}
                    />
                  </View>
                </View>

              </View>
            </View>
          ) : (
            /* STEP 2: FREQUENCIES & VIBES */
            <View style={styles.stepContainer}>
              <View style={styles.frequencyHeader}>
                <Text style={styles.frequencyTitle}>
                  Select Node Frequencies
                </Text>
                <Text style={styles.frequencySubtitle}>
                  Calibrate your pulse beacon to discover aligned conversations,
                  spaces, and active peers.
                </Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {selectedInterests.length} / 5 RECOMMENDED
                  </Text>
                </View>
              </View>

              {/* Tag Chips Deck */}
              <View style={styles.tagGrid}>
                {FREQUENCY_TAGS.map((tag) => {
                  const isSelected = selectedInterests.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => toggleInterest(tag)}
                      style={[
                        styles.tagChip,
                        isSelected && styles.tagChipSelected,
                      ]}
                    >
                      <Ionicons
                        name={isSelected ? "flash" : "add-outline"}
                        size={14}
                        color={
                          isSelected
                            ? COLORS.primaryContainer
                            : COLORS.onSurfaceVariant
                        }
                        style={styles.chipIcon}
                      />
                      <Text
                        style={[
                          styles.tagChipText,
                          isSelected && styles.tagChipTextSelected,
                        ]}
                      >
                        {tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Action Deck */}
          <View style={styles.actionDeck}>
            <Pressable
              style={[styles.primaryActionBtn, isSaving && { opacity: 0.6 }]}
              onPress={handleNext}
              disabled={isSaving}
            >
              <Text style={styles.primaryActionText}>
                {isSaving
                  ? "SYNCHRONIZING..."
                  : step === 1
                    ? "CONTINUE TO FREQUENCIES"
                    : "INITIALIZE NODE PROTOCOL"}
              </Text>
              <Ionicons
                name={step === 1 ? "arrow-forward" : "rocket-outline"}
                size={18}
                color={COLORS.onPrimary}
                style={styles.btnIcon}
              />
            </Pressable>

            <Pressable style={styles.skipBtn} onPress={handleSkip}>
              <Text style={styles.skipBtnText}>Set up later</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: SPACING.margin,
    paddingTop: SPACING.spaceSm,
    paddingBottom: SPACING.spaceXl,
  },
  header: {
    marginBottom: SPACING.spaceLg,
  },
  stepBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primaryContainer,
    marginRight: 8,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.primaryContainer,
    letterSpacing: 2,
  },
  stepProgressRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  stepProgressLine: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  stepProgressLineActive: {
    backgroundColor: COLORS.primaryContainer,
  },
  stepContainer: {
    width: "100%",
  },
  scannerWrapper: {
    alignItems: "center",
    marginBottom: SPACING.spaceLg,
  },
  reticleContainer: {
    width: 140,
    height: 140,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  reticleCorner: {
    position: "absolute",
    width: 14,
    height: 14,
    borderColor: COLORS.primaryContainer,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  avatarViewport: {
    width: 120,
    height: 120,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(0, 240, 255, 0.3)",
    position: "relative",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarDarken: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(9, 10, 15, 0.2)",
  },
  laserBeam: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.primaryContainer,
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  cameraBtn: {
    position: "absolute",
    bottom: -6,
    right: -6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 6,
  },
  scannerPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(25, 27, 35, 0.8)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    marginTop: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  scannerPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.8,
  },
  presetRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  presetThumbWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  presetThumbSelected: {
    borderColor: COLORS.primaryContainer,
  },
  presetThumb: {
    width: "100%",
    height: "100%",
  },
  fieldsDeck: {
    gap: SPACING.spaceMd,
  },
  fieldGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.onSurfaceVariant,
    letterSpacing: 1.2,
  },
  verifiedNodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  verifiedNodeText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.primaryContainer,
  },
  charCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.onSurfaceVariant,
  },
  charCountWarning: {
    color: COLORS.secondary,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(25, 27, 35, 0.9)",
    borderRadius: RADIUS.DEFAULT,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 14,
    height: 52,
  },
  bioWrapper: {
    height: 96,
    alignItems: "flex-start",
    paddingVertical: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.semantic.textPrimary,
  },
  bioText: {
    height: "100%",
    textAlignVertical: "top",
  },
  tagPill: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.outline,
    letterSpacing: 0.5,
  },
  voiceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(39, 42, 50, 0.5)",
    borderRadius: RADIUS.DEFAULT,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  voiceCardRecording: {
    borderColor: "rgba(0, 240, 255, 0.4)",
    backgroundColor: "rgba(0, 240, 255, 0.05)",
  },
  voiceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  voiceMicBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceMicBtnActive: {
    backgroundColor: "#ff3b30",
  },
  voiceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.semantic.textPrimary,
  },
  voiceSubtitle: {
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 30,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingHorizontal: 8,
    borderRadius: RADIUS.full,
  },
  waveBar: {
    width: 3,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 1.5,
  },
  frequencyHeader: {
    marginBottom: SPACING.spaceLg,
  },
  frequencyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.semantic.textPrimary,
    letterSpacing: -0.5,
  },
  frequencySubtitle: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    lineHeight: 20,
    marginTop: 6,
  },
  countBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0, 240, 255, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(0, 240, 255, 0.25)",
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primaryContainer,
    letterSpacing: 1,
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(25, 27, 35, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tagChipSelected: {
    backgroundColor: "rgba(0, 240, 255, 0.14)",
    borderColor: COLORS.primaryContainer,
  },
  chipIcon: {
    marginRight: 6,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.onSurfaceVariant,
  },
  tagChipTextSelected: {
    color: COLORS.primaryContainer,
    fontWeight: "700",
  },
  actionDeck: {
    marginTop: SPACING.spaceXl,
    gap: 12,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.onPrimary,
    letterSpacing: 1.5,
  },
  btnIcon: {
    marginLeft: 8,
  },
  skipBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.semantic.textDim,
    letterSpacing: 0.5,
  },
});
