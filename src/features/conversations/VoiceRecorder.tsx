import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import {
  COLORS,
  RADIUS,
  SEMANTIC_COLORS,
  SPACING,
} from "../../theme";
import {
  uploadAudioFile,
  insertAttachment,
} from "../../lib/media";
import { sendMessage } from "../../lib/conversations";
import { getSupabase } from "../../lib/supabase";

interface Props {
  conversationId: string;
  currentUser: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
    status: string;
  } | null;
  disabled?: boolean;
  onSend?: () => void;
}

export default function VoiceRecorder({
  conversationId,
  currentUser,
  disabled = false,
  onSend,
}: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [timerID, setTimerID] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const voiceRecorderRef = useRef<Audio.Recording | null>(null);
  const voicePreviewSoundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      if (voicePreviewSoundRef.current) {
        voicePreviewSoundRef.current.unload().catch(() => {});
      }
      if (voiceRecorderRef.current) {
        voiceRecorderRef.current.release().catch(() => {});
      }
      if (timerID) clearInterval(timerID);
    };
  }, [timerID]);

  const startRecording = useCallback(async () => {
    try {
      const granted = await Audio.requestPermissionsAsync();
      if (!granted.granted) {
        setError("Audio recording permission is required");
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
      await recorder.start();
      voiceRecorderRef.current = recorder;
      setIsRecording(true);
      setElapsedTime(0);
      const timer = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
      setTimerID(timer);
    } catch {
      setError("Failed to start recording");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      const recorder = voiceRecorderRef.current;
      if (!recorder) return;
      await recorder.stop();
      const uri = recorder.getURI();
      setRecordingUri(uri);
      setIsRecording(false);
      setRecordingDuration(elapsedTime);
      if (timerID) clearInterval(timerID);
      setTimerID(null);
    } catch {
      setError("Failed to stop recording");
    }
  }, [elapsedTime, timerID]);

  const playPreview = useCallback(async () => {
    if (!recordingUri) return;
    try {
      if (voicePreviewSoundRef.current) {
        await voicePreviewSoundRef.current.unload();
      }
      const sound = new Audio.Sound();
      await sound.loadAsync({ uri: recordingUri });
      const status = await sound.getStatusAsync();
      setRecordingDuration(Math.floor(status.durationMillis / 1000));
      await sound.playAsync();
      voicePreviewSoundRef.current = sound;
      setIsPlayingPreview(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlayingPreview(false);
        }
      });
    } catch {
      setError("Failed to play preview");
    }
  }, [recordingUri]);

  const stopPreview = useCallback(async () => {
    try {
      if (voicePreviewSoundRef.current) {
        await voicePreviewSoundRef.current.unload();
        voicePreviewSoundRef.current = null;
        setIsPlayingPreview(false);
      }
    } catch {
      // ignore
    }
  }, []);

  const deleteRecording = useCallback(() => {
    try {
      if (voicePreviewSoundRef.current) {
        voicePreviewSoundRef.current.unload();
        voicePreviewSoundRef.current = null;
      }
      if (voiceRecorderRef.current) {
        voiceRecorderRef.current.release();
        voiceRecorderRef.current = null;
      }
      setRecordingUri(null);
      setIsRecording(false);
      setIsPlayingPreview(false);
      setElapsedTime(0);
      setRecordingDuration(0);
      if (timerID) clearInterval(timerID);
      setTimerID(null);
    } catch {
      // ignore
    }
  }, [timerID]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const sendVoice = useCallback(async () => {
    if (!recordingUri || sendingVoice || !currentUser) return;
    setSendingVoice(true);
    setError(null);
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
        messageId: null,
      });

      const sent = await sendMessage(conversationId, "", {
        messageType: "voice",
      });
      if (!sent.ok) throw new Error(sent.error ?? "Failed to send message");

      await supabase
        .from("attachments")
        .update({ message_id: sent.message.id })
        .eq("id", attachmentId);

      deleteRecording();
      onSend?.();
    } catch {
      setError("Failed to send voice message");
    } finally {
      setSendingVoice(false);
    }
  }, [recordingUri, sendingVoice, currentUser, conversationId, deleteRecording, onSend]);

  const renderRecording = () => (
    <View style={styles.recordingContainer}>
      <Pressable
        style={[styles.voiceButton, styles.voiceButtonRecording]}
        onPress={stopRecording}
        disabled={sendingVoice}
        accessibilityRole="button"
        accessibilityLabel="Stop recording"
      >
        <Ionicons name="stop-circle" size={28} color={COLORS.error} />
      </Pressable>
      <Text style={styles.voiceTimer}>
        {formatDuration(elapsedTime)}
      </Text>
    </View>
  );

  const renderPreview = () => (
    <View style={styles.previewContainer}>
      <Pressable
        style={[styles.voicePlayButton, isPlayingPreview && styles.voicePlayButtonPlaying]}
        onPress={isPlayingPreview ? stopPreview : playPreview}
      >
        {isPlayingPreview ? (
          <Ionicons name="pause-outline" size={24} color={SEMANTIC_COLORS.textDim} />
        ) : (
          <Ionicons name="play-outline" size={24} color={SEMANTIC_COLORS.textDim} />
        )}
      </Pressable>
      <Text style={styles.voiceDuration}>
        {formatDuration(recordingDuration)}
      </Text>
      <Pressable
        style={styles.voiceSendButton}
        onPress={sendVoice}
        disabled={sendingVoice}
      >
        {sendingVoice ? (
          <ActivityIndicator size="small" color={SEMANTIC_COLORS.textDim} />
        ) : (
          <Ionicons name="send-sharp" size={20} color={COLORS.onPrimary} />
        )}
      </Pressable>
      <Pressable
        style={styles.voiceDeleteButton}
        onPress={deleteRecording}
      >
        <Ionicons name="trash-outline" size={22} color={SEMANTIC_COLORS.textDim} />
      </Pressable>
    </View>
  );

  const renderIdle = () => (
    <Pressable
      style={styles.voiceButton}
      onPress={startRecording}
      disabled={disabled || sendingVoice}
      accessibilityRole="button"
      accessibilityLabel="Start voice recording"
    >
      <Ionicons name="mic-outline" size={22} color={SEMANTIC_COLORS.textDim} />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {isRecording ? renderRecording() : recordingUri ? renderPreview() : renderIdle()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  recordingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
  },
  voiceButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  voiceButtonRecording: {
    backgroundColor: COLORS.error,
    borderRadius: RADIUS.full,
  },
  voiceTimer: {
    fontSize: 12,
    color: COLORS.error,
  },
  voicePlayButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
  },
  voicePlayButtonPlaying: {
    backgroundColor: COLORS.primaryContainer,
  },
  voiceDuration: {
    fontSize: 12,
    color: SEMANTIC_COLORS.textDim,
  },
  voiceSendButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  voiceDeleteButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginBottom: SPACING.spaceXs,
  },
});
