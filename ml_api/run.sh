#!/usr/bin/env bash
# Run ML API (after: pip install -r requirements.txt && python train.py)
cd "$(dirname "$0")"
uvicorn main:app --host 0.0.0.0 --port 5000
