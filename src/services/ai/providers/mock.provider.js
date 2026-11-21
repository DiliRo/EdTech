/**
 * Proveedor simulado: no llama a ningún servicio externo. Devuelve una guía de
 * EJEMPLO, válida para el esquema, construida a partir del contexto recibido.
 * Sirve para desarrollar el frontend sin clave de API y como base de pruebas.
 */
/** Interpretación de EJEMPLO para el reporte de seguimiento (respeta las reglas del validador). */
const mockReport = (context) => {
    const insufficient = !context.overall?.canCompare || context.periods.some((p) => !p.dataSufficient)
    const firstMethod = context.availableMethodologies?.[0]
    const report = {
        summary: '[EJEMPLO] Resumen generado por el proveedor simulado a partir de las estadísticas agregadas.',
        periodInsights: context.periods.filter((p) => p.resultsCount > 0).slice(0, 4).map((p) => ({
            period: p.period,
            observation: `[EJEMPLO] En el período ${p.period} se registraron ${p.resultsCount} calificaciones.`
        })),
        limitations: ['[EJEMPLO] Los períodos trabajaron temas distintos; las diferencias de promedio son descriptivas.'],
        recommendations: firstMethod
            ? [{ teachingMethodId: firstMethod.id, rationale: '[EJEMPLO] Sugerencia orientativa del proveedor simulado.' }]
            : [],
        nextSteps: ['[EJEMPLO] Registrar la dificultad de los temas en cada período.'],
        dataSufficiencyNote: insufficient
            ? '[EJEMPLO] Hay períodos con datos insuficientes; interprétalos con cautela.'
            : '[EJEMPLO] Los períodos cumplen los mínimos de datos.'
    }
    return { text: JSON.stringify(report), usage: { inputTokens: 0, outputTokens: 0 }, model: 'mock' }
}

export const createMockProvider = () => ({
    name: 'mock',
    model: 'mock',

    async generate({ context }) {
        if (Array.isArray(context?.periods)) return mockReport(context)
        const minutes = context?.durationMinutes ?? 45
        const opening = Math.max(5, Math.round(minutes * 0.2))
        const closing = Math.max(5, Math.round(minutes * 0.2))
        const development = Math.max(5, minutes - opening - closing)
        const topic = context?.topic?.name ?? 'el tema de la clase'
        const competencyCodes = (context?.topic?.competencies ?? []).map((c) => c.code).filter(Boolean).slice(0, 1)

        const guide = {
            title: `[EJEMPLO] Guía: ${topic}`,
            objectives: [`[EJEMPLO] Que los estudiantes expliquen con sus palabras ${topic}.`],
            opening: { durationMinutes: opening, activities: [{ description: '[EJEMPLO] Conversación inicial sobre lo que ya saben.' }] },
            development: { durationMinutes: development, activities: [{ description: '[EJEMPLO] Actividad guiada aplicando la metodología seleccionada.' }] },
            closing: { durationMinutes: closing, activities: [{ description: '[EJEMPLO] Puesta en común de lo aprendido.' }] },
            materials: ['[EJEMPLO] Pizarrón y marcadores'],
            shortAssessment: {
                instructions: '[EJEMPLO] Responde de forma breve.',
                items: [{ question: `[EJEMPLO] ¿Qué aprendiste sobre ${topic}?`, objectiveIndex: 1 }]
            },
            teacherRecommendations: ['[EJEMPLO] Generado por el proveedor simulado: configura AI_PROVIDER para usar un proveedor real.'],
            curriculumGaps: [],
            competenciesUsed: competencyCodes
        }
        const text = JSON.stringify(guide)
        return { text, usage: { inputTokens: 0, outputTokens: 0 }, model: 'mock' }
    }
})
