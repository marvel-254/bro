import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../theme';
import { Avatar } from '../../components/ui/Avatar';
import { useCall } from '../../lib/call-context';

/**
 * Full-screen incoming call. Rendered as an overlay by the root layout so it
 * appears no matter which tab is open — a ringing phone that only rings when
 * you happen to be looking at the right screen is not a ringing phone.
 *
 * Declining here declines the row, so the caller sees a clean rejection.
 */
export default function IncomingCallOverlay() {
  const router = useRouter();
  const { phase, activeCall, accept, decline } = useCall();

  if (phase !== 'incoming' || !activeCall) {
    return null;
  }

  const onAccept = async () => {
    const callId = await accept();
    if (callId) {
      router.push(`/call/${callId}`);
    }
  };

  const isVideo = activeCall.kind === 'video';
  const name = activeCall.peerName ?? 'Someone';

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <Avatar name={name} size={72} />
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.sub}>
          Incoming {isVideo ? 'video' : 'voice'} call
        </Text>

        <View style={styles.actions}>
          <View style={styles.action}>
            <TouchableOpacity
              style={[styles.circle, styles.decline]}
              onPress={() => void decline()}
              accessibilityRole="button"
              accessibilityLabel="Decline call"
            >
              <Ionicons name="call-outline" size={26} color={COLORS.onSurface} style={styles.flipped} />
            </TouchableOpacity>
            <Text style={styles.actionLabel}>Decline</Text>
          </View>

          <View style={styles.action}>
            <TouchableOpacity
              style={[styles.circle, styles.accept]}
              onPress={() => void onAccept()}
              accessibilityRole="button"
              accessibilityLabel="Accept call"
            >
              <Ionicons
                name={isVideo ? 'videocam' : 'call'}
                size={26}
                color={COLORS.onPrimary}
              />
            </TouchableOpacity>
            <Text style={styles.actionLabel}>Accept</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 50,
  },
  card: {
    width: '82%',
    maxWidth: 340,
    alignItems: 'center',
    gap: SPACING.spaceXs,
    padding: SPACING.spaceLg,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  name: {
    ...TYPOGRAPHY.headlineSM,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginTop: SPACING.spaceSm,
  },
  sub: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.spaceXl,
    marginTop: SPACING.spaceMd,
  },
  action: {
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decline: {
    backgroundColor: COLORS.error,
  },
  accept: {
    backgroundColor: COLORS.primaryContainer,
  },
  flipped: {
    transform: [{ rotate: '135deg' }],
  },
  actionLabel: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
  },
});