import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
// --- NUEVO: Agregamos Car a los iconos ---
import { Activity, Car, DoorOpen, Droplets, Maximize2, ShieldCheck, Thermometer, Video, X, Zap } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Modal, SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview'; // Asegúrate de instalar: npx expo install react-native-webview

const { width } = Dimensions.get('window');

// --- ⚠️ CONFIGURACIÓN ---
// URL BASE para datos (Python)
const API_URL = 'http://192.168.1.15:5000';

// URL ESPECÍFICA para la imagen de la cámara (Si es diferente endpoint)
const CAMERA_URL = `${API_URL}/get-image`; 

// --- HTML INTELIGENTE ---
const generateHtml = (url) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  body { margin: 0; padding: 0; background-color: #000; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; font-family: monospace; color: white; }
  img { width: 100%; height: 100%; object-fit: contain; display: none; }
  .loader { font-size: 20px; color: #00d4ff; margin-bottom: 10px; text-align: center;}
</style>
</head>
<body>
  <div id="msg" class="loader">CONECTANDO...</div>
  <img id="cam" src="" />
  <script>
    const img = document.getElementById('cam');
    const msg = document.getElementById('msg');
    async function refreshImage() {
        try {
            const response = await fetch('${url}?t=' + new Date().getTime(), {
                headers: { 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'CustomAgent' }
            });
            if (!response.ok) throw new Error("Error");
            const blob = await response.blob();
            const objectURL = URL.createObjectURL(blob);
            msg.style.display = 'none';
            if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
            img.src = objectURL;
            img.style.display = 'block';
            setTimeout(refreshImage, 100);
        } catch (error) {
            img.style.display = 'none';
            msg.style.display = 'block';
            msg.innerText = 'SIN SEÑAL...';
            setTimeout(refreshImage, 1000);
        }
    }
    refreshImage();
  </script>
</body>
</html>
`;

export default function SmartHomeApp() {
    // --- ESTADOS ---
    const [cameraActive, setCameraActive] = useState(false);
    const [fullScreenCamera, setFullScreenCamera] = useState(false);
    
    // Datos reales del Backend
    const [sensors, setSensors] = useState({ temp: 0, humedad: 0, distancia: 0 });
    const [alarmActive, setAlarmActive] = useState(false);

    // --- ESTADO DE PUERTAS ---
    const [doorOpen, setDoorOpen] = useState(false);
    const [garageOpen, setGarageOpen] = useState(false); // --- NUEVO: Cochera
    
    // Mapeo de Habitaciones
    const [rooms, setRooms] = useState([
        { id: 1, ledIndex: 0, name: 'Sala Principal', isOn: false, brightness: 0 },
        { id: 2, ledIndex: 1, name: 'Baño', isOn: false, brightness: 0 },
        { id: 3, ledIndex: 2, name: 'Habitación 1', isOn: false, brightness: 0 },
        { id: 4, ledIndex: 3, name: 'Habitación 2', isOn: false, brightness: 0 },
        { id: 5, ledIndex: 4, name: 'Cochera', isOn: false, brightness: 0 },
    ]);

    // Para evitar spam de alertas
    const alertTriggered = useRef(false);

    // --- 1. CEREBRO: POLLING DE DATOS ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Pide datos a tu Python
                const response = await fetch(`${API_URL}/api/full_state`);
                const data = await response.json();

                // 1. Actualizar Sensores
                setSensors({
                    temp: data.temp,
                    humedad: data.humedad,
                    distancia: data.distancia
                });

                // 2. Lógica de Alarma
                if (data.ultrasonic_active === 1 && data.distancia < 20 && data.distancia > 0) {
                    if (!alertTriggered.current) {
                        triggerSecurityAlert(data.distancia);
                        alertTriggered.current = true;
                    }
                } else {
                    alertTriggered.current = false;
                }

                // Sincronizar estado visual del switch de alarma
                setAlarmActive(data.ultrasonic_active === 1);

                // --- NUEVO: Sincronizar estado de las puertas ---
                setDoorOpen(data.door_open === 1);
                setGarageOpen(data.garage_open === 1);

                // 3. Actualizar Luces
                setRooms(prevRooms => prevRooms.map(room => {
                    const serverVal = data.led_intensities[room.ledIndex];
                    return { ...room, isOn: serverVal > 0, brightness: serverVal };
                }));

            } catch (error) {
                // console.log("Esperando servidor...", error);
            }
        };

        const interval = setInterval(fetchData, 1000); // Cada 1 segundo
        return () => clearInterval(interval);
    }, []);

    const triggerSecurityAlert = (dist) => {
        setCameraActive(true); // Encender cámara automáticamente
        Alert.alert(
            "⚠️ INTRUSO DETECTADO",
            `El sensor detectó objeto a ${dist} cm.`,
            [{ text: "VER CÁMARA", onPress: () => setFullScreenCamera(true) }, { text: "OK" }]
        );
    };

    // --- LOGICA DE CONTROL (ENVIAR A PYTHON) ---
    
    const toggleAlarm = async (value) => {
        setAlarmActive(value);
        try {
            await fetch(`${API_URL}/control/ultrasonic?set=${value ? 1 : 0}`);
        } catch (error) { console.error(error); }
    };

    const toggleDoor = async (value) => {
        setDoorOpen(value); // UI Optimista
        try {
            await fetch(`${API_URL}/control/door?set=${value ? 1 : 0}`);
        } catch (error) { console.error(error); }
    };

    // --- NUEVO: FUNCION PARA CONTROLAR COCHERA ---
    const toggleGarage = async (value) => {
        setGarageOpen(value); // UI Optimista
        try {
            await fetch(`${API_URL}/control/garage?set=${value ? 1 : 0}`);
        } catch (error) { console.error(error); }
    };

    const updateLed = async (index, val) => {
        try {
            await fetch(`${API_URL}/control/leds/${index}/${Math.round(val)}`);
        } catch (error) { console.error(error); }
    };

    const toggleRoomLight = (id, currentIsOn, ledIndex) => {
        const newState = !currentIsOn;
        const newBrightness = newState ? 100 : 0;
        
        setRooms(prev => prev.map(r => r.id === id ? { ...r, isOn: newState, brightness: newBrightness } : r));
        updateLed(ledIndex, newBrightness);
    };

    const changeRoomBrightness = (id, value, ledIndex) => {
        setRooms(prev => prev.map(r => r.id === id ? { ...r, brightness: value } : r));
    };

    const handleSlidingComplete = (id, value, ledIndex) => {
        updateLed(ledIndex, value);
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={['#0f0c29', '#302b63', '#24243e']} style={styles.background} />

            {/* --- MODAL VIDEO FULLSCREEN --- */}
            <Modal visible={fullScreenCamera} animationType="fade" onRequestClose={() => setFullScreenCamera(false)}>
                <SafeAreaView style={{flex: 1, backgroundColor: '#000'}}>
                    <WebView
                        originWhitelist={['*']}
                        source={{ html: generateHtml(CAMERA_URL) }}
                        style={{ flex: 1, backgroundColor: 'black' }}
                        javaScriptEnabled={true}
                    />
                    <TouchableOpacity style={styles.closeFullScreenBtn} onPress={() => setFullScreenCamera(false)}>
                        <X color="#fff" size={30} />
                    </TouchableOpacity>
                </SafeAreaView>
            </Modal>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.greeting}>Panel de Control</Text>
                    <Text style={styles.subtitle}>Sistema Conectado</Text>
                </View>

                {/* --- 1. TARJETA DE CÁMARA --- */}
                <View style={[styles.card, styles.cameraCard]}>
                    <View style={styles.cardHeader}>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <Video color="#00d4ff" size={20} />
                            <Text style={styles.cardTitle}> Video Portero</Text>
                        </View>
                        {cameraActive && (
                            <TouchableOpacity onPress={() => setCameraActive(false)}>
                                <X color="#aaa" size={20} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.cameraContainer}>
                        {cameraActive ? (
                            <>
                                <WebView
                                    originWhitelist={['*']}
                                    source={{ html: generateHtml(CAMERA_URL) }}
                                    style={styles.webview}
                                    scrollEnabled={false}
                                    javaScriptEnabled={true}
                                />
                                <TouchableOpacity style={styles.expandButton} onPress={() => setFullScreenCamera(true)}>
                                    <Maximize2 color="#fff" size={20} />
                                </TouchableOpacity>
                            </>
                        ) : (
                            <View style={styles.cameraPlaceholder}>
                                <ShieldCheck color="#555" size={40} />
                                <Text style={styles.placeholderText}>Cámara en espera</Text>
                                <TouchableOpacity style={styles.cameraButton} onPress={() => setCameraActive(true)}>
                                    <Text style={styles.cameraButtonText}>CONECTAR</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>

                {/* --- TARJETA DE PUERTA PRINCIPAL --- */}
                <View style={[styles.card, { borderColor: doorOpen ? '#facc15' : 'rgba(255,255,255,0.1)' }]}>
                     <View style={styles.cardHeader}>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <DoorOpen color={doorOpen ? "#facc15" : "#aaa"} size={20} />
                            <Text style={[styles.cardTitle, { color: doorOpen ? '#fff' : '#aaa' }]}> 
                                Puerta Principal
                            </Text>
                        </View>
                        <Switch 
                            value={doorOpen} 
                            onValueChange={toggleDoor}
                            trackColor={{false: '#333', true: '#facc15'}}
                        />
                    </View>
                    <Text style={{color: '#aaa', fontSize: 12, marginLeft: 30}}>
                        Estado: <Text style={{color: doorOpen ? '#facc15' : '#aaa', fontWeight:'bold'}}>
                            {doorOpen ? 'ABIERTA' : 'CERRADA'}
                        </Text>
                    </Text>
                </View>

                {/* --- NUEVO: TARJETA DE COCHERA --- */}
                <View style={[styles.card, { borderColor: garageOpen ? '#facc15' : 'rgba(255,255,255,0.1)' }]}>
                     <View style={styles.cardHeader}>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <Car color={garageOpen ? "#facc15" : "#aaa"} size={20} />
                            <Text style={[styles.cardTitle, { color: garageOpen ? '#fff' : '#aaa' }]}> 
                                Cochera
                            </Text>
                        </View>
                        <Switch 
                            value={garageOpen} 
                            onValueChange={toggleGarage}
                            trackColor={{false: '#333', true: '#facc15'}}
                        />
                    </View>
                    <Text style={{color: '#aaa', fontSize: 12, marginLeft: 30}}>
                        Estado: <Text style={{color: garageOpen ? '#facc15' : '#aaa', fontWeight:'bold'}}>
                            {garageOpen ? 'ABIERTA' : 'CERRADA'}
                        </Text>
                    </Text>
                </View>

                {/* --- 2. TARJETA ALARMA ULTRASÓNICA --- */}
                <View style={[styles.card, { borderColor: alarmActive ? '#4ade80' : 'rgba(255,255,255,0.1)' }]}>
                     <View style={styles.cardHeader}>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <Activity color={alarmActive ? "#4ade80" : "#f87171"} size={20} />
                            <Text style={styles.cardTitle}> Sensor Prox. / Alarma</Text>
                        </View>
                        <Switch 
                            value={alarmActive} 
                            onValueChange={toggleAlarm}
                            trackColor={{false: '#333', true: '#4ade80'}}
                        />
                    </View>
                    <Text style={{color: '#aaa', fontSize: 12, marginLeft: 30}}>
                        Distancia detectada: <Text style={{color: '#fff', fontWeight:'bold'}}>{sensors.distancia} cm</Text>
                    </Text>
                </View>

                {/* --- 3. SENSORES AMBIENTALES --- */}
                <View style={styles.row}>
                    <View style={[styles.card, styles.sensorCard]}>
                        <Thermometer color="#ff6b6b" size={24} />
                        <Text style={styles.sensorValue}>{sensors.temp}°C</Text>
                        <Text style={styles.sensorLabel}>Temp</Text>
                    </View>
                    <View style={[styles.card, styles.sensorCard]}>
                        <Droplets color="#4ecdc4" size={24} />
                        <Text style={styles.sensorValue}>{sensors.humedad}%</Text>
                        <Text style={styles.sensorLabel}>Humedad</Text>
                    </View>
                </View>

                {/* --- 4. LISTA DE HABITACIONES (LEDS) --- */}
                <Text style={styles.sectionTitle}>Iluminación</Text>

                {rooms.map((room) => (
                    <View key={room.id} style={styles.card}>
                        <View style={styles.roomHeader}>
                            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                <Zap color={room.isOn ? "#f7b731" : "#555"} size={20} />
                                <Text style={[styles.cardTitle, {color: room.isOn ? '#fff' : '#aaa'}]}>
                                    {room.name}
                                </Text>
                            </View>
                            <Switch
                                trackColor={{ false: "#333", true: "#f7b731" }}
                                thumbColor={room.isOn ? "#fff" : "#f4f3f4"}
                                value={room.isOn}
                                onValueChange={() => toggleRoomLight(room.id, room.isOn, room.ledIndex)}
                            />
                        </View>

                        <View style={styles.sliderContainer}>
                            <Text style={styles.pwmLabel}>Intensidad: {Math.round(room.brightness)}%</Text>
                            <Slider
                                style={{width: '100%', height: 30}}
                                minimumValue={0} maximumValue={100}
                                minimumTrackTintColor="#f7b731" maximumTrackTintColor="#333" thumbTintColor="#fff"
                                value={room.brightness}
                                onValueChange={(val) => changeRoomBrightness(room.id, val, room.ledIndex)}
                                onSlidingComplete={(val) => handleSlidingComplete(room.id, val, room.ledIndex)}
                                disabled={!room.isOn}
                            />
                        </View>
                    </View>
                ))}
                <View style={{height: 50}} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    background: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
    scrollContent: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
    header: { marginBottom: 20 },
    greeting: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
    subtitle: { fontSize: 14, color: '#aaa' },
    sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 10 },
    card: {
        backgroundColor: 'rgba(25, 25, 35, 0.6)', borderRadius: 16, padding: 15, marginBottom: 15,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' },
    roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    cardTitle: { fontSize: 16, fontWeight: '600', marginLeft: 10 },
    cameraCard: { padding: 0, overflow: 'hidden' },
    cameraContainer: { height: 200, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    webview: { width: width - 42, height: 200, backgroundColor: 'transparent' },
    cameraPlaceholder: { alignItems: 'center' },
    placeholderText: { color: '#777', marginVertical: 10 },
    cameraButton: {
        borderColor: '#00d4ff', borderWidth: 1, paddingHorizontal: 20, paddingVertical: 8,
        borderRadius: 20, backgroundColor: 'rgba(0, 212, 255, 0.1)'
    },
    cameraButtonText: { color: '#00d4ff', fontWeight: 'bold', fontSize: 12 },
    expandButton: { position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 },
    closeFullScreenBtn: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 30, padding: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    sensorCard: { width: '48%', alignItems: 'center', paddingVertical: 20 },
    sensorValue: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 8 },
    sensorLabel: { fontSize: 12, color: '#aaa' },
    sliderContainer: { marginTop: 5 },
    pwmLabel: { color: '#777', fontSize: 12, marginBottom: 5, alignSelf: 'flex-end' }
});