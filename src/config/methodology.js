/**
 * Reglas del catálogo de metodologías. Fuente única para modelo, validadores y carga inicial.
 */

/**
 * Preferencias o modos de participación que una metodología PUEDE favorecer.
 *
 * Importante: son descriptivas, no diagnósticas. edTech no asume que un "estilo de
 * aprendizaje" determine el rendimiento, por eso una metodología nunca se asigna a
 * una sola preferencia (ver MIN_PREFERENCES_WHEN_SET).
 */
export const LEARNING_PREFERENCES = Object.freeze([
    Object.freeze({ code: 'visual', label: 'Visual' }),
    Object.freeze({ code: 'auditiva', label: 'Auditiva y oral' }),
    Object.freeze({ code: 'kinestesica', label: 'Kinestésica y manipulativa' }),
    Object.freeze({ code: 'lectoescritura', label: 'Lectura y escritura' }),
    Object.freeze({ code: 'colaborativa', label: 'Colaborativa' }),
    Object.freeze({ code: 'individual', label: 'Individual y reflexiva' })
])

export const LEARNING_PREFERENCE_CODES = Object.freeze(LEARNING_PREFERENCES.map((p) => p.code))

/** Si se indican preferencias, deben ser al menos dos: ninguna metodología es exclusiva de un estilo. */
export const MIN_PREFERENCES_WHEN_SET = 2

export const DURATION_RANGE = Object.freeze({ min: 5, max: 600 }) // minutos

export const METHOD_LIMITS = Object.freeze({
    name: 120,
    description: 3000,
    item: 1000,
    title: 150,
    listMax: 30,
    referenceText: 300,
    notes: 1500,
    compatibleMax: 30
})

/** Clave estable de las metodologías predeterminadas (para cargas repetibles). */
export const DEFAULT_KEY_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const METHOD_SCOPES = Object.freeze(['all', 'default', 'mine'])
