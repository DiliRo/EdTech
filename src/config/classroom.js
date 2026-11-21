/**
 * Reglas de aulas y estudiantes. Fuente única para modelos y validadores.
 */

/**
 * Código visible del estudiante (p. ej. `A01`, `MAT-03`, `EST-12`).
 * Letras sin tilde, números, guion y guion bajo; empieza con letra o número; máximo 20.
 * Se guarda en MAYÚSCULAS, así `a01` y `A01` son el mismo código.
 */
export const STUDENT_CODE_REGEX = /^[A-Z0-9][A-Z0-9_-]{0,19}$/
export const STUDENT_CODE_MAX = 20

export const CLASSROOM_NAME_MAX = 80
export const SECTION_MAX = 10
export const SCHOOL_YEAR_RANGE = Object.freeze({ min: 2000, max: 2100 })
export const MAX_SUBJECTS_PER_CLASSROOM = 20

/** Filtro de estado para listados: activos, archivados o todos. */
export const STATUS_FILTERS = Object.freeze(['active', 'archived', 'all'])

export const statusToFilter = (status = 'active') => {
    if (status === 'archived') return { isActive: false }
    if (status === 'all') return {}
    return { isActive: true }
}
