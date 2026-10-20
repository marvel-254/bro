import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SEMANTIC_COLORS, SPACING } from "../../theme";
import { insertAttachment, uploadAudioFile } from "../../lib/media";
import { sendMessage } from "../../lib/conversations";
import { newClientId, queueMessage, type OutboxEntry } from "../../lib/outbox";
import { getSupabase } from "../../lib/supabase";
import type { MessageRow } from "../../lib/database.types";

interface Props {
  conversationId: string;
  /** Only `id` is read; the rest stays optional so the app `User` shape fits. */
  currentUser: {
    id: string;
    username?: string;
    displayName?: string;
    avatar?: string | null;
    status?: string;
  } | null;
  disabled?: boolean;
  /** Fires once the row is linked, so the chat can render the note immediately. */
  onSent?: (message: MessageRow) => void;
  /** Fires when a failed note is queued, so the chat can show a retry bubble. */
  onQueued?: (entry: OutboxEntry) => void;
}

/**
 * Composer voice-note recorder.
 *
 * expo-av 16 is promise-based and its status object is a union, so every status
 * read is guarded behind `isLoaded` and `durationMillis` is optional (Android
 * reports it, some iOS streams do not). The previous version used the removed
 * `start()`/`stop()`/`unload()`/`release()` methods, which is why `tsc` failed.
 *
 * The ticker lives in a ref rather than state: putting the interval id in state
 * made the unmount cleanup depend on it, so every time the id was set the
 * effect tore down the recorder it had just started.
 */
