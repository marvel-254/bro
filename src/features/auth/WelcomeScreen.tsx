import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../../theme';
import { useAuth } from '../../lib/auth-context';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function WelcomeScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.logoSection}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>BRO</Text>
        </View>
        <Text style={styles.tagline}>Communication,</Text>
        <Text style={[styles.tagline, styles.taglineEmphasis]}>reimagined.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(auth)/sign-up')}>
          <Text style={styles.primaryBtnText}>Create account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
          <Text style={styles.secondaryBtnText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.onSurface,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.margin,
    paddingBottom: SPACING.spaceLg,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING.spaceXl,
  },
  logoBox: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: RADIUS.DEFAULT,
    marginBottom: SPACING.spaceLg,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primaryContainer,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.onSurface,
    textAlign: 'center',
  },
  taglineEmphasis: {
    fontWeight: '700',
    color: COLORS.primaryContainer,
  },
  actions: {
    gap: SPACING.spaceMd,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    shadowColor: COLORS.primaryContainer,
    shadowRadius: 16,
    shadowOpacity: 0.4,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.onPrimary,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    paddingVertical: SPACING.spaceSm,
  },
});