import { Platform } from "react-native";
import {
  requireOptionalNativeModule,
  type EventSubscription,
} from "expo-modules-core";

export interface KeyboardImagePayload {
  /** A cache copy of the keyboard's transient content URI. */
  uri?: string;
  mimeType?: string;
  error?: string;
}

type BroImeModule = {
  enableRichContent(): void;
  addListener(
    eventName: "onRichContent",
    listener: (payload: KeyboardImagePayload) => void,
  ): EventSubscription;
};

const nativeModule =
  Platform.OS === "android"
    ? requireOptionalNativeModule<BroImeModule>("BroIme")
    : null;

/**
 * Ask the native module to attach an image receive-content listener to the
 * currently focused composer. Call from TextInput `onFocus`; the module looks
 * up the window's focused view, so no native view tag is needed.
 */
export function enableKeyboardRichContent(): void {
  try {
    nativeModule?.enableRichContent();
  } catch {
    // Older Android versions or a missing native build: the in-app picker is
    // still the fallback, so this must never break typing.
  }
}

export function onKeyboardRichContent(
  listener: (payload: KeyboardImagePayload) => void,
): EventSubscription | null {
  if (!nativeModule) return null;
  try {
    return nativeModule.addListener("onRichContent", listener);
  } catch {
    return null;
  }
}
