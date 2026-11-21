import dotenv from 'dotenv'

dotenv.config({ quiet: true })

/**
 * Clasificaciones pedagógicas para etiquetar el ÉNFASIS DE ENSEÑANZA de cada período.
 *
 * Reglas (ver docs/clasificaciones-pedagogicas.md):
 *  - Cada experimento usa UNA sola clasificación, fijada al crearlo; nunca se mezclan.
 *  - Las categorías describen cómo se planificó la enseñanza del período, NO el estilo de
 *    aprendizaje de los estudiantes. Los resultados no identifican estilos fijos ni predominantes.
 *  - Para agregar una clasificación basta con añadirla aquí, con su fuente.
 */
export const CLASSIFICATIONS = Object.freeze({
    vark: Object.freeze({
        key: 'vark',
        name: 'VARK',
        description: 'Modalidades sensoriales de presentación de la información.',
        source: 'Fleming, N. D. y Mills, C. (1992). Not Another Inventory, Rather a Catalyst for Reflection. To Improve the Academy, 11.',
        categories: Object.freeze([
            Object.freeze({ code: 'visual', label: 'Visual', description: 'Énfasis en gráficos, esquemas, mapas y diagramas.' }),
            Object.freeze({ code: 'auditivo', label: 'Auditivo', description: 'Énfasis en explicación oral, diálogo y discusión.' }),
            Object.freeze({ code: 'lectoescritura', label: 'Lectura y escritura', description: 'Énfasis en textos, listas y producción escrita.' }),
            Object.freeze({ code: 'kinestesico', label: 'Kinestésico', description: 'Énfasis en experiencias concretas, práctica y manipulación.' })
        ])
    }),
    'honey-alonso': Object.freeze({
        key: 'honey-alonso',
        name: 'Honey-Alonso (CHAEA)',
        description: 'Fases del ciclo de aprendizaje a partir de la experiencia.',
        source: 'Alonso, C. M., Gallego, D. J. y Honey, P. (1994). Los estilos de aprendizaje: procedimientos de diagnóstico y mejora. Ediciones Mensajero.',
        categories: Object.freeze([
            Object.freeze({ code: 'activo', label: 'Activo', description: 'Énfasis en experiencias nuevas, retos y participación directa.' }),
            Object.freeze({ code: 'reflexivo', label: 'Reflexivo', description: 'Énfasis en observar, recoger datos y analizar antes de concluir.' }),
            Object.freeze({ code: 'teorico', label: 'Teórico', description: 'Énfasis en modelos, conceptos y razonamiento lógico.' }),
            Object.freeze({ code: 'pragmatico', label: 'Pragmático', description: 'Énfasis en la aplicación práctica de las ideas.' })
        ])
    })
})

export const CLASSIFICATION_KEYS = Object.freeze(Object.keys(CLASSIFICATIONS))

/** Clasificación que se usa al crear experimentos si no se indica otra. */
export const DEFAULT_CLASSIFICATION = CLASSIFICATION_KEYS.includes(process.env.PEDAGOGICAL_CLASSIFICATION)
    ? process.env.PEDAGOGICAL_CLASSIFICATION
    : 'vark'

export const categoryCodes = (key) => CLASSIFICATIONS[key]?.categories.map((c) => c.code) ?? []
export const findCategory = (key, code) => CLASSIFICATIONS[key]?.categories.find((c) => c.code === code) ?? null

// ── Experimentos ─────────────────────────────────────────────

export const EXPERIMENT_PERIODS = 4
export const EXPERIMENT_STATUSES = Object.freeze(['planned', 'active', 'completed', 'cancelled'])
export const DIFFICULTY_LEVELS = Object.freeze(['baja', 'media', 'alta'])

/**
 * Mínimos para considerar que un período tiene datos suficientes para describirlo.
 * Por debajo de esto el backend lo marca como "datos insuficientes".
 */
export const SUFFICIENCY = Object.freeze({
    minAssessments: 2,
    minResults: 10,
    minParticipationRate: 60 // %
})

/** Rangos de porcentaje de logro para la distribución de calificaciones ([min, max)). */
export const SCORE_BANDS = Object.freeze([
    Object.freeze({ key: '0-39', min: 0, max: 40 }),
    Object.freeze({ key: '40-59', min: 40, max: 60 }),
    Object.freeze({ key: '60-79', min: 60, max: 80 }),
    Object.freeze({ key: '80-100', min: 80, max: 100.0001 })
])

/** Umbrales para advertir que los períodos no son comparables directamente. */
export const COMPARABILITY = Object.freeze({
    assessmentsRatio: 2, // un período tiene el doble (o más) de evaluaciones que otro
    participationGap: 20 // puntos porcentuales de diferencia en participación
})

export const EXPERIMENT_DISCLAIMER =
    'Estadísticas descriptivas para apoyar la reflexión docente. Las diferencias entre períodos pueden deberse a ' +
    'los temas, la dificultad, la cantidad de evaluaciones o de estudiantes participantes, entre otros factores; ' +
    'no demuestran que una metodología sea superior ni identifican estilos de aprendizaje fijos o predominantes. ' +
    'Las recomendaciones son orientativas: el docente decide si las aplica.'
