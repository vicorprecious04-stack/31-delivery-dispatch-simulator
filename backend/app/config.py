"""Application configuration loaded from environment variables."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
DB_PATH = os.getenv("DB_PATH", str(ROOT_DIR / "swift_route.db"))
SIMULATION_TICK_SECONDS = max(0.2, float(os.getenv("SIMULATION_TICK_SECONDS", "1")))
DRIVER_COUNT = max(1, int(os.getenv("DRIVER_COUNT", "12")))
AVERAGE_SPEED_KMH = max(5.0, float(os.getenv("AVERAGE_SPEED_KMH", "25")))
ROAD_FACTOR = max(1.0, float(os.getenv("ROAD_FACTOR", "1.3")))
CORS_ORIGINS = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:8000").split(",") if x.strip()]
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() in {"1", "true", "yes"}
AUTO_VERIFY_PICKUP = os.getenv("AUTO_VERIFY_PICKUP", "false").lower() in {"1", "true", "yes"}
