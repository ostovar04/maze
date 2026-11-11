const fa = new Intl.NumberFormat('fa-IR');
const orderStorageKey = 'maze-toori-demo-order';
const categoryPrices = {
  kebab: 395000, pizza: 320000, chicken: 285000, pasta: 260000,
  breakfast: 180000, drink: 95000, dessert: 145000, salad: 210000
};

function showScreen(screen) {
  document.querySelectorAll('[data-screen]').forEach((element) => {
    element.hidden = element.dataset.screen !== screen;
  });
  document.querySelectorAll('[data-go]').forEach((link) => {
    link.classList.toggle('current', link.dataset.go === screen);
    link.classList.toggle('active', link.dataset.go === screen);
  });
  document.body.dataset.view = screen;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (screen === 'restaurants') window.dispatchEvent(new CustomEvent('workflow:map-visible'));
  if (screen === 'order') window.dispatchEvent(new CustomEvent('workflow:tracking-visible'));
}

export function initWorkflow(state) {
  const findButton = document.querySelector('#find-restaurants');
  const trackingCard = document.querySelector('.tracking-card');
  const checkoutCard = document.querySelector('#checkout-card');
  const emptyOrder = document.querySelector('#empty-order');

  try {
    state.order = JSON.parse(localStorage.getItem(orderStorageKey) || 'null');
  } catch {
    state.order = null;
  }
  if (state.order) {
    state.food = state.order.foodKey || 'kebab';
    state.foodName = state.order.foodName;
    state.price = state.order.price;
    state.restaurant = { title: state.order.restaurantName || 'رستوران منتخب مزه‌طوری' };
    state.confirmed = true;
    applySelectedCategory();
  }

  document.querySelectorAll('[data-go]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    showScreen(link.dataset.go);
    if (link.dataset.go === 'restaurants') {
      document.querySelector('#location').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }));

  document.querySelector('#find-restaurants').addEventListener('click', () => {
    if (state.food) openMapForFood();
  });

  document.querySelectorAll('.category-card').forEach((card) => card.addEventListener('click', () => {
    state.foodName = card.querySelector('b').textContent.trim();
    state.price = categoryPrices[state.food] || 250000;
    createDemoOrder();
  }));

  document.querySelectorAll('.meal-card').forEach((meal) => meal.addEventListener('click', () => {
    state.foodName = meal.querySelector('.meal-info b').textContent.trim();
    const priceText = meal.querySelector('.meal-info strong').textContent;
    state.price = Number(priceText.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[^\d]/g, ''));
    state.food = 'kebab';
    applySelectedCategory();
    updateBasket();
    createDemoOrder();
  }));

  document.addEventListener('restaurant:selected', (event) => {
    state.restaurant = event.detail;
    state.confirmed = false;
    if (state.order) {
      state.order.restaurantName = event.detail.title;
      persistOrder();
    }
    document.querySelector('#checkout-restaurant').textContent = state.restaurant.title;
    document.querySelector('#checkout-food').textContent = state.foodName || 'غذای انتخاب‌شده';
    document.querySelector('#checkout-price').textContent = state.price ? `${fa.format(state.price)} تومان` : 'قیمت پس از تایید رستوران';
    document.querySelector('#confirm-order').disabled = false;
    document.querySelector('#order-number').textContent = state.order?.id || '—';
    emptyOrder.hidden = true;
    checkoutCard.hidden = false;
    trackingCard.hidden = true;
    showScreen('order');
  });

  document.querySelector('#confirm-order').addEventListener('click', () => {
    state.confirmed = true;
    document.querySelector('#order-intro').textContent = `سفارش از ${state.restaurant.title} ثبت شد.`;
    document.querySelector('#tracking-status-title').textContent = 'رستوران سفارش را پذیرفت';
    document.querySelector('#tracking-status-copy').textContent = 'آشپزخانه در حال آماده‌سازی غذای توست.';
    document.querySelector('#tracking-eta').textContent = '۲۵ دقیقه';
    updateCourierAddress();
    setTrackingStep(1);
    persistOrder();
    refreshOrderView();
    showScreen('order');
  });

  document.addEventListener('location:changed', (event) => {
    const { lat, lng } = event.detail;
    document.querySelector('#address-label').textContent = `${fa.format(lat.toFixed(3))}، ${fa.format(lng.toFixed(3))}`;
    document.querySelector('#desktop-address-label').textContent = 'موقعیت ثبت شد';
    if (state.order) {
      state.order.location = { lat, lng };
      persistOrder();
      updateCourierAddress();
    }
  });

  function applySelectedCategory() {
    document.querySelectorAll('.category-card').forEach((card) => {
      const selected = card.dataset.food === state.food;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
  }

  function updateBasket() {
    const name = state.foodName || 'هنوز غذایی انتخاب نشده';
    document.querySelector('#basket-summary').textContent = state.price
      ? `${name} · ${fa.format(state.price)} تومان`
      : name;
    findButton.disabled = !state.food;
  }

  function persistOrder() {
    if (!state.order) return;
    state.order.foodName = state.foodName;
    state.order.foodKey = state.food;
    state.order.price = state.price;
    state.order.status = state.confirmed ? 'در حال آماده‌سازی' : 'در انتظار انتخاب رستوران';
    state.order.eta = 25;
    try {
      const { location, ...savedOrder } = state.order;
      localStorage.setItem(orderStorageKey, JSON.stringify(savedOrder));
    } catch { /* Storage may be unavailable in private browsing. */ }
  }

  function createDemoOrder() {
    state.restaurant = { title: 'رستوران منتخب مزه‌طوری' };
    state.confirmed = true;
    state.order = {
      id: '#MV-2481', foodName: state.foodName, foodKey: state.food,
      price: state.price, restaurantName: state.restaurant.title,
      status: 'در حال آماده‌سازی', eta: 25,
      createdAt: new Date().toISOString(), location: state.location || null
    };
    persistOrder();
    updateBasket();
    document.querySelector('#order-number').textContent = state.order.id;
    document.querySelector('#order-intro').textContent = `سفارش آزمایشی از ${state.restaurant.title} ثبت شد.`;
    document.querySelector('#checkout-restaurant').textContent = state.restaurant.title;
    document.querySelector('#checkout-food').textContent = state.foodName;
    document.querySelector('#checkout-price').textContent = `${fa.format(state.price)} تومان`;
    document.querySelector('#tracking-status-title').textContent = 'رستوران سفارش را پذیرفت';
    document.querySelector('#tracking-status-copy').textContent = 'آشپزخانه در حال آماده‌سازی غذای توست.';
    document.querySelector('#tracking-eta').textContent = '۲۵ دقیقه';
    setTrackingStep(1);
    refreshOrderView();
    openMapForFood();
  }

  function refreshOrderView() {
    const hasOrder = Boolean(state.order);
    emptyOrder.hidden = hasOrder;
    checkoutCard.hidden = !hasOrder || state.confirmed;
    trackingCard.hidden = !hasOrder || !state.confirmed;
    if (hasOrder) updateCourierAddress();
  }

  function setTrackingStep(activeIndex) {
    document.querySelectorAll('.order-steps li').forEach((step, index) => {
      step.classList.toggle('done', index < activeIndex);
      step.classList.toggle('active', index === activeIndex);
      if (index === activeIndex) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
  }

  function updateCourierAddress() {
    const location = state.order?.location || state.location;
    document.querySelector('#courier-address').textContent = location
      ? `مقصد تحویل: ${fa.format(location.lat.toFixed(4))}، ${fa.format(location.lng.toFixed(4))}`
      : 'برای ثبت مقصد، موقعیتت را روی نقشه مشخص کن.';
  }

  function restoreOrderDetails() {
    if (!state.order) return;
    document.querySelector('#order-number').textContent = state.order.id || '#MV-2481';
    document.querySelector('#order-intro').textContent = `سفارش آزمایشی از ${state.order.restaurantName || 'رستوران منتخب مزه‌طوری'} ثبت شد.`;
    document.querySelector('#checkout-restaurant').textContent = state.order.restaurantName || 'رستوران منتخب مزه‌طوری';
    document.querySelector('#checkout-food').textContent = state.order.foodName || 'غذای انتخاب‌شده';
    document.querySelector('#checkout-price').textContent = `${fa.format(state.order.price || 0)} تومان`;
    document.querySelector('#tracking-status-title').textContent = 'رستوران سفارش را پذیرفت';
    document.querySelector('#tracking-status-copy').textContent = state.order.status || 'آشپزخانه در حال آماده‌سازی غذای توست.';
    document.querySelector('#tracking-eta').textContent = `${fa.format(state.order.eta || 25)} دقیقه`;
    setTrackingStep(1);
  }

  function openMapForFood() {
    showScreen('restaurants');
    document.querySelector('#location').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (state.location) {
      document.querySelector('#search-button').click();
    } else {
      document.querySelector('#locate-button').click();
    }
  }

  updateBasket();
  restoreOrderDetails();
  refreshOrderView();
  showScreen('menu');
}
