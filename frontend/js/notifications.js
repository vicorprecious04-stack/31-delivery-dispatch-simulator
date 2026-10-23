import { getNotifications, markRead } from './api.js';
const escapeText = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderNotifications() {
  try {
    const notes = await getNotifications();
    document.getElementById('notification-count').textContent = notes.filter(n=>!n.is_read).length;
    const list = document.getElementById('notification-list');
    list.replaceChildren();
    if (!notes.length) { list.innerHTML = '<p class="muted">No notifications yet. Delivery updates will appear here.</p>'; return; }
    notes.slice(0,6).forEach(n => {
      const item=document.createElement('article'); item.className='notification-item';
      item.innerHTML=`<span class="notification-icon">${n.kind==='arrival'?'↗':n.kind==='warning'?'!':'✓'}</span><div><b>${escapeText(n.message)}</b><small>${new Date(n.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>`;
      list.append(item);
    });
  } catch (e) { console.warn('Notifications unavailable',e); }
}
export async function markAllRead() { await markRead(); await renderNotifications(); }
export function toast(message, kind='success') {
  const stack=document.getElementById('toast-stack'); const el=document.createElement('div'); el.className=`toast ${kind}`; el.textContent=message; stack.append(el); setTimeout(()=>el.remove(),4500);
}
