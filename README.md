# 🛡️ Aegis-Pose Web Game (Actividad PC3)

Videojuego interactivo **Full-Stack** controlado en tiempo real mediante visión por computadora (**MediaPipe Pose Landmarker — 33 puntos corporales**), motor físico vectorial 2D en `<canvas>`, servidor backend en **Python (Flask)** y persistencia relacional en **MySQL (`aegis_pose_db`)**.

---

## 1. Arquitectura Desacoplada (60 FPS)

1. **Capa Frontend (`templates/index.html`, `static/css/style.css`, `static/js/game.js`)**:
   - Captura de video web en tiempo real y detección de los **33 puntos del esqueleto humano** en el navegador usando `@mediapipe/tasks-vision` (`PoseLandmarker`).
   - Motor físico vectorial 2D renderizado a **60 FPS** sobre `<canvas>`.
   - Incluye **Modo Simulador Interactivo** integrado para pruebas con mouse/teclado cuando no se dispone de cámara física.
2. **Capa Backend y Persistencia (`app.py`, `database/schema.sql`)**:
   - Servidor **Python Flask** que recibe estadísticas en JSON mediante `POST /api/partidas` al finalizar cada partida.
   - Valida las métricas e inserta los registros en **MySQL (`aegis_pose_db`)** alimentando el **Ranking Global (Top 10)** consultado mediante `GET /api/ranking`.

---

## 2. Mecánicas Corporales y Reglas de Combate

- **Estado Inicial**: `100 HP` (Puntos de Vida) y `100%` de Energía de Escudo.
- **Duración**: 3 oleadas cronometradas (70 segundos en total).
  - **Oleada 1 (0s - 20s)**: Esferas de plasma azules lentas (entrenamiento de escudo).
  - **Oleada 2 (20s - 45s)**: Esferas azules + Drones Interceptores amarillos con ciclo de 3 fases (Posicionamiento → Carga de 2.5s → Ataque al torso).
  - **Oleada 3 (45s - 70s)**: Se suman Meteoritos Pesados rojos (imbloqueables) y aumenta la velocidad general un **+30%**.

| Acción Corporal | Puntos | Condición Geométrica / Activación |
| :--- | :---: | :--- |
| **A. Escudo de Energía Direccional** | `+25 pts` | Cruzar antebrazos frente al pecho: distancia entre muñeca izquierda (`15`) y derecha (`16`) `< 65%` del ancho de hombros (`11` y `12`). Consume `15%/s` y entra en enfriamiento de `3s` si llega a `0%`. |
| **B. Disparo Cinético** | `+50 pts` | Golpe rápido con brazo derecho sin escudo activo: velocidad de muñeca derecha (`16`) `> 1400 px/s`. Dispara en el ángulo del antebrazo (`14 → 16`). |
| **C. Esquiva Corporal** | Evita `-20 HP` | Agacharse o desplazarse lateralmente para sacar el polígono del torso (`11-12-24-23`) de la trayectoria de meteoritos rojos imbloqueables. |

---

## 3. Fórmulas Matemáticas del Motor Físico (`static/js/game.js`)

1. **Vector Director del Disparo (`calcularVectorDirectorDisparo`)**:
   $$\vec{v} = P_{16} - P_{14} = (x_{16} - x_{14},\; y_{16} - y_{14}), \quad \hat{u} = \frac{\vec{v}}{\|\vec{v}\|}$$
2. **Colisión Punto-Segmento Escudo vs. Proyectil (`distanciaPuntoSegmento`)**:
   $$t = \max\left(0, \min\left(1, \frac{(P - A)\cdot(B - A)}{\|B - A\|^2}\right)\right), \quad C = A + t(B - A), \quad d = \|P - C\| \le r_{\text{proyectil}} + r_{\text{escudo}}$$
3. **Hitbox Dinámica del Torso (`obtenerPoligonoTorso` + `colisionProyectilTorso`)**:
   - Polígono cuadrilátero dinámico formado por los vértices `11 → 12 → 24 → 23`. Si un proyectil impacta el polígono, resta `20 HP`, reinicia el combo a `x1` y activa **Screen Shake**.

---

## 4. Algoritmo para Subir el Proyecto a GitHub (`subir_github.py`)

```text
ALGORITMO SubirProyectoAGitHub
ENTRADA:
  directorio_proyecto : "C:\Users\UPSJB\Downloads\PC3 - Inteligencia Artificial"
  url_repositorio     : URL remota de GitHub (o Usuario + Token Personal)
  mensaje_commit      : "feat: Actividad PC3 - Aegis-Pose Web Game (MediaPipe Pose + Flask + MySQL)"

INICIO
  1. Posicionarse en `C:\Users\UPSJB\Downloads\PC3 - Inteligencia Artificial`.
  2. Verificar existencia de `.gitignore` (excluir `__pycache__/`, `.venv/`, `*.db`).
  3. SI el ejecutable `git` está instalado en el sistema ENTONCES:
       3.1 Ejecutar `git init` (Inicializar repositorio local).
       3.2 Ejecutar `git branch -M main` (Definir rama principal).
       3.3 Ejecutar `git add .` (Agregar código fuente al Staging Area).
       3.4 Ejecutar `git commit -m mensaje_commit` (Confirmar versión).
       3.5 SI existe remoto `origin` ENTONCES actualizar URL, SINO `git remote add origin url_repositorio`.
       3.6 Ejecutar `git push -u origin main` (Transferir commits a GitHub).
     SINO (Modo API REST Directo sin requerir Git instalado):
       3.7 Autenticar contra `https://api.github.com` usando Token Personal.
       3.8 Verificar o crear repositorio remoto `PC3-Inteligencia-Artificial`.
       3.9 PARA CADA archivo válido en `C:\Users\UPSJB\Downloads\PC3 - Inteligencia Artificial` HACER:
             Codificar contenido en Base64.
             Enviar petición `PUT /repos/{usuario}/{repo}/contents/{ruta}` a la rama `main`.
           FIN PARA
     FIN SI
  4. Mostrar confirmación y enlace del repositorio publicado.
FIN
```

