# Guía de Configuración Manual — Shopify Admin (V Imprint Designs)

**Tienda:** `yca1ns-sy.myshopify.com`
**Canal de ventas:** `vimprintdesigns-web`
**Fecha de este documento:** 25 de septiembre de 2026

---

## ⚠️ Advertencia importante

Estas 9 tareas requieren configuración manual del propietario dentro del panel de administración de Shopify (Shopify Admin), usando el navegador web. **Claude no las modificó ni las modificará automáticamente.** Este documento es solo de instrucciones — ninguna configuración de la tienda fue cambiada al generarlo. Todas las revisiones hechas para escribir esta guía fueron de solo lectura (consultas, no cambios).

Cómo leer esta guía:
- ✅ **Verificado vía API (solo lectura)** = confirmé el estado actual consultando directamente tu tienda.
- 📋 **Instructivo (Admin UI)** = esta configuración vive únicamente en el panel visual de Shopify y no es accesible por la API de solo lectura que usé, así que te doy los pasos exactos para que tú (o quien administre la tienda) lo hagas a mano.

---

## Resumen de lo que ya existe hoy en tu tienda (verificado el 25/sep/2026)

Antes de las instrucciones, esto es lo que confirmé que **ya está configurado**, para que no dupliques trabajo:

| Elemento | Estado actual |
|---|---|
| Perfil de envío general | Existe 1 perfil ("General profile", predeterminado) |
| Zona "US — Contiguous 48 + DC" | Existe, con método **"Standard" activo a $8.00 USD** ✅ (punto 3 ya está hecho) |
| Zona "Military — APO/FPO" | **La zona ya existe**, pero **no tiene ningún método de envío asignado** (sin tarifa configurada todavía) — falta completarla (ver punto 2) |
| Envío gratis desde $99 | No encontré ningún método con esa condición de subtotal en el perfil de envío — **no está configurado** (ver punto 4) |
| Exclusiones de bulk/rush/large-award en reglas de envío | No hay ninguna zona, método ni perfil de envío adicional para estos casos — **no está configurado** (ver punto 5) |
| Customer Accounts | `customerAccounts = OPTIONAL` — es decir, las cuentas de cliente están habilitadas en modo opcional (el cliente puede comprar como invitado o crear cuenta). Esto es lo normal por defecto; revisa el punto 6 si quieres cambiar a otro modo. |
| Canal de ventas `vimprintdesigns-web` | Existe como canal de publicación en tu tienda (junto a Online Store, Shop y Point of Sale) |
| Producto EM-001 (Custom Embroidered Cap) | Estado: **DRAFT** (borrador), publicado en **0 canales** de venta actualmente |
| Paquetes de envío guardados (Settings > Shipping and delivery > Packages) | **No pude verificarlo vía API** — este dato vive solo en el Admin UI y la Admin API de solo lectura que usé no expone esa pantalla (ver punto 1 abajo) |
| Plantillas de notificación de la tienda (emails) | **No pude revisar el contenido/personalización de las plantillas vía esta sesión** — se listan pero no inspeccioné cada plantilla en detalle; revísalas manualmente (ver punto 8) |

---

## 1. Crear los 9 paquetes de envío guardados (Saved Shipping Packages)

📋 **Instructivo (Admin UI).** No pude confirmar vía API si ya existen paquetes guardados porque la pantalla "Packages" de Shopify (Settings > Shipping and delivery > Packages) no está expuesta por la Admin API de lectura que usé en esta sesión. Asumo que aún no existen y te doy los pasos para crearlos desde cero, basados en las categorías reales de tu catálogo (gorras/polos bordados, tumblers, placas/premios, y el premio militar grande AW-005/AW-002).

### Pasos generales para crear un paquete:
1. En el Admin, ve a **Settings** (Configuración) → **Shipping and delivery** (Envío y entrega).
2. Baja hasta la sección **Packages** (Paquetes) y haz clic en **Manage** (Administrar) o **Add package** (Agregar paquete).
3. Para cada paquete, ingresa: **Nombre** del paquete, **Tipo** (caja o sobre), **Dimensiones** (largo x ancho x alto) y **Peso del paquete vacío** (opcional, pero recomendado si usas cajas reutilizables pesadas).
4. Guarda con **Save**.

### Los 9 paquetes sugeridos (edita las medidas según tus cajas reales antes de guardarlas):

