import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';

const suggested = [
  { id: '1', name: 'Marcus Chen', handle: '@mchen', mutualSpaces: 3, status: 'online' },
  { id: '2', name: 'Elena Voss', handle: '@elena', mutualSpaces: 2, status: 'online' },
  { id: '3', name: 'Kwame Asante', handle: '@kwame', mutualSpaces: 5, status: 'away' },
  { id: '4', name: 'Yuki Tanaka', handle: '@yuki', mutualSpaces: 1, status: 'online' },
];

const filters = ['Suggested', 'Active Now', 'Mutual Spaces', 'New'];

const activeNow = [
  { id: '1', name: 'Sarah', activity: 'Building agents', status: 'online' },
  { id: '2', name: 'Brian', activity: 'Code review', status: 'online' },
  { id: '3', name: 'Nia', activity: 'Design session', status: 'online' },
  { id: '4', name: 'Alex', activity: 'Team sync', status: 'online' },
];

const peopleList = [
  { id: '1', name: 'Sarah Kimani', handle: '@sarah_k', bio: 'AI researcher. Building the future of agentic systems.', mutualSpaces: 4, status: 'online' },
  { id: '2', name: 'Brian Oduya', handle: '@brian.dev', bio: 'Full-stack engineer. Edge computing enthusiast.', mutualSpaces: 3, status: 'online' },
  { id: '3', name: 'Nia Mwangi', handle: '@nia_m', bio: 'Tech community builder. Nairobi based.', mutualSpaces: 2, status: 'away' },
  { id: '4', name: 'Alex Rivera', handle: '@alex.ai', bio: 'ML engineer exploring on-device AI.', mutualSpaces: 6, status: 'online' },
];

export default function PeopleScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>BRO</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>People</Text>
            <Text style={styles.headerSub}>Discover and connect</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.profileIcon}>
          <Ionicons name="person" size={20} color={COLORS.onSurface} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.semantic.textDim} />
        <Text style={styles.searchPlaceholder}>Search nodes...</Text>
        <TouchableOpacity>
          <Ionicons name="mic" size={18} color={COLORS.semantic.textDim} />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
        {filters.map((filter, i) => (
          <TouchableOpacity key={filter} style={[styles.filterChip, i === 0 && styles.filterChipActive]}>
            <Text style={[styles.filterText, i === 0 && styles.filterTextActive]}>{filter}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Suggested Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Suggested for you</Text>
          <TouchableOpacity>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestedRow}>
          {suggested.map((person) => (
            <View key={person.id} style={styles.suggestedCard}>
              <View style={styles.suggestedAvatar}>
                <Text style={styles.avatarText}>{person.name[0]}</Text>
                <View style={[styles.suggestedStatus, person.status === 'online' && styles.suggestedStatusActive]} />
              </View>
              <Text style={styles.suggestedName}>{person.name.split(' ')[0]}</Text>
              <Text style={styles.suggestedHandle}>{person.handle}</Text>
              <Text style={styles.suggestedMutual}>{person.mutualSpaces} mutual</Text>
              <TouchableOpacity style={styles.connectBtn}>
                <Text style={styles.connectText}>Connect</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Active Now */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.activeDot} />
            <Text style={styles.sectionTitle}>Active now</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>12</Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeRow}>
          {activeNow.map((person) => (
            <View key={person.id} style={styles.activeCard}>
              <View style={[styles.activeAvatar, person.status === 'online' && styles.activeAvatarOnline]}>
                <Text style={styles.activeAvatarText}>{person.name[0]}</Text>
              </View>
              <Text style={styles.activeName}>{person.name}</Text>
              <Text style={styles.activeActivity}>{person.activity}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* People List */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>People</Text>
          <Text style={styles.sectionCount}>42</Text>
        </View>
        {peopleList.map((person) => (
          <View key={person.id} style={styles.personCard}>
            <View style={styles.personLeft}>
              <View style={styles.personAvatar}>
                <Text style={styles.personAvatarText}>{person.name[0]}</Text>
              </View>
              <View style={styles.personInfo}>
                <View style={styles.personNameRow}>
                  <Text style={styles.personName}>{person.name}</Text>
                  <View style={[styles.personStatus, person.status === 'online' && styles.personStatusOnline]} />
                </View>
                <Text style={styles.personHandle}>{person.handle}</Text>
                <Text style={styles.personBio} numberOfLines={1}>{person.bio}</Text>
                <Text style={styles.personMutual}>{person.mutualSpaces} mutual Spaces</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.personAction}>
              <Ionicons name="person-add" size={20} color={COLORS.primaryContainer} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
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
    paddingHorizontal: SPACING.margin,
    paddingTop: SPACING.spaceXs,
    paddingBottom: SPACING.spaceSm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
  },
  logoBox: {
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 4,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: RADIUS.DEFAULT,
  },
  logoText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primaryContainer,
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  profileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: COLORS.semantic.textDim,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SPACING.margin,
    paddingVertical: SPACING.spaceSm,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  filterChipActive: {
    backgroundColor: COLORS.primaryContainer + '15',
    borderColor: COLORS.primaryContainer,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
  },
  filterTextActive: {
    color: COLORS.primaryContainer,
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
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.onSurface,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: 12,
    color: COLORS.primaryContainer,
    fontWeight: '600',
  },
  seeAll: {
    fontSize: 12,
    color: COLORS.primaryContainer,
    fontWeight: '600',
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
    color: COLORS.primaryContainer,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.tertiaryContainer,
  },
  suggestedRow: {
    flexDirection: 'row',
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.margin,
    paddingVertical: SPACING.spaceXs,
  },
  suggestedCard: {
    alignItems: 'center',
    width: 90,
    paddingVertical: SPACING.spaceSm,
  },
  suggestedAvatar: {
    position: 'relative',
    marginBottom: 6,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.onSurface,
    textAlign: 'center',
  },
  suggestedStatus: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.outlineVariant,
    borderWidth: 2,
    borderColor: COLORS.semantic.canvasRoot,
  },
  suggestedStatusActive: {
    backgroundColor: COLORS.tertiaryContainer,
  },
  suggestedName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  suggestedHandle: {
    fontSize: 11,
    color: COLORS.primaryContainer,
  },
  suggestedMutual: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  connectBtn: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
  },
  connectText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onPrimary,
  },
  activeRow: {
    flexDirection: 'row',
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.margin,
    paddingVertical: SPACING.spaceXs,
  },
  activeCard: {
    alignItems: 'center',
    width: 72,
  },
  activeAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.outlineVariant,
  },
  activeAvatarOnline: {
    borderColor: COLORS.primaryContainer,
    shadowColor: COLORS.primaryContainer,
    shadowRadius: 8,
    shadowOpacity: 0.4,
  },
  activeAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  activeName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
    marginTop: 6,
  },
  activeActivity: {
    fontSize: 10,
    color: COLORS.semantic.textDim,
    marginTop: 2,
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.margin,
    padding: SPACING.spaceMd,
    marginTop: SPACING.spaceSm,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.DEFAULT,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  personLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceMd,
    flex: 1,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  personAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  personInfo: {
    flex: 1,
  },
  personNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  personName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  personStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.outlineVariant,
  },
  personStatusOnline: {
    backgroundColor: COLORS.tertiaryContainer,
  },
  personHandle: {
    fontSize: 12,
    color: COLORS.primaryContainer,
  },
  personBio: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  personMutual: {
    fontSize: 10,
    color: COLORS.semantic.textDim,
    marginTop: 2,
  },
  personAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryContainer + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
});