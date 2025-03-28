#include <stdio.h>
#include <stdlib.h>
#include <windows.h>
#include <winbase.h>
#include <string.h>
#include <time.h>
#include <curl/curl.h>
#include <json-c/json.h>
#include "led_control.h"

// D6T temperature sensor configuration
#define D6T_ADDR 0x0A        // I2C address of the D6T sensor
#define D6T_CMD 0x4C         // Command to read temperature data
#define MIN_SENSOR_DELAY 300  // Minimum delay required between sensor readings (ms)

// MongoDB API endpoint configuration
#define API_ENDPOINT "http://localhost:3000/api/sensor-data"
#define ALERT_ENDPOINT "http://localhost:3000/api/custom-alert"
#define SENSOR_ID "SENSOR_1"  // Default sensor ID (can be overridden by command line args)

// Default config values (will be overridden by config.json if available)
static int readingInterval = 1000; // Default reading interval (ms)
static float highThreshold = 70.0; // Default high temperature threshold (°C)
static float lowThreshold = 20.0;  // Default low temperature threshold (°C)

// Alert state tracking
static int highTempAlertActive = 0;
static int lowTempAlertActive = 0;

// Windows I2C handle
HANDLE hI2C = INVALID_HANDLE_VALUE;

// Function to read configuration from JSON file
int read_config(const char* config_path) {
    FILE *fp;
    char buffer[1024];
    size_t bytes_read;
    struct json_object *parsed_json;
    struct json_object *sensors_obj, *reading_interval_obj, *thresholds_obj;
    struct json_object *high_threshold_obj, *low_threshold_obj;
    
    fp = fopen(config_path, "r");
    if (fp == NULL) {
        fprintf(stderr, "Could not open config file: %s\n", config_path);
        return -1;
    }
    
    bytes_read = fread(buffer, 1, sizeof(buffer) - 1, fp);
    fclose(fp);
    
    if (bytes_read == 0) {
        fprintf(stderr, "Config file is empty\n");
        return -1;
    }
    
    buffer[bytes_read] = '\0';
    
    parsed_json = json_tokener_parse(buffer);
    if (parsed_json == NULL) {
        fprintf(stderr, "Error parsing config file\n");
        return -1;
    }
    
    // Extract reading interval
    if (json_object_object_get_ex(parsed_json, "sensors", &sensors_obj)) {
        if (json_object_object_get_ex(sensors_obj, "readingInterval", &reading_interval_obj)) {
            readingInterval = json_object_get_int(reading_interval_obj);
            // Ensure minimum sensor delay is respected
            if (readingInterval < MIN_SENSOR_DELAY) {
                printf("Warning: Reading interval %d ms is below minimum of %d ms. Using %d ms.\n", 
                       readingInterval, MIN_SENSOR_DELAY, MIN_SENSOR_DELAY);
                readingInterval = MIN_SENSOR_DELAY;
            }
        }
        
        // Extract temperature thresholds
        if (json_object_object_get_ex(sensors_obj, "temperatureThresholds", &thresholds_obj)) {
            if (json_object_object_get_ex(thresholds_obj, "high", &high_threshold_obj)) {
                highThreshold = json_object_get_double(high_threshold_obj);
            }
            if (json_object_object_get_ex(thresholds_obj, "low", &low_threshold_obj)) {
                lowThreshold = json_object_get_double(low_threshold_obj);
            }
        }
    }
    
    json_object_put(parsed_json);
    
    printf("Config loaded: readingInterval=%d ms, highThreshold=%.1f°C, lowThreshold=%.1f°C\n",
           readingInterval, highThreshold, lowThreshold);
    
    return 0;
}

// Function to initialize I2C communication with the D6T sensor
int init_d6t_sensor() {
    // Open the I2C device using CreateFile
    hI2C = CreateFileA(
        "\\\\.\\I2C1",  // Adjust this path based on your system's I2C configuration
        GENERIC_READ | GENERIC_WRITE,
        0,
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );
    
    if (hI2C == INVALID_HANDLE_VALUE) {
        fprintf(stderr, "Failed to open I2C device. Error code: %lu\n", GetLastError());
        return -1;
    }
    
    // Configure I2C communication parameters if needed
    // This depends on your specific I2C driver implementation
    
    return 0;
}

