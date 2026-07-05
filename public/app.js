/* ==========================================================================
   Manih Jewelz - Premium Client-Side Storefront Engine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  window.handleGoogleCredentialResponse = async (response) => {
    try {
      const token = response.credential;
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      const payload = JSON.parse(jsonPayload);
      const name = payload.name;
      const email = payload.email;

      const res = await fetch(`${API_BASE}/api/customer/google-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Google authentication failed.");

      localStorage.setItem('manih_customer_email', data.email);
      localStorage.setItem('manih_customer_name', data.name);
      if (data.token) {
        localStorage.setItem('manih_customer_token', data.token);
      }
      
      checkUserLoginSession();
      const userDrawer = document.getElementById('user-drawer');
      if (userDrawer) userDrawer.classList.remove('active');
    } catch (err) {
      console.error("Google login failure:", err);
      alert("Google Sign-In failed: " + err.message);
    }
  };
  
  // Global drawer state listener to lock/unlock background page scrolling
  window.addEventListener('click', () => {
    setTimeout(() => {
      const activeDrawers = document.querySelectorAll('.cart-drawer.active, .mobile-menu-drawer.active, .search-overlay.active');
      if (activeDrawers.length > 0) {
        document.body.classList.add('no-scroll');
      } else {
        document.body.classList.remove('no-scroll');
      }
    }, 50);
  });
  
  // --------------------------------------------------------------------------
  // 1. Application State
  // --------------------------------------------------------------------------
  let products = [];
  let cart = JSON.parse(localStorage.getItem('manih_cart')) || [];
  let wishlist = JSON.parse(localStorage.getItem('manih_wishlist')) || [];

  // Curated Mock Reviews seeded per product ID
  const MOCK_REVIEWS = {
    1: [
      { name: "Anjali Sharma", rating: 5, text: "I ordered the Kundan Lotus Jhumkas for my cousin's wedding, and I got so many compliments! Nobody could believe it was artificial jewelry. The gold finish is highly realistic.", date: "June 15, 2026" },
      { name: "Sneha Gupta", rating: 4, text: "Very beautiful design. The hand-painted lotus details are exquisite. It is a bit heavy, but looks majestic. Perfect for festive occasions.", date: "June 18, 2026" }
    ],
    2: [
      { name: "Pooja Patel", rating: 5, text: "The Rose Gold Blossom Studs have become my daily go-to! They are extremely lightweight and tarnish-free. I've worn them in the shower, and they still sparkle like new.", date: "June 12, 2026" },
      { name: "Meera Nair", rating: 5, text: "Subtle and elegant. The Swiss cubic zirconia crystals shine beautifully in the light. Highly recommend for office wear.", date: "June 20, 2026" }
    ],
    3: [
      { name: "Shreya Ghoshal", rating: 5, text: "Absolutely breathtaking! A true masterpiece. The antique gold plating and pearl beads give it an incredibly authentic heritage look.", date: "June 10, 2026" },
      { name: "Kiran Bedi", rating: 4, text: "Stunning choker, got it for a family function. The adjustable dori makes it easy to fit. Fits comfortably and feels premium.", date: "June 22, 2026" }
    ],
    4: [
      { name: "Riya Sen", rating: 5, text: "Highly impressed with the Manih Kada bracelet. The side hinge makes it super easy to wear, and the cubic zirconia diamonds are brilliant. Safe packaging and fast delivery.", date: "June 14, 2026" },
      { name: "Divya Dutta", rating: 5, text: "Very sleek and modern. I love the interlocking wave design. It looks great paired with both Indian and western outfits.", date: "June 19, 2026" }
    ]
  };

  // --------------------------------------------------------------------------
  // 2. Global DOM Selectors
  // --------------------------------------------------------------------------
  // Header Search Row & Category Links
  const searchOverlay = document.getElementById('search-overlay');
  const searchToggleBtn = document.getElementById('search-toggle-btn');
  const searchOverlayClose = document.getElementById('search-overlay-close');
  const searchOverlayOverlay = searchOverlay ? searchOverlay.querySelector('.search-overlay-overlay') : null;
  const overlaySearchInput = document.getElementById('overlay-search-input');
  const overlaySearchSubmitBtn = document.getElementById('overlay-search-submit-btn');
  const headerCategoryLinks = document.querySelectorAll('.header-category-link');

  // Mobile Menu Drawer
  const mobileMenuDrawer = document.getElementById('mobile-menu-drawer');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenuCloseBtn = document.getElementById('mobile-menu-close-btn');
  const mobileMenuOverlay = mobileMenuDrawer ? mobileMenuDrawer.querySelector('.mobile-menu-overlay') : null;

  // Customer Account Drawer
  const userDrawer = document.getElementById('user-drawer');
  const userToggleBtn = document.getElementById('user-toggle-btn');
  const userCloseBtn = document.getElementById('user-close-btn');
  const userLoggedOutState = document.getElementById('user-logged-out-state');
  const userLoggedInState = document.getElementById('user-logged-in-state');
  const userLoginForm = document.getElementById('user-login-form');
  const loginEmailInput = document.getElementById('login-email');
  const userWelcomeName = document.getElementById('user-welcome-name');
  const userProfileEmail = document.getElementById('user-profile-email');
  const userOrdersContainer = document.getElementById('user-orders-container');
  const userLogoutBtn = document.getElementById('user-logout-btn');

  // Customer Dual-View Login & Sign Up Selectors
  const userLoginView = document.getElementById('user-login-view');
  const userSignupView = document.getElementById('user-signup-view');
  const userSignupForm = document.getElementById('user-signup-form');
  const loginErrorMsg = document.getElementById('login-error-message');
  const signupErrorMsg = document.getElementById('signup-error-message');
  const goToSignupBtn = document.getElementById('go-to-signup-btn');
  const goToLoginBtn = document.getElementById('go-to-login-btn');
  const signupNameInput = document.getElementById('signup-name');
  const signupEmailInput = document.getElementById('signup-email');
  const signupPasswordInput = document.getElementById('signup-password');
  const signupPhoneInput = document.getElementById('signup-phone');
  const loginPasswordInput = document.getElementById('login-password');

  // Guest Order Tracking Selectors
  const userTrackView = document.getElementById('user-track-view');
  const trackErrorMsg = document.getElementById('track-error-message');
  const userTrackForm = document.getElementById('user-track-form');
  const trackEmailInput = document.getElementById('track-email');
  const trackOrderIdInput = document.getElementById('track-order-id');
  const trackResultsContainer = document.getElementById('track-results-container');
  const trackBackToLoginBtn = document.getElementById('track-back-to-login-btn');

  // Cart Drawer
  const cartDrawer = document.getElementById('cart-drawer');
  const cartToggleBtn = document.getElementById('cart-toggle-btn');
  const cartCloseBtn = document.getElementById('cart-close-btn');
  const cartCountBadge = document.getElementById('cart-count-badge');
  const cartItemsContainer = document.getElementById('cart-items-container');
  const cartSubtotal = document.getElementById('cart-subtotal');
  const cartEmptyState = document.getElementById('cart-empty-state');
  const cartFooter = document.getElementById('cart-footer');
  const cartShopBtn = document.getElementById('cart-shop-btn');
  
  // Wishlist Drawer
  const wishlistDrawer = document.getElementById('wishlist-drawer');
  const wishlistToggleBtn = document.getElementById('wishlist-toggle-btn');
  const wishlistCloseBtn = document.getElementById('wishlist-close-btn');
  const wishlistCountBadge = document.getElementById('wishlist-count-badge');
  const wishlistItemsContainer = document.getElementById('wishlist-items-container');
  const wishlistEmptyState = document.getElementById('wishlist-empty-state');
  const wishlistShopBtn = document.getElementById('wishlist-shop-btn');

  // Checkout Form (Inside Cart Drawer)
  const checkoutBtn = document.getElementById('checkout-btn');
  const checkoutFormContainer = document.getElementById('checkout-form-container');
  const backToCartBtn = document.getElementById('back-to-cart-btn');
  const paymentForm = document.getElementById('payment-form');
  const checkoutTotalVal = document.getElementById('checkout-total-val');
  const submitPaymentBtn = document.getElementById('submit-payment-btn');
  const paymentBtnText = document.getElementById('payment-btn-text');
  const paymentBtnSpinner = document.getElementById('payment-btn-spinner');
  
  // Success Receipt Modal
  const receiptModal = document.getElementById('receipt-modal');
  const receiptDetails = document.getElementById('receipt-details');
  const receiptDoneBtn = document.getElementById('receipt-done-btn');

  // SQLite Developer Dashboard Console
  const dbPanel = document.getElementById('database-panel');
  const dbTabButtons = document.querySelectorAll('.db-tab-btn');
  const dbTableContents = document.querySelectorAll('.db-table-content');
  const btnDbRefresh = document.getElementById('btn-db-refresh');
  const dbProductsTbody = document.getElementById('db-products-tbody');
  const dbOrdersTbody = document.getElementById('db-orders-tbody');
  const dbTransactionsTbody = document.getElementById('db-transactions-tbody');
  const badgeProducts = document.getElementById('badge-products');
  const badgeOrders = document.getElementById('badge-orders');
  const badgeTransactions = document.getElementById('badge-transactions');

  // --------------------------------------------------------------------------
  // 3. Main Initialization & Page Routing
  // --------------------------------------------------------------------------
  async function init() {
    // 1. Fetch products from SQLite backend
    await fetchProducts();

    // 2. Initialize global UI components (Cart, Wishlist, User Account, Drawers)
    updateCartUI();
    updateWishlistUI();
    checkUserLoginSession();
    setupGlobalEventListeners();
    
    // 2c. Start real-time inventory sync polling
    startInventorySync();

    // 2b. Initialize Search Autocomplete Autocomplete recommendations
    const overlayInput = document.getElementById('overlay-search-input');
    if (overlayInput) setupAutocomplete(overlayInput, null, true);

    const catalogInput = document.getElementById('catalog-search');
    if (catalogInput) setupAutocomplete(catalogInput, null, false);

    // 3. Initialize SQLite Dashboard Visualizer if present on current page
    if (dbPanel) {
      fetchDatabaseDashboard();
      setupDatabasePanelEventListeners();
    }

    // 4. Page Router based on window path name
    const path = window.location.pathname.toLowerCase();
    if (path.includes('shop.html')) {
      initShopPage();
    } else if (path.includes('product.html')) {
      initProductDetailPage();
    } else {
      initHomePage();
    }
  }

  // --------------------------------------------------------------------------
  // 4. API Requests
  // --------------------------------------------------------------------------
  
  // Fetch all creations from the Express server
  async function fetchProducts() {
    try {
      const response = await fetch(`${API_BASE}/api/products`);
      if (!response.ok) throw new Error('Failed to load products.');
      products = await response.json();
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }

  // Live Inventory Sync Polling
  function startInventorySync() {
    setInterval(async () => {
      const isShop = window.location.pathname.toLowerCase().includes('shop.html');
      const isProduct = window.location.pathname.toLowerCase().includes('product.html');
      if (!isShop && !isProduct) return;

      try {
        const response = await fetch(`${API_BASE}/api/products`);
        if (!response.ok) return;
        const latestProducts = await response.json();
        
        products = latestProducts;

        if (isShop) {
          if (typeof filterCatalog === 'function') {
            filterCatalog();
          }
        }

        if (isProduct) {
          const params = new URLSearchParams(window.location.search);
          const productId = parseInt(params.get('id'));
          const currentItem = products.find(p => p.id === productId);
          
          if (currentItem) {
            const availValueEl = document.querySelector('.specifications-panel .spec-row:last-child strong');
            if (availValueEl) {
              const availableMetals = (currentItem.metal_options && currentItem.metal_options !== 'none') 
                ? currentItem.metal_options.toLowerCase().split(',') 
                : [];
              let firstInStockMetal = '';
              for (let m of availableMetals) {
                const cleanM = m.trim().toLowerCase();
                if (cleanM === 'golden' && currentItem.gold_stock > 0) { firstInStockMetal = 'Golden'; break; }
                if (cleanM === 'silver' && currentItem.silver_stock > 0) { firstInStockMetal = 'Silver'; break; }
              }
              const isOutOfStockNow = (currentItem.metal_options && currentItem.metal_options !== 'none')
                ? (firstInStockMetal === '')
                : (currentItem.stock <= 0);

              const currentText = availValueEl.textContent;
              const expectedText = isOutOfStockNow ? 'Sold Out' : `In Stock (${currentItem.stock} available)`;

              if (currentText !== expectedText) {
                if (isOutOfStockNow) {
                  availValueEl.textContent = 'Sold Out';
                  availValueEl.style.color = 'var(--accent-ruby)';
                } else {
                  availValueEl.textContent = `In Stock (${currentItem.stock} available)`;
                  availValueEl.style.color = 'var(--accent-emerald)';
                }

                // If stock swapped between in-stock and out-of-stock, re-render form controls
                const restockButton = document.getElementById('restock-request-submit-btn');
                if ((isOutOfStockNow && !restockButton) || (!isOutOfStockNow && restockButton)) {
                  const container = document.getElementById('product-detail-container');
                  if (container) renderProductDetail(container, currentItem);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Live inventory sync failed:", err);
      }
    }, 10000); // Sync every 10 seconds
  }

  // Validate cart items against latest DB stock before allowing checkout
  async function validateCartStockBeforeCheckout() {
    try {
      const response = await fetch(`${API_BASE}/api/products`);
      if (!response.ok) throw new Error("Failed to verify catalog stock.");
      const latestProducts = await response.json();
      products = latestProducts;

      let cartAdjusted = false;
      let adjustmentsMessages = [];

      for (let i = cart.length - 1; i >= 0; i--) {
        const item = cart[i];
        const dbProduct = latestProducts.find(p => p.id === item.productId);

        if (!dbProduct) {
          cart.splice(i, 1);
          adjustmentsMessages.push(`"${item.name}" is no longer available and was removed.`);
          cartAdjusted = true;
          continue;
        }

        let availableStock = dbProduct.stock;
        if (dbProduct.metal_options && dbProduct.metal_options !== 'none') {
          if (item.metal && item.metal.toLowerCase() === 'golden') {
            availableStock = dbProduct.gold_stock;
          } else if (item.metal && item.metal.toLowerCase() === 'silver') {
            availableStock = dbProduct.silver_stock;
          }
        }

        if (availableStock <= 0) {
          cart.splice(i, 1);
          adjustmentsMessages.push(`"${item.name}" (${item.metal || 'Standard'}) is now sold out and has been removed.`);
          cartAdjusted = true;
        } else if (item.quantity > availableStock) {
          cart[i].quantity = availableStock;
          adjustmentsMessages.push(`Quantity for "${item.name}" (${item.metal || 'Standard'}) adjusted to ${availableStock} (max available).`);
          cartAdjusted = true;
        }
      }

      if (cartAdjusted) {
        saveCart();
        updateCartUI();
        alert("Some items in your cart were updated due to recent stock changes:\n\n• " + adjustmentsMessages.join("\n• "));
        return false;
      }

      return true;
    } catch (err) {
      console.error("Cart validation error:", err);
      return true;
    }
  }

  // Fetch SQLite tables logs for developer dashboard
  async function fetchDatabaseDashboard() {
    try {
      const response = await fetch(`${API_BASE}/api/admin/db`);
      if (!response.ok) throw new Error('Failed to load database logs.');
      const data = await response.json();
      renderDatabaseDashboard(data);
    } catch (error) {
      console.error('Error fetching database dashboard:', error);
    }
  }

  // --------------------------------------------------------------------------
  // 5. Global Cart & Wishlist State Operations
  // --------------------------------------------------------------------------
  
  function addToCart(productId, name, price, metal, gemstone, image, quantity = 1) {
    // Check stock
    const dbProduct = products.find(p => p.id === productId);
    if (dbProduct) {
      let availableStock = dbProduct.stock;
      if (dbProduct.metal_options && dbProduct.metal_options !== 'none') {
        if (metal && metal.toLowerCase() === 'golden') {
          availableStock = dbProduct.gold_stock;
        } else if (metal && metal.toLowerCase() === 'silver') {
          availableStock = dbProduct.silver_stock;
        }
      }

      // Calculate total quantity they would have if this succeeds
      const existingItem = cart.find(item => item.productId === productId && item.metal === metal);
      const currentQtyInCart = existingItem ? existingItem.quantity : 0;

      if (currentQtyInCart + quantity > availableStock) {
        alert(`Cannot add more. Only ${availableStock} units of "${name}" (${metal || 'Standard'}) are available, and you already have ${currentQtyInCart} in your cart.`);
        return;
      }
    }

    const existingItemIndex = cart.findIndex(item => 
      item.productId === productId && 
      item.metal === metal
    );

    if (existingItemIndex > -1) {
      cart[existingItemIndex].quantity += quantity;
    } else {
      cart.push({
        productId,
        name,
        price,
        metal,
        gemstone,
        image,
        quantity
      });
    }

    saveCart();
    updateCartUI();
  }

  function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    updateCartUI();
  }

  function updateQuantity(index, delta) {
    const item = cart[index];
    const dbProduct = products.find(p => p.id === item.productId);
    
    if (delta > 0 && dbProduct) {
      let availableStock = dbProduct.stock;
      if (dbProduct.metal_options && dbProduct.metal_options !== 'none') {
        if (item.metal && item.metal.toLowerCase() === 'golden') {
          availableStock = dbProduct.gold_stock;
        } else if (item.metal && item.metal.toLowerCase() === 'silver') {
          availableStock = dbProduct.silver_stock;
        }
      }
      if (item.quantity + delta > availableStock) {
        alert(`Sorry, only ${availableStock} units of "${item.name}" (${item.metal || 'Standard'}) are available.`);
        return;
      }
    }

    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) {
      cart.splice(index, 1);
    }
    saveCart();
    updateCartUI();
  }

  // Save shopping cart state
  function saveCart() {
    localStorage.setItem('manih_cart', JSON.stringify(cart));
  }

  function updateCartUI() {
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartCountBadge) {
      cartCountBadge.textContent = totalCount;
      cartCountBadge.style.display = totalCount > 0 ? 'flex' : 'none';
    }

    if (!cartItemsContainer || !cartEmptyState || !cartFooter) return;

    if (cart.length === 0) {
      cartItemsContainer.classList.add('hidden');
      cartFooter.classList.add('hidden');
      cartEmptyState.classList.remove('hidden');
      return;
    }

    cartEmptyState.classList.add('hidden');
    cartItemsContainer.classList.remove('hidden');
    cartFooter.classList.remove('hidden');

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartSubtotal.textContent = `₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const checkoutSubtotalEl = document.getElementById('checkout-subtotal-val');
    if (checkoutSubtotalEl) {
      checkoutSubtotalEl.textContent = `₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    if (checkoutTotalVal) {
      const totalWithDelivery = subtotal + 50;
      checkoutTotalVal.textContent = `₹${totalWithDelivery.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    cartItemsContainer.innerHTML = cart.map((item, index) => `
      <div class="cart-item">
        <div class="cart-item-image">
          <img src="${item.image}" alt="${item.name}">
        </div>
        <div class="cart-item-details">
          <h4 class="cart-item-name">${item.name}</h4>
          <span class="cart-item-customizations">Polish: ${item.metal}</span>
          <div class="cart-item-price-qty">
            <span class="cart-item-price">₹${(item.price * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <div class="qty-editor">
              <button class="qty-btn qty-minus" data-index="${index}"><i class="fa-solid fa-minus"></i></button>
              <span class="qty-value">${item.quantity}</span>
              <button class="qty-btn qty-plus" data-index="${index}"><i class="fa-solid fa-plus"></i></button>
            </div>
            <button class="cart-item-remove" data-index="${index}"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach cart controls events
    cartItemsContainer.querySelectorAll('.qty-minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        updateQuantity(idx, -1);
      });
    });

    cartItemsContainer.querySelectorAll('.qty-plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        updateQuantity(idx, 1);
      });
    });

    cartItemsContainer.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        removeFromCart(idx);
      });
    });
  }

  function toggleWishlist(productId) {
    const existingIndex = wishlist.findIndex(item => item.id === productId);
    const item = products.find(p => p.id === productId);

    if (existingIndex > -1) {
      wishlist.splice(existingIndex, 1);
    } else if (item) {
      const firstImg = (Array.isArray(item.images) && item.images.length > 0) ? item.images[0] : 'assets/logo.png';
      const finalPrice = (item.discount_price && item.discount_price < item.base_price) ? item.discount_price : item.base_price;
      wishlist.push({
        id: item.id,
        name: item.name,
        price: finalPrice,
        image: firstImg
      });
    }

    saveWishlist();
    updateWishlistUI();

    // Synchronize catalog cards wishlist hearts if on Shop Page
    const cardHeart = document.querySelector(`.product-card-image .wishlist-card-btn[data-id='${productId}']`);
    if (cardHeart) {
      const isLiked = wishlist.some(w => w.id === productId);
      cardHeart.classList.toggle('active', isLiked);
      cardHeart.querySelector('i').className = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    }

    // Synchronize product detail heart if on Product Page
    const detailHeart = document.getElementById('detail-wishlist-toggle');
    if (detailHeart && parseInt(detailHeart.getAttribute('data-id')) === productId) {
      const isLiked = wishlist.some(w => w.id === productId);
      detailHeart.classList.toggle('active', isLiked);
      detailHeart.querySelector('i').className = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    }
  }

  // Save wishlist to localStorage
  function saveWishlist() {
    localStorage.setItem('manih_wishlist', JSON.stringify(wishlist));
  }

  // Update wishlist display
  function updateWishlistUI() {
    const totalCount = wishlist.length;
    if (wishlistCountBadge) {
      wishlistCountBadge.textContent = totalCount;
      wishlistCountBadge.style.display = totalCount > 0 ? 'flex' : 'none';
    }

    if (!wishlistItemsContainer || !wishlistEmptyState) return;

    if (wishlist.length === 0) {
      wishlistItemsContainer.classList.add('hidden');
      wishlistEmptyState.classList.remove('hidden');
      return;
    }

    wishlistEmptyState.classList.add('hidden');
    wishlistItemsContainer.classList.remove('hidden');

    wishlistItemsContainer.innerHTML = wishlist.map((item, index) => `
      <div class="cart-item">
        <div class="cart-item-image">
          <img src="${item.image}" alt="${item.name}">
        </div>
        <div class="cart-item-details">
          <h4 class="cart-item-name">${item.name}</h4>
          <span class="cart-item-price" style="margin-top: 0.25rem;">₹${item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem;">
            <button class="btn btn-primary btn-sm wishlist-move-to-bag" data-id="${item.id}" data-index="${index}" style="padding:0.4rem 1rem; font-size:0.65rem;">
              Add to Bag
            </button>
            <button class="cart-item-remove wishlist-remove-btn" data-id="${item.id}" data-index="${index}"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach wishlist drawer triggers
    wishlistItemsContainer.querySelectorAll('.wishlist-move-to-bag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        
        const item = products.find(p => p.id === id);
        if (item) {
          const firstImg = (Array.isArray(item.images) && item.images.length > 0) ? item.images[0] : 'assets/logo.png';
          const finalPrice = (item.discount_price && item.discount_price < item.base_price) ? item.discount_price : item.base_price;
          addToCart(item.id, item.name, finalPrice, "Standard Polish", "None", firstImg);
          
          wishlist.splice(idx, 1);
          saveWishlist();
          updateWishlistUI();
          
          const cardHeart = document.querySelector(`.product-card-image .wishlist-card-btn[data-id='${id}']`);
          if (cardHeart) {
            cardHeart.classList.remove('active');
            cardHeart.querySelector('i').className = 'fa-regular fa-heart';
          }

          wishlistDrawer.classList.remove('active');
          cartDrawer.classList.add('active');
        }
      });
    });

    wishlistItemsContainer.querySelectorAll('.wishlist-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        toggleWishlist(id);
      });
    });
  }

  // --------------------------------------------------------------------------
  // 6. Customer Account Portal (Guest Login & Order Tracker)
  // --------------------------------------------------------------------------
  async function checkUserLoginSession() {
    if (!userDrawer || !userLoggedOutState || !userLoggedInState || !userWelcomeName || !userProfileEmail || !userOrdersContainer) return;

    const savedEmail = localStorage.getItem('manih_customer_email');
    const savedName = localStorage.getItem('manih_customer_name');
    const drawerTitle = document.getElementById('user-drawer-title');
    
    if (savedEmail) {
      // User is logged in
      userLoggedOutState.classList.add('hidden');
      userLoggedInState.classList.remove('hidden');
      userProfileEmail.textContent = savedEmail;
      
      // Default greeting using saved name or email prefix
      const displayName = savedName || savedEmail.split('@')[0];
      userWelcomeName.textContent = `Hi, ${displayName}`;
      
      if (drawerTitle) drawerTitle.textContent = "MY ACCOUNT";
      
      // Load their dynamic order history from SQLite using developer db logs API (filtered client-side)
      userOrdersContainer.innerHTML = `
        <div style="text-align:center; padding: 2rem 0; color:var(--rose-gold-warm);">
          <i class="fa-solid fa-arrows-rotate fa-spin" style="font-size:1.25rem; margin-bottom:0.5rem;"></i>
          <p style="font-size:0.7rem; color:var(--text-muted);">Retrieving order history...</p>
        </div>
      `;

      try {
        const customerToken = localStorage.getItem('manih_customer_token');
        const response = await fetch('/api/customer/orders', {
          headers: {
            'Authorization': `Bearer ${customerToken || ''}`
          }
        });
        if (!response.ok) throw new Error('Failed to retrieve order history.');
        const data = await response.json();
        
        const userOrders = data.orders || [];
        
        if (userOrders.length === 0) {
          userWelcomeName.textContent = `Hi, ${displayName}`;
          userOrdersContainer.innerHTML = `
            <p style="font-size: 0.75rem; color: var(--text-secondary); text-align: center; margin-top: 1.5rem; line-height: 1.6;">
              You haven't placed any orders yet. Select products to place your first order.
            </p>
            <a href="shop.html" class="btn btn-primary btn-sm btn-block" style="margin-top: 1rem; padding: 0.5rem; font-size: 0.65rem;">Browse</a>
          `;
        } else {
          // Personalize greeting using name logged during checkout
          const customerName = userOrders[0].customer_name;
          userWelcomeName.textContent = `Hi, ${customerName}`;
          
          userOrdersContainer.innerHTML = userOrders.map(o => `
            <div class="user-order-card" style="border: 1px solid var(--border-rose); padding: 1rem; margin-bottom: 0.8rem; background-color: var(--white-pure);">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.75rem;">
                <span style="color: var(--text-muted);">Order #000${o.id}</span>
                <span style="color: var(--accent-emerald); font-weight: 600;">${o.status}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 500; margin-bottom:0.25rem;">
                <span>Total Amount:</span>
                <span style="color: var(--bg-maroon);">₹${o.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">
                Placed: ${new Date(o.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>
          `).join('');
        }
      } catch (err) {
        console.error("Error loading account orders:", err);
        userOrdersContainer.innerHTML = `
          <p style="font-size: 0.75rem; color: var(--accent-ruby); text-align: center; margin-top: 1.5rem;">
            Unable to connect to transaction databases. Ensure the server is online.
          </p>
        `;
      }
    } else {
      // User is logged out (show form)
      userLoggedOutState.classList.remove('hidden');
      userLoggedInState.classList.add('hidden');
      
      if (drawerTitle) {
        const isSignupVisible = !userSignupView.classList.contains('hidden');
        drawerTitle.textContent = isSignupVisible ? "SIGN UP" : "LOGIN";
      }
    }
  }

  // --------------------------------------------------------------------------
  // 7. Checkout & Payment Simulation
  // --------------------------------------------------------------------------
  async function handleCheckoutPayment(e) {
    e.preventDefault();

    const name = document.getElementById('checkout-name').value.trim();
    const email = document.getElementById('checkout-email').value.trim();
    const address = document.getElementById('checkout-address').value.trim();
    const phone = document.getElementById('checkout-phone').value.trim();
    const pincode = document.getElementById('checkout-pincode').value.trim();

    if (!name || !email || !address || !phone || !pincode) {
      alert("Please fill out all shipping details.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    const phoneClean = phone.replace(/\D/g, '');
    if (phoneClean.length !== 10) {
      alert("Please enter a valid 10-digit Indian phone number.");
      return;
    }

    const pincodeClean = pincode.replace(/\D/g, '');
    if (pincodeClean.length !== 6) {
      alert("Please enter a valid 6-digit Indian Pincode.");
      return;
    }

    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) + 50;
    const cartItemsPayload = cart.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      metal: item.metal,
      gemstone: item.gemstone,
      price: item.price
    }));

    submitPaymentBtn.disabled = true;
    paymentBtnText.textContent = "Initializing Razorpay Checkout...";
    paymentBtnSpinner.classList.remove('hidden');

    try {
      // 1. Get Razorpay Key ID from server
      const configRes = await fetch(`${API_BASE}/api/config`);
      if (!configRes.ok) throw new Error("Failed to fetch payment configuration.");
      const { razorpayKeyId } = await configRes.json();

      // 2. Create Razorpay order on backend using backend calculated price
      const cartItemsPayload = cart.map(item => ({
        productId: item.id,
        quantity: item.quantity
      }));

      const orderRes = await fetch(`${API_BASE}/api/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartItemsPayload,
          currency: 'INR',
          receipt: `receipt_${Date.now()}`
        })
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderData.error || 'Failed to initialize payment order.');
      }

      // 3. Configure Razorpay Standard Checkout options
      const options = {
        key: razorpayKeyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Manih Jewelz",
        description: "Jewelry Purchase",
        image: "assets/logo.png",
        order_id: orderData.order_id,
        handler: async function (response) {
          try {
            paymentBtnText.textContent = "Verifying Payment...";
            // Send signature details to verification endpoint
            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              customerName: name,
              customerEmail: email,
              shippingAddress: `${address}, PIN: ${pincode}, Phone: ${phone}`,
              items: cartItemsPayload,
              totalAmount: totalAmount
            };

            const verifyRes = await fetch(`${API_BASE}/api/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(verifyPayload)
            });

            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) {
              throw new Error(verifyData.error || 'Payment signature verification failed.');
            }

            // Payment successful, show receipt and clear cart
            showSuccessReceipt(verifyData);
            
            // Auto-log user in on successful purchase to track their order immediately!
            localStorage.setItem('manih_customer_email', email);
            
            cart = [];
            saveCart();
            updateCartUI();
            
            checkoutFormContainer.classList.add('hidden');
            cartDrawer.classList.remove('active');

            // Refresh inventory if on Shop catalog
            if (window.location.pathname.toLowerCase().includes('shop.html')) {
              await fetchProducts();
              filterCatalog();
            }
            
            // Refresh database visualizer if it exists
            if (typeof dbPanel !== 'undefined' && dbPanel) {
              fetchDatabaseDashboard();
            }
          } catch (verifyErr) {
            console.error("Signature verification error:", verifyErr);
            alert("Verification Failed: " + verifyErr.message);
            resetPaymentBtn();
          }
        },
        prefill: {
          name: name,
          email: email,
          contact: phone
        },
        theme: {
          color: "#5b0012"
        },
        modal: {
          ondismiss: function () {
            console.log("Razorpay payment modal closed by customer.");
            alert("Payment cancelled by user.");
            resetPaymentBtn();
          }
        }
      };

      const rzp = new Razorpay(options);
      
      rzp.on('payment.failed', function (response) {
        console.error("Razorpay payment failure:", response.error);
        alert(`Payment Failed: ${response.error.description}`);
        resetPaymentBtn();
      });

      rzp.open();

    } catch (err) {
      console.error("Checkout payment setup failed:", err);
      alert("Payment Setup Failed: " + err.message);
      resetPaymentBtn();
    }
  }

  function resetPaymentBtn() {
    submitPaymentBtn.disabled = false;
    paymentBtnText.textContent = "Place Order & Pay";
    paymentBtnSpinner.classList.add('hidden');
  }

  function showSuccessReceipt(receipt) {
    receiptDetails.innerHTML = `
      <div class="receipt-row">
        <span>Order Reference:</span>
        <strong>#000${receipt.orderId}</strong>
      </div>
      <div class="receipt-row">
        <span>Transaction ID:</span>
        <strong>${receipt.transactionRef}</strong>
      </div>
      <div class="receipt-row">
        <span>Total Debited:</span>
        <strong style="color: var(--bg-maroon)">₹${receipt.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
      </div>
      <div class="receipt-row">
        <span>Payment Method:</span>
        <strong>${receipt.paymentMethod}</strong>
      </div>
      <div class="receipt-row">
        <span>Client Name:</span>
        <strong>${receipt.customerName}</strong>
      </div>
      <div class="receipt-row">
        <span>Invoice Email:</span>
        <strong>${receipt.customerEmail}</strong>
      </div>
      <div class="receipt-row" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--border-rose);">
        <span>Estimated Delivery:</span>
        <strong style="color: var(--accent-emerald)">${receipt.estimatedDelivery}</strong>
      </div>
    `;

    receiptModal.classList.add('active');
  }

  // --------------------------------------------------------------------------
  // 8. Event Listeners Setup (Global Nav, Search, Drawers)
  // --------------------------------------------------------------------------
  function setupGlobalEventListeners() {
    
    // Hamburger Mobile Menu toggle triggers
    if (mobileMenuBtn && mobileMenuDrawer) {
      mobileMenuBtn.addEventListener('click', () => mobileMenuDrawer.classList.add('active'));
      if (mobileMenuCloseBtn) {
        mobileMenuCloseBtn.addEventListener('click', () => mobileMenuDrawer.classList.remove('active'));
      }
      if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', () => mobileMenuDrawer.classList.remove('active'));
      }
    }

    // Customer Account Drawer sliding triggers
    if (userToggleBtn && userDrawer) {
      userToggleBtn.addEventListener('click', () => {
        userDrawer.classList.add('active');
        checkUserLoginSession();
      });
      if (userCloseBtn) {
        userCloseBtn.addEventListener('click', () => userDrawer.classList.remove('active'));
      }
      const userOverlay = userDrawer.querySelector('.user-drawer-overlay');
      if (userOverlay) {
        userOverlay.addEventListener('click', () => userDrawer.classList.remove('active'));
      }
    }

    // Toggle between Login and Signup Views
    const drawerTitle = document.getElementById('user-drawer-title');
    if (goToSignupBtn && userLoginView && userSignupView) {
      goToSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        userLoginView.classList.add('hidden');
        userSignupView.classList.remove('hidden');
        if (loginErrorMsg) loginErrorMsg.classList.add('hidden');
        if (drawerTitle) drawerTitle.textContent = "SIGN UP";
      });
    }

    if (goToLoginBtn && userLoginView && userSignupView) {
      goToLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        userSignupView.classList.add('hidden');
        userLoginView.classList.remove('hidden');
        if (signupErrorMsg) signupErrorMsg.classList.add('hidden');
        if (drawerTitle) drawerTitle.textContent = "LOGIN";
      });
    }

    // Toggle forgot password views
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const forgotBackToLoginBtn = document.getElementById('forgot-back-to-login-btn');
    const userForgotView = document.getElementById('user-forgot-view');
    const forgotErrorMsg = document.getElementById('forgot-error-message');
    const forgotSuccessMsg = document.getElementById('forgot-success-message');
    const userForgotForm = document.getElementById('user-forgot-form');

    if (forgotPasswordLink && userLoginView && userForgotView) {
      forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        userLoginView.classList.add('hidden');
        userForgotView.classList.remove('hidden');
        if (forgotErrorMsg) forgotErrorMsg.classList.add('hidden');
        if (forgotSuccessMsg) forgotSuccessMsg.classList.add('hidden');
        if (drawerTitle) drawerTitle.textContent = "RESET PASSWORD";
      });
    }

    if (forgotBackToLoginBtn && userLoginView && userForgotView) {
      forgotBackToLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        userForgotView.classList.add('hidden');
        userLoginView.classList.remove('hidden');
        if (drawerTitle) drawerTitle.textContent = "LOGIN";
      });
    }

    // Toggle guest order tracking view
    const goToTrackBtns = document.querySelectorAll('.go-to-track-btn');
    goToTrackBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (userLoginView) userLoginView.classList.add('hidden');
        if (userSignupView) userSignupView.classList.add('hidden');
        if (userForgotView) userForgotView.classList.add('hidden');
        if (userTrackView) userTrackView.classList.remove('hidden');
        if (trackErrorMsg) trackErrorMsg.classList.add('hidden');
        if (trackResultsContainer) {
          trackResultsContainer.classList.add('hidden');
          trackResultsContainer.innerHTML = '';
        }
        if (drawerTitle) drawerTitle.textContent = "TRACK ORDER";
      });
    });

    if (trackBackToLoginBtn && userLoginView && userTrackView) {
      trackBackToLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        userTrackView.classList.add('hidden');
        userLoginView.classList.remove('hidden');
        if (drawerTitle) drawerTitle.textContent = "LOGIN";
      });
    }

    // Submit handler for guest tracking form
    if (userTrackForm) {
      userTrackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailVal = trackEmailInput ? trackEmailInput.value.trim().toLowerCase() : '';
        const orderIdVal = trackOrderIdInput ? trackOrderIdInput.value.trim() : '';

        if (trackErrorMsg) trackErrorMsg.classList.add('hidden');
        if (trackResultsContainer) {
          trackResultsContainer.classList.add('hidden');
          trackResultsContainer.innerHTML = '';
        }

        try {
          const response = await fetch('/api/orders/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailVal, orderId: orderIdVal })
          });
          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "No matching order found for this email and reference.");
          }
          const matchingOrder = await response.json();

          if (trackResultsContainer) {
            const itemsHtml = matchingOrder.items.map(item => `
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; font-size:0.7rem; border-bottom:1px solid #f2e2d9; padding-bottom:0.4rem;">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <img src="${item.image || 'assets/logo.png'}" style="width:30px; height:30px; object-fit:cover; border-radius:4px; border:1px solid var(--border-rose);">
                  <div style="text-align: left;">
                    <span style="font-weight:600; color:var(--text-primary);">${escapeHtml(item.productName)}</span><br>
                    <small style="color:var(--text-muted);">${item.metal !== 'none' ? item.metal : ''}</small>
                  </div>
                </div>
                <span style="color:var(--text-secondary);">Qty: ${item.quantity}</span>
              </div>
            `).join('');

            trackResultsContainer.innerHTML = `
              <div style="border: 1px solid var(--border-rose); padding: 1rem; background-color: var(--white-pure);">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.8rem; font-size:0.75rem; border-bottom:1px solid var(--border-rose); padding-bottom:0.5rem;">
                  <span style="color:var(--text-muted); font-weight:600;">Order Reference #000${matchingOrder.id}</span>
                  <span style="color:var(--accent-emerald); font-weight:700; text-transform:uppercase;">${matchingOrder.status}</span>
                </div>
                <div style="margin-bottom:0.8rem;">
                  ${itemsHtml}
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:600; color:var(--bg-maroon); text-align: left;">
                  <span>Total Amount Paid:</span>
                  <span>₹${(Number(matchingOrder.total_amount) || 0).toFixed(2)}</span>
                </div>
                <div style="margin-top:0.8rem; font-size:0.65rem; color:var(--text-muted); line-height:1.4; text-align: left;">
                  <strong>Shipping Address:</strong><br>
                  ${escapeHtml(matchingOrder.shipping_address).replace(/, PIN:/g, '<br>PIN:').replace(/, Phone:/g, '<br>Phone:')}
                </div>
              </div>
            `;
            trackResultsContainer.classList.remove('hidden');
          }
        } catch (err) {
          if (trackErrorMsg) {
            trackErrorMsg.textContent = err.message;
            trackErrorMsg.classList.remove('hidden');
          }
        }
      });
    }

    // Submit handler for Forgot Password form
    if (userForgotForm) {
      userForgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('forgot-email');
        const emailVal = emailInput ? emailInput.value.trim() : '';

        if (forgotErrorMsg) forgotErrorMsg.classList.add('hidden');
        if (forgotSuccessMsg) forgotSuccessMsg.classList.add('hidden');

        try {
          const response = await fetch(`${API_BASE}/api/customer/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailVal })
          });

          const data = await response.json();
          if (response.ok) {
            if (forgotSuccessMsg) {
              forgotSuccessMsg.textContent = data.message || "Reset link sent successfully.";
              forgotSuccessMsg.classList.remove('hidden');
            }
            if (emailInput) emailInput.value = '';
          } else {
            if (forgotErrorMsg) {
              forgotErrorMsg.textContent = data.error || "Failed to process request.";
              forgotErrorMsg.classList.remove('hidden');
            }
          }
        } catch (err) {
          console.error("Forgot password request failed:", err);
          if (forgotErrorMsg) {
            forgotErrorMsg.textContent = "Server error. Please try again later.";
            forgotErrorMsg.classList.remove('hidden');
          }
        }
      });
    }

    // User Account Login form submission
    if (userLoginForm) {
      userLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailVal = loginEmailInput.value.trim();
        const passwordVal = loginPasswordInput ? loginPasswordInput.value : '';
        
        if (loginErrorMsg) loginErrorMsg.classList.add('hidden');

        try {
          const response = await fetch(`${API_BASE}/api/customer/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailVal, password: passwordVal })
          });

          const data = await response.json();
          if (response.ok) {
            localStorage.setItem('manih_customer_email', data.email);
            localStorage.setItem('manih_customer_name', data.name);
            if (data.token) {
              localStorage.setItem('manih_customer_token', data.token);
            }
            checkUserLoginSession();
            if (userDrawer) userDrawer.classList.remove('active');
          } else {
            if (loginErrorMsg) {
              loginErrorMsg.textContent = data.error || 'Invalid credentials.';
              loginErrorMsg.classList.remove('hidden');
            }
          }
        } catch (err) {
          console.error('Login error:', err);
          if (loginErrorMsg) {
            loginErrorMsg.textContent = 'Server error. Please try again.';
            loginErrorMsg.classList.remove('hidden');
          }
        }
      });
    }

    // User Account Signup form submission
    if (userSignupForm) {
      userSignupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameVal = signupNameInput ? signupNameInput.value.trim() : '';
        const emailVal = signupEmailInput ? signupEmailInput.value.trim() : '';
        const passwordVal = signupPasswordInput ? signupPasswordInput.value : '';
        const phoneVal = signupPhoneInput ? signupPhoneInput.value.trim() : '';

        if (signupErrorMsg) signupErrorMsg.classList.add('hidden');

        try {
          const response = await fetch(`${API_BASE}/api/customer/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: nameVal,
              email: emailVal,
              password: passwordVal,
              phone: phoneVal
            })
          });

          const data = await response.json();
          if (response.ok) {
            localStorage.setItem('manih_customer_email', data.email);
            localStorage.setItem('manih_customer_name', data.name);
            if (data.token) {
              localStorage.setItem('manih_customer_token', data.token);
            }
            
            // Reset signup form
            userSignupForm.reset();
            
            // Switch view back to login view for subsequent uses
            if (userSignupView && userLoginView) {
              userSignupView.classList.add('hidden');
              userLoginView.classList.remove('hidden');
            }
            
            checkUserLoginSession();
            if (userDrawer) userDrawer.classList.remove('active');
          } else {
            if (signupErrorMsg) {
              signupErrorMsg.textContent = data.error || 'Registration failed.';
              signupErrorMsg.classList.remove('hidden');
            }
          }
        } catch (err) {
          console.error('Signup error:', err);
          if (signupErrorMsg) {
            signupErrorMsg.textContent = 'Server error. Please try again.';
            signupErrorMsg.classList.remove('hidden');
          }
        }
      });
    }

    // User Account Logout
    if (userLogoutBtn) {
      userLogoutBtn.addEventListener('click', () => {
        localStorage.removeItem('manih_customer_token');
        localStorage.removeItem('manih_customer_email');
        localStorage.removeItem('manih_customer_name');
        
        const drawerTitle = document.getElementById('user-drawer-title');
        if (drawerTitle) drawerTitle.textContent = "LOGIN";
        
        // Clear all inputs
        if (loginEmailInput) loginEmailInput.value = '';
        if (loginPasswordInput) loginPasswordInput.value = '';
        if (signupNameInput) signupNameInput.value = '';
        if (signupEmailInput) signupEmailInput.value = '';
        if (signupPasswordInput) signupPasswordInput.value = '';
        if (signupPhoneInput) signupPhoneInput.value = '';
        
        // Clear errors
        if (loginErrorMsg) loginErrorMsg.classList.add('hidden');
        if (signupErrorMsg) signupErrorMsg.classList.add('hidden');
        
        checkUserLoginSession();
      });
    }

    // Search Overlay triggers
    if (searchToggleBtn && searchOverlay) {
      searchToggleBtn.addEventListener('click', () => {
        searchOverlay.classList.add('active');
        if (overlaySearchInput) {
          overlaySearchInput.value = '';
          setTimeout(() => overlaySearchInput.focus(), 100);
        }
      });
      if (searchOverlayClose) {
        searchOverlayClose.addEventListener('click', () => searchOverlay.classList.remove('active'));
      }
      if (searchOverlayOverlay) {
        searchOverlayOverlay.addEventListener('click', () => searchOverlay.classList.remove('active'));
      }
    }

    if (overlaySearchInput) {
      overlaySearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          triggerGlobalSearch();
        }
      });
    }
    if (overlaySearchSubmitBtn) {
      overlaySearchSubmitBtn.addEventListener('click', triggerGlobalSearch);
    }

    // Header text-only category links behavior
    headerCategoryLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        const category = e.currentTarget.getAttribute('data-category');
        
        // If on the Shop Page, intercept clicks to filter dynamically without reload!
        if (window.location.pathname.toLowerCase().includes('shop.html')) {
          e.preventDefault();
          
          // Remove active classes from all header links and add to this one
          headerCategoryLinks.forEach(l => l.classList.remove('active'));
          e.currentTarget.classList.add('active');

          // Sync active category button in the catalog controls
          const catalogFilterBtn = document.querySelector(`.filter-btn[data-category='${category}']`);
          if (catalogFilterBtn) {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            catalogFilterBtn.classList.add('active');
          }
          
          filterCatalog();
        }
        // Otherwise, let the anchor tags navigate to shop.html?category=Name naturally!
      });
    });

    // Cart Drawer sliding triggers
    if (cartToggleBtn) cartToggleBtn.addEventListener('click', () => cartDrawer.classList.add('active'));
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', () => cartDrawer.classList.remove('active'));
    if (cartShopBtn) cartShopBtn.addEventListener('click', () => cartDrawer.classList.remove('active'));
    
    const cartOverlay = cartDrawer ? cartDrawer.querySelector('.cart-drawer-overlay') : null;
    if (cartOverlay) cartOverlay.addEventListener('click', () => cartDrawer.classList.remove('active'));

    // Wishlist Drawer sliding triggers
    if (wishlistToggleBtn) wishlistToggleBtn.addEventListener('click', () => wishlistDrawer.classList.add('active'));
    if (wishlistCloseBtn) wishlistCloseBtn.addEventListener('click', () => wishlistDrawer.classList.remove('active'));
    if (wishlistShopBtn) wishlistShopBtn.addEventListener('click', () => wishlistDrawer.classList.remove('active'));
    
    const wishlistOverlay = wishlistDrawer ? wishlistDrawer.querySelector('.wishlist-drawer-overlay') : null;
    if (wishlistOverlay) wishlistOverlay.addEventListener('click', () => wishlistDrawer.classList.remove('active'));

    // Checkout Panel Transitions (Slides drawer views)
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', async () => {
        // Disable button briefly during check
        checkoutBtn.disabled = true;
        const originalText = checkoutBtn.textContent;
        checkoutBtn.textContent = "Verifying Stock...";

        const isValid = await validateCartStockBeforeCheckout();

        checkoutBtn.disabled = false;
        checkoutBtn.textContent = originalText;

        if (isValid) {
          checkoutFormContainer.classList.remove('hidden');
        }
      });
    }
    if (backToCartBtn) {
      backToCartBtn.addEventListener('click', () => {
        checkoutFormContainer.classList.add('hidden');
      });
    }

    // Sandbox checkout inputs card masking
    const cardInput = document.getElementById('card-number');
    if (cardInput) {
      cardInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        let formatted = val.match(/.{1,4}/g);
        e.target.value = formatted ? formatted.join(' ') : '';
      });
    }

    const cardExpiryInput = document.getElementById('card-expiry');
    if (cardExpiryInput) {
      cardExpiryInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length >= 2) {
          e.target.value = val.slice(0, 2) + '/' + val.slice(2, 4);
        } else {
          e.target.value = val;
        }
      });
    }

    if (paymentForm) {
      paymentForm.addEventListener('submit', handleCheckoutPayment);
    }

    // Modal overlay close triggers
    document.querySelectorAll('.modal-overlay, .modal-close-btn').forEach(elem => {
      elem.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal) modal.classList.remove('active');
      });
    });

    if (receiptDoneBtn) {
      receiptDoneBtn.addEventListener('click', () => {
        receiptModal.classList.remove('active');
      });
    }

    // Toggle mobile menu dropdowns
    document.querySelectorAll('.dropdown-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const container = e.currentTarget.closest('.menu-dropdown-container');
        if (container) {
          container.classList.toggle('active');
          const expanded = container.classList.contains('active');
          e.currentTarget.setAttribute('aria-expanded', expanded);
        }
      });
    });

    // Wire home page reviews scroll buttons
    const reviewsPrev = document.getElementById('reviews-prev');
    const reviewsNext = document.getElementById('reviews-next');
    const homepageReviewsGrid = document.getElementById('homepage-reviews-grid');
    
    if (reviewsPrev && reviewsNext && homepageReviewsGrid) {
      reviewsPrev.addEventListener('click', () => {
        homepageReviewsGrid.scrollBy({ left: -homepageReviewsGrid.clientWidth, behavior: 'smooth' });
      });
      reviewsNext.addEventListener('click', () => {
        homepageReviewsGrid.scrollBy({ left: homepageReviewsGrid.clientWidth, behavior: 'smooth' });
      });
    }
  }

  function triggerGlobalSearch() {
    const overlaySearch = document.getElementById('overlay-search-input');
    const query = (overlaySearch ? overlaySearch.value : '').trim();
    
    // Hide overlay
    if (searchOverlay) {
      searchOverlay.classList.remove('active');
    }
    
    if (window.location.pathname.toLowerCase().includes('shop.html')) {
      // Already on Shop page, sync search box input and filter locally
      const catalogSearch = document.getElementById('catalog-search');
      if (catalogSearch) {
        catalogSearch.value = query;
      }
      filterCatalog();
    } else {
      // Redirect to shop page with search parameters
      window.location.href = `shop.html?search=${encodeURIComponent(query)}`;
    }
  }

  // --------------------------------------------------------------------------
  // 9. Home Page Specific Initializations (`index.html`)
  // --------------------------------------------------------------------------
  async function initHomePage() {
    // Redirection links for Home Page Category Cards
    document.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const category = e.currentTarget.getAttribute('data-category');
        window.location.href = `shop.html?category=${encodeURIComponent(category)}`;
      });
    });

    // --- Premium Banner Carousel Engine ---
    const sliderContainer = document.getElementById('slider-container');
    const sliderDots = document.getElementById('slider-dots');
    const prevBtn = document.getElementById('slider-prev');
    const nextBtn = document.getElementById('slider-next');

    if (!sliderContainer) return;

    let slidesData = [];
    let currentSlideIndex = 0;
    let autoScrollInterval = null;

    async function loadBanners() {
      try {
        const response = await fetch(`${API_BASE}/api/banners`);
        if (!response.ok) throw new Error('Failed to load home banners.');
        slidesData = await response.json();
        
        if (slidesData.length === 0) {
          sliderContainer.innerHTML = `
            <div style="color: #fff; padding: 10rem 2rem; text-align: center; width: 100%;">
              <h2 style="font-family: var(--font-display); color: #fff; margin-bottom: 1rem;">Welcome to Manih Jewelz</h2>
              <p>Discover our handcrafted Indian jewelry collections.</p>
              <a href="shop.html" class="btn btn-primary" style="margin-top: 2rem;">Shop Collections</a>
            </div>
          `;
          if (prevBtn) prevBtn.style.display = 'none';
          if (nextBtn) nextBtn.style.display = 'none';
          return;
        }

        renderSlides();
        startAutoScroll();
      } catch (error) {
        console.error('Error loading banners:', error);
        sliderContainer.innerHTML = `
          <div style="color: #fff; padding: 10rem 2rem; text-align: center; width: 100%;">
            <p>Unable to load spotlight gallery. Please verify server connection.</p>
          </div>
        `;
      }
    }

    function renderSlides() {
      // Render slides HTML
      sliderContainer.innerHTML = slidesData.map((slide, index) => {
        const title = slide.title || 'Manih Jewelz';
        const description = slide.subtitle || 'Affordable handcrafted luxury designed to elevate your celebrations.';
        const linkUrl = slide.link_url || 'shop.html';
        const imageUrl = slide.image_url || 'assets/hero_bg.png';
        const slideSubtitleText = "Celebrity Spotlight";
        
        const bgSize = slide.bg_size || 'cover';
        const bgPosition = slide.bg_position || 'center';

        if (bgSize === 'contain') {
          return `
            <div class="slider-slide slider-slide-contain ${index === 0 ? 'active' : ''}" data-index="${index}">
              <div class="slide-blur-bg" style="background-image: url('${imageUrl}');"></div>
              <div class="slide-fg-img-container">
                <img src="${imageUrl}" alt="${title}" class="slide-fg-img" style="object-position: ${bgPosition};">
              </div>
              <div class="slider-overlay"></div>
              <div class="slider-content">
                <p class="slider-subtitle">${slideSubtitleText}</p>
                <h1 class="slider-title">${title}</h1>
                <div class="slider-buttons">
                  <a href="${linkUrl}" class="btn btn-primary">Shop Now</a>
                </div>
              </div>
            </div>
          `;
        } else {
          return `
            <div class="slider-slide ${index === 0 ? 'active' : ''}" style="background-image: url('${imageUrl}'); background-size: ${bgSize}; background-position: ${bgPosition};" data-index="${index}">
              <div class="slider-overlay"></div>
              <div class="slider-content">
                <p class="slider-subtitle">${slideSubtitleText}</p>
                <h1 class="slider-title">${title}</h1>
                <div class="slider-buttons">
                  <a href="${linkUrl}" class="btn btn-primary">Shop Now</a>
                </div>
              </div>
            </div>
          `;
        }
      }).join('');



      // Render dot indicators
      if (sliderDots) {
        sliderDots.innerHTML = slidesData.map((_, index) => `
          <button class="slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Go to slide ${index + 1}"></button>
        `).join('');

        // Wire dot click events
        sliderDots.querySelectorAll('.slider-dot').forEach(dot => {
          dot.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            goToSlide(index);
            resetAutoScroll();
          });
        });
      }
    }

    function goToSlide(index) {
      const slides = sliderContainer.querySelectorAll('.slider-slide');
      const dots = sliderDots ? sliderDots.querySelectorAll('.slider-dot') : [];

      if (slides.length === 0) return;

      // Wrap-around boundaries
      if (index >= slides.length) {
        currentSlideIndex = 0;
      } else if (index < 0) {
        currentSlideIndex = slides.length - 1;
      } else {
        currentSlideIndex = index;
      }

      // Toggle active states
      slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === currentSlideIndex);
      });

      dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === currentSlideIndex);
      });
    }

    function nextSlide() {
      goToSlide(currentSlideIndex + 1);
    }

    function prevSlide() {
      goToSlide(currentSlideIndex - 1);
    }

    function startAutoScroll() {
      if (slidesData.length <= 1) return;
      autoScrollInterval = setInterval(nextSlide, 5000); // 5 seconds auto scroll
    }

    function resetAutoScroll() {
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        startAutoScroll();
      }
    }

    // Wire Arrow events
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        prevSlide();
        resetAutoScroll();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        nextSlide();
        resetAutoScroll();
      });
    }

    // Add touch swipe support for mobile devices
    let touchStartX = 0;
    let touchEndX = 0;

    sliderContainer.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    sliderContainer.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const swipeThreshold = 50;
      const diffX = touchStartX - touchEndX;

      if (Math.abs(diffX) > swipeThreshold) {
        if (diffX > 0) {
          nextSlide(); // Swipe left -> Next slide
        } else {
          prevSlide(); // Swipe right -> Previous slide
        }
        resetAutoScroll();
      }
    }, { passive: true });

    // Initialize banner load
    loadBanners();
    loadHeritageSection();
    loadHomepageReviews();
    loadInstagramFeed();

    async function loadHeritageSection() {
      try {
        const response = await fetch(`${API_BASE}/api/heritage`);
        if (!response.ok) throw new Error('Failed to load story settings.');
        const data = await response.json();

        const subtitleEl = document.getElementById('heritage-subtitle');
        const titleEl = document.getElementById('heritage-title');
        const paragraphsEl = document.getElementById('heritage-paragraphs');
        const imgEl = document.getElementById('heritage-img');

        if (subtitleEl) subtitleEl.textContent = data.subtitle || 'CRAFTING STORIES';
        if (titleEl) titleEl.textContent = data.title || 'Affordable Luxury, Uncompromised.';
        if (paragraphsEl) {
          paragraphsEl.innerHTML = `
            <p class="heritage-desc" style="margin-bottom:1.5rem; line-height:1.7; font-size:0.85rem; color:var(--text-secondary);">${data.desc1 || ''}</p>
            <p class="heritage-desc" style="line-height:1.7; font-size:0.85rem; color:var(--text-secondary);">${data.desc2 || ''}</p>
          `;
        }
        if (imgEl) {
          const bgImg = data.image_url || 'assets/logo.png';
          imgEl.style.backgroundImage = `url('${bgImg}')`;
        }
      } catch (err) {
        console.error('Error loading heritage section:', err);
      }
    }

    async function loadHomepageReviews() {
      const reviewsGrid = document.getElementById('homepage-reviews-grid');
      if (!reviewsGrid) return;

      try {
        const response = await fetch(`${API_BASE}/api/reviews`);
        if (!response.ok) throw new Error('Failed to load reviews.');
        const reviewsData = await response.json();

        if (reviewsData.length === 0) {
          const placeholders = [
            { rating: 5, review_text: "Awaiting your beautiful experience. Share your thoughts with us!", author_name: "Customer Review", author_location: "Verified Buyer" },
            { rating: 5, review_text: "Your feedback will appear here. Add new testimonials from the administrative panel.", author_name: "Customer Review", author_location: "Verified Buyer" },
            { rating: 5, review_text: "Love our handcrafted Indian jewelry? Let us know and we will feature you here!", author_name: "Customer Review", author_location: "Verified Buyer" }
          ];
          reviewsGrid.innerHTML = placeholders.map(r => {
            const starsHtml = '<i class="fa-solid fa-star" style="color: var(--rose-gold-warm);"></i>'.repeat(r.rating);
            return `
              <div class="review-card" style="opacity: 0.65; border: 1px dashed var(--border-rose);">
                <div class="review-stars">
                  ${starsHtml}
                </div>
                <p class="review-text" style="font-style: italic;">"${r.review_text}"</p>
                <div class="review-author">
                  <span class="author-name">${r.author_name}</span>
                  <span class="author-location">${r.author_location}</span>
                </div>
              </div>
            `;
          }).join('');
          return;
        }

        reviewsGrid.innerHTML = reviewsData.map(r => {
          const starsHtml = '<i class="fa-solid fa-star"></i>'.repeat(r.rating) + '<i class="fa-regular fa-star"></i>'.repeat(5 - r.rating);
          return `
            <div class="review-card">
              <div class="review-stars">
                ${starsHtml}
              </div>
              <p class="review-text">"${escapeHtml(r.review_text)}"</p>
              <div class="review-author">
                <span class="author-name">${escapeHtml(r.author_name)}</span>
                <span class="author-location">${escapeHtml(r.author_location) || 'Verified Buyer'}</span>
              </div>
            </div>
          `;
        }).join('');
      } catch (err) {
        console.error('Error loading reviews:', err);
        reviewsGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">
            <p style="font-size: 0.85rem;">Unable to load customer testimonials at this time.</p>
          </div>
        `;
      }
    }

    async function loadInstagramFeed() {
      const instaGrid = document.getElementById('homepage-instagram-grid');
      if (!instaGrid) return;

      try {
        const response = await fetch(`${API_BASE}/api/instagram`);
        if (!response.ok) throw new Error('Failed to load Instagram feed.');
        const feedData = await response.json();

        if (feedData.length === 0) {
          instaGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">
              <p style="font-size: 0.85rem;">No Instagram posts added to spotlight feed.</p>
            </div>
          `;
          return;
        }

        instaGrid.innerHTML = feedData.map(post => `
          <div class="instagram-post" onclick="window.open('${post.post_url || 'https://instagram.com/manih_jewelz'}', '_blank')">
            <div class="instagram-post-img" style="background-image: url('${post.image_url}');"></div>
            <div class="instagram-post-hover">
              <i class="fa-brands fa-instagram"></i>
            </div>
          </div>
        `).join('');
      } catch (err) {
        console.error('Error loading Instagram feed:', err);
        instaGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">
            <p style="font-size: 0.85rem;">Unable to load Instagram feed at this time.</p>
          </div>
        `;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 10. Shop Page Specific Initializations (`shop.html`)
  // --------------------------------------------------------------------------
  function initShopPage() {
    const catalogSearch = document.getElementById('catalog-search');
    const catalogCategoryFilters = document.getElementById('category-filters');

    // 1. Initial render from loaded inventory
    filterCatalogOnLoad();

    // 2. Wire local catalog search filters
    if (catalogSearch) {
      catalogSearch.addEventListener('input', () => {
        // Sync overlay search input value
        const oSearch = document.getElementById('overlay-search-input');
        if (oSearch) {
          oSearch.value = catalogSearch.value;
        }
        filterCatalog();
      });
    }

    // 3. Wire local category filter buttons
    if (catalogCategoryFilters) {
      catalogCategoryFilters.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          catalogCategoryFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          
          // Sync header category links active styling
          const category = e.target.getAttribute('data-category');
          headerCategoryLinks.forEach(link => {
            const linkCat = link.getAttribute('data-category');
            link.classList.toggle('active', linkCat === category);
          });

          filterCatalog();
        });
      });
    }
  }

  // Parses parameters on page load to apply pre-deep-linked filters
  function filterCatalogOnLoad() {
    const params = new URLSearchParams(window.location.search);
    const categoryParam = params.get('category');
    const searchParam = params.get('search');

    const catalogCategoryFilters = document.getElementById('category-filters');
    const catalogSearch = document.getElementById('catalog-search');
    const shopPageTitle = document.getElementById('shop-page-title');

    let activeCategory = 'all';

    if (categoryParam) {
      activeCategory = categoryParam;
      
      // Update catalog filter buttons
      if (catalogCategoryFilters) {
        catalogCategoryFilters.querySelectorAll('.filter-btn').forEach(btn => {
          const btnCat = btn.getAttribute('data-category');
          btn.classList.toggle('active', btnCat === activeCategory);
        });
      }

      // Update header category links active states
      headerCategoryLinks.forEach(link => {
        const linkCat = link.getAttribute('data-category');
        link.classList.toggle('active', linkCat === activeCategory);
      });

      // Update banner title to display selected collection
      if (shopPageTitle) {
        shopPageTitle.textContent = activeCategory;
      }
    }

    if (searchParam) {
      const decodedSearch = decodeURIComponent(searchParam);
      if (catalogSearch) catalogSearch.value = decodedSearch;
      if (overlaySearchInput) overlaySearchInput.value = decodedSearch;
    }

    filterCatalog();
  }

  // Filter products locally and render catalog cards
  function filterCatalog() {
    const catalogGrid = document.getElementById('catalog-grid');
    if (!catalogGrid) return;

    const activeCategoryBtn = document.querySelector('.filter-btn.active');
    const activeCategory = activeCategoryBtn ? activeCategoryBtn.getAttribute('data-category') : 'all';
    
    const catalogSearch = document.getElementById('catalog-search');
    const searchQuery = (catalogSearch ? catalogSearch.value : '').toLowerCase().trim();

    let filtered = products;

    if (activeCategory !== 'all') {
      if (activeCategory === 'Earrings') {
        const earringsCategories = ['Earrings', 'Antitarnish', 'Ethnic', 'Earcuff', 'Kashmiri Earrings', 'Meenakari Jhumkas'];
        filtered = filtered.filter(p => earringsCategories.includes(p.category));
      } else {
        filtered = filtered.filter(p => p.category === activeCategory);
      }
    }

    if (searchQuery !== '') {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchQuery) || 
        p.description.toLowerCase().includes(searchQuery) ||
        p.category.toLowerCase().includes(searchQuery) ||
        (p.product_code && p.product_code.toLowerCase().includes(searchQuery))
      );
    }

    renderCatalog(filtered);
  }

  // Render product grid
  function renderCatalog(items) {
    const catalogGrid = document.getElementById('catalog-grid');
    if (!catalogGrid) return;

    if (items.length === 0) {
      catalogGrid.innerHTML = `
        <div class="loading-spinner-container" style="padding: 5rem 0;">
          <i class="fa-solid fa-gem" style="font-size: 2rem; color: var(--rose-gold-warm);"></i>
          <p>No creations match your selection.</p>
        </div>
      `;
      return;
    }

    catalogGrid.innerHTML = items.map(item => {
      const isOutOfStock = item.stock <= 0;
      
      let badgeHTML = '';
      if (isOutOfStock) {
        badgeHTML = `<div class="product-badge-stock">Sold Out</div>`;
      }

      const firstImg = (Array.isArray(item.images) && item.images.length > 0) ? item.images[0] : 'assets/logo.png';
      const isLiked = wishlist.some(w => w.id === item.id);

      return `
        <div class="product-card">
          <div class="product-card-image">
            ${badgeHTML}
            <button class="wishlist-card-btn ${isLiked ? 'active' : ''}" data-id="${item.id}" aria-label="Toggle Wishlist">
              <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
            </button>
            <a href="product.html?id=${item.id}">
              <img src="${firstImg}" alt="${item.name}">
            </a>
          </div>
          <div class="product-card-content">
            <span class="product-card-category">${item.category}</span>
            <a href="product.html?id=${item.id}">
              <h3 class="product-card-title">${item.name}</h3>
            </a>
            <p class="product-card-price">
              ${item.discount_price && item.discount_price < item.base_price ? `
                <span class="price-discount" style="color: ${isOutOfStock ? '#b0b0b0' : 'var(--bg-maroon)'}; font-weight: 600;">₹${item.discount_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span class="price-original" style="text-decoration: line-through; color: var(--text-muted); font-size: 0.8em; margin-left: 0.5rem; font-weight: normal;">₹${item.base_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              ` : `
                <span style="color: ${isOutOfStock ? '#b0b0b0' : 'inherit'};">₹${item.base_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              `}
              ${isOutOfStock ? `<span style="font-size: 0.7rem; color: #a81c2f; font-weight: bold; margin-left: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">(Sold Out)</span>` : ''}
            </p>
            ${isOutOfStock ? `
              <a href="product.html?id=${item.id}" class="btn btn-block explore-piece-btn" style="background-color: #f5f5f5; color: #b0b0b0; border: 1px solid #e0e0e0; pointer-events: auto; text-align: center; text-decoration: line-through;">Sold Out</a>
            ` : `
              <a href="product.html?id=${item.id}" class="btn btn-secondary btn-block explore-piece-btn">View Product</a>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Attach card wishlist click events
    catalogGrid.querySelectorAll('.wishlist-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        toggleWishlist(id);
      });
    });
  }

  // --------------------------------------------------------------------------
  // 11. Dedicated Product Detail Page Specifics (`product.html`)
  // --------------------------------------------------------------------------
  function initProductDetailPage() {
    const params = new URLSearchParams(window.location.search);
    const productId = parseInt(params.get('id'));
    const container = document.getElementById('product-detail-container');

    if (!container) return;

    if (isNaN(productId)) {
      renderProductNotFound(container);
      return;
    }

    const item = products.find(p => p.id === productId);
    if (!item) {
      renderProductNotFound(container);
      return;
    }

    renderProductDetail(container, item);
  }

  function renderProductNotFound(container) {
    container.innerHTML = `
      <div class="loading-spinner-container" style="padding: 8rem 0; text-align: center;">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 3rem; color: var(--accent-ruby); margin-bottom: 1.5rem;"></i>
        <h2 style="font-family: var(--font-display); font-size: 1.8rem; margin-bottom: 1rem;">Creation Not Found</h2>
        <p style="color: var(--text-secondary); max-width: 500px; margin: 0 auto 2rem;">
          The piece you are seeking does not exist or has been archived from our collection.
        </p>
        <a href="shop.html" class="btn btn-primary">Browse</a>
      </div>
    `;
  }

  function renderProductDetail(container, item) {
    // Page Title alignment
    document.title = `${item.name} | Manih Jewelz`;

    const availableMetals = (item.metal_options && item.metal_options !== 'none') 
      ? item.metal_options.toLowerCase().split(',') 
      : [];

    let firstInStockMetal = '';
    for (let m of availableMetals) {
      const cleanM = m.trim().toLowerCase();
      if (cleanM === 'golden' && item.gold_stock > 0) {
        firstInStockMetal = 'Golden';
        break;
      }
      if (cleanM === 'silver' && item.silver_stock > 0) {
        firstInStockMetal = 'Silver';
        break;
      }
    }

    const isOutOfStock = (item.metal_options && item.metal_options !== 'none')
      ? (firstInStockMetal === '')
      : (item.stock <= 0);

    const isLiked = wishlist.some(w => w.id === item.id);
    const primaryImg = (Array.isArray(item.images) && item.images.length > 0) ? item.images[0] : 'assets/logo.png';

    // Render specifications rows
    const specsHTML = Object.entries(item.specs).map(([key, val]) => `
      <div class="spec-row">
        <span>${key}:</span>
        <strong>${val}</strong>
      </div>
    `).join('');

    // Render gallery thumbnails
    let galleryHTML = '';
    if (Array.isArray(item.images) && item.images.length > 1) {
      galleryHTML = `
        <div class="product-gallery-thumbnails" style="display: flex; gap: 0.6rem; margin-top: 1rem; flex-wrap: wrap;">
          ${item.images.map((img, idx) => `
            <div class="modal-thumbnail ${idx === 0 ? 'active' : ''}" data-src="${img}">
              <img src="${img}" alt="${item.name} Angle ${idx + 1}">
            </div>
          `).join('')}
        </div>
      `;
    }

    let metalSelectorHTML = '';
    if (availableMetals.length > 0) {
      metalSelectorHTML = `
        <div class="metal-selection-group" style="margin-top: 1.5rem; margin-bottom: 1rem;">
          <label style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-primary); margin-bottom: 0.5rem; display: block;">
            Select Polish:
          </label>
          <div style="display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap;">
            ${availableMetals.map((m) => {
              const labelText = m.trim().toLowerCase() === 'golden' ? 'Golden' : 'Silver';
              const isValOut = (labelText === 'Golden' && item.gold_stock <= 0) || (labelText === 'Silver' && item.silver_stock <= 0);
              const isChecked = labelText === firstInStockMetal;

              let labelStyle = `display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.6rem 1rem; border: 1px solid var(--border-rose); border-radius: 4px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.3s ease;`;
              if (isValOut) {
                labelStyle += ` background-color: #f5f5f5; color: #b0b0b0; text-decoration: line-through; cursor: not-allowed; border-color: #e0e0e0;`;
              } else if (isChecked) {
                labelStyle += ` background-color: var(--bg-maroon); color: #fff;`;
              } else {
                labelStyle += ` background-color: var(--cream-ivory); color: var(--text-primary);`;
              }

              return `
                <label class="metal-option-label" ${isValOut ? '' : 'data-active="true"'} style="${labelStyle}">
                  <input type="radio" name="metal-choice" value="${labelText}" ${isChecked ? 'checked' : ''} ${isValOut ? 'disabled' : ''} style="display: none;">
                  <span>${labelText}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Assemble dynamic detail page markup
    container.innerHTML = `
      <!-- Breadcrumb Link -->
      <div class="product-breadcrumb" style="padding: 1.5rem 0; font-size: 0.75rem; color: var(--text-secondary); display: flex; gap: 0.5rem; align-items: center;">
        <a href="index.html" style="color: var(--rose-gold-warm);">Home</a>
        <i class="fa-solid fa-chevron-right" style="font-size: 0.6rem; color: var(--text-muted);"></i>
        <a href="shop.html" style="color: var(--rose-gold-warm);">Collections</a>
        <i class="fa-solid fa-chevron-right" style="font-size: 0.6rem; color: var(--text-muted);"></i>
        <a href="shop.html?category=${encodeURIComponent(item.category)}" style="color: var(--rose-gold-warm);">${item.category}</a>
        <i class="fa-solid fa-chevron-right" style="font-size: 0.6rem; color: var(--text-muted);"></i>
        <span style="color: var(--text-primary); font-weight: 500;">${item.name}</span>
      </div>

      <div class="product-detail-grid" style="margin-bottom: 3rem;">
        <!-- Left Column: Visuals Showcase -->
        <div class="product-detail-visual-wrapper" style="display: flex; flex-direction: column;">
          <div class="product-detail-visual">
            <img id="main-product-img" src="${primaryImg}" alt="${item.name}">
          </div>
          ${galleryHTML}
        </div>

        <!-- Right Column: Metadata & Checkout Interactions -->
        <div class="product-detail-meta">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span class="detail-category">${item.category} ${item.product_code ? `| Code: ${item.product_code}` : ''}</span>
            <button id="detail-wishlist-toggle" class="wishlist-card-btn ${isLiked ? 'active' : ''}" data-id="${item.id}" style="position:static;">
              <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
            </button>
          </div>
          <h2 class="detail-title" style="font-size: 2.2rem; margin-bottom: 0.75rem;">${item.name}</h2>
          <div class="detail-price" style="font-size: 1.6rem; color: var(--bg-maroon); font-family: var(--font-body); margin-bottom: 1.5rem; display: flex; gap: 0.8rem; align-items: baseline;">
            ${item.discount_price && item.discount_price < item.base_price ? `
              <span style="font-weight: 600; color: var(--bg-maroon);">₹${item.discount_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span style="text-decoration: line-through; color: var(--text-muted); font-size: 1.1rem; font-weight: normal;">₹${item.base_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            ` : `
              <span style="font-weight: 600; color: var(--bg-maroon);">₹${item.base_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            `}
          </div>
          <p class="detail-desc" style="font-size: 0.88rem; line-height: 1.7; color: var(--text-secondary); margin-bottom: 2rem;">
            ${item.description}
          </p>
          
          <hr class="divider">
          
          <div class="specifications-panel">
            ${specsHTML}
            <div class="spec-row">
              <span>Availability:</span>
              <strong style="color: ${isOutOfStock ? 'var(--accent-ruby)' : 'var(--accent-emerald)'}">
                ${isOutOfStock ? 'Sold Out' : `In Stock (${item.stock} available)`}
              </strong>
            </div>
          </div>

          ${metalSelectorHTML}

          <!-- Quantity Selector & Cart CTA -->
          ${isOutOfStock ? `
            <div style="margin-top: 1.5rem; text-align: center;">
              <button id="restock-request-submit-btn" class="btn btn-primary" style="width: 100%; height: 52px; background-color: var(--bg-maroon); border-color: var(--bg-maroon);">
                Request Restock
              </button>
              <p id="restock-message" style="font-size: 0.75rem; margin-top: 0.5rem; display: none; font-weight: 500; text-align: center;"></p>
            </div>
          ` : `
            <div class="product-purchase-controls" style="display: flex; gap: 1rem; align-items: center; margin-top: 1.5rem;">
              <div class="qty-editor" style="height: 52px; padding: 0 1rem; background-color: var(--cream-ivory); border: 1px solid var(--border-rose); display: flex; align-items: center; gap: 1rem;">
                <button class="qty-btn" id="prod-qty-minus" style="background: none; border: none; cursor: pointer; color: var(--bg-maroon);"><i class="fa-solid fa-minus"></i></button>
                <span class="qty-value" id="prod-qty-val" style="font-weight: 600; font-size: 0.9rem; min-width: 20px; text-align: center;">1</span>
                <button class="qty-btn" id="prod-qty-plus" style="background: none; border: none; cursor: pointer; color: var(--bg-maroon);"><i class="fa-solid fa-plus"></i></button>
              </div>
              
              <button id="product-add-to-cart-btn" class="btn btn-primary" style="flex-grow: 1; height: 52px;">
                Shop Now
              </button>
            </div>
          `}

          <!-- Shipping & Returns Policy Details -->
          <div class="policy-details-box" style="margin-top: 2rem; border-top: 1px dashed var(--border-rose); padding-top: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
            <div style="display: flex; gap: 0.8rem; align-items: flex-start;">
              <div style="background-color: var(--cream-ivory); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="fa-solid fa-truck" style="color: var(--bg-maroon); font-size: 0.75rem;"></i>
              </div>
              <div>
                <h5 style="margin: 0 0 0.2rem; font-family: var(--font-display); font-size: 0.8rem; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px;">Shipping & Delivery</h5>
                <p style="margin: 0; font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5;">Flat shipping of <strong>₹50.00</strong> across India. Delivered within 2–5 days for Metro cities and 4–8 days for non-metro areas.</p>
              </div>
            </div>
            
            <div style="display: flex; gap: 0.8rem; align-items: flex-start;">
              <div style="background-color: var(--cream-ivory); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="fa-solid fa-rotate-left" style="color: var(--bg-maroon); font-size: 0.75rem;"></i>
              </div>
              <div>
                <h5 style="margin: 0 0 0.2rem; font-family: var(--font-display); font-size: 0.8rem; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px;">Returns & Refunds</h5>
                <p style="margin: 0; font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5;">Returns accepted <strong>only for damaged products</strong> reported within 48 hours of delivery. A continuous, unedited unboxing video is required to approve claims.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <hr class="divider">

      <!-- Dynamic Customer Reviews Deck Section -->
      <section class="reviews-deck-section" id="product-reviews-section" style="padding: 3rem 0;">
        <!-- Filled dynamically -->
      </section>

      <hr class="divider">

      <!-- Similar Products Recommendation Section -->
      <section class="similar-products-section" id="similar-products-section" style="padding: 3rem 0 1rem;">
        <!-- Filled dynamically -->
      </section>
    `;

    // 1. Wire Gallery Image Swapping
    if (Array.isArray(item.images) && item.images.length > 1) {
      const thumbnails = container.querySelectorAll('.modal-thumbnail');
      const mainImg = document.getElementById('main-product-img');
      
      thumbnails.forEach(thumb => {
        thumb.addEventListener('click', (e) => {
          thumbnails.forEach(t => t.classList.remove('active'));
          
          const targetThumb = e.currentTarget;
          targetThumb.classList.add('active');
          
          const newSrc = targetThumb.getAttribute('data-src');
          if (mainImg) {
            mainImg.style.opacity = '0.3';
            setTimeout(() => {
              mainImg.src = newSrc;
              mainImg.style.opacity = '1';
            }, 150);
          }
        });
      });
    }

    // 2. Wire Quantity Controls
    const qtyMinusBtn = document.getElementById('prod-qty-minus');
    const qtyPlusBtn = document.getElementById('prod-qty-plus');
    const qtyValEl = document.getElementById('prod-qty-val');
    let chosenQuantity = 1;

    if (qtyMinusBtn && qtyPlusBtn && qtyValEl) {
      qtyMinusBtn.addEventListener('click', () => {
        if (chosenQuantity > 1) {
          chosenQuantity--;
          qtyValEl.textContent = chosenQuantity;
        }
      });
      qtyPlusBtn.addEventListener('click', () => {
        if (chosenQuantity < item.stock) {
          chosenQuantity++;
          qtyValEl.textContent = chosenQuantity;
        }
      });
    }

    // 2.5 Wire Metal Option Radio Click Selection
    const metalLabels = container.querySelectorAll('.metal-option-label');
    metalLabels.forEach(label => {
      label.addEventListener('click', (e) => {
        const clickedLabel = e.currentTarget;
        if (!clickedLabel.hasAttribute('data-active')) return; // Ignore if out of stock

        metalLabels.forEach(lbl => {
          if (lbl.hasAttribute('data-active')) {
            lbl.style.backgroundColor = 'var(--cream-ivory)';
            lbl.style.color = 'var(--text-primary)';
          }
          const input = lbl.querySelector('input');
          if (input) input.checked = false;
        });

        clickedLabel.style.backgroundColor = 'var(--bg-maroon)';
        clickedLabel.style.color = '#fff';
        const clickedInput = clickedLabel.querySelector('input');
        if (clickedInput) clickedInput.checked = true;
      });
    });

    // 3. Wire Cart Addition Button
    const addBagBtn = document.getElementById('product-add-to-cart-btn');
    if (addBagBtn) {
      addBagBtn.addEventListener('click', () => {
        const finalPrice = (item.discount_price && item.discount_price < item.base_price) ? item.discount_price : item.base_price;
        const checkedMetalChoice = container.querySelector('input[name="metal-choice"]:checked');
        const selectedMetal = checkedMetalChoice ? checkedMetalChoice.value : 'Standard Polish';
        
        addToCart(item.id, item.name, finalPrice, selectedMetal, "None", primaryImg, chosenQuantity);
        cartDrawer.classList.add('active');
      });
    }

    // 3.5 Wire Restock Request Button if present
    const restockBtn = document.getElementById('restock-request-submit-btn');
    if (restockBtn) {
      restockBtn.addEventListener('click', async () => {
        const messagePara = document.getElementById('restock-message');
        if (!messagePara) return;

        const customerEmail = localStorage.getItem('manih_customer_email');
        const customerName = localStorage.getItem('manih_customer_name') || (customerEmail ? customerEmail.split('@')[0] : '');

        if (!customerEmail) {
          messagePara.style.color = 'var(--accent-ruby)';
          messagePara.textContent = 'Please log in to request a restock.';
          messagePara.style.display = 'block';
          
          // Open the login drawer
          const userDrawer = document.getElementById('user-drawer');
          if (userDrawer) userDrawer.classList.add('active');
          return;
        }

        restockBtn.disabled = true;
        restockBtn.textContent = 'Submitting Request...';

        try {
          const response = await fetch(`${API_BASE}/api/restock-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: item.id,
              productName: item.name,
              customerName: customerName,
              customerEmail: customerEmail
            })
          });
          const result = await response.json();
          if (response.ok && result.success) {
            messagePara.style.color = 'var(--accent-emerald)';
            messagePara.textContent = 'Success! Your restock request has been recorded.';
          } else {
            messagePara.style.color = 'var(--accent-ruby)';
            messagePara.textContent = result.error || 'Failed to submit restock request. Please try again.';
          }
        } catch (err) {
          console.error("Restock request error:", err);
          messagePara.style.color = 'var(--accent-ruby)';
          messagePara.textContent = 'Connection error. Please try again.';
        } finally {
          messagePara.style.display = 'block';
          restockBtn.disabled = false;
          restockBtn.textContent = 'Request Restock';
        }
      });
    }

    // 4. Wire Wishlist Heart Button
    const wishlistBtn = document.getElementById('detail-wishlist-toggle');
    if (wishlistBtn) {
      wishlistBtn.addEventListener('click', () => {
        toggleWishlist(item.id);
      });
    }

    // 5. Initialize Reviews Deck
    renderReviewsDeck(item.id);

    // 6. Initialize Recommended Similar Products
    renderSimilarProducts(item);
  }

  // --------------------------------------------------------------------------
  // 12. Interactive Customer Reviews Deck Engine
  // --------------------------------------------------------------------------
  function renderReviewsDeck(productId) {
    const container = document.getElementById('product-reviews-section');
    if (!container) return;

    // Load mock reviews + user reviews from localStorage
    const defaultReviews = MOCK_REVIEWS[productId] || [];
    const customReviews = JSON.parse(localStorage.getItem(`manih_custom_reviews_${productId}`)) || [];
    const allReviews = [...customReviews, ...defaultReviews];

    // Compute average stars
    const avgRating = allReviews.length > 0 
      ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(1)
      : "5.0";

    // Reviews list HTML cards
    const reviewsListHTML = allReviews.length === 0
      ? `<p style="color: var(--text-secondary); font-style: italic; margin-top: 1rem;">No reviews have been written for this masterpiece yet. Be the first to share your thoughts.</p>`
      : allReviews.map(r => `
          <div class="review-card" style="background-color: var(--cream-ivory); border: 1px solid var(--border-rose); padding: 1.5rem; margin-bottom: 1rem; border-radius: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <strong style="color: var(--bg-maroon); font-size: 0.9rem;">${r.name}</strong>
              <span style="font-size: 0.7rem; color: var(--text-muted);">${r.date}</span>
            </div>
            <div style="color: #D4A373; font-size: 0.75rem; margin-bottom: 0.75rem;">
              ${Array.from({ length: 5 }, (_, i) => `<i class="${i < r.rating ? 'fa-solid' : 'fa-regular'} fa-star"></i>`).join('')}
            </div>
            <p style="font-size: 0.82rem; line-height: 1.6; color: var(--text-secondary); margin: 0;">"${r.text}"</p>
          </div>
        `).join('');

    container.innerHTML = `
      <div class="section-header" style="text-align: left; margin-bottom: 2rem;">
        <p class="section-subtitle">CUSTOMER REVIEWS</p>
        <h3 class="section-title" style="font-size: 1.8rem; margin-bottom: 0.5rem;">Client Testimonials</h3>
        <p style="font-size:0.85rem; color: var(--text-secondary);">
          Average Rating: <strong style="color: var(--bg-maroon);">${avgRating} / 5.0</strong> stars (${allReviews.length} reviews)
        </p>
      </div>

      <div class="reviews-split-grid" style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 3rem; align-items: start;">
        <!-- Left: Write Review Form Card -->
        <div class="review-form-card" style="background-color: var(--white-pure); border: 1px solid var(--border-rose); padding: 2rem;">
          <h4 style="font-family: var(--font-display); font-size: 1.1rem; color: var(--bg-maroon); margin-bottom: 1rem;">Share Your Experience</h4>
          <form id="product-review-form">
            <div class="form-group" style="margin-bottom: 1rem;">
              <input type="text" id="review-name" placeholder="Your Full Name" required style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-rose); font-family: var(--font-body); font-size: 0.8rem;">
            </div>
            
            <!-- Interactive Star Picker -->
            <div class="form-group" style="margin-bottom: 1.25rem;">
              <label style="display: block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Your Rating:</label>
              <div class="review-stars-interactive" id="review-stars-picker" style="display: flex; gap: 0.4rem; font-size: 1.25rem; color: var(--text-muted); cursor: pointer;">
                <i class="fa-regular fa-star star-btn" data-rating="1"></i>
                <i class="fa-regular fa-star star-btn" data-rating="2"></i>
                <i class="fa-regular fa-star star-btn" data-rating="3"></i>
                <i class="fa-regular fa-star star-btn" data-rating="4"></i>
                <i class="fa-regular fa-star star-btn" data-rating="5"></i>
              </div>
              <input type="hidden" id="review-rating-val" value="5">
            </div>

            <div class="form-group" style="margin-bottom: 1.5rem;">
              <textarea id="review-text" placeholder="Write your review here... (Details about sparkle, lacquer, weight, or shipping)" required rows="4" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-rose); font-family: var(--font-body); font-size: 0.8rem; line-height: 1.6; resize: vertical;"></textarea>
            </div>

            <button type="submit" class="btn btn-primary btn-block" style="padding: 0.8rem;">Submit Review</button>
          </form>
        </div>

        <!-- Right: Reviews List Deck -->
        <div class="reviews-list-deck" style="max-height: 500px; overflow-y: auto; padding-right: 0.5rem;">
          ${reviewsListHTML}
        </div>
      </div>
    `;

    // Wire Interactive Star Picker
    const starsPicker = document.getElementById('review-stars-picker');
    const ratingInput = document.getElementById('review-rating-val');
    let currentRating = 5;

    // Set default (5 stars selected)
    highlightStars(starsPicker, 5);

    if (starsPicker) {
      const starIcons = starsPicker.querySelectorAll('.star-btn');
      
      starIcons.forEach(star => {
        // Hover highlight
        star.addEventListener('mouseenter', (e) => {
          const rating = parseInt(e.target.getAttribute('data-rating'));
          highlightStars(starsPicker, rating);
        });

        // Mouse leave restore current selected rating
        star.addEventListener('mouseleave', () => {
          highlightStars(starsPicker, currentRating);
        });

        // Click lock rating
        star.addEventListener('click', (e) => {
          currentRating = parseInt(e.target.getAttribute('data-rating'));
          if (ratingInput) ratingInput.value = currentRating;
          highlightStars(starsPicker, currentRating);
        });
      });
    }

    // Submit review form
    const reviewForm = document.getElementById('product-review-form');
    if (reviewForm) {
      reviewForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nameVal = document.getElementById('review-name').value.trim();
        const textVal = document.getElementById('review-text').value.trim();
        const ratingVal = parseInt(ratingInput ? ratingInput.value : 5);

        if (!nameVal || !textVal) return;

        const newReview = {
          name: nameVal,
          rating: ratingVal,
          text: textVal,
          date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
        };

        // Save in localStorage array
        const customReviewsList = JSON.parse(localStorage.getItem(`manih_custom_reviews_${productId}`)) || [];
        customReviewsList.unshift(newReview); // Add to beginning of user reviews
        localStorage.setItem(`manih_custom_reviews_${productId}`, JSON.stringify(customReviewsList));

        // Re-render reviews deck
        renderReviewsDeck(productId);
      });
    }
  }

  function highlightStars(starsContainer, rating) {
    if (!starsContainer) return;
    const stars = starsContainer.querySelectorAll('.star-btn');
    stars.forEach((star, index) => {
      if (index < rating) {
        star.className = "fa-solid fa-star star-btn";
        star.style.color = "#D4A373"; // Warm Gold
      } else {
        star.className = "fa-regular fa-star star-btn";
        star.style.color = ""; // Muted
      }
    });
  }

  // --------------------------------------------------------------------------
  // 13. Similar Products Dynamic Recommendation Grid
  // --------------------------------------------------------------------------
  function renderSimilarProducts(currentItem) {
    const container = document.getElementById('similar-products-section');
    if (!container) return;

    // Filter products: same category, excluding current product, up to 3 pieces
    const similarItems = products
      .filter(p => p.category === currentItem.category && p.id !== currentItem.id)
      .slice(0, 3);

    if (similarItems.length === 0) {
      // If no items in the same category, recommend best sellers or daily wear!
      const fallbackItems = products
        .filter(p => p.id !== currentItem.id)
        .slice(0, 3);
      
      renderRecommendationsGrid(container, fallbackItems, "Featured Creations");
      return;
    }

    renderRecommendationsGrid(container, similarItems, "Similar Creations");
  }

  function renderRecommendationsGrid(container, items, sectionTitle) {
    container.innerHTML = `
      <div class="section-header" style="text-align: left; margin-bottom: 2rem;">
        <p class="section-subtitle">THE DESIGNER SUITES</p>
        <h3 class="section-title" style="font-size: 1.8rem;">${sectionTitle}</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">
          Complements your selected piece beautifully. Discover these handcrafted creations.
        </p>
      </div>

      <div class="similar-products-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 2rem;">
        ${items.map(item => {
          const isOutOfStock = item.stock <= 0;
          
          let badgeHTML = '';
          if (isOutOfStock) {
            badgeHTML = `<div class="product-badge-stock">Sold Out</div>`;
          }

          const firstImg = (Array.isArray(item.images) && item.images.length > 0) ? item.images[0] : 'assets/logo.png';
          const isLiked = wishlist.some(w => w.id === item.id);

          return `
            <div class="product-card">
              <div class="product-card-image">
                ${badgeHTML}
                <button class="wishlist-card-btn ${isLiked ? 'active' : ''}" data-id="${item.id}" aria-label="Toggle Wishlist">
                  <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>
                <a href="product.html?id=${item.id}">
                  <img src="${firstImg}" alt="${item.name}">
                </a>
              </div>
              <div class="product-card-content">
                <span class="product-card-category">${item.category}</span>
                <a href="product.html?id=${item.id}">
                  <h3 class="product-card-title">${item.name}</h3>
                </a>
                <p class="product-card-price">
                  ${item.discount_price && item.discount_price < item.base_price ? `
                    <span class="price-discount" style="color: ${isOutOfStock ? '#b0b0b0' : 'var(--bg-maroon)'}; font-weight: 600;">₹${item.discount_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span class="price-original" style="text-decoration: line-through; color: var(--text-muted); font-size: 0.8em; margin-left: 0.5rem; font-weight: normal;">₹${item.base_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  ` : `
                    <span style="color: ${isOutOfStock ? '#b0b0b0' : 'inherit'};">₹${item.base_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  `}
                  ${isOutOfStock ? `<span style="font-size: 0.7rem; color: #a81c2f; font-weight: bold; margin-left: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">(Sold Out)</span>` : ''}
                </p>
                ${isOutOfStock ? `
                  <a href="product.html?id=${item.id}" class="btn btn-block explore-piece-btn" style="background-color: #f5f5f5; color: #b0b0b0; border: 1px solid #e0e0e0; pointer-events: auto; text-align: center; text-decoration: line-through;">Sold Out</a>
                ` : `
                  <a href="product.html?id=${item.id}" class="btn btn-secondary btn-block explore-piece-btn">View Product</a>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Wire wishlist clicks on recommendation cards
    container.querySelectorAll('.wishlist-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        toggleWishlist(id);
      });
    });
  }

  // --------------------------------------------------------------------------
  // 14. Real-Time SQLite Developer Dashboard UI
  // --------------------------------------------------------------------------
  function renderDatabaseDashboard(data) {
    if (badgeProducts) badgeProducts.textContent = data.products.length;
    if (dbProductsTbody) {
      dbProductsTbody.innerHTML = data.products.map(p => `
        <tr>
          <td><strong>${p.id}</strong></td>
          <td>${p.name}</td>
          <td><span class="db-row-badge" style="background-color:rgba(255,255,255,0.06); color:var(--rose-gold-light);">${p.category}</span></td>
          <td>₹${p.base_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="color: ${p.stock <= 0 ? 'var(--accent-ruby)' : p.stock <= 4 ? 'var(--rose-gold)' : '#fff'}">${p.stock} units</td>
          <td><div class="db-json-text" title="${p.description}">${p.description}</div></td>
        </tr>
      `).join('');
    }

    if (badgeOrders) badgeOrders.textContent = data.orders.length;
    if (dbOrdersTbody) {
      if (data.orders.length === 0) {
        dbOrdersTbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center text-muted">No orders placed yet. Complete checkout above to write database entries.</td>
          </tr>
        `;
      } else {
        dbOrdersTbody.innerHTML = data.orders.map(o => `
          <tr>
            <td><strong>${o.id}</strong></td>
            <td>${o.customer_name}</td>
            <td>${o.customer_email}</td>
            <td><div class="db-json-text" title="${o.shipping_address}">${o.shipping_address}</div></td>
            <td>₹${o.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td><span class="status-${o.status.toLowerCase()}">${o.status}</span></td>
            <td style="color:#888">${new Date(o.created_at).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    }

    if (badgeTransactions) badgeTransactions.textContent = data.transactions.length;
    if (dbTransactionsTbody) {
      if (data.transactions.length === 0) {
        dbTransactionsTbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center text-muted">No gateway transactions processed yet. Checkout to log transactions.</td>
          </tr>
        `;
      } else {
        dbTransactionsTbody.innerHTML = data.transactions.map(t => `
          <tr>
            <td><strong>${t.id}</strong></td>
            <td>#000${t.order_id}</td>
            <td><code style="color:var(--rose-gold-light)">${t.transaction_ref}</code></td>
            <td>₹${t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td>${t.payment_method}</td>
            <td><span class="status-${t.status.toLowerCase()}">${t.status}</span></td>
            <td>${t.provider}</td>
            <td style="color:#888">${new Date(t.created_at).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    }
  }

  function setupDatabasePanelEventListeners() {
    dbTabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        dbTabButtons.forEach(b => b.classList.remove('active'));
        dbTableContents.forEach(c => c.classList.remove('active'));
        
        const targetBtn = e.currentTarget;
        targetBtn.classList.add('active');
        
        const targetTable = targetBtn.getAttribute('data-table');
        const targetEl = document.getElementById(targetTable);
        if (targetEl) targetEl.classList.add('active');
      });
    });

    if (btnDbRefresh) {
      btnDbRefresh.addEventListener('click', fetchDatabaseDashboard);
    }
  }

  function setupAutocomplete(inputEl, containerEl, isDarkTheme) {
    if (!inputEl) return;

    let suggestionsBox = inputEl.parentNode.querySelector('.search-suggestions-box');
    if (!suggestionsBox) {
      suggestionsBox = document.createElement('div');
      suggestionsBox.className = 'search-suggestions-box hidden';
      
      if (isDarkTheme) {
        suggestionsBox.style.cssText = `
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background-color: rgba(91, 0, 18, 0.98);
          border: 1px solid var(--border-rose);
          border-top: none;
          border-radius: 0 0 8px 8px;
          max-height: 250px;
          overflow-y: auto;
          z-index: 10000;
          margin-top: 2px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          scrollbar-width: none;
        `;
      } else {
        suggestionsBox.style.cssText = `
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background-color: var(--white-pure);
          border: 1px solid var(--border-rose);
          border-radius: 8px;
          max-height: 250px;
          overflow-y: auto;
          z-index: 10000;
          margin-top: 8px;
          box-shadow: 0 8px 24px rgba(91,0,18,0.08);
          scrollbar-width: none;
        `;
      }
      
      inputEl.parentNode.style.position = 'relative';
      inputEl.parentNode.appendChild(suggestionsBox);
    }

    document.addEventListener('click', (e) => {
      if (!inputEl.contains(e.target) && !suggestionsBox.contains(e.target)) {
        suggestionsBox.classList.add('hidden');
      }
    });

    inputEl.addEventListener('input', () => {
      const query = inputEl.value.toLowerCase().trim();
      if (query.length < 1) {
        suggestionsBox.classList.add('hidden');
        suggestionsBox.innerHTML = '';
        return;
      }

      const suggestions = [];

      const categories = [...new Set(products.map(p => p.category))];
      categories.forEach(cat => {
        if (cat.toLowerCase().includes(query)) {
          suggestions.push({ type: 'category', text: cat });
        }
      });

      products.forEach(p => {
        if (p.name.toLowerCase().includes(query)) {
          suggestions.push({ type: 'product', text: p.name });
        }
      });

      const uniqueSuggestions = [];
      const seen = new Set();
      suggestions.forEach(item => {
        const key = item.text.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueSuggestions.push(item);
        }
      });

      const limitedSuggestions = uniqueSuggestions.slice(0, 5);

      if (limitedSuggestions.length === 0) {
        suggestionsBox.classList.add('hidden');
        suggestionsBox.innerHTML = '';
        return;
      }

      suggestionsBox.innerHTML = limitedSuggestions.map(item => {
        const icon = item.type === 'category' ? '<i class="fa-solid fa-tags" style="margin-right: 8px; opacity: 0.7;"></i>' : '';
        const typeBadge = item.type === 'category' ? '<span style="font-size: 0.7rem; opacity: 0.6; text-transform: uppercase; float: right; padding-top: 2px;">In Category</span>' : '';
        
        const index = item.text.toLowerCase().indexOf(query);
        let displayText = item.text;
        if (index > -1) {
          const prefix = item.text.substring(0, index);
          const match = item.text.substring(index, index + query.length);
          const suffix = item.text.substring(index + query.length);
          displayText = `${prefix}<strong style="color: var(--rose-gold); font-weight: bold;">${match}</strong>${suffix}`;
        }

        const hoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'var(--cream-ivory)';
        const textColor = isDarkTheme ? '#fff' : 'var(--text-primary)';

        return `
          <div class="suggestion-item" data-val="${item.text}" style="padding: 0.8rem 1rem; color: ${textColor}; cursor: pointer; border-bottom: 1px solid rgba(212,163,115,0.15); transition: background 0.2s;" onmouseover="this.style.background='${hoverBg}'" onmouseout="this.style.background='transparent'">
            ${icon} ${displayText} ${typeBadge}
          </div>
        `;
      }).join('');

      suggestionsBox.classList.remove('hidden');

      suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const val = e.currentTarget.getAttribute('data-val');
          inputEl.value = val;
          suggestionsBox.classList.add('hidden');

          if (inputEl.id === 'overlay-search-input') {
            triggerGlobalSearch();
          } else {
            const oSearch = document.getElementById('overlay-search-input');
            if (oSearch) {
              oSearch.value = val;
            }
            filterCatalog();
          }
        });
      });
    });
  }

  // Run engine on load
  init();
});
