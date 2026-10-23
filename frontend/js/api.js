const API = '';
export async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail?.error || data.error || {};
    throw new Error(detail.message || data.detail || `Request failed (${response.status})`);
  }
  return data;
}
export const getDrivers = () => request('/api/drivers');
export const getLocations = () => request('/api/locations');
export const getOrders = (status = '', search = '') => request(`/api/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}) })}`);
export const getOrder = id => request(`/api/orders/${id}`);
export const createOrder = body => request('/api/orders', { method: 'POST', body: JSON.stringify(body) });
export const cancelOrder = id => request(`/api/orders/${id}/cancel`, { method: 'POST' });
export const verifyPickup = (id, code) => request(`/api/orders/${id}/verify-pickup`, { method: 'POST', body: JSON.stringify({ code }) });
export const confirmDelivery = id => request(`/api/orders/${id}/confirm-delivery`, { method: 'POST' });
export const getNotifications = () => request('/api/notifications');
export const markRead = () => request('/api/notifications/read', { method: 'POST' });
export const getAnalytics = () => request('/api/analytics/summary');
export const setSpeed = multiplier => request('/api/simulation/speed', { method: 'POST', body: JSON.stringify({ multiplier: Number(multiplier) }) });
export const resetDemo = () => request('/api/simulation/reset', { method: 'POST' });
