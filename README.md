# edTech — API

Backend de **edTech**, plataforma de apoyo pedagógico para docentes de primaria de Guatemala.

Stack: Node.js (≥ 22) · Express 5 · MongoDB con Mongoose · módulos ES.

> Estado: base del proyecto + **autenticación y perfil de docentes** + **catálogo académico (solo lectura)** + **aulas y estudiantes** + **metodologías** + **evaluaciones y seguimiento** + **guías de clase con IA**.
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

Cargar las metodologías predeterminadas (estrategias del MINEDUC):

```bash
npm run methodologies:seed
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
| `PERFORMANCE_THRESHOLD` | No| `60`                    | Umbral (% de logro) para señalar resultados   |
| `AI_PROVIDER` | No | `mock` | `mock`, `anthropic` u `openai-compatible` (ver sección de guías) |
| `AI_API_KEY`, `AI_MODEL` | Con proveedor real | — | Clave y modelo del proveedor |
| `AI_BASE_URL` | Con `openai-compatible` | — | URL base, p. ej. `https://api.openai.com/v1` |
| `AI_ANTHROPIC_VERSION` | No | `2023-06-01` | Cabecera `anthropic-version` |
| `AI_TIMEOUT_MS` | No | `30000` | Tiempo máximo de espera por llamada |
| `AI_MAX_OUTPUT_TOKENS` | No | `2500` | Tokens máximos de respuesta |
| `AI_MAX_INPUT_CHARS` / `AI_MAX_OUTPUT_CHARS` | No | `12000` / `20000` | Longitud máxima del prompt y de la respuesta |
| `AI_MAX_ATTEMPTS` | No | `2` | Intentos si la respuesta no es JSON válido |
| `AI_DAILY_LIMIT_PER_TEACHER` | No | `20` | Llamadas a la IA por docente por día |
| `AI_RATE_LIMIT_PER_MINUTE` | No | `5` | Generaciones por docente por minuto |

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

### Metodologías

Catálogo de metodologías y estrategias de enseñanza para usar en guías de clase.

- **Predeterminadas** (`isDefault: true`): Diálogo de saberes, Mundo letrado, Rincones de aprendizaje
  y Aprendizaje cooperativo, tomadas de *Metodología del Aprendizaje* (MINEDUC, 2010). Se cargan con
  `npm run methodologies:seed` y **ningún docente puede editarlas ni archivarlas** (403).
  Ver [`data/methodologies/README.md`](data/methodologies/README.md) para saber qué parte del
  contenido viene de la fuente y qué es adaptación.
- **Personalizadas**: cada docente crea las suyas. Solo su autor las ve, edita y archiva
  (los demás reciben 404).
- **Preferencias de aprendizaje** (`visual`, `auditiva`, `kinestesica`, `lectoescritura`,
  `colaborativa`, `individual`): son descriptivas. Si se indican deben ser **al menos dos**; ninguna
  metodología se asigna a un solo estilo de aprendizaje.
- `compatibleSubjects` / `compatibleGrades` vacíos = aplicable a cualquier materia / grado.
- `estimatedDuration: null` = la fuente no indica duración.
- `DELETE` archiva (`isActive: false`). La metodología deja de listarse, pero su autor aún puede
  consultarla por id y restaurarla con `PATCH { "isActive": true }`.

| Método y ruta | Descripción |
|---|---|
| `GET /api/methodologies` | Predeterminadas + propias activas. Filtros abajo |
| `GET /api/methodologies/:id` | Detalle completo: objetivos, pasos, actividades, materiales y fuente |
| `POST /api/methodologies` | Crea una metodología propia |
| `PATCH /api/methodologies/:id` | Edita una propia (403 si es predeterminada) |
| `DELETE /api/methodologies/:id` | Archiva una propia (403 si es predeterminada) |

**Filtros de `GET /api/methodologies`**

| Parámetro | Ejemplo | Efecto |
|---|---|---|
| `scope` | `all` (defecto), `default`, `mine` | Alcance |
| `subject` | id | Generales + compatibles con esa materia |
| `grade` | id | Generales + compatibles con ese grado |
| `maxDuration` | `30` | Duración mínima ≤ 30 minutos (excluye las que no indican duración) |
| `learningPreferences` | `visual,kinestesica` | Coincide con **alguna** de las preferencias |

