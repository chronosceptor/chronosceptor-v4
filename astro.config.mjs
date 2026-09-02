// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// El sitio es enteramente estático: no queda nada que resolver en el servidor.
export default defineConfig({
  site: 'https://chronosceptor.com',
  output: 'static',
  adapter: netlify(),
  devToolbar: { enabled: false },
});
