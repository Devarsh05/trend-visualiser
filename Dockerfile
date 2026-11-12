FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install deps first so this layer is cached when only app code changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 8000

# Shell form so ${PORT} (set by Railway) expands; exec makes uvicorn PID 1 so it gets SIGTERM
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
