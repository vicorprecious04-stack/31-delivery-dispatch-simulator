"""SQLite connection, schema initialisation, and deterministic demo seeding."""
import json, random, sqlite3
from datetime import datetime, timezone
from pathlib import Path
from . import config
DRIVER_COUNT = config.DRIVER_COUNT
from .services.geo import CITY_CENTER

APP_DIR = Path(__file__).resolve().parent
NAMES = ["Adaeze Okafor", "Chinedu Nwosu", "Tari Eze", "Emeka Nnamdi", "Blessing Wokocha", "Ifeanyi Obi", "Amaka Briggs", "Tamuno George", "Kelechi Dike", "Favour Hart", "Boma West", "Obinna Kalu", "Nengi Davies", "Osi Okon", "Somto Nwankwo", "Ebiere Jack"]

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def connect(path: str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(
        path or config.DB_PATH, 
        timeout=30, 
        check_same_thread=False,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn

def init_db(path: str | None = None, seed_drivers: int = DRIVER_COUNT) -> None:
    db_path = path or config.DB_PATH
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript((APP_DIR / "schema.sql").read_text(encoding="utf-8"))
    count = conn.execute("SELECT COUNT(*) FROM locations").fetchone()[0]
    if count == 0:
        locations = json.loads((APP_DIR / "seed" / "locations.json").read_text(encoding="utf-8"))
        conn.executemany("INSERT INTO locations(name,lat,lng) VALUES(?,?,?)", [(x["name"], x["lat"], x["lng"]) for x in locations])
    if conn.execute("SELECT COUNT(*) FROM drivers").fetchone()[0] == 0:
        rng = random.Random(2026)
        locations = conn.execute("SELECT lat,lng FROM locations").fetchall()
        for i in range(seed_drivers):
            loc = locations[i % len(locations)]
            lat = max(4.68, min(4.95, loc[0] + rng.uniform(-0.008, 0.008)))
            lng = max(6.88, min(7.20, loc[1] + rng.uniform(-0.008, 0.008)))
            conn.execute("INSERT INTO drivers(name,vehicle_type,status,lat,lng,last_seen) VALUES(?,?,?,?,?,?)",
                         (NAMES[i % len(NAMES)], ["bike", "car", "van"][i % 3], "idle", lat, lng, now_iso()))
    conn.commit(); conn.close()