La respuesta incluye `meta.learningPreferences` con los códigos y sus etiquetas.

#### `POST /api/methodologies`

```json
{
  "name": "Lectura en voz alta por turnos",
  "description": "Estrategia propia para practicar fluidez lectora.",
  "objectives": ["Mejorar la fluidez lectora"],
  "steps": [
    { "title": "Modelar", "description": "El docente lee un párrafo en voz alta." },
    { "description": "Cada estudiante lee un párrafo." }
  ],
  "suggestedActivities": [{ "title": "Lectura en parejas" }],
  "materials": ["Libro de lectura"],
  "estimatedDuration": { "minMinutes": 20, "maxMinutes": 35 },
  "compatibleSubjects": [],
  "compatibleGrades": [],
  "learningPreferences": ["auditiva", "lectoescritura"],
  "sourceReference": null
}
```

Solo `name` y `description` son obligatorios. `isDefault`, `createdBy`, `defaultKey` e `isActive`
se rechazan.

**201**
```json
{
  "success": true,
  "message": "Metodología creada",
  "data": {
    "methodology": {
      "name": "Lectura en voz alta por turnos",
      "description": "Estrategia propia para practicar fluidez lectora.",
      "objectives": ["Mejorar la fluidez lectora"],
      "steps": [
        { "title": "Modelar", "description": "El docente lee un párrafo en voz alta." },
        { "description": "Cada estudiante lee un párrafo." }
      ],
      "suggestedActivities": [{ "title": "Lectura en parejas" }],
      "materials": ["Libro de lectura"],
      "estimatedDuration": { "minMinutes": 20, "maxMinutes": 35 },
      "compatibleSubjects": [],
      "compatibleGrades": [],
      "learningPreferences": ["auditiva", "lectoescritura"],
      "isDefault": false,
      "createdBy": "6b01e8953a62794870353e7c",
      "sourceReference": null,
      "isActive": true,
      "createdAt": "2026-11-21T18:53:09.073Z",
      "updatedAt": "2026-11-21T18:53:09.073Z",
      "id": "6b01e8953a62794870353e7d"
    }
  }
}
```

**400** (una sola preferencia)
```json
{
  "success": false,
  "message": "Errores de validación",
  "errors": [{ "field": "learningPreferences", "message": "Indica al menos dos preferencias: una metodología no es exclusiva de un estilo de aprendizaje" }]
}
```

#### `GET /api/methodologies/:id` (predeterminada, resumida)

```json
{
  "success": true,
  "message": "Metodología",
  "data": {
    "methodology": {
      "name": "Mundo letrado",
      "description": "Estrategia que da sentido al lenguaje oral y escrito organizando el aula como un ambiente letrado...",
      "objectives": ["Manejar material escrito.", "Formar hábitos de lectura y escritura.", "..."],
      "steps": [{ "title": "Organizar el ambiente letrado", "description": "..." }, "..."],
      "suggestedActivities": [{ "title": "Biblioteca de aula" }, { "title": "Periódico mural", "description": "..." }, "..."],
      "materials": ["Carteles", "Rótulos", "Periódicos", "..."],
      "estimatedDuration": null,
      "compatibleSubjects": [],
      "compatibleGrades": [],
      "learningPreferences": ["visual", "lectoescritura"],
      "isDefault": true,
      "defaultKey": "mundo-letrado",
      "createdBy": null,
      "sourceReference": {
        "title": "Metodología del Aprendizaje (serie El Currículo organizado en competencias)",
        "institution": "Ministerio de Educación de Guatemala (MINEDUC), Dirección General de Gestión de Calidad Educativa",
        "year": 2010,
        "section": "1.4.2 Mundo letrado",
        "pages": "17",
        "url": "https://digecur.mineduc.gob.gt/wp-content/uploads/2025/03/Metodologia-del-Aprendizaje.pdf",
        "notes": "Definición, propósitos, actividades y materiales tomados de la fuente. La fuente no presenta una secuencia de pasos: ..."
      },
      "isActive": true,
      "id": "6b01e8953a62794870353e79"
    }
  }
}
```