// Function to read temperature data from D6T sensor
int read_d6t_sensor(float *temperatures) {
    unsigned char cmd = D6T_CMD;
    unsigned char buf[35]; // Buffer to hold raw sensor data
    DWORD bytesWritten, bytesRead;
    int i;
    
    // Write command to sensor
    if (!WriteFile(hI2C, &cmd, 1, &bytesWritten, NULL) || bytesWritten != 1) {
        fprintf(stderr, "Error writing to I2C device. Error code: %lu\n", GetLastError());
        return -1;
    }
    
    // Read data from sensor
    if (!ReadFile(hI2C, buf, sizeof(buf), &bytesRead, NULL) || bytesRead != sizeof(buf)) {
        fprintf(stderr, "Error reading from I2C device. Error code: %lu\n", GetLastError());
        return -1;
    }
    
    // Process temperature data (convert from raw values to Celsius)
    for (i = 0; i < 16; i++) {
        // Temperature data is 16-bit, stored as low byte first
        int raw_temp = (buf[i*2+3] << 8) | buf[i*2+2];
        temperatures[i] = raw_temp * 0.1; // Convert to Celsius
    }
    
    return 0;
}

// Callback function for curl response
size_t write_callback(char *ptr, size_t size, size_t nmemb, void *userdata) {
    return size * nmemb;
}

// Function to send temperature data to MongoDB via API
int send_to_mongodb(const char* sensor_id, float *temperatures) {
    CURL *curl;
    CURLcode res;
    struct json_object *jobj, *jarray;
    const char *json_string;
    struct curl_slist *headers = NULL;
    int success = 0;
    
    curl_global_init(CURL_GLOBAL_ALL);
    curl = curl_easy_init();
    
    if (curl) {
        jobj = json_object_new_object();
        jarray = json_object_new_array();
        
        json_object_object_add(jobj, "sensorId", json_object_new_string(sensor_id));
        
        for (int i = 0; i < 16; i++) {
            json_object_array_add(jarray, json_object_new_double(temperatures[i]));
        }
        
        json_object_object_add(jobj, "temperatures", jarray);
        
        json_string = json_object_to_json_string(jobj);
        
        headers = curl_slist_append(headers, "Content-Type: application/json");
        
        curl_easy_setopt(curl, CURLOPT_URL, API_ENDPOINT);
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_string);
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
        
        res = curl_easy_perform(curl);
        
        if (res == CURLE_OK) {
            long http_code = 0;
            curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
            
            if (http_code >= 200 && http_code < 300) {
                printf("Successfully sent temperature data to MongoDB\n");
                success = 1;
            } else {
                fprintf(stderr, "HTTP error: %ld\n", http_code);
            }
        } else {
            fprintf(stderr, "curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
        }
        
        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);
        json_object_put(jobj);
    }
    
    curl_global_cleanup();
    return success;
}

// Function to send alert to the server
int send_alert(const char* sensor_id, const char* event_type, float temperature, int is_recovery) {
    CURL *curl;
    CURLcode res;
    struct json_object *jobj, *details_obj;
    const char *json_string;
    struct curl_slist *headers = NULL;
    int success = 0;
    
    curl_global_init(CURL_GLOBAL_ALL);
    curl = curl_easy_init();
    
    if (curl) {
        jobj = json_object_new_object();
        details_obj = json_object_new_object();
        
        json_object_object_add(jobj, "sensorId", json_object_new_string(sensor_id));
        
        // Use RECOVERY event type if recovering from an alert condition
        if (is_recovery) {
            char recovery_event_type[50];
            sprintf(recovery_event_type, "%s_RECOVERY", event_type);
            json_object_object_add(jobj, "eventType", json_object_new_string(recovery_event_type));
            
            // Add recovery status to details
            json_object_object_add(details_obj, "recovery", json_object_new_boolean(1));
        } else {
            json_object_object_add(jobj, "eventType", json_object_new_string(event_type));
        }
        
        // Add temperature and thresholds to details
        json_object_object_add(details_obj, "value", json_object_new_double(temperature));
        
        struct json_object *threshold_obj = json_object_new_object();
        json_object_object_add(threshold_obj, "high", json_object_new_double(highThreshold));
        json_object_object_add(threshold_obj, "low", json_object_new_double(lowThreshold));
        json_object_object_add(details_obj, "threshold", threshold_obj);
        
        // Add acquisition timestamp (formatted string)
        time_t now = time(NULL);
        struct tm *t = localtime(&now);
        char timestamp[30];
        strftime(timestamp, sizeof(timestamp), "%Y/%m/%d %H:%M:%S", t);
        json_object_object_add(details_obj, "timestamp", json_object_new_string(timestamp));
        
        json_object_object_add(jobj, "details", details_obj);
        
        json_string = json_object_to_json_string(jobj);
        
        headers = curl_slist_append(headers, "Content-Type: application/json");
        
        curl_easy_setopt(curl, CURLOPT_URL, ALERT_ENDPOINT);
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_string);
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
        
        res = curl_easy_perform(curl);
        
        if (res == CURLE_OK) {
            long http_code = 0;
            curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
            
            if (http_code >= 200 && http_code < 300) {
                printf("Successfully sent alert to server\n");
                success = 1;
            } else {
                fprintf(stderr, "HTTP error while sending alert: %ld\n", http_code);
            }
        } else {
            fprintf(stderr, "curl_easy_perform() failed when sending alert: %s\n", curl_easy_strerror(res));
        }
        
        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);
        json_object_put(jobj);
    }
    
    curl_global_cleanup();
    return success;
}

