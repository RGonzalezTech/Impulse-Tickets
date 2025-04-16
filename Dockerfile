# Use an official Python runtime as a parent image
FROM python:3.11-slim-bullseye

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
# --no-cache-dir reduces image size
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container at /app
COPY . .

# Make port 8000 available to the world outside this container
EXPOSE 8000

# Define environment variable to tell Flask the entry point
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0
# Default port for Flask app
ENV FLASK_RUN_PORT=8000 

# Run app.py when the container launches using Flask's built-in server (good for dev/simple internal)
# For slightly more robustness, consider Gunicorn: CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]
CMD ["python", "app.py"]