**403** (editar o archivar una predeterminada)
```json
{ "success": false, "message": "Las metodologías predeterminadas no se pueden modificar. Puedes crear una propia basada en ella." }
```

### Evaluaciones y seguimiento académico

Reglas:

- Las calificaciones se relacionan con el estudiante por **`studentId`** (su `_id` permanente). En
  las respuestas se muestra el **`studentCode` actual**; si el docente cambia el código, los
  resultados se conservan y aparecen con el código nuevo. Enviar `studentCode` en lugar de
  `studentId` da 400.
- Cada estudiante debe pertenecer al aula evaluada. Si no (o si no existe), el mensaje es el mismo:
  no se revela información de otras aulas.
- Un solo resultado por evaluación y estudiante (validación + índice único `{ assessmentId, studentId }`).
- **Una calificación faltante no es cero**: los estudiantes que no se envían quedan *pendientes* y no
  participan en promedios. Sin datos, los indicadores son `null`.
- **Correcciones**: volver a enviar la nota de un estudiante la corrige y guarda en `corrections` el
  valor anterior, la fecha (`changedAt`), el docente (`changedBy`) y un motivo opcional.
- Solo el docente dueño del aula y de la evaluación accede (otros reciben 404).
- **Los indicadores apoyan al docente; no son diagnósticos.** Las respuestas de progreso y
  rendimiento incluyen `meta.note` con esa aclaración.

| Método y ruta | Descripción |
|---|---|
| `POST /api/assessments` | Crea una evaluación |
| `GET /api/assessments?classroomId=&subjectId=&assessmentType=&from=&to=` | Evaluaciones propias |
| `GET /api/assessments/:id` | Detalle, calificaciones (con `studentCode`), pendientes y resumen |
| `POST /api/assessments/:id/results` | Registro masivo y correcciones |
| `GET /api/students/:id/results?subjectId=&from=&to=` | Historial del estudiante |
| `GET /api/students/:id/progress?subjectId=&from=&to=&threshold=` | Promedio, evolución y tendencia |
| `GET /api/classrooms/:id/performance?subjectId=&from=&to=&threshold=` | Estadísticas del aula |

Cálculos (`src/utils/performance.js`):

| Indicador | Cálculo |
|---|---|
| `percentage` | `score / maxScore × 100`, 2 decimales |
| Promedios | Media de los **porcentajes** registrados (permite comparar evaluaciones con distinta nota máxima) |
| `trend.change` | Último porcentaje − primero (puntos) |
| `trend.direction` | `up` si ≥ +5, `down` si ≤ −5, `stable` en otro caso, `null` con menos de 2 resultados |
| `belowThreshold` | Promedio < umbral (por defecto `PERFORMANCE_THRESHOLD`, ajustable con `?threshold=`). Sin datos nunca se señala |
| `completionRate` | Calificaciones registradas de estudiantes activos / (evaluaciones × estudiantes activos) |

#### `POST /api/assessments`

```json
{
  "title": "Prueba corta de sumas",
  "classroomId": "6b01ea929905a84c102ca36e",
  "subjectId": "6b01ea929905a84c102ca367",
  "topicId": null,
  "teachingMethodId": null,
  "assessmentDate": "2026-03-10",
  "maxScore": 20,
  "assessmentType": "formativa"
}
```

`assessmentType`: `diagnostica`, `formativa` o `sumativa`. La materia debe estar asignada al aula
(o impartirse en su grado si el aula no tiene materias); el tema debe ser de esa materia y grado; la
metodología debe ser predeterminada o propia. `maxScore` no se puede cambiar después.

#### `POST /api/assessments/:id/results`

```json
{
  "results": [
    { "studentId": "6b01ea929905a84c102ca371", "score": 16 },
    { "studentId": "6b01ea939905a84c102ca372", "score": 8, "observations": "Repasar restas" }
  ]
}
```

**200**
```json
{
  "success": true,
  "message": "Calificaciones registradas",
  "data": {
    "summary": { "created": 2, "updated": 0, "unchanged": 0 },
    "results": [
      {
        "id": "6b01ea939905a84c102ca378",
        "assessmentId": "6b01ea939905a84c102ca376",
        "studentId": "6b01ea929905a84c102ca371",
        "studentCode": "A01",
        "studentIsActive": true,
        "score": 16,
        "percentage": 80,
        "observations": "",
        "recordedBy": "6b01ea929905a84c102ca369",
        "corrections": [],
        "createdAt": "2026-11-21T19:01:39.023Z",
        "updatedAt": "2026-11-21T19:01:39.023Z"
      }
    ]
  }
}
```

