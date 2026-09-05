# Historia

Lo que este proyecto tuvo y ya no tiene. Nada de esto es contexto operativo: se saca del
`CLAUDE.md` —que se carga entero en cada sesión— y se guarda aquí para que quede el porqué.

## El color venía de Last.fm

El color de la arena salía de la portada del disco que estuviera sonando: dos endpoints
(`/api/now-playing`, `/api/art`), sus gemelos en PHP, un poller y un median-cut en
`color/extract.ts`. Se quitó entero —no está desconectado, está borrado— porque el color era de
quien publicaba la página y no de quien la mira. Hoy sale de `PALETTES`, en `palette.ts`.

Está en el historial de git si hace falta recuperarlo. Si vuelve algún endpoint con credenciales:
**nunca `import.meta.env` para un secreto** — Vite lo sustituye por el valor literal al compilar y
la clave acaba dentro del artefacto. Van por `astro:env/server` con `access: 'secret'`.

## El primer commit era otro proyecto

El primer commit (`253dbfc`) es una fábrica generativa con línea de ensamblaje, cintas, balancines
y cuenca. Se descartó porque solo se podía mirar. La física de cintas y rampas sigue en
`physics.ts` aunque no se use — y `BELT_L`/`BELT_R` vuelven a tentar cada vez que algo tiene que
transportarse.

## Las piezas fueron dibujos tramados

Hubo PNGs de las piezas, generados y tramados en semitono: puntos negros sobre blanco. El flujo
entero y los prompts están en `prompts-piezas.md`.

**El fondo blanco de uno de esos assets no se quita por color.** El borrado por color se lleva
también el blanco de *entre* los puntos del semitono, que está dentro de la figura, y la deja
agujereada. `scripts/asset-alfa.py` saca el alfa de la región exterior por inundación desde las
cuatro esquinas —cuatro, porque la figura suele tocar el borde y parte el exterior en trozos— y
respeta el alfa que ya venga hecho.

Hoy no queda ninguno: la bola se dibuja con degradados y la fuente no se dibuja en absoluto. Los
porqués de las dos decisiones están en el README, en «Decisiones no obvias».

## El fondo se sorteaba

`SandCanvas.astro` sorteaba entre los `backgroundNN.webp` que hubiera en `public/`, leídos con
`readdirSync` en el frontmatter. Se quitó: ahora es un solo archivo fijo, `public/background.webp`,
escrito a pelo en el CSS.

## Piezas que se quitaron

Una **cruz giratoria** de cuatro aspas que aventaba la arena y una **plataforma** —bandeja con
costados que paseaba su carga por un trayecto, y que llegó a subirla por una rampa inclinada—.
Están enteras en el commit `b52c517`. No fallaban: se quitaron porque las que quedan se explican
solas y se combinan entre ellas, y estas dos pedían entenderlas antes de que hicieran gracia.

## La bola llegó a girar

Se le montó el giro entero y medido, y se probaron cinco texturas para enseñarlo. Se quitó todo.
El razonamiento completo está en el README.

## El interruptor global de material

Hubo un botón en el dock que cambiaba **todas** las fuentes entre arena y agua a la vez. Se quitó
al partir la ficha de fuente en dos —una de arena y una de agua—: eran dos sitios diciendo lo
mismo, y colocabas una de arena y el interruptor la volvía de agua sin haberla tocado. Ahora el
material lo lleva cada fuente y se fija al colocarla.
