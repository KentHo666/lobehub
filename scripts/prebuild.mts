import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

// Use createRequire for CommonJS module compatibility
const require = createRequire(import.meta.url);
const { checkDeprecatedAuth } = require('./_shared/checkDeprecatedAuth.js');

const isServerDB = !!process.env.DATABASE_URL;

dotenvExpand.expand(dotenv.config());

const AUTH_SECRET_DOC_URL =
  'https://lobehub.com/docs/self-hosting/environment-variables/auth#auth-secret';
const KEY_VAULTS_SECRET_DOC_URL =
  'https://lobehub.com/docs/self-hosting/environment-variables/basic#key-vaults-secret';

/**
 * Check for required environment variables in server database mode
 */
const checkRequiredEnvVars = () => {
  if (!isServerDB) return;

  const missingVars: { docUrl: string; name: string }[] = [];

  if (!process.env.AUTH_SECRET) {
    missingVars.push({ docUrl: AUTH_SECRET_DOC_URL, name: 'AUTH_SECRET' });
  }

  if (!process.env.KEY_VAULTS_SECRET) {
    missingVars.push({ docUrl: KEY_VAULTS_SECRET_DOC_URL, name: 'KEY_VAULTS_SECRET' });
  }

  if (missingVars.length > 0) {
    console.error('\n' + '═'.repeat(70));
    console.error('❌ ERROR: Missing required environment variables!');
    console.error('═'.repeat(70));
    console.error('\nThe following environment variables are required for server database mode:\n');
    for (const { name, docUrl } of missingVars) {
      console.error(`  • ${name}`);
      console.error(`    📖 Documentation: ${docUrl}\n`);
    }
    console.error('Please configure these environment variables and redeploy.');
    console.error(
      '\n💡 TIP: If you previously used NEXT_AUTH_SECRET, simply rename it to AUTH_SECRET.',
    );
    console.error('═'.repeat(70) + '\n');
    process.exit(1);
  }
};

const getCommandVersion = (command: string): string | null => {
  try {
    return execSync(`${command} --version`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .trim()
      .split('\n')[0];
  } catch {
    return null;
  }
};

const printEnvInfo = () => {
  console.log('\n📋 Build Environment Info:');
  console.log('─'.repeat(50));

  // Runtime versions
  console.log(`  Node.js: ${process.version}`);
  console.log(`  npm: ${getCommandVersion('npm') ?? 'not installed'}`);

  const bunVersion = getCommandVersion('bun');
  if (bunVersion) console.log(`  bun: ${bunVersion}`);

  const pnpmVersion = getCommandVersion('pnpm');
  if (pnpmVersion) console.log(`  pnpm: ${pnpmVersion}`);

  // Auth-related env vars
  console.log('\n  Auth Environment Variables:');
  console.log(`    APP_URL: ${process.env.APP_URL ?? '(not set)'}`);
  console.log(`    VERCEL_URL: ${process.env.VERCEL_URL ?? '(not set)'}`);
  console.log(`    VERCEL_BRANCH_URL: ${process.env.VERCEL_BRANCH_URL ?? '(not set)'}`);
  console.log(
    `    VERCEL_PROJECT_PRODUCTION_URL: ${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '(not set)'}`,
  );
  console.log(`    AUTH_EMAIL_VERIFICATION: ${process.env.AUTH_EMAIL_VERIFICATION ?? '(not set)'}`);
  console.log(`    AUTH_ENABLE_MAGIC_LINK: ${process.env.AUTH_ENABLE_MAGIC_LINK ?? '(not set)'}`);

  // Check SSO providers configuration
  const ssoProviders = process.env.AUTH_SSO_PROVIDERS;
  console.log(`    AUTH_SSO_PROVIDERS: ${ssoProviders ?? '(not set)'}`);

  if (ssoProviders) {
    const getEnvPrefix = (provider: string) =>
      `AUTH_${provider.toUpperCase().replaceAll('-', '_')}`;

    const providers = ssoProviders
      .split(/[,，]/)
      .map((p) => p.trim())
      .filter(Boolean);
    const missingProviders: string[] = [];

    for (const provider of providers) {
      const envPrefix = getEnvPrefix(provider);
      const hasEnvVar = Object.keys(process.env).some((key) => key.startsWith(envPrefix));
      if (!hasEnvVar) {
        missingProviders.push(provider);
      }
    }

    if (missingProviders.length > 0) {
      console.log('\n  ⚠️  SSO Provider Configuration Warning:');
      for (const provider of missingProviders) {
        console.log(
          `    - "${provider}" is configured but no ${getEnvPrefix(provider)}_* env vars found`,
        );
      }
    }
  }

  console.log('─'.repeat(50));
};

// Check if the script is being run directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  // Check for deprecated auth env vars first - fail fast if found
  checkDeprecatedAuth();

  // Check for required env vars in server database mode
  checkRequiredEnvVars();

  printEnvInfo();
}
