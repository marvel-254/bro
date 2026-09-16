import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SEMANTIC_COLORS } from '../../../theme';

export function ProfileHeader() {
  return (
    <View style={styles.container}>
      <View style={styles.avatarWrap}>
        <View style={styles.aura} />
        <View style={styles.gradientRing} />
        <View style={styles.avatar} />
        <View style={styles.pulseDot} />
      </View>
      <Text style={styles.name}>
        Langat Kiprono{' '}
        <Ionicons name="checkmark-circle" size={18} color={COLORS.tertiaryContainer} />
      </Text>
      <View style={styles.usernameRow}>
        <Text style={styles.username}>@langat</Text>
        <View style={styles.dot} />
        <View style={styles.meshBadge}>
          <Text style={styles.meshText}>L1-MESH NODE</Text>
        </View>
      </View>
      <Text style={styles.bio}>
        Building lightweight agent runtimes & zero-copy pipes. Nairobi Tech & AI Builders.
      </Text>
      <View style={styles.statusPill}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>ONLINE • MESH ACTIVE</Text>
        <View style={styles.divider} />
        <Text style={styles.statusSub}>Deep Focus</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  avatarWrap: {
    marginBottom: 16,
  },
  aura: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 9999,
    backgroundColor: 'rgba(107, 19, 175, 0.25)',
    shadowColor: COLORS.secondaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    shadowOpacity: 0.8,
    elevation: 8,
  },
  gradientRing: {
    width: 104,
    height: 104,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0, 240, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 9999,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9999,
    backgroundColor: COLORS.tertiaryContainer,
    borderWidth: 3,
    borderColor: SEMANTIC_COLORS.surfaceLevel1,
    shadowColor: COLORS.tertiaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 1,
    elevation: 6,
  },
  name: {
    color: COLORS.onSurface,
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Outfit',
    marginBottom: 6,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  username: {
    color: COLORS.primaryContainer,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Geist',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 9999,
    backgroundColor: SEMANTIC_COLORS.textDim,
    marginHorizontal: 10,
  },
  meshBadge: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.25)',
  },
  meshText: {
    color: COLORS.primaryContainer,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'Geist',
  },
  bio: {
    color: COLORS.onSurfaceVariant,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: 'Geist',
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 249, 132, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(0, 249, 132, 0.25)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 9999,
    backgroundColor: COLORS.tertiaryContainer,
    marginRight: 8,
    shadowColor: COLORS.tertiaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 1,
  },
  statusText: {
    color: COLORS.tertiaryContainer,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'Geist',
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(0, 249, 132, 0.3)',
    marginHorizontal: 10,
  },
  statusSub: {
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'Geist',
  },
});