// Function to check temperatures against thresholds and handle alerts
void check_temperature_alerts(const char* sensor_id, float *temperatures, float avg_temp) {
    // Check for high temperature
    if (avg_temp > highThreshold) {
        if (!highTempAlertActive) {
            printf("HIGH TEMPERATURE ALERT: %.1f°C exceeds threshold of %.1f°C\n", avg_temp, highThreshold);
            send_alert(sensor_id, "ABNORMAL_DATA", avg_temp, 0);
            highTempAlertActive = 1;
            
            // Flash LED for high temperature alert
            for (int i = 0; i < 5; i++) {
                set_led_state(1);
                Sleep(200);
                set_led_state(0);
                Sleep(200);
            }
        }
    } 
    // Check for low temperature
    else if (avg_temp < lowThreshold) {
        if (!lowTempAlertActive) {
            printf("LOW TEMPERATURE ALERT: %.1f°C below threshold of %.1f°C\n", avg_temp, lowThreshold);
            send_alert(sensor_id, "ABNORMAL_DATA", avg_temp, 0);
            lowTempAlertActive = 1;
            
            // Flash LED for low temperature alert
            for (int i = 0; i < 3; i++) {
                set_led_state(1);
                Sleep(300);
                set_led_state(0);
                Sleep(300);
            }
        }
    } 
    // Temperature is normal
    else {
        // Send recovery alert if previously in alarm state
        if (highTempAlertActive) {
            printf("HIGH TEMPERATURE RECOVERY: %.1f°C now within normal range\n", avg_temp);
            send_alert(sensor_id, "ABNORMAL_DATA", avg_temp, 1);
            highTempAlertActive = 0;
        }
        if (lowTempAlertActive) {
            printf("LOW TEMPERATURE RECOVERY: %.1f°C now within normal range\n", avg_temp);
            send_alert(sensor_id, "ABNORMAL_DATA", avg_temp, 1);
            lowTempAlertActive = 0;
        }
    }
}

int main(int argc, char *argv[]) {
    float temperatures[16];
    float avg_temp;
    int i;
    const char* sensor_id = SENSOR_ID;
    const char* config_file = "../../config.json";  // Path relative to executable
    
    // Override defaults with command line args
    if (argc > 1) {
        sensor_id = argv[1];
    }
    if (argc > 2) {
        config_file = argv[2];
    }
    
    // Read configuration
    if (read_config(config_file) < 0) {
        fprintf(stderr, "Warning: Failed to load config. Using default values.\n");
    }
    
    if (init_led() < 0) {
        fprintf(stderr, "Warning: Failed to initialize LED. Continuing without LED indicators.\n");
    }
    
    if (init_d6t_sensor() < 0) {
        fprintf(stderr, "Failed to initialize D6T sensor. Exiting.\n");
        cleanup_led();
        return 1;
    }
    
    printf("D6T temperature sensor initialized. Sensor ID: %s\n", sensor_id);
    printf("Reading temperature data every %d ms...\n", readingInterval);
    
    while (1) {
        DWORD start_time = GetTickCount();
        
        if (read_d6t_sensor(temperatures) == 0) {
            // Calculate average temperature
            avg_temp = 0;
            for (i = 0; i < 16; i++) {
                avg_temp += temperatures[i];
            }
            avg_temp /= 16;
            
            printf("Average temperature: %.1f°C\n", avg_temp);
            
            // Check if temperature is outside thresholds and handle alerts
            check_temperature_alerts(sensor_id, temperatures, avg_temp);
            
            // Send temperature data to server
            if (!send_to_mongodb(sensor_id, temperatures)) {
                fprintf(stderr, "Failed to send data to MongoDB\n");
            }
        } else {
            fprintf(stderr, "Failed to read temperature data\n");
        }
        
        // Calculate how long to sleep to maintain the configured interval
        DWORD elapsed = GetTickCount() - start_time;
        DWORD sleep_time = (elapsed < readingInterval) ? (readingInterval - elapsed) : MIN_SENSOR_DELAY;
        
        // Always respect the minimum sensor delay
        if (sleep_time < MIN_SENSOR_DELAY) {
            sleep_time = MIN_SENSOR_DELAY;
        }
        
        printf("Sleeping for %lu ms before next reading\n", sleep_time);
        Sleep(sleep_time);
    }
    
    if (hI2C != INVALID_HANDLE_VALUE) {
        CloseHandle(hI2C);
    }
    cleanup_led();
    
    return 0;
}