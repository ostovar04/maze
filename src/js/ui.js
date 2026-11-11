export function toast(message) {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('visible'), 2800);
}

export function initUI() {
  document.querySelectorAll('[data-toast]').forEach((button) => button.addEventListener('click', () => toast(button.dataset.toast)));
  document.querySelectorAll('.add-button').forEach((button) => button.addEventListener('click', () => {
    const count = document.querySelector('.cart-count');
    if (count) {
      const amount = Number(count.dataset.amount || 0) + 1;
      count.dataset.amount = amount;
      count.textContent = new Intl.NumberFormat('fa-IR').format(amount);
      count.classList.add('visible');
    }
    toast('\u0628\u0647 \u0633\u0628\u062f \u062e\u0631\u06cc\u062f \u0627\u0636\u0627\u0641\u0647 \u0634\u062f.');
  }));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
    }), { threshold: .12 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
  }
}
