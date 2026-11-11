import os
import sqlite3
import subprocess
import time
from datetime import datetime
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

try:
    import mysql.connector
    from mysql.connector import Error as MySQLError
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    MySQLError = Exception

app = Flask(__name__)
CORS(app)

# Configuración de conexión MySQL (XAMPP / MySQL Server local por defecto)
DB_CONFIG = {
    "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.environ.get("MYSQL_PORT", 3306)),
    "user": os.environ.get("MYSQL_USER", "root"),
    "password": os.environ.get("MYSQL_PASSWORD", ""),
    "database": os.environ.get("MYSQL_DATABASE", "aegis_pose_db"),
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_FALLBACK_PATH = os.path.join(BASE_DIR, "database", "aegis_pose_fallback.db")


def try_start_xampp_mysql():
    """Intenta iniciar el demonio mysqld de XAMPP si está instalado y aún no corre."""
    xampp_mysqld = r"C:\xampp\mysql\bin\mysqld.exe"
    xampp_ini = r"C:\xampp\mysql\bin\my.ini"
    if os.path.exists(xampp_mysqld):
        try:
            cmd = [xampp_mysqld]
            if os.path.exists(xampp_ini):
                cmd.append(f"--defaults-file={xampp_ini}")
            subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags= getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            time.sleep(1.8)
            return True
        except Exception:
            return False
    return False


def get_mysql_connection(include_db=True):
    """Obtiene una conexión activa a MySQL."""
    if not MYSQL_AVAILABLE:
        return None
    cfg = dict(DB_CONFIG)
    if not include_db:
        cfg.pop("database", None)
    cfg["connection_timeout"] = 3
    try:
        return mysql.connector.connect(**cfg)
    except MySQLError:
        return None


def init_databases():
    """
    Inicializa el esquema relacional en MySQL (aegis_pose_db) según la especificación
    de la Actividad PC3 y prepara también el respaldo local SQLite.
    """
    os.makedirs(os.path.join(BASE_DIR, "database"), exist_ok=True)

    # 1. Inicializar respaldo SQLite con el mismo esquema relacional
    with sqlite3.connect(SQLITE_FALLBACK_PATH) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS jugadores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS partidas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                jugador_id INTEGER NOT NULL,
                puntaje INTEGER NOT NULL,
                bloqueos_escudo INTEGER DEFAULT 0,
                disparos_acertados INTEGER DEFAULT 0,
                precision_disparos REAL DEFAULT 0.0,
                velocidad_max_golpe REAL DEFAULT 0.0,
                oleada_alcanzada INTEGER DEFAULT 1,
                fecha_partida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE
            )
            """
        )
        conn.commit()

    # 2. Intentar conectar e inicializar MySQL
    conn = get_mysql_connection(include_db=False)
    if conn is None:
        try_start_xampp_mysql()
        conn = get_mysql_connection(include_db=False)

    if conn is not None:
        try:
            cur = conn.cursor()
            cur.execute(
                f"CREATE DATABASE IF NOT EXISTS {DB_CONFIG['database']} "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
            )
            cur.execute(f"USE {DB_CONFIG['database']};")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS jugadores (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  username VARCHAR(50) NOT NULL UNIQUE,
                  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS partidas (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  jugador_id INT NOT NULL,
                  puntaje INT NOT NULL,
                  bloqueos_escudo INT DEFAULT 0,
                  disparos_acertados INT DEFAULT 0,
                  precision_disparos FLOAT DEFAULT 0.0,
                  velocidad_max_golpe FLOAT DEFAULT 0.0,
                  oleada_alcanzada INT DEFAULT 1,
                  fecha_partida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE
                );
                """
            )
            conn.commit()
            cur.close()
            conn.close()
            return "MySQL"
        except MySQLError as err:
            print(f"[WARN] Error inicializando tablas MySQL: {err}")
    return "SQLite-Fallback"


def validate_match_payload(data):
    """Valida y sanea los datos recibidos del frontend al finalizar la partida."""
    if not isinstance(data, dict):
        raise ValueError("El cuerpo de la petición debe ser un objeto JSON válido.")

    username = str(data.get("username", "Agente_Aegis")).strip()
    if not username:
        username = "Agente_Aegis"
    username = username[:50]

    try:
        puntaje = max(0, int(round(float(data.get("puntaje", 0)))))
        bloqueos_escudo = max(0, int(data.get("bloqueos_escudo", 0)))
        disparos_acertados = max(0, int(data.get("disparos_acertados", 0)))
        precision_disparos = round(
            min(100.0, max(0.0, float(data.get("precision_disparos", 0.0)))), 2
        )
        velocidad_max_golpe = round(
            max(0.0, float(data.get("velocidad_max_golpe", 0.0))), 2
        )
        oleada_alcanzada = min(3, max(1, int(data.get("oleada_alcanzada", 1))))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Formato numérico inválido en métricas: {exc}") from exc

    return {
        "username": username,
        "puntaje": puntaje,
        "bloqueos_escudo": bloqueos_escudo,
        "disparos_acertados": disparos_acertados,
        "precision_disparos": precision_disparos,
        "velocidad_max_golpe": velocidad_max_golpe,
        "oleada_alcanzada": oleada_alcanzada,
    }


