"""Swift Route FastAPI application and API endpoints."""
import asyncio, logging, math, random, sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from . import config
from .db import connect, init_db, now_iso
from .models import OrderCreate, CodeInput, SpeedInput
from .services.geo import road_distance_km, eta_minutes, in_city_bounds
from .services.dispatch import choose_driver
from .services.state_machine import validate_transition, InvalidTransition
from .services.notifications import create_notification
from .ws import manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("swift_route")
ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
SIM_SPEED = 1
AUTO_VERIFY = config.AUTO_VERIFY_PICKUP
_rng = random.Random()

def rowdict(row): return dict(row) if row is not None else None

def event(conn, order_id: int, old: str | None, new: str, message: str):
    conn.execute("INSERT INTO order_events(order_id,from_status,to_status,message,created_at) VALUES(?,?,?,?,?)", (order_id, old, new, message, now_iso()))

def transition(conn, order: dict, target: str, message: str):
    validate_transition(order["status"], target)
    conn.execute("UPDATE orders SET status=?,updated_at=? WHERE id=?", (target, now_iso(), order["id"]))
    event(conn, order["id"], order["status"], target, message)
    log.info("order_transition order_id=%s from=%s to=%s", order["id"], order["status"], target)
    return {**order, "status": target}

def emit_notification(message: str, order_id: int | None = None, kind: str = "info"):
    note = create_notification(message, order_id, kind)
    try: asyncio.get_running_loop().create_task(manager.broadcast({"type":"notification", "notification":note}))
    except RuntimeError: pass
    return note

def dispatch_order(order_id: int):
    """Assign one eligible driver transactionally; retry is triggered by simulation ticks."""
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        order = rowdict(conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone())
        if not order or order["status"] != "pending": conn.rollback(); return None
        drivers = [dict(x) for x in conn.execute("SELECT * FROM drivers WHERE status='idle' AND current_order_id IS NULL").fetchall()]
        driver = choose_driver(drivers, (order["pickup_lat"], order["pickup_lng"]), order["vehicle_preference"], order["priority"] == "express")
        if driver is None:
            previously_notified = conn.execute("SELECT COUNT(*) FROM dispatch_attempts WHERE order_id=? AND outcome='no_candidate'", (order_id,)).fetchone()[0] > 0
            conn.execute("INSERT INTO dispatch_attempts(order_id,outcome,detail,created_at) VALUES(?,?,?,?)", (order_id,"no_candidate","No eligible idle driver; will retry.",now_iso()))
            conn.commit()
            if not previously_notified: emit_notification(f"No drivers available for order #{order_id}; searching continues.",order_id,"warning")
            return None
        # Simulate occasional non-response. Try another eligible driver in this same transaction.
        candidates = sorted(drivers, key=lambda d: ((d["lat"]-order["pickup_lat"])**2+(d["lng"]-order["pickup_lng"])**2, d.get("completed_count",0)))
        if order["priority"] == "express": candidates.sort(key=lambda d: (d["lat"]-order["pickup_lat"])**2+(d["lng"]-order["pickup_lng"])**2)
        chosen = None
        for candidate in candidates:
            if _rng.random() < 0.10:
                conn.execute("INSERT INTO dispatch_attempts(order_id,driver_id,outcome,detail,created_at) VALUES(?,?,?,?,?)", (order_id,candidate["id"],"declined","Simulated driver did not respond; trying next candidate.",now_iso()))
                continue
            chosen = candidate; break
        if chosen is None:
            conn.execute("INSERT INTO dispatch_attempts(order_id,outcome,detail,created_at) VALUES(?,?,?,?)", (order_id,"retry","All eligible candidates failed to respond.",now_iso()))
            conn.commit(); return None
        dist = road_distance_km((chosen["lat"],chosen["lng"]),(order["pickup_lat"],order["pickup_lng"]))
        eta = eta_minutes(dist)
        driver_update = conn.execute("UPDATE drivers SET status='en_route_to_pickup',current_order_id=?,last_seen=? WHERE id=? AND status='idle' AND current_order_id IS NULL", (order_id,now_iso(),chosen["id"]))
        if driver_update.rowcount != 1: conn.rollback(); return None
        conn.execute("UPDATE orders SET driver_id=?,distance_km=?,eta_minutes=?,assigned_at=?,updated_at=? WHERE id=?", (chosen["id"],dist,eta,now_iso(),now_iso(),order_id))
        event(conn,order_id,"pending","assigned",f"Assigned to {chosen['name']}.")
        conn.execute("UPDATE orders SET status='assigned' WHERE id=?",(order_id,))
        event(conn,order_id,"assigned","driver_en_route",f"{chosen['name']} is en route to pickup.")
        conn.execute("UPDATE orders SET status='driver_en_route' WHERE id=?",(order_id,))
        conn.execute("INSERT INTO dispatch_attempts(order_id,driver_id,outcome,detail,created_at) VALUES(?,?,?,?,?)", (order_id,chosen["id"],"assigned",f"Assigned; pickup distance {dist:.2f} km.",now_iso()))
        conn.commit()
        log.info("dispatch_assigned order_id=%s driver_id=%s eta=%s",order_id,chosen["id"],eta)
        emit_notification(f"Driver {chosen['name']} assigned to order #{order_id}.",order_id,"success")
        try: asyncio.get_running_loop().create_task(manager.broadcast({"type":"order_updated","order_id":order_id}))
        except RuntimeError: pass
        return chosen
    except Exception:
        conn.rollback(); log.exception("dispatch_failed order_id=%s",order_id); raise
    finally: conn.close()

