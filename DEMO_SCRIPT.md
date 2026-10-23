# Swift Route — Five-minute demo script

## 0:00–0:45 — Product and architecture

Open the dashboard at `/`. Explain that this is a delivery dispatch prototype for Port Harcourt, with simulated drivers and orders. The browser uses vanilla JavaScript and Leaflet; FastAPI serves the UI and API; SQLite stores drivers, orders, lifecycle events, dispatch attempts and notifications. WebSockets push refresh events, and periodic HTTP refresh keeps the dashboard usable if the socket drops.

## 0:45–1:30 — Fleet map and driver assignment

Point out the map, status-coloured driver markers, available fleet panel, speed multiplier and delivery activity. Click a driver in the fleet panel to focus the map. Explain that Haversine distance is multiplied by 1.3 to approximate road distance and ETA uses a configurable 25 km/h default. Driver motion is interpolated toward waypoints, not snapped to actual roads.

## 1:30–2:30 — Create a delivery

Click **New delivery**. Choose a customer, package, pickup and drop-off landmark, expected delivery time, vehicle preference and priority. Submit. The backend validates the payload, stores the order and atomically selects an idle driver. Standard priority uses distance first with workload and completions as tie-breakers; express prioritises the nearest eligible driver. If no eligible driver exists, the order stays pending and dispatch retries.

## 2:30–3:30 — Follow the lifecycle

Open the order card. Explain the audit trail and state machine: pending → assigned → driver en route → arrived at pickup → pickup verified → in transit → arrived at drop-off → delivered. When the simulated driver reaches pickup, the order receives a six-digit pickup code. Enter the displayed code to confirm handover. At drop-off, mark the delivery as received. Notifications persist and remain visible after refresh. A contactless order auto-completes on arrival in the current simulation.

## 3:30–4:15 — Analytics and controls

Open **Analytics** to review order counts by status, average assignment time, driver utilisation and deliveries per driver. Increase simulation speed to 2×, 5× or 10× to accelerate a presentation. The reset action clears orders and resets the fleet.

## 4:15–5:00 — Trade-offs and next steps

- **SQLite vs PostgreSQL:** SQLite is frictionless for a single-process demo; production multi-worker coordination and scale call for PostgreSQL.
- **WebSockets vs polling:** WebSockets reduce update latency; polling is a practical fallback.
- **Haversine vs road routing:** distance is fast and dependency-free but does not know the road network or live traffic.
- **Next:** authentication and roles, routing provider, PostgreSQL, driver mobile view, richer audit/security controls, metrics and observability.

## Run before the demo

```bash
cd backend
pip install -r ../requirements.txt
uvicorn app.main:app --reload
```

Run tests from the repository root with `pytest -q backend/tests`.
