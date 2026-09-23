# Subida de archivos (logos / artwork) — Implementado

La subida real de logos/artwork ya está conectada, usando **Netlify
Functions + Netlify Blobs**, confirmado contigo. Esta nota explica cómo
funciona y qué falta configurar en el panel de Netlify para que funcione
en producción (el código ya está listo, pero requiere una variable de
entorno que solo tú puedes crear).

## Cómo funciona

1. El cliente selecciona un archivo (PNG o JPG, hasta 20MB) en `/shop`.
2. El navegador lo sube a `netlify/functions/upload-artwork.mjs`, que:
   - Valida tipo y tamaño en servidor (nunca confía solo en lo que dice
     el navegador — revisa los primeros bytes del archivo para confirmar
     que de verdad es un PNG/JPG real, no solo un archivo renombrado)
   - Aplica un límite básico de solicitudes por IP para frenar abuso
   - Guarda el archivo en Netlify Blobs con un nombre aleatorio (nunca
     el nombre original del cliente)
   - Devuelve un link protegido, listo para usarse
3. Ese link se guarda como line attribute **"Artwork File"** en el
   carrito — visible directamente dentro del pedido en tu panel de
   Shopify (Orders → abrir el pedido), tal como pediste en la Opción A.
4. El link no es público: solo funciona si incluye el secreto correcto
   (ver siguiente sección). No es indexable ni adivinable.

## Lo único que falta: crear la variable de entorno

El código ya está listo, pero **sin este paso, los links no van a
funcionar** (el pedido mostrará solo una referencia interna, no un link
que se pueda abrir). Esto es intencional — así nunca hay un secreto
"de mentira" en el código.

**En tu cuenta Netlify de pruebas (donde vamos a probar primero):**

1. Ve a Site settings → Environment variables.
2. Agrega una nueva variable:
   - Key: `ARTWORK_ACCESS_SECRET`
   - Value: cualquier cadena larga y aleatoria — ejemplo de cómo generar
     una segura: abre una terminal y corre `openssl rand -hex 32`, o
     usa un generador de contraseñas online y pide 40+ caracteres.
3. Guarda, y vuelve a desplegar el sitio (Netlify normalmente redeploya
   solo al detectar el cambio, pero si no, hazlo manualmente una vez).

**Cuando migremos a la cuenta Netlify Free del cliente:** repetir
exactamente los mismos 3 pasos ahí, con un valor de secreto distinto
(no reuses el mismo secreto entre cuentas de prueba y producción).

## Límite de tiempo de Function y tamaño de archivo

Confirmamos 20MB como tope de archivo. Las Functions de Netlify tienen
un límite de ejecución de 10 segundos — con conexiones normales, subir
20MB toma bien por debajo de eso, pero en una conexión muy lenta podría
fallar por timeout. Si esto llega a pasar en la práctica, hay que bajar
el límite o mover a subida directa a Blobs desde el navegador (posible,
pero más compleja de asegurar) — lo evaluamos si se vuelve un problema
real, no antes.

## Consumo de créditos (cuenta Free del cliente)

Ya documentado en la entrega anterior: tu cuenta corre en el modelo de
**300 créditos/mes**. Cada subida de archivo consume banda ancha (al
subir) y de nuevo cada vez que abres el link del pedido para verlo. Con
archivos de 1-8MB típicos (aunque el tope técnico sea 20MB), el consumo
por pedido personalizado es bajo, pero si el volumen de pedidos con
archivo crece mucho, vale la pena revisar el consumo real desde el
panel de Netlify (Team settings → Usage) antes de que se agote el pool
del mes.

## Limpieza de archivos abandonados

**No implementado todavía.** El código ya guarda un metadato
`linkedToOrder: 'false'` en cada archivo subido (ver
`upload-artwork.mjs`), pensado para una futura tarea de limpieza
automática (ej. una Scheduled Function que borre archivos de más de 30
días que sigan con `linkedToOrder: 'false'`). Esto no es necesario para
el piloto, pero sí antes de escalar a volumen real — lo dejamos anotado
como pendiente para la siguiente fase, no bloqueante ahora.

## Segundo uso: fotos adjuntas en el formulario de contacto (home)

La misma Function `upload-artwork.mjs` y el mismo store de Blobs
(`customer-artwork`) ahora también se usan para el campo "Reference
Photos" del formulario de contacto en la home — **no es una integración
nueva, es la misma pieza reutilizada**.

**Por qué así, y no adjuntos nativos de Formspree:** confirmamos
directamente en la documentación oficial de Formspree que la subida de
archivos requiere un plan pago (Personal/Professional/Business) —
tu cuenta está en el plan Free, que no la soporta. En vez de pedirte
que subas de plan solo por esto, reusamos Netlify Blobs, que ya está
funcionando y es gratis en tu cuenta.

**Cómo funciona:** si el cliente adjunta una foto en el formulario de
contacto, el JS la sube primero a `/api/upload-artwork` (igual que en
`/shop`), y el link protegido resultante se agrega automáticamente al
final del campo de mensaje antes de enviar el formulario a Formspree.
Así el email que te llega por Formspree incluye el link a la foto,
sin que Formspree tenga que manejar el archivo en sí.

**No requiere configuración adicional** más allá de la variable
`ARTWORK_ACCESS_SECRET` que ya configuraste — si ya la tienes puesta
en tu cuenta Netlify de pruebas, esto funciona automáticamente ahí
también, sin ningún paso extra.

## Qué NO cambia de lo ya acordado

- Sigue siendo Netlify Blobs, sin cuenta externa nueva.
- Solo PNG/JPG, hasta 20MB, validado en servidor.
- El link nunca es público/indexable.
- Se prueba primero en tu cuenta de pruebas pagada antes de tocar la
  cuenta Free del cliente, como confirmaste.

