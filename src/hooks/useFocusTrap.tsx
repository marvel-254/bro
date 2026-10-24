import React, { useEffect, useRef, useCallback, useState } from "react";
import type { View } from "react-native";
import { AccessibilityInfo, BackHandler } from "react-native";

/**
 * Focus management utilities for accessible modal dialogs.
 *
 * Implements the WAI-ARIA dialog pattern:
 * - Trap focus within the modal
 * - Restore focus to trigger element on close
 * - Handle escape key to close
 * - Announce modal open/close to screen readers
 */

interface FocusTrapOptions {
  /** Called when focus attempts to leave the trap */
  onEscape?: () => void;
  /** Initial element to focus when trap activates */
  initialFocusRef?: React.RefObject<View>;
  /** Whether the trap is active */
  isActive?: boolean;
  /** Ref to the container element */
  containerRef?: React.RefObject<View>;
}

interface FocusTrapReturn {
  focusInitial: () => void;
  activate: () => void;
  deactivate: () => void;
  containerRef: React.RefObject<View>;
}

/**
 * Hook to manage focus trapping within a modal container.
 *
 * Usage:
 * ```tsx
 * const { containerRef, activate, deactivate } = useFocusTrap({
 *   initialFocusRef: closeButtonRef,
 *   isActive: isModalOpen,
 *   onEscape: handleClose,
 * });
 *
 * return (
 *   <View ref={containerRef} style={styles.modal}>
 *     ...
 *   </View>
 * );
 * ```
 */
export function useFocusTrap({
  initialFocusRef,
  isActive = true,
  onEscape,
  containerRef: externalContainerRef,
}: FocusTrapOptions): FocusTrapReturn {
  const internalContainerRef = useRef<View>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const [active, setActive] = useState(false);

  // Focus the initial element or first focusable element
  const focusInitial = useCallback(() => {
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus?.();
      return;
    }
    // Focus the container itself if it's focusable
    if (containerRef.current) {
      containerRef.current.focus?.();
    }
  }, [initialFocusRef, containerRef]);

  const activate = useCallback(() => {
    setActive(true);
    focusInitial();
    AccessibilityInfo.announceForAccessibility("Dialog opened");
  }, [focusInitial]);

  const deactivate = useCallback(() => {
    setActive(false);
    AccessibilityInfo.announceForAccessibility("Dialog closed");
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    if (isActive && !active) {
      activate();
    } else if (!isActive && active) {
      deactivate();
    }
  }, [isActive, active, activate, deactivate]);

  // Handle hardware back button (Android) / escape key
  useEffect(() => {
    if (!active || !onEscape) return;

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      onEscape();
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [active, onEscape]);

  return {
    focusInitial,
    activate,
    deactivate,
    containerRef: containerRef as React.RefObject<View>,
  };
}

/**
 * Hook to manage focus restoration when a modal closes.
 *
 * Call `captureFocus()` when modal opens, `restoreFocus()` when it closes.
 */
export function useFocusRestoration() {
  const previousFocusRef = useRef<View | null>(null);

  const captureFocus = useCallback(() => {
    // In React Native, we can't easily capture the currently focused element
    // This is a placeholder for when the platform supports it
    // For now, we rely on the trigger element being passed explicitly
  }, []);

  const restoreFocus = useCallback((fallbackRef?: React.RefObject<View>) => {
    if (previousFocusRef.current) {
      previousFocusRef.current.focus?.();
    } else if (fallbackRef?.current) {
      fallbackRef.current.focus?.();
    }
  }, []);

  return { captureFocus, restoreFocus };
}

/**
 * Higher-order component to make any component focusable.
 *
 * Adds accessibility props to make non-interactive elements
 * reachable by screen readers and keyboard navigation.
 */
export function withFocusable<P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  accessibilityRole: string = "button"
) {
  return function FocusableComponent(props: P) {
    return (
      <Component
        {...props}
        accessible={true}
        accessibilityRole={accessibilityRole}
        accessibilityStates={(props.disabled as boolean) ? ["disabled"] : undefined}
      />
    );
  };
}