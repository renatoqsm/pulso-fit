import type { NextConfig } from 'next';
import { resolve } from 'node:path';
const config: NextConfig = {
  poweredByHeader: false,
  webpack(config, { webpack }) {
    if (process.env.PULSO_TARGET === 'cloudflare') {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /local-d1(?:\.ts)?$/,
          resolve(process.cwd(), 'src/lib/worker-no-local.ts'),
        ),
      );
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default config;
