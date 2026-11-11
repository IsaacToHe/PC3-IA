"""
===============================================================================
ALGORITMO AUTOMATIZADO PARA SUBIR EL PROYECTO A GITHUB
Directorio Actual: C:\\Users\\UPSJB\\Downloads\\PC3 - Inteligencia Artificial
Actividad PC3 - Aegis-Pose Web Game (MediaPipe Pose + Python Flask + MySQL)
===============================================================================
Soporta dos modos de operación desde el directorio actual:
  Modo A: Mediante Git CLI (git init -> add -> commit -> remote -> push)
  Modo B: Mediante GitHub REST API directa (con Token Personal, sin requerir Git)
===============================================================================
"""

import base64
import os
import shutil
import subprocess
import sys
import requests

# Directorio actual de trabajo configurado explícitamente
DIRECTORIO_ACTUAL = r"C:\Users\UPSJB\Downloads\PC3 - Inteligencia Artificial"
PROJECT_DIR = (
    DIRECTORIO_ACTUAL
    if os.path.isdir(DIRECTORIO_ACTUAL)
    else os.path.dirname(os.path.abspath(__file__))
)

IGNORE_DIRS = {"__pycache__", ".git", "venv", ".venv", ".idea", ".vscode"}
IGNORE_EXTS = {".pyc", ".pyo", ".db"}


def encontrar_ejecutable_git():
    """Paso 1 del Algoritmo: Localizar el binario de Git en el sistema."""
    git_path = shutil.which("git")
    if git_path:
        return git_path

    rutas_comunes = [
        r"C:\Users\UPSJB\.gemini\antigravity\scratch\MinGit\cmd\git.exe",
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files\Git\bin\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
        os.path.expanduser(r"~\AppData\Local\Programs\Git\cmd\git.exe"),
    ]
    for ruta in rutas_comunes:
        if os.path.exists(ruta):
            return ruta
    return None


def ejecutar_comando_git(git_bin, args):
    """Ejecuta un comando Git dentro de C:\\Users\\UPSJB\\Downloads\\PC3 - Inteligencia Artificial."""
    cmd = [git_bin] + args
    print(f"  > [{PROJECT_DIR}] $ {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=PROJECT_DIR, text=True, capture_output=True)
    if res.stdout.strip():
        print(f"    {res.stdout.strip()}")
    if res.returncode != 0 and res.stderr.strip():
        print(f"    [Aviso] {res.stderr.strip()}")
    return res.returncode == 0


def asegurar_identidad_git(git_bin, nombre_default="Agente_Aegis", email_default="aegis@upsjb.edu.pe"):
    """Verifica que Git tenga user.name y user.email configurados para no fallar en git commit."""
    res_name = subprocess.run(
        [git_bin, "config", "user.name"], cwd=PROJECT_DIR, text=True, capture_output=True
    )
    if not res_name.stdout.strip():
        ejecutar_comando_git(git_bin, ["config", "user.name", nombre_default])

    res_email = subprocess.run(
        [git_bin, "config", "user.email"], cwd=PROJECT_DIR, text=True, capture_output=True
    )
    if not res_email.stdout.strip():
        ejecutar_comando_git(git_bin, ["config", "user.email", email_default])


def subir_con_git_cli(git_bin, repo_url, commit_msg):
    """
    Algoritmo con Git CLI ejecutado directamente sobre:
    C:\\Users\\UPSJB\\Downloads\\PC3 - Inteligencia Artificial
    """
    os.chdir(PROJECT_DIR)
    print(f"\n📂 Directorio activo fijado en: {os.getcwd()}")

    print("\n[PASO 1/5] Inicializando repositorio Git local...")
    ejecutar_comando_git(git_bin, ["init"])
    asegurar_identidad_git(git_bin)

    print("\n[PASO 2/5] Configurando rama principal 'main'...")
    ejecutar_comando_git(git_bin, ["branch", "-M", "main"])

    print("\n[PASO 3/5] Agregando archivos del directorio actual al Staging Area...")
    ejecutar_comando_git(git_bin, ["add", "."])

    print("\n[PASO 4/5] Creando commit con los archivos de la Actividad PC3...")
    ejecutar_comando_git(git_bin, ["commit", "-m", commit_msg])

    print("\n[PASO 5/5] Vinculando repositorio remoto y subiendo a GitHub...")
    check_remote = subprocess.run(
        [git_bin, "remote"], cwd=PROJECT_DIR, text=True, capture_output=True
    )
    if "origin" in check_remote.stdout.split():
        ejecutar_comando_git(git_bin, ["remote", "set-url", "origin", repo_url])
    else:
        ejecutar_comando_git(git_bin, ["remote", "add", "origin", repo_url])

    exito = ejecutar_comando_git(git_bin, ["push", "-u", "origin", "main"])
    if exito:
        print("\n✔ ¡PROYECTO SUBIDO EXITOSAMENTE A GITHUB DESDE TU DIRECTORIO ACTUAL!")
    else:
        print(
            "\n⚠ El push requirió autenticación o encontró un conflicto. "
            "Verifica tus credenciales de GitHub."
        )


def recolectar_archivos_proyecto():
    """Recorre recursivamente C:\\Users\\UPSJB\\Downloads\\PC3 - Inteligencia Artificial."""
    archivos = []
    for root, dirs, files in os.walk(PROJECT_DIR):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in IGNORE_EXTS:
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, PROJECT_DIR).replace("\\", "/")
            archivos.append((rel_path, full_path))
    return archivos