1. **"Sobre acolchado - pequeño"** — para gorras individuales (EM-001). Ej: 30cm x 25cm x 8cm, tipo sobre.
2. **"Caja mediana - ropa bordada"** — para polos y camisas de trabajo (EM-002, EM-003), 1-3 unidades. Ej: 35cm x 28cm x 10cm.
3. **"Caja grande - ropa bordada (bulk)"** — pedidos de 4+ prendas. Ej: 45cm x 35cm x 20cm.
4. **"Caja tumbler individual"** — para TU-020 y TU-040 (con protección anti-rotura). Ej: 15cm x 15cm x 25cm.
5. **"Caja tumbler múltiple"** — 2 o más tumblers en un mismo pedido. Ej: 30cm x 20cm x 25cm.
6. **"Caja placa pequeña/mediana"** — para AW-003, AW-004, PET-001 (placas y premios de tamaño estándar). Ej: 30cm x 25cm x 5cm.
7. **"Caja placa grande"** — para AW-001 y premios de mayor tamaño. Ej: 40cm x 35cm x 8cm.
8. **"Caja premio militar grande (AW-005 / AW-002)"** — gift set multi-componente y el premio militar "one-of-a-kind", que son más voluminosos o incluyen varias piezas. Usa una caja más grande y considera empaque con separadores internos. Ej: 45cm x 40cm x 15cm.
9. **"Caja foto/retrato mascota (PET-002)"** — para envío plano de impresiones o marcos, evitando doblado. Ej: 35cm x 30cm x 3cm (caja plana/rígida).

**Nota:** si tienes las dimensiones y pesos exactos de tus productos guardados en metafields o en las fichas de producto, revísalos antes de finalizar estos 9 paquetes — ajusta las medidas de la lista de arriba a tus cajas reales. Yo no tuve visibilidad completa de metafields de peso/dimensión por producto en esta sesión, así que estas medidas son de referencia, no exactas.

---

## 2. Configurar el envío USPS APO/FPO (direcciones militares)

✅ **Verificado vía API:** la zona **"Military — APO/FPO."** ya existe dentro de tu perfil de envío general, pero **no tiene ningún método de envío (tarifa) asignado todavía**. Esto es relevante porque tienes productos de "Military Awards" (AW-002, AW-005) que probablemente se enviarán a bases militares.

### Pasos para completar esta zona:
1. Ve a **Settings** → **Shipping and delivery**.
2. En tu perfil de envío ("General profile"), busca la zona llamada **"Military — APO/FPO."** (ya aparece en la lista de zonas).
3. Haz clic en **Add rate** (Agregar tarifa) dentro de esa zona.
4. Shopify no tiene una integración automática de tarifas USPS específica para "APO/FPO" por defecto — normalmente se configura como una **tarifa fija (flat rate)**, igual que hiciste con el Standard de $8, pero puedes:
   - Usar el mismo monto que el Standard ($8.00), o
   - Usar un monto distinto si el envío militar te cuesta más (USPS suele tratar APO/FPO como envío "doméstico" en tarifa pero con tiempos de tránsito más largos).
5. Nombra la tarifa algo claro, por ejemplo **"USPS Military Mail (APO/FPO)"**.
6. Ingresa el precio y guarda.
7. **Importante sobre direcciones:** verifica que el formulario de checkout acepte direcciones con formato militar (Ciudad = "APO"/"FPO"/"DPO", Estado = "AA"/"AE"/"AP", código postal de EE.UU. normal). Shopify soporta esto de forma nativa dentro de EE.UU., no requiere configuración adicional — solo confirma que la zona cubra el país correcto (ya confirmé que la zona está asociada a US).
8. Guarda los cambios con **Save**.

---

## 3. Standard Shipping de $8 (tarifa plana)

✅ **Ya está configurado.** Verifiqué que la zona **"US — Contiguous 48 + DC."** tiene un método activo llamado **"Standard"** con precio **$8.00 USD**. No necesitas hacer nada aquí — solo verifica manualmente (por si acaso) que siga activo:

1. Ve a **Settings** → **Shipping and delivery**.
2. En "General profile", abre la zona "US — Contiguous 48 + DC."
3. Confirma que "Standard" aparezca marcado como activo (sin el ícono de pausado) y el precio en $8.00.

---

## 4. Envío gratis desde $99 (Free shipping threshold)

📋 **Instructivo (Admin UI) — no está configurado todavía.** Verifiqué el perfil de envío y no existe ningún método con una condición de subtotal ("order amount") de $99. Debes crearlo.

