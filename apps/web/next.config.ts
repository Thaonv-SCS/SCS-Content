import type { NextConfig } from 'next';

// Local: dùng chung file .env ở gốc monorepo. Trên Vercel biến môi trường đặt trong dashboard.
try {
  process.loadEnvFile('../../.env');
} catch {}

const config: NextConfig = {
  transpilePackages: ['@app/core'],
};

export default config;
