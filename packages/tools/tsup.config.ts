import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Optional peer dependencies — users install only what they need
  external: [
    'nodemailer',
    '@sendgrid/mail',
    'twilio',
    'stripe',
    'pg',
    'mysql2',
    'mysql2/promise',
    'ioredis',
  ],
});
