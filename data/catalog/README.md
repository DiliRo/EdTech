# Catálogos curriculares

Los grados, materias y temas **no se crean desde la API**: se importan desde archivos JSON
validados con:

```bash
npm run catalog:import -- data/catalog/<archivo>.json --dry-run   # solo valida
npm run catalog:import -- data/catalog/<archivo>.json             # importa
```

## Archivos

| Archivo               | Contenido |
|-----------------------|-----------|
| `sample.catalog.json` | **Datos de PRUEBA** para desarrollo. Todo su contenido está marcado con `[PRUEBA]` y se guarda con `isSample: true`. **No es contenido del CNB.** |

Todavía no hay un catálogo oficial. Para crearlo hay que transcribir las competencias e
indicadores **tal como aparecen** en los documentos del CNB del Ministerio de Educación,
indicando el documento, la versión y la página o URL de cada tema. No se deben redactar ni
completar competencias o indicadores que no estén en el documento.

## Formato

```jsonc
{
  "metadata": {
    "source": "cnb",              // "cnb" (oficial) o "sample" (prueba)
    "level": "primaria",          // opcional, por defecto "primaria"
    "document": "Nombre del documento del CNB",   // obligatorio si source = "cnb"
    "version": "Año o edición",                    // obligatorio si source = "cnb"
    "url": "https://..."                           // opcional
  },
  "grades": [{ "number": 1, "name": "Primer grado" }],
  "subjects": [
    { "code": "matematicas", "name": "...", "description": "...", "grades": [1, 2, 3] }
  ],
  "topics": [
    {
      "code": "codigo-del-tema",
      "name": "...",
      "description": "...",
      "grade": 1,
      "subject": "matematicas",
      "competencies": [{ "code": "1", "description": "texto literal del CNB" }],
      "achievementIndicators": [{ "code": "1.1", "competencyCode": "1", "description": "texto literal del CNB" }],
      "curriculumReference": { "document": "...", "version": "...", "area": "...", "page": "12", "url": "https://..." }
    }
  ]
}
```

## Reglas que aplica el importador

- Códigos en minúsculas, números y guiones (`matematicas`, `fracciones-1`).
- Grados de primaria del 1 al 6. Un tema solo puede asignarse a un grado que su materia incluya.
- `source: "cnb"`: exige `document` y `version` en `metadata`, y página o URL en cada tema. No admite la marca `[PRUEBA]`.
- `source: "sample"`: nombres, descripciones, competencias e indicadores deben empezar con `[PRUEBA]`.
- Un catálogo de prueba **nunca** reemplaza materias o temas oficiales.
- Si hay cualquier error no se escribe nada. Volver a importar el mismo archivo actualiza los registros (no los duplica).
- En producción, importar datos de prueba exige `--allow-sample`.
