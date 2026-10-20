import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_PRIVACY_SETTINGS,
  fetchPrivacySettings,
  savePrivacySettings,
  type PrivacySettings,
} from "./privacy";

/**
 * The signed-in user's privacy switches, shared by the settings screen and the
 * chat screen. Keeping one copy means turning typing off takes effect without
 * a restart, and every surface reads the same value.
 */

interface PrivacyState {
  settings: PrivacySettings;
  loading: boolean;
  saving: boolean;
  /** Applies and persists one or more switches. Reverts on failure. */
  update: (patch: Partial<PrivacySettings>) => Promise<boolean>;
}

const PrivacyContext = createContext<PrivacyState | null>(null);

export function usePrivacy(): PrivacyState {
  const ctx = useContext(PrivacyContext);
  if (!ctx) {
    throw new Error("usePrivacy must be used within PrivacyProvider");
  }
  return ctx;
}

export function PrivacyProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState<PrivacySettings>(
    DEFAULT_PRIVACY_SETTINGS,
  );
  const [loading, setLoading] = useState(Boolean(userId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSettings(DEFAULT_PRIVACY_SETTINGS);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void fetchPrivacySettings().then((loaded) => {
      if (!live) return;
      setSettings(loaded);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const update = useCallback(
    async (patch: Partial<PrivacySettings>) => {
      const previous = settings;
      setSettings((current) => ({ ...current, ...patch }));
      setSaving(true);
      const result = await savePrivacySettings(patch);
      setSaving(false);
      if (!result.ok) {
        setSettings(previous);
        return false;
      }
      return true;
    },
    [settings],
  );

  const value = useMemo(
    () => ({ settings, loading, saving, update }),
    [settings, loading, saving, update],
  );

  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}
