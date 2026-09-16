import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';
import { useAuth } from '../../lib/auth-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';

export default function SignUpScreen() {
  const { signUp, error, clearError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    clearError();
    try {
      await signUp(email, password);
      router.replace('/(tabs)');
    } catch {
      // Error is set in auth context
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding', android: undefined })}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.onSurface} />
        </TouchableOpacity>

        <Text style={styles.logo}>BRO</Text>
        <Text style={styles.title}>Create your BRO</Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.input}>
            <Ionicons name="mail" size={18} color={COLORS.semantic.textDim} />
            <TextInput
              style={styles.inputText}
              placeholder="operator@domain.network"
              placeholderTextColor={COLORS.semantic.textDim}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.input}>
            <Ionicons name="lock-closed" size={18} color={COLORS.semantic.textDim} />
            <TextInput
              style={styles.inputText}
              placeholder="Min 8 characters"
              placeholderTextColor={COLORS.semantic.textDim}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity>
              <Ionicons name="eye-off" size={18} color={COLORS.semantic.textDim} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.continueBtn} onPress={handleSignUp} disabled={isLoading}>
            <Text style={styles.continueText}>{isLoading ? 'Creating...' : 'Continue'}</Text>
          </TouchableOpacity>

          <Text style={styles.terms}>
            By continuing, you agree to BRO Protocol Terms & Telepathic Privacy Standards.
          </Text>
        </View>

        <Text style={styles.footer}>Already have an account?</Text>
        <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
          <Text style={styles.footerLink}>Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.margin,
    paddingBottom: SPACING.spaceLg,
  },
  backBtn: {
    marginBottom: SPACING.spaceLg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primaryContainer,
    letterSpacing: 2,
    marginBottom: SPACING.spaceLg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginBottom: SPACING.spaceXl,
  },
  errorContainer: {
    backgroundColor: COLORS.error,
    padding: SPACING.spaceMd,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.spaceMd,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  form: {
    gap: SPACING.spaceMd,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: 14,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  inputText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.onSurface,
  },
  continueBtn: {
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    marginTop: SPACING.spaceSm,
    shadowColor: COLORS.primaryContainer,
    shadowRadius: 16,
    shadowOpacity: 0.4,
  },
  continueText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onPrimary,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  terms: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginTop: SPACING.spaceMd,
    lineHeight: 18,
  },
  footer: {
    textAlign: 'center',
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    marginTop: SPACING.spaceLg,
  },
  footerLink: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primaryContainer,
    marginTop: 4,
    paddingVertical: SPACING.spaceSm,
  },
});