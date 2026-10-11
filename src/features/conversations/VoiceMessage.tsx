import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../theme";
import { signedChatUrl } from "../../lib/media";

interface Props {
  attachment: {
    id: string;
    storagePath: string;
    mime: string;
    bytes: number;
  } | null;
}

export default function VoiceMessage({ attachment }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (!attachment) return;
    let cancelled = false;
    signedChatUrl(attachment.storagePath, 3600)
      .then((url) => {
        if (!cancelled && url) setAudioUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  const play = useCallback(async () => {
    if (!audioUrl || isPlaying) return;
    try {
      const sound = new Audio.Sound();
      await sound.loadAsync({ uri: audioUrl });
      const status = await sound.getStatusAsync();
      setDuration(Math.floor(status.durationMillis / 1000));
      await sound.playAsync();
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
        }
      });
      setIsPlaying(true);
    } catch {
      // ignore
    }
  }, [audioUrl, isPlaying]);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unload();
      soundRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  }, [isPlaying, play, stop]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unload().catch(() => {});
      }
    };
  }, []);

  if (!attachment || !audioUrl) return null;

  return (
    <View style={styles.container}>
      <Pressable style={styles.playButton} onPress={toggle}>
        {isPlaying ? (
          <Ionicons name="pause-circle" size={28} color={COLORS.primary} />
        ) : (
          <Ionicons name="play-circle" size={28} color={COLORS.primary} />
        )}
      </Pressable>
      <View style={styles.waveform}>
        <View style={[styles.bar, { height: 12 }]} />
        <View style={[styles.bar, { height: 20 }]} />
        <View style={[styles.bar, { height: 16 }]} />
        <View style={[styles.bar, { height: 24 }]} />
        <View style={[styles.bar, { height: 10 }]} />
      </View>
      <Text style={styles.duration}>
        {duration > 0 ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}` : "0:00"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  playButton: {
    padding: 4,
  },
  waveform: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 24,
    flex: 1,
  },
  bar: {
    width: 4,
    backgroundColor: "rgba(0, 122, 255, 0.8)",
    borderRadius: 2,
    flex: 1,
  },
  duration: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    minWidth: 45,
    textAlign: "right",
  },
});
