import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
  info: string | null;
};

/**
 * Renders render-time failures instead of a silent blank screen.
 *
 * Without this, any exception thrown while mounting a route is swallowed and
 * the app shows nothing at all, which makes production bugs undiagnosable.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ info: info.componentStack ?? null });
    console.error("BRO render error:", error?.message, error?.stack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something broke</Text>
        <Text style={styles.message}>{error.message}</Text>
        <ScrollView style={styles.stackBox}>
          <Text style={styles.stack}>{error.stack ?? "no stack"}</Text>
          {info ? <Text style={styles.stack}>{info}</Text> : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
    padding: SPACING.spaceLg,
    paddingTop: SPACING.spaceXl,
  },
  title: {
    ...TYPOGRAPHY.headlineMD,
    color: COLORS.error,
    marginBottom: SPACING.spaceSm,
  },
  message: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    marginBottom: SPACING.spaceMd,
  },
  stackBox: {
    flex: 1,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.semantic.surfaceLevel1,
    padding: SPACING.spaceSm,
  },
  stack: {
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 14,
    color: COLORS.onSurfaceVariant,
  },
});