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

  async function init() {
    renderLoading();
    await restoreCart();
    try {
      state.product = await ShopifyClient.getPilotProduct();
      initDefaultSelection();
      renderProduct();
    } catch (err) {
      renderError(err);
    }
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

    root.innerHTML = `
      <div class="shop-state error">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(msg)}</p>
        <button class="retry-btn" id="retryBtn">Try again</button>
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
      return `
        <div class="product-gallery">
          <div class="product-gallery-main product-gallery-empty" aria-hidden="true"></div>
        </div>`;
    }

    const multi = images.length > 1;

    return `
      <div class="product-gallery">
        <div class="product-gallery-main">
          <img src="${escapeHtml(activeImg.url)}" alt="${escapeHtml(galleryAlt(activeImg, p.title))}"
            data-fallback-src="${escapeHtml(featuredUrl)}">
        </div>

        ${multi ? `
        <div class="product-gallery-track-wrap">
          <div class="product-gallery-track" id="galleryTrack">
            ${images
              .map(
                (img, i) => `
              <div class="product-gallery-slide" data-slide-index="${i}">
                <img src="${escapeHtml(img.url)}" alt="${escapeHtml(galleryAlt(img, p.title))}"
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
              <img src="${escapeHtml(img.url)}" alt="" loading="lazy" data-fallback-src="${escapeHtml(featuredUrl)}">
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
          <div class="product-price">
            ${formatMoney(priceAmount, currency)}
            ${compareAt ? `<span class="compare-at">${formatMoney(compareAt, currency)}</span>` : ''}
          </div>

          <div class="avail-badge ${inStock ? 'in-stock' : 'out-stock'}">
            <span class="dot"></span>${inStock ? 'In stock' : 'Currently unavailable'}
          </div>

          <div class="product-desc">${p.descriptionHtml || ''}</div>

          <form id="productForm" novalidate>
            ${renderOptionGroups()}
            ${renderCustomizationFields()}

            <div class="opt-group">
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
              </div>
              <div class="form-error" id="formError" role="alert" aria-live="polite"></div>
            </div>
          </form>

          ${renderMetaNote()}
        </div>
      </div>
    `;

    bindProductEvents();
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

  function renderCustomizationFields() {
    const mf = state.product.metafields;
    let html = '';

    if (mf.allowCustomText) {
      html += `
        <div class="custom-field">
          <label for="customText">Text to Engrave <span class="required-mark" aria-hidden="true">*</span></label>
          <textarea id="customText" maxlength="60" placeholder="e.g. Coach Martinez — Est. 2019"
            aria-required="true">${escapeHtml(state.customText)}</textarea>
          <div class="char-count"><span id="charCount">${state.customText.length}</span>/60</div>
          ${mf.personalizationInstructions ? `<p class="hint">${escapeHtml(mf.personalizationInstructions)}</p>` : ''}
          ${!mf.allowFileUpload ? '<p class="hint">Required — tell us what to engrave.</p>' : ''}
        </div>`;
    }

    if (mf.allowFileUpload) {
      html += `
        <div class="custom-field">
          <label for="artworkFile">Logo or Artwork</label>
          <input type="file" id="artworkFile" accept="image/png,image/jpeg" class="file-input">
          <p class="hint">PNG or JPG, up to 20MB. Prefer a smaller file if you can — it uploads faster.</p>
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

  function renderMetaNote() {
    const mf = state.product.metafields;
    const parts = [];
    // Explicitly labeled as production time only — never implied to include
    // shipping/transit time, which isn't configured for this pilot yet.
    if (mf.productionTime) parts.push(`Production time (before shipping): ${mf.productionTime}`);
    if (mf.bulkMinimum) parts.push(`Bulk pricing available from ${mf.bulkMinimum}+ units — contact us for a quote`);
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
            if (mainImg && images[index]) mainImg.src = images[index].url;
          }
        }, 120);
      });
    }
  }

  function bindProductEvents() {
    bindGalleryEvents();

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

    // Personalization is required for this pilot item: the shopper must
    // supply either engraving text or an uploaded artwork file (or both).
    const mf = state.product.metafields;
    const hasText = mf.allowCustomText && state.customText.trim();
    const hasFile = mf.allowFileUpload && state.uploadedFileKey;
    if ((mf.allowCustomText || mf.allowFileUpload) && !hasText && !hasFile) {
      errorEl.textContent = mf.allowFileUpload
        ? 'Please enter engraving text or upload artwork before adding this to your cart.'
        : 'Please enter the text you want engraved before adding this to your cart.';
      document.getElementById('customText')?.focus();
      return;
    }

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
    cartCountEl.textContent = qty;
    cartCountEl.style.display = qty > 0 ? 'flex' : 'none';

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