### Pasos:
1. Ve a **Settings** → **Shipping and delivery**.
2. En la zona **"US — Contiguous 48 + DC."** (la zona doméstica principal), haz clic en **Add rate**.
3. Elige la opción **"Free shipping"** (o crea una tarifa nueva y pon el precio en $0.00).
4. Nombra la tarifa, por ejemplo **"Free Shipping (orders $99+)"**.
5. Busca la opción **"Conditions"** o **"Based on order price"** dentro del mismo formulario de la tarifa.
6. Activa la condición y establece: **Mínimo = $99.00**, sin máximo (deja el campo de máximo vacío).
7. Guarda con **Save**.
8. Repite este mismo paso en la zona "Military — APO/FPO." si quieres que el envío gratis desde $99 aplique también a direcciones militares (decide esto según tu costo real de envío militar — puede que prefieras dejar esa zona solo con la tarifa fija del punto 2, sin envío gratis, si el costo de envío a bases militares es más alto).

---

## 5. Exclusiones de bulk/rush/large-award en las reglas de envío estándar

📋 **Instructivo (Admin UI) — no está configurado todavía.** No encontré ninguna zona, perfil o método de envío separado para pedidos de volumen (bulk), urgentes (rush) o premios grandes. Dado que ya tienes documentado un `bulk_minimum` (cotización obligatoria a partir de cierta cantidad, 12+ en la mayoría de productos y 6+ para AW-005) y que AW-002 es "quote-only" (sin botón de compra), estas exclusiones tienen sentido así:

### Qué NO necesita configuración de envío:
- **AW-002** (premio militar "one-of-a-kind"): no tiene variantes comprables ni botón "Add to cart" — es solo cotización por formulario. No pasa por checkout, así que no necesita tarifa de envío en Shopify. No hagas nada aquí.
- **Pedidos bulk (12+ unidades, o 6+ para AW-005):** según tu documentación, estos ya requieren cotización manual antes de la compra (el cliente contacta para cotizar, no compra directo por el carrito estándar). Por lo tanto, estos pedidos normalmente **no pasan por las tarifas automáticas de $8 o envío gratis** — se cotizan y facturan aparte, muchas veces como **orden manual (draft order)** creada por ti desde el Admin, donde tú defines el envío a mano.

### Pasos si quieres reforzar esto en Shopify (opcional pero recomendado):
1. Considera agregar una nota visible en la ficha de producto (ya deberías tenerla, según tu documentación de `bulk_minimum`) que diga algo como: *"Pedidos de 12+ unidades requieren cotización — contáctanos antes de comprar."*
2. Para pedidos de cotización (incluyendo AW-005 desde 6 unidades y el premio militar grande AW-002), en vez de dejar que pasen por el checkout automático de $8 o gratis, créalos como **Draft Order**:
   - Ve a **Orders** → **Create order**.
   - Agrega los productos y cantidades cotizadas.
   - En la sección de envío del draft order, ingresa manualmente el costo de envío real que cotizaste (puede ser distinto al flat rate de $8, especialmente si es un envío grande o pesado).
   - Envía la factura/borrador al cliente para que pague.
3. Esto asegura que las tarifas automáticas ($8 estándar y gratis desde $99) solo apliquen a compras normales de 1-11 unidades (o 1-5 para AW-005), y que los pedidos grandes/urgentes se manejen manualmente con el costo de envío real.

---

## 6. Customer Accounts (cuentas de cliente)

✅ **Verificado vía API:** el modo actual es **`customerAccounts = OPTIONAL`**. Esto significa que ahora mismo los clientes **pueden comprar como invitados sin crear cuenta**, pero también tienen la opción de crear una cuenta si quieren. Es la configuración estándar recomendada para la mayoría de tiendas nuevas — no es obligatorio cambiarla.

### Si quieres revisar o cambiar este ajuste manualmente:
1. Ve a **Settings** → **Customer accounts**.
2. Verás las opciones (los nombres exactos pueden variar levemente según la versión del Admin):
   - **Accounts optional** (lo que ya está activo): el cliente elige si compra como invitado o crea cuenta.
   - **Accounts required**: obliga a crear cuenta antes de comprar (no recomendado para primera etapa, agrega fricción en el checkout).
   - **New customer accounts** (el sistema nuevo de cuentas de Shopify, con inicio de sesión por código enviado al email, sin contraseña): puedes activarlo si quieres una experiencia más moderna.
3. Si decides activar el sistema nuevo, revisa también los enlaces de "Iniciar sesión" en el tema para asegurarte de que apunten correctamente (esto normalmente Shopify lo actualiza automático, pero conviene revisarlo tras el cambio).
4. Guarda los cambios.

