import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';
import { Avatar } from '../../components/ui/Avatar';

const activeUsers = [
  { id: '1', name: 'Alex', activity: 'Agent Swarms', status: 'online', avatar: 'A' },
  { id: '2', name: 'Sarah', activity: 'Design Lab', status: 'online', avatar: 'S' },
  { id: '3', name: 'Brian', activity: 'Reviewing PRs', status: 'online', avatar: 'B' },
  { id: '4', name: 'Nia', activity: 'Nairobi Tech', status: 'away', avatar: 'N' },
  { id: '5', name: 'Tariq', activity: 'Offline', status: 'offline', avatar: 'T' },
];

const liveConversations = [
  {
    id: '1',
    badge: 'LIVE',
    badgeCount: '24 TALKING',
    badgeColor: '#93000a',
    topicLabel: 'AI BUILDERS',
    topicColor: COLORS.primaryContainer,
    title: "What's everyone building with local agent runtimes?",
    speaker: 'Sarah',
    snippet: "I'm deploying an autonomous agent runtime on edge devices.",
    avatarLabel: 'S',
    speakerColor: COLORS.secondary,
    avatarStack: ['1', '2', '3', '4'],
    extraCount: 20,
    duration: '01:42',
    accentColor: COLORS.primaryContainer,
    location: null,
  },
  {
    id: '2',
    badge: 'HOT',
    badgeCount: '18 IN CONVERSATION',
    badgeColor: '#1d2027',
    topicLabel: 'NAIROBI TECH',
    topicColor: COLORS.secondaryFixedDim,
    title: 'Where are founders and developers hanging out this Friday?',
    speaker: 'Brian',
    snippet: 'Kilimani tech hub demo night kicks off at 7pm!',
    avatarLabel: 'B',
    speakerColor: COLORS.tertiaryContainer,
    avatarStack: ['5', '6'],
    extraCount: 16,
    duration: null,
    accentColor: COLORS.secondaryFixed,
    location: 'Nairobi Hub',
  },
];

const trendingChips = ['#AIAgents', '#AfricaBuilders', '#GameDev', '#DesignSystems'];
const chipCounts = ['1.4k talks', '820', null, null];

