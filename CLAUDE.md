# CLAUDE.md

Lienzo de física: cae arena, el usuario dibuja paredes que la desvían, y el color sale de
la portada del disco que suena (Last.fm). Astro estático + 2 endpoints serverless.

La justificación de fondo de cada decisión de física está en el README, sección
**"Decisiones no obvias"**. Léela antes de tocar `src/sand/`.

## Entorno

- **Node 22 obligatorio** (Astro 7 exige ≥22.12). El `node` por defecto de esta máquina es
  20.19.6 y falla al arrancar. Hay `.nvmrc`: `nvm use`, o
  `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` en cada shell.
- `npx astro dev` queda **corriendo en segundo plano** entre invocaciones. `astro dev stop`
  para matarlo, `astro dev logs` para leerlo.
- No hay PHP instalado: `php/*.php` nunca se ha ejecutado ni pasado `php -l`.

## Gotchas que ya costaron tiempo

- **Vite sirve el CSS viejo tras editar un `<style>` de un `.astro`.** El marcado se
  actualiza pero los estilos no. Pasó dos veces y en ambas concluí en falso que mi edición
  no se había aplicado. Cura: `astro dev stop && rm -rf node_modules/.vite` y relanzar.
- **Verifica que una edición aterrizó antes de medir nada.** Dos reemplazos de texto con
  `python3 .replace()` no encontraron su objetivo y fallaron en silencio; estuve varios
  turnos midiendo código que nunca cambió y culpando a la caché. Usa la herramienta Edit
  (falla en alto) o confirma con `grep` después de escribir.
- **Nunca `import.meta.env` para secretos de servidor.** Vite lo sustituye por el valor
  literal al compilar y la API key acaba dentro del artefacto. Van por `astro:env/server`
  con `access: 'secret'`.
- **El sumidero solo puede ir en la última fila.** Repartido en altura, la arena se consume
  en el aire y aparecen huecos negros de la nada.
- **Instantáneas no miden caudal.** Contar granos por zona en un sistema en flujo da
  deltas negativos sin sentido; hay que hacer series temporales.

## Depuración

Todo desde la consola del navegador, sobre `window.fabrica`:

- `fabrica.dump(x, y, w, h)` — vuelca los materiales de una región como texto. **Es la que
  encontró todos los bugs de física**; sin ella no se ve por qué la arena no pasa.
- `fabrica.inspect()` — arena, paredes, fps, coste real de simulación y pintado, celdas
  despiertas.
- `fabrica.clear()` — vacía el lienzo.

Parámetros de URL: `?debug=1` (overlay), `?mock=1` (canción fija, sin API key),
`?fill=0.2` (baja el nivel de disparo del drenaje; sin esto, probar la descarga son varios
minutos por ciclo).

## Rendimiento

El coste va con la arena **en movimiento**, no con la total: los granos asentados se
duermen. Medido: 90.000 granos → 1,4 ms de simulación por frame de un presupuesto de 16,7.
Si algo va lento, el sospechoso no es el número de granos.

## Historia

El primer commit (`253dbfc`) es una versión distinta del proyecto: una fábrica generativa
con línea de ensamblaje, cintas, balancines y cuenca. Se descartó porque solo se podía
mirar. La física de cintas y rampas sigue en `physics.ts` aunque no se use.
