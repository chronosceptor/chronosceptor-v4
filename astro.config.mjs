// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// El sitio es estático salvo los dos endpoints de /api, que llevan
// `export const prerender = false` y se vuelven functions en Netlify.
export default defineConfig({
  output: 'static',
  adapter: netlify(),
  devToolbar: { enabled: false },
});
