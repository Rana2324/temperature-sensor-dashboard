# Temperature Sensor Dashboard

A real-time temperature monitoring system that collects data from D6T sensors, displays it in a web dashboard, and alerts users of abnormal temperature readings.

## Project Structure

```
temperature-sensor-dashboard/
├── config.json              # Application configuration settings
├── nodemon.json             # Nodemon configuration for development
├── package.json             # Node.js dependencies and scripts
├── README.md                # Project documentation (this file)
│
├── public/                  # Static public assets
│   ├── styles.css           # Global CSS styles
│   └── js/
│       └── SensorDashboard.js  # Client-side dashboard functionality
│
├── src/                     # Source code
│   ├── app.js               # Main application entry point
│   │
│   ├── controllers/         # Route controllers
│   │   └── sensorController.js  # Handles sensor data processing and API endpoints
│   │
│   ├── models/              # Database models
│   │   ├── Alert.js         # Schema for temperature alerts
│   │   ├── Personality.js   # Schema for sensor bias/personality settings
│   │   ├── SensorData.js    # Schema for temperature readings
│   │   └── Settings.js      # Schema for sensor configuration settings
│   │
│   ├── public/              # Public assets specific to source
│   │   └── styles.css       # Application-specific styles
│   │
│   ├── routes/              # Route definitions
│   │   └── index.js         # Main route handler
│   │
│   ├── sensors/             # Sensor-related code
│   │   ├── led_control.c    # C code for LED control on hardware
│   │   ├── led_control.h    # Header file for LED control
│   │   ├── Makefile         # Compilation instructions for sensor code
│   │   ├── sensor-simulator.js  # Simulates sensor data for testing
│   │   └── temperature-sensor.service  # Systemd service file for autostart
│   │
│   └── views/               # EJS templates
│       ├── index.ejs        # Main dashboard template
│       └── layout.ejs       # Base layout template
│
└── query/                   # Database queries and scripts
```

## Key Components

### Frontend

- **Dashboard (index.ejs)**: Displays real-time temperature data, alerts, settings, and personality data in a responsive layout.
- **Socket.IO Client**: Enables real-time updates without refreshing the page.

### Backend

- **Express.js Server (app.js)**: Handles HTTP requests and serves the web application.
- **Socket.IO Server**: Manages real-time communication with clients.
- **MongoDB**: Stores sensor data, alerts, settings, and personality information.

### Sensor Interface

- **Sensor Simulator (sensor-simulator.js)**: Generates simulated D6T sensor data for testing.
- **Hardware Controls**: LED control code for physical implementation.

## Data Models

- **SensorData**: Stores temperature readings from 16-pixel thermal array sensors.
- **Alert**: Records abnormal temperature events and notifications.
- **Settings**: Stores configuration values like thresholds and intervals.
- **Personality**: Manages sensor bias settings for temperature offsets.

## Features

- Real-time temperature monitoring with 16-pixel thermal data visualization
- Automatic detection of abnormal temperatures (above 70°C or below 20°C)
- Alert system for abnormal readings and sensor errors
- Configurable threshold settings
- Sensor personality/bias adjustments
- Historical data logging and viewing

## Prerequisites

- Node.js 14 or higher
- MongoDB 4.4 or higher (configured as a replica set)
- gcc and build essentials
- libcurl and libjson-c development packages
- I2C tools and development libraries

## Installation

1. Install system dependencies:
```bash
sudo apt-get update
sudo apt-get install -y build-essential libcurl4-openssl-dev libjson-c-dev i2c-tools libi2c-dev
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Build and install the sensor program:
```bash
cd src/sensors
make
sudo make install
```

4. Configure MongoDB replica set:
```bash
# Create data directories
sudo mkdir -p /data/db{1,2,3}

# Start MongoDB instances
mongod --replSet rs0 --port 27017 --dbpath /data/db1
mongod --replSet rs0 --port 27018 --dbpath /data/db2
mongod --replSet rs0 --port 27019 --dbpath /data/db3

# Initialize replica set
mongosh --eval 'rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" },
    { _id: 1, host: "localhost:27018" },
    { _id: 2, host: "localhost:27019" }
  ]
})'
```

5. Configure the application:
Edit `config.json` to match your environment settings.

## Running the Application

1. Start the MongoDB replica set (if not running)

2. Start the Node.js server:
```bash
npm start
```

3. The sensor service should start automatically via systemd. To manually control it:
```bash
sudo systemctl start temperature-sensor  # Start
sudo systemctl stop temperature-sensor   # Stop
sudo systemctl status temperature-sensor # Check status
```

## Dashboard Access

Access the dashboard at http://localhost:3000

## Configuration

The system can be configured through `config.json`:

- `sensors`: Configure sensor reading intervals and temperature thresholds
- `mongodb`: Database connection settings
- `server`: Web server configuration

## Monitoring

- View real-time temperature data in the dashboard
- Check alert history in the Alerts tab
- Monitor system logs:
```bash
journalctl -u temperature-sensor -f
```

## Development

To start the development server with hot reloading:

```bash
npm run dev
```

To simulate sensor data:

```bash
node src/sensors/sensor-simulator.js
```

## Production

For production deployment:

```bash
npm start
```

To run as a system service, use the provided `temperature-sensor.service` file with systemd.

## Real-time Updates

The application uses Socket.IO for real-time updates. The client-side JavaScript listens for `newSensorData` and `alert` events to update the dashboard automatically.
# temperature-sensor-dashboard
