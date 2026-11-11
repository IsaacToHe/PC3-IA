-- ============================================================================
-- ACTIVIDAD PC3 : "Aegis-Pose Web Game"
-- Script de Base de Datos Relacional (MySQL)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS aegis_pose_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE aegis_pose_db;

CREATE TABLE IF NOT EXISTS jugadores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- ============================================================================
-- Consulta para el Ranking Global (Top 10)
-- ============================================================================
-- SELECT 
--   j.username,
--   p.puntaje,
--   p.bloqueos_escudo,
--   p.disparos_acertados,
--   p.precision_disparos,
--   p.velocidad_max_golpe,
--   p.oleada_alcanzada,
--   p.fecha_partida
-- FROM partidas p
-- INNER JOIN jugadores j ON p.jugador_id = j.id
-- ORDER BY p.puntaje DESC, p.fecha_partida ASC
-- LIMIT 10;

