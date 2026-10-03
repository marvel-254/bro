import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../theme';
import { Avatar } from '../../components/ui/Avatar';
import { usePeople } from '../../lib/people-context';
import { usePresence } from '../../lib/presence-context';
import { PRESENCE_LABELS, PRESENCE_COLORS, type Presence } from '../../lib/presence';
import { LoadingState, ErrorState, EmptyState } from '../../components/feedback/States';

/**
 * Who's Around — the presence layer.
 *
 * Lists everyone the signed-in user shares a conversation with, with a live
 * presence dot and custom activity line. A modal lets the user set their own
 * presence and a one-line activity (e.g. "💻 coding", "📍 outside").
 */

const PRESENCE_OPTIONS: Presence[] = [
  'online',
  'busy',
  'chilling',
  'gaming',
  'listening',
  'afk',
];

const QUICK_ACTIVITIES = [
  '💻 coding',
  '📍 outside',
  '🎧 listening',
  '🎮 gaming',
  '⚽ watching the game',
  '😴 afk',
];

export default function PeopleScreen() {
  const { people, loading, error, refresh } = usePeople();
  const { presence, statusText, emoji, setPresence, isBusy } = usePresence();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftText, setDraftText] = useState('');

  const onlineCount = people.filter((person) => person.presence === 'online').length;

  const openPicker = () => {
    setDraftText(statusText ?? '');
    setPickerOpen(true);
  };

  const savePresence = async (next: Presence, text?: string) => {
    await setPresence(next, { text: text ?? undefined, emoji: undefined });
    setPickerOpen(false);
  };

  const renderPerson = ({ item }: { item: (typeof people)[number] }) => {
    const activity = item.emoji || item.statusText;
    return (
      <View style={styles.personRow}>
        <Avatar
          uri={item.avatarUrl}
          name={item.displayName}
          size={44}
          presence={item.presence}
        />
        <View style={styles.personInfo}>
          <Text style={styles.personName}>{item.displayName}</Text>
          {activity ? (
            <Text style={styles.personActivity}>
              {item.emoji ? `${item.emoji} ` : ''}
              {item.statusText ?? ''}
            </Text>
          ) : (
            <Text style={styles.personPresence}>{PRESENCE_LABELS[item.presence]}</Text>
          )}
        </View>
        <View style={styles.personActions}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="chatbubble-outline" size={18} color={COLORS.onSurface} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>BRO</Text>
          <View>
            <Text style={styles.headerTitle}>Who's Around</Text>
            <Text style={styles.headerSub}>
              {onlineCount} online · {people.length} in your circle
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.youBtn} onPress={openPicker}>
          <Avatar
            name="You"
            size={34}
            presence={presence === 'offline' ? null : presence}
          />
        </TouchableOpacity>
      </View>

      {/* Your own presence line */}
      <TouchableOpacity style={styles.selfCard} onPress={openPicker}>
        <View style={[styles.selfDot, { backgroundColor: PRESENCE_COLORS[presence] }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.selfLabel}>
            {PRESENCE_LABELS[presence]}
            {statusText ? ` — ${emoji ? `${emoji} ` : ''}${statusText}` : ''}
          </Text>
          <Text style={styles.selfHint}>Tap to set your status</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.semantic.textDim} />
      </TouchableOpacity>

      {/* List */}
      {loading ? (
        <LoadingState message="Finding who's around..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void refresh()} />
      ) : people.length === 0 ? (
        <EmptyState
          message="Nobody around yet. Start a conversation and the people in it will show up here."
        />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.userId}
          renderItem={renderPerson}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Presence picker */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set your status</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={22} color={COLORS.onSurface} />
              </TouchableOpacity>
            </View>

            <View style={styles.presenceGrid}>
              {PRESENCE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.presenceOption,
                    presence === option && styles.presenceOptionActive,
                  ]}
                  onPress={() => void savePresence(option)}
                >
                  <View
                    style={[
                      styles.optionDot,
                      { backgroundColor: PRESENCE_COLORS[option] },
                    ]}
                  />
                  <Text style={styles.optionLabel}>{PRESENCE_LABELS[option]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.activityLabel}>Custom activity</Text>
            <TextInput
              style={styles.activityInput}
              value={draftText}
              onChangeText={setDraftText}
              placeholder="e.g. Vibing to Burna Boy"
              placeholderTextColor={COLORS.semantic.textDim}
              maxLength={60}
            />

            <View style={styles.quickRow}>
              {QUICK_ACTIVITIES.map((activity) => (
                <Pressable
                  key={activity}
                  style={styles.quickChip}
                  onPress={() => setDraftText(activity)}
                >
                  <Text style={styles.quickChipText}>{activity}</Text>
                </Pressable>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, isBusy && styles.saveBtnDisabled]}
              onPress={() => void savePresence(presence, draftText)}
              disabled={isBusy}
            >
              <Text style={styles.saveBtnText}>{isBusy ? 'Saving...' : 'Set status'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceLg,
    paddingBottom: SPACING.spaceMd,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceMd,
  },
  logo: {
    ...TYPOGRAPHY.headlineMD,
    color: COLORS.semantic.textPrimary,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.semantic.textPrimary,
  },
  headerSub: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.semantic.textDim,
    fontFamily: 'monospace',
  },
  youBtn: {
    padding: 2,
  },
  selfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceMd,
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.spaceMd,
    padding: SPACING.spaceMd,
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorder,
    borderRadius: RADIUS.sm,
  },
  selfDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  selfLabel: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textPrimary,
  },
  selfHint: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.semantic.textDim,
    fontFamily: 'monospace',
  },
  listContent: {
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.spaceXl,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.semantic.ghostBorderLight,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textPrimary,
    fontWeight: '600',
  },
  personActivity: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.semantic.textSecondary,
  },
  personPresence: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.semantic.textDim,
    fontFamily: 'monospace',
  },
  personActions: {
    flexDirection: 'row',
    gap: SPACING.spaceSm,
  },
  iconBtn: {
    padding: SPACING.spaceSm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: SPACING.margin,
  },
  modalCard: {
    backgroundColor: COLORS.semantic.surfaceLevel2,
    borderRadius: RADIUS.md,
    padding: SPACING.spaceLg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorder,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.spaceLg,
  },
  modalTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.semantic.textPrimary,
  },
  presenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.spaceSm,
    marginBottom: SPACING.spaceLg,
  },
  presenceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorderLight,
    borderRadius: RADIUS.sm,
  },
  presenceOptionActive: {
    borderColor: COLORS.semantic.ghostBorder,
    backgroundColor: COLORS.semantic.surfaceLevel1,
  },
  optionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  optionLabel: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.semantic.textPrimary,
  },
  activityLabel: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.semantic.textDim,
    fontFamily: 'monospace',
    marginBottom: SPACING.spaceSm,
  },
  activityInput: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textPrimary,
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorder,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    marginBottom: SPACING.spaceMd,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.spaceSm,
    marginBottom: SPACING.spaceLg,
  },
  quickChip: {
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceXs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorderLight,
    borderRadius: RADIUS.full,
  },
  quickChipText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.semantic.textSecondary,
  },
  saveBtn: {
    backgroundColor: COLORS.surfaceTint,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.spaceMd,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onPrimary,
    fontWeight: '700',
  },
});