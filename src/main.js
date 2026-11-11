import './styles/main.css'; import './styles/animations.css'; import './styles/responsive.css'; import './styles/map-status.css';
import './styles/home.css'; import './styles/polish.css';
import './styles/workflow.css';
import { initBurger } from './js/burger.js'; import { initFoodSelection } from './js/food-selection.js'; import { initLocation, initTrackingMap } from './js/location.js'; import { initUI } from './js/ui.js';
import { initWorkflow } from './js/workflow.js';
const state = { food: null, foodName: null, price: null, location: null, restaurants: [], restaurant: null, confirmed: false, map: null };
initUI(); initFoodSelection(state); initBurger(document.querySelector('#burger-canvas')); initLocation(state); initTrackingMap(state); initWorkflow(state);