def subir_con_api_github(token, usuario, nombre_repo, commit_msg):
    """
    Algoritmo Alternativo (Sin necesidad de tener Git instalado):
    Sube todos los archivos de C:\\Users\\UPSJB\\Downloads\\PC3 - Inteligencia Artificial
    usando la API REST v3 de GitHub.
    """
    os.chdir(PROJECT_DIR)
    print(f"\n📂 Directorio activo fijado en: {os.getcwd()}")

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
    }

    print(f"\n[PASO 1/3] Verificando o creando el repositorio '{usuario}/{nombre_repo}'...")
    repo_api = f"https://api.github.com/repos/{usuario}/{nombre_repo}"
    r = requests.get(repo_api, headers=headers, timeout=15)
    if r.status_code == 404:
        create_resp = requests.post(
            "https://api.github.com/user/repos",
            headers=headers,
            json={
                "name": nombre_repo,
                "description": "Actividad PC3: Aegis-Pose Web Game (MediaPipe Pose + Python Flask + MySQL)",
                "private": False,
                "auto_init": True,
            },
            timeout=15,
        )
        if create_resp.status_code not in (200, 201):
            print(f"❌ Error creando repositorio: {create_resp.text}")
            return
        print("  ✔ Repositorio creado en GitHub.")
    elif r.status_code == 200:
        print("  ✔ El repositorio ya existe en GitHub.")
    else:
        print(f"❌ Error de autenticación ({r.status_code}): {r.text}")
        return

    archivos = recolectar_archivos_proyecto()
    print(f"\n[PASO 2/3] Subiendo {len(archivos)} archivos desde '{PROJECT_DIR}' vía API REST...")

    for rel_path, full_path in archivos:
        with open(full_path, "rb") as fh:
            contenido_b64 = base64.b64encode(fh.read()).decode("utf-8")

        url_archivo = f"https://api.github.com/repos/{usuario}/{nombre_repo}/contents/{rel_path}"
        get_file = requests.get(url_archivo, headers=headers, timeout=15)
        payload = {
            "message": commit_msg,
            "content": contenido_b64,
            "branch": "main",
        }
        if get_file.status_code == 200:
            payload["sha"] = get_file.json().get("sha")

        put_resp = requests.put(url_archivo, headers=headers, json=payload, timeout=20)
        if put_resp.status_code in (200, 201):
            print(f"  ✔ Subido: {rel_path}")
        else:
            print(f"  ⚠ Error en {rel_path}: {put_resp.status_code} - {put_resp.text}")

    print("\n[PASO 3/3] ¡Proceso finalizado!")
    print(f"🌐 URL de tu repositorio: https://github.com/{usuario}/{nombre_repo}")


def main():
    os.chdir(PROJECT_DIR)
    print("=" * 76)
    print(" ALGORITMO DE SUBIDA A GITHUB - AEGIS-POSE WEB GAME (PC3)")
    print(f" Directorio Actual: {PROJECT_DIR}")
    print("=" * 76)

    commit_msg = (
        "feat: Actividad PC3 - Aegis-Pose Web Game (MediaPipe Pose + Flask + MySQL)"
    )
    git_bin = encontrar_ejecutable_git()

    if git_bin:
        print(f"✔ Git detectado en: {git_bin}")
        print("\nSelecciona el método de subida:")
        print("  [1] Subir usando comandos Git (URL de tu repositorio)")
        print("  [2] Subir directo usando Token Personal de GitHub (API REST)")
        opcion = input("\nOpción (1 o 2) [1]: ").strip() or "1"
    else:
        print("ℹ Git CLI no está instalado en este equipo.")
        print("  Se utilizará el Modo Directo mediante la API REST de GitHub (sin requerir Git).")
        opcion = "2"

    if opcion == "1" and git_bin:
        repo_url = (
            input(
                "\nURL de tu repositorio en GitHub [https://github.com/IsaacToHe/PC3-IA.git]: "
            ).strip()
            or "https://github.com/IsaacToHe/PC3-IA.git"
        )
        subir_con_git_cli(git_bin, repo_url, commit_msg)
    else:
        print("\n--- SUBIDA DIRECTA DESDE TU DIRECTORIO ACTUAL CON GITHUB API ---")
        usuario = (
            input("Tu nombre de usuario de GitHub [IsaacToHe]: ").strip()
            or "IsaacToHe"
        )
        nombre_repo = (
            input("Nombre del repositorio en GitHub [PC3-IA]: ").strip()
            or "PC3-IA"
        )
        token = input(
            "Tu Personal Access Token de GitHub (con permiso 'repo'): "
        ).strip()
        if not usuario or not token:
            print("❌ Usuario y Token son obligatorios para usar la API de GitHub.")
            sys.exit(1)
        subir_con_api_github(token, usuario, nombre_repo, commit_msg)


if __name__ == "__main__":
    main()
