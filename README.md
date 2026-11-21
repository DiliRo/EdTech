# edTech — API

Backend de **edTech**, plataforma de apoyo pedagógico para docentes de primaria de Guatemala.

Stack: Node.js (≥ 22) · Express 5 · MongoDB con Mongoose · módulos ES.

> Estado: base del proyecto + **autenticación y perfil de docentes**.
> Solo los docentes tienen cuenta; los estudiantes no tienen usuario, correo ni contraseña.

## Instalación

```bash
git clone https://github.com/DiliRo/EdTech.git
cd EdTech
npm install
cp .env.example .env     # en Windows: copy .env.example .env
```

Edita `.env` y completa:

- `MONGODB_URI`: tu MongoDB local o de Atlas.
- `JWT_SECRET`: un secreto de al menos 32 caracteres. Para generarlo:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

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
| `JWT_SECRET`  | Sí          | —                       | Secreto de firma de JWT (mínimo 32 caracteres)|
| `JWT_EXPIRES_IN` | No       | `8h`                    | Duración de la sesión                         |
| `BCRYPT_SALT_ROUNDS` | No   | `12`                    | Costo de bcrypt (4 a 15)                      |
| `LOGIN_MAX_ATTEMPTS` | No   | `5`                     | Intentos fallidos de login por IP + correo    |
| `LOGIN_WINDOW_MINUTES` | No | `15`                    | Ventana del límite de login                   |
| `REGISTER_MAX_PER_HOUR` | No| `10`                    | Registros por IP por hora                     |

Si falta una variable obligatoria o MongoDB no responde, el servidor no arranca y muestra el motivo en consola.

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

### Autenticación

Las rutas privadas requieren la cabecera:

```
Authorization: Bearer <token>
```

El token es un JWT (HS256) que solo contiene el id del docente (`sub`). En cada petición se
comprueba la firma, la expiración y que el docente siga existiendo.

#### Idiomas (`preferredLanguage`)

Definidos en un solo lugar: `src/config/languages.js`. Se usan códigos ISO 639.

| Código | Idioma    |
|--------|-----------|
| `es`   | Español (por defecto) |
| `kek`  | Q'eqchi'  |
| `quc`  | K'iche'   |
| `mam`  | Mam       |
| `cak`  | Kaqchikel |

#### `POST /api/auth/register` (pública)

```json
{
  "firstName": "Ana",
  "lastName": "Ixcot",
  "email": "ana.ixcot@escuela.edu.gt",
  "password": "Clave2026",
  "preferredLanguage": "kek"
}
```

- `firstName`, `lastName`: obligatorios, hasta 60 caracteres, solo letras (con tildes y apóstrofos), espacios o guiones.
- `email`: obligatorio y único. Se guarda en minúsculas.
- `password`: mínimo 8 caracteres, con mayúscula, minúscula y número (máximo 72 bytes, el límite de bcrypt).
- `preferredLanguage`: opcional, por defecto `es`.
- Cualquier otro campo se rechaza.

