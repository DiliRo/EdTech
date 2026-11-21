/**
 * Constantes del catálogo curricular. Fuente única para modelos, validadores e importador.
 */

/** Niveles educativos soportados. Por ahora la plataforma cubre solo primaria. */
export const EDUCATION_LEVELS = Object.freeze(['primaria'])
export const DEFAULT_LEVEL = 'primaria'

/** Rango de grados por nivel (primaria en Guatemala: 1.º a 6.º). */
export const GRADE_RANGE = Object.freeze({
    primaria: Object.freeze({ min: 1, max: 6 })
})

/**
 * Origen de los datos del catálogo:
 *  - `cnb`    datos tomados de documentos oficiales del Currículo Nacional Base
 *  - `sample` datos de PRUEBA, inventados solo para desarrollo; no son contenido oficial
 */
export const CATALOG_SOURCES = Object.freeze(['cnb', 'sample'])

/** Todo texto de un catálogo de prueba debe empezar con esta marca para que se vea en la interfaz. */
export const SAMPLE_PREFIX = '[PRUEBA]'

/** Códigos de materias y temas: minúsculas, números y guiones (p. ej. `matematicas`, `fracciones-1`). */
export const CODE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const TEXT_LIMITS = Object.freeze({
    code: 60,
    name: 150,
    description: 2000,
    item: 1000,
    reference: 300
})
