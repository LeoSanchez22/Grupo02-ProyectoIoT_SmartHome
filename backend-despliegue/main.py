import threading
import time 
from flask import Flask, request, jsonify, Response

app = Flask(__name__)

# --- CONFIGURACIÓN ---
NUM_LEDS = 8
state_lock = threading.Lock()

# Variable global para guardar la última foto en memoria RAM
last_frame = None 

# Estado inicial de sensores
sensor_data = {
    "temp": 0.0, "humedad": 0.0, "distancia": 0, "last_seen": "Esperando..."
}

# --- MODIFICACIÓN: Agregamos "garage_open" aquí ---
control_commands = {
    "ultrasonic_active": 0, 
    "door_open": 0,           # 0 = Cerrada, 1 = Abierta (Principal)
    "garage_open": 0,         # --- NUEVO: 0 = Cerrada, 1 = Abierta (Cochera)
    "led_intensities": [0] * NUM_LEDS 
}

# --- CORS (NECESARIO PARA QUE LA APP NO DE ERROR DE RED) ---
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# ==========================================
# 1. RUTAS DE CÁMARA
# ==========================================

@app.route('/upload', methods=['POST'])
def upload_image():
    """El ESP32-CAM envía la foto aquí."""
    global last_frame
    try:
        # Recibimos los bytes directos de la imagen JPEG
        last_frame = request.data
        if not last_frame:
            return "No data", 400
        # print("📸 Foto recibida OK") 
        return "Received", 200
    except Exception as e:
        print(f"Error recibiendo imagen: {e}")
        return str(e), 500

@app.route('/get-image', methods=['GET'])
def get_image():
    """La App React Native pide la imagen aquí."""
    global last_frame
    if last_frame:
        # Devolvemos la imagen como un archivo JPEG
        return Response(last_frame, mimetype='image/jpeg')
    else:
        return "No image available", 404

# ==========================================
# 2. RUTAS DE SENSORES Y CONTROL
# ==========================================

@app.route('/api/sensor_data', methods=['POST'])
def receive_sensor_data():
    try:
        data = request.json
        if not data: return jsonify({"message": "No JSON"}), 400
        
        with state_lock:
            sensor_data["temp"] = data.get('temp', sensor_data["temp"])
            sensor_data["humedad"] = data.get('humedad', sensor_data["humedad"])
            sensor_data["distancia"] = data.get('distancia', sensor_data["distancia"])
            sensor_data["last_seen"] = time.strftime("%H:%M:%S")
            
        print(f"📡 Dato recibido: T:{sensor_data['temp']} H:{sensor_data['humedad']} D:{sensor_data['distancia']}")
        return jsonify({"message": "OK"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/control_commands', methods=['GET'])
def send_control_commands():
    with state_lock:
        return jsonify(control_commands)

# --- Ruta Puerta Principal ---
@app.route('/control/door', methods=['GET'])
def control_door():
    # Se usa así: /control/door?set=1 (Abrir) o set=0 (Cerrar)
    action = request.args.get('set')
    with state_lock:
        if action is not None:
            try:
                control_commands["door_open"] = int(action)
            except ValueError:
                pass 
        return jsonify({"status": "ok", "door_open": control_commands["door_open"]})

# --- NUEVO: Ruta Puerta Cochera ---
@app.route('/control/garage', methods=['GET'])
def control_garage():
    # Se usa así: /control/garage?set=1 (Abrir) o set=0 (Cerrar)
    action = request.args.get('set')
    with state_lock:
        if action is not None:
            try:
                control_commands["garage_open"] = int(action)
            except ValueError:
                pass 
        return jsonify({"status": "ok", "garage_open": control_commands["garage_open"]})

@app.route('/control/ultrasonic', methods=['GET'])
def toggle_ultrasonic():
    action = request.args.get('set')
    with state_lock:
        if action is None:
            control_commands["ultrasonic_active"] = 1 if control_commands["ultrasonic_active"] == 0 else 0
        else:
            control_commands["ultrasonic_active"] = int(action)
        return jsonify({"status": control_commands["ultrasonic_active"]})

@app.route('/control/leds/<int:index>/<int:intensity>', methods=['GET'])
def set_led_intensity(index, intensity):
    if 0 <= index < NUM_LEDS and 0 <= intensity <= 100:
        with state_lock:
            control_commands["led_intensities"][index] = intensity
        return jsonify({"msg": "OK", "val": intensity})
    return jsonify({"error": "Bad Request"}), 400

@app.route('/api/full_state', methods=['GET'])
def get_full_state():
    with state_lock:
        full_state = {**sensor_data, **control_commands}
        return jsonify(full_state)

# --- VISTA WEB DE PRUEBA ---
@app.route('/')
def status_page():
    return """
    <h1>Servidor IoT Activo</h1>
    <p>Endpoints disponibles:</p>
    <ul>
        <li>POST /upload (Cámara)</li>
        <li>GET /get-image (App Video)</li>
        <li>POST /api/sensor_data (Sensores)</li>
        <li>GET /control/door?set=1 (Prueba Puerta)</li>
        <li>GET /control/garage?set=1 (Prueba Cochera)</li>
    </ul>
    """

if __name__ == '__main__':
    # Puerto 5000 OBLIGATORIO
    app.run(host='0.0.0.0', port=5000)