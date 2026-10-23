# Swift Route --- Delivery Dispatch Simulator

Swift Route is a prototype delivery dispatch simulator designed around
delivery operations in Port Harcourt, Rivers State, Nigeria. It
demonstrates order management, driver assignment, simulated movement,
delivery status updates, notifications, and operational analytics.

> **Project status:** Prototype / local demo. Public deployment, user
> authentication and role-based authorization, driver
> registration/accounts, live GPS tracking, and road-based turn-by-turn
> navigation are not yet implemented. Driver positions and routes are
> simulated.

## Features

-   Dashboard centered on Port Harcourt using Leaflet and OpenStreetMap
    tiles.
-   Simulated drivers and seeded locations around local neighbourhoods
    and landmarks.
-   Create and manage delivery orders.
-   Dispatch orders to eligible drivers, with standard/express priority
    options.
-   Track order lifecycle and delivery status.
-   Estimated distance and delivery time based on geographic distance
    and configurable speed.
-   Pickup-code verification and delivery confirmation flows for the
    simulation.
-   Notifications, an event audit trail, and analytics summaries.
-   WebSocket updates with browser reconnect behavior and periodic REST
    refresh as a fallback.
-   Responsive frontend built with HTML, CSS, and vanilla JavaScript.
-   FastAPI backend, SQLite storage, pytest tests, and Docker support.

## Technology stack

-   **Frontend:** HTML, CSS, Vanilla JavaScript, Leaflet
-   **Backend:** Python 3.11+, FastAPI, Pydantic
-   **Database:** SQLite
-   **Real-time updates:** WebSockets
-   **Testing:** pytest
-   **Containerization:** Docker

## Requirements

-   Python 3.11 or newer
-   pip
-   A modern web browser
-   Internet access for the OpenStreetMap tiles and external frontend
    assets

## Run locally

### 1. Get the project

Clone the repository or extract the project ZIP, then open a terminal in
the project root (the folder containing `requirements.txt`).

### 2. Create and activate a virtual environment

**Windows PowerShell**

``` powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

**macOS / Linux**

``` bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

``` bash
pip install -r requirements.txt
```

### 4. Start the server

From the project root:

``` bash
uvicorn app.main:app --app-dir backend --reload
```

If you are already inside the `backend` directory, run:

``` bash
uvicorn app.main:app --reload
```

### 5. Open the application

-   **Dashboard:** http://127.0.0.1:8000
-   **API documentation:** http://127.0.0.1:8000/docs
-   **Health check:** http://127.0.0.1:8000/health

On first startup, the application initializes the database and seeds
demo locations and drivers. Demo mode may create sample orders if the
database has no orders.

To stop the server, press `Ctrl+C` in the terminal.

## Configuration

The application supports the following environment variables. Defaults
below reflect the current project configuration; confirm them in
`backend/app/config.py` if you change the code.

  ------------------------------------------------------------------------------
  Variable                    Default                    Description
  --------------------------- -------------------------- -----------------------
  `HOST`                      `0.0.0.0`                  Bind address when
                                                         passed to the server

  `PORT`                      `8000`                     Port used by the server

  `DB_PATH`                   `backend/swift_route.db`   SQLite database file
                                                         path

  `SIMULATION_TICK_SECONDS`   `1`                        Interval between
                                                         simulation updates

  `DRIVER_COUNT`              `12`                       Number of seeded
                                                         drivers

  `AVERAGE_SPEED_KMH`         `25`                       Average speed used for
                                                         ETA estimates

  `ROAD_FACTOR`               `1.3`                      Multiplier applied to
                                                         straight-line distance

  `CORS_ORIGINS`              `http://localhost:8000`    Comma-separated allowed
                                                         origins

  `DEMO_MODE`                 `true`                     Enables sample order
                                                         creation for an empty
                                                         database

  `AUTO_VERIFY_PICKUP`        `false`                    Automatically verifies
                                                         pickup in demo
                                                         scenarios
  ------------------------------------------------------------------------------

Set environment variables in your shell or hosting platform before
starting the server. A `.env.example` file is included as a reference;
automatic loading of a `.env` file depends on the configured environment
loader.

Example PowerShell configuration:

``` powershell
$env:DB_PATH = "backend/swift_route.db"
$env:PORT = "8000"
uvicorn app.main:app --app-dir backend --reload
```

## API overview

The interactive API documentation at `/docs` lists the available
endpoints. Current endpoint groups include:

