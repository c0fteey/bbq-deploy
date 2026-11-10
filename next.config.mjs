import {fileURLToPath} from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Panel her istekte canlı veri gösterir; önbellek bileşenlerine gerek yok.
  cacheComponents: false,
  // Ajan güncelleme dosyası sunucu fonksiyonunda okunur; Vercel paketine dahil edilsin.
  outputFileTracingIncludes: {'/api/agent/*': ['./agent/**'], '/api/agent/**': ['./agent/**']},
  // Botun savaş görselleri VDS'teki görsel sunucusundan gelir; Micup https ister, Vercel https'i hazır verir.
  // https://bbq-deploy.vercel.app/savas/<id>.jpg → VDS'teki sunucu (BATTLE_IMAGE_ORIGIN ile değiştirilebilir).
  async rewrites() {
    const origin = (process.env.BATTLE_IMAGE_ORIGIN || 'http://45.141.150.223:8080').replace(/\/+$/, '');
    return [{source: '/savas/:file', destination: `${origin}/savas/:file`}];
  },
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
