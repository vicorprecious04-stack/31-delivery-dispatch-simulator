"""Small WebSocket broadcast manager; clients reconnect with exponential backoff."""
import asyncio, json
from fastapi import WebSocket
class ConnectionManager:
    def __init__(self): self.connections: set[WebSocket] = set()
    async def connect(self, ws: WebSocket):
        await ws.accept(); self.connections.add(ws)
    def disconnect(self, ws: WebSocket): self.connections.discard(ws)
    async def broadcast(self, payload: dict):
        dead = []
        for ws in list(self.connections):
            try: await ws.send_text(json.dumps(payload, default=str))
            except Exception: dead.append(ws)
        for ws in dead: self.disconnect(ws)
manager = ConnectionManager()
