
const API = "https://dummyjson.com";
const PAGE_SIZE = 20;

const state = {
  products: [],
  category: "all",
  query: "",
  sort: "featured",
  skip: 0,
  total: 0,
  loading: false,
  requestId: 0,
  cart: new Map()
};

const $ = (selector) => document.querySelector(selector);

const grid = $("#product-grid");
const searchInput = $("#search-input");
const sortSelect = $("#sort-select");
const resultCount = $("#result-count");
const loadMoreButton = $("#load-more");
const clearFiltersButton = $("#clear-filters");
const categoryList = $("#category-list");
const drawer = $("#cart-drawer");
const backdrop = $("#drawer-backdrop");

let searchTimer;
let toastTimer;

// ------------------------------
// Helpers
// ------------------------------

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function categoryLabel(slug = "") {
  const specialNames = {
    "mens-shirts": "Menswear",
    "womens-dresses": "Womenswear",
    "mobile-accessories": "Mobile Accessories",
    "kitchen-accessories": "Kitchen Accessories",
    "home-decoration": "Home Decoration",
    "skin-care": "Skin Care",
    "sports-accessories": "Sports Accessories",
    "vehicle": "Vehicles"
  };

  if (specialNames[slug]) {
    return specialNames[slug];
  }

  return slug
    .split("-")
    .map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

async function getJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  return response.json();
}

// ------------------------------
// Dynamic categories
// ------------------------------

async function loadCategories() {
  try {
    const categories = await getJSON(
      `${API}/products/category-list`
    );

    const preferredCategories = [
      "smartphones",
      "laptops",
      "tablets",
      "mobile-accessories",
      "beauty",
      "fragrances",
      "furniture",
      "groceries",
      "mens-shirts",
      "womens-dresses"
    ];

    const sortedCategories = [
      ...preferredCategories.filter(category =>
        categories.includes(category)
      ),
      ...categories.filter(category =>
        !preferredCategories.includes(category)
      )
    ];

    categoryList.innerHTML = `
      <button
        class="category-chip active"
        data-category="all">
        Everything
      </button>

      ${sortedCategories.map(category => `
        <button
          class="category-chip"
          data-category="${escapeHTML(category)}">
          ${escapeHTML(categoryLabel(category))}
        </button>
      `).join("")}
    `;

  } catch (error) {
    console.error("Category loading failed:", error);
    showToast("Could not load categories. Check your connection.");
  }
}

// ------------------------------
// Product cards
// ------------------------------

function createProductCard(product, index) {
  const image = escapeHTML(
    product.thumbnail || product.images?.[0] || ""
  );

  const title = escapeHTML(product.title);
  const category = escapeHTML(
    categoryLabel(product.category)
  );

  return `
    <article
      class="product-card"
      style="animation-delay:${Math.min(index * 30, 250)}ms">

      <div class="product-image-wrap">

        ${
          Number(product.discountPercentage) >= 10
            ? '<span class="product-badge">Good find</span>'
            : ""
        }

        <img
          class="product-image"
          src="${image}"
          alt="${title}"
          loading="lazy"
          onerror="this.style.opacity='.25';this.alt='Image unavailable'">

        <button
          class="quick-add"
          data-add="${product.id}">
          + Add to bag
        </button>

      </div>

      <div class="product-info-top">
        <h3 class="product-title">${title}</h3>
        <span class="product-price">
          ${money(product.price)}
        </span>
      </div>

      <div class="product-meta">
        <span>${category}</span>
        <span class="product-rating">
          ★ ${Number(product.rating || 0).toFixed(1)}
        </span>
      </div>

    </article>
  `;
}

// ------------------------------
// Render products
// ------------------------------

