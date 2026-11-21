/**
 * Proveedor simulado: no llama a ningún servicio externo. Devuelve una guía de
 * EJEMPLO, válida para el esquema, construida a partir del contexto recibido.
 * Sirve para desarrollar el frontend sin clave de API y como base de pruebas.
 */
export const createMockProvider = () => ({
    name: 'mock',
    model: 'mock',

    async generate({ context }) {
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
