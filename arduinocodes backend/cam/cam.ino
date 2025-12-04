#include <WiFi.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "esp_camera.h"
#include <HTTPClient.h>

// ==========================================
// ⚠️ CONFIGURACIÓN DE USUARIO
// ==========================================
const char* ssid = "CASA LEO";
const char* password = "198304LO";

// IP de tu servidor Python (Puerto 5000)
String serverName = "http://192.168.1.15:5000/upload"; 
// ==========================================

// --- DEFINICIÓN DE PINES (MODELO AI THINKER) ---
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// LED Flash integrado (GPIO 4)
#define FLASH_GPIO_NUM    4

void setup() {
  // 1. Deshabilitar detector de "Brownout" (Baja tensión)
  // Esto es CRÍTICO: La cámara consume mucho y suele reiniciarse sin esto.
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); 

  Serial.begin(115200);
  Serial.setDebugOutput(true);
  pinMode(FLASH_GPIO_NUM, OUTPUT);

  // 2. Conexión WiFi
  WiFi.begin(ssid, password);
  Serial.print("Conectando al WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Conectado!");
  
  // Parpadeo del Flash para confirmar conexión
  digitalWrite(FLASH_GPIO_NUM, HIGH); delay(100); digitalWrite(FLASH_GPIO_NUM, LOW);

  // 3. Configuración de la Cámara
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if(psramFound()){
    // Si tiene PSRAM (la mayoría de AI Thinker tienen), usamos calidad VGA
    config.frame_size = FRAMESIZE_VGA; // 640x480
    config.jpeg_quality = 15; // 0-63, menor es mejor calidad
    config.fb_count = 1;
  } else {
    config.frame_size = FRAMESIZE_CIF;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  // Inicializar cámara
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Error iniciando cámara: 0x%x", err);
    return;
  }
  Serial.println("Cámara lista. Enviando a: " + serverName);
}

void loop() {
  // Solo intentamos enviar si hay WiFi
  if(WiFi.status() == WL_CONNECTED) {
    
    // A. Tomar Foto
    camera_fb_t * fb = esp_camera_fb_get();
    if(!fb) {
      Serial.println("Fallo al capturar imagen");
      return;
    }

    // B. Conectar al Servidor Python
    HTTPClient http;
    // IMPORTANTE: Inicio conexión HTTP
    http.begin(serverName);
    http.addHeader("Content-Type", "image/jpeg");

    // C. Enviar la imagen binaria (POST)
    int httpResponseCode = http.POST(fb->buf, fb->len);

    // D. Debug (opcional, comenta si satura el monitor)
    if (httpResponseCode > 0) {
      // Serial.printf("Foto enviada. Código: %d\n", httpResponseCode);
    } else {
      Serial.printf("Error enviando: %s\n", http.errorToString(httpResponseCode).c_str());
    }

    // E. Liberar memoria y cerrar conexión
    esp_camera_fb_return(fb);
    http.end();

  } else {
    Serial.println("WiFi perdido. Reconectando...");
    WiFi.reconnect();
  }

  // Pausa entre fotos (ajustar según rendimiento)
  // 100ms es muy rápido, 500ms es más estable.
  delay(200); 
}