# docker build . -t impulse-ticket
docker run -d --name impulse-ticket -p 8080:8000 -v "$(pwd)/data":/app/data --restart unless-stopped impulse-ticket