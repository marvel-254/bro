import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../theme';
import { Avatar } from '../../components/ui/Avatar';
import { useCall } from '../../lib/call-context';
import { LoadingState } from '../../components/feedback/States';

/**
 * The in-call screen. Video fills the frame with the local preview
 * picture-in-picture; voice calls show the peer's avatar and a timer.
 *
 * The screen follows the provider phase, not its own copy of it: when the row
 * reports declined/ended/missed the provider tears down and this screen leaves.
 * That keeps one source of truth for hangup in every direction.
 */

function useElapsed(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return seconds;
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ControlButton({
  icon,
  label,
  onPress,
  active = false,
  danger = false,
  disabled = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.control}>
      <TouchableOpacity
        style={[
          styles.circle,
          active && styles.circleActive,
          danger && styles.circleDanger,
          disabled && styles.circleDisabled,
        ]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons
          name={icon as never}
          size={24}
          color={danger || active ? COLORS.onPrimary : COLORS.onSurface}
        />
      </TouchableOpacity>
      <Text style={styles.controlLabel}>{label}</Text>
    </View>
  );
}

export default function CallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    phase,
    activeCall,
    engineState,
    localStream,
    remoteStream,
    muted,
    speakerOn,
    callError,
    hangUp,
    toggleMute,
    toggleSpeaker,
    flipCamera,
    dismissError,
  } = useCall();

  const connected = engineState === 'connected' || phase === 'active';
  const elapsed = useElapsed(connected);

  // The other side hung up, declined, or never picked up: leave.
  useEffect(() => {
    if (phase === 'idle') {
      router.replace('/(tabs)/chats');
    }
  }, [phase, router]);

  useEffect(() => {
    if (callError) {
      Alert.alert('Call problem', callError, [{ text: 'OK', onPress: dismissError }]);
    }
  }, [callError, dismissError]);

  if (!activeCall || phase === 'idle') {
    return <LoadingState message="Ending call..." />;
  }

  const isVideo = activeCall.kind === 'video';
  const name = activeCall.peerName ?? 'Someone';
  const statusText =
    phase === 'outgoing' ? 'Ringing...' : connected ? formatElapsed(elapsed) : 'Connecting...';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {isVideo ? (
        <View style={styles.videoStage}>
          {remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={styles.remoteVideo}
              objectFit="cover"
            />
          ) : (
            <View style={styles.waitingVideo}>
              <Avatar name={name} size={88} />
              <Text style={styles.waitingText}>{statusText}</Text>
            </View>
          )}
          {localStream ? (
            <View style={styles.pip}>
              <RTCView streamURL={localStream.toURL()} style={styles.pipVideo} objectFit="cover" mirror />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.voiceStage}>
          <Avatar name={name} size={96} />
          <Text style={styles.voiceName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.voiceStatus}>{statusText}</Text>
        </View>
      )}

      <View style={[styles.controls, { paddingBottom: insets.bottom + SPACING.spaceLg }]}>
        <ControlButton
          icon={muted ? 'mic-off' : 'mic'}
          label={muted ? 'Unmute' : 'Mute'}
          onPress={toggleMute}
          active={muted}
        />
        <ControlButton
          icon={speakerOn ? 'volume-high' : 'volume-medium'}
          label="Speaker"
          onPress={toggleSpeaker}
          active={speakerOn}
        />
        {isVideo ? (
          <ControlButton icon="camera-reverse" label="Flip" onPress={flipCamera} />
        ) : null}
        <ControlButton icon="call" label="End" onPress={() => void hangUp()} danger />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  videoStage: {
    flex: 1,
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  waitingVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.spaceSm,
  },
  waitingText: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurfaceVariant,
  },
  pip: {
    position: 'absolute',
    top: SPACING.spaceMd,
    right: SPACING.spaceMd,
    width: 96,
    height: 140,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  pipVideo: {
    flex: 1,
  },
  voiceStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.spaceXs,
  },
  voiceName: {
    ...TYPOGRAPHY.headlineMD,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginTop: SPACING.spaceSm,
  },
  voiceStatus: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurfaceVariant,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.spaceLg,
    paddingTop: SPACING.spaceMd,
  },
  control: {
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  circleActive: {
    backgroundColor: COLORS.primaryContainer,
  },
  circleDanger: {
    backgroundColor: COLORS.error,
  },
  circleDisabled: {
    opacity: 0.5,
  },
  controlLabel: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
  },
});