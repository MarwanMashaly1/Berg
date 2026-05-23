/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'Berg',
  slug: 'berg',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'berg',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.berg.social',
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'app.berg.social',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/images/icon.png',
      backgroundColor: '#100D0B',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-contacts',
      {
        contactsPermission: 'Berg uses your contacts to find friends who are already on Berg.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Berg needs camera access to scan QR codes and take profile photos.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Berg needs photo library access to set your profile picture and add motive memories.',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Berg uses your location to suggest nearby places when creating a motive.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/icon.png',
        color: '#FF6B35',
        sounds: [],
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#100D0B',
        dark: {
          backgroundColor: '#100D0B',
        },
      },
    ],
    'expo-localization',
    'expo-secure-store',
    'expo-web-browser',
    // Sentry plugin disabled — sentry-cli fails to resolve in pnpm monorepo context on EAS
    // Re-enable once sentry-cli path is fixed or Sentry is configured as a post-build step
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'e69a7534-8fe9-46dc-bcf2-ae8e901e529c',
    },
  },
  owner: 'mmash',
};

module.exports = config;
