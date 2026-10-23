import math
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
DB_PATH = os.environ.get("DISPATCH_DB", str(Path(__file__).resolve().parent / "dispatch.db"))

# Approximate demo locations (not live GPS or road distances).
ZONES = {
    "GRA": (4.8156, 7.0498), "Woji": (4.8310, 7.0780), "Rumuola": (4.8370, 7.0180),
    "Trans Amadi": (4.8000, 7.0700), "Town": (4.7770, 7.0130),
}
DRIVERS = [
    (1, "Chinedu Okafor", "08011111111", "GRA"), (2, "Amaka Nwosu", "08022222222", "Woji"),
    (3, "Emeka Daniel", "08033333333", "Rumuola"), (4, "Blessing George", "08044444444", "Trans Amadi"),
    (5, "David Johnson", "08055555555", "Town"),
]
ACTIVE = "('Assigned','Picked Up','In Transit')"
TRANSITIONS = {
    "Pending": {"Cancelled"},
    "Assigned": {"Picked Up", "Cancelled"},
    "Picked Up": {"In Transit", "Cancelled"},
    "In Transit": {"Delivered", "Cancelled"},
    "Delivered": set(),
    "Cancelled": set(),
}

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL, phone TEXT NOT NULL, location TEXT NOT NULL,
    lat REAL NOT NULL, lon REAL NOT NULL,
    online INTEGER NOT NULL DEFAULT 1 CHECK (online IN (0, 1))
);
CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT NOT NULL, pickup TEXT NOT NULL, destination TEXT NOT NULL,
    lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lon REAL NOT NULL CHECK (lon BETWEEN -180 AND 180),
    status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending','Assigned','Picked Up','In Transit','Delivered','Cancelled')),
    driver_id INTEGER REFERENCES drivers(id),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id INTEGER REFERENCES deliveries(id),
    message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
"""

DELIVERY_SQL = """
SELECT d.id, d.customer, d.pickup, d.destination, d.lat, d.lon, d.status,
       d.driver_id, r.name AS driver_name, d.created_at, d.updated_at
FROM deliveries d LEFT JOIN drivers r ON r.id = d.driver_id
"""


# ---------- database helpers ----------

@contextmanager
def db(write=False):
    """One connection per request. Commits on success, rolls back on any error, always closes.
    write=True takes the write lock up front so two requests can't claim the same driver."""
    con = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        con.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield con
        con.execute("COMMIT")
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise
    finally:
        con.close()


def init_db():
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("PRAGMA journal_mode = WAL")
        con.executescript(SCHEMA)
        con.executemany(
            "INSERT OR IGNORE INTO drivers (id, name, phone, location, lat, lon) VALUES (?,?,?,?,?,?)",
            [(i, n, p, z, *ZONES[z]) for i, n, p, z in DRIVERS],
        )
        con.commit()
    finally:
        con.close()


def now():
    return datetime.now(timezone.utc).isoformat()


def log(con, delivery_id, message):
    con.execute("INSERT INTO activities (delivery_id, message, created_at) VALUES (?,?,?)",
                (delivery_id, message, now()))


# ---------- dispatch logic ----------

def distance_km(lat1, lon1, lat2, lon2):
    """Straight-line (haversine) distance in km."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(min(1, a)))


def free_drivers(con):
    """Available = online AND no active delivery. Derived, never stored, so it can't go out of sync."""
    return con.execute(
        f"""SELECT * FROM drivers d WHERE d.online = 1 AND NOT EXISTS
            (SELECT 1 FROM deliveries x WHERE x.driver_id = d.id AND x.status IN {ACTIVE})"""
    ).fetchall()


def assign(con, delivery_id, lat, lon):
    drivers = free_drivers(con)
    if not drivers:
        return None
    best = min(drivers, key=lambda d: distance_km(lat, lon, d["lat"], d["lon"]))
    con.execute("UPDATE deliveries SET driver_id=?, status='Assigned', updated_at=? WHERE id=?",
                (best["id"], now(), delivery_id))
    log(con, delivery_id, f"Assigned to {best['name']}")
    return best


def assign_waiting(con):
    """When a driver frees up, give them the oldest Pending delivery."""
    for d in con.execute("SELECT id, lat, lon FROM deliveries WHERE status='Pending' ORDER BY id").fetchall():
        if not assign(con, d["id"], d["lat"], d["lon"]):
            break


# ---------- validation ----------

class ApiError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


@app.errorhandler(ApiError)
def handle_api_error(e):
    return jsonify(error=e.message), e.status


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Send the request body as a JSON object")
    return data


def text(data, key, max_len=150):
    v = data.get(key)
    if not isinstance(v, str) or not v.strip():
        raise ApiError(f"{key} is required")
    if len(v.strip()) > max_len:
        raise ApiError(f"{key} must be at most {max_len} characters")
    return v.strip()