Corrección: `{ "results": [{ "studentId": "...", "score": 9, "correctionReason": "Error al transcribir" }] }`

```json
"corrections": [
  {
    "previousScore": 8,
    "previousPercentage": 40,
    "previousObservations": "Repasar restas",
    "changedAt": "2026-11-21T19:01:39.029Z",
    "changedBy": "6b01ea929905a84c102ca369",
    "reason": "Error al transcribir"
  }
]
```

Si algún elemento es inválido (estudiante de otra aula, nota mayor a `maxScore`, estudiante repetido
o archivado sin nota previa) se responde 400 y **no se guarda nada**.

#### `GET /api/students/:id/progress`

```json
{
  "success": true,
  "message": "Progreso del estudiante",
  "data": {
    "student": { "id": "6b01ea929905a84c102ca371", "studentCode": "A01", "classroomId": "6b01ea929905a84c102ca36e", "isActive": true },
    "threshold": 60,
    "summary": {
      "resultsCount": 2,
      "assessmentsWithoutResult": 0,
      "averagePercentage": 85,
      "medianPercentage": 85,
      "minPercentage": 80,
      "maxPercentage": 90,
      "latestPercentage": 90,
      "belowThreshold": false
    },
    "trend": { "change": 10, "direction": "up" },
    "evolution": [
      { "assessmentId": "6b01ea939905a84c102ca376", "title": "Marzo", "assessmentDate": "2026-03-10T00:00:00.000Z", "assessmentType": "formativa", "subjectId": "6b01ea929905a84c102ca367", "maxScore": 20, "score": 16, "percentage": 80 },
      { "assessmentId": "6b01ea939905a84c102ca377", "title": "Abril", "assessmentDate": "2026-04-10T00:00:00.000Z", "assessmentType": "formativa", "subjectId": "6b01ea929905a84c102ca367", "maxScore": 20, "score": 18, "percentage": 90 }
    ],
    "bySubject": [
      { "subjectId": "6b01ea929905a84c102ca367", "subjectName": "[PRUEBA] Mate", "resultsCount": 2, "assessmentsWithoutResult": 0, "averagePercentage": 85, "trend": { "change": 10, "direction": "up" } }
    ]
  },
  "meta": { "note": "Indicadores de apoyo para el docente. Un resultado bajo no es un diagnóstico del estudiante; las evaluaciones sin calificación registrada no cuentan como cero." }
}
```

#### `GET /api/classrooms/:id/performance` (resumido)

```json
{
  "data": {
    "classroom": { "id": "6b01ea929905a84c102ca36e", "name": "A", "isActive": true },
    "threshold": 60,
    "summary": {
      "assessmentsCount": 2, "studentsCount": 3, "resultsCount": 4, "completionRate": 66.67,
      "averagePercentage": 66.25, "medianPercentage": 65, "minPercentage": 45, "maxPercentage": 90,
      "averageOfStudentAverages": 66.25
    },
    "belowThreshold": {
      "threshold": 60,
      "resultsCount": 2,
      "students": [{ "studentId": "6b01ea939905a84c102ca372", "studentCode": "A02", "averagePercentage": 47.5, "resultsCount": 2 }]
    },
    "perAssessment": [
      { "id": "6b01ea939905a84c102ca376", "title": "Marzo", "resultsCount": 2, "pendingCount": 1, "averagePercentage": 62.5, "belowThresholdCount": 1, "...": "..." }
    ],
    "perStudent": [
      { "studentId": "6b01ea929905a84c102ca371", "studentCode": "A01", "isActive": true, "resultsCount": 2, "assessmentsWithoutResult": 0, "averagePercentage": 85, "trend": { "change": 10, "direction": "up" }, "belowThreshold": false },
      { "studentId": "6b01ea939905a84c102ca373", "studentCode": "A03", "isActive": true, "resultsCount": 0, "assessmentsWithoutResult": 2, "averagePercentage": null, "trend": { "change": null, "direction": null }, "belowThreshold": false }
    ]
  },
  "meta": { "note": "Indicadores de apoyo para el docente. ..." }
}
```

