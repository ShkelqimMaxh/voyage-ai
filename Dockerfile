FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/start.sh ./start.sh
RUN chmod +x ./start.sh
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
CMD ["./start.sh"]
