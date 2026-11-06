import {fileURLToPath} from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Panel her istekte canlı veri gösterir; önbellek bileşenlerine gerek yok.
  cacheComponents: false,
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
