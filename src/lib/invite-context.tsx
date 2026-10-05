import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { Linking } from "react-native";
import {
  type InvitePayload,
  parseInviteUrl,
  savePendingInvite,
  getPendingInvite,
  clearPendingInvite,
} from "./invites";

interface InviteContextValue {
  pendingInvite: InvitePayload | null;
  setPendingInvite: (invite: InvitePayload | null) => void;
  clearInvite: () => Promise<void>;
  consumeInvite: () => Promise<{ success: boolean; destination?: string }>;
}

const InviteContext = createContext<InviteContextValue | null>(null);

export function useInvites(): InviteContextValue {
  const ctx = useContext(InviteContext);
  if (!ctx) {
    throw new Error("useInvites must be used within an InviteProvider");
  }
  return ctx;
}

export function InviteProvider({ children }: { children: ReactNode }) {
  const [pendingInvite, setPendingInviteState] = useState<InvitePayload | null>(
    null,
  );

  // Load any previously saved invite on mount
  useEffect(() => {
    getPendingInvite().then((saved) => {
      if (saved) {
        setPendingInviteState(saved);
      }
    });
  }, []);

  const handleUrl = useCallback((url: string | null) => {
    if (!url) return;
    const parsed = parseInviteUrl(url);
    if (parsed) {
      setPendingInviteState(parsed);
      savePendingInvite(parsed);
    }
  }, []);

  // Listen to deep links on app launch and while open
  useEffect(() => {
    // 1. Initial URL when app was launched from a link
    Linking.getInitialURL().then(handleUrl);

    // 2. Incoming URLs while the app is active
    const subscription = Linking.addEventListener("url", (event) => {
      handleUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleUrl]);

  const setPendingInvite = useCallback((invite: InvitePayload | null) => {
    setPendingInviteState(invite);
    if (invite) {
      savePendingInvite(invite);
    } else {
      clearPendingInvite();
    }
  }, []);

  const clearInvite = useCallback(async () => {
    setPendingInviteState(null);
    await clearPendingInvite();
  }, []);

  const consumeInvite = useCallback(async (): Promise<{
    success: boolean;
    destination?: string;
  }> => {
      if (!pendingInvite) {
        return { success: false };
      }

      const invite = pendingInvite;
      let destination: string | undefined;

      if (invite.targetType === "space" && invite.spaceId) {
        destination = `/spaces/${invite.spaceId}`;
      } else if (invite.targetType === "user" && invite.targetId) {
        destination = `/chat/${invite.targetId}`;
      } else {
        destination = "/(tabs)";
      }

      await clearInvite();
      return { success: true, destination };
    },
    [pendingInvite, clearInvite],
  );

  return (
    <InviteContext.Provider
      value={{
        pendingInvite,
        setPendingInvite,
        clearInvite,
        consumeInvite,
      }}
    >
      {children}
    </InviteContext.Provider>
  );
}
