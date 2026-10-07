import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { useAuth } from "../../lib/auth-context";

type Props = {
  visible: boolean;
  displayName: string;
  username: string;
  onClose: () => void;
};

/** Mirrors the username rule enforced server-side. */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * Bottom sheet for editing display name and username.
 *
 * Username rules are checked here as well as in the backend so the user gets
 * instant feedback, but the backend remains the authority.
 */
export default function EditProfileSheet({
  visible,
  displayName,
  username,
  onClose,
}: Props) {
  const { updateProfile } = useAuth();
  const [name, setName] = useState(displayName);
  const [handle, setHandle] = useState(username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(displayName);
      setHandle(username);
      setError(null);
    }
  }, [visible, displayName, username]);

  const trimmedName = name.trim();
  const trimmedHandle = handle.trim().toLowerCase();
  const handleError =
    trimmedHandle.length === 0
      ? "Pick a username."
      : !USERNAME_RE.test(trimmedHandle)
        ? "3-20 characters: lowercase letters, numbers or underscore."
        : null;
  const nameError = trimmedName.length === 0 ? "Your name cannot be empty." : null;
  const unchanged =
    trimmedName === displayName && trimmedHandle === username.toLowerCase();
  const canSave = !handleError && !nameError && !unchanged && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ displayName: trimmedName, username: trimmedHandle });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <Text style={styles.title}>Edit profile</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
            >
              <Ionicons name="close" size={22} color={COLORS.onSurfaceVariant} />
            </Pressable>
          </View>

          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="What should we call you?"
            placeholderTextColor={COLORS.outline}
            style={styles.input}
            maxLength={40}
            autoCapitalize="words"
            accessibilityLabel="Display name"
          />
          {nameError ? <Text style={styles.error}>{nameError}</Text> : null}

          <Text style={styles.label}>Username</Text>
          <View style={styles.handleRow}>
            <Text style={styles.at}>@</Text>
            <TextInput
              value={handle}
              onChangeText={(text) => setHandle(text.toLowerCase())}
              placeholder="yourhandle"
              placeholderTextColor={COLORS.outline}
              style={[styles.input, styles.handleInput]}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Username"
            />
          </View>
          {handleError ? <Text style={styles.error}>{handleError}</Text> : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
            style={[styles.save, !canSave && styles.saveDisabled]}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.onPrimary} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceSm,
    paddingBottom: SPACING.spaceXl,
    gap: SPACING.spaceXs,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.semantic.ghostBorderLight,
    marginBottom: SPACING.spaceSm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.spaceSm,
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.onSurface,
  },
  label: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onSurfaceVariant,
    marginTop: SPACING.spaceSm,
  },
  input: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    backgroundColor: COLORS.semantic.surfaceLevel2,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
  },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
  },
  at: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.primaryContainer,
  },
  handleInput: {
    flex: 1,
  },
  error: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.error,
  },
  save: {
    marginTop: SPACING.spaceLg,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.spaceMd,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  saveDisabled: {
    opacity: 0.4,
  },
  saveText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onPrimary,
  },
});