`perStudent` incluye a los activos y a los archivados que tengan calificaciones.

### Guías de clase con IA

Genera **propuestas editables** de guías de clase a partir del grado, la materia, el tema (con sus
competencias e indicadores del catálogo), la metodología y la duración. La guía no es una instrucción
obligatoria: el docente la revisa, la edita y decide si la aprueba.

#### Proveedor de IA

El servicio está desacoplado del proveedor (`src/services/ai/`). Todos implementan
`generate({ system, user, context }) → { text, usage, model }`.

| `AI_PROVIDER` | Uso |
|---|---|
| `mock` (por defecto) | Sin llamadas externas. Devuelve una guía de **[EJEMPLO]** válida; sirve para desarrollar sin clave |
| `anthropic` | Messages API (`AI_API_KEY`, `AI_MODEL`, `AI_ANTHROPIC_VERSION`) |
| `openai-compatible` | Cualquier API con `POST {AI_BASE_URL}/chat/completions` en modo JSON |

Si falta la clave o el modelo de un proveedor real, la generación responde 503 sin mostrar detalles.

#### Seguridad y límites

- **Sin datos de estudiantes**: el contexto se arma con una lista blanca (grado, materia, tema,
  metodología, duración, instrucciones adicionales). Nunca se envían aulas, códigos, calificaciones
  ni datos del docente.
- **Instrucciones del sistema fijas**: el prompt del sistema es constante. Todo el contenido del
  catálogo, de las metodologías (incluidas las personalizadas) y las instrucciones del docente va
  dentro de un bloque `<datos>` marcado como información, no instrucciones. Los signos `<` y `>` se
  neutralizan para que nadie pueda cerrar ese bloque, y cada campo se recorta.
- **Sin competencias inventadas**: las competencias e indicadores de la guía vienen del catálogo
  (se guardan en `generations[].curriculum`). Si la IA cita en `competenciesUsed` un código que no
  existe en el tema, la respuesta se rechaza.
- **Falta de información curricular**: el servidor detecta los vacíos (sin tema, datos de prueba,
  sin competencias, sin indicadores, sin referencia al documento) y los guarda en `curriculumGaps`,
  junto con los que reporte la IA.
- **Evaluación alineada**: cada pregunta de `shortAssessment` debe indicar `objectiveIndex`, un
  objetivo existente de la guía.
- **Validación antes de guardar**: la respuesta debe ser un JSON con todas las secciones, sin campos
  extra, dentro de los límites de longitud y con fases que no superen la duración. Si no es válida se
  reintenta una vez (`AI_MAX_ATTEMPTS`) indicando los errores; si vuelve a fallar responde 502 y no se
  guarda nada.
- **Consumo**: tiempo de espera por llamada, tokens máximos, límite de longitud de entrada y
  salida, límite por minuto y límite diario por docente. Cada llamada (incluso fallida) queda en
  `AIUsageLog` (sin guardar el prompt ni la respuesta).

| Error | Código |
|---|---|
| Datos inválidos o demasiado extensos | 400 |
| Guía de otro docente | 404 |
| Regenerar una guía aprobada | 409 |
| La IA no pudo generar (rechazo) | 422 |
| Límite por minuto o diario alcanzado | 429 |
| Respuesta de la IA inválida tras los reintentos | 502 |
| Proveedor no configurado, ocupado o caído | 503 |
| Tiempo de espera agotado | 504 |

#### Endpoints

| Método y ruta | Descripción |
|---|---|
| `POST /api/lesson-guides/generate` | Genera con IA y guarda un **borrador**. Con `guideId` regenera un borrador existente |
| `POST /api/lesson-guides` | Guarda una guía escrita por el docente (sin IA) |
| `GET /api/lesson-guides?status=&gradeId=&subjectId=&page=&limit=` | Guías propias |
| `GET /api/lesson-guides/:id` | Detalle con el historial de generaciones |
| `PATCH /api/lesson-guides/:id` | Edita el contenido y/o `status` (`draft`, `approved`) |

**Generar**

