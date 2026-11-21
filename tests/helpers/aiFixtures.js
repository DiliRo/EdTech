/**
 * Proveedor de IA simulado para pruebas. Cada llamada usa la siguiente respuesta de la lista:
 *  - string            → texto devuelto por la IA
 *  - object            → se serializa a JSON
 *  - Error             → se lanza
 *  - function(args)    → se ejecuta (puede devolver cualquiera de las anteriores)
 * Registra cada llamada en `calls` para revisar qué se envió.
 */
export const fakeProvider = (responses = [], { name = 'fake', model = 'fake-model-1' } = {}) => {
    const queue = [...responses]
    const calls = []
    return {
        name,
        model,
        calls,
        async generate(args) {
            calls.push(args)
            let next = queue.length > 1 ? queue.shift() : queue[0]
            if (typeof next === 'function') next = await next(args)
            if (next instanceof Error) throw next
            const text = typeof next === 'string' ? next : JSON.stringify(next)
            return { text, usage: { inputTokens: 100, outputTokens: 200 }, model }
        }
    }
}

/** Respuesta de IA válida para una clase de 45 minutos. */
export const validAIGuide = (overrides = {}) => ({
    title: 'Sumas con llevadas',
    objectives: ['Resolver sumas de dos cifras con llevadas.', 'Explicar el procedimiento a un compañero.'],
    opening: { durationMinutes: 10, activities: [{ description: 'Conversar sobre situaciones de compra en el mercado.' }] },
    development: { durationMinutes: 25, activities: [{ description: 'Resolver sumas con material concreto en parejas.' }, { description: 'Compartir procedimientos.' }] },
    closing: { durationMinutes: 10, activities: [{ description: 'Puesta en común y repaso.' }] },
    materials: ['Semillas o tapitas', 'Cuaderno'],
    shortAssessment: {
        instructions: 'Resuelve y explica.',
        items: [
            { question: 'Resuelve 27 + 15.', objectiveIndex: 1, expectedAnswer: '42' },
            { question: 'Explica cómo sumaste.', objectiveIndex: 2 }
        ]
    },
    teacherRecommendations: ['Adapta los ejemplos a productos de la comunidad.'],
    curriculumGaps: [],
    competenciesUsed: [],
    ...overrides
})

/** Respuesta HTTP simulada para probar proveedores sin red. */
export const fakeFetchResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
        if (body instanceof Error) throw body
        return body
    }
})

export const REPORT_TEST_METHOD_ID = '6b01e8953a62794870353e79'

/** Interpretación válida de un reporte de seguimiento (lenguaje descriptivo, sin causalidad). */
export const validInterpretation = (overrides = {}) => ({
    summary: 'En los cuatro meses se observó un promedio estable, con temas de dificultad distinta.',
    periodInsights: [{ period: 1, observation: 'Se registraron dos evaluaciones con participación alta.' }],
    limitations: ['Los temas variaron entre meses, por lo que los promedios no son directamente comparables.'],
    recommendations: [{ teachingMethodId: REPORT_TEST_METHOD_ID, rationale: 'Podría complementar el trabajo en equipo observado en el tercer mes.' }],
    nextSteps: ['Registrar la dificultad de los temas.'],
    dataSufficiencyNote: 'Todos los períodos cumplen los mínimos.',
    ...overrides
})
