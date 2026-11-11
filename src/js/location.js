import maplibregl from '@neshan-maps-platform/maplibre-sdk';
import '@neshan-maps-platform/maplibre-sdk/style.css';
import { toast } from './ui.js';

const mapApiKey = import.meta.env.VITE_NESHAN_MAP_API_KEY || import.meta.env.VITE_NESHAN_API_KEY;
const serviceApiKey = import.meta.env.VITE_NESHAN_SERVICE_API_KEY;
const defaultCenter = [59.60567, 36.29807]; // Mashhad, longitude then latitude.
const foodSearchTerms = {
  pizza: 'رستوران پیتزا ایتالیایی',
  pasta: 'رستوران ماکارونی',
  kebab: 'رستوران کباب لقمه',
  sushi: 'رستوران سوشی',
  chicken: 'رستوران مرغ سوخاری'
};
const $ = (selector) => document.querySelector(selector);
const fa = (value) => new Intl.NumberFormat('fa-IR').format(value);

let map;
let mapHasError = false;
let userMarker;
let restaurantMarkers = [];
let currentUser = null;
let stateRef;
let manualMode = false;

const trackingOrigin = [51.45976, 35.73155]; // Chaharrah Lashkar, Tehran.
let trackingMap;
let courierMarker;
let destinationMarker;
let courierFrame = 0;

function makeTrackingRoute(origin, destination) {
  const points = [];
  const dx = destination[0] - origin[0];
  const dy = destination[1] - origin[1];
  const distance = Math.hypot(dx, dy) || 0.01;
  const bend = Math.min(0.005, distance * 0.13);
  const offsetX = -dy / distance * bend;
  const offsetY = dx / distance * bend;
  for (let index = 0; index <= 40; index += 1) {
    const progress = index / 40;
    const curve = Math.sin(progress * Math.PI) * 0.7;
    points.push([origin[0] + dx * progress + offsetX * curve, origin[1] + dy * progress + offsetY * curve]);
  }
  return points;
}

function animateCourier(points) {
  cancelAnimationFrame(courierFrame);
  if (!courierMarker || points.length < 2) return;
  const startedAt = performance.now();
  const duration = 24000;
  const move = (now) => {
    const progress = ((now - startedAt) % duration) / duration;
    const segment = progress * (points.length - 1);
    const index = Math.floor(segment);
    const ratio = segment - index;
    const from = points[index];
    const to = points[Math.min(index + 1, points.length - 1)];
    courierMarker.setLngLat([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]);
    courierFrame = requestAnimationFrame(move);
  };
  courierFrame = requestAnimationFrame(move);
}

