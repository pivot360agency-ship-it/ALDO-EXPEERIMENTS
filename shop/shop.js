/**
 * shop.js
 * ──────────────────────────────────────────────────────────────
 * Lógica de la pantalla /shop. Solo UI: pinta el producto,
 * gestiona selección de variante/cantidad/personalización, y
 * habla con el carrito de Shopify a través de ShopifyClient.
 * No hay llamadas fetch() directas aquí — todo pasa por
 * shopify-client.js.
 * ──────────────────────────────────────────────────────────────
 */

(function () {
  const CART_STORAGE_KEY = 'vimprint_shopify_cart_id';

  const state = {
    product: null,
    isQuoteOnly: false, // true when the product carries the "quote-only" tag
    selectedOptions: {}, // { "Color": "Black" }
    selectedVariant: null,
    quantity: 1,
    activeImageIndex: 0,
    userPickedImage: false, // true once the shopper has tapped a thumbnail/dot directly
    userPickedVariant: false, // true only after an intentional option-swatch click — never on initial load
    customText: '',
    requestProof: false,
    uploadedFileKey: null, // Blobs key once a file has finished uploading successfully
    uploadedArtworkUrl: null, // full protected link, if the server has the access secret configured
    uploadedFileName: null,
    uploadStatus: 'idle', // 'idle' | 'uploading' | 'done' | 'error'
    uploadError: '',
    cart: null,
    cartBusy: false, // true while any cart mutation is in flight — blocks checkout & new mutations
    addToCartInFlight: false, // separate guard against double-click on "Add to Cart"
  };

  const root = document.getElementById('shop-root');
  const breadcrumbEl = document.getElementById('shopBreadcrumb');
  const cartToggleEl = document.getElementById('cartToggle');
  const cartCountEl = document.getElementById('cartCount');
  const cartDrawerEl = document.getElementById('cartDrawer');
  const cartBodyEl = document.getElementById('cartDrawerBody');
  const cartSubtotalEl = document.getElementById('cartSubtotal');
  const cartCheckoutBtn = document.getElementById('cartCheckoutBtn');
  const cartOverlayEl = document.getElementById('cartOverlay');
  const cartErrorEl = document.getElementById('cartDrawerError');

  let lastFocusedBeforeDrawer = null;

  // ── Bootstrap ────────────────────────────────────────────

  const QUOTE_ONLY_TAG = 'quote-only';

  const CATALOG_FILTERS = [
    { label: 'All', match: null },
    { label: 'Tumblers & Gifts', match: 'tumblers-gifts' },
    { label: 'Military Awards', match: 'military-awards' },
    { label: 'Embroidered Apparel', match: 'embroidered-apparel' },
    { label: 'Business Uniforms', match: 'business-uniforms' },
    { label: 'Pet Memorials', match: 'pet-memorials' },
    { label: 'For Business', match: 'for-business' },
    // Frontend mapping fix: "Personalized Metal Tag / Keychain" (and any
    // other product) lives in the real Shopify collection
    // "Personalized Gifts & Pets" (handle personalized-gifts-pets), which
    // had no matching filter button — it was unreachable via any catalog
    // filter even though pickPrimaryCollection() already showed its real
    // collection title as the card's category badge. This adds the
    // matching filter; it does not change or invent any Shopify data.
    { label: 'Personalized Gifts', match: 'personalized-gifts-pets' },
  ];

  // Maps a `?collection=` URL param value (as used by footer/external links)
  // to the matching CATALOG_FILTERS label. Kept separate from the filter
  // buttons' own internal `match` values so this can also resolve a
  // collection handle that has no dedicated filter button (e.g. the
  // Personalized Gifts & Pets collection, see badge mapping below) by
  // falling back to the closest existing filter with the extra entries
  // added here.
  const COLLECTION_PARAM_TO_FILTER_LABEL = {
    'military-awards': 'Military Awards',
    'for-business': 'For Business',
    'tumblers-gifts': 'Tumblers & Gifts',
    'embroidered-apparel': 'Embroidered Apparel',
    'business-uniforms': 'Business Uniforms',
    'pet-memorials': 'Pet Memorials',
    'personalized-gifts-pets': 'Personalized Gifts',
  };

  // Fase B: category cards are alternate triggers for the SAME filter
  // buttons above (reuse existing filter logic — nothing new is filtered
  // here). handle: null falls back to a CSS-only card visual when no
  // representative product image is available in already-fetched data.
  // Category-card representative photos are real Shopify images (not run
  // through ShopifyClient.placeholderCategoryFor, which needs a full
  // product object) — this maps each card's own filter `match` handle to
  // the closest existing local placeholder SVG, purely as an onerror
  // fallback target if that live image URL ever 404s.
  const PLACEHOLDER_KEY_FOR_FILTER_MATCH = {
    'tumblers-gifts': 'gifts',
    'military-awards': 'military',
    'embroidered-apparel': 'embroidery',
    'business-uniforms': 'business',
    'pet-memorials': 'pet',
    'for-business': 'business',
    'personalized-gifts-pets': 'gifts',
  };

  const CATEGORY_CARDS = [
    { label: 'Tumblers & Gifts', match: 'tumblers-gifts', title: 'Tumblers & Gifts', desc: 'Engraved drinkware and keepsakes for everyday and celebration.', fixedImage: '/assets/images/craft-tumblers-gifts.webp' },
    { label: 'Military Awards', match: 'military-awards', title: 'Military Awards', desc: 'Custom plaques and recognition pieces for service and retirement.', fixedImage: '/assets/images/craft-military-awards.webp' },
    { label: 'Embroidered Apparel', match: 'embroidered-apparel', title: 'Embroidered Apparel', desc: 'Logo and name embroidery on shirts, hats and outerwear.', fixedImage: '/assets/images/craft-embroidered-apparel.webp' },
    { label: 'Business Uniforms', match: 'business-uniforms', title: 'Business Uniforms', desc: 'Branded uniforms and workwear for professional teams.' },
    { label: 'Pet Memorials', match: 'pet-memorials', title: 'Pet Memorials', desc: 'Lasting, personalized tributes to a beloved companion.' },
  ];

  const catalogState = {
    products: null, // null = not loaded yet; [] = loaded, empty
    activeFilter: 'All',
    sort: 'featured', // 'featured' | 'price-asc' | 'price-desc' — client-side only, existing fetched data
  };

  const BEST_SELLERS_HANDLE = 'best-sellers';

  // Technical/structural collections that exist for site plumbing (the
  // Home page feed, the Best Sellers merchandising shelf) rather than as a
  // real commercial category. They must never be shown as a product's
  // displayed category or breadcrumb segment, even though the product
  // legitimately stays assigned to them for their real purpose.
  const NON_COMMERCIAL_COLLECTION_HANDLES = ['frontpage', 'best-sellers'];

  /**
   * Returns the first commercially-relevant collection for display
   * (card label / breadcrumb), skipping technical collections such as
   * "Home page" and "Best Sellers". Returns null if the product has no
   * commercial collection assigned (falls back to no-category display,
   * never to a technical collection).
   */
  function pickPrimaryCollection(collections) {
    if (!collections || !collections.length) return null;
    const commercial = collections.find(
      (c) => c && !NON_COMMERCIAL_COLLECTION_HANDLES.includes(c.handle)
    );
    return commercial || null;
  }

  async function init() {
    renderLoading();
    await restoreCart();

    // Fase 2: /shop/ with NO ?handle= is the general catalog. Any ?handle=
    // present routes straight to that product's detail view, exactly as
    // before — this is additive, not a replacement of the existing routing.
    const params = new URLSearchParams(window.location.search);
    const handle = params.get('handle');

    if (!handle) {
      await initCatalog();
      return;
    }

    document.body.classList.remove('catalog-view');

    try {
      state.product = await ShopifyClient.getProductByHandle(handle);
      state.isQuoteOnly = ShopifyClient.hasTag(state.product, QUOTE_ONLY_TAG);
      trackProduct('view_item', state.product, null, 1);
      updateWhatsAppLink(state.product);

      // Breadcrumb: Home / Shop All / {Collection} / {Product} when the
      // product belongs to a real collection, otherwise the Fase 2 default
      // of Home / Shop All / {Product} (no invented collection level).
      const collection = pickPrimaryCollection(state.product.collections);
      if (collection) {
        // No dedicated collection route exists in this SPA (the catalog only
        // supports its own in-page category filter buttons), so the
        // collection crumb is plain text rather than a link to a URL that
        // wouldn't actually filter anything.
        setBreadcrumb(
          `<a href="/">Home</a> / <a href="/shop/">Shop All</a> / ` +
          `${escapeHtml(collection.title)} / ` +
          `${escapeHtml(state.product.title)}`
        );
      } else {
        setBreadcrumb(`<a href="/">Home</a> / <a href="/shop/">Shop All</a> / ${escapeHtml(state.product.title)}`);
      }

      updateMetaTagsForProduct(state.product, handle);
      initDefaultSelection();
      renderProduct();
    } catch (err) {
      setBreadcrumb('<a href="/">Home</a> / <a href="/shop/">Shop All</a>');
      if (err && err.kind === 'not_found') updateMetaTagsForNotFound();
      renderError(err);
    }
  }

  // ── Catalog (Fase 2) ─────────────────────────────────────

  async function initCatalog() {
    document.body.classList.add('catalog-view');
    setBreadcrumb('<a href="/">Home</a> / Shop All');
    updateMetaTagsForCatalog();

    // Item 3: a `?collection=<handle>` URL param (e.g. from the footer's
    // "Military Awards" / "For Business" links) auto-applies the matching
    // filter on load. Unrecognized values are ignored — falls back to "All"
    // — so a stale/typo'd link never leaves the catalog looking empty.
    const params = new URLSearchParams(window.location.search);
    const collectionParam = params.get('collection');
    const mappedLabel = collectionParam ? COLLECTION_PARAM_TO_FILTER_LABEL[collectionParam] : null;
    if (mappedLabel) catalogState.activeFilter = mappedLabel;

    try {
      catalogState.products = await ShopifyClient.getAllActiveProducts();
      renderCatalog();
    } catch (err) {
      renderError(err);
    }
  }

  // Keeps the URL's `?collection=` param in sync with the active filter
  // without touching browser history — uses replaceState (never pushState)
  // so the Back button still behaves exactly as normal navigation would
  // (no extra history entries per filter click).
  function syncFilterUrlParam(label) {
    const url = new URL(window.location.href);
    const handle = Object.keys(COLLECTION_PARAM_TO_FILTER_LABEL).find(
      (h) => COLLECTION_PARAM_TO_FILTER_LABEL[h] === label
    );
    if (handle) {
      url.searchParams.set('collection', handle);
    } else {
      url.searchParams.delete('collection');
    }
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  }

  function setBreadcrumb(html) {
    if (breadcrumbEl) breadcrumbEl.innerHTML = html;
  }

  // ── SEO: dynamic <title>/meta/OG/canonical/JSON-LD (Fase 9) ─────────
  // The SPA has one static index.html, so every route (catalog, a product,
  // or an invalid handle) must rewrite these tags itself. Nothing here
  // invents data — every value either comes straight from the Shopify
  // product/catalog data or is omitted.

  const SITE_NAME = 'V Imprint Designs';
  const SITE_ORIGIN = 'https://vimprintdesigns.com';

  function setMetaContent(id, content) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('content', content);
  }

  function setOrRemoveOgImage(url) {
    let el = document.getElementById('ogImage');
    if (!url) {
      // No real product image — never fabricate/point at a generic stock
      // image, just omit the tag entirely.
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('meta');
      el.id = 'ogImage';
      el.setAttribute('property', 'og:image');
      document.head.appendChild(el);
    }
    el.setAttribute('content', url);
  }

  // Strips HTML tags and collapses whitespace so descriptionHtml can be used
  // as a plain-text fallback meta description when the product has no SEO
  // description set in Shopify.
  function stripHtmlToText(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    return text.slice(0, max - 1).trimEnd() + '…';
  }

  function setStructuredData(json) {
    const el = document.getElementById('productLd');
    if (!el) return;
    el.textContent = json ? JSON.stringify(json, null, 0) : '';
  }

  function updateMetaTagsForCatalog() {
    const title = `Shop All | ${SITE_NAME}`;
    const description = 'Shop personalized engraved and embroidered gifts from V Imprint Designs. Custom text, colors, and fast turnaround, shipped nationwide.';
    const url = `${SITE_ORIGIN}/shop/`;

    document.title = title;
    setMetaContent('shopMetaDescription', description);
    setMetaContent('ogTitle', title);
    setMetaContent('ogDescription', description);
    setMetaContent('shopRobots', 'index,follow');
    const canonicalEl = document.getElementById('shopCanonical');
    if (canonicalEl) canonicalEl.setAttribute('href', url);
    setMetaContent('ogUrl', url);
    setOrRemoveOgImage(null); // catalog has no single representative image — omit rather than fake one
    setStructuredData(null); // Product JSON-LD only applies to a single product page
  }

  function updateMetaTagsForNotFound() {
    const title = `Product Not Found | ${SITE_NAME}`;
    const description = "This item isn't available right now. Browse our full catalog of personalized, laser-engraved and embroidered gifts instead.";
    document.title = title;
    setMetaContent('shopMetaDescription', description);
    setMetaContent('ogTitle', title);
    setMetaContent('ogDescription', description);
    // A not-found page has no real content of its own — keep it out of the
    // index rather than letting an empty/duplicate page get crawled as 200.
    setMetaContent('shopRobots', 'noindex,follow');
    const canonicalEl = document.getElementById('shopCanonical');
    if (canonicalEl) canonicalEl.setAttribute('href', `${SITE_ORIGIN}/shop/`);
    setMetaContent('ogUrl', `${SITE_ORIGIN}/shop/`);
    setOrRemoveOgImage(null);
    setStructuredData(null);
  }

  function updateMetaTagsForProduct(p, handle) {
    const title = `${p.title} | ${SITE_NAME}`;

    // Prefer the real Shopify SEO description field; fall back to the
    // product's own description text (stripped of HTML); never fall back to
    // filler copy.
    let description = (p.seo && p.seo.description && p.seo.description.trim()) || '';
    if (!description) description = stripHtmlToText(p.descriptionHtml);
    if (description) description = truncate(description, 160);

    const url = `${SITE_ORIGIN}/shop/?handle=${encodeURIComponent(handle)}`;
    const image = p.featuredImage && p.featuredImage.url ? p.featuredImage.url : null;

    document.title = title;
    if (description) {
      setMetaContent('shopMetaDescription', description);
      setMetaContent('ogDescription', description);
    }
    setMetaContent('ogTitle', title);
    setMetaContent('shopRobots', 'index,follow');
    const canonicalEl = document.getElementById('shopCanonical');
    if (canonicalEl) canonicalEl.setAttribute('href', url);
    setMetaContent('ogUrl', url);
    setOrRemoveOgImage(image); // only set og:image when a real product image exists

    // Schema.org Product JSON-LD — only include fields we actually have.
    const firstVariant = p.variants && p.variants[0];
    const prices = (p.variants || []).map((v) => Number(v.price.amount));
    const minPrice = prices.length ? Math.min(...prices) : null;
    const currency = firstVariant ? firstVariant.price.currencyCode : null;
    const anyAvailable = (p.variants || []).some((v) => v.availableForSale);

    if (minPrice !== null && currency) {
      const ld = {
        '@context': 'https://schema.org/',
        '@type': 'Product',
        name: p.title,
        url,
      };
      if (image) ld.image = [image];
      if (description) ld.description = description;
      ld.offers = {
        '@type': 'Offer',
        url,
        priceCurrency: currency,
        price: String(minPrice),
        availability: anyAvailable
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      };
      setStructuredData(ld);
    } else {
      setStructuredData(null);
    }
  }

  function filteredCatalogProducts() {
    const filter = CATALOG_FILTERS.find((f) => f.label === catalogState.activeFilter);
    let list = (!filter || !filter.match)
      ? (catalogState.products || [])
      : (catalogState.products || []).filter((p) => p.collections.some((c) => c.handle === filter.match));

    // Client-side sort only — uses data already fetched by getAllActiveProducts(),
    // no new Storefront query shape. 'featured' keeps the server's own order.
    if (catalogState.sort === 'price-asc' || catalogState.sort === 'price-desc') {
      list = list.slice().sort((a, b) => {
        const pa = a.minPrice === null ? Infinity : a.minPrice;
        const pb = b.minPrice === null ? Infinity : b.minPrice;
        return catalogState.sort === 'price-asc' ? pa - pb : pb - pa;
      });
    }
    return list;
  }

  // Finds a representative product image for a category card from data the
  // catalog has ALREADY fetched (no extra API calls) — the first product in
  // that collection that has a featured image.
  function representativeImageFor(matchHandle) {
    const all = catalogState.products || [];
    const hit = all.find((p) => p.image && p.collections.some((c) => c.handle === matchHandle));
    return hit ? hit.image : null;
  }

  function initialsFor(title) {
    return (title || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }

  function renderShopHero() {
    return `
      <section class="shop-hero-v3" aria-label="Shop introduction">
        <img class="shop-hero-v3-img" src="/assets/images/shop-hero-flag-plaque.webp" alt="Laser-engraved American flag recognition plaque with personalized plate" loading="eager" fetchpriority="high" width="1608" height="1290">
        <div class="shop-hero-v3-scrim" aria-hidden="true"></div>
        <div class="shop-hero-v3-copy">
          <span class="shop-hero-v3-eyebrow">Personalized With Purpose</span>
          <p class="shop-hero-v3-heading"><span>Made Personal.</span><span>Made to Last.</span></p>
          <p class="shop-hero-v3-body">Custom engraving, embroidery, military awards and meaningful gifts, crafted with precision in Virginia.</p>
          <div class="shop-hero-v3-ctas">
            <button type="button" class="shop-hero-cta shop-hero-cta-primary" id="heroShopCta">Shop Best Sellers</button>
            <button type="button" class="shop-hero-cta shop-hero-cta-outline" id="heroMilitaryCta" data-filter-trigger="Military Awards">Military Awards</button>
          </div>
          <p class="shop-hero-v3-trust">Made in Virginia &middot; Fast Turnaround &middot; Local Pickup</p>
        </div>
      </section>`;
  }

  function renderCategoryCards() {
    return `
      <section class="mhw-section craft-section mhw-reveal" aria-label="Shop by craft">
        <div class="craft-section-heading">
          <div>
            <span class="mhw-eyebrow mhw-eyebrow-onlight">Shop by Craft</span>
            <h2 class="mhw-heading">Every Piece, Made With Purpose</h2>
          </div>
        </div>
        <div class="craft-cards category-cards">
          ${CATEGORY_CARDS.map((c) => {
            // A card-level fixedImage (a curated local photo) always wins over
            // the auto-picked first-product-in-collection image, so specific
            // craft cards can show a chosen representative shot rather than
            // whichever product happened to be first in that collection.
            const fixed = c.fixedImage;
            const img = fixed ? null : representativeImageFor(c.match);
            return `
            <button type="button" class="craft-card category-card" data-filter-trigger="${escapeHtml(c.label)}" aria-label="Shop ${escapeHtml(c.title)}">
              <div class="craft-card-image category-card-image">
                ${fixed
                  ? `<img src="${escapeHtml(fixed)}" alt="" loading="lazy" width="320" height="400" data-placeholder-fallback="/shop/assets/placeholders/placeholder-${escapeHtml(c.match ? PLACEHOLDER_KEY_FOR_FILTER_MATCH[c.match] || 'default' : 'default')}.svg">`
                  : img
                  ? `<img src="${escapeHtml(img.url)}" alt="" loading="lazy" width="320" height="400" data-placeholder-fallback="/shop/assets/placeholders/placeholder-${escapeHtml(c.match ? PLACEHOLDER_KEY_FOR_FILTER_MATCH[c.match] || 'default' : 'default')}.svg">`
                  : `<div class="craft-card-image-fallback category-card-image-fallback" data-mark="${escapeHtml(initialsFor(c.title))}" aria-hidden="true"></div>`}
              </div>
              <div class="craft-card-body category-card-body">
                <div class="craft-card-title category-card-title">${escapeHtml(c.title)}</div>
                <div class="craft-card-desc category-card-desc">${escapeHtml(c.desc)}</div>
                <span class="craft-card-cta">Shop ${escapeHtml(c.label)} &rarr;</span>
              </div>
            </button>`;
          }).join('')}
        </div>
      </section>`;
  }

  // Reuses the already-fetched catalog data, filtered client-side by the
  // Best Sellers collection handle — no separate network call, and never a
  // hardcoded product list (see ShopifyClient.getAllActiveProducts()).
  function bestSellerProducts() {
    const all = catalogState.products || [];
    return all.filter((p) => p.collections.some((c) => c.handle === BEST_SELLERS_HANDLE));
  }

  // Horizontal "shelf": every product section (Best Sellers and each
  // category) uses the same swipeable row and the same card size.
  function renderShelf(id, title, list) {
    return `
      <section class="shelf-section" id="${escapeHtml(id)}" aria-label="${escapeHtml(title)}">
        <div class="shelf-head">
          <h2 class="shelf-title">${escapeHtml(title)}</h2>
          <div class="shelf-arrows" aria-hidden="true">
            <button type="button" class="shelf-arrow" data-shelf-dir="-1" tabindex="-1">&#8249;</button>
            <button type="button" class="shelf-arrow" data-shelf-dir="1" tabindex="-1">&#8250;</button>
          </div>
        </div>
        <div class="shelf" data-shelf>
          ${list.map((p) => renderCatalogCard(p)).join('')}
        </div>
      </section>`;
  }

  function sortCatalogList(list) {
    if (catalogState.sort === 'price-asc' || catalogState.sort === 'price-desc') {
      return list.slice().sort((a, b) => {
        const pa = a.minPrice === null ? Infinity : a.minPrice;
        const pb = b.minPrice === null ? Infinity : b.minPrice;
        return catalogState.sort === 'price-asc' ? pa - pb : pb - pa;
      });
    }
    return list;
  }

  function renderShelves(products) {
    if (catalogState.activeFilter !== 'All') {
      return renderShelf('catalogShelf', catalogState.activeFilter, products);
    }
    const all = catalogState.products || [];
    const out = [];
    const best = sortCatalogList(bestSellerProducts());
    if (best.length) out.push(renderShelf('bestSellers', 'Best Sellers', best));
    CATALOG_FILTERS.forEach((f) => {
      if (!f.match) return;
      const list = sortCatalogList(all.filter((p) => p.collections.some((c) => c.handle === f.match)));
      if (list.length) out.push(renderShelf('shelf-' + f.match, f.label, list));
    });
    // Products that belong to none of the filter collections still show up.
    const handles = new Set(CATALOG_FILTERS.filter((f) => f.match).map((f) => f.match));
    const rest = sortCatalogList(all.filter((p) => !p.collections.some((c) => handles.has(c.handle))));
    if (rest.length) out.push(renderShelf('shelf-more', 'More to Explore', rest));
    return out.join('');
  }

  function renderMilitaryEditorial() {
    return `
      <section class="military-editorial mhw-reveal" aria-label="Military recognition">
        <span class="military-editorial-eyebrow">Built to Honor Service</span>
        <h2>Military Awards Made to Be Remembered</h2>
        <p>Custom plaques, recognition pieces and one-of-a-kind awards created for PCS, ETS, retirement and career milestones.</p>
        <div class="military-editorial-ctas">
          <button type="button" class="shop-hero-cta shop-hero-cta-primary" data-filter-trigger="Military Awards">Explore Military Awards</button>
          <a href="/#contact" class="shop-hero-cta shop-hero-cta-outline">Request a Custom Award</a>
        </div>
      </section>`;
  }

  function renderBusinessBlock() {
    return `
      <section class="mhw-section mhw-reveal" aria-label="For business">
        <div class="business-block">
          <div>
            <span class="mhw-eyebrow mhw-eyebrow-onlight">For Business</span>
            <h2 class="mhw-heading">Make Your Team Look Like a Brand</h2>
            <p class="mhw-copy">Custom embroidered uniforms, caps and branded drinkware for businesses, teams and organizations.</p>
            <ul class="business-block-list">
              <li>Consistent Branding</li>
              <li>Volume Options</li>
              <li>Personal Service</li>
              <li>Fast Turnaround</li>
            </ul>
            <div class="business-block-ctas">
              <button type="button" class="shop-hero-cta shop-hero-cta-primary" data-filter-trigger="For Business">Shop Business Products</button>
              <a href="/#contact" class="shop-hero-cta shop-hero-cta-outline">Request a Bulk Quote</a>
            </div>
          </div>
          <div class="business-block-visual" aria-hidden="true">
            <img src="/assets/images/shop-hero-craft-lineup-v2.webp" alt="" loading="lazy" width="1672" height="940">
          </div>
        </div>
      </section>`;
  }

  function renderTrustStripCatalog() {
    const items = [
      'Crafted in Virginia',
      'Proof Available Before Production',
      'Secure Shopify Checkout',
      'Local Pickup Available',
      'English &amp; Spanish Support',
    ];
    return `
      <div class="trust-strip-v2 mhw-reveal" aria-label="Why shop with us">
        ${items.map((t) => `<span class="trust-strip-v2-item">${t}</span>`).join('')}
      </div>`;
  }

  function renderNewsletter() {
    return `
      <section class="mhw-section mhw-reveal newsletter-block" aria-label="Follow us for updates">
        <h2 class="mhw-heading">Stay in the Workshop</h2>
        <p class="mhw-copy" style="margin:0 auto;">New designs, seasonal releases and special offers are coming soon.</p>
        <a class="newsletter-social-btn" href="https://www.instagram.com/vimprintdesingsva/" target="_blank" rel="noopener noreferrer">Follow Us on Instagram</a>
      </section>`;
  }

  function renderShopFooter() {
    return `
      <footer class="shop-footer" aria-label="Site footer">
        <div class="shop-footer-inner">
          <div class="shop-footer-brand">
            <p>V Imprint Designs offers custom embroidery, laser engraving and personalized gifts, crafted in Virginia. Hablamos Espa&ntilde;ol.</p>
          </div>
          <div class="shop-footer-col">
            <h4>Shop</h4>
            <ul>
              <li><a href="/shop/">Shop All</a></li>
              <li><a href="/shop/?collection=military-awards" data-filter-trigger="Military Awards">Military Awards</a></li>
              <li><a href="/shop/?collection=for-business" data-filter-trigger="For Business">For Business</a></li>
              <li><a href="/#contact">Contact</a></li>
            </ul>
          </div>
          <div class="shop-footer-col">
            <h4>Support</h4>
            <ul>
              <li><a href="/#contact">Shipping &amp; Pickup Questions</a></li>
              <li><a href="/#contact">Refunds &amp; Order Help</a></li>
              <li><a href="/#contact">Contact</a></li>
            </ul>
          </div>
          <div class="shop-footer-col">
            <h4>Policies</h4>
            <ul>
              <li><a href="https://checkout.shopify.com/83130417401/policies/45125665017.html?locale=en" target="_blank" rel="noopener noreferrer">Shipping Policy</a></li>
              <li><a href="https://checkout.shopify.com/83130417401/policies/45125468409.html?locale=en" target="_blank" rel="noopener noreferrer">Refund Policy</a></li>
              <li><a href="https://checkout.shopify.com/83130417401/policies/44775538937.html?locale=en" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
              <li><a href="https://checkout.shopify.com/83130417401/policies/45125959929.html?locale=en" target="_blank" rel="noopener noreferrer">Terms of Service</a></li>
            </ul>
          </div>
          <div class="shop-footer-col">
            <h4>Visit</h4>
            <ul>
              <li>Local Pickup Available in Newport News, VA</li>
              <li>Hablamos Espa&ntilde;ol</li>
            </ul>
          </div>
        </div>
        <div class="shop-footer-bottom">
          <span>&copy; ${new Date().getFullYear()} V Imprint Designs. All rights reserved.</span>
          <div class="shop-footer-social">
            <a href="https://www.facebook.com/imprintdesingsVA/" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href="https://www.instagram.com/vimprintdesingsva/" target="_blank" rel="noopener noreferrer">Instagram</a>
          </div>
        </div>
      </footer>`;
  }

  function renderCatalog() {
    const products = filteredCatalogProducts();

    root.innerHTML = `
      <div class="catalog">
        ${renderShopHero()}
        <div class="catalog-bar" id="catalogGridAnchor">
          <h1 class="mhw-sr-only">Shop All: V Imprint Designs</h1>
          <div class="catalog-filters" role="tablist" aria-label="Filter products by category">
            ${CATALOG_FILTERS.map(
              (f) => `
              <button type="button" class="catalog-filter-btn ${f.label === catalogState.activeFilter ? 'active' : ''}"
                data-filter="${escapeHtml(f.label)}" role="tab" aria-selected="${f.label === catalogState.activeFilter}">
                ${escapeHtml(f.label)}
              </button>`
            ).join('')}
          </div>
          <div class="catalog-toolbar">
            <span class="catalog-results-count" id="catalogResultsCount" role="status" aria-live="polite">
              ${products.length} product${products.length === 1 ? '' : 's'}
            </span>
            ${catalogState.activeFilter !== 'All' ? `<button type="button" class="catalog-clear-btn" id="catalogClearBtn">Clear filters</button>` : ''}
            <label>
              <span class="mhw-sr-only">Sort products</span>
              <select class="catalog-sort" id="catalogSort" aria-label="Sort products">
                <option value="featured" ${catalogState.sort === 'featured' ? 'selected' : ''}>Featured</option>
                <option value="price-asc" ${catalogState.sort === 'price-asc' ? 'selected' : ''}>Price: Low to High</option>
                <option value="price-desc" ${catalogState.sort === 'price-desc' ? 'selected' : ''}>Price: High to Low</option>
              </select>
            </label>
          </div>
        </div>

        ${products.length ? renderShelves(products) : `
        <div class="catalog-empty">
          <p>No products found in this category yet.</p>
        </div>`}

        ${renderNewsletter()}
        ${renderShopFooter()}
      </div>
    `;

    bindCatalogEvents();
    initScrollReveal();
  }

  // Shopify's CDN resizes on the fly with ?width=. Product cards are ~170–230px
  // wide, so asking for the original (often 2000px+) photo was the main cause
  // of the slow image loading. Non-Shopify URLs are returned untouched.
  // ── Analytics (Google Ads gtag + Meta Pixel, already loaded in index.html).
  // Fire-and-forget: never throws, never blocks the shopper. Purchase itself
  // happens on Shopify's checkout domain and is tracked there.
  function gidNum(gid) {
    const m = String(gid || '').match(/(\d+)$/);
    return m ? m[1] : '';
  }
  function track(name, d) {
    try {
      d = d || {};
      const value = Number(d.value) || 0;
      const currency = d.currency || 'USD';
      const metaIds = d.contentIds || [];
      const map = {
        view_item: 'ViewContent', add_to_cart: 'AddToCart',
        begin_checkout: 'InitiateCheckout', generate_lead: 'Lead',
      };
      if (typeof window.gtag === 'function') {
        const g = { currency, value };
        if (d.items) g.items = d.items;
        if (d.method) g.method = d.method;
        window.gtag('event', name, g);
      }
      if (typeof window.fbq === 'function' && map[name]) {
        const f = { currency, value };
        if (metaIds.length) { f.content_ids = metaIds; f.content_type = 'product'; }
        if (d.contentName) f.content_name = d.contentName;
        if (d.method) f.content_category = d.method;
        window.fbq('track', map[name], f);
      }
    } catch (e) { /* analytics must never break the shop */ }
  }
  function trackProduct(name, p, v, qty, extra) {
    if (!p) return;
    const variant = v || (p.variants && p.variants[0]) || null;
    const price = variant && variant.price ? Number(variant.price.amount) : 0;
    const currency = variant && variant.price ? variant.price.currencyCode : 'USD';
    const q = qty || 1;
    const pid = gidNum(p.id);
    const vid = variant ? gidNum(variant.id) : '';
    track(name, Object.assign({
      value: price * q, currency,
      items: [{ item_id: pid, item_name: p.title, item_variant: vid, price, quantity: q }],
      contentIds: pid ? [vid ? `shopify_US_${pid}_${vid}` : pid] : [],
      contentName: p.title,
    }, extra || {}));
  }

  function shopifyImgUrl(url, width) {
    try {
      const u = new URL(url);
      if (u.hostname !== 'cdn.shopify.com' && !u.pathname.includes('/cdn/shop/')) return url;
      u.searchParams.set('width', String(width));
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function shopifyImgSrcset(url, widths) {
    return (widths || [240, 360, 480, 640]).map((w) => `${shopifyImgUrl(url, w)} ${w}w`).join(', ');
  }

  function renderCatalogCard(p) {
    const priceLabel = p.minPrice === null
      ? ''
      : p.isPriceRange
        ? `${formatMoney(p.minPrice, p.currency)} – ${formatMoney(p.maxPrice, p.currency)}`
        : formatMoney(p.minPrice, p.currency);

    const href = `/shop/?handle=${encodeURIComponent(p.handle)}`;
    // "Made to Order" — a product tagged accordingly in Shopify that is
    // neither quote-only nor sold out. Derived entirely from p.tags, which
    // the catalog query already fetches — no new API call.
    const isMadeToOrder = !p.isQuoteOnly && !p.soldOut && ShopifyClient.hasTag(p, 'made-to-order');

    const placeholderSrc = `/shop/assets/placeholders/placeholder-${ShopifyClient.placeholderCategoryFor(p)}.svg`;
    // Swipeable preview: every product image Shopify returned (max 4). A
    // product with a single image renders exactly like before (no dots).
    const gallery = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
    const multi = gallery.length > 1;

    return `
      <a class="catalog-card${p.soldOut && !p.isQuoteOnly ? ' is-soldout' : ''}" href="${escapeHtml(href)}" data-handle="${escapeHtml(p.handle)}">
        <div class="catalog-card-image${multi ? ' has-gallery at-start' : ''}">
          ${gallery.length
            ? `<div class="catalog-card-gallery"${multi ? ' data-gallery' : ''}>
                 ${gallery.map((img, idx) => `
                 <div class="catalog-card-slide">
                   <img ${idx === 0 ? 'src' : 'data-src'}="${escapeHtml(shopifyImgUrl(img.url, 480))}" ${idx === 0 ? 'srcset' : 'data-srcset'}="${escapeHtml(shopifyImgSrcset(img.url))}" sizes="(min-width:1360px) 230px, (min-width:1000px) 23vw, (min-width:700px) 31vw, 47vw" alt="${escapeHtml(img.altText)}" loading="lazy" decoding="async" width="400" height="400" data-placeholder-fallback="${escapeHtml(placeholderSrc)}">
                 </div>`).join('')}
               </div>
               ${multi ? `
               <span class="catalog-card-nav catalog-card-nav-prev" data-gallery-dir="-1" aria-hidden="true">&#8249;</span>
               <span class="catalog-card-nav catalog-card-nav-next" data-gallery-dir="1" aria-hidden="true">&#8250;</span>
               <span class="catalog-card-dots" aria-hidden="true">${gallery.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</span>` : ''}`
            : `<div class="catalog-card-image-empty" aria-hidden="true">
                 <img class="catalog-card-placeholder-img" src="${escapeHtml(placeholderSrc)}" alt="" loading="lazy" width="400" height="400">
               </div>`}
        </div>
        <div class="catalog-card-body">
          <h2 class="catalog-card-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</h2>
          ${p.isQuoteOnly
            ? '<div class="catalog-card-price catalog-card-price-quote">Custom quote</div>'
            : (priceLabel ? `<div class="catalog-card-price">${priceLabel}${p.soldOut ? ' <span class="catalog-card-soldout">Sold out</span>' : ''}</div>` : (p.soldOut ? '<div class="catalog-card-price"><span class="catalog-card-soldout">Sold out</span></div>' : ''))}
        </div>
      </a>`;
  }

  // Fase B: activates a filter exactly as the real filter button click
  // would (same state mutation, same re-render) — this is the single
  // shared path used by the filter row AND every alternate trigger
  // (hero CTA, category cards, editorial CTA), never a duplicate filter.
  function activateFilter(label) {
    catalogState.activeFilter = label;
    syncFilterUrlParam(label);
    renderCatalog();
    document.getElementById('catalogGridAnchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Task 6: fallback chain for real (Shopify-hosted) images on catalog and
  // category cards — Shopify image → local category placeholder, never a
  // broken-image icon. Guarded with { once: true } plus clearing the
  // data attribute after firing, so if the placeholder SVG itself ever
  // 404s (e.g. missing from disk), the handler doesn't loop retrying the
  // same broken src.
  function bindImageFallbacks() {
    root.querySelectorAll('img[data-placeholder-fallback]').forEach((img) => {
      img.addEventListener(
        'error',
        () => {
          const fallback = img.dataset.placeholderFallback;
          if (fallback && img.src !== fallback) {
            img.src = fallback;
          }
          delete img.dataset.placeholderFallback;
        },
        { once: true }
      );
    });
  }

  // Swipeable card galleries. Touch swipe is native (CSS scroll-snap); this
  // only keeps the dots / edge arrows in sync and powers the desktop arrow
  // buttons. Arrow clicks are swallowed so they never open the product page.
  function bindCatalogGalleries() {
    // Only the first photo of each card loads up front. The other photos
    // are fetched the first time the shopper touches, hovers, focuses or
    // scrolls that card's gallery (or taps an arrow).
    const hydrate = (gallery) => {
      if (gallery.dataset.hydrated) return;
      gallery.dataset.hydrated = '1';
      gallery.querySelectorAll('img[data-src]').forEach((img) => {
        img.loading = 'eager';
        if (img.dataset.srcset) img.srcset = img.dataset.srcset;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        img.removeAttribute('data-srcset');
      });
    };
    root.querySelectorAll('.catalog-card-gallery[data-gallery]').forEach((gallery) => {
      const wrap = gallery.closest('.catalog-card-image');
      ['touchstart', 'pointerenter', 'focusin', 'scroll'].forEach((ev) => {
        wrap.addEventListener(ev, () => hydrate(gallery), { passive: true, once: true });
      });
      const dots = wrap.querySelectorAll('.catalog-card-dots i');
      const sync = () => {
        const w = gallery.clientWidth || 1;
        const idx = Math.max(0, Math.min(dots.length - 1, Math.round(gallery.scrollLeft / w)));
        dots.forEach((d, i) => d.classList.toggle('on', i === idx));
        wrap.classList.toggle('at-start', idx === 0);
        wrap.classList.toggle('at-end', idx === dots.length - 1);
      };
      gallery.addEventListener('scroll', sync, { passive: true });
      sync();
    });

    root.querySelectorAll('.catalog-card-nav').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const gallery = btn.closest('.catalog-card-image').querySelector('.catalog-card-gallery');
        if (!gallery) return;
        hydrate(gallery);
        gallery.scrollBy({ left: Number(btn.dataset.galleryDir) * gallery.clientWidth, behavior: 'smooth' });
      });
    });
  }

  // Desktop arrows for the swipeable shelves (touch swipe is native).
  function bindShelves() {
    root.querySelectorAll('.shelf-section').forEach((sec) => {
      const shelf = sec.querySelector('[data-shelf]');
      const arrows = sec.querySelectorAll('.shelf-arrow');
      const sync = () => {
        const max = shelf.scrollWidth - shelf.clientWidth - 2;
        arrows[0].disabled = shelf.scrollLeft <= 2;
        arrows[1].disabled = shelf.scrollLeft >= max;
        sec.classList.toggle('shelf-fits', max <= 0);
      };
      arrows.forEach((a) => a.addEventListener('click', () => {
        shelf.scrollBy({ left: Number(a.dataset.shelfDir) * shelf.clientWidth * 0.85, behavior: 'smooth' });
      }));
      shelf.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync, { passive: true });
      sync();
    });
  }

  function bindCatalogEvents() {
    bindImageFallbacks();
    bindCatalogGalleries();
    bindShelves();
    root.querySelectorAll('.catalog-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        catalogState.activeFilter = btn.dataset.filter;
        syncFilterUrlParam(btn.dataset.filter);
        renderCatalog();
      });
    });

    // Hero primary CTA: scroll to Best Sellers (Customer Favorites) section,
    // no filter change — per spec's "Shop Best Sellers" button.
    document.getElementById('heroShopCta')?.addEventListener('click', () => {
      (document.getElementById('bestSellers') || document.getElementById('catalogGridAnchor'))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // All other alternate triggers (hero secondary CTA, category cards,
    // editorial band CTA, business block CTA, footer links) share one
    // handler: activate the matching filter button's own filter, then
    // scroll to the grid. Never a duplicate filter implementation.
    root.querySelectorAll('[data-filter-trigger]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (el.tagName === 'A') e.preventDefault();
        activateFilter(el.dataset.filterTrigger);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activateFilter(el.dataset.filterTrigger);
        }
      });
    });

    document.getElementById('catalogClearBtn')?.addEventListener('click', () => activateFilter('All'));

    document.getElementById('catalogSort')?.addEventListener('change', (e) => {
      catalogState.sort = e.target.value;
      renderCatalog();
    });

    // Newsletter: no real email integration exists yet (no Shopify Email/
    // Klaviyo connected). No form, no email input, no fake confirmation —
    // this section only links out to Instagram until a real integration
    // is connected.
  }

  // ── Scroll-reveal (IntersectionObserver, no library) ────
  function initScrollReveal() {
    const els = root.querySelectorAll('.mhw-reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('mhw-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('mhw-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
  }

  function initDefaultSelection() {
    const p = state.product;
    p.options.forEach((opt) => {
      state.selectedOptions[opt.name] = opt.optionValues[0]?.name;
    });
    state.selectedVariant = findMatchingVariant();
  }

  function findMatchingVariant() {
    const p = state.product;
    return (
      p.variants.find((v) =>
        v.selectedOptions.every((so) => state.selectedOptions[so.name] === so.value)
      ) || null
    );
  }

  // ── Render: states ───────────────────────────────────────

  function renderLoading() {
    root.innerHTML = `
      <div class="product-grid" aria-busy="true">
        <div class="product-gallery-skeleton" role="status" aria-label="Loading product images"></div>
        <div class="shop-state" style="padding:40px 0;">
          <div class="spinner" aria-hidden="true"></div>
          <h2>Loading product…</h2>
        </div>
      </div>`;
  }

  function renderError(err) {
    let title = 'Something went wrong';
    let msg = 'We could not load this product right now. Please try again in a moment.';

    if (err && err.kind === 'not_found') {
      title = 'Product not found';
      msg = "This item isn't available right now. Please check back soon or contact us for help.";
    } else if (err && err.kind === 'network') {
      title = 'Connection problem';
      msg = "We couldn't reach the store. Check your internet connection and try again.";
    }
    // For 'http' and 'graphql' kinds we intentionally show only the generic
    // message above — the underlying err.message can contain internal API
    // or schema details that shouldn't be shown to shoppers.

    const showShopAllLink = err && err.kind === 'not_found';

    root.innerHTML = `
      <div class="shop-state error">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(msg)}</p>
        <div class="shop-state-actions">
          <button class="retry-btn" id="retryBtn">Try again</button>
          ${showShopAllLink ? '<a class="retry-btn retry-btn-outline" href="/shop/">Shop All</a>' : ''}
        </div>
      </div>`;
    document.getElementById('retryBtn').addEventListener('click', init);
  }

  // ── Render: product gallery ──────────────────────────────
  // Universal, data-driven product gallery. Works for any product handle —
  // nothing here is specific to any one product, color set, or image count.
  // Desktop: thumbnail rail beside a single "main image" box.
  // Mobile: horizontally swipeable slide track with dot indicators.
  // Both views share the same `images` array and `state.activeImageIndex`.

  function dedupeMatch(imgA, imgB) {
    if (!imgA || !imgB) return false;
    if (imgA.id && imgB.id) return imgA.id === imgB.id;
    const urlA = (imgA.url || '').split('?')[0];
    const urlB = (imgB.url || '').split('?')[0];
    return !!urlA && urlA === urlB;
  }

  function galleryAlt(img, productTitle) {
    if (img && img.altText && img.altText.trim()) return img.altText.trim();
    return productTitle;
  }

  function renderGallery(p, images, activeImg, featuredUrl) {
    if (!images.length || !images[0].url) {
      const category = ShopifyClient.placeholderCategoryFor(p);
      return `
        <div class="product-gallery">
          <div class="product-gallery-main product-gallery-empty" aria-hidden="true">
            <img class="catalog-card-placeholder-img" src="/shop/assets/placeholders/placeholder-${escapeHtml(category)}.svg" alt="" loading="eager" width="800" height="800">
          </div>
        </div>`;
    }

    const multi = images.length > 1;

    return `
      <div class="product-gallery">
        <div class="product-gallery-main">
          <img src="${escapeHtml(shopifyImgUrl(activeImg.url, 900))}" srcset="${escapeHtml(shopifyImgSrcset(activeImg.url, [480, 640, 900, 1200, 1600]))}" sizes="(min-width:1000px) 560px, 100vw" alt="${escapeHtml(galleryAlt(activeImg, p.title))}"
            loading="eager" fetchpriority="high" decoding="async"
            data-fallback-src="${escapeHtml(featuredUrl)}">
        </div>

        ${multi ? `
        <div class="product-gallery-track-wrap">
          <div class="product-gallery-track" id="galleryTrack">
            ${images
              .map(
                (img, i) => `
              <div class="product-gallery-slide" data-slide-index="${i}">
                <img src="${escapeHtml(shopifyImgUrl(img.url, 800))}" srcset="${escapeHtml(shopifyImgSrcset(img.url, [480, 640, 800, 1000]))}" sizes="100vw" alt="${escapeHtml(galleryAlt(img, p.title))}"
                  loading="${i === 0 ? 'eager' : 'lazy'}" data-fallback-src="${escapeHtml(featuredUrl)}">
              </div>`
              )
              .join('')}
          </div>
          <div class="product-gallery-dots" role="tablist" aria-label="Product images">
            ${images
              .map(
                (_, i) => `
              <button type="button" class="gallery-dot ${i === state.activeImageIndex ? 'active' : ''}"
                data-dot-index="${i}" role="tab" aria-selected="${i === state.activeImageIndex}"
                aria-label="Image ${i + 1} of ${images.length}"></button>`
              )
              .join('')}
          </div>
        </div>

        <div class="product-gallery-thumbs" role="tablist" aria-label="Product images">
          ${images
            .map(
              (img, i) => `
            <button type="button" class="${i === state.activeImageIndex ? 'active' : ''}"
              data-thumb-index="${i}" role="tab" aria-selected="${i === state.activeImageIndex}"
              aria-label="View image ${i + 1} of ${images.length}">
              <img src="${escapeHtml(shopifyImgUrl(img.url, 200))}" alt="" loading="lazy" width="100" height="100" data-fallback-src="${escapeHtml(featuredUrl)}">
            </button>`
            )
            .join('')}
        </div>` : ''}
      </div>`;
  }

  // ── Render: product ──────────────────────────────────────

  function renderProduct() {
    const p = state.product;
    const v = state.selectedVariant;
    const images = p.images.length ? p.images : (p.featuredImage ? [p.featuredImage] : [{ url: '', altText: p.title }]);

    // The gallery always opens on the product's featuredImage (index 0 —
    // buildGallery() in shopify-client.js guarantees that ordering). We only
    // ever jump to a variant's own photo when the shopper has intentionally
    // picked that variant (userPickedVariant), and only if they haven't since
    // manually browsed to a different thumbnail/slide (userPickedImage).
    if (state.userPickedVariant && !state.userPickedImage && v && v.image) {
      const idx = images.findIndex((img) => dedupeMatch(img, v.image));
      if (idx >= 0) state.activeImageIndex = idx;
    }
    if (state.activeImageIndex >= images.length) state.activeImageIndex = 0;
    const activeImg = images[state.activeImageIndex] || images[0];
    const featuredUrl = (p.featuredImage && p.featuredImage.url) || (images[0] && images[0].url) || '';

    const inStock = v ? v.availableForSale : false;
    const priceAmount = v ? v.price.amount : p.variants[0]?.price.amount;
    const currency = v ? v.price.currencyCode : p.variants[0]?.price.currencyCode;
    const compareAt = v && v.compareAtPrice ? v.compareAtPrice.amount : null;

    root.innerHTML = `
      <div class="product-grid">
        ${renderGallery(p, images, activeImg, featuredUrl)}

        <div class="product-info">
          <span class="tag">Personalized &amp; Engraved</span>
          <h1>${escapeHtml(p.title)}</h1>
          ${state.isQuoteOnly
            ? '<div class="product-price product-price-quote">Custom Quote Required</div>'
            : `<div class="product-price">
            ${formatMoney(priceAmount, currency)}
            ${compareAt ? `<span class="compare-at">${formatMoney(compareAt, currency)}</span>` : ''}
          </div>`}

          ${state.isQuoteOnly ? '' : `<div class="avail-badge ${inStock ? 'in-stock' : 'out-stock'}">
            <span class="dot"></span>${inStock ? 'In stock' : 'Currently unavailable'}
          </div>`}

          <div class="product-desc">${p.descriptionHtml || ''}</div>

          <form id="productForm" novalidate>
            <div class="process-step-label"><span class="process-step-num">1</span>Choose your options</div>
            ${renderOptionGroups()}

            ${state.isQuoteOnly ? '' : `<div class="process-step-label"><span class="process-step-num">2</span>Add personalization</div>${renderCustomizationFields()}`}

            <div class="process-step-label"><span class="process-step-num">${state.isQuoteOnly ? '2' : '3'}</span>${state.isQuoteOnly ? 'Request a Custom Quote' : 'Add to cart'}</div>
            <div class="opt-group">
              ${state.isQuoteOnly ? '' : `
              <span class="opt-label">Quantity</span>
              <div class="qty-add-row">
                <div class="qty-stepper">
                  <button type="button" id="qtyMinus" aria-label="Decrease quantity">−</button>
                  <input type="text" id="qtyInput" inputmode="numeric" value="${state.quantity}" aria-label="Quantity">
                  <button type="button" id="qtyPlus" aria-label="Increase quantity">+</button>
                </div>
                <button type="submit" class="btn-add-cart" id="addCartBtn" ${!inStock || state.uploadStatus === 'uploading' ? 'disabled' : ''}>
                  ${inStock ? (state.uploadStatus === 'uploading' ? 'Uploading file…' : 'Add to Cart') : 'Sold Out'}
                </button>
              </div>`}
              ${state.isQuoteOnly ? renderQuoteOnlyCta() : ''}
              <div class="form-error" id="formError" role="alert" aria-live="polite"></div>
            </div>
          </form>

          ${renderTrustStrip()}
          ${renderMetaNote()}
          ${renderPdpAccordions()}
        </div>
      </div>
      ${renderStickyBar(inStock)}
    `;

    bindProductEvents();
  }

  // Accordion sections built ONLY from real, already-fetched data — a
  // section is omitted entirely when its backing field/metafield is empty,
  // never filled with invented copy. Purely a visual regrouping of existing
  // content; no new fields, no changed logic.
  function renderPdpAccordions() {
    const p = state.product;
    const mf = p.metafields;
    const sections = [];

    if (p.descriptionHtml) {
      sections.push({ title: 'Product Details', bodyHtml: p.descriptionHtml });
    }
    const personalizationParts = [];
    if (mf.allowCustomText) personalizationParts.push('Custom engraving text can be entered on this product page before adding the item to your cart.');
    if (mf.allowFileUpload) personalizationParts.push('Upload your own logo or artwork (PNG or JPG, up to 20MB).');
    if (mf.allowProofRequest) personalizationParts.push('Request a free digital proof before production begins.');
    if (mf.personalizationInstructions) personalizationParts.push(mf.personalizationInstructions);
    if (personalizationParts.length) {
      sections.push({ title: 'Personalization', bodyHtml: personalizationParts.map((t) => `<p>${escapeHtml(t)}</p>`).join('') });
    }
    if (mf.productionTime || mf.bulkMinimum) {
      const parts = [];
      if (mf.productionTime) parts.push(`<p>Production time (before shipping): ${escapeHtml(mf.productionTime)}</p>`);
      if (mf.bulkMinimum) parts.push(`<p>Bulk pricing available from ${escapeHtml(String(mf.bulkMinimum))}+ units. Contact us for a quote.</p>`);
      sections.push({ title: 'Production Time', bodyHtml: parts.join('') });
    }
    // Shipping & Pickup — the trust strip already states these facts
    // (Crafted in Virginia / Local Pickup Available / Secure Checkout); this
    // section only regroups that same real copy, nothing invented.
    sections.push({
      title: 'Shipping & Pickup',
      bodyHtml: '<p>Crafted to order in Virginia. Local pickup is available, or we ship nationwide via a secure Shopify checkout.</p>',
    });
    // No care_instructions field exists in the product data (confirmed
    // against the metafield inventory) — a Care Instructions section is
    // intentionally NOT built here, since it would have no real content.

    if (!sections.length) return '';

    return `
      <div class="pdp-accordion" id="pdpAccordion">
        ${sections.map((s, i) => `
          <div class="pdp-accordion-item ${i === 0 ? 'open' : ''}" data-accordion-index="${i}">
            <button type="button" class="pdp-accordion-trigger" aria-expanded="${i === 0}" aria-controls="pdpPanel${i}">
              ${escapeHtml(s.title)}<span class="chev" aria-hidden="true">&#9662;</span>
            </button>
            <div class="pdp-accordion-panel" id="pdpPanel${i}">
              <div class="pdp-accordion-panel-inner">${s.bodyHtml}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function bindPdpAccordionEvents() {
    root.querySelectorAll('.pdp-accordion-trigger').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.pdp-accordion-item');
        const open = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
      });
    });
  }

  // Sticky mobile Add-to-Cart / Quote bar — mirrors the existing form
  // control exactly (same submit path / same quote-only CTA), never a
  // second cart-mutation code path. Hidden entirely on desktop via CSS.
  function renderStickyBar(inStock) {
    if (state.isQuoteOnly) {
      return `<div class="pdp-sticky-bar active" id="pdpStickyBar">${renderQuoteOnlyCta('Sticky')}</div>`;
    }
    return `
      <div class="pdp-sticky-bar active" id="pdpStickyBar">
        <button type="button" class="btn-add-cart" id="stickyAddCartBtn" ${!inStock || state.uploadStatus === 'uploading' ? 'disabled' : ''}>
          ${inStock ? (state.uploadStatus === 'uploading' ? 'Uploading file…' : 'Add to Cart') : 'Sold Out'}
        </button>
      </div>`;
  }

  function bindStickyBarEvents() {
    // The sticky button triggers the SAME form submit handler as the real
    // Add to Cart button — no duplicate add-to-cart logic.
    document.getElementById('stickyAddCartBtn')?.addEventListener('click', () => {
      document.getElementById('productForm')?.requestSubmit
        ? document.getElementById('productForm').requestSubmit()
        : document.getElementById('addCartBtn')?.click();
    });
  }

  function renderOptionGroups() {
    const p = state.product;
    return p.options
      .map((opt) => {
        const swatches = opt.optionValues
          .map((ov) => {
            const wouldSelect = { ...state.selectedOptions, [opt.name]: ov.name };
            const matches = p.variants.find((v) =>
              v.selectedOptions.every((so) => wouldSelect[so.name] === so.value)
            );
            const disabled = matches ? !matches.availableForSale : true;
            const selected = state.selectedOptions[opt.name] === ov.name;
            return `
              <button type="button" class="opt-swatch ${selected ? 'selected' : ''}"
                data-option-name="${escapeHtml(opt.name)}" data-option-value="${escapeHtml(ov.name)}"
                ${disabled ? 'disabled' : ''} aria-pressed="${selected}">
                ${escapeHtml(ov.name)}
              </button>`;
          })
          .join('');
        return `
          <div class="opt-group">
            <span class="opt-label">${escapeHtml(opt.name)}</span>
            <div class="opt-swatches">${swatches}</div>
          </div>`;
      })
      .join('');
  }

  // Generic rule, not tied to any specific product: any product carrying the
  // "quote-only" tag renders this link instead of an Add to Cart button, and
  // the product is never added to the Shopify cart through any code path —
  // there is no cart-mutation handler wired to this element at all, unlike
  // the real #productForm submit which calls handleAddToCart().
  function renderQuoteOnlyCta(idSuffix) {
    const p = state.product;
    const productCode = p.metafields.productCode || '';
    const productUrl = window.location.href.split('?')[0] + (p.handle ? `?handle=${encodeURIComponent(p.handle)}` : '');
    const params = new URLSearchParams({
      product: p.title || '',
      code: productCode,
      url: productUrl,
    });
    const quoteHref = `/?${params.toString()}#contact`;
    const id = idSuffix ? `quoteOnlyBtn${idSuffix}` : 'quoteOnlyBtn';
    return `
      <a href="${escapeHtml(quoteHref)}" class="btn-add-cart quote-only-cta" id="${id}">
        Request a Custom Quote
      </a>
      ${idSuffix ? '' : '<p class="hint quote-only-hint">This is a fully custom, made-to-order item. Shipping and final pricing are confirmed after your project is defined, so it can\'t be added to the cart directly.</p>'}`;
  }

  // Character limit for the custom text field. A product states its own
  // limit in its personalization instructions (e.g. "Max 40 characters");
  // without one, the original default of 60 applies.
  function customTextMaxLength() {
    const txt = (state.product && state.product.metafields && state.product.metafields.personalizationInstructions) || '';
    const m = String(txt).match(/(\d{1,3})\s*(?:characters?|chars?)\b/i);
    const n = m ? Number(m[1]) : 0;
    return n >= 5 && n <= 500 ? n : 60;
  }

  function renderCustomizationFields() {
    const mf = state.product.metafields;
    let html = '';

    if (mf.allowCustomText) {
      html += `
        <div class="custom-field">
          <label for="customText">Custom text (optional)</label>
          <textarea id="customText" maxlength="${customTextMaxLength()}" placeholder="e.g. Coach Martinez, Est. 2019"
            aria-required="false">${escapeHtml(state.customText)}</textarea>
          <div class="char-count"><span id="charCount">${state.customText.length}</span>/${customTextMaxLength()}</div>
          ${mf.personalizationInstructions ? `<p class="hint">${escapeHtml(mf.personalizationInstructions)}</p>` : ''}
        </div>`;
    }

    if (mf.allowFileUpload) {
      html += `
        <div class="custom-field">
          <label for="artworkFile">Logo or Artwork</label>
          <input type="file" id="artworkFile" accept="image/png,image/jpeg" class="file-input">
          <p class="hint">PNG or JPG, up to 20MB. Prefer a smaller file if you can, since it uploads faster.</p>
          <div id="uploadStatusArea">${renderUploadStatus()}</div>
        </div>`;
    }

    if (mf.allowProofRequest) {
      html += `
        <div class="custom-field">
          <label class="checkbox-row" for="requestProof">
            <input type="checkbox" id="requestProof" ${state.requestProof ? 'checked' : ''}>
            <span class="cb-text">Send me a digital proof before production begins</span>
          </label>
        </div>`;
    }

    return html;
  }

  function renderUploadStatus() {
    if (state.uploadStatus === 'uploading') {
      return `<p class="upload-status uploading" role="status">Uploading ${escapeHtml(state.uploadedFileName || 'file')}…</p>`;
    }
    if (state.uploadStatus === 'done') {
      return `
        <p class="upload-status done" role="status">
          ✓ ${escapeHtml(state.uploadedFileName)} uploaded.
          <button type="button" id="removeUploadBtn" class="upload-replace-btn">Remove / replace</button>
        </p>`;
    }
    if (state.uploadStatus === 'error') {
      return `<p class="upload-status error" role="alert">${escapeHtml(state.uploadError)}</p>`;
    }
    return '';
  }

  // Static trust strip — text only, no timelines/guarantees beyond what the
  // real metafields already state elsewhere on the page (renderMetaNote).
  function renderTrustStrip() {
    const items = ['Made to Order', 'Digital Proof Available', 'Crafted in Virginia', 'Secure Checkout', 'Local Pickup Available'];
    return `<div class="trust-strip">${items.map((t) => `<span class="trust-strip-item">${escapeHtml(t)}</span>`).join('')}</div>`;
  }

  function renderMetaNote() {
    const mf = state.product.metafields;
    const parts = [];
    // Explicitly labeled as production time only — never implied to include
    // shipping/transit time, which isn't configured for this pilot yet.
    if (mf.productionTime) parts.push(`Production time (before shipping): ${mf.productionTime}`);
    if (mf.bulkMinimum) parts.push(`Bulk pricing available from ${mf.bulkMinimum}+ units. Contact us for a quote`);
    if (!parts.length) return '';
    return `<div class="meta-note">${parts.map(escapeHtml).join(' · ')}</div>`;
  }

  function bindGalleryEvents() {
    // Broken image → fall back to the product's featuredImage rather than
    // leaving an empty gap or a broken-image icon. Guarded so a failing
    // fallback itself can't loop.
    root.querySelectorAll('.product-gallery img[data-fallback-src]').forEach((img) => {
      img.addEventListener(
        'error',
        () => {
          const fallback = img.dataset.fallbackSrc;
          if (fallback && img.src !== fallback) {
            img.src = fallback;
          }
          img.removeAttribute('data-fallback-src');
        },
        { once: true }
      );
    });

    function goToImage(index) {
      state.activeImageIndex = index;
      state.userPickedImage = true;
      renderProduct();
    }

    // Desktop thumbnail rail
    root.querySelectorAll('[data-thumb-index]').forEach((btn) => {
      btn.addEventListener('click', () => goToImage(Number(btn.dataset.thumbIndex)));
    });

    // Mobile dot indicators
    root.querySelectorAll('[data-dot-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const track = document.getElementById('galleryTrack');
        const index = Number(btn.dataset.dotIndex);
        const slide = track?.querySelector(`[data-slide-index="${index}"]`);
        if (track && slide) {
          // Let the swipeable track do the scrolling itself (smooth) — the
          // scroll listener below will sync state + dots once it settles.
          track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
        }
        goToImage(index);
      });
    });

    // Swipeable mobile track: keep the active dot/state in sync as the
    // shopper swipes by hand, and jump instantly to the current
    // activeImageIndex on every re-render (re-renders happen rarely here —
    // only on variant/thumb/dot change or upload-status updates — so this
    // never fights an in-progress swipe).
    const track = document.getElementById('galleryTrack');
    if (track) {
      track.scrollLeft = track.clientWidth * state.activeImageIndex;

      let scrollTimer = null;
      track.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const width = track.clientWidth || 1;
          const index = Math.round(track.scrollLeft / width);
          if (index !== state.activeImageIndex && index >= 0) {
            state.activeImageIndex = index;
            state.userPickedImage = true;
            // Lightweight sync: update dot/thumb active classes without a
            // full renderProduct() (which would reset scrollLeft mid-swipe).
            root.querySelectorAll('[data-dot-index]').forEach((d) => {
              const active = Number(d.dataset.dotIndex) === index;
              d.classList.toggle('active', active);
              d.setAttribute('aria-selected', String(active));
            });
            root.querySelectorAll('[data-thumb-index]').forEach((t) => {
              const active = Number(t.dataset.thumbIndex) === index;
              t.classList.toggle('active', active);
              t.setAttribute('aria-selected', String(active));
            });
            const mainImg = root.querySelector('.product-gallery-main img');
            const images = state.product.images;
            if (mainImg && images[index]) {
              mainImg.removeAttribute('srcset');
              mainImg.src = shopifyImgUrl(images[index].url, 1200);
            }
          }
        }, 120);
      });
    }
  }

  function bindProductEvents() {
    bindGalleryEvents();
    bindPdpAccordionEvents();
    bindStickyBarEvents();

    // Option swatches — switching color/size must NOT clear what the shopper
    // already entered (engraving text, proof checkbox, quantity).
    root.querySelectorAll('.opt-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        state.selectedOptions[btn.dataset.optionName] = btn.dataset.optionValue;
        state.selectedVariant = findMatchingVariant();
        // An intentional variant pick is the ONLY thing allowed to swap the
        // main photo away from featuredImage — and only if the shopper
        // hasn't since browsed to a different thumbnail/slide themselves.
        state.userPickedVariant = true;
        state.userPickedImage = false;
        renderProduct();
        const newBtn = root.querySelector(
          `.opt-swatch[data-option-name="${cssEscape(btn.dataset.optionName)}"][data-option-value="${cssEscape(btn.dataset.optionValue)}"]`
        );
        newBtn?.focus();
      });
    });

    // Quantity stepper
    const qtyInput = document.getElementById('qtyInput');
    document.getElementById('qtyMinus')?.addEventListener('click', () => {
      state.quantity = Math.max(1, state.quantity - 1);
      qtyInput.value = state.quantity;
    });
    document.getElementById('qtyPlus')?.addEventListener('click', () => {
      state.quantity += 1;
      qtyInput.value = state.quantity;
    });
    qtyInput?.addEventListener('change', () => {
      const n = parseInt(qtyInput.value, 10);
      state.quantity = Number.isFinite(n) && n > 0 ? n : 1;
      qtyInput.value = state.quantity;
    });

    // Custom text
    const customTextEl = document.getElementById('customText');
    customTextEl?.addEventListener('input', () => {
      state.customText = customTextEl.value;
      document.getElementById('charCount').textContent = state.customText.length;
    });

    // Proof checkbox
    document.getElementById('requestProof')?.addEventListener('change', (e) => {
      state.requestProof = e.target.checked;
    });

    // Artwork file upload
    document.getElementById('artworkFile')?.addEventListener('change', handleFileSelected);
    document.getElementById('removeUploadBtn')?.addEventListener('click', () => {
      state.uploadedFileKey = null;
      state.uploadedArtworkUrl = null;
      state.uploadedFileName = null;
      state.uploadStatus = 'idle';
      state.uploadError = '';
      renderProduct();
    });

    // Submit
    document.getElementById('productForm')?.addEventListener('submit', handleAddToCart);
  }

  // ── Artwork upload ───────────────────────────────────────

  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
  const ALLOWED_UPLOAD_TYPES = new Set(['image/png', 'image/jpeg']);

  async function handleFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Quick client-side check first — saves the round trip for an obvious
    // mistake. The server (upload-artwork Function) re-validates for real,
    // since client-side checks can always be bypassed.
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
      state.uploadStatus = 'error';
      state.uploadError = 'Please choose a PNG or JPG image.';
      renderProduct();
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      state.uploadStatus = 'error';
      state.uploadError = 'That file is larger than 20MB. Please choose a smaller image.';
      renderProduct();
      return;
    }

    state.uploadStatus = 'uploading';
    state.uploadedFileName = file.name;
    state.uploadError = '';
    renderProduct(); // shows the "Uploading…" state and disables Add to Cart below

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-artwork', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed.');
      }

      state.uploadedFileKey = data.fileKey;
      state.uploadedArtworkUrl = data.artworkUrl || null;
      state.uploadStatus = 'done';
    } catch (err) {
      state.uploadStatus = 'error';
      state.uploadError = err.message || 'Could not upload this file. Please try again.';
      state.uploadedFileKey = null;
      state.uploadedArtworkUrl = null;
    }
    renderProduct();
  }

  // ── Add to cart ──────────────────────────────────────────

  async function handleAddToCart(e) {
    e.preventDefault();

    // Guard against double-click / double-submit creating duplicate lines or
    // duplicate carts while a previous request is still in flight.
    if (state.addToCartInFlight) return;

    // Defense in depth: even if this handler were ever invoked for a
    // quote-only product (it shouldn't be — that product's form has no
    // add-to-cart submit control, see renderQuoteOnlyCta), never let it
    // reach the Shopify cart.
    if (state.isQuoteOnly) return;

    const errorEl = document.getElementById('formError');
    const btn = document.getElementById('addCartBtn');
    errorEl.textContent = '';

    if (state.uploadStatus === 'uploading') {
      errorEl.textContent = 'Please wait for your file to finish uploading before adding this to your cart.';
      return;
    }

    if (!state.selectedVariant) {
      errorEl.textContent = 'Please select a valid combination of options.';
      return;
    }
    if (!state.selectedVariant.availableForSale) {
      errorEl.textContent = 'This variant is currently out of stock.';
      return;
    }

    // Personalization is optional: the shopper may add this item to the
    // cart with or without engraving text or an uploaded artwork file.
    const attributes = buildLineAttributes();
    const line = {
      merchandiseId: state.selectedVariant.id,
      quantity: state.quantity,
      attributes,
    };

    state.addToCartInFlight = true;
    state.cartBusy = true;
    btn.classList.add('loading');
    btn.disabled = true;
    updateCheckoutAvailability();

    try {
      if (state.cart && state.cart.id) {
        state.cart = await addLineWithRecovery(line);
      } else {
        state.cart = await ShopifyClient.createCart(line);
        persistCartId(state.cart.id);
      }
      reportCartWarnings(state.cart);
      trackProduct('add_to_cart', state.product, state.selectedVariant, state.quantity);
      renderCartDrawer();
      openCartDrawer();
      // Reset personalization inputs so a second, different order for the
      // same product doesn't accidentally reuse this file/text.
      state.customText = '';
      state.requestProof = false;
      state.uploadedFileKey = null;
      state.uploadedArtworkUrl = null;
      state.uploadedFileName = null;
      state.uploadStatus = 'idle';
      renderProduct();
    } catch (err) {
      errorEl.textContent = friendlyCartErrorMessage(err);
    } finally {
      state.addToCartInFlight = false;
      state.cartBusy = false;
      btn.classList.remove('loading');
      btn.disabled = !state.selectedVariant.availableForSale;
      updateCheckoutAvailability();
    }
  }

  // If the stored cart ID has expired or no longer exists, transparently
  // start a fresh cart with this line instead of surfacing a dead-end error.
  async function addLineWithRecovery(line) {
    try {
      return await ShopifyClient.addLineToCart(state.cart.id, line);
    } catch (err) {
      if (err && (err.kind === 'not_found' || /cart/i.test(err.message || ''))) {
        const fresh = await ShopifyClient.createCart(line);
        persistCartId(fresh.id);
        return fresh;
      }
      throw err;
    }
  }

  function buildLineAttributes() {
    const attrs = [];
    const mf = state.product.metafields;
    if (mf.allowCustomText && state.customText.trim()) {
      attrs.push({ key: 'Engraving Text', value: state.customText.trim() });
    }
    if (mf.allowProofRequest) {
      attrs.push({ key: 'Digital Proof Requested', value: state.requestProof ? 'Yes' : 'No' });
    }
    if (mf.allowFileUpload && state.uploadedFileKey) {
      // Prefer the full protected link (clickable straight from the Shopify
      // order) — falls back to the raw reference key if the site owner
      // hasn't set ARTWORK_ACCESS_SECRET in Netlify yet (see
      // FILE_UPLOAD_PLAN.md and .env.example).
      attrs.push({
        key: 'Artwork File',
        value: state.uploadedArtworkUrl || `Reference: ${state.uploadedFileKey} (set ARTWORK_ACCESS_SECRET to get a clickable link)`,
      });
    }
    // Note: Shopify's cart automatically keeps lines with the same
    // merchandiseId but DIFFERENT attributes as separate lines — this is
    // native Storefront API behavior, nothing extra is needed here. Two Navy
    // tumblers with different engraving text (or different artwork files)
    // will show as two distinct cart lines. Only identical merchandiseId +
    // attributes combinations merge into one line with a summed quantity.
    return attrs;
  }

  function reportCartWarnings(cart) {
    // Surface any Shopify-side adjustments (e.g. quantity reduced due to
    // stock) so the shopper isn't silently given less than they asked for.
    if (cart && cart.warnings && cart.warnings.length) {
      showCartError(cart.warnings.map((w) => w.message).join(' '));
    } else {
      showCartError('');
    }
  }

  function friendlyCartErrorMessage(err) {
    if (!err) return 'Something went wrong updating your cart. Please try again.';
    if (err.kind === 'network') return "We couldn't reach the store. Check your connection and try again.";
    if (err.kind === 'graphql' && /sold out|insufficient|not available/i.test(err.message || '')) {
      return "We don't have enough of this item in stock for the quantity requested.";
    }
    return 'Something went wrong updating your cart. Please try again.';
  }

  // ── Cart persistence & drawer ────────────────────────────

  function persistCartId(id) {
    try {
      localStorage.setItem(CART_STORAGE_KEY, id);
    } catch (_) {
      /* localStorage unavailable — cart just won't survive a reload */
    }
  }

  async function restoreCart() {
    let cartId;
    try {
      cartId = localStorage.getItem(CART_STORAGE_KEY);
    } catch (_) {
      cartId = null;
    }
    if (!cartId) return;

    try {
      const cart = await ShopifyClient.getCart(cartId);
      if (cart) {
        state.cart = cart;
        renderCartDrawer();
      } else {
        // Cart ID exists locally but Shopify no longer has it (expired, or
        // already completed at checkout long ago). Drop the stale reference.
        clearStoredCartId();
      }
    } catch (_) {
      // Transient network/API error while restoring — don't discard the
      // cart ID on this alone, only on a confirmed "not found" (handled
      // above). The next successful cart action will re-sync.
    }
  }

  function clearStoredCartId() {
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch (_) {}
    state.cart = null;
  }

  function renderCartDrawer() {
    const cart = state.cart;
    const qty = cart ? cart.totalQuantity : 0;
    const changed = cartCountEl.textContent !== String(qty);
    cartCountEl.textContent = qty;
    cartCountEl.style.display = qty > 0 ? 'flex' : 'none';
    // Light visual confirmation on the cart counter when it actually
    // changes; respects prefers-reduced-motion via the CSS media query.
    if (changed && qty > 0) {
      cartCountEl.classList.remove('mhw-bump');
      // Force reflow so the animation restarts on consecutive quick adds.
      void cartCountEl.offsetWidth;
      cartCountEl.classList.add('mhw-bump');
    }

    if (!cart || !cart.lines.nodes.length) {
      cartBodyEl.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
      cartSubtotalEl.textContent = formatMoney(0, 'USD');
      updateCheckoutAvailability();
      return;
    }

    cartBodyEl.innerHTML = cart.lines.nodes
      .map((line) => {
        const m = line.merchandise;
        const attrs = (line.attributes || []).filter((a) => a.value);
        return `
          <div class="cart-line" data-line-id="${line.id}">
            ${m.image ? `<img src="${m.image.url}" alt="${escapeHtml(m.image.altText || m.product.title)}">` : ''}
            <div class="cart-line-main">
              <div class="cart-line-title">${escapeHtml(m.product.title)}</div>
              <div class="cart-line-attrs">${escapeHtml(m.title)}</div>
              ${attrs.map((a) => `<div class="cart-line-attrs">${escapeHtml(a.key)}: ${escapeHtml(a.value)}</div>`).join('')}
              <div class="cart-line-price">${formatMoney(line.cost.totalAmount.amount, line.cost.totalAmount.currencyCode)}</div>
              <div class="cart-line-controls">
                <div class="qty-stepper qty-stepper-sm">
                  <button type="button" class="cart-qty-minus" data-line-id="${line.id}" data-qty="${line.quantity - 1}" aria-label="Decrease quantity">−</button>
                  <span class="cart-qty-value">${line.quantity}</span>
                  <button type="button" class="cart-qty-plus" data-line-id="${line.id}" data-qty="${line.quantity + 1}" aria-label="Increase quantity">+</button>
                </div>
                <button type="button" class="cart-line-remove" data-line-id="${line.id}">Remove</button>
              </div>
            </div>
          </div>`;
      })
      .join('');

    bindCartLineEvents();

    cartSubtotalEl.textContent = formatMoney(
      cart.cost.subtotalAmount.amount,
      cart.cost.subtotalAmount.currencyCode
    );
    updateCheckoutAvailability();
  }

  function showCartError(msg) {
    if (!cartErrorEl) return;
    cartErrorEl.textContent = msg || '';
    cartErrorEl.style.display = msg ? 'block' : 'none';
  }

  // Single source of truth for whether Checkout can be used: an empty cart
  // OR a mutation currently in flight both disable it, for mouse AND
  // keyboard users (aria-disabled + tabindex, not just a visual/pointer trick).
  function updateCheckoutAvailability() {
    const hasItems = !!(state.cart && state.cart.lines && state.cart.lines.nodes.length);
    const enabled = hasItems && !state.cartBusy;

    cartCheckoutBtn.href = enabled ? state.cart.checkoutUrl : '#';
    cartCheckoutBtn.classList.toggle('disabled', !enabled);
    cartCheckoutBtn.setAttribute('aria-disabled', String(!enabled));
    cartCheckoutBtn.tabIndex = enabled ? 0 : -1;

    cartCheckoutBtn.removeEventListener('click', preventDisabledCheckout);
    if (!enabled) {
      cartCheckoutBtn.addEventListener('click', preventDisabledCheckout);
    }
  }

  function preventDisabledCheckout(e) {
    e.preventDefault();
  }

  // ── WhatsApp + lead tracking ──────────────────────────────────────────
  const WA_NUMBER = '17575031733';
  function updateWhatsAppLink(p) {
    const a = document.getElementById('shopWa');
    if (!a) return;
    const msg = p
      ? `Hi V Imprint Designs! I have a question about "${p.title}": ${window.location.origin}/shop/?handle=${p.handle}`
      : 'Hi V Imprint Designs! I have a question about a custom product.';
    a.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#shopWa, .quote-only-cta, #cartCheckoutBtn');
    if (!t) return;
    if (t.id === 'cartCheckoutBtn') {
      if (state.cart && state.cart.checkoutUrl && t.getAttribute('aria-disabled') !== 'true') {
        track('begin_checkout', { value: Number(state.cart.cost && state.cart.cost.totalAmount && state.cart.cost.totalAmount.amount) || 0 });
      }
      return;
    }
    trackProduct('generate_lead', state.product, state.selectedVariant, 1, { method: t.id === 'shopWa' ? 'whatsapp' : 'quote' });
  }, true);

  function bindCartLineEvents() {
    cartBodyEl.querySelectorAll('.cart-line-remove').forEach((btn) => {
      btn.addEventListener('click', () => handleRemoveLine(btn.dataset.lineId));
    });
    cartBodyEl.querySelectorAll('.cart-qty-minus, .cart-qty-plus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const newQty = Number(btn.dataset.qty);
        if (newQty < 1) {
          handleRemoveLine(btn.dataset.lineId);
        } else {
          handleUpdateLineQty(btn.dataset.lineId, newQty);
        }
      });
    });
  }

  // All cart mutations from the drawer are serialized through this guard:
  // while one is in flight, further quantity/remove clicks and Checkout are
  // disabled, so a second edit can't race the first and silently overwrite
  // it against a stale cart state.
  async function runCartMutation(action, controlsToDisable) {
    if (state.cartBusy) return;
    state.cartBusy = true;
    controlsToDisable.forEach((el) => el && (el.disabled = true));
    updateCheckoutAvailability();
    showCartError('');

    try {
      state.cart = await action();
      reportCartWarnings(state.cart);
      renderCartDrawer(); // re-renders and re-binds fresh controls
    } catch (err) {
      if (err && err.kind === 'not_found') {
        // Cart expired or was deleted server-side mid-edit.
        clearStoredCartId();
        showCartError('Your cart session expired. Please add your items again.');
        renderCartDrawer();
      } else {
        showCartError(friendlyCartErrorMessage(err));
        controlsToDisable.forEach((el) => el && (el.disabled = false));
      }
    } finally {
      state.cartBusy = false;
      updateCheckoutAvailability();
    }
  }

  function handleRemoveLine(lineId) {
    const lineEl = cartBodyEl.querySelector(`[data-line-id="${cssEscape(lineId)}"]`);
    const controls = lineEl ? Array.from(lineEl.querySelectorAll('button')) : [];
    runCartMutation(() => ShopifyClient.removeLineFromCart(state.cart.id, lineId), controls);
  }

  function handleUpdateLineQty(lineId, quantity) {
    const lineEl = cartBodyEl.querySelector(`[data-line-id="${cssEscape(lineId)}"]`);
    const controls = lineEl ? Array.from(lineEl.querySelectorAll('button')) : [];
    runCartMutation(() => ShopifyClient.updateLineInCart(state.cart.id, lineId, quantity), controls);
  }

  // ── Drawer open/close + focus & keyboard handling ────────

  function openCartDrawer() {
    lastFocusedBeforeDrawer = document.activeElement;
    cartDrawerEl.classList.add('open');
    cartOverlayEl.classList.add('open');
    cartDrawerEl.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', handleDrawerKeydown);
    document.getElementById('cartDrawerCloseBtn')?.focus();
  }

  function closeCartDrawer() {
    cartDrawerEl.classList.remove('open');
    cartOverlayEl.classList.remove('open');
    cartDrawerEl.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', handleDrawerKeydown);
    (lastFocusedBeforeDrawer || cartToggleEl)?.focus();
  }

  function handleDrawerKeydown(e) {
    if (e.key === 'Escape') {
      closeCartDrawer();
      return;
    }
    if (e.key === 'Tab') {
      trapFocusInDrawer(e);
    }
  }

  function trapFocusInDrawer(e) {
    const focusable = cartDrawerEl.querySelectorAll(
      'button:not([disabled]), a[href]:not([tabindex="-1"]), input:not([disabled])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  cartToggleEl?.addEventListener('click', () => {
    cartDrawerEl.classList.contains('open') ? closeCartDrawer() : openCartDrawer();
  });
  cartOverlayEl?.addEventListener('click', closeCartDrawer);
  document.getElementById('cartDrawerCloseBtn')?.addEventListener('click', closeCartDrawer);

  // ── Utils ────────────────────────────────────────────────

  function formatMoney(amount, currencyCode) {
    const n = Number(amount);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(n);
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Minimal escape for the attribute-value selectors used above (avoids
  // depending on browser support for the native CSS.escape()).
  function cssEscape(str) {
    return String(str).replace(/["\\]/g, '\\$&');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