export default function PulseScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Greeting Header */}
      <View style={styles.greetingSection}>
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.statusRow}>
              <View style={styles.pulseDot} />
              <Text style={styles.statusLabel}>Lattice Node Active</Text>
            </View>
            <Text style={styles.greeting}>Good evening, Langat</Text>
          </View>
          <View style={styles.iconCircle}>
            <Ionicons name="wifi" size={22} color={COLORS.primaryContainer} />
          </View>
        </View>
        <Text style={styles.subtitle}>What's happening in your world?</Text>
      </View>

      {/* Broadcast Launcher Card */}
      <View style={styles.broadcastCard}>
        <View style={styles.broadcastInner}>
          <View style={styles.broadcastLeft}>
            <View style={styles.broadcastAvatar}>
              <View style={styles.broadcastStatus} />
            </View>
            <Text style={styles.broadcastText}>Start a live discussion or ping your circle...</Text>
          </View>
          <View style={styles.broadcastActions}>
            <TouchableOpacity style={styles.actionBtn}>
              <Ionicons name="mic" size={18} color={COLORS.primaryContainer} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}>
              <Ionicons name="flash" size={18} color={COLORS.onSurface} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Active Now */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>Active Now</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>38</Text>
            </View>
          </View>
          <TouchableOpacity>
            <Text style={styles.sectionAction}>Radar Map</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.usersRow}>
          {activeUsers.map((user) => (
            <TouchableOpacity key={user.id} style={styles.userItem}>
              <View style={styles.userAvatarWrapper}>
                <Avatar name={user.name} size={60} status={user.status === 'online' ? 'online' : undefined} />
              </View>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={[styles.userActivity, { color: user.status === 'online' ? COLORS.primaryContainer : COLORS.semantic.textDim }]}>
                {user.activity}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.userItem}>
            <View style={[styles.userAvatarWrapper, styles.moreCircle]}>
              <Text style={[styles.userName, { textAlign: 'center', fontSize: 12, fontWeight: '700', color: COLORS.primaryContainer }]}>+33</Text>
            </View>
            <Text style={[styles.userName, { color: COLORS.semantic.textDim }]}>Network</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Live Conversations */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Ionicons name="sparkles" size={16} color={COLORS.primaryContainer} />
            <Text style={styles.sectionTitle}>Live Conversations</Text>
          </View>
          <TouchableOpacity>
            <Text style={styles.sectionAction}>Active Grid</Text>
          </TouchableOpacity>
        </View>

        {liveConversations.map((conv) => (
          <View key={conv.id} style={[styles.conversationCard, { borderColor: conv.accentColor + '30' }]}>
            <View style={styles.cardTop}>
              <View style={[styles.liveBadge, { backgroundColor: conv.badgeColor }]}>
                {conv.badge === 'LIVE' && <View style={styles.livePulse} />}
                <Text style={styles.liveBadgeText}>{conv.badge}</Text>
                <Text style={styles.liveBadgeCount}>{conv.badgeCount}</Text>
              </View>
              <View style={styles.cardMeta}>
                {conv.duration && (
                  <View style={styles.audioVisual}>
                    {[1, 2, 3, 4].map((i) => (
                      <View key={i} style={[styles.audioBar, { height: 8 + (i % 3) * 4 }]} />
                    ))}
                    <Text style={styles.audioDuration}>{conv.duration}</Text>
                  </View>
                )}
                {conv.location && (
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={12} color={COLORS.onSurfaceVariant} />
                    <Text style={styles.locationText}>{conv.location}</Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={[styles.topicLabel, { color: conv.topicColor }]}>{conv.topicLabel}</Text>
            <Text style={styles.conversationTitle}>{conv.title}</Text>

            <View style={styles.snippetCard}>
              <View style={styles.snippetAvatar}>
                <Text style={styles.snippetAvatarText}>{conv.avatarLabel}</Text>
              </View>
              <View style={styles.snippetContent}>
                <View style={styles.snippetHeader}>
                  <Text style={[styles.snippetName, { color: conv.speakerColor }]}>{conv.speaker}</Text>
                  <Text style={styles.snippetTime}>just now</Text>
                </View>
                <Text style={styles.snippetText}>"{conv.snippet}"</Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <View style={styles.avatarStack}>
                {conv.avatarStack.map((_, i) => (
                  <View key={i} style={styles.stackAvatar}>
                    <Text style={styles.stackAvatarText}>{String.fromCharCode(65 + i)}</Text>
                  </View>
                ))}
                <View style={styles.stackAvatarExtra}>
                  <Text style={styles.stackExtraText}>+{conv.extraCount}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.joinBtn}>
                <Text style={styles.joinText}>JOIN</Text>
                <Ionicons name="arrow-forward" size={14} color={COLORS.onPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* Trending Spaces */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending Spaces</Text>
          <Ionicons name="trending-up" size={16} color={COLORS.onSurfaceVariant} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {trendingChips.map((chip, i) => (
            <TouchableOpacity key={chip} style={[styles.chip, i === 0 && styles.chipActive]}>
              <Text style={[styles.chipText, i === 0 && styles.chipTextActive]}>{chip}</Text>
              {chipCounts[i] && (
                <Text style={[styles.chipCount, i === 0 && styles.chipCountActive]}>{chipCounts[i]}</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Recent Activity */}
      <TouchableOpacity style={styles.activityCard}>
        <View style={styles.activityInner}>
          <View style={styles.activityAvatar}>
            <Text style={styles.activityAvatarText}>S</Text>
            <Ionicons name={"ios-reply" as any} size={8} color={COLORS.onSecondary} />
          </View>
          <View style={styles.activityContent}>
            <View style={styles.activityRow}>
              <Text style={styles.activityName}>Sarah</Text>
              <Text style={styles.activityAction}>replied in</Text>
              <Text style={styles.activitySpace}>AI Agent Discussion</Text>
            </View>
            <Text style={styles.activityTime}>2m ago</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.onSurfaceVariant} />
      </TouchableOpacity>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  greetingSection: {
    paddingHorizontal: SPACING.margin,
    paddingTop: SPACING.spaceXs,
    paddingBottom: SPACING.spaceMd,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceXs,
    marginBottom: 4,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.tertiaryContainer,
    shadowColor: COLORS.tertiaryContainer,
    shadowRadius: 6,
    shadowOpacity: 0.9,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: COLORS.onSurfaceVariant,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: -1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },
  broadcastCard: {
    marginHorizontal: SPACING.margin,
    padding: SPACING.spaceMd,
    borderRadius: RADIUS.DEFAULT,
    backgroundColor: COLORS.surfaceContainer,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  broadcastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.spaceMd,
  },
  broadcastLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
    flex: 1,
  },
  broadcastAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  broadcastStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primaryContainer,
    shadowColor: COLORS.primaryContainer,
    shadowRadius: 8,
    shadowOpacity: 0.8,
  },
  broadcastText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    overflow: 'hidden',
  },
  broadcastActions: {
    flexDirection: 'row',
    gap: SPACING.spaceXs,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginTop: SPACING.spaceLg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.margin,
    marginBottom: SPACING.spaceSm,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceXs,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.tertiaryContainer,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.onSurface,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionAction: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  countText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.tertiary,
  },
  usersRow: {
    flexDirection: 'row',
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.margin,
    paddingVertical: SPACING.spaceSm,
  },
  userItem: {
    alignItems: 'center',
    width: 72,
  },
  userAvatarWrapper: {
    position: 'relative',
  },
  moreCircle: {
    backgroundColor: COLORS.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
    textAlign: 'center',
    marginTop: 4,
  },
  userActivity: {
    fontSize: 10,
    color: COLORS.primaryContainer,
    textAlign: 'center',
    marginTop: 2,
  },
  conversationCard: {
    marginHorizontal: SPACING.margin,
    padding: SPACING.spaceLg,
    borderRadius: RADIUS.DEFAULT,
    backgroundColor: COLORS.surfaceContainerHigh,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    marginBottom: SPACING.spaceMd,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.spaceMd,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  livePulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff5c5c',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffdad6',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  liveBadgeCount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffdad6',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
  },
  audioVisual: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 6,
  },
  audioBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: COLORS.primaryContainer,
  },
  audioDuration: {
    fontSize: 10,
    color: COLORS.primaryFixed,
    marginLeft: 4,
    fontFamily: 'monospace',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
  },
  topicLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  conversationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
    lineHeight: 24,
    marginBottom: SPACING.spaceMd,
  },
  snippetCard: {
    flexDirection: 'row',
    gap: SPACING.spaceSm,
    padding: SPACING.spaceSm,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.DEFAULT,
    marginBottom: SPACING.spaceMd,
  },
  snippetAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  snippetAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  snippetContent: {
    flex: 1,
  },
  snippetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceXs,
    marginBottom: 2,
  },
  snippetName: {
    fontSize: 12,
    fontWeight: '600',
  },
  snippetTime: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
  },
  snippetText: {
    fontSize: 12,
    color: COLORS.onSurface,
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatarStack: {
    flexDirection: 'row',
    marginLeft: -8,
  },
  stackAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surfaceContainerHigh,
  },
  stackAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  stackAvatarExtra: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceContainerHighest,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surfaceContainerHigh,
  },
  stackExtraText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.primaryContainer,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    shadowColor: COLORS.primaryContainer,
    shadowRadius: 16,
    shadowOpacity: 0.4,
  },
  joinText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onPrimary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SPACING.margin,
    paddingVertical: SPACING.spaceXs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {
    backgroundColor: COLORS.primaryContainer + '20',
    borderColor: COLORS.primaryContainer,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
  },
  chipTextActive: {
    color: COLORS.primaryContainer,
  },
  chipCount: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.tertiaryContainer,
    marginLeft: 6,
  },
  chipCountActive: {
    color: COLORS.onPrimary,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.margin,
    marginTop: SPACING.spaceSm,
    padding: SPACING.spaceMd,
    borderRadius: RADIUS.DEFAULT,
    backgroundColor: COLORS.surfaceContainerLow,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  activityInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
    flex: 1,
  },
  activityAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  activityAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  activityContent: {
    flex: 1,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  activityAction: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  activitySpace: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primaryContainer,
  },
  activityTime: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
});