const center = [4.8156, 7.0498];
let map, markers = new Map(), routeLayer = null, pickupMarker = null, dropoffMarker = null, tileLayer = null, fallbackLayer = null, tileErrors = 0;
export function initMap() {
  const el = document.getElementById('map');
  if (!window.L) { el.innerHTML = '<div class="empty-state">Map tiles are unavailable. Driver activity is still available in the fleet panel.</div>'; return null; }
  map = L.map(el, { zoomControl: false, maxBounds: [[4.65, 6.85], [4.98, 7.25]], maxBoundsViscosity: .7 }).setView(center, 12);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  tileLayer.on('tileerror', () => {
    tileErrors += 1;
    if (tileErrors >= 4 && !fallbackLayer) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620" viewBox="0 0 900 620"><rect width="900" height="620" fill="#e8eee8"/><path d="M-30 430 Q120 350 230 430 T500 410 T950 440" fill="none" stroke="#a8d3e8" stroke-width="90"/><g stroke="#fff" stroke-width="8" fill="none"><path d="M20 100 L880 510 M50 550 L780 40 M150 0 L400 620 M0 300 L900 250 M500 0 L550 620 M0 500 L900 80"/><path d="M20 100 L880 510 M50 550 L780 40 M150 0 L400 620 M0 300 L900 250 M500 0 L550 620 M0 500 L900 80" stroke="#c7d2cc" stroke-width="2"/></g><g fill="#425c50" font-family="Arial,sans-serif" font-size="19" font-weight="bold"><text x="350" y="285">PORT HARCOURT</text><text x="100" y="145" font-size="14">Rumuola</text><text x="630" y="170" font-size="14">Trans-Amadi</text><text x="130" y="475" font-size="14">Diobu</text><text x="650" y="500" font-size="14">Woji</text><text x="430" y="75" font-size="14">Rumuokoro</text></g></svg>`;
      fallbackLayer = L.imageOverlay(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, [[4.65,6.85],[4.98,7.25]], { opacity: 1 }).addTo(map);
      map.removeLayer(tileLayer);
      el.setAttribute('aria-label', 'Schematic fallback map of Port Harcourt with simulated driver markers');
    }
  });
  return map;
}
function driverColor(status) { return status === 'idle' ? '#20b886' : status === 'offline' ? '#8d98a9' : status === 'en_route_to_dropoff' ? '#7157e8' : '#f2a34a'; }
export function updateDrivers(drivers = []) {
  if (!map) return;
  const activeIds = new Set();
  drivers.forEach(d => {
    activeIds.add(d.id);
    const color = driverColor(d.status);
    const icon = L.divIcon({ className: '', html: `<div class="driver-marker" style="background:${color}">${escapeText((d.name || 'D').slice(0,1))}</div>`, iconSize: [25,25], iconAnchor: [12,12] });
    const popup = `<b>${escapeText(d.name)}</b><br>${escapeText(d.vehicle_type || 'Driver')} · ${escapeText(d.status.replaceAll('_',' '))}`;
    if (markers.has(d.id)) markers.get(d.id).setLatLng([d.lat,d.lng]).setIcon(icon).setPopupContent(popup);
    else markers.set(d.id, L.marker([d.lat,d.lng], { icon }).addTo(map).bindPopup(popup));
  });
  for (const [id, marker] of markers) if (!activeIds.has(id)) { map.removeLayer(marker); markers.delete(id); }
}
export function showOrderRoute(order, driver) {
  if (!map) return;
  clearRoute();
  const points = [];
  if (driver) points.push([driver.lat,driver.lng]);
  points.push([order.pickup_lat,order.pickup_lng],[order.dropoff_lat,order.dropoff_lng]);
  routeLayer = L.polyline(points, { color: '#7157e8', weight: 4, dashArray: '7 6', opacity: .85 }).addTo(map);
  pickupMarker = L.circleMarker([order.pickup_lat,order.pickup_lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#f2a34a', fillOpacity: 1 }).addTo(map).bindTooltip('Pickup: ' + escapeText(order.pickup_name));
  dropoffMarker = L.circleMarker([order.dropoff_lat,order.dropoff_lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#7157e8', fillOpacity: 1 }).addTo(map).bindTooltip('Drop-off: ' + escapeText(order.dropoff_name));
  map.fitBounds(routeLayer.getBounds().pad(.22), { maxZoom: 14 });
}
export function focusDriver(driver) { if (map && driver) map.setView([driver.lat,driver.lng],15); if (driver && markers.has(driver.id)) markers.get(driver.id).openPopup(); }
export function resetMap() { if (map) map.setView(center,12); clearRoute(); }
function clearRoute() { if (!map) return; [routeLayer,pickupMarker,dropoffMarker].forEach(x => x && map.removeLayer(x)); routeLayer=pickupMarker=dropoffMarker=null; }
function escapeText(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function getMap() { return map; }
