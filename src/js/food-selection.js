const labels = {
  pizza: '\u067e\u06cc\u062a\u0632\u0627',
  pasta: '\u063a\u0630\u0627\u06cc \u062e\u0627\u0646\u06af\u06cc',
  kebab: '\u0686\u0644\u0648 \u06a9\u0628\u0627\u0628',
  sushi: '\u0635\u0628\u062d\u0627\u0646\u0647',
  chicken: '\u0628\u0631\u06af\u0631',
  breakfast: '\u0635\u0628\u062d\u0627\u0646\u0647',
  drink: '\u0646\u0648\u0634\u06cc\u062f\u0646\u06cc',
  dessert: '\u062f\u0633\u0631',
  salad: '\u0633\u0627\u0644\u0627\u062f'
};

export function initFoodSelection(state) {
  const cards = [...document.querySelectorAll('.food-card')];
  const output = document.querySelector('#selected-food b');
  cards.forEach((card) => card.addEventListener('click', () => {
    cards.forEach((item) => {
      item.classList.remove('selected');
      item.setAttribute('aria-pressed', 'false');
    });
    card.classList.add('selected');
    card.setAttribute('aria-pressed', 'true');
    state.food = card.dataset.food;
    output.textContent = labels[state.food];
    document.querySelector('#results-subtitle').textContent = `\u062a\u0631\u062c\u06cc\u062d \u0634\u0645\u0627: ${labels[state.food]}`;
  }));
}
