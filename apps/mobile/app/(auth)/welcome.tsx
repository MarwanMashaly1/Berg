import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, useWindowDimensions, Linking } from 'react-native';
import { router } from 'expo-router';
import { Colors, Fonts } from '../../constants/theme';
import { Button } from '../../components/ui/Button';
import { GrainTexture } from '../../components/ui/GrainTexture';

const C = Colors.light;

export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const headlineFontSize = width < 360 ? 32 : 40;
  const headlineLineHeight = width < 360 ? 38 : 46;

  return (
    <SafeAreaView style={styles.safe}>
      <GrainTexture />

      {/* Warm orange glow rising from the bottom — dark moment accent */}
      <View style={styles.bottomGlow} pointerEvents="none" />

      <View style={styles.container}>

        {/* Spacer — pushes content to vertical center */}
        <View style={{ flex: 1 }} />

        {/* Hero — wordmark sits right above the headline */}
        <View style={styles.hero}>
          <View style={styles.wordmark}>
            <Text style={styles.wordmarkText}>BERG</Text>
          </View>

          <Text style={[styles.headline, { fontSize: headlineFontSize, lineHeight: headlineLineHeight }]}>
            The group chat{'\n'}that becomes{'\n'}
            <Text style={styles.headlineAccent}>the real thing.</Text>
          </Text>
          <View style={styles.accentRule} />
          <Text style={styles.subCopy}>
            Shared interests. Spontaneous plans.{'\n'}Memories worth keeping.
          </Text>
        </View>

        {/* Spacer — equal space below hero */}
        <View style={{ flex: 1 }} />

        {/* CTAs pinned to bottom */}
        <View style={styles.actions}>
          <Button
            label="Get started"
            onPress={() => router.push('/(auth)/signup')}
            fullWidth
            size="lg"
            style={styles.primaryBtn}
            textStyle={styles.primaryBtnText}
          />
          <TouchableOpacity
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.7}
            style={styles.signinRow}
          >
            <Text style={styles.signinText}>
              Have an account?{' '}
              <Text style={styles.signinLink}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.legal}>
          By continuing you agree to our{' '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL('https://berg.app/terms')}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL('https://berg.app/privacy')}>Privacy Policy</Text>.
        </Text>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.backgroundDarkDeep,
  },
  // Warm orange glow rising from bottom — absolutely positioned behind content
  bottomGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: 'rgba(255,107,53,0.10)',
    borderTopLeftRadius: 120,
    borderTopRightRadius: 120,
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  wordmarkText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.primary,
    letterSpacing: 2,
  },
  hero: {
    alignItems: 'center',
  },
  headline: {
    fontFamily: Fonts.heading,
    fontSize: 40,
    color: '#F2E8DC',
    lineHeight: 46,
    letterSpacing: -0.5,
    marginBottom: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  headlineAccent: {
    fontFamily: Fonts.headingRegular,
    color: C.primary,
    fontStyle: 'italic',
  },
  accentRule: {
    width: 28,
    height: 2,
    backgroundColor: C.primary,
    borderRadius: 2,
    marginBottom: 16,
  },
  subCopy: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: 'rgba(242,232,220,0.5)',
    lineHeight: 24,
    textAlign: 'center',
  },
  actions: {
    gap: 14,
    marginBottom: 14,
    alignSelf: 'stretch',
  },
  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
  },
  primaryBtnText: {
    color: C.textInverse,
    fontFamily: Fonts.bodySemiBold,
  },
  signinRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  signinText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: 'rgba(242,232,220,0.4)',
  },
  signinLink: {
    fontFamily: Fonts.bodySemiBold,
    color: C.primary,
  },
  legal: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: 'rgba(242,232,220,0.25)',
    textAlign: 'center',
    lineHeight: 16,
  },
  legalLink: {
    color: 'rgba(242,232,220,0.5)',
    textDecorationLine: 'underline',
  },
});
