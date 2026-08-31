# ---- Stage 1: build the Expo web bundle (frontend) ----
FROM node:20-slim AS web-build
WORKDIR /web
COPY mobile ./
RUN npm ci
RUN npx expo export -p web

# ---- Stage 2: Python backend, serving the API + built web app ----
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/start.sh ./start.sh
RUN chmod +x ./start.sh
COPY --from=web-build /web/dist ./mobile/dist
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
CMD ["./start.sh"]