async def simulation_loop():
    """Move drivers, advance milestones, persist periodic positions, and retry pending orders."""
    tick = 0
    while True:
        conn = None
        try:
            await asyncio.sleep(config.SIMULATION_TICK_SECONDS / SIM_SPEED)
            tick += 1
            conn = connect()
            drivers = [dict(r) for r in conn.execute("SELECT * FROM drivers").fetchall()]
            positions = []
            # Persist notifications only after this tick commits. create_notification()
            # opens its own connection, which would otherwise contend with this writer.
            pending_notifications = []
            for d in drivers:
                if d["status"] == "offline":
                    if _rng.random() < 0.08: conn.execute("UPDATE drivers SET status='idle',last_seen=? WHERE id=?",(now_iso(),d["id"]))
                    continue
                if d["status"] == "idle":
                    if _rng.random() < 0.003: conn.execute("UPDATE drivers SET status='offline',last_seen=? WHERE id=?",(now_iso(),d["id"]))
                    continue
                order = rowdict(conn.execute("SELECT * FROM orders WHERE id=?",(d["current_order_id"],)).fetchone()) if d["current_order_id"] else None
                if not order: conn.execute("UPDATE drivers SET status='idle',current_order_id=NULL WHERE id=?",(d["id"],)); continue
                if d["status"] == "at_pickup" and order["status"] in {"arrived_at_pickup", "arrived_at_dropoff"}:
                    continue
                target = (order["pickup_lat"],order["pickup_lng"]) if d["status"] == "en_route_to_pickup" else (order["dropoff_lat"],order["dropoff_lng"])
                dist_deg = math.sqrt((target[0]-d["lat"])**2 + (target[1]-d["lng"])**2)
                # Faster demo speed multiplier affects distance moved per tick.
                step = 0.0014
                if dist_deg <= step:
                    lat,lng=target
                    if d["status"] == "en_route_to_pickup":
                        conn.execute("UPDATE drivers SET lat=?,lng=?,status='at_pickup',last_seen=? WHERE id=?",(lat,lng,now_iso(),d["id"]))
                        code=f"{_rng.randint(0,999999):06d}"
                        conn.execute("UPDATE orders SET status='arrived_at_pickup',pickup_code=?,updated_at=? WHERE id=?",(code,now_iso(),order["id"]))
                        event(conn,order["id"],order["status"],"arrived_at_pickup","Driver arrived at pickup; pickup code generated.")
                        pending_notifications.append((f"Driver arrived for order #{order['id']}. Pickup code: {code}", order["id"], "arrival"))
                    else:
                        conn.execute("UPDATE drivers SET lat=?,lng=?,status='at_pickup',last_seen=? WHERE id=?",(lat,lng,now_iso(),d["id"]))
                        if order["status"] == "in_transit":
                            conn.execute("UPDATE orders SET status='arrived_at_dropoff',updated_at=? WHERE id=?",(now_iso(),order["id"]))
                            event(conn,order["id"],"in_transit","arrived_at_dropoff","Driver arrived at drop-off.")
                            pending_notifications.append((f"Driver arrived at drop-off for order #{order['id']}.", order["id"], "arrival"))
                            if order["contactless"]:
                                conn.execute("UPDATE orders SET status='delivered',delivered_at=?,updated_at=? WHERE id=?",(now_iso(),now_iso(),order["id"]))
                                event(conn,order["id"],"arrived_at_dropoff","delivered","Contactless delivery automatically confirmed.")
                                conn.execute("UPDATE drivers SET status='idle',current_order_id=NULL,completed_count=completed_count+1 WHERE id=?",(d["id"],))
                                pending_notifications.append((f"Order #{order['id']} delivered.", order["id"], "success"))
                    if AUTO_VERIFY and d["status"] == "en_route_to_pickup": pass
                else:
                    ratio=step/dist_deg
                    lat=d["lat"]+(target[0]-d["lat"])*ratio; lng=d["lng"]+(target[1]-d["lng"])*ratio
                    conn.execute("UPDATE drivers SET lat=?,lng=?,last_seen=? WHERE id=?",(lat,lng,now_iso(),d["id"]))
                if tick % 5 == 0: positions.append({"id":d["id"],"name":d["name"],"lat":lat if dist_deg<=step else lat,"lng":lng if dist_deg<=step else lng,"status":d["status"]})
            # Auto-verification is intentionally configurable; user confirmation is default.
            if AUTO_VERIFY:
                arrived = conn.execute("SELECT id,driver_id FROM orders WHERE status='arrived_at_pickup'").fetchall()
                for o in arrived:
                    conn.execute("UPDATE orders SET status='pickup_verified',updated_at=? WHERE id=?",(now_iso(),o["id"]))
                    event(conn,o["id"],"arrived_at_pickup","pickup_verified","Pickup auto-verified by demo setting.")
                    conn.execute("UPDATE drivers SET status='en_route_to_dropoff' WHERE id=?",(o["driver_id"],))
                    conn.execute("UPDATE orders SET status='in_transit',updated_at=? WHERE id=?",(now_iso(),o["id"]))
                    event(conn,o["id"],"pickup_verified","in_transit","Package is in transit.")
            pending = [r[0] for r in conn.execute("SELECT id FROM orders WHERE status='pending'").fetchall()]
            if tick % 3 == 0:
                conn.commit()
                for oid in pending: dispatch_order(oid)
            else: conn.commit()
            # The driver/order transaction is now committed, so notification writes
            # on their own connections cannot deadlock against this tick.
            for note_message, note_order_id, note_kind in pending_notifications:
                emit_notification(note_message, note_order_id, note_kind)
            if tick % 5 == 0:
                broadcast_conn=connect()
                driver_snapshot=[dict(x) for x in broadcast_conn.execute("SELECT id,name,vehicle_type,status,lat,lng,current_order_id,completed_count FROM drivers").fetchall()]
                broadcast_conn.close()
                await manager.broadcast({"type":"drivers","drivers":driver_snapshot})
                await manager.broadcast({"type":"refresh"})
            conn.close()
        except asyncio.CancelledError: 
            raise
        except Exception: 
            log.exception("simulation_tick_failed"); 
            await asyncio.sleep(1)
        finally:
            if conn is not None:
                try: 
                    conn.close()
                except Exception:
                    log.exception("simulation_connection_close_failed")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    check_conn=connect(); existing_orders=check_conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]; check_conn.close()
    if config.DEMO_MODE and not existing_orders:
        conn=connect(); locs=conn.execute("SELECT * FROM locations ORDER BY id LIMIT 5").fetchall()
        now=datetime.now(timezone.utc)
        for i in range(3):
            p,d=locs[i],locs[i+1]
            cur=conn.execute("INSERT INTO orders(customer_name,package_description,pickup_name,pickup_lat,pickup_lng,dropoff_name,dropoff_lat,dropoff_lng,expected_at,vehicle_preference,priority,status,created_at,updated_at,user_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (['Ada Johnson','Chika Okoro','David Briggs'][i],['Documents','Food package','Small parcel'][i],p['name'],p['lat'],p['lng'],d['name'],d['lat'],d['lng'],(now+timedelta(hours=2+i)).isoformat(),'any','standard','pending',now_iso(),now_iso(),'Demo'))
            event(conn,cur.lastrowid,None,'pending','Demo order created.')
        conn.commit(); conn.close()
    task=asyncio.create_task(simulation_loop())
    yield
    task.cancel()
    try: await task
    except asyncio.CancelledError: pass

app=FastAPI(title="Swift Route API", version="1.0.0", description="Delivery dispatch simulation for Port Harcourt.", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False, allow_methods=["GET","POST","OPTIONS"], allow_headers=["Content-Type"])

@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """Reject oversized request bodies before they reach Pydantic or database code."""
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > 1_000_000:
        return JSONResponse(status_code=413, content={"error":{"code":"request_too_large","message":"Request body must be smaller than 1 MB."}})
    return await call_next(request)

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(x) for x in first.get("loc", []) if x != "body")
    message = first.get("msg", "Request validation failed.")
    if field: message = f"{field}: {message}"
    return JSONResponse(status_code=422, content={"error":{"code":"validation_error","message":message}})

