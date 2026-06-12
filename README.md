<div align="center">

<img src="icon.svg" width="96" height="96" alt="Traindía" />

# Traindía

**Tu plan de entrenamiento, sesiones, progreso y diario — en una PWA instalable que funciona 100% offline.**

[![PWA](https://img.shields.io/badge/PWA-instalable-4f46e5)](https://raulmarquez24.github.io/PWA-PLAN-CNP/)
[![Offline](https://img.shields.io/badge/offline-first-0e9aae)](#-offline-y-privacidad)
[![Vanilla JS](https://img.shields.io/badge/vanilla%20JS-sin%20build-f59e0b)](#-stack-y-arquitectura)
[![Sin dependencias](https://img.shields.io/badge/dependencias-0-e11d48)](#-stack-y-arquitectura)

[**▶ Abrir la app**](https://raulmarquez24.github.io/PWA-PLAN-CNP/)

</div>

---

Traindía es una aplicación web progresiva (PWA) para gestionar tu entrenamiento de principio a fin: organizas tu rutina semanal, registras cada sesión (en vivo o a mano), sigues tu progreso con gráficas y llevas un diario. Todo se guarda **en tu dispositivo**, sin cuentas ni servidores, y funciona sin conexión — ideal para el gimnasio.

## ✨ Funcionalidades

- **🗓️ Rutina semanal** — 7 días editables (ejercicios, bloques, orden, series objetivo, prioritarios/opcionales). Cada día se puede restaurar a su versión original.
- **🏋️ Registro de sesiones** — en vivo con cronómetro y marcado de series, o manual indicando la duración. Campos según el tipo de ejercicio (peso+reps / reps / tiempo).
- **📈 Progreso** — peso corporal y medidas por fecha, historial por ejercicio (peso máx, volumen, reps) y **comparativa** entre perfiles, con gráficas SVG.
- **📓 Diario** — entradas con texto y estado de ánimo, vinculadas a tu perfil.
- **👥 Perfiles** — un perfil **principal** (dueño del dispositivo, siempre activo) y perfiles **invitados** para importar datos a su nombre y comparar progreso.
- **🏷️ Catálogo de ejercicios** — agrupado por grupo muscular, vinculado a los días: lo que quitas de un día pasa a *“en desuso”*. Editar un ejercicio actualiza su nombre en toda la app. Los predefinidos nunca se borran.
- **↕️ Importar / Exportar** — granular (perfil completo, un día, sesiones por rango o concretas, rutinas) en JSON, con resolución de conflictos al importar (reemplazar o añadir lo que falte).
- **🎨 Personalización** — color de perfil con paleta amplia, y todo el tema tokenizado con variables CSS.
- **📲 Instalable y offline** — se añade a la pantalla de inicio y funciona sin internet.

## 🧱 Stack y arquitectura

**Vanilla JS, sin frameworks ni build step. Cero dependencias.** Solo HTML, CSS y JavaScript servidos como estáticos.

| Capa | Archivo | Rol |
|------|---------|-----|
| Shell + router | `index.html`, `app.js` | Estructura, navegación SPA, onboarding, perfiles, ajustes |
| Persistencia | `db.js` | Capa **IndexedDB** + semilla del plan + migraciones |
| UI compartida | `ui.js` | Modales, toasts, formularios, selector de color, gráficas SVG |
| Vistas | `views-plan.js`, `views-sessions.js`, `views-progress.js`, `views-journal.js`, `views-data.js` | Cada sección de la app |
| Contenido semilla | `data.js` | Plan de 7 días + guías (se vuelca a la BD en el primer arranque) |
| Estilos | `index.html` (`:root`), `styles.css` | Paleta tokenizada + componentes |
| PWA | `manifest.json`, `sw.js` | Instalable + service worker cache-first |
| Iconos | `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` | App icon / favicon / maskable |

### Modelo de datos (IndexedDB — store `cnp-db`)

`settings` · `users` · `exercises` · `routines` · `sessions` · `progress` · `journal` — todas con `userId`, generado en el primer arranque y persistente.

## 🚀 Empezar en local

Los Service Workers necesitan un servidor (abrir `index.html` con doble clic no basta):

```bash
# Python
python3 -m http.server 8000

# o Node
npx serve
```

Luego abre `http://localhost:8000`.

## ☁️ Despliegue (GitHub Pages)

Está publicado con **GitHub Pages** desde la rama `main` (`/root`). Cada push a `main` redespliega solo.

> **Actualizaciones:** el service worker es *cache-first*. Para que los cambios lleguen a las apps ya instaladas hay que **subir `CACHE_NAME`** en `sw.js` (p. ej. `traindia-v8` → `traindia-v9`); al activarse, borra la caché antigua y sirve la nueva.

## 📲 Instalar en el móvil

- **Android (Chrome):** abre la URL → menú ⋮ → *Añadir a pantalla de inicio*.
- **iPhone (Safari):** abre la URL en Safari → botón compartir → *Añadir a pantalla de inicio*.

## 🔒 Offline y privacidad

- **100% local:** todos tus datos viven en IndexedDB de tu dispositivo. No hay cuentas, login ni backend.
- **Offline-first:** tras la primera carga con conexión, la app funciona sin internet.
- **Tú controlas tus datos:** exporta/importa en JSON cuando quieras; “Borrar todos los datos” lo deja a cero.

## ✏️ Editar el contenido por defecto

El plan y los ejercicios predefinidos están en `data.js`. Al editarlos se aplican a las nuevas instalaciones y a quien use *Restaurar plan original*. En el día a día, todo es editable desde la propia app (rutina, ejercicios, sesiones…).

---

<div align="center">
<sub>Hecho con vanilla JS · PWA offline · sin dependencias</sub>
</div>