export default function VoiceRecorder({
  conversationId,
  currentUser,
  disabled = false,
  onSent,
  onQueued,
}: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<Audio.Recording | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  /** Release both native handles and restore the normal audio mode. */
  const releaseNative = useCallback(() => {
    stopTicker();
    const sound = previewSoundRef.current;
    previewSoundRef.current = null;
    if (sound) {
      void sound.unloadAsync().catch(() => {});
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      void recorder.stopAndUnloadAsync().catch(() => {});
    }
    void Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  }, [stopTicker]);

  // Unmount only. No state in the deps, so nothing can tear down a live
  // recording except the component going away.
  useEffect(() => releaseNative, [releaseNative]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setError("Microphone access is off. Turn it on to send a voice note.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const recorder = new Audio.Recording();
      await recorder.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await recorder.startAsync();
      recorderRef.current = recorder;
      setElapsedTime(0);
      setIsRecording(true);
      tickerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start recording");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    stopTicker();
    try {
      await recorder.stopAndUnloadAsync();
      recorderRef.current = null;
      const uri = recorder.getURI();
      setRecordingUri(uri);
      setIsRecording(false);
      // The ticker counted whole seconds; trust it over the native duration,
      // which is not always populated on stop.
      setRecordingDuration((prev) => Math.max(prev, elapsedTime));
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop recording");
    }
  }, [elapsedTime, stopTicker]);

  const playPreview = useCallback(async () => {
    if (!recordingUri) return;
    setError(null);
    try {
      const previous = previewSoundRef.current;
      if (previous) {
        await previous.unloadAsync();
      }
      const sound = new Audio.Sound();
      await sound.loadAsync({ uri: recordingUri });
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.durationMillis != null) {
        setRecordingDuration(Math.round(status.durationMillis / 1000));
      }
      sound.setOnPlaybackStatusUpdate((update) => {
        if (update.isLoaded && update.didJustFinish) {
          setIsPlayingPreview(false);
        }
      });
      await sound.playAsync();
      previewSoundRef.current = sound;
      setIsPlayingPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play that note");
    }
  }, [recordingUri]);

  const stopPreview = useCallback(async () => {
    const sound = previewSoundRef.current;
    if (!sound) return;
    try {
      await sound.pauseAsync();
      await sound.setPositionAsync(0);
    } catch {
      // A failed pause still leaves the button in the stopped state.
    }
    setIsPlayingPreview(false);
  }, []);

  const discard = useCallback(() => {
    releaseNative();
    setRecordingUri(null);
    setIsRecording(false);
    setIsPlayingPreview(false);
    setElapsedTime(0);
    setRecordingDuration(0);
  }, [releaseNative]);

  const sendVoice = useCallback(async () => {
    if (!recordingUri || sendingVoice || !currentUser) return;
    setSendingVoice(true);
    setError(null);
    // Generated before the first attempt so a replay reuses it and cannot
    // create a second copy of the same voice note.
    const clientId = newClientId();
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Backend not configured");

      const { path, bytes } = await uploadAudioFile(
        conversationId,
        currentUser.id,
        recordingUri,
        "-voice",
      );

      const attachmentId = await insertAttachment({
        storagePath: path,
        thumbPath: null,
        mime: "audio/m4a",
        bytes,
        kind: "voice",
        messageId: null,
      });

      const sent = await sendMessage(conversationId, "", {
        messageType: "voice",
        clientId,
      });
      if (!sent.ok) throw new Error(sent.error);

      // `.select()` so a zero-row update (an RLS filter matching nothing) is
      // observable rather than reported as success -- the bug that silently
      // left every attachment unlinked before the UPDATE policy existed.
      const { data: linked, error: linkError } = await supabase
        .from("attachments")
        .update({ message_id: sent.message.id })
        .eq("id", attachmentId)
        .select("id");
      if (linkError) throw new Error(linkError.message);
      if (!linked || linked.length === 0) {
        throw new Error("Could not link that voice note");
      }

      discard();
      onSent?.(sent.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send that voice note",
      );
      // Keep the recording instead of discarding it, so the outbox can replay
      // the send once the connection is back. The local file is a cache file,
      // so a replay after too long simply fails the same way.
      const entry = await queueMessage({
        conversationId,
        content: "",
        clientId,
        kind: "voice",
        media: { localUri: recordingUri },
      });
      onQueued?.(entry);
    } finally {
      setSendingVoice(false);
    }
  }, [
    recordingUri,
    sendingVoice,
    currentUser,
    conversationId,
    discard,
    onSent,
    onQueued,
  ]);

  const formatDuration = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const secs = (safe % 60).toString().padStart(2, "0");
    return `${minutes}:${secs}`;
  };

  if (error) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText} numberOfLines={2}>
          {error}
        </Text>
        <Pressable
          onPress={discard}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={18} color={SEMANTIC_COLORS.textDim} />
        </Pressable>
      </View>
    );
  }

  if (isRecording) {
    return (
      <View style={styles.inline}>
        <Pressable
          style={styles.stopButton}
          onPress={() => void stopRecording()}
          disabled={sendingVoice}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
        >
          <Ionicons name="stop-circle" size={30} color={COLORS.error} />
        </Pressable>
        <Text style={styles.timer}>{formatDuration(elapsedTime)}</Text>
      </View>
    );
  }

  if (recordingUri) {
    return (
      <View style={styles.inline}>
        <Pressable
          style={styles.roundButton}
          onPress={isPlayingPreview ? () => void stopPreview() : () => void playPreview()}
          accessibilityRole="button"
          accessibilityLabel={isPlayingPreview ? "Stop preview" : "Play recording"}
        >
          <Ionicons
            name={isPlayingPreview ? "pause" : "play"}
            size={20}
            color={SEMANTIC_COLORS.textDim}
          />
        </Pressable>
        <Text style={styles.duration}>{formatDuration(recordingDuration)}</Text>
        <Pressable
          style={[styles.roundButton, styles.sendButton]}
          onPress={() => void sendVoice()}
          disabled={sendingVoice}
          accessibilityRole="button"
          accessibilityLabel="Send voice note"
        >
          {sendingVoice ? (
            <ActivityIndicator size="small" color={COLORS.onPrimary} />
          ) : (
            <Ionicons name="send-sharp" size={20} color={COLORS.onPrimary} />
          )}
        </Pressable>
        <Pressable
          style={styles.roundButton}
          onPress={discard}
          disabled={sendingVoice}
          accessibilityRole="button"
          accessibilityLabel="Discard recording"
        >
          <Ionicons name="trash-outline" size={20} color={SEMANTIC_COLORS.textDim} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.micButton}
      onPress={() => void startRecording()}
      disabled={disabled || sendingVoice}
      accessibilityRole="button"
      accessibilityLabel="Record a voice note"
    >
      <Ionicons name="mic-outline" size={22} color={SEMANTIC_COLORS.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
  },
  micButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stopButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  timer: {
    color: COLORS.error,
    fontVariant: ["tabular-nums"],
  },
  roundButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEMANTIC_COLORS.ghostBorderLight,
    borderRadius: RADIUS.full,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  duration: {
    color: SEMANTIC_COLORS.textDim,
    fontVariant: ["tabular-nums"],
    minWidth: 40,
    textAlign: "center",
  },
  errorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
    flex: 1,
  },
  errorText: {
    flex: 1,
    color: COLORS.error,
    fontSize: 12,
  },
});