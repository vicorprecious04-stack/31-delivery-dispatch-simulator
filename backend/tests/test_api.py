import sys, tempfile
from pathlib import Path
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import config
from app.db import init_db
from app.main import app

# Each test receives a fresh database file; patch the shared path before startup.
def setup_function():
    global _tmp, _old
    _tmp = tempfile.TemporaryDirectory()
    _old = config.DB_PATH
    config.DB_PATH = str(Path(_tmp.name) / 'test.db')
    init_db(config.DB_PATH, seed_drivers=4)

def teardown_function():
    config.DB_PATH = _old
    _tmp.cleanup()

def payload(**overrides):
    data = {
        'customer_name':'Test Customer','package_description':'Envelope',
        'pickup_name':'Port Harcourt Pleasure Park','pickup_lat':4.8156,'pickup_lng':7.0214,
        'dropoff_name':'Mile 1 Market','dropoff_lat':4.7894,'dropoff_lng':7.0122,
        'expected_at':(datetime.now(timezone.utc)+timedelta(hours=3)).isoformat(),
        'vehicle_preference':'any','priority':'standard','fragile':False,'contactless':False,'notes':''
    }
    data.update(overrides); return data

def test_health_and_locations():
    with TestClient(app) as client:
        assert client.get('/health').json()['status']=='ok'
        assert len(client.get('/api/locations').json()) >= 20

def test_create_order_and_assignment():
    with TestClient(app) as client:
        response=client.post('/api/orders',json=payload())
        assert response.status_code==201, response.text
        order=response.json()
        assert order['status'] in {'driver_en_route','pending'}
        assert order['distance_km'] is not None if order['status']=='assigned' else True
        assert client.get(f"/api/orders/{order['id']}").status_code==200

def test_validation_past_same_location_and_out_of_bounds():
    with TestClient(app) as client:
        past=payload(expected_at=(datetime.now(timezone.utc)-timedelta(hours=1)).isoformat())
        assert client.post('/api/orders',json=past).status_code==422
        same=payload(dropoff_name='Port Harcourt Pleasure Park',dropoff_lat=4.8156,dropoff_lng=7.0214)
        assert client.post('/api/orders',json=same).status_code==422
        outside=payload(pickup_lat=5.5)
        assert client.post('/api/orders',json=outside).status_code==422

def test_pickup_wrong_code_rejected():
    with TestClient(app) as client:
        response=client.post('/api/orders',json=payload())
        order=response.json()
        # The simulated driver needs time to reach pickup; invalid transition is rejected until then.
        bad=client.post(f"/api/orders/{order['id']}/verify-pickup",json={'code':'123456'})
        assert bad.status_code==409

def test_cancel_order():
    with TestClient(app) as client:
        order=client.post('/api/orders',json=payload()).json()
        response=client.post(f"/api/orders/{order['id']}/cancel")
        assert response.status_code==200
        assert response.json()['status']=='cancelled'


def test_full_pickup_and_delivery_lifecycle():
    from app.db import connect, now_iso
    with TestClient(app) as client:
        order=client.post('/api/orders',json=payload()).json()
        oid=order['id']
        c=connect(); c.execute("UPDATE orders SET status='arrived_at_pickup',pickup_code='654321' WHERE id=?",(oid,)); c.execute("UPDATE drivers SET status='at_pickup' WHERE id=?",(order['driver_id'],)); c.commit(); c.close()
        wrong=client.post(f'/api/orders/{oid}/verify-pickup',json={'code':'111111'})
        assert wrong.status_code==400
        verified=client.post(f'/api/orders/{oid}/verify-pickup',json={'code':'654321'})
        assert verified.status_code==200 and verified.json()['status']=='in_transit'
        c=connect(); c.execute("UPDATE orders SET status='arrived_at_dropoff' WHERE id=?",(oid,)); c.commit(); c.close()
        delivered=client.post(f'/api/orders/{oid}/confirm-delivery')
        assert delivered.status_code==200 and delivered.json()['status']=='delivered'

def test_frontend_and_api_docs_are_served():
    with TestClient(app) as client:
        assert client.get('/').status_code==200
        assert 'Swift Route' in client.get('/').text
        assert client.get('/docs').status_code==200
