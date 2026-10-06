import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import {
  createPlan,
  PLAN_TITLE_MAX,
  PLAN_LOCATION_MAX,
  type PlanKind,
} from "../../lib/plans";

/**
 * Create — the `+` sheet. Two taps max per the frozen dashboard spec:
 * name the thing, pick when, done. Plans land in Pulse's Tap-in strip.
 *
 * Scope is deliberately one flow (make a plan). Drops get their own row here
 * once the drops data layer exists; the layout already reserves the slot.
 */

const KINDS: Array<{ value: PlanKind; label: string; icon: string }> = [
  { value: "meal", label: "Eat", icon: "restaurant-outline" },
  { value: "outing", label: "Out", icon: "walk-outline" },
  { value: "football", label: "Ball", icon: "football-outline" },
  { value: "event", label: "Event", icon: "ticket-outline" },
  { value: "other", label: "Other", icon: "ellipsis-horizontal" },
];

interface Preset {
  label: string;
  at: () => Date;
}

function atHour(date: Date, hour: number): Date {
  const copy = new Date(date);
  copy.setHours(hour, 0, 0, 0);
  return copy;
}

function presets(now: Date): Preset[] {
  const tonight = atHour(now, 19);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const saturday = new Date(now);
  saturday.setDate(saturday.getDate() + ((6 - saturday.getDay() + 7) % 7 || 7));

  return [
    {
      label: "Tonight 7pm",
      at: () =>
        tonight.getTime() > now.getTime() ? tonight : atHour(tomorrow, 19),
    },
    {
      label: "Tomorrow eve",
      at: () => atHour(tomorrow, 19),
    },
    {
      label: "Saturday",
      at: () => atHour(saturday, 14),
    },
  ];
}

export default function CreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PlanKind>("meal");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!startsAt) {
      setError("Pick when this is happening");
      return;
    }
    setCreating(true);
    setError(null);

    const result = await createPlan({
      title,
      kind,
      startsAt: startsAt.toISOString(),
      location,
    });
    setCreating(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setTitle("");
    setLocation("");
    setStartsAt(null);
    router.push("/(tabs)");
    Alert.alert(
      "Bet — you made a plan",
      "It is sitting in Tap-in. The squad can see it.",
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + SPACING.spaceMd },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Make a plan</Text>
        <View style={styles.closeBtn} />
      </View>

      <Text style={styles.label}>What is the move</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Tacos at 7?"
        placeholderTextColor={COLORS.onSurfaceVariant}
        maxLength={PLAN_TITLE_MAX}
        accessibilityLabel="Plan title"
      />

      <Text style={styles.label}>What kind of thing</Text>
      <View style={styles.kindRow}>
        {KINDS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.kindChip,
              kind === option.value && styles.kindChipActive,
            ]}
            onPress={() => setKind(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === option.value }}
          >
            <Ionicons
              name={option.icon as never}
              size={16}
              color={
                kind === option.value
                  ? COLORS.primaryContainer
                  : COLORS.onSurfaceVariant
              }
            />
            <Text
              style={[
                styles.kindText,
                kind === option.value && styles.kindTextActive,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>When</Text>
      <View style={styles.presetRow}>
        {presets(new Date()).map((preset) => {
          const active =
            startsAt !== null &&
            Math.abs(preset.at().getTime() - startsAt.getTime()) < 60_000;
          return (
            <TouchableOpacity
              key={preset.label}
              style={[styles.presetChip, active && styles.kindChipActive]}
              onPress={() => setStartsAt(preset.at())}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.kindText, active && styles.kindTextActive]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {startsAt ? (
        <Text style={styles.startsNote}>
          {startsAt.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}{" "}
          at{" "}
          {startsAt.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      ) : null}

      <Text style={styles.label}>
        Where <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={location}
        onChangeText={setLocation}
        placeholder="Kilimani"
        placeholderTextColor={COLORS.onSurfaceVariant}
        maxLength={PLAN_LOCATION_MAX}
        accessibilityLabel="Plan location"
      />

      {error ? <Text style={styles.formError}>{error}</Text> : null}

      <TouchableOpacity
        style={[
          styles.submit,
          (creating || !title.trim()) && styles.submitDisabled,
        ]}
        onPress={() => void submit()}
        disabled={creating || !title.trim()}
        accessibilityRole="button"
        accessibilityLabel="Create plan"
      >
        <Text style={styles.submitText}>
          {creating ? "Setting it up..." : "Put it on"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.note}>Expires on its own. No cleanup fr.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  content: {
    paddingHorizontal: SPACING.spaceMd,
    paddingBottom: SPACING.spaceXl,
    gap: SPACING.spaceXs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.spaceSm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  label: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "600",
    color: COLORS.onSurface,
    marginTop: SPACING.spaceSm,
  },
  optional: {
    color: COLORS.onSurfaceVariant,
    fontWeight: "400",
  },
  input: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  kindRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.spaceXs,
  },
  kindChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  kindChipActive: {
    borderColor: COLORS.primaryContainer,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  kindText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onSurfaceVariant,
  },
  kindTextActive: {
    color: COLORS.primaryContainer,
    fontWeight: "700",
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.spaceXs,
  },
  presetChip: {
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  startsNote: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.primaryContainer,
  },
  formError: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.error,
  },
  submit: {
    marginTop: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryContainer,
    alignItems: "center",
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "700",
    color: COLORS.onPrimary,
  },
  note: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    textAlign: "center",
    marginTop: SPACING.spaceXs,
  },
});
