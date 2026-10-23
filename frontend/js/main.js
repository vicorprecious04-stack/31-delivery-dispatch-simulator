import { getDrivers,getLocations,getOrders,getOrder,createOrder,cancelOrder,verifyPickup,confirmDelivery,setSpeed,resetDemo } from './api.js';
import { initMap,updateDrivers,showOrderRoute,focusDriver,resetMap } from './map.js';
import { connectWebSocket } from './ws.js';
import { renderNotifications,markAllRead,toast } from './notifications.js';
import { renderAnalytics } from './analytics.js';
let drivers=[],locations=[],orders=[],selectedOrder=null,refreshTimer=null;
const $=id=>document.getElementById(id);
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=s=>String(s||'pending').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const terminal=new Set(['delivered','cancelled','failed']);
function statusClass(s){return ['pending','delivered','cancelled','failed','in_transit','driver_en_route','assigned'].includes(s)?s:'';}
function orderProgress(status){const steps=['assigned','driver_en_route','arrived_at_pickup','pickup_verified','in_transit','arrived_at_dropoff','delivered'];return Math.max(0,steps.indexOf(status));}
async function loadAll() {
  try {
    [drivers,locations,orders]=await Promise.all([getDrivers(),getLocations(),getOrders($('status-filter').value,$('order-search').value)]);
    renderDrivers();updateDrivers(drivers);renderOrders();renderStats();await renderNotifications();
    $('map-updated').textContent=`Updated ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
  } catch(e){toast(`Unable to load dashboard: ${e.message}`,'error');}
}
function renderDrivers(){
  const online=drivers.filter(d=>d.status!=='offline').length;$('fleet-live-count').textContent=`${online} drivers online`;
  const list=$('fleet-list');list.replaceChildren();
  drivers.forEach(d=>{const el=document.createElement('div');el.className='driver-item';el.title=`Focus ${d.name} on map`;el.innerHTML=`<span class="driver-avatar">${escapeText(d.name.split(' ').map(x=>x[0]).slice(0,2).join(''))}</span><span class="driver-meta"><b>${escapeText(d.name)}</b><small>${escapeText(d.vehicle_type)} · ${escapeText(d.status.replaceAll('_',' '))}</small></span><i class="tiny-status ${d.status==='offline'?'offline':d.status==='idle'?'':'busy'}"></i>`;el.addEventListener('click',()=>focusDriver(d));list.append(el);});
}
function renderStats(){
  const active=orders.filter(o=>!terminal.has(o.status)).length;const available=drivers.filter(d=>d.status==='idle').length;const delivered=orders.filter(o=>o.status==='delivered').length;
  $('stat-active').textContent=active;$('stat-drivers').textContent=available;$('stat-drivers-foot').textContent=`of ${drivers.length} total drivers`;$('stat-delivered').textContent=delivered;
  const deliveredOrders=orders.filter(o=>o.delivered_at);const avg=deliveredOrders.length?deliveredOrders.reduce((sum,o)=>sum+(new Date(o.delivered_at)-new Date(o.created_at))/60000,0)/deliveredOrders.length:null;$('stat-eta').innerHTML=avg==null?'—<small> min</small>':`${Math.round(avg)}<small> min</small>`;
}
function etaLabel(o){
  if(o.status==='delivered') return 'Completed';
  if(o.status==='cancelled'||o.status==='failed') return pretty(o.status);
  if(o.status==='pending'||!o.driver_id) return 'Searching for driver…';
  if(o.status==='arrived_at_pickup') return 'At pickup';
  if(o.status==='arrived_at_dropoff') return 'At drop-off';
  const speed=Math.max(1,Number($('speed-select')?.value||1));
  // During the pickup leg, count down from the server's assignment estimate.
  if(o.status==='assigned'||o.status==='driver_en_route'){
    if(!o.assigned_at||o.eta_minutes==null) return 'Calculating ETA…';
    const elapsed=Math.max(0,(Date.now()-new Date(o.assigned_at).getTime())/60000)*speed;
    return `~${Math.max(0,Math.ceil(Number(o.eta_minutes)-elapsed))} min to pickup`;
  }
  // During transit, estimate remaining time from the latest simulated driver position.
  if(o.status==='pickup_verified'||o.status==='in_transit'){
    const driver=drivers.find(d=>d.id===o.driver_id);
    if(!driver) return 'Updating ETA…';
    const lat1=Number(driver.lat),lat2=Number(o.dropoff_lat),lng1=Number(driver.lng),lng2=Number(o.dropoff_lng);
    const toRad=n=>n*Math.PI/180;
    const a=Math.sin(toRad(lat2-lat1)/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(toRad(lng2-lng1)/2)**2;
    const km=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))*1.3;
    return `~${Math.max(1,Math.ceil(km/25*60/speed))} min to drop-off`;
  }
  return o.eta_minutes!=null?`~${o.eta_minutes} min ETA`:'Calculating ETA…';
}
function updateEtaLabels(){
  document.querySelectorAll('[data-eta-order-id]').forEach(el=>{
    const order=orders.find(o=>String(o.id)===el.dataset.etaOrderId);
    if(order) el.textContent=etaLabel(order);
  });
}
function renderOrders(){
  const list=$('order-list');list.replaceChildren();
  if(!orders.length){list.innerHTML='<div class="empty-state">No deliveries match your filters.<br>Start by creating a new delivery.</div>';return;}
  orders.forEach(o=>{const el=document.createElement('article');el.className='order-card';el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',`Open order ${o.id} for ${o.customer_name}`);
    el.innerHTML=`<div class="order-top"><span class="order-code">SR-${String(o.id).padStart(4,'0')}</span><span class="status-pill ${statusClass(o.status)}">${escapeText(pretty(o.status))}</span></div><div class="order-customer">${escapeText(o.customer_name)}</div><div class="order-package">${escapeText(o.package_description)}</div><div class="route-pair"><span>● ${escapeText(o.pickup_name)}</span><i class="route-line"></i><span>◆ ${escapeText(o.dropoff_name)}</span></div><div class="order-bottom"><span class="driver-tag"><span class="driver-mini">${escapeText((o.driver_name||'—').split(' ').map(x=>x[0]).slice(0,2).join(''))}</span>${escapeText(o.driver_name||'Searching for a driver…')}</span><span class="order-eta" data-eta-order-id="${o.id}">${escapeText(etaLabel(o))}</span></div>`;
    const open=()=>openOrder(o.id);el.addEventListener('click',open);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});list.append(el);
  });
  updateEtaLabels();
}
async function openOrder(id){
  try{const o=await getOrder(id);selectedOrder=o;$('detail-id').textContent=`ORDER SR-${String(o.id).padStart(4,'0')}`;$('detail-title').textContent=o.customer_name;$('detail-subtitle').textContent=o.package_description;
    const driver=drivers.find(d=>d.id===o.driver_id);showOrderRoute(o,driver);
    const progress=orderProgress(o.status);const pct=o.status==='delivered'?100:o.status==='pending'?5:Math.round(progress/6*100);
    let action='';
    if(o.status==='arrived_at_pickup') action=`<div class="pickup-code"><small>HANDOVER VERIFICATION CODE</small><strong>${escapeText(o.pickup_code||'------')}</strong><p class="muted">Share this code with the dispatcher to verify the package handover.</p><form id="verify-code-form" class="code-form"><input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required placeholder="Enter 6-digit code" aria-label="Pickup verification code"><button class="primary-button">Confirm handover</button></form></div>`;
    if(o.status==='arrived_at_dropoff') action='<button id="confirm-delivery-button" class="primary-button">✓ Mark as received</button>';
    if(['pending','assigned','driver_en_route','arrived_at_pickup'].includes(o.status)) action+='<button id="cancel-order-button" class="secondary-button">Cancel delivery</button>';
    $('order-detail-content').innerHTML=`<div class="detail-content"><div class="detail-status"><span class="status-pill ${statusClass(o.status)}">${escapeText(pretty(o.status))}</span><b>${o.eta_minutes?`Estimated ${o.eta_minutes} min`:'Awaiting driver assignment'}</b></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="detail-route"><div><small>PICKUP LOCATION</small><b>${escapeText(o.pickup_name)}</b></div><div><small>DROP-OFF LOCATION</small><b>${escapeText(o.dropoff_name)}</b></div></div><div class="detail-route"><div><small>ASSIGNED DRIVER</small><b>${escapeText(o.driver_name||'Searching for a driver…')}</b></div><div><small>ESTIMATED DISTANCE</small><b>${o.distance_km?`${Number(o.distance_km).toFixed(1)} km`:'Pending assignment'}</b></div></div><div class="detail-route"><div><small>EXPECTED DELIVERY</small><b>${new Date(o.expected_at).toLocaleString()}</b></div><div><small>PRIORITY / VEHICLE</small><b>${escapeText(pretty(o.priority))} · ${escapeText(o.vehicle_preference)}</b></div></div>${action}<div><h3 style="font:700 12px Manrope">Delivery timeline</h3>${(o.events||[]).map(ev=>`<div class="metric-row"><span>${escapeText(ev.message)}</span><small>${new Date(ev.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>`).join('')}</div></div>`;
    $('order-modal').hidden=false;
    $('verify-code-form')?.addEventListener('submit',async e=>{e.preventDefault();const code=new FormData(e.currentTarget).get('code');try{await verifyPickup(id,code);toast('Pickup verified — package is in transit.');$('order-modal').hidden=true;await loadAll();}catch(err){toast(err.message,'error');}});
    $('confirm-delivery-button')?.addEventListener('click',async()=>{try{await confirmDelivery(id);toast('Delivery completed successfully.');$('order-modal').hidden=true;await loadAll();}catch(e){toast(e.message,'error');}});
    $('cancel-order-button')?.addEventListener('click',async()=>{if(!confirm('Cancel this delivery?'))return;try{await cancelOrder(id);toast('Delivery cancelled.','warning');$('order-modal').hidden=true;await loadAll();}catch(e){toast(e.message,'error');}});
  }catch(e){toast(e.message,'error');}
}
function populateLocations(){
  const options=locations.map(l=>`<option value="${l.id}">${escapeText(l.name)}</option>`).join('');$('pickup-select').innerHTML=options;$('dropoff-select').innerHTML=options;
  if(locations.length>1)$('dropoff-select').selectedIndex=1;
}
function updateEstimate(){const p=locations.find(l=>String(l.id)===$('pickup-select').value),d=locations.find(l=>String(l.id)===$('dropoff-select').value);if(!p||!d)return;
  const km=Math.sqrt(Math.pow((p.lat-d.lat)*111,2)+Math.pow((p.lng-d.lng)*111*Math.cos(p.lat*Math.PI/180),2))*1.3;const min=Math.max(1,Math.ceil(km/25*60));$('delivery-hint').textContent=p.id===d.id?'Pickup and drop-off must be different locations.':`Estimated journey: ${km.toFixed(1)} km · about ${min} min at average city speed. Allow extra time for traffic.`;
}
function openNewDelivery(){ $('form-error').textContent='';$('delivery-modal').hidden=false;updateEstimate();$('delivery-form').elements.customer_name.focus(); }
async function submitDelivery(e){e.preventDefault();$('form-error').textContent='';const form=e.currentTarget;const data=new FormData(form);const p=locations.find(l=>String(l.id)===data.get('pickup')),d=locations.find(l=>String(l.id)===data.get('dropoff'));
  if(!p||!d||p.id===d.id){$('form-error').textContent='Please choose different pickup and drop-off locations.';return;}
  const expected=new Date(data.get('expected_at'));if(!data.get('expected_at')||expected<=new Date()){$('form-error').textContent='Expected delivery time must be in the future.';return;}
  const body={customer_name:data.get('customer_name').trim(),package_description:data.get('package_description').trim(),pickup_name:p.name,pickup_lat:p.lat,pickup_lng:p.lng,dropoff_name:d.name,dropoff_lat:d.lat,dropoff_lng:d.lng,expected_at:expected.toISOString(),vehicle_preference:data.get('vehicle_preference'),priority:data.get('priority'),fragile:data.has('fragile'),contactless:data.has('contactless'),notes:data.get('notes')||'',user_name:'Dispatcher'};
  $('submit-delivery').disabled=true;$('submit-delivery').textContent='Finding driver…';
  try{const o=await createOrder(body);$('delivery-modal').hidden=true;form.reset();populateLocations();toast(o.driver_name?`Order #${o.id} assigned to ${o.driver_name}.`:'Order created — searching for a driver…',o.driver_name?'success':'warning');await loadAll();if(o.id)openOrder(o.id);}
  catch(err){$('form-error').textContent=err.message;}
  finally{$('submit-delivery').disabled=false;$('submit-delivery').textContent='Find a driver →';}
}
function switchView(view){const dash=view==='dashboard';$('dashboard-view').hidden=!dash;$('analytics-view').hidden=dash;$('page-title').textContent=dash?'Dispatch overview':'Fleet analytics';document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(!dash)renderAnalytics().catch(e=>toast(e.message,'error'));}
function setupEvents(){
  $('new-delivery-button').addEventListener('click',openNewDelivery);$('close-modal').addEventListener('click',()=>$('delivery-modal').hidden=true);$('cancel-modal').addEventListener('click',()=>$('delivery-modal').hidden=true);$('delivery-modal').addEventListener('click',e=>{if(e.target===$('delivery-modal'))$('delivery-modal').hidden=true;});$('delivery-form').addEventListener('submit',submitDelivery);
  $('close-order-modal').addEventListener('click',()=>$('order-modal').hidden=true);$('order-modal').addEventListener('click',e=>{if(e.target===$('order-modal'))$('order-modal').hidden=true;});$('pickup-select').addEventListener('change',updateEstimate);$('dropoff-select').addEventListener('change',updateEstimate);
  $('status-filter').addEventListener('change',loadAll);let searchDelay; $('order-search').addEventListener('input',()=>{clearTimeout(searchDelay);searchDelay=setTimeout(loadAll,250);});$('refresh-orders').addEventListener('click',loadAll);$('map-reset').addEventListener('click',resetMap);
  $('speed-select').addEventListener('change',async e=>{try{await setSpeed(e.target.value);toast(`Simulation speed set to ${e.target.value}×`);}catch(err){toast(err.message,'error');}});
  $('reset-demo').addEventListener('click',async()=>{if(!confirm('Clear orders and reset all drivers?'))return;try{const r=await resetDemo();toast(r.message,'warning');await loadAll();}catch(e){toast(e.message,'error');}});
  $('notification-button').addEventListener('click',()=>$('notification-list').scrollIntoView({behavior:'smooth',block:'center'}));$('mark-read').addEventListener('click',()=>markAllRead().then(()=>toast('Notifications marked as read.')).catch(e=>toast(e.message,'error')));
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('delivery-modal').hidden=true;$('order-modal').hidden=true;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();openNewDelivery();}});
}
async function start(){initMap();setupEvents();try{locations=await getLocations();populateLocations();const soon=new Date(Date.now()+2*60*60*1000);soon.setMinutes(Math.ceil(soon.getMinutes()/5)*5,0,0);$('expected-at').value=`${soon.getFullYear()}-${String(soon.getMonth()+1).padStart(2,'0')}-${String(soon.getDate()).padStart(2,'0')}T${String(soon.getHours()).padStart(2,'0')}:${String(soon.getMinutes()).padStart(2,'0')}`;}catch(e){toast(`Location list failed to load: ${e.message}`,'error');}
  await loadAll();connectWebSocket(evt=>{if(evt.type==='notification'){renderNotifications();toast(evt.notification?.message||'Delivery update received',evt.notification?.kind==='warning'?'warning':'success');loadAll();}else if(['refresh','drivers','order_updated'].includes(evt.type)){loadAll();}});refreshTimer=setInterval(()=>loadAll(),10000);setInterval(updateEtaLabels,1000);
}
start();
