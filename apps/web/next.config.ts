import type { NextConfig } from 'next';

// Local: dùng chung file .env ở gốc monorepo. Trên Vercel biến môi trường đặt trong dashboard.
try {
  process.loadEnvFile('../../.env');
} catch {}

const config: NextConfig = {
  transpilePackages: ['@app/core', '@app/connectors', '@app/products', '@app/du-an'],
  // Up ảnh: mỗi lần gửi một ảnh đã thu nhỏ (~150–400KB); để dư cho ảnh nhiều chi tiết
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};

export default config;
