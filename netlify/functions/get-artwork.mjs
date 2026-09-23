// netlify/functions/get-artwork.mjs
// ──────────────────────────────────────────────────────────────
// Sirve un archivo de artwork guardado en Blobs, dado su fileKey.
// Requiere un secreto compartido (ARTWORK_ACCESS_SECRET) como
// query param — así el link que aparece en el pedido de Shopify
// funciona con un clic, pero no es un archivo público indexable:
// sin el secreto correcto, la Function responde 403.
//
// El secreto vive en una variable de entorno de Netlify (nunca en
// el código ni en el navegador) — ver instrucciones de instalación.
// ──────────────────────────────────────────────────────────────

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const url = new URL(req.url);
  const fileKey = url.searchParams.get('key');
  const providedSecret = url.searchParams.get('secret');

  const expectedSecret = process.env.ARTWORK_ACCESS_SECRET;

  if (!expectedSecret) {
    // Misconfiguration — the site owner hasn't set the env var yet.
    return new Response('Artwork access is not configured yet.', { status: 500 });
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return new Response('Not authorized.', { status: 403 });
  }

  if (!fileKey) {
    return new Response('Missing file reference.', { status: 400 });
  }

  const store = getStore('customer-artwork');
  const result = await store.getWithMetadata(fileKey, { type: 'arrayBuffer' });

  if (!result) {
    return new Response('File not found. It may have been removed.', { status: 404 });
  }

  const contentType = result.metadata?.contentType || 'application/octet-stream';
  const originalName = result.metadata?.originalName || fileKey;

  return new Response(result.data, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${originalName}"`,
      // Never let this be cached publicly or indexed — it's a protected
      // customer file, not a public asset.
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};

export const config = {
  path: '/api/get-artwork',
};
