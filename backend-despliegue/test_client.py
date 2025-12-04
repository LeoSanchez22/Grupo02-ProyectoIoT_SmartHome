import requests
import time
import random
import os

# --- ⚠️ CONFIGURACIÓN ---
# Asegúrate de que esta IP sea la de tu PC donde corre main.py
BASE_URL = "http://192.168.1.15:5000" 

def simulate_app_control():
    """Simula que un USUARIO desde la App toca botones (Alarma y Luces)."""
    print(f"\n[📱 APP SIMULADA] Consultando/Enviando comandos...")
    
    # 1. Simular tocar el botón de la alarma
    alarm_state = random.choice(['0', '1'])
    try:
        requests.get(f"{BASE_URL}/control/ultrasonic?set={alarm_state}", timeout=1)
        print(f" -> Usuario cambió Alarma a: {'ON' if alarm_state=='1' else 'OFF'}")
    except:
        print(" -> Error contactando backend (App Control)")

    # 2. Simular mover un slider de luz
    led_idx = random.randint(0, 7)
    intensity = random.randint(0, 100)
    try:
        requests.get(f"{BASE_URL}/control/leds/{led_idx}/{intensity}", timeout=1)
        print(f" -> Usuario cambió LED {led_idx} a: {intensity}%")
    except:
        pass

def simulate_door_control():
    """Simula que el USUARIO abre/cierra la PUERTA PRINCIPAL."""
    # 3. Simular botón de puerta
    door_state = random.choice(['0', '1'])
    try:
        requests.get(f"{BASE_URL}/control/door?set={door_state}", timeout=1)
        print(f" -> 🚪 Usuario cambió PUERTA a: {'ABIERTA' if door_state=='1' else 'CERRADA'}")
    except:
        pass

# --- NUEVO: Simulación Cochera ---
def simulate_garage_control():
    """Simula que el USUARIO abre/cierra la COCHERA."""
    garage_state = random.choice(['0', '1'])
    try:
        requests.get(f"{BASE_URL}/control/garage?set={garage_state}", timeout=1)
        print(f" -> 🚗 Usuario cambió COCHERA a: {'ABIERTA' if garage_state=='1' else 'CERRADA'}")
    except:
        pass

def simulate_sensor_push():
    """Simula que el ESP32 (SENSORES) envía temperatura/distancia."""
    print(f"\n[📡 ESP32 SENSORES] Enviando datos...")
    
    # Generamos datos aleatorios realistas
    payload = {
        "temp": round(random.uniform(20.0, 35.0), 1),
        "humedad": round(random.uniform(40.0, 90.0), 1),
        "distancia": random.randint(5, 250) # cm
    }
    
    try:
        res = requests.post(f"{BASE_URL}/api/sensor_data", json=payload, timeout=1)
        if res.status_code == 200:
            print(f" -> Datos enviados OK: T={payload['temp']}°C D={payload['distancia']}cm")
        else:
            print(f" -> Error del servidor: {res.status_code}")
    except Exception as e:
        print(f" -> ❌ Error de conexión: {e}")

def simulate_camera_push():
    """Simula que el ESP32-CAM envía una foto."""
    # Busca un archivo 'test.jpg' en la carpeta para enviarlo
    filename = 'test.jpg'
    
    if not os.path.exists(filename):
        print("\n[📷 ESP32-CAM] No encontré 'test.jpg'. Saltando simulación de video.")
        print(" (Pon una foto llamada test.jpg en esta carpeta para probar el video)")
        return

    print(f"\n[📷 ESP32-CAM] Enviando foto...")
    try:
        with open(filename, 'rb') as img:
            # Enviamos los bytes crudos como hace la ESP32-CAM
            headers = {'Content-Type': 'image/jpeg'}
            res = requests.post(f"{BASE_URL}/upload", data=img, headers=headers, timeout=2)
            
            if res.status_code == 200:
                print(" -> 📸 Foto enviada con éxito.")
            else:
                print(f" -> Error subiendo foto: {res.status_code}")
    except Exception as e:
        print(f" -> ❌ Error enviando foto: {e}")

if __name__ == '__main__':
    print("--- INICIANDO SIMULADOR DE SISTEMA IOT ---")
    print(f"Apuntando a: {BASE_URL}")
    print("------------------------------------------")

    while True:
        # 1. Simular Sensores (ESP32)
        simulate_sensor_push()
        
        # 2. Simular Cámara (ESP32-CAM)
        simulate_camera_push()

        # 3. Simular Acciones de la App (Usuario tocando botones)
        simulate_app_control()
        simulate_door_control() 
        simulate_garage_control() # <--- NUEVA LLAMADA AGREGADA

        print("-" * 40)
        # Esperar 2 segundos antes del siguiente ciclo
        time.sleep(2)