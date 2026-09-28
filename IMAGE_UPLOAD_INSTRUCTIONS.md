# Guía para Subir Fotografías de Productos — V Imprint Designs

Esta guía te explica, paso a paso y sin lenguaje técnico, cómo tomar las fotos de tus productos y subirlas correctamente a Shopify. Úsala junto con el archivo `IMAGE_UPLOAD_PLAN.csv`, que te dice exactamente qué foto necesita cada producto.

---

## 1. Resolución recomendada

- **Mínimo: 2048 x 2048 píxeles** (imagen cuadrada).
- Esto permite que el "zoom" de Shopify funcione bien cuando un cliente hace clic o pasa el cursor sobre la foto en la página del producto — si la foto es muy pequeña, se verá borrosa al hacer zoom.
- Si tu cámara o celular toma fotos más grandes (por ejemplo 4000 x 4000), está bien — Shopify las ajusta automáticamente. No subas nada por debajo de 2048 x 2048.

## 2. Proporción (aspect ratio): cuadrada 1:1

- Toma las fotos en formato **cuadrado (1:1)** — mismo ancho que alto.
- Confirmé en el código de la tienda que la cuadrícula del catálogo (donde el cliente ve todos los productos juntos) usa un recuadro cuadrado y recorta la imagen para llenarlo. Si subes una foto rectangular, Shopify la recortará automáticamente y podría cortar partes importantes del producto (como el logo grabado en una esquina).
- **Recomendación práctica**: centra el producto en el medio del encuadre con espacio libre alrededor, así el recorte cuadrado nunca corta nada importante.
- Nota técnica menor: la página individual de cada producto (la galería grande) usa una proporción ligeramente distinta (más alta que ancha) y NO recorta la imagen, solo la reduce para que quepa completa. Por eso lo más seguro es fotografiar cuadrado con margen de sobra — se ve bien en ambos lugares.

## 3. Formato de archivo: WebP o JPEG

- **Preferido: WebP** — mismo nivel de calidad visual que JPEG pero con archivos hasta 30% más livianos, lo que hace que la página cargue más rápido.
- **Alternativa aceptable: JPEG** (.jpg) — si tu celular o cámara no genera WebP directamente, no hay problema, JPEG funciona perfectamente y Shopify lo acepta sin inconvenientes.
- **Evita**: PNG (archivos innecesariamente pesados para fotos, resérvalo solo si necesitas fondo transparente, lo cual no aplica aquí) y HEIC (formato de iPhone que Shopify no siempre procesa bien — si usas iPhone, cambia la configuración de la cámara a "Más compatible" en Ajustes > Cámara > Formatos, o exporta como JPEG antes de subir).

## 4. Tamaño máximo de archivo: menos de 2 MB por imagen

- Intenta que cada foto pese **menos de 2 MB**.
- Esto es importante para la velocidad de carga de la tienda — entre más pesada la imagen, más tarda en aparecer, y eso puede hacer que el cliente se vaya antes de ver el producto.
- Si tu foto pesa más de 2 MB, usa un compresor de imágenes gratuito en línea (por ejemplo, TinyPNG o Squoosh) antes de subirla — reduce el peso sin que se note la diferencia de calidad.

## 5. Convención de nombres de archivo

Usa exactamente los nombres que aparecen en la columna **"Recommended filename"** del archivo `IMAGE_UPLOAD_PLAN.csv`. El patrón general es:

```
[código-producto]-[color-o-material]-[rol].jpg
```

Ejemplos:
- `tu020-navy-main.jpg` → Tumbler TU-020, color Navy, foto principal
- `aw003-wood-acrylic-main.jpg` → Award AW-003, material Wood + Acrylic, foto principal
- `em001-embroidery-detail.jpg` → Cap EM-001, foto de detalle del bordado

Esto te ayuda a mantener todo organizado en tu computadora antes de subir, y facilita saber qué falta.

**Importante**: no necesitas una foto por cada talla (S, M, L, XL, etc.) — solo por cada color, material o estilo distinto. El archivo CSV ya agrupa esto por ti en la columna "Variants sharing image", que te dice qué tallas comparten la misma foto.

