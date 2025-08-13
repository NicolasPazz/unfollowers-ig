# 📸 UNFOLLOW-IG

🔎 Herramienta para scrappear seguidos y seguidores de Instagram, detectar unfollowers y realizar unfollow masivo de manera controlada.

## ✨ Funcionalidades principales

- 👥 **Obtener followers**: Extrae y guarda la lista de usuarios que te siguen en `data/followers.txt`.
- 👤 **Obtener following**: Extrae y guarda la lista de usuarios a los que seguís en `data/following.txt`.
- 🚫 **Detectar unfollowers**: Compara ambos archivos y genera un listado de usuarios que seguís pero no te siguen, guardando el resultado en `data/unfollowers.csv`.
- 🧹 **Unfollow masivo**: Permite dejar de seguir automáticamente a los usuarios marcados en el CSV, respetando límites configurables.

## ⚙️ Requisitos

- Node.js >= 18
- Variables de entorno en un archivo `.env`:
   - `IG_USERNAME`: tu usuario de Instagram
   - `MAX_PER_DAY`: máximo de unfollows diarios (opcional)
   - `MAX_PER_HOUR`: máximo de unfollows por hora (opcional)

## 🚀 Instalación

1. Cloná el repositorio y entrá a la carpeta:
   ```bash
   git clone https://github.com/NicolasPazz/unfollowers-ig.git
   cd unfollowers-ig
   ```
2. Instalá las dependencias:
   ```bash
   npm install
   ```
3. Configurá el archivo `.env` con tu usuario y límites deseados.


## 🕹️ Uso

Ejecutá el proyecto en modo desarrollo:
```bash
npm run dev
```

Se mostrará un menú interactivo:

1️⃣ Obtener followers
2️⃣ Obtener following
3️⃣ Obtener unfollowers
4️⃣ Hacer unfollow a los unfollowers
5️⃣ Ejecutar 1, 2 y 3 en secuencia

Seleccioná la opción deseada ingresando el número correspondiente.

⚠️ **IMPORTANTE:** La primera vez que ejecutes el script, se abrirá una ventana de Chromium. Iniciá sesión manualmente en tu cuenta de Instagram en esa ventana. Una vez logueado, las cookies se guardarán y no será necesario repetir este paso.


### ⚡ Detalles de funcionamiento

- 🤖 El script utiliza Playwright para automatizar la navegación en Instagram y extraer los datos.
- 🍪 Las cookies de sesión se almacenan en `cookies.json` para evitar logueos repetidos.
- 📁 Los archivos generados se guardan en la carpeta `data/`.
- 📄 El archivo `unfollowers.csv` tiene el formato: `marcado;usuario;url`. Solo los usuarios marcados como `true` serán procesados para unfollow.
- ⏱️ El proceso de unfollow respeta los límites configurados y registra los usuarios en `data/unfollowed.txt`.

## 📝 Notas
- Si cambiás de cuenta o las cookies expiran, eliminá `cookies.json` para forzar un nuevo login.
