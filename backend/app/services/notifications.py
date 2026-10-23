"""Persist notification events so they remain visible after a page refresh."""
from ..db import connect, now_iso

def create_notification(message: str, order_id: int | None = None, kind: str = "info") -> dict:
    conn = connect()
    cur = conn.execute("INSERT INTO notifications(order_id,message,kind,created_at) VALUES(?,?,?,?)", (order_id, message, kind, now_iso()))
    row = dict(conn.execute("SELECT * FROM notifications WHERE id=?", (cur.lastrowid,)).fetchone())
    conn.commit(); conn.close(); return row
