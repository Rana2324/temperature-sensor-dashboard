CC = gcc
CFLAGS = -Wall -Wextra -O2
INCLUDES = -I/usr/include/json-c
LDFLAGS = -lcurl -ljson-c
TARGET = d6t_sensor
SOURCES = d6t_sensor.c
HEADERS = 

all: $(TARGET)

$(TARGET): $(SOURCES) $(HEADERS)
	$(CC) $(CFLAGS) $(INCLUDES) -o $@ $(SOURCES) $(LDFLAGS)

install:
	cp $(TARGET) /usr/local/bin/
	cp temperature-sensor.service /etc/systemd/system/
	systemctl daemon-reload
	systemctl enable temperature-sensor.service
	systemctl start temperature-sensor.service

clean:
	rm -f $(TARGET)