@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    log.exception("unhandled_error path=%s",request.url.path)
    return JSONResponse(status_code=500,content={"error":{"code":"internal_error","message":"An unexpected server error occurred."}})

@app.get("/health")
def health(): return {"status":"ok","service":"swift-route"}
@app.get("/api/locations")
def locations():
    c=connect(); rows=[dict(r) for r in c.execute("SELECT * FROM locations ORDER BY name")]; c.close(); return rows
@app.get("/api/drivers")
def drivers():
    c=connect(); rows=[dict(r) for r in c.execute("SELECT * FROM drivers ORDER BY name")]; c.close(); return rows
@app.get("/api/orders")
def orders(status: str | None = None, search: str | None = None):
    c=connect(); sql="SELECT o.*,d.name AS driver_name,d.vehicle_type AS driver_vehicle FROM orders o LEFT JOIN drivers d ON d.id=o.driver_id"; clauses=[]; args=[]
    if status: clauses.append("o.status=?"); args.append(status)
    if search: clauses.append("o.customer_name LIKE ?"); args.append(f"%{search}%")
    if clauses: sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY o.created_at DESC"; rows=[dict(r) for r in c.execute(sql,args)]; c.close(); return rows
@app.get("/api/orders/{order_id}")
def get_order(order_id: int):
    c=connect(); row=c.execute("SELECT o.*,d.name AS driver_name,d.vehicle_type AS driver_vehicle FROM orders o LEFT JOIN drivers d ON d.id=o.driver_id WHERE o.id=?",(order_id,)).fetchone(); events=[dict(r) for r in c.execute("SELECT * FROM order_events WHERE order_id=? ORDER BY id",(order_id,))]; c.close()
    if not row: raise HTTPException(404,detail={"error":{"code":"not_found","message":"Order not found."}})
    result=dict(row); result["events"]=events; return result
