# edTech — API

Backend de **edTech**, plataforma de apoyo pedagógico para docentes de primaria de Guatemala.

Stack: Node.js (≥ 22) · Express 5 · MongoDB con Mongoose · módulos ES.

> Estado: **base del proyecto**. Todavía no hay autenticación ni modelos académicos.

## Instalación

```bash
git clone https://github.com/DiliRo/EdTech.git
cd EdTech
npm install
cp .env.example .env     # en Windows: copy .env.example .env
```

Edita `.env` y coloca tu `MONGODB_URI` (MongoDB local o Atlas).

## Ejecución

```bash
npm run dev     # desarrollo con nodemon (reinicia al guardar)
npm start       # producción
```

Comprobar que funciona:

```bash
curl http://localhost:3000/api/health
```

## Variables de entorno

| Variable      | Obligatoria | Por defecto             | Descripción                                   |
|---------------|-------------|-------------------------|-----------------------------------------------|
| `MONGODB_URI` | Sí          | —                       | Cadena de conexión a MongoDB                  |
| `PORT`        | No          | `3000`                  | Puerto HTTP                                   |
| `CORS_ORIGIN` | No          | `http://localhost:5173` | Orígenes permitidos, separados por coma       |
| `NODE_ENV`    | No          | `development`           | `development`, `production` o `test`          |

Si falta `MONGODB_URI` o MongoDB no responde, el servidor no arranca y muestra el motivo en consola.

## Endpoints

### `GET /api/health`

Comprueba el servidor y hace un `ping` real a MongoDB.

**200 — todo funciona**
```json
{
  "success": true,
  "message": "Servidor y base de datos en funcionamiento",
  "data": {
    "server": "ok",
    "database": "connected",
    "uptimeSeconds": 42,
    "timestamp": "2026-11-21T18:00:00.000Z"
  }
}
```

**503 — base de datos no disponible**: mismo formato con `"success": false` y
`database` en `disconnected`, `connecting`, `disconnecting` o `unreachable`.

### Formato de errores

Todas las respuestas de error usan:

```json
{ "success": false, "message": "Texto seguro para mostrar", "errors": [{ "field": "...", "message": "..." }] }
```

`errors` solo aparece cuando hay detalle por campo. Los errores inesperados responden
`500 { "success": false, "message": "Error interno del servidor" }` sin stack ni mensajes internos;
el detalle solo se registra en la consola del servidor.

| Caso                         | Código |
|------------------------------|--------|
| Ruta inexistente             | 404    |
| JSON mal formado             | 400    |
| Cuerpo mayor a 100 kb        | 413    |
| Error controlado (`AppError`)| el que se indique |
| Error inesperado             | 500    |

## Estructura

```
src/
├── app.js                  # crea la app Express (sin abrir puerto) → testeable
├── server.js               # valida .env, conecta a MongoDB, abre el puerto, cierre ordenado
├── config/
│   ├── env.js              # lee y valida variables de entorno
│   └── db.js               # conexión a MongoDB con Mongoose
├── routes/
│   ├── index.js            # registra todas las rutas bajo /api
│   └── health.routes.js
├── controllers/
│   └── health.controller.js
├── services/
│   └── health.service.js   # estado real de la BD (readyState + ping con timeout)
├── middlewares/
│   ├── notFound.js         # 404 en JSON
│   └── errorHandler.js     # manejo central de errores
├── models/                 # (vacío) modelos de Mongoose
├── validators/             # (vacío) validaciones de entrada
└── utils/
    └── AppError.js         # error controlado con código HTTP
tests/
├── setup-env.js            # entorno aislado para pruebas
├── unit/                   # no necesitan MongoDB
└── integration/            # MongoDB real en memoria (mongodb-memory-server)
```

Para agregar un módulo: modelo en `models/`, validaciones en `validators/`, lógica en
`services/`, manejo HTTP en `controllers/`, rutas en `routes/` y registrarlas en `routes/index.js`.

## Pruebas

```bash
npm test                    # todas
npm run test:unit           # sin base de datos
npm run test:integration    # levanta un MongoDB en memoria
```

La primera vez, `test:integration` descarga el binario de MongoDB (~100 MB), así que necesita internet.