def number(data, key, lo, hi):
    v = data.get(key)
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
        raise ApiError(f"{key} must be a number between {lo} and {hi}")
    return float(v)


# ---------- routes ----------

@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify(status="ok")


@app.get("/api/deliveries")
def list_deliveries():
    status = request.args.get("status")
    if status and status not in TRANSITIONS:
        raise ApiError("Invalid status filter")
    with db() as con:
        sql = DELIVERY_SQL + (" WHERE d.status = ?" if status else "") + " ORDER BY d.id DESC"
        rows = con.execute(sql, (status,) if status else ()).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/deliveries")
def create_delivery():
    data = body()
    customer, pickup = text(data, "customer", 100), text(data, "pickup")
    destination = text(data, "destination")
    lat, lon = number(data, "lat", -90, 90), number(data, "lon", -180, 180)
    ts = now()
    with db(write=True) as con:
        cur = con.execute(
            "INSERT INTO deliveries (customer, pickup, destination, lat, lon, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?)", (customer, pickup, destination, lat, lon, ts, ts))
        delivery_id = cur.lastrowid
        log(con, delivery_id, "Delivery created")
        assign(con, delivery_id, lat, lon)
        row = con.execute(DELIVERY_SQL + " WHERE d.id = ?", (delivery_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.patch("/api/deliveries/<int:delivery_id>/status")
def update_status(delivery_id):
    new = body().get("status")
    with db(write=True) as con:
        row = con.execute("SELECT status FROM deliveries WHERE id=?", (delivery_id,)).fetchone()
        if not row:
            raise ApiError("Delivery not found", 404)
        old = row["status"]
        if not isinstance(new, str) or new not in TRANSITIONS[old]:
            raise ApiError(f"Cannot change delivery from {old} to {new}", 409)
        con.execute("UPDATE deliveries SET status=?, updated_at=? WHERE id=?", (new, now(), delivery_id))
        log(con, delivery_id, f"Status changed from {old} to {new}")
        if new in ("Delivered", "Cancelled"):
            assign_waiting(con)
    return jsonify(id=delivery_id, status=new)


@app.get("/api/drivers")
def list_drivers():
    with db() as con:
        rows = con.execute(
            f"""SELECT r.id, r.name, r.phone, r.location, r.online,
                (SELECT COUNT(*) FROM deliveries d WHERE d.driver_id=r.id AND d.status IN {ACTIVE}) AS active_deliveries,
                (SELECT COUNT(*) FROM deliveries d WHERE d.driver_id=r.id AND d.status='Delivered') AS completed_deliveries
                FROM drivers r ORDER BY r.name""").fetchall()
    return jsonify([{**dict(r), "online": bool(r["online"]),
                     "available": bool(r["online"]) and r["active_deliveries"] == 0} for r in rows])


@app.patch("/api/drivers/<int:driver_id>")
def set_driver_online(driver_id):
    online = body().get("online")
    if not isinstance(online, bool):
        raise ApiError("online must be true or false")
    with db(write=True) as con:
        driver = con.execute("SELECT name FROM drivers WHERE id=?", (driver_id,)).fetchone()
        if not driver:
            raise ApiError("Driver not found", 404)
        busy = con.execute(f"SELECT 1 FROM deliveries WHERE driver_id=? AND status IN {ACTIVE}",
                           (driver_id,)).fetchone()
        if busy and not online:
            raise ApiError("Driver has an active delivery", 409)
        con.execute("UPDATE drivers SET online=? WHERE id=?", (int(online), driver_id))
        log(con, None, f"{driver['name']} went {'online' if online else 'offline'}")
        if online:
            assign_waiting(con)
    return jsonify(id=driver_id, online=online)


@app.get("/api/analytics")
def analytics():
    with db() as con:
        c = con.execute(
            f"""SELECT COUNT(*) AS total,
                COALESCE(SUM(status IN {ACTIVE}), 0) AS active,
                COALESCE(SUM(status='Delivered'), 0) AS delivered,
                COALESCE(SUM(status='Pending'), 0) AS pending,
                COALESCE(SUM(status='Cancelled'), 0) AS cancelled
                FROM deliveries""").fetchone()
        available = len(free_drivers(con))
    return jsonify(total_deliveries=c["total"], active_deliveries=c["active"], delivered=c["delivered"],
                   pending=c["pending"], cancelled=c["cancelled"], available_drivers=available)


@app.get("/api/activities")
def list_activities():
    with db() as con:
        rows = con.execute("SELECT id, delivery_id, message, created_at FROM activities "
                           "ORDER BY id DESC LIMIT 50").fetchall()
    return jsonify([dict(r) for r in rows])


init_db()  # runs on import so `gunicorn app:app` also gets a ready database

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)