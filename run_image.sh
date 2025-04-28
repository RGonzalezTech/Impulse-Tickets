# docker build . -t impulse-ticket
docker run -d --name impulse-ticket -p 8080:80 -v "$(pwd)/data":/app/data --restart unless-stopped impulse-ticket

# Then, you can remove it
# docker container stop impulse-ticket
# docker container rm impulse-ticket
