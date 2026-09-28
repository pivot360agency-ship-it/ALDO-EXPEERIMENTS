# Changelog — V Imprint Designs Shop (13 Fases + ronda headless 2026-09-28)

Fecha: 2026-09-25 (13 fases originales) + 2026-09-28 (ronda de cierre headless).
Base: despliegue previamente confirmado en producción (commit `411dbf3`, verificado por el dueño como funcionando correctamente en Netlify antes de iniciar este trabajo).

## Ronda 2026-09-28 — cierre headless

- **Shopify (colecciones):** se agregaron descripción y SEO title/description a las 8 colecciones (Home page, Tumblers & Gifts, Military Awards, Embroidered Apparel, Business Uniforms, Pet Memorials, For Business, Best Sellers), que estaban vacías. No se tocaron productos asignados, tipo de colección ni orden — todas las asignaciones ya coincidían con lo especificado.
- **Shopify (productos):** auditoría de los 12 productos confirmó que SEO, tags, categorías, metafields de personalización y colecciones ya estaban completos desde la ronda anterior — no se requirió ninguna mutación.
- **`shop/shop.js`:** se amplió `CATALOG_FILTERS` de 5 a 7 entradas — se agregaron "Embroidered Apparel" y "For Business" (faltaban), y se renombró "All Products" a "All". Sin cambios en la lógica de filtrado, solo la lista de categorías disponibles.
- Se re-corrió toda la suite de pruebas Playwright acumulada (catálogo, navegación, Fase 1, multi-opción, quote-only, personalización, responsive, accesibilidad, SEO) tras el cambio — 0 regresiones, 0 errores de consola.
- No hay remote de git configurado en este entorno de trabajo (`git remote -v` vacío) — el propietario gestiona el repositorio real vía GitHub web UI. Por tanto este cambio NO fue publicado por Claude; se entrega como diff + ZIP, igual que las rondas anteriores.

Este documento resume los cambios de código realizados en esta sesión, organizados por fase. Todo el trabajo respeta las reglas duras del proyecto: no se crearon productos adicionales, no se duplicaron colecciones/variantes/SKU/metafields, no se cambiaron precios/SKU/pesos/inventario/variantes ya aprobados, no se publicó ni activó ningún producto Draft, no se usaron imágenes genéricas/de terceros/generadas, no se modificó la identidad visual (tipografías, paleta, botones dorados/outline existentes), no se cambiaron configuraciones de envío en vivo, y no se guardó ningún token privado en el repositorio.

## Archivos de código modificados

- `index.html` — corrección del valor preseleccionado en el formulario de contacto para proyectos "Custom / One-of-a-Kind" → `Not Sure — Help Me Decide` (opción real existente en el `<select>`), de forma que el prefill desde productos quote-only funcione correctamente. Sin cambios visuales.
- `shop/index.html` — se agregó `id="shopBreadcrumb"` al breadcrumb estático existente (para permitir breadcrumb dinámico); se agregaron placeholders/IDs en meta tags de `<head>` para SEO dinámico (title, description, OG, canonical, robots, JSON-LD); comentario documentando la limitación de `?handle=` vs. rutas limpias.
- `shop/shop.css` — nuevo bloque de estilos para el catálogo dinámico (`.catalog-header`, `.catalog-filters`, `.catalog-grid`, `.catalog-card`, badges), reutilizando exclusivamente los tokens de color/tipografía ya existentes (`--ink`, `--gold`, `--cream`, etc. — cero colores nuevos). Ajustes de `min-height`/tamaño en 7 selectores para cumplir tap-targets accesibles (~44×44px): `.opt-swatch`, `.qty-stepper button`, `.cart-toggle`, `.retry-btn`, `.cart-drawer-close`, `.qty-stepper-sm button`, `.cart-line-remove`. Se preservó `:focus-visible` y `prefers-reduced-motion` ya existentes.
- `shop/shop.js` — se agregó el catálogo dinámico completo (`initCatalog`, `renderCatalog`, `renderCatalogCard`, filtros por colección, badges Best Seller/Custom Quote/Sold Out); breadcrumb dinámico (`setBreadcrumb`) con "Shop All" y nivel de colección; SEO dinámico (`updateMetaTagsForCatalog/Product/NotFound`, `setStructuredData` con JSON-LD Product cuando hay datos reales); atributos de performance (`loading="eager" fetchpriority="high" decoding="async"`) en la imagen principal de galería de producto (candidata a LCP).
- `shop/shopify-client.js` — se agregó `CATALOG_QUERY`, `getAllActiveProducts()` y `normalizeCatalogProduct()` para alimentar el catálogo dinámico vía Storefront API (solo productos ACTIVE — los Draft son excluidos arquitectónicamente por la propia API, no por lógica de la app); se agregaron campos `seo{title,description}` y `collections` al `PRODUCT_QUERY` existente para soportar SEO dinámico.

