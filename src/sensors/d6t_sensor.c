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

// MongoDB API endpoint configuration
#define API_ENDPOINT "http://localhost:3000/api/sensor-data"
#define SENSOR_ID "SENSOR_1"  // Default sensor ID (can be overridden by command line args)

// Windows I2C handle
HANDLE hI2C = INVALID_HANDLE_VALUE;

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

int main(int argc, char *argv[]) {
    float temperatures[16];
    int led_state = 0;
    const char* sensor_id = SENSOR_ID;
    
    if (argc > 1) {
        sensor_id = argv[1];
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
    printf("Reading temperature data every 1 second...\n");
    
    while (1) {
        led_state = !led_state;
        set_led_state(led_state);
        
        if (read_d6t_sensor(temperatures) == 0) {
            printf("Temperature readings: ");
            for (int i = 0; i < 16; i++) {
                printf("%.1f ", temperatures[i]);
            }
            printf("\n");
            
            if (!send_to_mongodb(sensor_id, temperatures)) {
                fprintf(stderr, "Failed to send data to MongoDB\n");
            }
        } else {
            fprintf(stderr, "Failed to read temperature data\n");
        }
        
        Sleep(1000); // Windows equivalent of sleep(1)
    }
    
    if (hI2C != INVALID_HANDLE_VALUE) {
        CloseHandle(hI2C);
    }
    cleanup_led();
    
    return 0;
}