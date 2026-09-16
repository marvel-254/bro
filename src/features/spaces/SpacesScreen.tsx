import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';

const spaces = [
  { id: '1', name: 'AI Builders', description: 'Where agents are being built, deployed, and debated.', members: 24800, isPublic: true, avatar: 'AI', color: COLORS.primaryContainer, topics: ['Agents', 'Edge AI', 'Runtimes'] },
  { id: '2', name: 'Nairobi Tech', description: 'East Africa\'s hub for builders, founders, and makers.', members: 18200, isPublic: true, avatar: 'NT', color: COLORS.secondary, topics: ['Startups', 'Mobile', 'Fintech'] },
  { id: '3', name: 'Africa Builders', description: 'Connecting the next generation of African engineers.', members: 9100, isPublic: true, avatar: 'AB', color: COLORS.tertiaryContainer, topics: ['Community', 'Growth', 'Engineering'] },
];

const channels = ['general', 'introductions', 'showcase', 'jobs', 'events'];

export default function SpacesScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Spaces</Text>
        <TouchableOpacity style={styles.createBtn}>
          <Ionicons name="add" size={20} color={COLORS.onPrimary} />
          <Text style={styles.createText}>Create</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={COLORS.semantic.textDim} />
        <Text style={styles.searchText}>Search spaces...</Text>
      </View>

      {/* Channels Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.channelRow}>
        {channels.map((ch, i) => (
          <TouchableOpacity key={ch} style={[styles.channelChip, i === 0 && styles.channelChipActive]}>
            <Text style={[styles.channelText, i === 0 && styles.channelTextActive]}>{ch}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Featured Space */}
      <View style={styles.featuredCard}>
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>FEATURED</Text>
        </View>
        <Text style={styles.featuredName}>AI Builders</Text>
        <Text style={styles.featuredDesc}>Where agents are being built, deployed, and debated.</Text>
        <View style={styles.featuredStats}>
          <View style={styles.featuredStat}>
            <Text style={styles.featuredStatValue}>24.8k</Text>
            <Text style={styles.featuredStatLabel}>Members</Text>
          </View>
          <View style={styles.featuredStat}>
            <Text style={styles.featuredStatValue}>142</Text>
            <Text style={styles.featuredStatLabel}>Active</Text>
          </View>
          <View style={styles.featuredStat}>
            <Text style={styles.featuredStatValue}>Live</Text>
            <Text style={styles.featuredStatLabel}>Now</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.featuredJoin}>
          <Text style={styles.featuredJoinText}>Join Space</Text>
        </TouchableOpacity>
      </View>

      {/* Spaces List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Spaces</Text>
        {spaces.map((space) => (
          <TouchableOpacity key={space.id} style={styles.spaceCard}>
            <View style={[styles.spaceAvatar, { borderColor: space.color + '60' }]}>
              <Text style={[styles.spaceAvatarText, { color: space.color }]}>{space.avatar}</Text>
            </View>
            <View style={styles.spaceInfo}>
              <View style={styles.spaceNameRow}>
                <Text style={styles.spaceName}>{space.name}</Text>
                {space.isPublic ? (
                  <Ionicons name="globe" size={12} color={COLORS.semantic.textDim} />
                ) : (
                  <Ionicons name={"ios-lock" as any} size={12} color={COLORS.semantic.textDim} />
                )}
              </View>
              <Text style={styles.spaceDesc} numberOfLines={1}>{space.description}</Text>
              <View style={styles.spaceTopics}>
                {space.topics.map((topic) => (
                  <View key={topic} style={styles.topicTag}>
                    <Text style={styles.topicText}>#{topic}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.spaceMeta}>
              <Text style={styles.spaceMembers}>{space.members.toLocaleString()}</Text>
              <Text style={styles.spaceMembersLabel}>members</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const RADIUS_SM = 8;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.margin,
    paddingTop: SPACING.spaceXs,
    paddingBottom: SPACING.spaceSm,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
  },
  createText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onPrimary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
    marginHorizontal: SPACING.margin,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: 10,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: SPACING.spaceMd,
  },
  searchText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.semantic.textDim,
  },
  channelRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SPACING.margin,
    paddingBottom: SPACING.spaceSm,
  },
  channelChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  channelChipActive: {
    backgroundColor: COLORS.primaryContainer + '15',
    borderColor: COLORS.primaryContainer,
  },
  channelText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
  },
  channelTextActive: {
    color: COLORS.primaryContainer,
  },
  featuredCard: {
    marginHorizontal: SPACING.margin,
    padding: SPACING.spaceLg,
    borderRadius: RADIUS.xl || 32,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.1)',
    marginBottom: SPACING.spaceLg,
  },
  featuredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS_SM,
    backgroundColor: COLORS.secondaryContainer,
    marginBottom: SPACING.spaceMd,
    alignSelf: 'flex-start',
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSecondaryContainer,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  featuredName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginBottom: 4,
  },
  featuredDesc: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    marginBottom: SPACING.spaceMd,
  },
  featuredStats: {
    flexDirection: 'row',
    gap: SPACING.spaceLg,
    marginBottom: SPACING.spaceMd,
  },
  featuredStat: {
    alignItems: 'center',
  },
  featuredStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryContainer,
  },
  featuredStatLabel: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  featuredJoin: {
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
  },
  featuredJoinText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.onPrimary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  section: {
    paddingHorizontal: SPACING.margin,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.spaceSm,
  },
  spaceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.spaceMd,
    padding: SPACING.spaceMd,
    marginBottom: SPACING.spaceSm,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.DEFAULT,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  spaceAvatar: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.DEFAULT,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  spaceAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  spaceInfo: {
    flex: 1,
  },
  spaceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  spaceName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  spaceDesc: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    marginBottom: 6,
  },
  spaceTopics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  topicTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  topicText: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
  },
  spaceMeta: {
    alignItems: 'flex-end',
  },
  spaceMembers: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primaryContainer,
  },
  spaceMembersLabel: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
  },
});