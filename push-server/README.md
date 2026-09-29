# Traindía · servidor de avisos (Web Push)

Avisa del **fin del descanso** aunque el móvil esté bloqueado. La app le dice «avisa a este móvil dentro de N segundos»; el servidor espera y manda una notificación push cifrada al servicio de push del navegador.

**Qué guarda:** solo en memoria y solo mientras dura cada descanso (id aleatorio, suscripción push, hora). Se borra al avisar o cancelar. Sin base de datos, sin ficheros, sin IPs en los logs.

## Dónde corre

Homelab, `/home/raul/stacks/webpush/`, publicado solo en `127.0.0.1:8787` (ni la LAN llega). El túnel de Cloudflare (`cloudflared`, `network_mode: host`) lo publica en **https://push.raulmarquez.dev** → *Public Hostname* tipo **HTTP**, URL **`localhost:8787`**.

## Operaciones

```bash
# actualizar tras cambiar el código (desde este repo, en el PC)
scp push-server/{server.js,package.json,package-lock.json,Dockerfile,compose.yaml} raul@192.168.1.21:~/stacks/webpush/
ssh raul@192.168.1.21 'cd ~/stacks/webpush && docker compose up -d --build'

# estado y logs
ssh raul@192.168.1.21 'curl -s http://127.0.0.1:8787/health; docker logs --tail 20 webpush'
```

`.env` (solo en el servidor, `chmod 600`, nunca al repo): ver `.env.example`. Las claves VAPID se generaron **en el servidor**; si se cambian, las suscripciones antiguas dejan de valer y la app se vuelve a suscribir sola al programar el siguiente descanso.

Para ver cada petición en los logs (sin datos personales): `DEBUG=1` en el `.env`.

## API

| Petición | Qué hace |
|---|---|
| `GET /health` | `{ ok, pendientes, enviados, fallidos }` |
| `GET /vapid` | Clave pública para suscribirse |
| `POST /rest` `{ subscription, inMs }` | Programa un aviso → `{ id }` |
| `PUT /rest/:id` `{ inMs }` | Lo reprograma (+15 s) |
| `DELETE /rest/:id` | Lo cancela |
| `POST /share` `{ data }` | Guarda un paquete **ya cifrado en el móvil** → `{ id, del, exp }` |
| `GET /share/:id` | Lo devuelve **y lo borra** (un solo uso) |
| `DELETE /share/:id?del=…` | Lo retira quien lo subió |

**Compartir progreso:** la app comprime y cifra (AES-GCM) el paquete antes de subirlo; la llave va en el enlace, detrás de `#`, y nunca llega al servidor. Se guarda solo en memoria, 48 h como mucho (`SHARE_TTL_H`), hasta 2 MB por paquete (`SHARE_MAX_KB`) y 40 MB en total (`SHARE_TOTAL_MB`).

Protecciones: solo desde el origen de la app (CORS), solo a servicios de push conocidos (Google, Mozilla, Apple, Microsoft), aviso en ≤ 15 min, 60 peticiones/min por IP, 500 avisos a la vez como máximo.
