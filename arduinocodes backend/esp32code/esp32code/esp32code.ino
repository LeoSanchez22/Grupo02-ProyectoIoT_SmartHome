#include <WiFi.h>
#include <HTTPClient.h> 
#include <ArduinoJson.h>
#include "DHT.h" 
#include <NewPing.h> 
#include <ESP32Servo.h> 

// --- CONFIGURACIÓN DE RED ---
const char* WIFI_SSID = "CASA LEO";
const char* WIFI_PASSWORD = "198304LO";

// --- CONFIGURACIÓN DE BACKEND ---
const char* BACKEND_HOST = "192.168.1.15"; 
const int BACKEND_PORT = 5000; 

// --- PINES ---
#define DHT_PIN 4      
#define DHT_TYPE DHT11      
DHT dht(DHT_PIN, DHT_TYPE);

#define SONAR_TRIGGER_PIN 5  
#define SONAR_ECHO_PIN 18    
#define MAX_DISTANCE 200     
NewPing sonar(SONAR_TRIGGER_PIN, SONAR_ECHO_PIN, MAX_DISTANCE);

#define BUZZER_PIN 19

// --- SERVOMOTORES ---
#define SERVO_PIN 23        // Puerta Principal
#define GARAGE_SERVO_PIN 22 // --- NUEVO: Puerta de la Cochera

const int LED_PINS[] = {13, 12, 14, 27, 26, 25, 33, 32}; 
const int NUM_LEDS = 8;

// --- OBJETOS ---
Servo doorServo;   // Puerta Principal
Servo garageServo; // --- NUEVO: Objeto Servo Cochera

// --- ESTADOS Y TIMERS ---
long lastSensorTime = 0;
long lastCommandTime = 0;
const long sensorInterval = 5000; 
const long commandInterval = 500; 

// --- ESTADO LOCAL ---
int ultrasonicActive = 0; 
int lastDistanceCm = 0; 
int doorState = 0;   // 0 = Cerrado, 1 = Abierto (Principal)
int garageState = 0; // --- NUEVO: 0 = Cerrado, 1 = Abierto (Cochera)

void setup_wifi() {
    Serial.print("Conectando a ");
    Serial.println(WIFI_SSID);
    
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi conectado!");
}

void readDHTSensors(float& t, float& h) {
    float temp = NAN;
    float hum  = NAN;

    for (int i = 0; i < 3 && (isnan(temp) || isnan(hum)); i++) {
        hum  = dht.readHumidity();
        temp = dht.readTemperature();
        if (isnan(temp) || isnan(hum)) delay(100);
    }

    if (isnan(temp) || isnan(hum)) {
        t = 0.0; h = 0.0;
    } else {
        t = temp; h = hum;
        Serial.print("T: "); Serial.print(t); Serial.print(" | H: "); Serial.println(h);
    }
}

void handleBuzzerAlert() {
    if (ultrasonicActive == 1) {
        lastDistanceCm = sonar.ping_cm();
        if (lastDistanceCm == 0) lastDistanceCm = MAX_DISTANCE; 

        if (lastDistanceCm > 0 && lastDistanceCm < 8) {
            digitalWrite(BUZZER_PIN, HIGH);
        } else {
            digitalWrite(BUZZER_PIN, LOW);
        }
    } else {
        digitalWrite(BUZZER_PIN, LOW); 
        lastDistanceCm = 0; 
    }
}

// --- Función Puerta Principal ---
void handleDoor() {
    if (doorState == 1) {
        doorServo.write(90); 
    } else {
        doorServo.write(180);
    }
}

// --- NUEVO: Función Puerta Cochera ---
void handleGarage() {
    // Si garageState es 1 (ABIERTO) -> 90 grados
    // Si garageState es 0 (CERRADO) -> 0 grados
    if (garageState == 1) {
        garageServo.write(90); 
    } else {
        garageServo.write(180);
    }
}

void sendSensorData(float temp, float hum) {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    String url = "http://" + String(BACKEND_HOST) + ":" + String(BACKEND_PORT) + "/api/sensor_data";

    if (http.begin(url)) {
        StaticJsonDocument<256> doc;
        doc["temp"] = temp;
        doc["humedad"] = hum;
        doc["distancia"] = lastDistanceCm;

        String requestBody;
        serializeJson(doc, requestBody);
        
        http.addHeader("Content-Type", "application/json");
        int httpResponseCode = http.POST(requestBody);

        if (httpResponseCode <= 0) {
            Serial.print("Error enviando: ");
            Serial.println(http.errorToString(httpResponseCode));
        }
        http.end();
    }
}

void getControlCommands() {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    String url = "http://" + String(BACKEND_HOST) + ":" + String(BACKEND_PORT) + "/api/control_commands";

    if (http.begin(url)) {
        int httpCode = http.GET();

        if (httpCode == 200) { 
            String payload = http.getString();
            StaticJsonDocument<1024> doc; 
            DeserializationError error = deserializeJson(doc, payload);

            if (!error) {
                ultrasonicActive = doc["ultrasonic_active"].as<int>();
                
                // --- LEER ESTADO PUERTA PRINCIPAL ---
                if (doc.containsKey("door_open")) {
                    doorState = doc["door_open"].as<int>();
                }

                // --- NUEVO: LEER ESTADO COCHERA ---
                // Tu JSON backend debe enviar algo como: { "garage_open": 1 }
                if (doc.containsKey("garage_open")) {
                    garageState = doc["garage_open"].as<int>();
                }

                JsonArray ledsArray = doc["led_intensities"].as<JsonArray>();

                if (ledsArray.size() == NUM_LEDS) {
                    for (int i = 0; i < NUM_LEDS; i++) {
                        int val = ledsArray[i];
                        int pwm = map(val, 0, 100, 0, 255);
                        analogWrite(LED_PINS[i], pwm);
                    }
                }
            }
        } 
        http.end();
    }
}

void setup() {
    Serial.begin(115200);
    delay(2000);
    dht.begin();
    
    // --- Configurar Servo Principal ---
    doorServo.attach(SERVO_PIN);
    doorServo.write(0); 

    // --- NUEVO: Configurar Servo Cochera ---
    garageServo.attach(GARAGE_SERVO_PIN);
    garageServo.write(0); // Iniciar cerrada

    for (int i = 0; i < NUM_LEDS; i++) {
        pinMode(LED_PINS[i], OUTPUT);
        analogWrite(LED_PINS[i], 0); 
    }
    
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);

    setup_wifi();
}

void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        setup_wifi();
        return;
    }

    unsigned long currentTime = millis();

    if (currentTime - lastCommandTime >= commandInterval) {
        getControlCommands();
        handleBuzzerAlert();
        handleDoor();   // Puerta principal
        handleGarage(); // --- NUEVO: Puerta cochera
        lastCommandTime = currentTime;
    }

    if (currentTime - lastSensorTime >= sensorInterval) {
        float temp, hum;
        readDHTSensors(temp, hum);
        sendSensorData(temp, hum);
        lastSensorTime = currentTime;
    }
}