function updateTrackingRoute() {
  if (!trackingMap?.isStyleLoaded()) return;
  const destination = stateRef.location
    ? [stateRef.location.lng, stateRef.location.lat]
    : [trackingOrigin[0] + 0.022, trackingOrigin[1] + 0.013];
  const points = makeTrackingRoute(trackingOrigin, destination);
  const route = { type: 'Feature', geometry: { type: 'LineString', coordinates: points }, properties: {} };
  if (trackingMap.getSource('courier-route')) {
    trackingMap.getSource('courier-route').setData(route);
  } else {
    trackingMap.addSource('courier-route', { type: 'geojson', data: route });
    trackingMap.addLayer({ id: 'courier-route-shadow', type: 'line', source: 'courier-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.9 } });
    trackingMap.addLayer({ id: 'courier-route-line', type: 'line', source: 'courier-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ef770c', 'line-width': 5, 'line-dasharray': [1.2, 1.4] } });
  }
  if (!destinationMarker) {
    const home = document.createElement('div');
    home.className = 'tracking-destination-marker';
    home.textContent = '⌂';
    home.setAttribute('aria-label', 'مقصد تحویل');
    destinationMarker = new maplibregl.Marker({ element: home, anchor: 'bottom' }).setLngLat(destination).addTo(trackingMap);
  }
  destinationMarker.setLngLat(destination);
  if (!courierMarker) {
    const scooter = document.createElement('div');
    scooter.className = 'tracking-courier-marker';
    scooter.textContent = '🛵';
    scooter.setAttribute('aria-label', 'پیک موتوری');
    courierMarker = new maplibregl.Marker({ element: scooter, anchor: 'center' }).setLngLat(trackingOrigin).addTo(trackingMap);
  }
  animateCourier(points);
  trackingMap.fitBounds(new maplibregl.LngLatBounds(trackingOrigin, destination), {
    padding: { top: 62, right: 58, bottom: 62, left: 58 }, maxZoom: 14, duration: 500
  });
}

export function initTrackingMap(state) {
  stateRef = state;
  const canvas = $('#tracking-map');
  if (!canvas || !mapApiKey) {
    $('#tracking-map-fallback').hidden = false;
    return;
  }
  try {
    trackingMap = new maplibregl.Map({
      container: canvas,
      style: 'https://static.neshan.org/sdk/maplibre/styles/dark.json',
      center: trackingOrigin,
      zoom: 12,
      apiKey: mapApiKey,
      logoPosition: 'bottom-left',
      copyRightPosition: 'bottom-right'
    });
    trackingMap.on('load', () => {
      $('#tracking-map-fallback').hidden = true;
      updateTrackingRoute();
    });
    trackingMap.on('error', (event) => console.warn('Tracking map resource error:', event.error?.message || event.error || 'unknown'));
    window.addEventListener('workflow:tracking-visible', () => setTimeout(() => {
      trackingMap?.resize();
      updateTrackingRoute();
    }, 150));
    document.addEventListener('location:changed', () => updateTrackingRoute());
  } catch (error) {
    console.error('Tracking map initialization failed:', error?.message || error);
    $('#tracking-map-fallback').hidden = false;
  }
}

function setStatus(message, kind = '') {
  const el = $('#location-status');
  el.className = `location-status ${kind}`;
  el.innerHTML = `<span class="status-dot"></span><span>${message}</span>`;
}

function setMapStatus(message, kind = '') {
  const el = $('.map-live');
  el.className = `map-live ${kind}`;
  el.title = message;
  el.setAttribute('aria-label', message);
  const code = message.match(/\b(\d{3})\b/)?.[1];
  const label = kind === 'error' ? `خطای نقشه${code ? ` ${fa(code)}` : ''}` : message;
  el.innerHTML = `<i></i><span>${label}</span>`;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ensureMap(center = defaultCenter, zoom = 12) {
  if (map) {
    map.resize();
    return map;
  }
  if (!mapApiKey) {
    setMapStatus('کلید وب نقشه تنظیم نشده', 'error');
    return null;
  }

  try {
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://static.neshan.org/sdk/maplibre/styles/dark.json',
      center,
      zoom,
      apiKey: mapApiKey,
      logoPosition: 'bottom-left',
      copyRightPosition: 'bottom-right'
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.on('load', () => {
      $('#map-placeholder').hidden = true;
      if (!mapHasError) setMapStatus('نقشهٔ نشان آماده است', 'success');
      if (currentUser) drawUser(currentUser);
      if (stateRef.restaurants.length) renderRestaurants(stateRef.restaurants);
    });
    map.on('click', (event) => {
      if (!manualMode) return;
      setUserLocation({ lat: event.lngLat.lat, lng: event.lngLat.lng }, 'موقعیت به‌صورت دستی انتخاب شد.');
      manualMode = false;
    });
    map.on('error', (event) => {
      const error = event.error;
      const message = error?.message || String(error || 'خطای نامشخص در بارگذاری نقشه');
      const statusCode = error?.status || error?.statusCode || Number(message.match(/Tile request failed:\s*(\d+)/)?.[1]) || null;
      const safeMessage = message.replace(/(https?:\/\/[^\s?]+)\?[^\s)]+/g, '$1?[query redacted]');
      console.warn(`Neshan map resource error: ${JSON.stringify({ message: safeMessage, status: statusCode, source: event.sourceId || null })}`);
      if (statusCode === 401 || statusCode === 403 || statusCode === 485 || !map.isStyleLoaded()) {
        mapHasError = true;
        const hint = statusCode === 401 || statusCode === 403 || statusCode === 485
          ? `نشان درخواست کاشی نقشه را رد کرد${statusCode ? ` (کد ${statusCode})` : ''}؛ اعتبار کلید وب، محدودیت دامنه و فعال بودن سرویس نقشه را در پنل بررسی کن.`
          : 'دریافت سبک نقشه شکست خورد؛ اتصال شبکه، دسترسی دامنه و کلید نشان را بررسی کن.';
        setMapStatus(hint, 'error');
      }
    });
    $('#map-placeholder').hidden = true;
    return map;
  } catch (error) {
    console.error('Neshan map initialization failed:', error?.message || error);
    setMapStatus('نقشه آغاز نشد؛ کلید، شبکه و WebGL را بررسی کن', 'error');
    return null;
  }
}

function radiusPolygon(lng, lat, radius = 5000) {
  const coordinates = [];
  for (let index = 0; index <= 64; index += 1) {
    const angle = index * 2 * Math.PI / 64;
    const eastMeters = radius * Math.cos(angle);
    const northMeters = radius * Math.sin(angle);
    coordinates.push([
      lng + eastMeters / (111320 * Math.cos(lat * Math.PI / 180)),
      lat + northMeters / 110540
    ]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coordinates] }, properties: {} };
}

