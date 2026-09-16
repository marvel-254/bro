import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';
import { useAuth } from '../../lib/auth-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';

export default function SignInScreen() {
  const { signIn, error, clearError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setIsLoading(true);
    clearError();
    try {
      await signIn(email, password);
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
        <Text style={styles.title}>Welcome back</Text>

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
              placeholder="Enter password"
              placeholderTextColor={COLORS.semantic.textDim}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity>
              <Ionicons name="eye-off" size={18} color={COLORS.semantic.textDim} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.forgot}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn} disabled={isLoading}>
            <Text style={styles.signInText}>{isLoading ? 'Signing in...' : 'Sign in'}</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.socialBtn}>
            <Ionicons name="logo-google" size={20} color={COLORS.onSurface} />
            <Text style={styles.socialText}>Continue with Google</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.socialBtn}>
            <Ionicons name="logo-apple" size={20} color={COLORS.onSurface} />
            <Text style={styles.socialText}>Continue with Apple</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Don't have an account?</Text>
        <TouchableOpacity onPress={() => router.replace('/(auth)/sign-up')}>
          <Text style={styles.footerLink}>Create account</Text>
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
    paddingHorizontal: SPACING.margin,
    paddingTop: SPACING.spaceLg,
    paddingBottom: SPACING.spaceXl,
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
  forgot: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  forgotText: {
    fontSize: 13,
    color: COLORS.primaryContainer,
    fontWeight: '600',
  },
  signInBtn: {
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    marginTop: SPACING.spaceSm,
    shadowColor: COLORS.primaryContainer,
    shadowRadius: 16,
    shadowOpacity: 0.4,
  },
  signInText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onPrimary,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
    marginVertical: SPACING.spaceMd,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.outlineVariant,
  },
  dividerText: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.spaceSm,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 6,
  },
  socialText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurface,
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