/**
 * shopify-client.js
 * ──────────────────────────────────────────────────────────────
 * Cliente centralizado de la Shopify Storefront API.
 * Toda llamada GraphQL a Shopify pasa por aquí — nada de lógica
 * de UI en este archivo, y nada de llamadas directas a fetch()
 * fuera de él. Así, si el día de mañana crece el catálogo, solo
 * se toca este archivo.
 * ──────────────────────────────────────────────────────────────
 */

class ShopifyError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'network' | 'http' | 'graphql' | 'not_found' | 'sold_out'
  }
}

const ShopifyClient = (() => {
  const cfg = window.SHOPIFY_CONFIG;
  const ENDPOINT = `https://${cfg.storeDomain}/api/${cfg.apiVersion}/graphql.json`;

  async function request(query, variables = {}) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': cfg.publicToken,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (networkErr) {
      throw new ShopifyError('network', 'Could not reach Shopify. Check your connection.');
    }

    if (!res.ok) {
      throw new ShopifyError('http', `Shopify API responded with status ${res.status}.`);
    }

    const json = await res.json();

    if (json.errors && json.errors.length) {
      throw new ShopifyError('graphql', json.errors.map((e) => e.message).join('; '));
    }

    return json.data;
  }

  // ── QUERIES ──────────────────────────────────────────────

  const PRODUCT_QUERY = /* GraphQL */ `
    query PilotProduct($handle: String!) {
      product(handle: $handle) {
        id
        title
        handle
        descriptionHtml
        featuredImage {
          id
          url
          altText
          width
          height
        }
        images(first: 50) {
          nodes {
            id
            url
            altText
            width
            height
          }
        }
        options {
          name
          optionValues {
            name
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            availableForSale
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            selectedOptions {
              name
              value
            }
            image {
              id
              url
              altText
              width
              height
            }
          }
        }
        metafields(
          identifiers: [
            { namespace: "custom", key: "allow_custom_text" }
            { namespace: "custom", key: "allow_file_upload" }
            { namespace: "custom", key: "allow_proof_request" }
            { namespace: "custom", key: "production_time" }
            { namespace: "custom", key: "bulk_minimum" }
            { namespace: "custom", key: "personalization_instructions" }
          ]
        ) {
          key
          value
          type
        }
      }
    }
  `;

  async function getPilotProduct() {
    const data = await request(PRODUCT_QUERY, { handle: cfg.pilotProductHandle });
    if (!data.product) {
      throw new ShopifyError(
        'not_found',
        `No product found with handle "${cfg.pilotProductHandle}". Check that it's Active and published to the Headless channel.`
      );
    }
    return normalizeProduct(data.product);
  }

  // Builds the product's full, deduped gallery: featuredImage first, then
  // every image in `images(first: 50)`, then any variant image that isn't
  // already in that set (some stores only attach an image to a variant and
  // never add it to the product's own image list). Dedup key is image id
  // when present, falling back to the URL with its query string stripped
  // (Shopify CDN URLs vary by ?v= cache-busting param, not by identity).
  function dedupeKey(img) {
    if (!img) return null;
    if (img.id) return img.id;
    if (img.url) return img.url.split('?')[0];
    return null;
  }

  function altTextFor(img, productTitle, colorValue) {
    if (img && img.altText && img.altText.trim()) return img.altText.trim();
    if (colorValue) return `${productTitle} — ${colorValue}`;
    return productTitle;
  }

  // Picks a human label for an image that came from a variant, so alt text
  // can read "Product Title — Navy" instead of just the bare product title.
  // Prefers an option literally named "Color"/"Colour"; falls back to the
  // variant's first selected option so this still works for products whose
  // differentiating option is named something else (e.g. "Finish", "Style").
  function colorLabelFor(variant) {
    if (!variant || !variant.selectedOptions) return null;
    const named = variant.selectedOptions.find((so) => /^colou?r$/i.test(so.name || ''));
    if (named) return named.value;
    return variant.selectedOptions[0] ? variant.selectedOptions[0].value : null;
  }

  function buildGallery(raw, productTitle) {
    // Map every image (by dedupe key) to the color/option label of whichever
    // variant uses it, if any — built up front so it applies no matter
    // whether that same image is first discovered via the general images
    // list or only via a variant (both are common across real stores).
    const colorByKey = new Map();
    (raw.variants?.nodes || []).forEach((v) => {
      if (!v.image) return;
      const key = dedupeKey(v.image);
      if (key && !colorByKey.has(key)) colorByKey.set(key, colorLabelFor(v));
    });

    const seen = new Set();
    const gallery = [];

    function addImage(img) {
      if (!img || !img.url) return;
      const key = dedupeKey(img);
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      gallery.push({
        id: img.id || null,
        url: img.url,
        altText: altTextFor(img, productTitle, key ? colorByKey.get(key) : null),
        width: img.width || null,
        height: img.height || null,
      });
    }

    if (raw.featuredImage) addImage(raw.featuredImage);
    (raw.images?.nodes || []).forEach(addImage);
    (raw.variants?.nodes || []).forEach((v) => {
      if (v.image) addImage(v.image);
    });

    return gallery;
  }

  function normalizeProduct(raw) {
    const metafieldMap = {};
    (raw.metafields || []).forEach((mf) => {
      if (!mf) return;
      metafieldMap[mf.key] = mf.value;
    });

    const gallery = buildGallery(raw, raw.title);

    return {
      id: raw.id,
      handle: raw.handle,
      title: raw.title,
      descriptionHtml: raw.descriptionHtml,
      featuredImage: raw.featuredImage
        ? { ...raw.featuredImage, altText: altTextFor(raw.featuredImage, raw.title, null) }
        : gallery[0] || null,
      images: gallery,
      options: raw.options,
      variants: raw.variants.nodes.map((v) => ({
        id: v.id,
        title: v.title,
        availableForSale: v.availableForSale,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        selectedOptions: v.selectedOptions,
        image: v.image || null,
      })),
      metafields: {
        allowCustomText: metafieldMap.allow_custom_text === 'true',
        allowFileUpload: metafieldMap.allow_file_upload === 'true',
        allowProofRequest: metafieldMap.allow_proof_request === 'true',
        productionTime: metafieldMap.production_time || null,
        bulkMinimum: metafieldMap.bulk_minimum || null,
        personalizationInstructions: metafieldMap.personalization_instructions || null,
      },
    };
  }

  // ── CART MUTATIONS ───────────────────────────────────────

  const CART_FIELDS = /* GraphQL */ `
    fragment CartFields on Cart {
      id
      checkoutUrl
      totalQuantity
      cost {
        subtotalAmount {
          amount
          currencyCode
        }
        totalAmount {
          amount
          currencyCode
        }
      }
      lines(first: 50) {
        nodes {
          id
          quantity
          attributes {
            key
            value
          }
          merchandise {
            ... on ProductVariant {
              id
              title
              image {
                url
                altText
              }
              product {
                title
                handle
              }
            }
          }
          cost {
            totalAmount {
              amount
              currencyCode
            }
          }
        }
      }
    }
  `;

  const CART_CREATE = /* GraphQL */ `
    mutation CartCreate($lines: [CartLineInput!]) {
      cartCreate(input: { lines: $lines }) {
        cart {
          ...CartFields
        }
        userErrors {
          field
          message
        }
      }
    }
    ${CART_FIELDS}
  `;

  const CART_LINES_ADD = /* GraphQL */ `
    mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          ...CartFields
        }
        userErrors {
          field
          message
        }
      }
    }
    ${CART_FIELDS}
  `;

  const CART_LINES_REMOVE = /* GraphQL */ `
    mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          ...CartFields
        }
        userErrors {
          field
          message
        }
      }
    }
    ${CART_FIELDS}
  `;

  const CART_LINES_UPDATE = /* GraphQL */ `
    mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart {
          ...CartFields
        }
        userErrors {
          field
          message
        }
      }
    }
    ${CART_FIELDS}
  `;

  const CART_GET = /* GraphQL */ `
    query CartGet($cartId: ID!) {
      cart(id: $cartId) {
        ...CartFields
      }
    }
    ${CART_FIELDS}
  `;

  function checkUserErrors(payload, opName) {
    if (payload.userErrors && payload.userErrors.length) {
      const message = payload.userErrors.map((e) => e.message).join('; ');
      // Shopify reports an expired/nonexistent cart ID as a userError rather
      // than a top-level GraphQL error — reclassify so callers can tell this
      // apart from a generic failure and recover by starting a new cart.
      const isMissingCart = payload.userErrors.some(
        (e) => /cart/i.test(e.message || '') && /(not found|does not exist|invalid)/i.test(e.message || '')
      );
      throw new ShopifyError(isMissingCart ? 'not_found' : 'graphql', `${opName}: ${message}`);
    }
  }

  async function createCart(line) {
    const data = await request(CART_CREATE, { lines: [line] });
    checkUserErrors(data.cartCreate, 'cartCreate');
    return attachWarnings(data.cartCreate.cart, data.cartCreate.warnings);
  }

  async function addLineToCart(cartId, line) {
    const data = await request(CART_LINES_ADD, { cartId, lines: [line] });
    checkUserErrors(data.cartLinesAdd, 'cartLinesAdd');
    return attachWarnings(data.cartLinesAdd.cart, data.cartLinesAdd.warnings);
  }

  async function removeLineFromCart(cartId, lineId) {
    const data = await request(CART_LINES_REMOVE, { cartId, lineIds: [lineId] });
    checkUserErrors(data.cartLinesRemove, 'cartLinesRemove');
    return attachWarnings(data.cartLinesRemove.cart, data.cartLinesRemove.warnings);
  }

  async function updateLineInCart(cartId, lineId, quantity) {
    const data = await request(CART_LINES_UPDATE, { cartId, lines: [{ id: lineId, quantity }] });
    checkUserErrors(data.cartLinesUpdate, 'cartLinesUpdate');
    return attachWarnings(data.cartLinesUpdate.cart, data.cartLinesUpdate.warnings);
  }

  async function getCart(cartId) {
    const data = await request(CART_GET, { cartId });
    return data.cart; // null if the cart expired or doesn't exist — handled by caller
  }

  // Mutation payloads carry `warnings` (e.g. quantity silently capped due to
  // stock) as a sibling of `cart`, not as a field on Cart itself. Attach it
  // here so callers can read cart.warnings uniformly after any mutation.
  function attachWarnings(cart, warnings) {
    if (cart) cart.warnings = warnings || [];
    return cart;
  }

  return {
    getPilotProduct,
    createCart,
    addLineToCart,
    removeLineFromCart,
    updateLineInCart,
    getCart,
    altTextFor,
    ShopifyError,
  };
})();