**201**
```json
{
  "success": true,
  "message": "Cuenta creada correctamente",
  "data": {
    "teacher": {
      "firstName": "Ana",
      "lastName": "Ixcot",
      "email": "ana.ixcot@escuela.edu.gt",
      "preferredLanguage": "kek",
      "createdAt": "2026-11-21T18:26:04.125Z",
      "updatedAt": "2026-11-21T18:26:04.125Z",
      "id": "6b01e23cdd076cc451f747f8"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**400** (validación)
```json
{
  "success": false,
  "message": "Errores de validación",
  "errors": [
    { "field": "password", "message": "La contraseña debe tener al menos 8 caracteres" },
    { "field": "email", "message": "El correo no es válido" },
    { "field": "role", "message": "Campo no permitido" }
  ]
}
```

**409** (correo ya registrado)
```json
{
  "success": false,
  "message": "Ya existe una cuenta con ese correo",
  "errors": [{ "field": "email", "message": "Ya existe una cuenta con ese correo" }]
}
```

#### `POST /api/auth/login` (pública)

```json
{ "email": "ana.ixcot@escuela.edu.gt", "password": "Clave2026" }
```

**200**: igual que el registro, con `"message": "Inicio de sesión exitoso"`.

**401**: el mismo mensaje si el correo no existe o la contraseña es incorrecta.
```json
{ "success": false, "message": "Correo o contraseña incorrectos" }
```

**429**: después de 5 intentos **fallidos** para el mismo correo desde la misma IP en 15 minutos.
Los inicios de sesión exitosos no cuentan.
```json
{ "success": false, "message": "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." }
```

#### `GET /api/auth/me` (privada)

**200**
```json
{
  "success": true,
  "message": "Perfil del docente",
  "data": {
    "teacher": {
      "firstName": "Ana",
      "lastName": "Ixcot",
      "email": "ana.ixcot@escuela.edu.gt",
      "preferredLanguage": "kek",
      "createdAt": "2026-11-21T18:26:04.125Z",
      "updatedAt": "2026-11-21T18:26:04.125Z",
      "id": "6b01e23cdd076cc451f747f8"
    }
  }
}
```

**401**: sin token, token alterado, firmado con otro secreto, expirado o de un docente que ya no existe.
```json
{ "success": false, "message": "Debes iniciar sesión" }
```

#### `PATCH /api/teachers/me` (privada)

Actualiza **solo** `firstName`, `lastName` y/o `preferredLanguage` (al menos uno).
El correo y la contraseña no se pueden cambiar desde aquí.

```json
{ "firstName": "Ana María", "preferredLanguage": "cak" }
```

**200**
```json
{
  "success": true,
  "message": "Perfil actualizado",
  "data": {
    "teacher": {
      "firstName": "Ana María",
      "lastName": "Ixcot",
      "email": "ana.ixcot@escuela.edu.gt",
      "preferredLanguage": "cak",
      "createdAt": "2026-11-21T18:26:04.125Z",
      "updatedAt": "2026-11-21T18:30:12.441Z",
      "id": "6b01e23cdd076cc451f747f8"
    }
  }
}
```

**400** (campo no permitido)
```json
{
  "success": false,
  "message": "Errores de validación",
  "errors": [{ "field": "email", "message": "Campo no permitido" }]
}
```

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
| Sin sesión / token inválido  | 401    |
| Correo duplicado             | 409    |
| Demasiados intentos          | 429    |
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
│   ├── db.js               # conexión a MongoDB con Mongoose
│   └── languages.js        # idiomas soportados (fuente única)
├── models/
│   └── teacher.model.js    # Teacher (único usuario del sistema)
├── routes/
│   ├── index.js            # registra todas las rutas bajo /api
│   ├── health.routes.js
│   ├── auth.routes.js      # /api/auth/register, /login, /me
│   └── teacher.routes.js   # /api/teachers/me
├── controllers/
│   ├── health.controller.js
│   ├── auth.controller.js
│   └── teacher.controller.js
├── services/
│   ├── health.service.js   # estado real de la BD (readyState + ping con timeout)
│   ├── auth.service.js     # registro y login
│   └── teacher.service.js  # actualización del perfil propio
├── middlewares/
│   ├── auth.middleware.js       # requireAuth: verifica JWT y carga req.teacher
│   ├── rateLimit.middleware.js  # límites de login y registro
│   ├── validate.middleware.js   # convierte errores de express-validator en 400
│   ├── notFound.js              # 404 en JSON
│   └── errorHandler.js          # manejo central de errores
├── validators/
│   ├── teacher.rules.js    # reglas reutilizables (nombre, correo, contraseña, idioma)
│   ├── auth.validator.js
│   └── teacher.validator.js
└── utils/
    ├── AppError.js         # error controlado con código HTTP
    ├── password.js         # bcrypt (hash y comparación)
    └── jwt.js              # firma y verificación de tokens
tests/
├── setup-env.js            # entorno aislado para pruebas
├── helpers/                # almacén falso de Teacher y datos de prueba
├── unit/                   # no necesitan MongoDB
└── integration/            # MongoDB real en memoria (mongodb-memory-server)
```

Para proteger una ruta nueva, agrega `requireAuth` y filtra las consultas con `req.user.id`.

Para agregar un módulo: modelo en `models/`, validaciones en `validators/`, lógica en
`services/`, manejo HTTP en `controllers/`, rutas en `routes/` y registrarlas en `routes/index.js`.

## Pruebas

```bash
npm test                    # todas
npm run test:unit           # sin base de datos
npm run test:integration    # levanta un MongoDB en memoria
```

La primera vez, `test:integration` descarga el binario de MongoDB (~100 MB), así que necesita internet.
