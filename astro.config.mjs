// @ts-check
import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';

// El sitio es estático salvo los dos endpoints de /api, que llevan
// `export const prerender = false` y se vuelven functions en Netlify.
export default defineConfig({
  output: 'static',
  adapter: netlify(),
  devToolbar: { enabled: false },

  /**
   * Las credenciales se declaran como secretos de servidor.
   *
   * Leyendolas con `import.meta.env`, Vite las sustituye por su valor literal
   * al compilar y la clave acaba escrita dentro del artefacto de la funcion.
   * Declaradas asi se leen del entorno en tiempo de ejecucion y nunca se
   * incrustan en el build.
   *
   * Opcionales a proposito: sin ellas la pagina funciona igual, con la paleta
   * por defecto.
   */
  env: {
    schema: {
      LASTFM_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      LASTFM_USER: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
