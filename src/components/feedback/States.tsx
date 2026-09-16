import { ReactNode } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { COLORS } from '../../theme';

interface LoadingStateProps {
  message?: string;
  onRetry?: () => void;
}

export function LoadingState({ message = 'Loading...', onRetry }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primaryContainer} />
      {message ? <Text style={styles.text}>{message}</Text> : null}
      {onRetry ? (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message = 'Something went wrong',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function EmptyState({
  message = 'Nothing here yet',
  icon,
}: {
  message?: string;
  icon?: ReactNode;
}) {
  return (
    <View style={styles.container}>
      {icon}
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  text: {
    color: COLORS.onSurfaceVariant,
    marginTop: 12,
  },
  errorText: {
    color: COLORS.error,
    marginBottom: 16,
  },
  emptyText: {
    color: COLORS.onSurfaceVariant,
    marginTop: 12,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 999,
  },
  retryText: {
    color: COLORS.onPrimary,
    fontWeight: '600',
  },
});