# Dockerfile

# --- Stage 1: Build React App ---
FROM node:20 AS react-builder
WORKDIR /app/frontend

COPY ./frontend/package.json ./frontend/package-lock.json* ./
RUN npm install
COPY ./frontend /app/frontend
RUN npm run build

# --- Stage 2: Build Python/Flask App with Nginx ---
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

RUN apt-get update && apt-get install -y nginx && apt-get clean

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY nginx.conf /etc/nginx/sites-available/default
COPY --from=react-builder /app/frontend/dist /app/static/build

# Create directory for the database volume mount point if it doesn't exist
RUN mkdir -p /app/data

# Expose the port Nginx will listen on (defined in nginx.conf)
EXPOSE 80

# Command to run Gunicorn (running Flask app) and Nginx
# Use a simple script or run directly. Gunicorn runs in the background (&),
# and Nginx stays in the foreground.
CMD bash -c "echo 'Starting Gunicorn...' && \
             (gunicorn --bind 127.0.0.1:8000 --workers=4 app:app &) && \
             echo 'Initializing database...' && \
             (sleep 5 && python -c 'from app import initialize_database; initialize_database()') & \
             echo 'Starting Nginx...' && \
             nginx -g 'daemon off;'"