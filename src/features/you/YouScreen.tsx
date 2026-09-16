import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';

const stats = [
  { value: '14', label: 'Mutual Spaces', color: COLORS.primaryContainer },
  { value: '842', label: 'Transmissions', color: COLORS.secondary },
  { value: '98.4%', label: 'Neural Sync', color: COLORS.tertiaryContainer },
];

const spaces = [
  { id: '1', name: 'AI Builders', role: 'Core Contributor', members: '24.8k nodes', status: 'Stage Live', isLive: true, icon: 'cpu' },
  { id: '2', name: 'Nairobi Tech', role: 'Founding Member', members: '18.2k nodes', status: 'Member', isLive: false, icon: 'school' },
  { id: '3', name: 'Africa Builders', role: 'Active Peer', members: '9.1k nodes', status: 'Member', isLive: false, icon: 'globe' },
];

export default function YouScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.topBarTitle}>Identity Node</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v1.0.4</Text>
          </View>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="qr-code" size={20} color={COLORS.onSurfaceVariant} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="settings" size={20} color={COLORS.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile */}
      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarGlow} />
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>LK</Text>
            </View>
          </View>
          <View style={styles.onlineIndicator}>
            <View style={styles.onlineDot} />
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.name}>Langat Kiprono</Text>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.primaryContainer} />
        </View>
        <View style={styles.usernameRow}>
          <Text style={styles.username}>@langat</Text>
          <View style={styles.dot} />
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>L1-MESH NODE</Text>
          </View>
        </View>
        <Text style={styles.bio}>Building lightweight agent runtimes &amp; zero-copy pipes. Nairobi Tech &amp; AI Builders.</Text>

        <View style={styles.statusPill}>
          <Ionicons name="pulse" size={14} color={COLORS.tertiaryContainer} />
          <Text style={styles.statusText}>ONLINE • MESH ACTIVE</Text>
          <View style={styles.dot} />
          <Text style={styles.statusSub}>Deep Focus</Text>
        </View>
      </View>

      {/* Pulse Signature */}
      <View style={styles.signatureCard}>
        <View style={styles.signatureInner}>
          <TouchableOpacity style={styles.playBtn}>
            <Ionicons name="play" size={18} color={COLORS.onPrimary} />
          </TouchableOpacity>
          <View style={styles.signatureInfo}>
            <Text style={styles.signatureTitle}>5s Pulse Signature</Text>
            <Text style={styles.signatureSubtitle}>"Building zero-copy agent pipes"</Text>
          </View>
          <View style={styles.waveform}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={[styles.waveBar, { height: 8 + (i % 3) * 6 }]} />
            ))}
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statItem}>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.editBtn}>
          <Ionicons name="create" size={16} color={COLORS.onPrimary} />
          <Text style={styles.editText}>Edit Identity</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCircle}>
          <Ionicons name="share" size={18} color={COLORS.onSurface} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCircle}>
          <Ionicons name="headset" size={18} color={COLORS.onSurface} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, { backgroundColor: COLORS.primaryContainer }]}>
          <Text style={[styles.tabText, { color: COLORS.onPrimary }]}>Spaces</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab}>
          <Text style={[styles.tabText, { color: COLORS.onSurfaceVariant }]}>Branches</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab}>
          <Text style={[styles.tabText, { color: COLORS.onSurfaceVariant }]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Spaces Tab Content */}
      <View style={styles.tabContent}>
        <View style={styles.tabContentHeader}>
          <Text style={styles.tabContentTitle}>Connected Nodes (3)</Text>
          <TouchableOpacity>
            <Text style={styles.tabContentAction}>Explore</Text>
          </TouchableOpacity>
        </View>
        {spaces.map((space) => (
          <View key={space.id} style={styles.spaceCard}>
            <View style={styles.spaceLeft}>
              <View style={[styles.spaceIcon, { borderColor: space.isLive ? COLORS.tertiaryContainer : COLORS.outlineVariant }]}>
                <Ionicons name={space.icon as any} size={20} color={COLORS.primaryContainer} />
              </View>
              <View style={styles.spaceInfo}>
                <View style={styles.spaceNameRow}>
                  <Text style={styles.spaceName}>{space.name}</Text>
                  {space.isLive && <View style={styles.liveDot} />}
                </View>
                <Text style={styles.spaceMeta}>{space.role} • {space.members}</Text>
              </View>
            </View>
            <View style={styles.spaceRight}>
              <View style={[styles.spaceStatus, space.isLive && styles.spaceStatusLive]}>
                <Text style={[styles.spaceStatusText, space.isLive && styles.spaceStatusTextLive]}>{space.status}</Text>
              </View>
              <Text style={styles.spaceActive}>{space.members.split(' ')[0]} active</Text>
            </View>
          </View>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.margin,
    paddingTop: SPACING.spaceXs,
    paddingBottom: SPACING.spaceSm,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceXs,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  versionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS_SM,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  versionText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primaryContainer,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: SPACING.margin,
    paddingBottom: SPACING.spaceLg,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.spaceMd,
  },
  avatarGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.primaryContainer + '15',
    shadowColor: COLORS.primaryContainer,
    shadowRadius: 20,
    shadowOpacity: 0.3,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    backgroundColor: COLORS.surfaceContainerHigh,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.tertiaryContainer,
    shadowColor: COLORS.tertiaryContainer,
    shadowRadius: 6,
    shadowOpacity: 0.9,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryFixedDim,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.outlineVariant,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bio: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: SPACING.spaceMd,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurface,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusSub: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primaryContainer,
  },
  signatureCard: {
    marginHorizontal: SPACING.margin,
    padding: SPACING.spaceMd,
    borderRadius: RADIUS.DEFAULT,
    backgroundColor: COLORS.surfaceContainerLow,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    marginBottom: SPACING.spaceLg,
  },
  signatureInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceMd,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primaryContainer,
    shadowRadius: 12,
    shadowOpacity: 0.4,
  },
  signatureInfo: {
    flex: 1,
  },
  signatureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  signatureSubtitle: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    fontStyle: 'italic',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 24,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 8,
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.primaryContainer,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.margin,
    marginBottom: SPACING.spaceLg,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.spaceSm,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: RADIUS.DEFAULT,
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 2,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.margin,
    gap: SPACING.spaceSm,
    marginBottom: SPACING.spaceLg,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.spaceSm,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    shadowColor: COLORS.primaryContainer,
    shadowRadius: 12,
    shadowOpacity: 0.3,
  },
  editText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.onPrimary,
  },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: SPACING.margin,
    padding: 3,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.spaceMd,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tabContent: {
    paddingHorizontal: SPACING.margin,
  },
  tabContentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.spaceSm,
  },
  tabContentTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tabContentAction: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primaryContainer,
  },
  spaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.spaceMd,
    marginBottom: SPACING.spaceSm,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: RADIUS.DEFAULT,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  spaceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceMd,
    flex: 1,
  },
  spaceIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.DEFAULT,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  spaceInfo: {
    flex: 1,
  },
  spaceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spaceName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.tertiaryContainer,
    shadowColor: COLORS.tertiaryContainer,
    shadowRadius: 4,
    shadowOpacity: 0.8,
  },
  spaceMeta: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  spaceRight: {
    alignItems: 'flex-end',
  },
  spaceStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  spaceStatusLive: {
    backgroundColor: COLORS.tertiaryContainer + '20',
  },
  spaceStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  spaceStatusTextLive: {
    color: COLORS.tertiaryFixedDim,
  },
  spaceActive: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },
});