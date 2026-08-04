FROM python:3.11-slim

WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# The dashboard is served by the same FastAPI app on the same origin.
# app/main.py resolves this as <parents[2]>/web, i.e. /app/web when main.py
# sits at /app/backend/app/main.py.
COPY web/ /app/web/

CMD ["sh", "-c", "python migrate.py && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