```json
{
  "gradeId": "6b01ed247a1e968bffde427a",
  "subjectId": "6b01ed247a1e968bffde427b",
  "topicId": "6b01ed247a1e968bffde427c",
  "teachingMethodId": "6b01ed247a1e968bffde427d",
  "durationMinutes": 45,
  "additionalInstructions": "Usar ejemplos del mercado local."
}
```

`topicId` es opcional (sin tema la guía lo indica en `curriculumGaps`). `durationMinutes`: 10–240.
`additionalInstructions`: máximo 500 caracteres; no escribas datos de estudiantes.

**Regenerar** un borrador (mismo grado, materia y tema; se puede cambiar metodología, duración e instrucciones):

```json
{ "guideId": "6b01ed247a1e968bffde4280", "teachingMethodId": "...", "durationMinutes": 50 }
```

**201** (resumido)
```json
{
  "success": true,
  "message": "Guía generada como borrador",
  "data": {
    "guide": {
      "id": "6b01ed247a1e968bffde4280",
      "status": "draft",
      "origin": "ai",
      "title": "Sumas con llevadas",
      "durationMinutes": 45,
      "objectives": ["Resolver sumas de dos cifras con llevadas.", "Explicar el procedimiento a un compañero."],
      "opening": { "durationMinutes": 10, "activities": [{ "description": "Conversar sobre situaciones de compra en el mercado." }] },
      "development": { "durationMinutes": 25, "activities": [{ "description": "Resolver sumas con material concreto en parejas." }] },
      "closing": { "durationMinutes": 10, "activities": [{ "description": "Puesta en común y repaso." }] },
      "materials": ["Semillas o tapitas", "Cuaderno"],
      "shortAssessment": {
        "instructions": "Resuelve y explica.",
        "items": [
          { "question": "Resuelve 27 + 15.", "objectiveIndex": 1, "expectedAnswer": "42" },
          { "question": "Explica cómo sumaste.", "objectiveIndex": 2, "expectedAnswer": "" }
        ]
      },
      "teacherRecommendations": ["Adapta los ejemplos a productos de la comunidad."],
      "curriculumGaps": [
        "El tema seleccionado es un dato de PRUEBA, no contenido oficial del CNB.",
        "El tema no indica la página o el enlace del documento del CNB."
      ],
      "editedByTeacher": false,
      "generations": [
        {
          "generatedAt": "2026-11-21T19:12:36.876Z",
          "provider": "anthropic",
          "model": "modelo-configurado",
          "promptVersion": "lesson-guide-v1",
          "attempts": 1,
          "inputTokens": 100,
          "outputTokens": 200,
          "methodology": {
            "name": "Rincones de aprendizaje",
            "isDefault": true,
            "sourceReference": { "title": "Metodología del Aprendizaje (...)", "section": "1.4.3 Rincones de aprendizaje", "pages": "18", "url": "https://digecur.mineduc.gob.gt/..." }
          },
          "curriculum": {
            "grade": { "number": 1, "name": "Primer grado" },
            "subject": { "code": "prueba-matematicas", "name": "[PRUEBA] Matemáticas" },
            "topic": { "code": "tema-ejemplo-1", "name": "[PRUEBA] Tema de ejemplo 1", "isSample": true },
            "competencies": [{ "code": "P1", "description": "[PRUEBA] Competencia de ejemplo; no proviene del CNB." }],
            "achievementIndicators": [{ "code": "P1.1", "competencyCode": "P1", "description": "[PRUEBA] Indicador de ejemplo; no proviene del CNB." }],
            "curriculumReference": { "document": "Ninguno: datos de prueba" },
            "dataStatus": "sample"
          },
          "competenciesUsed": ["P1"],
          "curriculumGaps": ["..."]
        }
      ]
    }
  },
  "meta": { "disclaimer": "Esta guía es una propuesta editable para apoyar la planificación; no es una instrucción obligatoria. Revísala y adáptala a tu aula." }
}
```

