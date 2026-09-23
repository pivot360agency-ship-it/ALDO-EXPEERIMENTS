/**
 * shopify.config.js
 * ──────────────────────────────────────────────────────────────
 * Configuración PÚBLICA de la Storefront API de Shopify.
 *
 * El "Public Storefront Access Token" está diseñado por Shopify
 * para vivir en el navegador — no es un secreto. NUNCA pongas
 * aquí el "Private Access Token": ese solo se usa en servidor
 * y no lo necesitamos para esta prueba.
 *
 * Reemplaza SHOPIFY_PUBLIC_TOKEN abajo con el Public access token
 * que generaste al crear el storefront dentro del canal Headless
 * (Shopify admin → Sales channels → Headless → tu storefront →
 * Storefront API → Public access token).
 * ──────────────────────────────────────────────────────────────
 */

window.SHOPIFY_CONFIG = {
  // Dominio de tu tienda (sin https://, sin barra final)
  storeDomain: 'yca1ns-sy.myshopify.com',

  // Versión de la Storefront API que estamos usando
  apiVersion: '2026-07',

  // ⚠️ PEGA AQUÍ tu Public Storefront Access Token
  publicToken: 'dd1e7df58fc17c9e28e8276852a23732',

  // Handle del producto piloto tal como aparece en la URL de Shopify
  // (Shopify admin → Products → abre el producto → el handle está
  // en la URL o en el campo "URL and handle" a la derecha)
  pilotProductHandle: 'personalized-engraved-20-oz-tumbler',
};
