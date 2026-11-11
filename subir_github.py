"""
===============================================================================
ALGORITMO AUTOMATIZADO PARA SUBIR EL PROYECTO A GITHUB
Directorio Actual: C:\\Users\\UPSJB\\Downloads\\PC3 - Inteligencia Artificial
Repositorio Destino: https://github.com/IsaacToHe/PC3-IA.git
Actividad PC3 - Aegis-Pose Web Game (MediaPipe Pose + Python Flask + MySQL)
===============================================================================
"""

import os
import shutil
import subprocess
import sys
import time
import webbrowser
import requests

sys.stdout.reconfigure(line_buffering=True)

DIRECTORIO_ACTUAL = r"C:\Users\UPSJB\Downloads\PC3 - Inteligencia Artificial"
PROJECT_DIR = (
    DIRECTORIO_ACTUAL
    if os.path.isdir(DIRECTORIO_ACTUAL)
    else os.path.dirname(os.path.abspath(__file__))
)
REPO_URL_DEFAULT = "https://github.com/IsaacToHe/PC3-IA.git"

# Client ID oficial de GitHub CLI / Git Credential Manager para Device Flow OAuth
GITHUB_OAUTH_CLIENT_ID = "178c6fc778ccc68e1d6a"


def encontrar_ejecutable_git():
    """Localiza el binario de Git (incluyendo MinGit portable)."""
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
    return shutil.which("git")


def ejecutar_comando_git(git_bin, args, ocultar_url=False):
    """Ejecuta un comando Git en C:\\Users\\UPSJB\\Downloads\\PC3 - Inteligencia Artificial."""
    if not ocultar_url:
        print(f"  > git {' '.join(args)}")
    res = subprocess.run([git_bin] + args, cwd=PROJECT_DIR, text=True, capture_output=True)
    if res.stdout.strip():
        print(f"    {res.stdout.strip()}")
    if res.returncode != 0 and res.stderr.strip() and not ocultar_url:
        print(f"    {res.stderr.strip()}")
    return res.returncode == 0, res.stderr.strip()


def autenticar_con_navegador_device_flow():
    """
    Inicia el flujo OAuth Device Flow de GitHub:
    Muestra un código de 8 dígitos, abre https://github.com/login/device en el
    navegador y espera a que el usuario autorice con un clic.
    """
    headers = {"Accept": "application/json"}
    resp = requests.post(
        "https://github.com/login/device/code",
        headers=headers,
        data={"client_id": GITHUB_OAUTH_CLIENT_ID, "scope": "repo"},
        timeout=15,
    )
    if resp.status_code != 200:
        print(f"❌ No se pudo iniciar Device Flow: {resp.text}")
        return None

    data = resp.json()
    user_code = data["user_code"]
    verification_uri = data["verification_uri"]
    device_code = data["device_code"]
    interval = int(data.get("interval", 5))

    print("\n" + "=" * 72)
    print(f" 🔐 AUTORIZACIÓN RÁPIDA DE GITHUB EN TU NAVEGADOR")
    print("=" * 72)
    print(f"  1. Se abrirá: {verification_uri}")
    print(f"  2. Ingresa este código en GitHub:  👉  {user_code}  👈")
    print("=" * 72)

    try:
        webbrowser.open(verification_uri)
    except Exception:
        pass

    print("\nEsperando a que ingreses el código en el navegador...")
    while True:
        time.sleep(interval)
        poll = requests.post(
            "https://github.com/login/oauth/access_token",
            headers=headers,
            data={
                "client_id": GITHUB_OAUTH_CLIENT_ID,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
            timeout=15,
        )
        p_data = poll.json()
        if "access_token" in p_data:
            print("✔ ¡Autorización completada en GitHub!")
            return p_data["access_token"]
        err = p_data.get("error")
        if err == "authorization_pending":
            continue
        elif err == "slow_down":
            interval += 5
        else:
            print(f"❌ Autorización cancelada o expirada: {err}")
            return None


def subir_a_github():
    os.chdir(PROJECT_DIR)
    git_bin = encontrar_ejecutable_git()
    if not git_bin:
        print("❌ No se encontró git.exe.")
        sys.exit(1)

    print("=" * 72)
    print(" SUBIENDO PROYECTO A GITHUB (IsaacToHe/PC3-IA)")
    print(f" Directorio: {PROJECT_DIR}")
    print("=" * 72)

    ejecutar_comando_git(git_bin, ["init"])
    ejecutar_comando_git(git_bin, ["config", "user.name", "IsaacToHe"])
    ejecutar_comando_git(git_bin, ["config", "user.email", "IsaacToHe@users.noreply.github.com"])
    ejecutar_comando_git(git_bin, ["add", "."])
    ejecutar_comando_git(
        git_bin,
        ["commit", "-m", "feat: Actividad PC3 - Aegis-Pose Web Game (MediaPipe Pose + Flask + MySQL)"],
    )
    ejecutar_comando_git(git_bin, ["branch", "-M", "main"])

    check_remote = subprocess.run(
        [git_bin, "remote"], cwd=PROJECT_DIR, text=True, capture_output=True
    )
    if "origin" in check_remote.stdout.split():
        ejecutar_comando_git(git_bin, ["remote", "set-url", "origin", REPO_URL_DEFAULT])
    else:
        ejecutar_comando_git(git_bin, ["remote", "add", "origin", REPO_URL_DEFAULT])

    token = autenticar_con_navegador_device_flow()
    if not token:
        sys.exit(1)

    auth_url = f"https://IsaacToHe:{token}@github.com/IsaacToHe/PC3-IA.git"
    print("\n  > git push -u origin main")
    exito, err_msg = ejecutar_comando_git(
        git_bin, ["push", "-u", auth_url, "main:main", "--force"], ocultar_url=True
    )
    if exito:
        print("\n" + "=" * 72)
        print(" ✔ ¡PROYECTO SUBIDO EXITOSAMENTE A GITHUB!")
        print(" 🌐 Repositorio: https://github.com/IsaacToHe/PC3-IA")
        print("=" * 72)
    else:
        print(f"\n❌ Error en git push: {err_msg}")


if __name__ == "__main__":
    subir_a_github()
