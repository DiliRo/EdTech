# edTech — API

Backend de **edTech**, plataforma de apoyo pedagógico para docentes de primaria de Guatemala.

Stack: Node.js (≥ 22) · Express 5 · MongoDB con Mongoose · módulos ES.

> Estado: base del proyecto + **autenticación y perfil de docentes** + **catálogo académico (solo lectura)** + **aulas y estudiantes**.
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

Cargar el catálogo de **prueba** (grados 1–6 y contenido de ejemplo marcado `[PRUEBA]`):

```bash
npm run catalog:seed-sample
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

### Catálogo académico (solo lectura)

Grados, materias y temas del nivel primario. **Todas las rutas requieren sesión** y son solo de
lectura: los docentes no pueden crear, editar ni borrar datos del catálogo. Los datos se cargan con
el importador (ver [Importar catálogos](#importar-catálogos)).

Cada materia y tema incluye:
- `isSample`: `true` si es dato de **prueba** (no oficial del CNB).
- `source`: procedencia (`cnb` o `sample`, documento, versión, fecha de importación).

Las listas incluyen `meta.containsSampleData` para que el frontend muestre un aviso.

#### `GET /api/grades`

Filtros: `level` (`primaria`). Orden: nivel y número.

```json
{
  "success": true,
  "message": "Grados",
  "data": {
    "grades": [
      { "number": 1, "name": "Primer grado", "level": "primaria", "createdAt": "...", "updatedAt": "...", "id": "6b01e4a6cd89694ca6013148" }
    ]
  }
}
```

#### `GET /api/subjects`

Filtros: `grade` (id del grado). Orden: nombre.

```json
{
  "success": true,
  "message": "Materias",
  "data": {
    "subjects": [
      {
        "code": "prueba-matematicas",
        "name": "[PRUEBA] Matemáticas",
        "description": "[PRUEBA] Materia de ejemplo para desarrollo. No es contenido oficial del CNB.",
        "grades": [{ "number": 1, "name": "Primer grado", "level": "primaria", "id": "6b01e4a6cd89694ca6013148" }],
        "isSample": true,
        "source": { "type": "sample", "importedAt": "2026-11-21T18:00:00.000Z" },
        "createdAt": "...",
        "updatedAt": "...",
        "id": "6b01e4a6cd89694ca6013149"
      }
    ]
  },
  "meta": { "containsSampleData": true }
}
```

#### `GET /api/topics`

Filtros: `subject` (id), `grade` (id), `page` (≥ 1, por defecto 1), `limit` (1–100, por defecto 50).

```json
{
  "success": true,
  "message": "Temas",
  "data": {
    "topics": [
      {
        "code": "tema-ejemplo-1",
        "name": "[PRUEBA] Tema de ejemplo 1",
        "description": "[PRUEBA] Texto de relleno para probar la interfaz.",
        "grade": { "number": 1, "name": "Primer grado", "level": "primaria", "id": "6b01e4a6cd89694ca6013148" },
        "subject": { "code": "prueba-matematicas", "name": "[PRUEBA] Matemáticas", "id": "6b01e4a6cd89694ca6013149" },
        "competencies": [
          { "code": "P1", "description": "[PRUEBA] Competencia de ejemplo; no proviene del CNB." }
        ],
        "achievementIndicators": [
          { "code": "P1.1", "competencyCode": "P1", "description": "[PRUEBA] Indicador de ejemplo; no proviene del CNB." }
        ],
        "curriculumReference": { "document": "Ninguno: datos de prueba" },
        "isSample": true,
        "source": { "type": "sample", "importedAt": "2026-11-21T18:00:00.000Z" },
        "createdAt": "...",
        "updatedAt": "...",
        "id": "6b01e4a6cd89694ca601314a"
      }
    ]
  },
  "meta": { "page": 1, "limit": 50, "total": 1, "totalPages": 1, "containsSampleData": true }
}
```

#### `GET /api/topics/:id`

Igual que un elemento de la lista, dentro de `data.topic`; la materia incluye también su `description`.
`meta.containsSampleData` indica si el tema es de prueba.

| Caso                                       | Código |
|--------------------------------------------|--------|
| Id con formato inválido                    | 400    |
| Parámetro desconocido o fuera de rango     | 400    |
| Tema inexistente                           | 404    |
| POST / PUT / PATCH / DELETE en el catálogo | 404    |

### Importar catálogos

```bash
npm run catalog:import -- <archivo.json> --dry-run   # valida sin escribir
npm run catalog:import -- <archivo.json>             # importa (upsert: no duplica al repetir)
```

El formato y las reglas están en [`data/catalog/README.md`](data/catalog/README.md). En resumen:

- `metadata.source: "cnb"` exige documento, versión y página o URL de cada tema.
- `metadata.source: "sample"` exige que todo el contenido empiece con `[PRUEBA]`.
- Un catálogo de prueba nunca reemplaza datos oficiales. Si hay cualquier error, no se escribe nada.

**No hay todavía datos oficiales del CNB en el repositorio.** Solo existe `sample.catalog.json`,
cuyo contenido es inventado y está marcado como prueba.

### Contexto para la IA (preparado, sin endpoint)

`topic.toAIContext()` (con `grade` y `subject` poblados) devuelve un resumen compacto del tema:
grado, materia, competencias, indicadores, referencia curricular y `dataStatus`
(`official` o `sample`, con una advertencia si es de prueba). Lo usará el módulo de generación de guías.

### Aulas y estudiantes

> **Los estudiantes son registros académicos, no usuarios.** No tienen nombre, correo, contraseña
> ni sesión: solo un **código** que el docente asigna (`A01`, `MAT-03`, `EST-12`).

Reglas:

- Todas las rutas requieren sesión. Antes de cualquier operación se comprueba que el aula sea del
  docente; si es de otro, la respuesta es **404**, idéntica a la de un recurso inexistente.
- El `_id` del estudiante es **permanente**. Las evaluaciones y estadísticas se relacionarán con
  él, nunca con el código. Por eso el código se puede editar sin perder historial.
- `studentCode` se guarda en MAYÚSCULAS (`a01` = `A01`); letras sin tilde, números, `-` y `_`, máximo 20.
- El código es **único dentro del aula** (validación + índice único `{ classroomId, studentCode }`),
  también frente a estudiantes archivados. Puede repetirse en otras aulas.
- `DELETE` **archiva** (`isActive: false`); nunca borra. `PATCH` con `"isActive": true` restaura.
- Archivar un aula no archiva a sus estudiantes. En un aula archivada no se agregan estudiantes ni se
  edita nada sin restaurarla.
- Cualquier dato personal (`name`, `firstName`, `email`, `password`, `birthDate`, …) se rechaza con 400.

| Método y ruta | Descripción |
|---|---|
| `GET /api/classrooms?status=&schoolYear=` | Aulas del docente. `status`: `active` (por defecto), `archived`, `all` |
| `POST /api/classrooms` | Crea un aula |
| `GET /api/classrooms/:id` | Detalle con `grade`, `subjects` y `activeStudentCount` |
| `PATCH /api/classrooms/:id` | Edita `name`, `gradeId`, `section`, `schoolYear`, `subjectIds`, `isActive` |
| `DELETE /api/classrooms/:id` | Archiva |
| `GET /api/classrooms/:id/students?status=` | Estudiantes del aula, ordenados por código |
| `POST /api/classrooms/:id/students` | Registra un estudiante con `studentCode` |
| `PATCH /api/students/:id` | Edita `studentCode` y/o `isActive` |
| `DELETE /api/students/:id` | Archiva |

#### `POST /api/classrooms`

```json
{
  "name": "Primero A matutina",
  "gradeId": "6b01e6a7f94451de085051be",
  "section": "A",
  "schoolYear": 2026,
  "subjectIds": ["6b01e6a7f94451de085051c0"]
}
```

`gradeId` debe existir y cada materia debe impartirse en ese grado. `teacherId` sale del token;
`isActive` no se acepta al crear.

**201**
```json
{
  "success": true,
  "message": "Aula creada",
  "data": {
    "classroom": {
      "name": "Primero A matutina",
      "gradeId": "6b01e6a7f94451de085051be",
      "section": "A",
      "schoolYear": 2026,
      "teacherId": "6b01e6a8f94451de085051c2",
      "subjectIds": ["6b01e6a7f94451de085051c0"],
      "isActive": true,
      "createdAt": "2026-11-21T18:44:56.044Z",
      "updatedAt": "2026-11-21T18:44:56.044Z",
      "grade": { "number": 1, "name": "Primer grado", "level": "primaria", "id": "6b01e6a7f94451de085051be" },
      "subjects": [{ "code": "prueba-matematicas", "name": "[PRUEBA] Matemáticas", "isSample": true, "id": "6b01e6a7f94451de085051c0" }],
      "activeStudentCount": 0,
      "id": "6b01e6a8f94451de085051c4"
    }
  }
}
```

#### `POST /api/classrooms/:id/students`

```json
{ "studentCode": "a01" }
```

**201**
```json
{
  "success": true,
  "message": "Estudiante registrado",
  "data": {
    "student": {
      "studentCode": "A01",
      "classroomId": "6b01e6a8f94451de085051c4",
      "isActive": true,
      "createdAt": "2026-11-21T18:44:56.051Z",
      "updatedAt": "2026-11-21T18:44:56.051Z",
      "id": "6b01e6a8f94451de085051c5"
    }
  }
}
```

**409** (código repetido en el aula)
```json
{
  "success": false,
  "message": "Ya existe un estudiante con el código \"A01\" en esta aula",
  "errors": [{ "field": "studentCode", "message": "El código ya está en uso en esta aula (también cuenta a los archivados)" }]
}
```

**400** (dato personal)
```json
{
  "success": false,
  "message": "Los estudiantes no son usuarios: regístralos solo con un código (studentCode), sin datos personales.",
  "errors": [{ "field": "firstName", "message": "Dato personal no permitido" }]
}
```

#### `PATCH /api/students/:id`

```json
{ "studentCode": "EST-01" }
```

**200**: mismo `id` y `createdAt`; cambia `studentCode` y `updatedAt`. `DELETE` devuelve el mismo
formato con `"isActive": false` y `"message": "Estudiante archivado"`.

| Caso | Código |
|---|---|
| Aula o estudiante de otro docente, o inexistente | 404 |
| Código repetido en el aula | 409 |
| Agregar estudiantes o editar un aula archivada | 409 |
| Reactivar un estudiante de un aula archivada | 409 |
| Dato personal o campo no permitido | 400 |

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
│   ├── languages.js        # idiomas soportados (fuente única)
│   ├── curriculum.js       # niveles, rango de grados, orígenes y marca [PRUEBA]
│   └── classroom.js        # formato de studentCode, límites y filtros de estado
├── models/
│   ├── teacher.model.js    # Teacher (único usuario del sistema)
│   ├── catalog.shared.js   # procedencia (source) y toJSON comunes del catálogo
│   ├── grade.model.js
│   ├── subject.model.js
│   ├── topic.model.js      # incluye toAIContext()
│   ├── classroom.model.js
│   └── student.model.js    # solo studentCode, classroomId, isActive (strict: 'throw')
├── routes/
│   ├── index.js            # registra todas las rutas bajo /api
│   ├── health.routes.js
│   ├── auth.routes.js      # /api/auth/register, /login, /me
│   ├── teacher.routes.js   # /api/teachers/me
│   ├── catalog.routes.js   # /api/grades, /api/subjects, /api/topics (solo GET)
│   ├── classroom.routes.js # /api/classrooms y /api/classrooms/:id/students
│   └── student.routes.js   # /api/students/:id
├── controllers/
│   ├── health.controller.js
│   ├── auth.controller.js
│   ├── teacher.controller.js
│   ├── catalog.controller.js
│   ├── classroom.controller.js
│   └── student.controller.js
├── services/
│   ├── health.service.js   # estado real de la BD (readyState + ping con timeout)
│   ├── auth.service.js     # registro y login
│   ├── teacher.service.js  # actualización del perfil propio
│   ├── catalog.service.js  # consultas del catálogo
│   ├── catalogImport.service.js  # validación de referencias e importación
│   ├── classroom.service.js      # findOwnedClassroom: comprobación de propiedad
│   └── student.service.js
├── middlewares/
│   ├── auth.middleware.js       # requireAuth: verifica JWT y carga req.teacher
│   ├── rateLimit.middleware.js  # límites de login y registro
│   ├── validate.middleware.js   # convierte errores de express-validator en 400
│   ├── notFound.js              # 404 en JSON
│   └── errorHandler.js          # manejo central de errores
├── validators/
│   ├── teacher.rules.js    # reglas reutilizables (nombre, correo, contraseña, idioma)
│   ├── auth.validator.js
│   ├── teacher.validator.js
│   ├── catalog.validator.js      # parámetros de consulta del catálogo
│   ├── catalogFile.validator.js  # estructura de los archivos JSON del catálogo
│   ├── classroom.validator.js
│   └── student.validator.js      # rechaza datos personales
└── utils/
    ├── AppError.js         # error controlado con código HTTP
    ├── password.js         # bcrypt (hash y comparación)
    └── jwt.js              # firma y verificación de tokens
scripts/
└── importCatalog.js        # CLI de importación del catálogo
data/catalog/
├── README.md               # formato y reglas de los catálogos
└── sample.catalog.json     # datos de PRUEBA (no oficiales)
tests/
├── setup-env.js            # entorno aislado para pruebas
├── helpers/                # modelos falsos en memoria y datos de prueba
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
