/**
 * ============================================================================
 * ACTIVIDAD PC3 : "AEGIS-POSE WEB: VIDEOJUEGO FULL-STACK CON MEDIAPIPE, PYTHON Y MYSQL"
 * Cámara Web Visible Permanentemente + Vectores Corporales (33 Puntos) en Tiempo Real
 * ============================================================================
 */

import {
  PoseLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// Elementos del DOM
const video = document.getElementById("webcam");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const cameraDot = document.getElementById("cameraDot");
const cameraStatusText = document.getElementById("cameraStatusText");
const dbDot = document.getElementById("dbDot");
const dbStatusText = document.getElementById("dbStatusText");

const bannerHpText = document.getElementById("bannerHpText");
const bannerShieldText = document.getElementById("bannerShieldText");
const bannerWaveText = document.getElementById("bannerWaveText");
const matchStateChip = document.getElementById("matchStateChip");

const hpValue = document.getElementById("hpValue");
const hpBar = document.getElementById("hpBar");
const shieldValue = document.getElementById("shieldValue");
const shieldBar = document.getElementById("shieldBar");
const shieldCooldownBadge = document.getElementById("shieldCooldownBadge");
const timerValue = document.getElementById("timerValue");
const scoreValue = document.getElementById("scoreValue");
const comboValue = document.getElementById("comboValue");
const maxSpeedHud = document.getElementById("maxSpeedHud");

// Tarjetas de Estado de las 3 Poses (a, b, c)
const poseCardShield = document.getElementById("poseCardShield");
const poseCardShot = document.getElementById("poseCardShot");
const poseCardDodge = document.getElementById("poseCardDodge");
const poseBadgeShield = document.getElementById("poseBadgeShield");
const poseBadgeDodge = document.getElementById("poseBadgeDodge");

// Telemetría Matemática en Vivo
const liveVectorText = document.getElementById("liveVectorText");
const liveShieldDistText = document.getElementById("liveShieldDistText");
const liveTorsoText = document.getElementById("liveTorsoText");

const fpsCounter = document.getElementById("fpsCounter");
const activePoseTelemetry = document.getElementById("activePoseTelemetry");
const wristRatioTelemetry = document.getElementById("wristRatioTelemetry");
const wristSpeedTelemetry = document.getElementById("wristSpeedTelemetry");
const blocksTelemetry = document.getElementById("blocksTelemetry");
const shotsTelemetry = document.getElementById("shotsTelemetry");

const overlayTitle = document.getElementById("overlayTitle");
const overlayDesc = document.getElementById("overlayDesc");
const matchResultsBox = document.getElementById("matchResultsBox");
const closeResultsBtn = document.getElementById("closeResultsBtn");
const saveStatusBanner = document.getElementById("saveStatusBanner");
const usernameInput = document.getElementById("usernameInput");

const resScore = document.getElementById("resScore");
const resBlocks = document.getElementById("resBlocks");
const resHits = document.getElementById("resHits");
const resAccuracy = document.getElementById("resAccuracy");
const resMaxSpeed = document.getElementById("resMaxSpeed");
const resWave = document.getElementById("resWave");

const startCameraBtn = document.getElementById("startCameraBtn");
const startSimBtn = document.getElementById("startSimBtn");
const refreshRankingBtn = document.getElementById("refreshRankingBtn");
const rankingTableBody = document.getElementById("rankingTableBody");
const rankingSourceLabel = document.getElementById("rankingSourceLabel");

// Constantes del Juego según Especificación PC3
const GAME_DURATION = 70.0;          // 3 oleadas cronometradas (60 a 90 seg)
const WAVE_2_START = 20.0;           // 0s - 20s: Oleada 1 | 20s - 45s: Oleada 2
const WAVE_3_START = 45.0;           // 45s - 70s: Oleada 3 (+30% velocidad + meteoritos rojos)

const SHIELD_RATIO_THRESHOLD = 0.65; // < 65% del ancho de hombros activa el escudo
const SHIELD_DRAIN_RATE = 15.0;      // Consume 15% de energía por segundo
const SHIELD_REGEN_RATE = 10.0;      // Regeneración pasiva
const SHIELD_COOLDOWN_TIME = 3.0;    // 3 segundos de enfriamiento si llega a 0%
const PUNCH_SPEED_THRESHOLD = 1400;  // Umbral de velocidad de muñeca derecha (px/s)
const SHOT_COOLDOWN_TIME = 0.28;     // Cooldown breve entre disparos

// Estado de MediaPipe y Cámara (Activos todo el tiempo)
let poseLandmarker = null;
let webcamRunning = false;
let simulationMode = false;
let lastVideoTime = -1;
let lastDetectTimestamp = 0;
let currentLandmarks = null; // 33 puntos de MediaPipe en coordenadas del canvas

// Base URL inteligente para API Flask (soporta tanto Flask en :5000 como Live Server)
const API_BASE =
  window.location.port === "5000" ? "" : "http://127.0.0.1:5000";

// Controles del Modo Simulador
const simInput = {
  mouseX: canvas.width * 0.72,
  mouseY: canvas.height * 0.28,
  torsoOffsetX: 0,
  torsoOffsetY: 0,
  shieldHeld: false,
  punchImpulse: 0,
  keys: {}
};

// Estado de la Partida y Seguimiento Corporal Continuo
const gameState = {
  running: false, // false = Modo Práctica Libre (cámara y vectores visibles), true = Oleadas activas
  elapsedTime: 0,
  wave: 1,
  hp: 100,
  shieldEnergy: 100,
  shieldActive: false,
  shieldCooldown: 0,
  score: 0,
  combo: 1,
  blocksCount: 0,
  shotsFired: 0,
  shotsHit: 0,
  maxPunchSpeed: 0,
  currentWristSpeed: 0,
  prevRightWrist: null,
  prevTorsoCenter: null,
  torsoVelocity: { vx: 0, vy: 0 },
  shotCooldown: 0,
  shotVisualTimer: 0,
  lastLaserBeam: null,
  dodgingNow: false,
  screenShakeTime: 0,
  screenShakeIntensity: 0,
  spawnTimers: {
    blueSphere: 0,
    yellowDrone: 0,
    redMeteor: 0
  },
  enemies: [],
  drones: [],
  playerShots: [],
  particles: [],
  floatingTexts: []
};

let lastFrameTimestamp = performance.now();
let fpsSmooth = 60;

// ============================================================================
// SECCIÓN 2: MOTOR FÍSICO Y MATEMÁTICO (JS)
// ============================================================================

/**
 * 1) VECTOR DIRECTOR DE DISPARO
 * v = (X_muñeca - X_codo, Y_muñeca - Y_codo)
 */
function calcularVectorDirectorDisparo(codo14, muneca16) {
  const vx = muneca16.x - codo14.x;
  const vy = muneca16.y - codo14.y;
  const longitudAntebrazo = Math.hypot(vx, vy);

  if (longitudAntebrazo < 1e-5) {
    return { vx: 0, vy: 0, ux: 0, uy: -1, magnitud: 0 };
  }

  return {
    vx,
    vy,
    ux: vx / longitudAntebrazo,
    uy: vy / longitudAntebrazo,
    magnitud: longitudAntebrazo
  };
}

/**
 * 2) COLISIÓN ESCUDO-PROYECTIL (DISTANCIA PUNTO-SEGMENTO < RADIO)
 */
function distanciaPuntoSegmento(P, A, C) {
  const acx = C.x - A.x;
  const acy = C.y - A.y;
  const apx = P.x - A.x;
  const apy = P.y - A.y;

  const lenSq = acx * acx + acy * acy;
  let t = 0;
  if (lenSq > 1e-6) {
    t = (apx * acx + apy * acy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const bx = A.x + t * acx;
  const by = A.y + t * acy;
  const dist = Math.hypot(P.x - bx, P.y - by);
  return { distancia: dist, puntoCercano: { x: bx, y: by } };
}

/**
 * 3) HITBOX DINÁMICA DEL TORSO (FOUR-POINT POLYGON: 11 -> 12 -> 24 -> 23)
 */
function obtenerPoligonoTorso(landmarks) {
  if (!landmarks || landmarks.length < 25) return null;
  return [
    landmarks[11], // 11: Hombro izquierdo
    landmarks[12], // 12: Hombro derecho
    landmarks[24], // 24: Cadera derecha
    landmarks[23]  // 23: Cadera izquierda
  ];
}

function puntoEnPoligono(P, vertices) {
  let dentro = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;

    const intersecta =
      yi > P.y !== yj > P.y &&
      P.x < ((xj - xi) * (P.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

function colisionProyectilTorso(proyectil, verticesTorso) {
  if (!verticesTorso || verticesTorso.length !== 4) return false;
  if (puntoEnPoligono(proyectil, verticesTorso)) return true;

  for (let i = 0; i < 4; i++) {
    const A = verticesTorso[i];
    const C = verticesTorso[(i + 1) % 4];
    const { distancia } = distanciaPuntoSegmento(proyectil, A, C);
    if (distancia <= proyectil.radius) return true;
  }
  return false;
}

// ============================================================================
// CÁMARA WEB Y MEDIAPIPE POSE ACTIVOS AUTOMÁTICAMENTE DESDE EL INICIO
// ============================================================================

async function inicializarMediaPipe() {
  if (poseLandmarker) return true;
  try {
    cameraStatusText.textContent = "Cargando MediaPipe Pose (33 puntos)...";
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    return true;
  } catch (err) {
    console.error("Error cargando MediaPipe Pose:", err);
    return false;
  }
}

async function encenderCamaraPermanente() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    webcamRunning = true;
    simulationMode = false;
    cameraDot.classList.add("online");
    cameraStatusText.textContent = "Cámara Web En Vivo (Activa)";
  } catch (err) {
    console.warn("Cámara no detectada, activando esqueleto simulado:", err);
    simulationMode = true;
    cameraDot.classList.add("online");
    cameraStatusText.textContent = "Modo Simulador (Sin cámara física)";
  }

  await inicializarMediaPipe();
  if (webcamRunning) {
    cameraStatusText.textContent = "Cámara + MediaPipe Pose (60 FPS)";
  }
}

// ============================================================================
// ESQUELETO DE 33 PUNTOS EN MODO SIMULADOR (CON TODOS LOS PUNTOS DE MEDIAPIPE)
// ============================================================================

function actualizarEsqueletoSimulado(dt) {
  const moveSpeed = 430;
  if (simInput.keys["KeyA"] || simInput.keys["ArrowLeft"]) {
    simInput.torsoOffsetX -= moveSpeed * dt;
  }
  if (simInput.keys["KeyD"] || simInput.keys["ArrowRight"]) {
    simInput.torsoOffsetX += moveSpeed * dt;
  }
  const crouch = simInput.keys["KeyS"] || simInput.keys["ArrowDown"] ? 150 : 0;

  simInput.torsoOffsetX = Math.max(-380, Math.min(380, simInput.torsoOffsetX));
  simInput.torsoOffsetY += (crouch - simInput.torsoOffsetY) * Math.min(1, dt * 12);

  const cx = canvas.width * 0.5 + simInput.torsoOffsetX;
  const cy = canvas.height * 0.56 + simInput.torsoOffsetY;
  const leanAngle = simInput.torsoOffsetX * 0.0005;

  const pts = Array.from({ length: 33 }, () => ({ x: cx, y: cy, visibility: 1.0 }));

  // Cabeza y Rostro (0..10)
  const headX = cx + Math.sin(leanAngle) * 30;
  const headY = cy - 175;
  pts[0] = { x: headX, y: headY, visibility: 1 };
  pts[1] = { x: headX - 10, y: headY - 14, visibility: 1 };
  pts[2] = { x: headX - 16, y: headY - 14, visibility: 1 };
  pts[3] = { x: headX - 22, y: headY - 14, visibility: 1 };
  pts[4] = { x: headX + 10, y: headY - 14, visibility: 1 };
  pts[5] = { x: headX + 16, y: headY - 14, visibility: 1 };
  pts[6] = { x: headX + 22, y: headY - 14, visibility: 1 };
  pts[7] = { x: headX - 30, y: headY - 6, visibility: 1 };
  pts[8] = { x: headX + 30, y: headY - 6, visibility: 1 };
  pts[9] = { x: headX - 12, y: headY + 18, visibility: 1 };
  pts[10] = { x: headX + 12, y: headY + 18, visibility: 1 };

  // Hombros (11, 12) y Caderas (23, 24)
  const halfShoulder = 96;
  const halfHip = 70;
  pts[11] = { x: cx - halfShoulder, y: cy - 92, visibility: 1 };
  pts[12] = { x: cx + halfShoulder, y: cy - 92, visibility: 1 };
  pts[23] = { x: cx - halfHip - simInput.torsoOffsetX * 0.1, y: cy + 125, visibility: 1 };
  pts[24] = { x: cx + halfHip - simInput.torsoOffsetX * 0.1, y: cy + 125, visibility: 1 };

  // Piernas y Pies (25..32)
  pts[25] = { x: pts[23].x - 10, y: cy + 230, visibility: 1 };
  pts[26] = { x: pts[24].x + 10, y: cy + 230, visibility: 1 };
  pts[27] = { x: pts[23].x - 14, y: cy + 320, visibility: 1 };
  pts[28] = { x: pts[24].x + 14, y: cy + 320, visibility: 1 };
  pts[29] = { x: pts[27].x - 8, y: cy + 335, visibility: 1 };
  pts[30] = { x: pts[28].x + 8, y: cy + 335, visibility: 1 };
  pts[31] = { x: pts[27].x - 22, y: cy + 340, visibility: 1 };
  pts[32] = { x: pts[28].x + 22, y: cy + 340, visibility: 1 };

  if (simInput.shieldHeld) {
    // Pose a) ESCUDO DE ENERGÍA: Antebrazos cruzados en "X" frente al pecho
    pts[13] = { x: cx - 78, y: cy - 2, visibility: 1 };
    pts[14] = { x: cx + 78, y: cy - 2, visibility: 1 };
    pts[15] = { x: cx + 26, y: cy - 72, visibility: 1 };
    pts[16] = { x: cx - 26, y: cy - 72, visibility: 1 };
  } else {
    pts[13] = { x: cx - 128, y: cy - 10, visibility: 1 };
    pts[15] = { x: cx - 142, y: cy + 58, visibility: 1 };

    // Pose b) DISPARO CINÉTICO: Brazo derecho apunta hacia el objetivo (12 -> 14 -> 16)
    const dirX = simInput.mouseX - pts[12].x;
    const dirY = simInput.mouseY - pts[12].y;
    const norm = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / norm;
    const uy = dirY / norm;

    pts[14] = {
      x: pts[12].x + ux * 88,
      y: pts[12].y + uy * 88 + 12,
      visibility: 1
    };

    const reach = 96 + simInput.punchImpulse * 105;
    pts[16] = {
      x: pts[14].x + ux * reach,
      y: pts[14].y + uy * reach,
      visibility: 1
    };
  }

  // Dedos / Manos (17..22)
  pts[17] = { x: pts[15].x - 14, y: pts[15].y + 12, visibility: 1 };
  pts[19] = { x: pts[15].x - 18, y: pts[15].y - 4, visibility: 1 };
  pts[21] = { x: pts[15].x - 10, y: pts[15].y - 12, visibility: 1 };

  pts[18] = { x: pts[16].x + 14, y: pts[16].y + 12, visibility: 1 };
  pts[20] = { x: pts[16].x + 20, y: pts[16].y - 4, visibility: 1 };
  pts[22] = { x: pts[16].x + 12, y: pts[16].y - 12, visibility: 1 };

  if (simInput.punchImpulse > 0) {
    simInput.punchImpulse = Math.max(0, simInput.punchImpulse - dt * 6.2);
  }

  currentLandmarks = pts;
}

// ============================================================================
// GESTIÓN DE OLEADAS DE PARTIDA (SIN OCULTAR LA CÁMARA)
// ============================================================================

function iniciarPartida(forzarSimulador = null) {
  if (forzarSimulador === true) {
    simulationMode = true;
    cameraStatusText.textContent = "Simulador de Poses Activo (60 FPS)";
  } else if (forzarSimulador === false) {
    if (webcamRunning) {
      simulationMode = false;
      cameraStatusText.textContent = "Cámara + MediaPipe Pose (60 FPS)";
    } else {
      encenderCamaraPermanente();
    }
  }

  gameState.running = true;
  gameState.elapsedTime = 0;
  gameState.wave = 1;
  gameState.hp = 100;
  gameState.shieldEnergy = 100;
  gameState.shieldActive = false;
  gameState.shieldCooldown = 0;
  gameState.score = 0;
  gameState.combo = 1;
  gameState.blocksCount = 0;
  gameState.shotsFired = 0;
  gameState.shotsHit = 0;
  gameState.maxPunchSpeed = 0;
  gameState.currentWristSpeed = 0;
  gameState.shotCooldown = 0;
  gameState.shotVisualTimer = 0;
  gameState.lastLaserBeam = null;
  gameState.screenShakeTime = 0;
  gameState.enemies = [];
  gameState.drones = [];
  gameState.playerShots = [];
  gameState.particles = [];
  gameState.floatingTexts = [];
  gameState.spawnTimers = { blueSphere: 0.7, yellowDrone: 2.2, redMeteor: 2.8 };

  matchResultsBox.classList.add("hidden");
  matchStateChip.textContent = "⚔️ COMBATE EN CURSO (OLEADAS ACTIVAS)";
  matchStateChip.style.color = "#00e5ff";
}

async function finalizarPartida(victoria) {
  gameState.running = false;
  gameState.enemies = [];
  gameState.drones = [];
  matchResultsBox.classList.remove("hidden");

  matchStateChip.textContent = "🎥 CÁMARA Y VECTORES ACTIVOS (MODO PRÁCTICA LIBRE)";
  matchStateChip.style.color = "#00e676";

  overlayTitle.textContent = victoria
    ? "¡VICTORIA! 3 OLEADAS COMPLETADAS"
    : "¡PARTIDA FINALIZADA! (0 HP)";
  overlayDesc.textContent =
    "La cámara y los vectores siguen activos. Tus métricas fueron enviadas a MySQL.";

  const precision =
    gameState.shotsFired > 0
      ? Number(((gameState.shotsHit / gameState.shotsFired) * 100).toFixed(1))
      : 0.0;

  resScore.textContent = gameState.score;
  resBlocks.textContent = gameState.blocksCount;
  resHits.textContent = gameState.shotsHit;
  resAccuracy.textContent = `${precision}%`;
  resMaxSpeed.textContent = `${Math.round(gameState.maxPunchSpeed)} px/s`;
  resWave.textContent = `${gameState.wave}/3`;

  const payload = {
    username: (usernameInput.value || "Agente_Aegis").trim(),
    puntaje: gameState.score,
    bloqueos_escudo: gameState.blocksCount,
    disparos_acertados: gameState.shotsHit,
    precision_disparos: precision,
    velocidad_max_golpe: Number(gameState.maxPunchSpeed.toFixed(1)),
    oleada_alcanzada: gameState.wave
  };

  saveStatusBanner.textContent = "Guardando métricas en MySQL...";
  saveStatusBanner.style.color = "#00e5ff";

  try {
    const resp = await fetch(`${API_BASE}/api/partidas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.ok) {
      saveStatusBanner.textContent = `✔ Guardado en ${data.db_info.engine} (Partida #${data.db_info.partida_id})`;
      saveStatusBanner.style.color = "#00e676";
      renderizarTablaRanking(data.ranking);
    } else {
      saveStatusBanner.textContent = `⚠ Error: ${data.error}`;
      saveStatusBanner.style.color = "#ff5252";
    }
  } catch (err) {
    // Respaldo local en el navegador si el usuario abrió el HTML sin iniciar app.py
    const localList = JSON.parse(localStorage.getItem("aegis_local_ranking") || "[]");
    localList.push(payload);
    localList.sort((a, b) => b.puntaje - a.puntaje);
    localStorage.setItem("aegis_local_ranking", JSON.stringify(localList.slice(0, 10)));
    renderizarTablaRanking(localList.slice(0, 10));
    saveStatusBanner.textContent = "✔ Guardado en Ranking Local (Inicia app.py para MySQL)";
    saveStatusBanner.style.color = "#ffd600";
  }
}

// ============================================================================
// GENERACIÓN DE AMENAZAS
// ============================================================================

function obtenerMultiplicadorVelocidadOleada() {
  return gameState.wave === 3 ? 1.3 : 1.0;
}

function spawnearEsferaAzul() {
  const mult = obtenerMultiplicadorVelocidadOleada();
  const margin = 200;
  const x = margin + Math.random() * (canvas.width - margin * 2);
  const speed = (225 + Math.random() * 75) * mult;

  gameState.enemies.push({
    type: "BLUE_SPHERE",
    x,
    y: -25,
    vx: 0,
    vy: speed,
    radius: 20,
    blockable: true,
    color: "#00e5ff"
  });
}

function spawnearDronAmarillo() {
  const fromLeft = Math.random() < 0.5;
  const startX = fromLeft ? -45 : canvas.width + 45;
  const startY = 65 + Math.random() * 120;
  const targetX = 180 + Math.random() * (canvas.width - 360);
  const targetY = 85 + Math.random() * 145;

  gameState.drones.push({
    x: startX,
    y: startY,
    targetX,
    targetY,
    radius: 30,
    phase: "POSITIONING",
    chargeTimer: 2.5,
    maxCharge: 2.5,
    pulsePhase: 0
  });
}

function spawnearMeteoritoRojo() {
  const mult = obtenerMultiplicadorVelocidadOleada();
  let targetX = canvas.width * 0.5;
  let targetY = canvas.height * 0.56;
  if (currentLandmarks && currentLandmarks[11] && currentLandmarks[12]) {
    targetX = (currentLandmarks[11].x + currentLandmarks[12].x) * 0.5;
    targetY = (currentLandmarks[11].y + currentLandmarks[23].y) * 0.5;
  }

  const fromRight = Math.random() < 0.65;
  const startX = fromRight
    ? Math.min(canvas.width - 60, targetX + 180 + Math.random() * 140)
    : Math.max(60, targetX - 180 - Math.random() * 140);
  const startY = -35;

  const dx = targetX - startX;
  const dy = targetY - startY;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = (360 + Math.random() * 60) * mult;

  gameState.enemies.push({
    type: "RED_METEOR",
    x: startX,
    y: startY,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    aimedAtX: targetX,
    aimedAtY: targetY,
    dodgeAwarded: false,
    radius: 28,
    blockable: false,
    color: "#ff1744"
  });

  crearTextoFlotante(targetX, 60, "☄️ ¡METEORITO ROJO IMBLOQUEABLE! ¡ESQUIVA!", "#ff5252");
}

// ============================================================================
// PROCESAMIENTO CONTINUO DE VECTORES CORPORALES Y POSES (AUN EN PRÁCTICA)
// ============================================================================

function procesarVectoresYPosesContinuamente(dt) {
  if (gameState.shieldCooldown > 0) {
    gameState.shieldCooldown = Math.max(0, gameState.shieldCooldown - dt);
  }
  if (gameState.shotCooldown > 0) {
    gameState.shotCooldown = Math.max(0, gameState.shotCooldown - dt);
  }
  if (gameState.shotVisualTimer > 0) {
    gameState.shotVisualTimer = Math.max(0, gameState.shotVisualTimer - dt);
  }
  if (gameState.screenShakeTime > 0) {
    gameState.screenShakeTime = Math.max(0, gameState.screenShakeTime - dt);
  }

  let shieldSegment = null;

  if (currentLandmarks && currentLandmarks.length >= 25) {
    const lShoulder = currentLandmarks[11];
    const rShoulder = currentLandmarks[12];
    const rElbow = currentLandmarks[14];
    const lWrist = currentLandmarks[15];
    const rWrist = currentLandmarks[16];
    const lHip = currentLandmarks[23];
    const rHip = currentLandmarks[24];

    const shoulderWidth = Math.hypot(rShoulder.x - lShoulder.x, rShoulder.y - lShoulder.y);
    const wristDist = Math.hypot(rWrist.x - lWrist.x, rWrist.y - lWrist.y);
    const ratio = shoulderWidth > 10 ? wristDist / shoulderWidth : 9.99;

    wristRatioTelemetry.textContent = `${(ratio * 100).toFixed(0)}% (umbral <65%)`;

    // Vector Director de Disparo en vivo (14 -> 16)
    const dir = calcularVectorDirectorDisparo(rElbow, rWrist);
    liveVectorText.textContent = `v = (${Math.round(dir.vx)}, ${Math.round(dir.vy)})`;

    // Centro de masa G del polígono del torso y su vector velocidad
    const torsoCenterX = (lShoulder.x + rShoulder.x + lHip.x + rHip.x) * 0.25;
    const torsoCenterY = (lShoulder.y + rShoulder.y + lHip.y + rHip.y) * 0.25;
    if (gameState.prevTorsoCenter && dt > 0.001) {
      gameState.torsoVelocity = {
        vx: (torsoCenterX - gameState.prevTorsoCenter.x) / dt,
        vy: (torsoCenterY - gameState.prevTorsoCenter.y) / dt
      };
    }
    gameState.prevTorsoCenter = { x: torsoCenterX, y: torsoCenterY };
    liveTorsoText.textContent = `G(${Math.round(torsoCenterX)}, ${Math.round(torsoCenterY)})`;

    // ------------------------------------------------------------------------
    // POSE a) ESCUDO DE ENERGÍA (+25 pts)
    // ------------------------------------------------------------------------
    const hipY = (lHip.y + rHip.y) * 0.5;
    const wristsAtChest = lWrist.y < hipY && rWrist.y < hipY;
    const posturaEscudo = ratio < SHIELD_RATIO_THRESHOLD && wristsAtChest;

    if (posturaEscudo && gameState.shieldCooldown <= 0 && gameState.shieldEnergy > 0) {
      gameState.shieldActive = true;
      if (gameState.running) {
        gameState.shieldEnergy = Math.max(0, gameState.shieldEnergy - SHIELD_DRAIN_RATE * dt);
        if (gameState.shieldEnergy <= 0) {
          gameState.shieldActive = false;
          gameState.shieldCooldown = SHIELD_COOLDOWN_TIME;
          crearTextoFlotante(
            (lWrist.x + rWrist.x) / 2,
            (lWrist.y + rWrist.y) / 2,
            "¡ESCUDO EN ENFRIAMIENTO (3s)!",
            "#ff1744"
          );
        }
      }

      if (gameState.shieldActive) {
        const midX = (lWrist.x + rWrist.x) * 0.5;
        const midY = (lWrist.y + rWrist.y) * 0.5;
        const span = Math.max(115, shoulderWidth * 0.95);
        const dx = rWrist.x - lWrist.x;
        const dy = rWrist.y - lWrist.y;
        const len = Math.hypot(dx, dy);
        const ux = len > 8 ? dx / len : 1;
        const uy = len > 8 ? dy / len : 0;

        shieldSegment = {
          A: { x: midX - ux * span, y: midY - uy * span },
          C: { x: midX + ux * span, y: midY + uy * span },
          center: { x: midX, y: midY },
          thickness: 34
        };
      }
    } else {
      gameState.shieldActive = false;
      if (gameState.shieldCooldown <= 0) {
        gameState.shieldEnergy = Math.min(100, gameState.shieldEnergy + SHIELD_REGEN_RATE * dt);
      }
    }

    // ------------------------------------------------------------------------
    // POSE b) DISPARO CINÉTICO (+50 pts)
    // ------------------------------------------------------------------------
    if (gameState.prevRightWrist && dt > 0.001) {
      const distWrist = Math.hypot(
        rWrist.x - gameState.prevRightWrist.x,
        rWrist.y - gameState.prevRightWrist.y
      );
      const instantSpeed = distWrist / dt;
      gameState.currentWristSpeed = gameState.currentWristSpeed * 0.35 + instantSpeed * 0.65;

      if (gameState.currentWristSpeed > gameState.maxPunchSpeed) {
        gameState.maxPunchSpeed = gameState.currentWristSpeed;
      }

      if (
        !gameState.shieldActive &&
        gameState.currentWristSpeed >= PUNCH_SPEED_THRESHOLD &&
        gameState.shotCooldown <= 0
      ) {
        if (dir.magnitud > 5) {
          dispararProyectilCinetico(rShoulder, rElbow, rWrist, dir);
          gameState.shotCooldown = SHOT_COOLDOWN_TIME;
          gameState.shotVisualTimer = 0.28;
        }
      }
    }
    gameState.prevRightWrist = { x: rWrist.x, y: rWrist.y };

    // ------------------------------------------------------------------------
    // POSE c) ESQUIVA CORPORAL (Sin daño)
    // ------------------------------------------------------------------------
    const offsetLateral = Math.abs(torsoCenterX - canvas.width * 0.5);
    const offsetVertical = torsoCenterY - canvas.height * 0.56;
    gameState.dodgingNow = offsetLateral > 85 || offsetVertical > 55;

    actualizarTarjetasPoses(offsetLateral, offsetVertical);
  }

  return shieldSegment;
}

function actualizarLogicaJuego(dt) {
  // 1. Siempre procesar los vectores del cuerpo y las poses (incluso antes de iniciar partida)
  const shieldSegment = procesarVectoresYPosesContinuamente(dt);
  const torsoPoly = obtenerPoligonoTorso(currentLandmarks);

  // Actualizar proyectiles disparados en práctica o en partida
  for (let i = gameState.playerShots.length - 1; i >= 0; i--) {
    const shot = gameState.playerShots[i];
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;

    let hitDrone = false;
    for (let j = gameState.drones.length - 1; j >= 0; j--) {
      const drone = gameState.drones[j];
      const dist = Math.hypot(shot.x - drone.x, shot.y - drone.y);
      if (dist <= shot.radius + drone.radius + 12) {
        gameState.shotsHit += 1;
        const ptsGanados = 50 * gameState.combo;
        gameState.score += ptsGanados;
        gameState.combo = Math.min(8, gameState.combo + 1);

        crearExplosionParticulas(drone.x, drone.y, "#ffd600", 22);
        crearTextoFlotante(drone.x, drone.y, `+${ptsGanados} DRON DESTRUIDO!`, "#ffd600");

        gameState.drones.splice(j, 1);
        hitDrone = true;
        break;
      }
    }

    if (
      hitDrone ||
      shot.x < -60 ||
      shot.x > canvas.width + 60 ||
      shot.y < -60 ||
      shot.y > canvas.height + 60
    ) {
      gameState.playerShots.splice(i, 1);
    }
  }

  // Actualizar partículas y textos flotantes siempre
  for (let i = gameState.particles.length - 1; i >= 0; i--) {
    const p = gameState.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) gameState.particles.splice(i, 1);
  }

  for (let i = gameState.floatingTexts.length - 1; i >= 0; i--) {
    const ft = gameState.floatingTexts[i];
    ft.y -= 42 * dt;
    ft.life -= dt;
    if (ft.life <= 0) gameState.floatingTexts.splice(i, 1);
  }

  // Si aún no se han iniciado las oleadas, actualizamos HUD y terminamos aquí
  if (!gameState.running) {
    actualizarHUD();
    return;
  }

  // 2. Progresión de Oleadas Cronometradas (cuando la partida está en curso)
  gameState.elapsedTime += dt;
  if (gameState.elapsedTime >= GAME_DURATION) {
    finalizarPartida(true);
    return;
  }

  if (gameState.elapsedTime < WAVE_2_START) {
    gameState.wave = 1;
  } else if (gameState.elapsedTime < WAVE_3_START) {
    if (gameState.wave === 1) {
      crearTextoFlotante(canvas.width / 2, canvas.height / 2, "¡OLEADA 2/3: DRONES INTERCEPTORES!", "#ffd600");
    }
    gameState.wave = 2;
  } else {
    if (gameState.wave === 2) {
      crearTextoFlotante(canvas.width / 2, canvas.height / 2, "¡OLEADA 3/3: METEORITOS ROJOS (+30% VEL)!", "#ff1744");
    }
    gameState.wave = 3;
  }

  // Spawn de enemigos
  gameState.spawnTimers.blueSphere -= dt;
  if (gameState.spawnTimers.blueSphere <= 0) {
    spawnearEsferaAzul();
    gameState.spawnTimers.blueSphere =
      gameState.wave === 1 ? 1.5 : gameState.wave === 2 ? 1.4 : 1.1;
  }

  if (gameState.wave >= 2) {
    gameState.spawnTimers.yellowDrone -= dt;
    if (gameState.spawnTimers.yellowDrone <= 0 && gameState.drones.length < 3) {
      spawnearDronAmarillo();
      gameState.spawnTimers.yellowDrone = gameState.wave === 2 ? 4.0 : 3.2;
    }
  }

  if (gameState.wave === 3) {
    gameState.spawnTimers.redMeteor -= dt;
    if (gameState.spawnTimers.redMeteor <= 0) {
      spawnearMeteoritoRojo();
      gameState.spawnTimers.redMeteor = 3.5;
    }
  }

  // Drones Amarillos (3 fases)
  const mult = obtenerMultiplicadorVelocidadOleada();
  for (let i = gameState.drones.length - 1; i >= 0; i--) {
    const d = gameState.drones[i];
    d.pulsePhase += dt * 10;

    if (d.phase === "POSITIONING") {
      const dx = d.targetX - d.x;
      const dy = d.targetY - d.y;
      const dist = Math.hypot(dx, dy);
      const step = 360 * mult * dt;
      if (dist <= step) {
        d.x = d.targetX;
        d.y = d.targetY;
        d.phase = "CHARGING";
      } else {
        d.x += (dx / dist) * step;
        d.y += (dy / dist) * step;
      }
    } else if (d.phase === "CHARGING") {
      d.chargeTimer -= dt;
      if (d.chargeTimer <= 0) {
        let targetX = canvas.width * 0.5;
        let targetY = canvas.height * 0.55;
        if (torsoPoly) {
          targetX = (torsoPoly[0].x + torsoPoly[1].x + torsoPoly[2].x + torsoPoly[3].x) * 0.25;
          targetY = (torsoPoly[0].y + torsoPoly[1].y + torsoPoly[2].y + torsoPoly[3].y) * 0.25;
        }
        const dx = targetX - d.x;
        const dy = targetY - d.y;
        const norm = Math.hypot(dx, dy) || 1;
        const projSpeed = 510 * mult;

        gameState.enemies.push({
          type: "DRONE_LASER",
          x: d.x,
          y: d.y,
          vx: (dx / norm) * projSpeed,
          vy: (dy / norm) * projSpeed,
          radius: 15,
          blockable: true,
          color: "#ffd600"
        });

        crearTextoFlotante(d.x, d.y, "¡ATAQUE DE DRON!", "#ffd600");
        gameState.drones.splice(i, 1);
      }
    }
  }

  // Colisiones de Amenazas
  let minShieldDist = null;
  for (let i = gameState.enemies.length - 1; i >= 0; i--) {
    const e = gameState.enemies[i];
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    if (e.blockable && gameState.shieldActive && shieldSegment) {
      const { distancia, puntoCercano } = distanciaPuntoSegmento(
        e,
        shieldSegment.A,
        shieldSegment.C
      );
      if (minShieldDist === null || distancia < minShieldDist) {
        minShieldDist = distancia;
      }
      if (distancia <= e.radius + shieldSegment.thickness) {
        gameState.blocksCount += 1;
        const pts = 25 * gameState.combo;
        gameState.score += pts;
        gameState.combo = Math.min(8, gameState.combo + 1);

        crearExplosionParticulas(puntoCercano.x, puntoCercano.y, "#00e5ff", 18);
        crearTextoFlotante(e.x, e.y, `+${pts} ESCUDO!`, "#00e5ff");
        gameState.enemies.splice(i, 1);
        continue;
      }
    }

    if (torsoPoly && colisionProyectilTorso(e, torsoPoly)) {
      gameState.hp = Math.max(0, gameState.hp - 20);
      gameState.combo = 1;
      activarScreenShake(0.35, 14);

      crearExplosionParticulas(e.x, e.y, "#ff1744", 24);
      crearTextoFlotante(e.x, e.y, "-20 HP ¡IMPACTO EN TORSO!", "#ff1744");
      gameState.enemies.splice(i, 1);

      if (gameState.hp <= 0) {
        finalizarPartida(false);
        return;
      }
      continue;
    }

    if (
      e.type === "RED_METEOR" &&
      !e.dodgeAwarded &&
      e.y > e.aimedAtY + 45
    ) {
      e.dodgeAwarded = true;
      crearTextoFlotante(e.x, e.y - 30, "✔ ¡ESQUIVA CORPORAL (SIN DAÑO)!", "#00e676");
    }

    if (e.y > canvas.height + 70 || e.x < -90 || e.x > canvas.width + 90) {
      gameState.enemies.splice(i, 1);
    }
  }

  if (minShieldDist !== null) {
    liveShieldDistText.textContent = `d = ${Math.round(minShieldDist)} px`;
  } else {
    liveShieldDistText.textContent = `d(P, AC) < Radio`;
  }

  actualizarHUD();
}

function actualizarTarjetasPoses(offsetLateral, offsetVertical) {
  if (gameState.shieldActive) {
    poseCardShield.classList.add("active-pose");
    poseBadgeShield.textContent = "🛡️ ESCUDO ACTIVO";
  } else {
    poseCardShield.classList.remove("active-pose");
    poseBadgeShield.textContent =
      gameState.shieldCooldown > 0 ? "ENFRIAMIENTO" : "EN ESPERA";
  }

  if (gameState.shotVisualTimer > 0) {
    poseCardShot.classList.add("active-shot");
  } else {
    poseCardShot.classList.remove("active-shot");
  }

  if (gameState.dodgingNow) {
    poseCardDodge.classList.add("active-pose");
    poseBadgeDodge.textContent =
      offsetVertical > 55 ? "⬇ AGACHADO (ESQUIVA)" : "↔ DESPLAZADO (ESQUIVA)";
  } else {
    poseCardDodge.classList.remove("active-pose");
    poseBadgeDodge.textContent = "TORSO CENTRADO";
  }

  if (gameState.shieldActive) {
    activePoseTelemetry.textContent = "a) ESCUDO DE ENERGÍA";
  } else if (gameState.shotVisualTimer > 0) {
    activePoseTelemetry.textContent = "b) DISPARO CINÉTICO";
  } else if (gameState.dodgingNow) {
    activePoseTelemetry.textContent = "c) ESQUIVA CORPORAL";
  } else {
    activePoseTelemetry.textContent = "GUARDIA NEUTRAL";
  }
}

function dispararProyectilCinetico(hombro12, codo14, muneca16, dir) {
  const speed = 1040;
  if (gameState.running) {
    gameState.shotsFired += 1;
  }

  let ux = dir.ux;
  let uy = dir.uy;
  let targetBeamEnd = { x: muneca16.x + ux * 650, y: muneca16.y + uy * 650 };
  let mejorCos = 0.85;

  for (const d of gameState.drones) {
    const dx = d.x - muneca16.x;
    const dy = d.y - muneca16.y;
    const dist = Math.hypot(dx, dy) || 1;
    const cosAng = (dx / dist) * dir.ux + (dy / dist) * dir.uy;
    if (cosAng > mejorCos) {
      mejorCos = cosAng;
      ux = dx / dist;
      uy = dy / dist;
      targetBeamEnd = { x: d.x, y: d.y };
    }
  }

  gameState.playerShots.push({
    x: muneca16.x,
    y: muneca16.y,
    vx: ux * speed,
    vy: uy * speed,
    radius: 14
  });

  gameState.lastLaserBeam = {
    shoulder: { x: hombro12.x, y: hombro12.y },
    elbow: { x: codo14.x, y: codo14.y },
    wrist: { x: muneca16.x, y: muneca16.y },
    end: targetBeamEnd
  };

  crearExplosionParticulas(muneca16.x, muneca16.y, "#ff9100", 14);
  crearTextoFlotante(muneca16.x, muneca16.y - 20, "⚡ DISPARO CINÉTICO!", "#ff9100");
}

function activarScreenShake(duracion, intensidad) {
  gameState.screenShakeTime = duracion;
  gameState.screenShakeIntensity = intensidad;
}

function crearExplosionParticulas(x, y, color, cantidad = 14) {
  for (let i = 0; i < cantidad; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 65 + Math.random() * 230;
    gameState.particles.push({
      x,
      y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      color,
      life: 0.35 + Math.random() * 0.25
    });
  }
}

function crearTextoFlotante(x, y, text, color) {
  gameState.floatingTexts.push({ x, y, text, color, life: 1.05 });
}

// ============================================================================
// RENDERIZADO DE LA CÁMARA EN VIVO + VECTORES CORPORALES COMPLETOS (60 FPS)
// ============================================================================

function dibujarFlechaVector(x1, y1, x2, y2, color, lineWidth = 3, headLen = 11) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const angle = Math.atan2(dy, dx);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function renderizarEscena() {
  ctx.save();

  if (gameState.screenShakeTime > 0) {
    const s = gameState.screenShakeIntensity * (gameState.screenShakeTime / 0.35);
    ctx.translate((Math.random() - 0.5) * 2 * s, (Math.random() - 0.5) * 2 * s);
  }

  // 1. CÁMARA WEB VISIBLE TODO EL TIEMPO EN ESPEJO (CLARA Y NÍTIDA)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (webcamRunning && !simulationMode && video.readyState >= 2) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    // Velo muy sutil (15%) solo para que los vectores brillantes destaquen sobre fondos blancos
    ctx.fillStyle = "rgba(4, 10, 22, 0.15)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    dibujarFondoTactico();
  }

  // 2. DIBUJAR TODOS LOS VECTORES DEL CUERPO (33 LANDMARKS MEDIAPIPE)
  if (currentLandmarks) {
    dibujarVectoresDelCuerpo(currentLandmarks);
  }

  // 3. Dibujar Drones Interceptores Amarillos
  for (const d of gameState.drones) {
    dibujarDronCuadricoptero(d);
  }

  // 4. Dibujar Amenazas
  for (const e of gameState.enemies) {
    dibujarAmenaza(e);
  }

  // 5. Dibujar Proyectiles Cinéticos Naranja/Dorado
  for (const s of gameState.playerShots) {
    ctx.save();
    const grad = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.radius * 1.4);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.4, "#ffd600");
    grad.addColorStop(1, "rgba(255, 109, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 6. Partículas y Textos Flotantes
  for (const p of gameState.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const ft of gameState.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.font = "bold 17px Orbitron, sans-serif";
    ctx.fillStyle = ft.color;
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore();
}

function dibujarFondoTactico() {
  ctx.fillStyle = "#050b16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(0, 229, 255, 0.08)";
  ctx.lineWidth = 1;
  const grid = 64;
  for (let x = 0; x < canvas.width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function dibujarVectoresDelCuerpo(pts) {
  const poly = obtenerPoligonoTorso(pts);
  if (!poly) return;

  // --------------------------------------------------------------------------
  // A. POLÍGONO VECTORIAL DEL TORSO (11 -> 12 -> 24 -> 23) + CENTRO DE MASA G
  // --------------------------------------------------------------------------
  ctx.save();
  ctx.fillStyle = gameState.dodgingNow
    ? "rgba(0, 230, 118, 0.22)"
    : "rgba(0, 229, 255, 0.16)";
  ctx.strokeStyle = gameState.dodgingNow ? "#00e676" : "#00e5ff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  ctx.lineTo(poly[1].x, poly[1].y);
  ctx.lineTo(poly[2].x, poly[2].y);
  ctx.lineTo(poly[3].x, poly[3].y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Vectores dirigidos en las aristas del torso
  dibujarFlechaVector(poly[0].x, poly[0].y, poly[1].x, poly[1].y, "#00e5ff", 2.5, 9);
  dibujarFlechaVector(poly[3].x, poly[3].y, poly[2].x, poly[2].y, "#00e5ff", 2.5, 9);

  // Centro de masa G(x,y) y vector velocidad de esquiva del torso
  const gx = (poly[0].x + poly[1].x + poly[2].x + poly[3].x) * 0.25;
  const gy = (poly[0].y + poly[1].y + poly[2].y + poly[3].y) * 0.25;
  ctx.fillStyle = "#00e676";
  ctx.beginPath();
  ctx.arc(gx, gy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "bold 11px Orbitron, sans-serif";
  ctx.fillText(`G(${Math.round(gx)},${Math.round(gy)})`, gx + 8, gy + 4);

  if (Math.hypot(gameState.torsoVelocity.vx, gameState.torsoVelocity.vy) > 25) {
    dibujarFlechaVector(
      gx,
      gy,
      gx + gameState.torsoVelocity.vx * 0.22,
      gy + gameState.torsoVelocity.vy * 0.22,
      "#00e676",
      3,
      10
    );
  }

  // Etiquetas de los vértices 11, 12, 23, 24
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px Orbitron, sans-serif";
  ctx.fillText("11", poly[0].x - 24, poly[0].y - 6);
  ctx.fillText("12", poly[1].x + 10, poly[1].y - 6);
  ctx.fillText("24", poly[2].x + 10, poly[2].y + 16);
  ctx.fillText("23", poly[3].x - 24, poly[3].y + 16);
  ctx.restore();

  // --------------------------------------------------------------------------
  // B. VECTORES DIRIGIDOS DE EXTREMIDADES Y ROSTRO (33 PUNTOS MEDIAPIPE)
  // --------------------------------------------------------------------------
  // Vectores del rostro (0 -> ojos -> orejas y boca)
  const vectoresRostro = [
    [0, 2], [2, 7],
    [0, 5], [5, 8],
    [9, 10]
  ];
  ctx.save();
  ctx.strokeStyle = "rgba(0, 229, 255, 0.75)";
  ctx.lineWidth = 2;
  for (const [a, b] of vectoresRostro) {
    if (pts[a] && pts[b]) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
  }
  if (pts[0] && pts[11] && pts[12]) {
    const neckX = (pts[11].x + pts[12].x) * 0.5;
    const neckY = (pts[11].y + pts[12].y) * 0.5;
    dibujarFlechaVector(neckX, neckY, pts[0].x, pts[0].y, "#00e5ff", 2.5, 9);
  }
  ctx.restore();

  // Vectores del brazo izquierdo (11 -> 13 -> 15) y mano (15 -> 17, 19, 21)
  if (pts[11] && pts[13]) dibujarFlechaVector(pts[11].x, pts[11].y, pts[13].x, pts[13].y, "#00e5ff", 3.5, 11);
  if (pts[13] && pts[15]) dibujarFlechaVector(pts[13].x, pts[13].y, pts[15].x, pts[15].y, "#00e5ff", 3.5, 11);
  for (const h of [17, 19, 21]) {
    if (pts[15] && pts[h]) dibujarFlechaVector(pts[15].x, pts[15].y, pts[h].x, pts[h].y, "#80d8ff", 2, 6);
  }

  // Vectores de las piernas (23 -> 25 -> 27 -> 31 y 24 -> 26 -> 28 -> 32)
  const vectoresPiernas = [
    [23, 25], [25, 27], [27, 31],
    [24, 26], [26, 28], [28, 32]
  ];
  for (const [a, b] of vectoresPiernas) {
    if (pts[a] && pts[b]) {
      dibujarFlechaVector(pts[a].x, pts[a].y, pts[b].x, pts[b].y, "#00b0ff", 3, 9);
    }
  }

  // --------------------------------------------------------------------------
  // C. VECTOR DIRECTOR NARANJA DEL BRAZO DERECHO (12 -> 14 -> 16)
  // --------------------------------------------------------------------------
  if (pts[12] && pts[14] && pts[16]) {
    const dir = calcularVectorDirectorDisparo(pts[14], pts[16]);

    // Vector Hombro(12) -> Codo(14) y Vector Director Codo(14) -> Muñeca(16)
    dibujarFlechaVector(pts[12].x, pts[12].y, pts[14].x, pts[14].y, "#ff9100", 4, 12);
    dibujarFlechaVector(pts[14].x, pts[14].y, pts[16].x, pts[16].y, "#ff9100", 4.5, 14);

    for (const h of [18, 20, 22]) {
      if (pts[16] && pts[h]) dibujarFlechaVector(pts[16].x, pts[16].y, pts[h].x, pts[h].y, "#ffd600", 2, 6);
    }

    // Proyección del Vector Director y lectura matemática junto al brazo
    if (!gameState.shieldActive && dir.magnitud > 5) {
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "rgba(255, 145, 0, 0.85)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(pts[16].x, pts[16].y);
      ctx.lineTo(pts[16].x + dir.ux * 250, pts[16].y + dir.uy * 250);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#ffd600";
      ctx.font = "bold 11px Orbitron, sans-serif";
      ctx.fillText(
        `v=(${Math.round(dir.vx)}, ${Math.round(dir.vy)}) | ${Math.round(gameState.currentWristSpeed)} px/s`,
        pts[16].x + 14,
        pts[16].y - 10
      );
      ctx.restore();
    }
  }

  // Vector de distancia entre Muñeca Izq (15) y Muñeca Der (16)
  if (pts[15] && pts[16] && pts[11] && pts[12] && !gameState.shieldActive) {
    const shoulderW = Math.hypot(pts[12].x - pts[11].x, pts[12].y - pts[11].y) || 1;
    const wristD = Math.hypot(pts[16].x - pts[15].x, pts[16].y - pts[15].y);
    const pct = Math.round((wristD / shoulderW) * 100);

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(0, 229, 255, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pts[15].x, pts[15].y);
    ctx.lineTo(pts[16].x, pts[16].y);
    ctx.stroke();
    ctx.setLineDash([]);

    const mx = (pts[15].x + pts[16].x) * 0.5;
    const my = (pts[15].y + pts[16].y) * 0.5;
    ctx.fillStyle = "#80d8ff";
    ctx.font = "bold 11px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`d(15,16): ${pct}%`, mx, my - 8);
    ctx.restore();
  }

  // Destello del Rayo Cinético Naranja cuando se ejecuta el golpe
  if (gameState.shotVisualTimer > 0 && gameState.lastLaserBeam) {
    const b = gameState.lastLaserBeam;
    ctx.save();
    ctx.globalAlpha = Math.min(1, gameState.shotVisualTimer * 4);
    ctx.strokeStyle = "#ff9100";
    ctx.shadowColor = "#ff6d00";
    ctx.shadowBlur = 24;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(b.shoulder.x, b.shoulder.y);
    ctx.lineTo(b.elbow.x, b.elbow.y);
    ctx.lineTo(b.wrist.x, b.wrist.y);
    ctx.lineTo(b.end.x, b.end.y);
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.wrist.x, b.wrist.y);
    ctx.lineTo(b.end.x, b.end.y);
    ctx.stroke();
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // D. DOMO DE ESCUDO DE ENERGÍA + SEGMENTO A-B-C (Pose a)
  // --------------------------------------------------------------------------
  if (gameState.shieldActive && pts[15] && pts[16] && pts[11] && pts[12]) {
    const shoulderWidth = Math.hypot(pts[12].x - pts[11].x, pts[12].y - pts[11].y);
    const midX = (pts[15].x + pts[16].x) * 0.5;
    const midY = (pts[15].y + pts[16].y) * 0.5;
    const span = Math.max(115, shoulderWidth * 0.95);

    const A = { x: midX - span, y: midY };
    const C = { x: midX + span, y: midY };

    ctx.save();
    const domeGrad = ctx.createRadialGradient(midX, midY, 15, midX, midY, span * 1.15);
    domeGrad.addColorStop(0, "rgba(0, 229, 255, 0.06)");
    domeGrad.addColorStop(0.65, "rgba(0, 229, 255, 0.30)");
    domeGrad.addColorStop(1, "rgba(0, 229, 255, 0.80)");

    ctx.fillStyle = domeGrad;
    ctx.strokeStyle = "#00e5ff";
    ctx.shadowColor = "#00e5ff";
    ctx.shadowBlur = 24;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(midX, midY + 25, span, Math.PI * 1.12, Math.PI * 1.88);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(C.x, C.y);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Orbitron, sans-serif";
    ctx.fillText("A(15)", A.x - 36, A.y + 4);
    ctx.fillText("C(16)", C.x + 8, C.y + 4);

    for (const e of gameState.enemies) {
      if (!e.blockable) continue;
      const { distancia, puntoCercano } = distanciaPuntoSegmento(e, A, C);
      if (distancia < 190) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "#ff9100";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(puntoCercano.x, puntoCercano.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#ff9100";
        ctx.fillText("B", puntoCercano.x - 4, puntoCercano.y + 16);
        ctx.fillText("P", e.x + 14, e.y - 10);
      }
    }
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // E. NODOS DE ARTICULACIONES NUMERADOS (13, 14, 15, 16, 25, 26, 27, 28)
  // --------------------------------------------------------------------------
  const nodosNumerados = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  for (const idx of nodosNumerados) {
    const p = pts[idx];
    if (!p) continue;
    ctx.save();
    ctx.fillStyle = idx === 14 || idx === 16 ? "#ff9100" : "#00e5ff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, idx === 15 || idx === 16 ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if ([13, 14, 15, 16].includes(idx)) {
      ctx.fillStyle = "#ffd600";
      ctx.font = "bold 11px Orbitron, sans-serif";
      ctx.fillText(`${idx}`, p.x + 9, p.y + 4);
    }
    ctx.restore();
  }
}

function dibujarDronCuadricoptero(d) {
  ctx.save();
  ctx.translate(d.x, d.y);

  if (d.phase === "CHARGING") {
    const progress = 1 - d.chargeTimer / d.maxCharge;
    const blink = Math.sin(d.pulsePhase * 2.5) > 0;
    ctx.strokeStyle = blink ? "#ff9100" : "#ffd600";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, d.radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();

    ctx.fillStyle = "#ffd600";
    ctx.font = "bold 12px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${d.chargeTimer.toFixed(1)}s`, 0, -d.radius - 16);
  }

  ctx.strokeStyle = "#ffd600";
  ctx.fillStyle = "#ffd600";
  ctx.shadowColor = "#ffd600";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(-26, -8);
  ctx.lineTo(26, -8);
  ctx.moveTo(-18, -8);
  ctx.lineTo(-24, -16);
  ctx.moveTo(18, -8);
  ctx.lineTo(24, -16);
  ctx.stroke();

  const rotorW = 12 + Math.sin(d.pulsePhase * 8) * 4;
  ctx.beginPath();
  ctx.moveTo(-24 - rotorW, -16);
  ctx.lineTo(-24 + rotorW, -16);
  ctx.moveTo(24 - rotorW, -16);
  ctx.lineTo(24 + rotorW, -16);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, -5, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff6d00";
  ctx.beginPath();
  ctx.arc(0, 4, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function dibujarAmenaza(e) {
  ctx.save();
  if (e.type === "BLUE_SPHERE") {
    const grad = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, e.radius * 1.35);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.45, "#00e5ff");
    grad.addColorStop(1, "rgba(41, 121, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * 1.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.type === "DRONE_LASER") {
    ctx.fillStyle = "#ffd600";
    ctx.shadowColor = "#ffd600";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.type === "RED_METEOR") {
    const angle = Math.atan2(e.vy, e.vx);
    ctx.translate(e.x, e.y);
    ctx.rotate(angle);

    const tailGrad = ctx.createLinearGradient(0, 0, -95, 0);
    tailGrad.addColorStop(0, "rgba(255, 82, 82, 0.9)");
    tailGrad.addColorStop(0.5, "rgba(255, 145, 0, 0.55)");
    tailGrad.addColorStop(1, "rgba(255, 23, 68, 0)");
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(0, -e.radius * 0.85);
    ctx.lineTo(-95, 0);
    ctx.lineTo(0, e.radius * 0.85);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#d50000";
    ctx.strokeStyle = "#ff8a65";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ff1744";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ff5252";
    ctx.beginPath();
    ctx.arc(-6, -6, 5, 0, Math.PI * 2);
    ctx.arc(7, 5, 4, 0, Math.PI * 2);
    ctx.arc(-4, 8, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function actualizarHUD() {
  bannerHpText.textContent = `${gameState.hp} HP`;
  bannerShieldText.textContent = `${Math.round(gameState.shieldEnergy)}%`;
  bannerWaveText.textContent = `${gameState.wave}/3`;

  hpValue.textContent = `${gameState.hp}/100`;
  hpBar.style.width = `${gameState.hp}%`;

  shieldValue.textContent = `${Math.round(gameState.shieldEnergy)}%`;
  shieldBar.style.width = `${gameState.shieldEnergy}%`;

  if (gameState.shieldCooldown > 0) {
    shieldCooldownBadge.classList.remove("hidden");
    shieldCooldownBadge.textContent = `ENFRIAMIENTO (${gameState.shieldCooldown.toFixed(1)}s)`;
  } else {
    shieldCooldownBadge.classList.add("hidden");
  }

  timerValue.textContent = `${gameState.elapsedTime.toFixed(1)}s / ${GAME_DURATION.toFixed(0)}s`;
  scoreValue.textContent = gameState.score;
  comboValue.textContent = `(x${gameState.combo})`;
  maxSpeedHud.textContent = Math.round(gameState.maxPunchSpeed);

  wristSpeedTelemetry.textContent = `${Math.round(gameState.currentWristSpeed)} px/s`;
  blocksTelemetry.textContent = gameState.blocksCount;
  const acc =
    gameState.shotsFired > 0
      ? Math.round((gameState.shotsHit / gameState.shotsFired) * 100)
      : 0;
  shotsTelemetry.textContent = `${gameState.shotsHit} / ${gameState.shotsFired} (${acc}%)`;
}

// ============================================================================
// CICLO DE ANIMACIÓN A 60 FPS (CÁMARA Y VECTORES SIEMPRE ACTIVOS)
// ============================================================================

function cicloPrincipal(now) {
  const dt = Math.min(0.05, (now - lastFrameTimestamp) / 1000);
  lastFrameTimestamp = now;

  if (dt > 0) {
    const currentFps = 1 / dt;
    fpsSmooth = fpsSmooth * 0.9 + currentFps * 0.1;
    fpsCounter.textContent = Math.round(fpsSmooth);
  }

  if (webcamRunning && !simulationMode && poseLandmarker && video.readyState >= 2) {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      try {
        const ts = Math.max(lastDetectTimestamp + 1, Math.floor(now));
        lastDetectTimestamp = ts;
        const results = poseLandmarker.detectForVideo(video, ts);
        if (results.landmarks && results.landmarks.length > 0) {
          const raw = results.landmarks[0];
          currentLandmarks = raw.map((lm) => ({
            x: (1 - lm.x) * canvas.width,
            y: lm.y * canvas.height,
            z: lm.z,
            visibility: lm.visibility ?? 1.0
          }));
        }
      } catch (poseErr) {
        // Ignorar frames transitorios mientras el video estabiliza dimensiones
      }
    }
  } else {
    actualizarEsqueletoSimulado(dt);
  }

  actualizarLogicaJuego(dt);
  renderizarEscena();

  requestAnimationFrame(cicloPrincipal);
}

// ============================================================================
// CONEXIÓN CON PYTHON FLASK + MYSQL (RANKING TOP 10)
// ============================================================================

async function cargarEstadoYRanking() {
  try {
    const statusResp = await fetch(`${API_BASE}/api/status`);
    if (statusResp.ok) {
      const statusData = await statusResp.json();
      dbDot.classList.add("online");
      dbStatusText.textContent = `BD: ${statusData.database} (${statusData.schema})`;
    }
  } catch (e) {
    dbStatusText.textContent = "BD: Modo Local (Ejecuta app.py para MySQL)";
  }

  try {
    const rankResp = await fetch(`${API_BASE}/api/ranking`);
    if (rankResp.ok) {
      const rankData = await rankResp.json();
      if (rankData.ok) {
        rankingSourceLabel.textContent = `Motor Activo: ${rankData.engine}`;
        renderizarTablaRanking(rankData.ranking);
        return;
      }
    }
  } catch (e) {
    // Si Flask no está corriendo aún, mostrar ranking guardado en localStorage
    const localList = JSON.parse(localStorage.getItem("aegis_local_ranking") || "[]");
    rankingSourceLabel.textContent = "Motor Activo: Memoria Local del Navegador";
    renderizarTablaRanking(localList);
  }
}

function renderizarTablaRanking(filas) {
  if (!filas || filas.length === 0) {
    rankingTableBody.innerHTML = `<tr><td colspan="7" class="empty-row">Aún no hay partidas registradas. ¡Sé el primero en el Top 10!</td></tr>`;
    return;
  }

  rankingTableBody.innerHTML = filas
    .map(
      (r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.username}</td>
        <td><strong>${r.puntaje}</strong></td>
        <td>${r.bloqueos_escudo}</td>
        <td>${r.disparos_acertados} (${Number(r.precision_disparos || 0).toFixed(0)}%)</td>
        <td>${Math.round(r.velocidad_max_golpe || 0)}</td>
        <td>O${r.oleada_alcanzada}</td>
      </tr>
    `
    )
    .join("");
}

// ============================================================================
// EVENTOS DE USUARIO Y ENCENDIDO AUTOMÁTICO DE CÁMARA
// ============================================================================

startCameraBtn.addEventListener("click", () => {
  iniciarPartida(false);
});

startSimBtn.addEventListener("click", () => {
  iniciarPartida(true);
});

if (closeResultsBtn) {
  closeResultsBtn.addEventListener("click", () => {
    matchResultsBox.classList.add("hidden");
  });
}

refreshRankingBtn.addEventListener("click", () => {
  cargarEstadoYRanking();
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  simInput.mouseX = (e.clientX - rect.left) * scaleX;
  simInput.mouseY = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    simInput.punchImpulse = 1.0;
  } else if (e.button === 2) {
    simInput.shieldHeld = true;
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (e.button === 2) simInput.shieldHeld = false;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  simInput.keys[e.code] = true;
  if (e.code === "Space") simInput.shieldHeld = true;
  if (e.code === "KeyF") simInput.punchImpulse = 1.0;
});

window.addEventListener("keyup", (e) => {
  simInput.keys[e.code] = false;
  if (e.code === "Space") simInput.shieldHeld = false;
});

// Arrancar la cámara web y los vectores corporales inmediatamente al abrir la página
cargarEstadoYRanking();
actualizarEsqueletoSimulado(0.016);
encenderCamaraPermanente();
requestAnimationFrame(cicloPrincipal);
