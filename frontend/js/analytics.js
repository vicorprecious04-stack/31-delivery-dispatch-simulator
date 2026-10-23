import { getAnalytics } from './api.js';
const nice = s => s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export async function renderAnalytics() {
  const a=await getAnalytics();
  document.getElementById('avg-assignment').textContent=a.average_assignment_minutes == null ? '—' : `${a.average_assignment_minutes} min`;
  document.getElementById('utilisation').textContent=`${a.driver_utilisation_percent}%`;
  document.getElementById('total-orders').textContent=a.total_orders;
  const max=Math.max(1,...a.by_status.map(x=>x.count)); const chart=document.getElementById('status-chart'); chart.replaceChildren();
  a.by_status.forEach(s=>{const row=document.createElement('div');row.className='chart-row';row.innerHTML=`<span>${nice(s.status)}</span><div class="bar-track"><div class="bar-fill" style="width:${s.count/max*100}%"></div></div><b>${s.count}</b>`;chart.append(row);});
  const driverChart=document.getElementById('driver-chart');driverChart.replaceChildren(); const drivers=a.deliveries_per_driver.slice(0,12); const dmax=Math.max(1,...drivers.map(d=>d.deliveries));
  drivers.forEach(d=>{const item=document.createElement('div');item.className='driver-bar';item.innerHTML=`<b>${d.deliveries}</b><div class="bar-column"><i style="height:${Math.max(4,d.deliveries/dmax*100)}%"></i></div><span title="${d.name}">${d.name.split(' ')[0]}</span>`;driverChart.append(item);});
}