def save_match_to_db(cleaned):
    """Guarda el jugador y la partida en MySQL (o en el respaldo local si MySQL no responde)."""
    conn = get_mysql_connection(include_db=True)
    if conn is not None:
        try:
            cur = conn.cursor()
            # Insertar o recuperar jugador
            cur.execute(
                "INSERT INTO jugadores (username) VALUES (%s) "
                "ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
                (cleaned["username"],),
            )
            jugador_id = cur.lastrowid

            # Insertar partida
            cur.execute(
                """
                INSERT INTO partidas (
                    jugador_id, puntaje, bloqueos_escudo, disparos_acertados,
                    precision_disparos, velocidad_max_golpe, oleada_alcanzada
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    jugador_id,
                    cleaned["puntaje"],
                    cleaned["bloqueos_escudo"],
                    cleaned["disparos_acertados"],
                    cleaned["precision_disparos"],
                    cleaned["velocidad_max_golpe"],
                    cleaned["oleada_alcanzada"],
                ),
            )
            partida_id = cur.lastrowid
            conn.commit()
            cur.close()
            conn.close()
            return {"engine": "MySQL", "partida_id": partida_id, "jugador_id": jugador_id}
        except MySQLError as err:
            print(f"[WARN] Falló inserción en MySQL, usando respaldo local: {err}")

    # Respaldo SQLite con idéntica estructura relacional
    with sqlite3.connect(SQLITE_FALLBACK_PATH) as sconn:
        scur = sconn.cursor()
        scur.execute(
            "INSERT OR IGNORE INTO jugadores (username) VALUES (?)",
            (cleaned["username"],),
        )
        scur.execute(
            "SELECT id FROM jugadores WHERE username = ?", (cleaned["username"],)
        )
        jugador_id = scur.fetchone()[0]
        scur.execute(
            """
            INSERT INTO partidas (
                jugador_id, puntaje, bloqueos_escudo, disparos_acertados,
                precision_disparos, velocidad_max_golpe, oleada_alcanzada
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                jugador_id,
                cleaned["puntaje"],
                cleaned["bloqueos_escudo"],
                cleaned["disparos_acertados"],
                cleaned["precision_disparos"],
                cleaned["velocidad_max_golpe"],
                cleaned["oleada_alcanzada"],
            ),
        )
        partida_id = scur.lastrowid
        sconn.commit()
        return {
            "engine": "SQLite-Fallback",
            "partida_id": partida_id,
            "jugador_id": jugador_id,
        }


def fetch_top_10_ranking():
    """Obtiene el Top 10 Global desde MySQL (o respaldo si MySQL está apagado)."""
    query = """
        SELECT
            j.username,
            p.puntaje,
            p.bloqueos_escudo,
            p.disparos_acertados,
            p.precision_disparos,
            p.velocidad_max_golpe,
            p.oleada_alcanzada,
            p.fecha_partida
        FROM partidas p
        INNER JOIN jugadores j ON p.jugador_id = j.id
        ORDER BY p.puntaje DESC, p.velocidad_max_golpe DESC, p.fecha_partida ASC
        LIMIT 10
    """
    conn = get_mysql_connection(include_db=True)
    if conn is not None:
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(query)
            rows = cur.fetchall()
            cur.close()
            conn.close()
            for r in rows:
                if isinstance(r.get("fecha_partida"), datetime):
                    r["fecha_partida"] = r["fecha_partida"].strftime("%Y-%m-%d %H:%M")
                else:
                    r["fecha_partida"] = str(r.get("fecha_partida", ""))
            return {"engine": "MySQL (aegis_pose_db)", "ranking": rows}
        except MySQLError as err:
            print(f"[WARN] Error consultando MySQL: {err}")

    with sqlite3.connect(SQLITE_FALLBACK_PATH) as sconn:
        sconn.row_factory = sqlite3.Row
        scur = sconn.cursor()
        scur.execute(query)
        rows = [dict(row) for row in scur.fetchall()]
        return {"engine": "SQLite (Modo Respaldo)", "ranking": rows}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status", methods=["GET"])
def api_status():
    conn = get_mysql_connection(include_db=True)
    if conn is not None:
        conn.close()
        return jsonify(
            {
                "status": "online",
                "database": "MySQL",
                "schema": DB_CONFIG["database"],
                "host": f"{DB_CONFIG['host']}:{DB_CONFIG['port']}",
            }
        )
    return jsonify(
        {
            "status": "online",
            "database": "SQLite-Fallback",
            "schema": "aegis_pose_db (local replica)",
        }
    )


@app.route("/api/ranking", methods=["GET"])
@app.route("/ranking", methods=["GET"])
def get_ranking():
    data = fetch_top_10_ranking()
    return jsonify({"ok": True, **data})


@app.route("/api/partidas", methods=["POST"])
@app.route("/guardar_partida", methods=["POST"])
def post_partida():
    try:
        payload = request.get_json(force=True, silent=False)
        cleaned = validate_match_payload(payload)
        result = save_match_to_db(cleaned)
        ranking_data = fetch_top_10_ranking()
        return (
            jsonify(
                {
                    "ok": True,
                    "mensaje": "Partida registrada exitosamente.",
                    "datos_guardados": cleaned,
                    "db_info": result,
                    "ranking": ranking_data["ranking"],
                }
            ),
            201,
        )
    except ValueError as verr:
        return jsonify({"ok": False, "error": str(verr)}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": f"Error interno: {exc}"}), 500


if __name__ == "__main__":
    engine_used = init_databases()
    print("=" * 68)
    print(f" Aegis-Pose Web Game Backend iniciado | Motor BD activo: {engine_used}")
    print(" URL Local: http://127.0.0.1:5000")
    print("=" * 68)
    app.run(host="0.0.0.0", port=5000, debug=False)