-   `GET /health`
-   `GET /api/drivers`
-   `GET /api/locations`
-   `GET /api/orders`
-   `POST /api/orders`
-   `GET /api/orders/{id}`
-   `POST /api/orders/{id}/cancel`
-   `POST /api/orders/{id}/verify-pickup`
-   `POST /api/orders/{id}/confirm-delivery`
-   `GET /api/notifications`
-   `POST /api/notifications/read`
-   `GET /api/analytics/summary`
-   `POST /api/simulation/speed`
-   `POST /api/simulation/reset`
-   `WS /ws`

See `/docs` for request schemas, response formats, and the latest route
definitions.

## Run tests

From the project root:

``` bash
pip install -r requirements.txt
pytest -q backend/tests
```

The existing tests cover selected geographic calculations, dispatch
behavior, order-state transitions, API health, seed data, validation,
assignment, and cancellation.

## Docker

Build the image from the project root:

``` bash
docker build -t swift-route .
```

Run it with a persistent Docker volume for the SQLite database:

``` bash
docker run --rm -p 8000:8000 \
  -v swift-route-data:/data \
  -e DB_PATH=/data/swift_route.db \
  swift-route
```

Then open http://127.0.0.1:8000.

## Deployment notes

The project has **not been confirmed as publicly deployed**. Railway is
one possible hosting option for an initial single-service deployment.

For a hosted SQLite deployment:

1.  Deploy the project from a Git repository or its Dockerfile.
2.  Attach a persistent volume mounted at `/data`.
3.  Set `DB_PATH=/data/swift_route.db`.
4.  Set the service's start command to match the actual repository
    layout and hosting environment.
5.  Configure `CORS_ORIGINS` to include the deployed application origin.
6.  Test the dashboard, API, WebSocket connection, and database
    persistence after restart/redeployment.

Do not run multiple app instances against the same SQLite file. For a
larger deployment, consider PostgreSQL and a coordinated
simulation/background-worker design.

## Known limitations and planned work

The following items are not yet complete and should be treated as future
work:

-   **Deployment:** Publish the application and verify it in a hosted
    environment.
-   **Authentication and authorization:** Add secure sign-in, password
    handling, sessions/tokens, and role-based access for administrators,
    dispatchers, customers, and drivers.
-   **Driver registration and accounts:** Add driver onboarding, profile
    management, account status, and availability controls.
-   **Customer accounts:** Add customer registration, sign-in, order
    history, and customer-specific tracking views.
-   **Live GPS tracking:** Receive location updates from real driver
    devices, with appropriate permission and privacy controls.
-   **Navigation and routing:** Integrate a routing service for
    road-following routes, turn-by-turn directions, and traffic-aware
    ETAs.
-   **More accurate ETA:** Replace straight-line-derived estimates with
    route distance, current traffic data where available, and realistic
    pickup/delivery handling.
-   **Notifications and communication:** Consider production-ready
    email, SMS, or push notifications and customer/driver communication.
-   **Security and production hardening:** Add rate limiting, secrets
    management, audit protections, backups, monitoring, and stronger
    integration/load tests.
-   **Payments and real courier integrations:** Not currently included.

### Current map and ETA behavior

The map uses real map tiles, but simulated driver movement is
illustrative and does not follow road geometry. Distance estimates use
Haversine (straight-line) distance with a configurable road factor, and
ETA is derived from an average speed. These values are useful for a demo
but are not reliable real-world navigation or traffic predictions.

## SQLite locking note

The notification workflow was adjusted to avoid writing notifications
before the simulation's driver/order transaction commits. This addresses
the identified contention pattern that could cause `database is locked`.
WAL mode and a busy timeout are also used.

If the app is already running, stop older Uvicorn/Swift Route processes
before starting a new instance. Avoid running multiple app instances
against the same SQLite database file. The existing database should not
need to be deleted to apply this fix.

## Project structure

``` text
swift_route/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── db.py
│   │   ├── models.py
│   │   ├── schema.sql
│   │   ├── config.py
│   │   ├── ws.py
│   │   ├── routes/
│   │   ├── services/
│   │   └── seed/
│   └── tests/
├── frontend/
│   ├── index.html
│   ├── css/
│   └── js/
├── requirements.txt
├── Dockerfile
├── .env.example
└── README.md
```

## License

No license has been specified yet. Add a `LICENSE` file before
distributing the project for reuse.