## Archivos nuevos (documentación de entrega)

- `IMAGE_UPLOAD_PLAN.csv` — plan detallado de imágenes necesarias por producto (Fase 10).
- `IMAGE_UPLOAD_INSTRUCTIONS.md` — instrucciones de formato/resolución/subida de imágenes (Fase 10).
- `PRODUCT_LAUNCH_CHECKLIST.csv` — checklist de lanzamiento por producto, todo en "Pending" (Fase 11).
- `SHOPIFY_MANUAL_SETUP.md` — instrucciones de configuración manual de Shopify (envío, cuentas, publicación) (Fase 12).
- `CHANGELOG.md` — este documento.

## Resumen por fase

| Fase | Resultado |
|---|---|
| 1. Auditoría del deploy actual | Completa — 10/10 checks, mobile 390px y desktop 1366px, mock-based (Playwright + fixtures), cero errores de consola reales. |
| 2. Catálogo dinámico /shop/ | Completa — grid con filtros, badges, breadcrumb, verificado con Playwright. |
| 3. Revisión de contenido (12 productos) | Completa — contenido ya cumplía los requisitos; una variación (AW-005: umbral bulk de 6 en vez de 12) documentada y dejada intacta por no ser un error comprobable. |
| 4. Lógica genérica multi-opción | Completa — 48/48 checks sobre EM-001/002/003, AW-003/004, PET-001, TU-040 con datos reales de Shopify. Sin bugs reales. |
| 5. Quote-only genérico | Completa — 26/26 checks. Un bug real corregido en `index.html` (prefill roto del formulario). |
| 6. Personalización dirigida por metafields | Completa — 29/29 checks. Sin bugs. |
| 7. UX responsive (5 breakpoints) | Completa — 7 tap-targets corregidos en `shop.css`; 0 issues de overflow. |
| 8. Accesibilidad y rendimiento | Completa — 48/48 checks; 1 fix de performance (atributos de carga en imagen LCP). Analytics: no se agregaron eventos GA4 nuevos por no existir un Measurement ID real en el proyecto (se documentó el patrón para cuando exista). |
| 9. SEO técnico dinámico | Completa — title/description/OG/canonical/JSON-LD/noindex dinámicos; limitación de `?handle=` documentada, no resuelta (fuera de alcance). |
| 10. Plan de imágenes | Completa — `IMAGE_UPLOAD_PLAN.csv` (51 filas) + `IMAGE_UPLOAD_INSTRUCTIONS.md`. |
| 11. Checklist de lanzamiento | Completa — `PRODUCT_LAUNCH_CHECKLIST.csv`, 12 productos, todo en "Pending". |
| 12. Configuración manual de Shopify | Completa — `SHOPIFY_MANUAL_SETUP.md`, con estado real verificado vía Admin API de solo lectura donde fue posible. |
| 13. Entrega final | Este documento + ZIP de despliegue. |

## Aviso sobre pruebas: reales vs. simuladas (mock)

**Todas las pruebas automatizadas de esta sesión fueron realizadas localmente contra una copia idéntica del código del repositorio, usando Playwright con respuestas simuladas (mocks) de la Storefront API de Shopify — nunca contra el dominio de producción en vivo (`zippy-sprite-429635.netlify.app`).**

Esto se debe a una limitación del entorno de esta sesión: no hay acceso de red directo (curl) a dominios externos arbitrarios, `WebFetch` no ejecuta JavaScript (por lo que no sirve para probar esta aplicación de una sola página), y no hay herramientas de navegador/dispositivo remoto disponibles en esta sesión para operar un navegador real contra el sitio en vivo.

Las únicas verificaciones contra Shopify real en esta sesión fueron **consultas de solo lectura** (GraphQL `query`, nunca `mutation`) para confirmar datos reales de productos, variantes, metafields, zonas de envío y configuración de cuentas — usadas para construir fixtures de prueba realistas y para los documentos de entrega (CSV/MD).

**Recomendación para el propietario:** antes de publicar cualquier producto, se recomienda una prueba manual real en el dominio de producción (no solo confiar en estas pruebas simuladas), especialmente del flujo de carrito → checkout → confirmación.

## Tareas pendientes (solo del propietario)

Ver la sección final de `SHOPIFY_MANUAL_SETUP.md` y `PRODUCT_LAUNCH_CHECKLIST.csv` para la lista completa. En resumen:
1. Crear/configurar paquetes de envío y tarifa USPS APO/FPO manualmente.
2. Obtener y aprobar las fotografías.
3. Subir las fotografías o proporcionar URLs públicas.
4. Revisar visualmente los productos.
5. Confirmar el inventario real.
6. Realizar órdenes de prueba.
7. Aprobar y publicar los productos (uno por uno, en el orden recomendado).
8. Autorizar el cambio de dominio definitivo cuando corresponda.

Ningún producto fue publicado ni activado por Claude. No se realizó ningún cambio destructivo.
