import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SEMANTIC_COLORS, SPACING, TYPOGRAPHY } from "../../theme";
import { signedChatUrl, type AttachmentRef } from "../../lib/media";

/**
 * Inline voice-note player.
 *
 * expo-av 16 is promise-based: `Sound.unloadAsync()`, `setOnPlaybackStatusUpdate`
 * receives a union (`AVPlaybackStatusError | AVPlaybackStatusSuccess`), and the
 * duration/finish flags only exist on the success variant behind `isLoaded`.
 * The previous code used the removed `unload()` method and read `durationMillis`
 * off the raw union, which is why `tsc` rejected it — those APIs are gone.
 *
 * The same `Sound` instance is reused across plays rather than loaded per tap:
 * loading an m4a from a signed URL on every press is slow and leaks a native
 * player per tap if it is never unloaded.
 */

interface Props {
  attachment: AttachmentRef | undefined;
}

const WAVEFORM_BARS = [
  6, 11, 17, 9, 21, 14, 8, 19, 24, 12, 7, 16, 10, 20, 13, 6,
];

import { formatVoiceDuration, playbackFraction } from "../../lib/voice-utils";

export default function VoiceMessage({ attachment }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (!attachment) return;
    let cancelled = false;
    setAudioUrl(null);
    setError(null);
    void signedChatUrl(attachment.storagePath, 3600)
      .then((url) => {
        if (cancelled) return;
        if (url) {
          setAudioUrl(url);
        } else {
          setError("Voice note unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Voice note unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  // Release the native player when the message scrolls away or the URL changes.
  useEffect(() => {
    return () => {
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) {
        void sound.unloadAsync().catch(() => {});
      }
    };
  }, [audioUrl]);

  const play = useCallback(async () => {
    if (!audioUrl || isPlaying) return;
    setError(null);
    try {
      let sound = soundRef.current;
      if (!sound) {
        sound = new Audio.Sound();
        await sound.loadAsync({ uri: audioUrl });
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) {
            setIsPlaying(false);
            return;
          }
          setPositionMillis(status.positionMillis);
          if (status.durationMillis != null) {
            setDurationMillis(status.durationMillis);
          }
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPositionMillis(0);
          }
        });
        soundRef.current = sound;
      } else {
        // Already loaded: rewind so a second tap plays the clip from the top.
        await sound.setPositionAsync(0);
      }

      const status = await sound.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.durationMillis != null) {
        setDurationMillis(status.durationMillis);
      }
      setPositionMillis(status.positionMillis);
      await sound.playAsync();
      setIsPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play that note");
      setIsPlaying(false);
    }
  }, [audioUrl, isPlaying]);

  const stop = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) {
      setIsPlaying(false);
      return;
    }
    try {
      await sound.pauseAsync();
      await sound.setPositionAsync(0);
      setPositionMillis(0);
    } catch {
      // A failed pause still leaves the button in the stopped state.
    }
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      void stop();
    } else {
      void play();
    }
  }, [isPlaying, play, stop]);

  if (!attachment) return null;

  if (!audioUrl) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error ?? "Loading voice note…"}</Text>
      </View>
    );
  }

  const total = Math.max(durationMillis, 0);
  const played = Math.round(
    (playbackFraction(positionMillis, total) || 0) * WAVEFORM_BARS.length,
  );

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.playButton}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        <Ionicons
          name={isPlaying ? "pause-circle" : "play-circle"}
          size={28}
          color={SEMANTIC_COLORS.textSecondary}
        />
      </Pressable>

      <View style={styles.waveform}>
        {WAVEFORM_BARS.map((height, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              { height },
              index < played ? styles.barPlayed : null,
            ]}
          />
        ))}
      </View>

      <Text style={styles.duration}>
        {formatVoiceDuration(positionMillis / 1000)} /{" "}
        {formatVoiceDuration(total / 1000)}
      </Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    paddingVertical: SPACING.spaceXs,
    minWidth: 220,
  },
  playButton: {
    padding: 2,
  },
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
    height: 26,
    flex: 1,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: SEMANTIC_COLORS.surfaceLevel2,
  },
  barPlayed: {
    backgroundColor: SEMANTIC_COLORS.textSecondary,
  },
  duration: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
    minWidth: 74,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  errorText: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.error,
  },
});