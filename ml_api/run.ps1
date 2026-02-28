# Run ML API (after: pip install -r requirements.txt; python train.py)
Set-Location $PSScriptRoot
uvicorn main:app --host 0.0.0.0 --port 5000
