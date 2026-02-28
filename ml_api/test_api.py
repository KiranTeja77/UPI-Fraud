"""
Quick test that the ML API is running and returns a valid response.
Run from project root:  python ml_api/test_api.py
Make sure the API is already running:  uvicorn ml_api.main:app --host 0.0.0.0 --port 5000
"""
import urllib.request
import urllib.error
import json

BASE = "http://localhost:5000"


def main():
    print("1. GET /health ...")
    try:
        req = urllib.request.Request(f"{BASE}/health", method="GET")
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read().decode())
            print("   ", data)
            if not data.get("model_loaded"):
                print("   WARNING: model not loaded. Run: python ml_api/train.py")
                return
    except urllib.error.URLError as e:
        print("   FAILED:", e)
        print("   Is the API running? Start it with: uvicorn ml_api.main:app --host 0.0.0.0 --port 5000")
        return

    print("\n2. POST /predict ...")
    body = json.dumps({
        "text": "Send 9999 to 9876543210@ybl for KYC update",
        "amount": 9999,
        "newPayee": True,
    }).encode("utf-8")
    try:
        req = urllib.request.Request(
            f"{BASE}/predict",
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read().decode())
            print("   probability:", data.get("probability"))
            print("   indicators:", data.get("indicators", []))
            print("   OK - ML API is working.")
    except urllib.error.URLError as e:
        print("   FAILED:", e)


if __name__ == "__main__":
    main()