@app.post("/api/orders",status_code=201)
def create_order(payload: OrderCreate):
    c=connect(); now=now_iso()
    try:
        cur=c.execute("INSERT INTO orders(customer_name,package_description,pickup_name,pickup_lat,pickup_lng,dropoff_name,dropoff_lat,dropoff_lng,expected_at,vehicle_preference,priority,fragile,contactless,notes,user_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          (payload.customer_name.strip(),payload.package_description.strip(),payload.pickup_name,payload.pickup_lat,payload.pickup_lng,payload.dropoff_name,payload.dropoff_lat,payload.dropoff_lng,payload.expected_at.isoformat(),payload.vehicle_preference,payload.priority,int(payload.fragile),int(payload.contactless),payload.notes,payload.user_name,"pending",now,now))
        oid=cur.lastrowid; event(c,oid,None,"pending","Delivery request created."); c.commit()
    except sqlite3.Error:
        c.rollback(); log.exception("create_order_failed"); raise HTTPException(500,detail={"error":{"code":"database_error","message":"Could not create order."}})
    finally: c.close()
    dispatch_order(oid)
    return get_order(oid)
@app.post("/api/orders/{order_id}/cancel")
def cancel_order(order_id: int):
    c=connect(); row=rowdict(c.execute("SELECT * FROM orders WHERE id=?",(order_id,)).fetchone())
    if not row: c.close(); raise HTTPException(404,detail={"error":{"code":"not_found","message":"Order not found."}})
    if row["status"] not in {"pending","assigned","driver_en_route","arrived_at_pickup"}: c.close(); raise HTTPException(409,detail={"error":{"code":"invalid_transition","message":"Order can only be cancelled before pickup is verified."}})
    try: transition(c,row,"cancelled","Order cancelled by dispatcher.")
    except InvalidTransition as e: c.close(); raise HTTPException(409,detail={"error":{"code":"invalid_transition","message":str(e)}})
    c.execute("UPDATE drivers SET status='idle',current_order_id=NULL WHERE current_order_id=?",(order_id,)); c.commit(); c.close(); emit_notification(f"Order #{order_id} cancelled.",order_id,"warning"); return get_order(order_id)
@app.post("/api/orders/{order_id}/verify-pickup")
def verify_pickup(order_id: int, payload: CodeInput):
    c=connect(); order=rowdict(c.execute("SELECT * FROM orders WHERE id=?",(order_id,)).fetchone())
    if not order: c.close(); raise HTTPException(404,detail={"error":{"code":"not_found","message":"Order not found."}})
    if order["status"] != "arrived_at_pickup": c.close(); raise HTTPException(409,detail={"error":{"code":"invalid_transition","message":"Pickup can only be verified after the driver arrives."}})
    if payload.code != order["pickup_code"]:
        attempts=order["verification_attempts"]+1; c.execute("UPDATE orders SET verification_attempts=? WHERE id=?",(attempts,order_id)); c.commit(); c.close()
        if attempts >= 3: emit_notification(f"Pickup verification failed three times for order #{order_id}.",order_id,"warning")
        raise HTTPException(400,detail={"error":{"code":"wrong_code","message":f"Incorrect pickup code. {max(0,3-attempts)} attempts remaining."}})
    transition(c,order,"pickup_verified","Pickup handover verified by sender.")
    c.execute("UPDATE drivers SET status='en_route_to_dropoff' WHERE id=?",(order["driver_id"],)); updated=rowdict(c.execute("SELECT * FROM orders WHERE id=?",(order_id,)).fetchone()); transition(c,updated,"in_transit","Package is in transit."); c.commit(); c.close()
    emit_notification(f"Order #{order_id} is now in transit.",order_id,"success"); return get_order(order_id)
@app.post("/api/orders/{order_id}/confirm-delivery")
def confirm_delivery(order_id: int):
    c=connect(); order=rowdict(c.execute("SELECT * FROM orders WHERE id=?",(order_id,)).fetchone())
    if not order: c.close(); raise HTTPException(404,detail={"error":{"code":"not_found","message":"Order not found."}})
    if order["status"] != "arrived_at_dropoff": c.close(); raise HTTPException(409,detail={"error":{"code":"invalid_transition","message":"Driver must arrive at drop-off before delivery can be confirmed."}})
    transition(c,order,"delivered","Recipient confirmed delivery."); c.execute("UPDATE orders SET delivered_at=? WHERE id=?",(now_iso(),order_id)); c.execute("UPDATE drivers SET status='idle',current_order_id=NULL,completed_count=completed_count+1 WHERE id=?",(order["driver_id"],)); c.commit(); c.close(); emit_notification(f"Order #{order_id} delivered successfully.",order_id,"success"); return get_order(order_id)
@app.get("/api/notifications")
def notifications():
    c=connect(); rows=[dict(r) for r in c.execute("SELECT * FROM notifications ORDER BY id DESC LIMIT 100")]; c.close(); return rows
@app.post("/api/notifications/read")
def mark_notifications_read():
    c=connect(); c.execute("UPDATE notifications SET is_read=1"); c.commit(); c.close(); return {"ok":True}
@app.get("/api/analytics/summary")
def analytics():
    c=connect(); total=c.execute("SELECT COUNT(*) FROM orders").fetchone()[0]; by_status=[dict(r) for r in c.execute("SELECT status,COUNT(*) AS count FROM orders GROUP BY status")]
    avg_delivery=c.execute("SELECT AVG((julianday(delivered_at)-julianday(created_at))*1440) FROM orders WHERE delivered_at IS NOT NULL").fetchone()[0]
    avg_assign=c.execute("SELECT AVG((julianday(assigned_at)-julianday(created_at))*1440) FROM orders WHERE assigned_at IS NOT NULL").fetchone()[0]
    driver_count=c.execute("SELECT COUNT(*) FROM drivers").fetchone()[0]; busy=c.execute("SELECT COUNT(*) FROM drivers WHERE status NOT IN ('idle','offline')").fetchone()[0]
    per_driver=[dict(r) for r in c.execute("SELECT d.name,COUNT(o.id) AS deliveries FROM drivers d LEFT JOIN orders o ON o.driver_id=d.id AND o.status='delivered' GROUP BY d.id ORDER BY deliveries DESC")]; c.close()
    return {"total_orders":total,"by_status":by_status,"average_delivery_minutes":round(avg_delivery,1) if avg_delivery else None,"average_assignment_minutes":round(avg_assign,1) if avg_assign else None,"driver_utilisation_percent":round(100*busy/driver_count,1) if driver_count else 0,"deliveries_per_driver":per_driver}
@app.post("/api/simulation/speed")
def set_speed(payload: SpeedInput):
    global SIM_SPEED; SIM_SPEED=payload.multiplier; return {"multiplier":SIM_SPEED}
@app.post("/api/simulation/reset")
def reset_demo():
    c=connect(); c.execute("DELETE FROM notifications"); c.execute("DELETE FROM dispatch_attempts"); c.execute("DELETE FROM order_events"); c.execute("DELETE FROM orders"); c.execute("UPDATE drivers SET status='idle',current_order_id=NULL,completed_count=0"); c.commit(); c.close()
    if config.DEMO_MODE:
        # The next application restart seeds demo orders; return explicit reset status for deterministic demos.
        return {"ok":True,"message":"Orders cleared and fleet reset. Create a delivery to begin a new demo."}
    return {"ok":True,"message":"Orders cleared and fleet reset."}
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        await ws.send_json({"type":"connected"})
        while True: await ws.receive_text()
    except WebSocketDisconnect: manager.disconnect(ws)
    except Exception: manager.disconnect(ws)

# Serve static frontend at root after API routes are registered.
if FRONTEND.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
    @app.get("/", include_in_schema=False)
    def index(): return FileResponse(FRONTEND / "index.html")