## 6. Orden recomendado de subida

Sigue este orden para no perderte:

1. Empieza por los productos con menos variantes (TU-040, PET-002, EM-001) para tomarle el ritmo.
2. Sigue con los tumblers y productos de mascotas (TU-020, PET-001, PET-002).
3. Continúa con los premios/placas militares (AW-001 a AW-005).
4. Termina con la ropa bordada (EM-001, EM-002, EM-003), que tiene más colores.
5. Dentro de cada producto, sube primero la foto marcada como **"Main/Featured"** en el CSV (columna "Gallery order" = 1), luego las demás en el orden numérico indicado.

## 7. Cómo asignar imágenes a variantes en Shopify Admin (paso a paso)

Todo esto se hace desde el navegador, en Shopify Admin — no necesitas ninguna herramienta técnica.

1. Entra a **Shopify Admin** → **Products** (Productos).
2. Busca el producto por su nombre o código (usa la columna "Title" o "Product code" del CSV) y haz clic para abrirlo.
3. Baja hasta la sección **Media** (Multimedia) y haz clic en **Add media** (Agregar multimedia) o simplemente arrastra los archivos desde tu computadora.
4. Sube las imágenes en el orden indicado en la columna "Gallery order" del CSV (la foto "Main/Featured" debe quedar primera).
5. Para productos con **colores** (como TU-020, EM-001, PET-002): baja hasta la sección **Variants** (Variantes). Haz clic en cada variante de color (por ejemplo "Navy") y en el menú de imagen de esa variante, selecciona la foto que corresponde a ese color (ya subida en el paso 3). Repite para cada color.
6. Para tallas dentro de un mismo color (ejemplo: Navy S, Navy M, Navy L): **no hace falta asignar una foto distinta a cada talla** — todas las tallas de un mismo color pueden usar la misma imagen. Shopify permite seleccionar varias variantes a la vez y asignarles la misma foto en un solo paso.
7. En el campo **Alt text** (texto alternativo) de cada imagen, copia el texto exacto de la columna "Alt text" del CSV. Esto es importante para accesibilidad (para personas que usan lectores de pantalla) y para que Google entienda de qué trata la imagen.
8. Haz clic en **Save** (Guardar) al final de la página.

## 8. Cómo verificar que la imagen quedó bien

Después de subir y guardar, revisa lo siguiente:

- **Abre la página pública del producto** (botón "Preview" o "View" arriba a la derecha en Shopify Admin) y mira cómo se ve realmente en la tienda.
- **¿Se ve recortada o deformada?** Si el producto aparece cortado en los bordes o estirado, la foto probablemente no era cuadrada — vuelve a tomarla o recórtala tú mismo antes de subir de nuevo.
- **¿Carga rápido?** Si la página tarda mucho en mostrar la imagen, probablemente el archivo pesa demasiado — revisa que esté bajo 2 MB.
- **¿El texto alt está puesto?** Pasa el cursor sobre la imagen en Shopify Admin o revisa el campo "Alt text" — debe tener una descripción, no estar vacío.
- **Compara colores**: verifica que la foto que asignaste a "Navy" realmente muestre el producto en Navy y no en otro color por error — es un error común al subir varias fotos seguidas.
- **Revisa en el catálogo general** (la página que lista todos los productos), no solo en la página individual del producto — así confirmas que también se ve bien recortada en formato cuadrado ahí.

---

## Resumen rápido

| Punto | Recomendación |
|---|---|
| Resolución mínima | 2048 x 2048 px |
| Proporción | Cuadrada (1:1) |
| Formato | WebP (preferido) o JPEG |
| Peso máximo | Menos de 2 MB |
| Fotos por talla | No — solo por color/material/estilo |
| Dónde subir | Shopify Admin → Products → [producto] → Media |
| Texto alt | Copiar de la columna "Alt text" del CSV |

Cualquier duda sobre qué foto exacta necesita cada producto, consulta el archivo `IMAGE_UPLOAD_PLAN.csv` — ahí está el detalle completo, producto por producto.
