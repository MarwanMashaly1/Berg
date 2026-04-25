const path = require('path');
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getSentryExpoConfig(projectRoot);

// Watch all workspace packages so Metro sees changes in packages/shared, etc.
config.watchFolders = [workspaceRoot];

// Module resolution: check app-local node_modules first, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Required for pnpm: packages are symlinked, not hoisted
config.resolver.unstable_enableSymlinks = true;

// Required for packages that use the "exports" field (better-auth, etc.)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;