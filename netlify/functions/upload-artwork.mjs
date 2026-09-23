// netlify/functions/upload-artwork.mjs
// ──────────────────────────────────────────────────────────────
// Recibe un archivo de logo/artwork desde /shop, lo valida en
// servidor (formato, tamaño, límite de solicitudes básico), y lo
// guarda en Netlify Blobs con una key aleatoria — nunca con el
// nombre original del archivo del cliente.
//
// El navegador nunca recibe credenciales de escritura: solo habla
// con esta Function, que es la única que toca Blobs directamente.
// ──────────────────────────────────────────────────────────────

import { getStore } from '@netlify/blobs';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — matches the storefront limit

// Very small in-memory rate limit: resets whenever the function's
// execution environment recycles (Netlify Functions are not long-lived
// singletons), so this is a basic abuse deterrent, not a strict guarantee.
// For stronger protection at higher volume, move this to a Blobs-backed
// counter keyed by IP with a TTL.
const recentUploadsByIp = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 8;

export default async (req, context) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const ip = context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  if (isRateLimited(ip)) {
    return jsonResponse(429, { error: 'Too many uploads. Please wait a moment and try again.' });
  }

  let formData;
  try {
    formData = await req.formData();
  } catch (err) {
    return jsonResponse(400, { error: 'Could not read the uploaded file.' });
  }

  const file = formData.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return jsonResponse(400, { error: 'No file was provided.' });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return jsonResponse(400, { error: 'Only PNG and JPG images are allowed.' });
  }

  if (file.size > MAX_BYTES) {
    return jsonResponse(400, { error: 'File is too large. Maximum size is 20 MB.' });
  }

  if (file.size === 0) {
    return jsonResponse(400, { error: 'The uploaded file is empty.' });
  }

  // Re-check the actual bytes' magic numbers so a renamed file can't spoof
  // its declared MIME type (defense in depth beyond file.type, which the
  // browser sets client-side and isn't fully trustworthy on its own).
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeAllowedImage(buffer, file.type)) {
    return jsonResponse(400, { error: 'The file does not appear to be a valid PNG or JPG image.' });
  }

  const key = buildObjectKey(file.type);

  try {
    const store = getStore('customer-artwork');
    await store.set(key, buffer, {
      metadata: {
        originalName: sanitizeFilename(file.name || 'upload'),
        contentType: file.type,
        uploadedAt: new Date().toISOString(),
        // Not yet linked to an order — used by the cleanup job described in
        // FILE_UPLOAD_PLAN.md to remove abandoned uploads after 30 days.
        linkedToOrder: 'false',
      },
    });
  } catch (err) {
    return jsonResponse(500, { error: 'Could not save the file. Please try again.' });
  }

  return jsonResponse(200, { fileKey: key, artworkUrl: buildArtworkUrl(req, key) });
};

function buildArtworkUrl(req, fileKey) {
  const secret = process.env.ARTWORK_ACCESS_SECRET;
  if (!secret) {
    // Misconfigured — no secret set yet. Returning null here means shop.js
    // will fall back to storing only the fileKey (see shop.js), so nothing
    // breaks, but the business won't have a clickable link until the env
    // var is set. See FILE_UPLOAD_PLAN.md / README install instructions.
    return null;
  }
  const origin = new URL(req.url).origin;
  return `${origin}/api/get-artwork?key=${encodeURIComponent(fileKey)}&secret=${encodeURIComponent(secret)}`;
}

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (recentUploadsByIp.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  recentUploadsByIp.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX_PER_WINDOW;
}

function buildObjectKey(mimeType) {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  return `${crypto.randomUUID()}.${ext}`;
}

function sanitizeFilename(name) {
  return String(name).replace(/[^\w.\-]/g, '_').slice(0, 120);
}

// Checks the first few bytes against known magic numbers for PNG/JPEG.
function looksLikeAllowedImage(bytes, declaredType) {
  if (bytes.length < 4) return false;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (declaredType === 'image/png') return isPng;
  if (declaredType === 'image/jpeg') return isJpg;
  return false;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = {
  path: '/api/upload-artwork',
};
