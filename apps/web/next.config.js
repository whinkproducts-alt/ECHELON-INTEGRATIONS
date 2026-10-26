/* eslint-disable @typescript-eslint/no-require-imports */
/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Type errors fail the build (typecheck: `pnpm typecheck`). Run `prisma generate` first.
  // Next 16 builds with Turbopack by default. An explicit (empty) turbopack key tells Next the
  // custom webpack hook below is known, so the build does not abort on the conflict.
  turbopack: {},
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  outputFileTracingRoot: process.env.NEXT_OUTPUT_MODE ? path.join(__dirname, '../') : '/',
  images: { unoptimized: true },
  // Transpile the org-kit workspace package (TypeScript source, no build step)
  transpilePackages: ['@whink/org-kit'],
  // Next 16 BLOCKS unlisted origins on /_next/* and /__nextjs* in dev — including the /_next/hmr
  // WEBSOCKET upgrade, and Turbopack gates client module wiring on that socket, so a blocked origin
  // means the page renders but never hydrates, with no console error (the block writes a raw
  // non-HTTP reply onto the upgrade socket). Every conversation sharing this project directory —
  // the root and each of its forks — previews from its OWN subdomain against this one config, so
  // each of their hosts is named here; listing only the current one leaves the others hydrating
  // never. Plus 127.0.0.1 because Next's built-in default covers `localhost` but not the IP, and
  // the platform's browser checks on the pod browse via 127.0.0.1. Enumerated hosts, never a
  // wildcard: every conversation previews under the same parent domain and serves content its own
  // author controls, so `**.<domain>` would let any UNRELATED app's preview reach this dev server.
  allowedDevOrigins: ['127.0.0.1'],
  // Mark Node.js built-in modules correctly for each webpack target.
  // Browser bundle: set fallback to false so webpack does not try to polyfill.
  // Server / edge bundle: add externals so webpack emits `require('crypto')` etc.
  // instead of trying to bundle the Node built-in (which it cannot do).
  webpack: (config, { isServer }) => {
    const nodeBuiltins = [
      'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
      'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
      'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
      'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks',
      'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
      'stream/consumers', 'stream/promises', 'stream/web', 'string_decoder',
      'sys', 'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url',
      'util', 'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
    ];
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        ...Object.fromEntries(nodeBuiltins.map((m) => [m, false])),
      };
    } else {
      // For server and edge builds, mark Node built-ins as external so webpack
      // emits require() calls rather than attempting to bundle them.
      const prev = config.externals || [];
      const prevArr = Array.isArray(prev) ? prev : [prev];
      config.externals = [
        ...prevArr,
        ({ request }, callback) => {
          if (nodeBuiltins.includes(request)) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },

  // Static security headers. The Content-Security-Policy itself is per-request (nonce) and is
  // set in proxy.ts via lib/csp.ts.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

const fs = require('fs');
const userConfigPath = path.join(__dirname, 'next.config.user.json');
const userConfigAllowedKeys = { skipTrailingSlashRedirect: 'boolean', trailingSlash: 'boolean' };
if (fs.existsSync(userConfigPath)) {
  const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
  for (const key of Object.keys(userConfig)) {
    if (typeof userConfig[key] !== userConfigAllowedKeys[key]) {
      throw new Error(`next.config.user.json: unsupported override "${key}". Supported boolean keys: skipTrailingSlashRedirect, trailingSlash.`);
    }
    nextConfig[key] = userConfig[key];
  }
}

module.exports = nextConfig;