**Editar**: `PATCH` acepta `title`, `objectives`, `opening`, `development`, `closing`, `materials`,
`shortAssessment`, `teacherRecommendations` y `status`. Se valida la guía completa resultante (por
ejemplo, no se puede quitar un objetivo que una pregunta evalúa). Grado, materia, tema, metodología,
`curriculumGaps` y el historial de generaciones no se editan.

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
│   ├── classroom.js        # formato de studentCode, límites y filtros de estado
│   ├── methodology.js      # preferencias de aprendizaje, límites y alcances
│   ├── assessment.js       # tipos de evaluación, límites, umbral y nota de apoyo
│   └── ai.js               # proveedor, claves, tiempos y límites de consumo de IA
├── models/
│   ├── teacher.model.js    # Teacher (único usuario del sistema)
│   ├── catalog.shared.js   # procedencia (source) y toJSON comunes del catálogo
│   ├── grade.model.js
│   ├── subject.model.js
│   ├── topic.model.js      # incluye toAIContext()
│   ├── classroom.model.js
│   ├── student.model.js    # solo studentCode, classroomId, isActive (strict: 'throw')
│   ├── teachingMethod.model.js
│   ├── assessment.model.js
│   ├── assessmentResult.model.js  # incluye historial de correcciones
│   ├── lessonGuide.model.js       # guía + historial de generaciones (metodología y referencias)
│   └── aiUsageLog.model.js        # consumo de IA por docente
├── routes/
│   ├── index.js            # registra todas las rutas bajo /api
│   ├── health.routes.js
│   ├── auth.routes.js      # /api/auth/register, /login, /me
│   ├── teacher.routes.js   # /api/teachers/me
│   ├── catalog.routes.js   # /api/grades, /api/subjects, /api/topics (solo GET)
│   ├── classroom.routes.js # /api/classrooms y /api/classrooms/:id/students
│   ├── student.routes.js   # /api/students/:id
│   ├── methodology.routes.js
│   ├── assessment.routes.js
│   └── lessonGuide.routes.js
├── controllers/
│   ├── health.controller.js
│   ├── auth.controller.js
│   ├── teacher.controller.js
│   ├── catalog.controller.js
│   ├── classroom.controller.js
│   ├── student.controller.js
│   ├── methodology.controller.js
│   ├── assessment.controller.js  # también historial, progreso y rendimiento
│   └── lessonGuide.controller.js
├── services/
│   ├── health.service.js   # estado real de la BD (readyState + ping con timeout)
│   ├── auth.service.js     # registro y login
│   ├── teacher.service.js  # actualización del perfil propio
│   ├── catalog.service.js  # consultas del catálogo
│   ├── catalogImport.service.js  # validación de referencias e importación
│   ├── classroom.service.js      # findOwnedClassroom: comprobación de propiedad
│   ├── student.service.js
│   ├── methodology.service.js      # visibilidad, filtros y reglas de edición
│   ├── methodologySeed.service.js  # carga repetible de predeterminadas
│   ├── assessment.service.js       # evaluaciones, registro masivo y correcciones
│   ├── progress.service.js         # historial, progreso del estudiante y rendimiento del aula
│   ├── lessonGuide.service.js      # generación, regeneración, edición, cuotas
│   └── ai/
│       ├── index.js                # fábrica del proveedor (getAIProvider / setAIProvider)
│       ├── errors.js               # errores normalizados y tiempo de espera
│       ├── lessonGuidePrompt.js    # prompt del sistema y contexto (lista blanca, saneado)
│       └── providers/              # anthropic, openai-compatible, mock
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
│   ├── student.validator.js      # rechaza datos personales
│   ├── methodology.validator.js
│   ├── assessment.validator.js
│   ├── lessonGuide.validator.js  # peticiones HTTP de guías
│   └── lessonGuideContent.js     # validación del JSON de la guía (IA y docente)
└── utils/
    ├── AppError.js         # error controlado con código HTTP
    ├── performance.js      # cálculos puros: porcentaje, promedio, mediana, tendencia, umbral
    ├── password.js         # bcrypt (hash y comparación)
    └── jwt.js              # firma y verificación de tokens
scripts/
├── importCatalog.js        # CLI de importación del catálogo
└── seedMethodologies.js    # CLI de carga de metodologías predeterminadas
data/
├── catalog/
│   ├── README.md           # formato y reglas de los catálogos
│   └── sample.catalog.json # datos de PRUEBA (no oficiales)
└── methodologies/
    ├── README.md           # fuente y alcance del contenido
    └── mineduc-defaults.json
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
