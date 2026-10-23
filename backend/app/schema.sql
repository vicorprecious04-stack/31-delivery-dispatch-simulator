PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS locations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, lat REAL NOT NULL, lng REAL NOT NULL,
 CHECK(lat BETWEEN 4.65 AND 4.98), CHECK(lng BETWEEN 6.85 AND 7.25)
);
CREATE TABLE IF NOT EXISTS drivers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('bike','car','van')),
 status TEXT NOT NULL CHECK(status IN ('idle','en_route_to_pickup','at_pickup','en_route_to_dropoff','offline')),
 lat REAL NOT NULL, lng REAL NOT NULL, current_order_id INTEGER, completed_count INTEGER NOT NULL DEFAULT 0,
 last_seen TEXT NOT NULL, FOREIGN KEY(current_order_id) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, package_description TEXT NOT NULL,
 pickup_name TEXT NOT NULL, pickup_lat REAL NOT NULL, pickup_lng REAL NOT NULL,
 dropoff_name TEXT NOT NULL, dropoff_lat REAL NOT NULL, dropoff_lng REAL NOT NULL,
 expected_at TEXT NOT NULL, vehicle_preference TEXT NOT NULL DEFAULT 'any' CHECK(vehicle_preference IN ('any','bike','car','van')),
 priority TEXT NOT NULL DEFAULT 'standard' CHECK(priority IN ('standard','express')), fragile INTEGER NOT NULL DEFAULT 0,
 contactless INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', user_name TEXT NOT NULL DEFAULT 'Dispatcher',
 status TEXT NOT NULL CHECK(status IN ('pending','assigned','driver_en_route','arrived_at_pickup','pickup_verified','in_transit','arrived_at_dropoff','delivered','cancelled','failed')),
 driver_id INTEGER, distance_km REAL, eta_minutes INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 pickup_code TEXT, verification_attempts INTEGER NOT NULL DEFAULT 0, assigned_at TEXT, delivered_at TEXT,
 FOREIGN KEY(driver_id) REFERENCES drivers(id)
);
CREATE TABLE IF NOT EXISTS order_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
 message TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, message TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'info',
 is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS dispatch_attempts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, driver_id INTEGER, outcome TEXT NOT NULL,
 detail TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_events_order_id ON order_events(order_id);