function drawUser(location) {
  if (!map?.isStyleLoaded()) return;
  userMarker?.remove();
  const element = document.createElement('div');
  element.className = 'user-pin';
  element.innerHTML = '<i></i>';
  userMarker = new maplibregl.Marker({ element }).setLngLat([location.lng, location.lat]).addTo(map);

  const data = radiusPolygon(location.lng, location.lat);
  if (map.getSource('search-radius')) {
    map.getSource('search-radius').setData(data);
  } else {
    map.addSource('search-radius', { type: 'geojson', data });
    map.addLayer({ id: 'search-radius-fill', type: 'fill', source: 'search-radius', paint: { 'fill-color': '#f4ae32', 'fill-opacity': .08 } });
    map.addLayer({ id: 'search-radius-line', type: 'line', source: 'search-radius', paint: { 'line-color': '#f4ae32', 'line-opacity': .7, 'line-width': 1.5, 'line-dasharray': [3, 2] } });
  }
}

function setUserLocation(location, message) {
  currentUser = location;
  stateRef.location = location;
  document.dispatchEvent(new CustomEvent('location:changed', { detail: location }));
  const activeMap = ensureMap([location.lng, location.lat], 13);
  if (activeMap) activeMap.flyTo({ center: [location.lng, location.lat], zoom: 13, essential: true });
  drawUser(location);
  setStatus(message, 'success');
  $('#search-button').disabled = !activeMap;
  $('#result-count').textContent = `موقعیت: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
  if (stateRef.food) findRestaurants();
}

function escapeHtml(value = '') {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

function focusRestaurant(place) {
  if (!map) return;
  const coordinate = [place.location[1], place.location[0]];
  map.flyTo({ center: coordinate, zoom: 15, essential: true });
  new maplibregl.Popup({ offset: 20, closeButton: true })
    .setLngLat(coordinate)
    .setHTML(`<strong>${escapeHtml(place.title)}</strong><br><small>${place.distance ? `${fa(Math.round(place.distance))} متر مسیر` : 'فاصلهٔ مستقیم کمتر از ۵ کیلومتر'}</small>`)
    .addTo(map);
}

function addRestaurantMarker(place, index) {
  const element = document.createElement('button');
  element.className = 'restaurant-pin';
  element.type = 'button';
  element.textContent = String(index + 1);
  element.setAttribute('aria-label', `نمایش ${place.title} روی نقشه`);
  const marker = new maplibregl.Marker({ element }).setLngLat([place.location[1], place.location[0]]).addTo(map);
  element.addEventListener('click', () => focusRestaurant(place));
  return marker;
}

function renderRestaurants(places) {
  if (!map?.isStyleLoaded()) return;
  restaurantMarkers.forEach((marker) => marker.remove());
  restaurantMarkers = places.map(addRestaurantMarker);
}

function normalizePlace(item) {
  const properties = item.properties || item;
  const geoJSONCoordinates = item.geometry?.coordinates || properties.geom?.coordinates;
  const rawLocation = properties.location || properties.coordinates;
  let lat;
  let lng;

  if (Array.isArray(geoJSONCoordinates)) {
    [lng, lat] = geoJSONCoordinates;
  } else if (Array.isArray(rawLocation)) {
    // Neshan's service examples use [latitude, longitude] for location arrays.
    [lat, lng] = rawLocation;
  } else if (rawLocation && typeof rawLocation === 'object') {
    lat = rawLocation.latitude ?? rawLocation.lat ?? rawLocation.y;
    lng = rawLocation.longitude ?? rawLocation.lng ?? rawLocation.lon ?? rawLocation.x;
  } else {
    lat = properties.latitude ?? properties.lat;
    lng = properties.longitude ?? properties.lng ?? properties.lon;
  }

  const title = properties.title || properties.name || item.title || item.name;
  const point = [Number(lat), Number(lng)];
  if (!title || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  return { ...properties, title, location: point, distance: Number(properties.distance) || null };
}

function renderCards(places) {
  const container = $('#restaurant-grid');
  container.innerHTML = '';
  places.forEach((place, index) => {
    const card = document.createElement('article');
    card.className = 'restaurant-card';
    card.innerHTML = `<div class="restaurant-card-top"><span class="restaurant-number">${fa(String(index + 1).padStart(2, '0'))}</span><span class="restaurant-distance">${place.distance ? `${fa((place.distance / 1000).toFixed(1))} کیلومتر مسیر` : 'کمتر از ۵ کیلومتر'}</span></div><h3>${escapeHtml(place.title)}</h3><p class="restaurant-meta">${fa(place.location[0].toFixed(5))}، ${fa(place.location[1].toFixed(5))}</p><div class="restaurant-card-bottom"><span>اطلاعات از نشان</span><button type="button">انتخاب رستوران ←</button></div>`;
    card.querySelector('button').addEventListener('click', () => {
      focusRestaurant(place);
      document.dispatchEvent(new CustomEvent('restaurant:selected', { detail: place }));
    });
    container.appendChild(card);
  });
}

async function findRestaurants() {
  if (!currentUser) return toast('ابتدا موقعیت مکانی‌ات را مشخص کن.');
  const searchTerm = foodSearchTerms[stateRef.food];
  if (!searchTerm) {
    setStatus('ابتدا یک غذا انتخاب کن تا مکان‌های مرتبط اطراف پیدا شوند.', 'error');
    return;
  }
  if (!serviceApiKey) {
    setStatus('کلید Service جست‌وجوی نشان تنظیم نشده. کلید Service را با نام VITE_NESHAN_SERVICE_API_KEY در .env.local بگذار و Vite را دوباره اجرا کن.', 'error');
    return;
  }
  setStatus(`در حال جست‌وجوی «${searchTerm}» در اطراف…`, 'loading');
  $('#search-button').disabled = true;

  try {
    const url = new URL('https://api.neshan.org/v1/search');
    url.searchParams.set('term', searchTerm);
    url.searchParams.set('lat', String(currentUser.lat));
    url.searchParams.set('lng', String(currentUser.lng));
    const response = await fetch(url, { headers: { 'Api-Key': serviceApiKey } });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const raw = Array.isArray(payload) ? payload : payload.items || payload.data || payload.features || [];
    const places = raw.map(normalizePlace).filter(Boolean).map((place) => ({
      ...place,
      distance: haversineMeters(currentUser.lat, currentUser.lng, place.location[0], place.location[1])
    })).filter((place) => place.distance <= 5000)
      .sort((a, b) => a.distance - b.distance);
    stateRef.restaurants = places;
    renderRestaurants(places);
    renderCards(places);
    setStatus(places.length
      ? `${fa(places.length)} مکان مرتبط با «${searchTerm}» در شعاع ۵ کیلومتری پیدا شد. منوی مکان‌ها را بررسی کن.`
      : `مکانی مرتبط با «${searchTerm}» در شعاع ۵ کیلومتری پیدا نشد.`, places.length ? 'success' : '');
    $('#result-count').textContent = `${fa(places.length)} مکان مرتبط در شعاع ۵ کیلومتری`;
    $('#results-number').textContent = fa(places.length);
    $('#results-state').hidden = places.length > 0;

    if (places.length) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([currentUser.lng, currentUser.lat]);
      places.forEach((place) => bounds.extend([place.location[1], place.location[0]]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 14 });
      $('#restaurants').scrollIntoView({ behavior: 'smooth' });
    }
  } catch (error) {
    console.error('Neshan food search failed:', error?.message || error);
    let message = 'خطا در اتصال به نشان. اتصال اینترنت و دسترسی سرویس را بررسی کن.';
    if (error.status === 401 || error.status === 403) message = 'کلید نامعتبر است یا سرویس جست‌وجو در پنل نشان فعال نیست.';
    else if (error.status === 483) message = 'جست‌وجوی نشان پاسخ HTTP 483 داد؛ کلید Service و دسترسی API جست‌وجو را در پنل نشان بررسی کن.';
    else if (error.status === 429) message = 'محدودیت تعداد درخواست نشان؛ کمی بعد دوباره امتحان کن.';
    setStatus(message, 'error');
    $('#results-state').hidden = false;
    $('#results-state').innerHTML = `<span class="results-state-icon">!</span><b>جست‌وجو انجام نشد</b><p>${message}</p><a href="#location">بازگشت به نقشه ↑</a>`;
  } finally {
    $('#search-button').disabled = !map || !currentUser;
  }
}

export function initLocation(state) {
  stateRef = state;
  ensureMap();
  document.addEventListener('workflow:map-visible', () => setTimeout(() => map?.resize(), 120));

  $('#locate-button').addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('این مرورگر از تعیین موقعیت مکانی پشتیبانی نمی‌کند.', 'error');
      return;
    }
    setStatus('در حال دریافت موقعیت مکانی…', 'loading');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setUserLocation({ lat: coords.latitude, lng: coords.longitude }, 'موقعیت مکانی با موفقیت دریافت شد.'),
      (error) => {
        const message = error.code === 1
          ? 'دسترسی به موقعیت رد شد؛ می‌توانی روی نقشه نقطه‌ای انتخاب کنی.'
          : error.code === 3
            ? 'زمان دریافت موقعیت تمام شد؛ دوباره تلاش کن.'
            : 'دریافت موقعیت ممکن نشد؛ تنظیمات مکان‌یابی را بررسی کن.';
        setStatus(message, 'error');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });

  $('#manual-location-button').addEventListener('click', () => {
    const activeMap = ensureMap();
    if (!activeMap) return;
    manualMode = true;
    $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setStatus('روی نقشه کلیک کن تا موقعیت دلخواهت ثبت شود.', 'loading');
    toast('برای تعیین موقعیت دستی روی نقشه کلیک کن.');
  });

  $('#search-button').addEventListener('click', findRestaurants);
  document.querySelectorAll('.primary-button[href="#location"]').forEach((link) => (
    link.addEventListener('click', () => setTimeout(() => ensureMap(), 250))
  ));
}