**Recomendación:** deja "Optional" como está, salvo que tengas una razón específica de negocio para cambiarlo (por ejemplo, si quieres capturar más datos de clientes recurrentes).

---

## 7. Hacer una orden de prueba + reembolso/cancelación

📋 **Instructivo (Admin UI).** Esto no se puede ni se debe automatizar — es una prueba real del flujo de compra que debes hacer tú mismo antes de lanzar productos al público, para confirmar que todo (envío, impuestos, confirmación por email) funciona bien.

### Opción A — Orden de prueba SIN cobro real (recomendada primero):
1. Antes de nada, activa temporalmente el **modo de prueba de pagos (Bogus Gateway / Test mode)** si usas Shopify Payments:
   - Ve a **Settings** → **Payments**.
   - Busca la opción **"Manage"** junto a Shopify Payments, y activa **"Enable test mode"** (Activar modo de prueba). *(Si esta opción no aparece, es porque tu cuenta ya está aprobada para cobros reales — en ese caso usa la Opción B con reembolso real).*
2. Publica temporalmente el producto que quieras probar (o usa uno ya activo) en el canal `vimprintdesigns-web` (ver punto 9 más abajo para el detalle de cómo publicar).
3. Ve a la tienda pública (o usa el enlace de vista previa) y agrega el producto al carrito como si fueras cliente.
4. Completa el checkout con una **tarjeta de prueba** (en modo test, Shopify te muestra en pantalla un número de tarjeta ficticio válido para pruebas, normalmente `4242 4242 4242 4242` con cualquier fecha futura y CVC).
5. Confirma que:
   - El costo de envío ($8, o gratis si el subtotal es $99+) se calculó correctamente.
   - Llegó el correo de confirmación de orden (ver punto 8).
   - La orden aparece en **Orders** en el Admin.
6. Desactiva el modo de prueba de pagos cuando termines (**Settings** → **Payments** → apaga "Enable test mode").

### Opción B — Orden real con reembolso (si no tienes modo de prueba disponible):
1. Haz una compra real de bajo costo (el producto más barato del catálogo) usando tu propia tarjeta.
2. Completa el checkout normalmente.
3. Una vez la orden aparezca en **Orders**, ábrela.
4. Haz clic en **Refund** (Reembolsar) en la esquina superior derecha de la orden.
5. Selecciona el ítem completo, marca **"Restock item"** (Reponer inventario) si aplica, y confirma el monto total a reembolsar (incluyendo el envío, si quieres devolverlo también).
6. Haz clic en **Refund** para procesar el reembolso — el dinero regresa al método de pago original en unos días hábiles.
7. Opcional: puedes cancelar la orden completa desde el botón **"Cancel order"** en vez de solo reembolsar, si prefieres que quede marcada como cancelada.

---

## 8. Revisar emails y notificaciones de la tienda

📋 **Instructivo (Admin UI) — confirmé que la sección existe, pero no revisé el contenido de cada plantilla en esta sesión (requiere abrir cada una en el editor visual).**

### Pasos:
1. Ve a **Settings** → **Notifications** (Notificaciones).
2. Verás dos secciones: **"Customer notifications"** (lo que reciben tus clientes) y **"Staff notifications"** (lo que recibes tú/tu equipo).
3. Revisa especialmente estas plantillas de cliente antes de lanzar:
   - **Order confirmation** (Confirmación de orden) — verifica que el nombre de la tienda, logo y colores se vean bien, y que el texto mencione correctamente los tiempos de producción para productos personalizados (bordado, grabado, etc.) si aplica.
   - **Shipping confirmation** (Confirmación de envío) — confirma que incluya el número de seguimiento.
   - **Order out for delivery / Delivered** — revisa si están activadas.
   - Si vendes productos con personalización (texto/archivo/proof), considera revisar si necesitas activar notificaciones de **"Draft order invoice"** para los pedidos cotizados manualmente (bulk, AW-002, etc. — ver punto 5).
4. En **"Sender email"** (correo remitente), arriba de la lista de plantillas, confirma que el email desde el cual se envían las notificaciones sea uno que revises regularmente (por defecto suele ser algo como `no-reply@shopify.com` reenviado, o puedes configurar tu propio dominio si ya tienes email corporativo).
5. Para editar cualquier plantilla, haz clic sobre su nombre, edita el texto/HTML en el editor, y usa el botón **"Send test"** (Enviar prueba) para mandarte una copia a tu propio correo antes de guardar cambios definitivos.
6. Revisa también **Staff notifications** → asegúrate de que "New order" esté activado y llegue a un correo que revises frecuentemente, para que no se te pase ningún pedido nuevo (especialmente los que requieren cotización).

