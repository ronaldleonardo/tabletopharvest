import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.tabletopharvest.com',
  compressHTML: true,
  integrations: [sitemap()],
  build: {
    format: 'file',
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: ['mia.ronaldleonardo.com', 'www.tabletopharvest.com', 'tabletopharvest.com'],
  },
});