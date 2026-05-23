import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, Fonts } from '../constants/theme';
import { captureError } from '../lib/analytics';

interface State { hasError: boolean; errorMessage?: string }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError(error, { componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>!</Text>
          </View>
        </View>
        <Text style={styles.heading}>Something went wrong</Text>
        <Text style={styles.body}>
          We've been notified and are looking into it.{'\n'}
          Please restart the app.
        </Text>
        {!!this.state.errorMessage && (
          <Text style={styles.debugError}>{this.state.errorMessage}</Text>
        )}
        <TouchableOpacity
          style={styles.btn}
          activeOpacity={0.8}
          onPress={() => this.setState({ hasError: false })}
        >
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: { marginBottom: 24 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: C.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontFamily: Fonts.heading, fontSize: 32, color: C.primary },
  heading: {
    fontFamily: Fonts.heading,
    fontSize: 26, color: C.text,
    letterSpacing: -0.5, marginBottom: 12, textAlign: 'center',
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 15, color: C.textSecondary,
    lineHeight: 22, textAlign: 'center', marginBottom: 36,
  },
  btn: {
    backgroundColor: C.text, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 40,
  },
  btnText: { fontFamily: Fonts.bodySemiBold, fontSize: 16, color: '#fff' },
  debugError: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
});