---

## 9. Publicar el primer producto (EM-001) en el canal `vimprintdesigns-web`

✅ **Verificado vía API:** el canal de ventas **`vimprintdesigns-web`** ya existe en tu tienda (junto con Online Store, Shop y Point of Sale). El producto **EM-001 (Custom Embroidered Cap)** está actualmente en estado **DRAFT** y publicado en **0 canales** — es decir, todavía no es visible en ningún lado. Esto es correcto y esperado hasta que decidas lanzarlo.

Según tu `PRODUCT_LAUNCH_CHECKLIST.csv`, EM-001 es el **#1 en el orden de lanzamiento recomendado**. Sigue estos pasos cuando estés listo:

### Paso 0 — Antes de publicar, verifica que las imágenes ya estén subidas y asignadas
1. Ve a **Products** en el Admin y abre **"Custom Embroidered Cap"**.
2. En la sección de imágenes del producto, confirma que:
   - Hay al menos una foto principal ("Main/Featured", como indica tu `IMAGE_UPLOAD_PLAN.csv`).
   - Cada una de las 4 variantes de color (Black, Navy, Coyote Tan, Olive Green) tiene su imagen asignada correctamente — haz clic en cada variante dentro de la sección "Variants" y confirma que la miniatura de foto corresponde al color correcto.
3. Si falta alguna imagen, sigue primero `IMAGE_UPLOAD_INSTRUCTIONS.md` y `IMAGE_UPLOAD_PLAN.csv` (ya existentes en este proyecto) antes de continuar.
4. **No publiques el producto hasta que este paso esté 100% completo** — un producto sin imágenes o con imágenes mal asignadas se ve poco profesional y puede confundir al cliente sobre qué color está comprando.

### Paso 1 — Revisar la ficha completa (usa tu propia checklist)
1. En la misma ficha de producto, revisa (según las columnas de tu `PRODUCT_LAUNCH_CHECKLIST.csv` para EM-001): descripción, SEO (título y meta descripción), inventario de las 4 variantes, y que el texto de cotización para pedidos 12+ esté visible.
2. Confirma que la personalización (texto/archivo/proof) esté habilitada y funcionando en la ficha (campos personalizados visibles al cliente).

### Paso 2 — Cambiar el estado a "Active"
1. En la parte superior derecha de la ficha del producto, busca el menú desplegable de estado (donde dice **"Draft"**).
2. Cámbialo a **"Active"**.
3. Haz clic en **Save**.

*(Nota: cambiar a "Active" NO lo publica automáticamente en un canal — solo lo activa. El paso siguiente es publicarlo en el canal específico.)*

### Paso 3 — Publicar en el canal `vimprintdesigns-web`
1. Sigue en la misma ficha del producto, baja hasta la sección **"Publishing"** (Publicación) en la columna derecha (o barra lateral, según el tamaño de tu pantalla).
2. Verás la lista de canales disponibles: Online Store, Shop, Point of Sale, y **vimprintdesigns-web**.
3. Marca la casilla junto a **"vimprintdesigns-web"** para activarlo en ese canal.
4. Si el canal `vimprintdesigns-web` es en realidad tu tienda pública (revisa el nombre para confirmar si corresponde a tu Online Store o es un canal adicional/headless), asegúrate también de que **"Online Store"** esté marcado si quieres que aparezca en tu sitio principal.
5. Haz clic en **Save** para confirmar la publicación.

### Paso 4 — Verificación final
1. Abre la tienda pública (o usa el botón **"Preview"** desde la ficha del producto) y confirma que:
   - El producto aparece visible.
   - Las 4 variantes de color se pueden seleccionar y muestran la imagen correcta cada una.
   - El precio, botón de "Add to cart" y el campo de personalización funcionan.
2. Si todo se ve bien, considera hacer la orden de prueba del punto 7 usando específicamente este producto (EM-001), ya que sería tu primer lanzamiento real.
3. Una vez confirmado, marca las columnas correspondientes como completadas en tu `PRODUCT_LAUNCH_CHECKLIST.csv` (Images uploaded, Variant images assigned, ... Published to vimprintdesigns-web, Approved).

---

## Nota final

Este documento refleja el estado de tu tienda verificado por consultas de solo lectura el **25 de septiembre de 2026**. Si haces cambios en Shopify después de esta fecha (por ejemplo, agregas paquetes de envío o cambias tarifas), esta guía no se actualiza sola — vuelve a pedir una revisión si necesitas confirmar el estado más reciente.
