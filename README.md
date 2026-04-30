# Plan CNP — PWA

Aplicación web instalable con tu plan de entrenamiento.

## Archivos incluidos

```
pwa_cnp/
├── index.html          (interfaz principal)
├── app.js              (logica de navegacion)
├── data.js             (datos del plan: dias, ejercicios, guias)
├── manifest.json       (configuracion PWA)
├── sw.js               (service worker - funciona offline)
├── icon.svg            (icono vectorial)
├── icon-192.png        (icono Android pequeño)
├── icon-512.png        (icono Android grande)
└── icon-512-maskable.png (icono adaptativo)
```

## Cómo probarla en tu ordenador

Abrir `index.html` directamente en el navegador NO funcionará al 100% porque
los Service Workers requieren un servidor web (aunque sea local).

### Opción A: servidor local con Python (rápido)

```bash
cd pwa_cnp
python3 -m http.server 8000
```

Luego abre en el navegador: `http://localhost:8000`

### Opción B: servidor local con Node

```bash
cd pwa_cnp
npx serve
```

## Cómo publicarla online (gratis y rápido)

### GitHub Pages (recomendado)

1. Crea cuenta gratis en github.com
2. Crea un repositorio nuevo, llamalo "plan-cnp"
3. Sube los archivos de la carpeta `pwa_cnp/` al repositorio
4. En el repositorio: Settings → Pages → Source: main branch / root
5. En unos minutos tendrás una URL tipo:
   `https://tu-usuario.github.io/plan-cnp/`

### Netlify (más simple aún)

1. Ve a netlify.com (no necesitas cuenta para empezar)
2. Arrastra la carpeta `pwa_cnp/` completa a la zona de drop
3. Te da una URL al instante tipo `https://random-name.netlify.app`
4. Si te creas cuenta puedes cambiar el nombre

### Vercel

Similar a Netlify. vercel.com → import → drag and drop.

## Cómo instalarla en el móvil

Una vez tengas la URL pública:

### Android (Chrome)
1. Abres la URL en Chrome
2. Aparece un banner "Añadir a pantalla de inicio" (o desde menú ⋮)
3. Aceptas y queda como icono en tu escritorio
4. Se abre como app sin barra del navegador

### iPhone (Safari)
1. Abres la URL en Safari (NO Chrome, es importante en iOS)
2. Tocas el botón compartir (cuadrado con flecha hacia arriba)
3. Bajas y pulsas "Añadir a pantalla de inicio"
4. Le pones nombre y aceptas

## Funcionamiento offline

Una vez que has abierto la app la primera vez con conexión, queda guardada
en el móvil y funciona sin internet. Útil para gimnasios con mala cobertura.

## Editar el contenido

Todo el contenido del plan está en `data.js`. Si quieres cambiar un
ejercicio, añadir una guía, o ajustar series y reps:

1. Abres `data.js` con cualquier editor de texto
2. Modificas lo que necesites
3. Subes el archivo actualizado a tu repositorio/Netlify
4. La PWA se actualiza automáticamente

## Estructura de la app

- **Pestaña Semana**: vista principal con los 7 días. Toca un día para ver detalle.
- **Pestaña Guías**: explicaciones detalladas de cada parte del plan.
- **Pestaña Plan**: información general sobre el plan y enlaces rápidos a guías clave.

Desde cada día puedes acceder directamente a las guías relacionadas
(por ejemplo, desde el sábado al detalle del calentamiento o agilidad).