function renderProducts() {
  if (state.products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <strong>No products found.</strong>
        <p>Try another search or clear your filters.</p>
      </div>
    `;
  } else {
    grid.innerHTML = state.products
      .map((product, index) =>
        createProductCard(product, index)
      )
      .join("");
  }

  resultCount.textContent =
    `${state.products.length} of ${state.total} products`;

  const selectedCategory =
    state.category === "all"
      ? "everything"
      : categoryLabel(state.category);

  const queryText = state.query
    ? ` matching "${state.query}"`
    : "";

  $("#active-filter-label").textContent =
    `Showing ${selectedCategory}${queryText}`;

  clearFiltersButton.hidden =
    state.category === "all" &&
    !state.query &&
    state.sort === "featured";

  loadMoreButton.hidden =
    state.products.length >= state.total ||
    state.total === 0;
}

// ------------------------------
// Fetch products
// ------------------------------

async function loadProducts({
  reset = false,
  append = false
} = {}) {
  // Ignore unnecessary pagination requests.
  if (state.loading && !reset) {
    return;
  }

  // Invalidate previous requests when filters change.
  const requestId = ++state.requestId;

  if (reset) {
    state.skip = 0;
    state.products = [];
    state.total = 0;

    grid.innerHTML = `
      <p>Loading products...</p>
    `;

    resultCount.textContent = "Loading products...";
  }

  state.loading = true;
  loadMoreButton.disabled = true;
  loadMoreButton.textContent = "Loading...";

  try {
    let endpoint;

    // Search takes priority over category selection.
    if (state.query.trim()) {
      endpoint = `${API}/products/search`;
    } else if (state.category !== "all") {
      endpoint =
        `${API}/products/category/${encodeURIComponent(
          state.category
        )}`;
    } else {
      endpoint = `${API}/products`;
    }

    // Build query parameters safely.
    const url = new URL(endpoint);

    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("skip", String(state.skip));

    if (state.query.trim()) {
      url.searchParams.set("q", state.query.trim());
    }

    const data = await getJSON(url.toString());

    // Ignore outdated responses.
    if (requestId !== state.requestId) {
      return;
    }

    state.total = data.total;

    state.products = append
      ? [...state.products, ...data.products]
      : data.products;

    state.skip = state.products.length;

    // Sorting applies to the currently loaded products.
    const sortFunctions = {
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      "rating": (a, b) => b.rating - a.rating
    };

    if (sortFunctions[state.sort]) {
      state.products.sort(sortFunctions[state.sort]);
    }

    renderProducts();

  } catch (error) {
    if (requestId !== state.requestId) {
      return;
    }

    console.error("Product loading failed:", error);

    grid.innerHTML = `
      <div class="empty-state">
        <strong>Unable to load products.</strong>
        <p>
          Check your internet connection and try again.
        </p>
        <button
          class="secondary-button"
          id="retry-load">
          Try again ↻
        </button>
      </div>
    `;

    resultCount.textContent = "Products unavailable";
    loadMoreButton.hidden = true;

    $("#retry-load").addEventListener("click", () => {
      loadProducts({ reset: true });
    });

  } finally {
    // Only the latest request may change loading state.
    if (requestId === state.requestId) {
      state.loading = false;
      loadMoreButton.disabled = false;
      loadMoreButton.textContent =
        "Load more products ↓";
    }
  }
}

// ------------------------------
// Category filtering
// ------------------------------

categoryList.addEventListener("click", event => {
  const button = event.target.closest("[data-category]");

  if (!button) {
    return;
  }

  state.category = button.dataset.category;

  document.querySelectorAll(".category-chip").forEach(chip => {
    chip.classList.toggle(
      "active",
      chip.dataset.category === state.category
    );
  });

  loadProducts({ reset: true });
});

// ------------------------------
// Search products
// ------------------------------

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);

  searchTimer = setTimeout(() => {
    state.query = searchInput.value.trim();
    loadProducts({ reset: true });
  }, 300);
});

// ------------------------------
// Sorting
// ------------------------------

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;
  loadProducts({ reset: true });
});

// ------------------------------
// Clear filters
// ------------------------------

clearFiltersButton.addEventListener("click", () => {
  clearTimeout(searchTimer);

  searchInput.value = "";
  sortSelect.value = "featured";

  state.query = "";
  state.category = "all";
  state.sort = "featured";

  document.querySelectorAll(".category-chip").forEach(chip => {
    chip.classList.toggle(
      "active",
      chip.dataset.category === "all"
    );
  });

  loadProducts({ reset: true });
});

// ------------------------------
// Pagination
// ------------------------------

loadMoreButton.addEventListener("click", () => {
  if (
    !state.loading &&
    state.products.length < state.total
  ) {
    loadProducts({ append: true });
  }
});

// ------------------------------
// Shopping bag
// ------------------------------

function addToCart(id) {
  const product = state.products.find(
    item => item.id === Number(id)
  );

  if (!product) {
    return;
  }

  const existing = state.cart.get(product.id);

  state.cart.set(product.id, {
    product,
    quantity: (existing?.quantity || 0) + 1
  });

  renderCart();
  showToast(`${product.title} added to your bag`);
}

function changeQuantity(id, amount) {
  const numericId = Number(id);
  const item = state.cart.get(numericId);

  if (!item) {
    return;
  }

  item.quantity += amount;

  if (item.quantity <= 0) {
    state.cart.delete(numericId);
  }

  renderCart();
}

function renderCart() {
  const items = [...state.cart.entries()];

  const totalQuantity = items.reduce(
    (sum, [, item]) => sum + item.quantity,
    0
  );

  const subtotal = items.reduce(
    (sum, [, item]) =>
      sum + item.product.price * item.quantity,
    0
  );

  $("#cart-count").textContent = totalQuantity;
  $("#drawer-count").textContent = `(${totalQuantity})`;
  $("#cart-subtotal").textContent = money(subtotal);

  const cartItems = $("#cart-items");

  if (items.length === 0) {
    cartItems.innerHTML = `
      <p class="empty-cart">
        Your bag is looking a little empty.
      </p>
    `;
    return;
  }

  cartItems.innerHTML = items.map(([id, item]) => {
    const product = item.product;

    return `
      <div class="cart-item">

        <img
          src="${escapeHTML(
            product.thumbnail || product.images?.[0] || ""
          )}"
          alt="${escapeHTML(product.title)}">

        <div>
          <p class="cart-item-title">
            ${escapeHTML(product.title)}
          </p>

          <span class="cart-item-price">
            ${money(product.price)}
          </span>

          <div class="qty-control">
            <button
              data-qty="${id}"
              data-amount="-1"
              aria-label="Decrease quantity">
              −
            </button>

            <span>${item.quantity}</span>

            <button
              data-qty="${id}"
              data-amount="1"
              aria-label="Increase quantity">
              +
            </button>
          </div>
        </div>

        <button
          class="remove-item"
          data-remove="${id}"
          aria-label="Remove ${escapeHTML(product.title)}">
          ×
        </button>

      </div>
    `;
  }).join("");
}

// Product card click handling.
grid.addEventListener("click", event => {
  const button = event.target.closest("[data-add]");

  if (button) {
    addToCart(button.dataset.add);
  }
});

// Cart quantity and remove buttons.
$("#cart-items").addEventListener("click", event => {
  const quantityButton = event.target.closest("[data-qty]");
  const removeButton = event.target.closest("[data-remove]");

  if (quantityButton) {
    changeQuantity(
      quantityButton.dataset.qty,
      Number(quantityButton.dataset.amount)
    );
  }

  if (removeButton) {
    state.cart.delete(Number(removeButton.dataset.remove));
    renderCart();
  }
});

// ------------------------------
// Shopping bag drawer
// ------------------------------

function openCart() {
  drawer.inert = false;
  drawer.setAttribute("aria-hidden", "false");
  drawer.classList.add("open");
  backdrop.classList.add("open");

  document.body.style.overflow = "hidden";
  $("#close-drawer").focus();
}

function closeCart() {
  if (drawer.contains(document.activeElement)) {
    $("#cart-toggle").focus();
  }

  drawer.classList.remove("open");
  backdrop.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.inert = true;

  document.body.style.overflow = "";
}

$("#cart-toggle").addEventListener("click", openCart);
$("#close-drawer").addEventListener("click", closeCart);
backdrop.addEventListener("click", closeCart);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeCart();
  }
});

// ------------------------------
// Toast notifications
// ------------------------------

function showToast(message) {
  const toast = $("#toast");

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2300);
}

// ------------------------------
// Demo checkout
// ------------------------------

$("#checkout-button").addEventListener("click", () => {
  if (state.cart.size === 0) {
    showToast("Your bag is empty.");
    return;
  }

  showToast(
    "Demo store only — checkout is not connected yet."
  );
});

// ------------------------------
// Start the application
// ------------------------------

loadCategories();
loadProducts({ reset: true });
