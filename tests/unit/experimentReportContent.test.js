import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { validateReportInterpretation } from '../../src/validators/experimentReportContent.js'
import { buildReportContext, REPORT_SYSTEM_PROMPT, buildReportUserPrompt } from '../../src/services/ai/experimentReportPrompt.js'
import { buildComparativeReport } from '../../src/utils/experimentStats.js'
import { validInterpretation, REPORT_TEST_METHOD_ID } from '../helpers/aiFixtures.js'

const METHOD_ID = REPORT_TEST_METHOD_ID

const check = (content, opts = {}) => validateReportInterpretation(content, { allowedMethodIds: [METHOD_ID], ...opts })
const fields = (r) => r.errors.map((e) => e.field)

describe('Validación de la interpretación de la IA', () => {
    it('acepta una interpretación descriptiva bien formada', () => {
        assert.deepEqual(check(validInterpretation()).errors, [])
    })

    for (const [label, text] of [
        ['causalidad ("demuestra que")', 'Esto demuestra que el aprendizaje cooperativo funciona.'],
        ['causalidad ("causó una mejora")', 'El cambio de metodología causó una mejora del 10 %.'],
        ['superioridad', 'Mundo letrado es claramente superior a las demás.'],
        ['estilo predominante', 'El grupo tiene un estilo de aprendizaje predominante visual.'],
        ['etiqueta de estilo al grupo', 'Los estudiantes son kinestésicos.']
    ]) {
        it(`rechaza ${label}`, () => {
            const result = check(validInterpretation({ summary: text }))
            assert.deepEqual(fields(result), ['summary'])
        })
    }

    it('revisa el lenguaje también en recomendaciones y observaciones por período', () => {
        const result = check(validInterpretation({
            periodInsights: [{ period: 2, observation: 'El mes 2 prueba que visual es mejor que auditivo.' }],
            recommendations: [{ teachingMethodId: METHOD_ID, rationale: 'Es la mejor opción y es superior.' }]
        }))
        assert.deepEqual(fields(result).sort(), ['periodInsights[0].observation', 'recommendations[0].rationale'])
    })

    it('solo acepta metodologías del catálogo disponible, sin repetir', () => {
        const result = check(validInterpretation({
            recommendations: [
                { teachingMethodId: METHOD_ID, rationale: 'x' },
                { teachingMethodId: METHOD_ID, rationale: 'y' },
                { teachingMethodId: 'inventada', rationale: 'z' }
            ]
        }))
        assert.deepEqual(fields(result), ['recommendations[1].teachingMethodId', 'recommendations[2].teachingMethodId'])
    })

    it('exige al menos una limitación', () => {
        assert.deepEqual(fields(check(validInterpretation({ limitations: [] }))), ['limitations'])
    })

    it('con datos insuficientes exige decirlo en dataSufficiencyNote', () => {
        const { dataSufficiencyNote, ...withoutNote } = validInterpretation()
        assert.ok(dataSufficiencyNote)
        assert.deepEqual(check(withoutNote).errors, [])
        assert.deepEqual(fields(check(withoutNote, { insufficientData: true })), ['dataSufficiencyNote'])
    })

    it('rechaza campos y períodos inválidos', () => {
        const result = check(validInterpretation({ learningStyle: 'visual', periodInsights: [{ period: 5, observation: 'x' }] }))
        assert.deepEqual(fields(result).sort(), ['learningStyle', 'periodInsights[0].period'])
    })
})

describe('Contexto del reporte para la IA', () => {
    const report = buildComparativeReport({
        periods: [1, 2, 3, 4].map((index) => ({
            index, startDate: new Date(), endDate: new Date(), category: { code: 'visual', label: 'Visual' },
            methods: [{ id: 'm1', name: 'Mundo letrado' }], difficulty: 'media',
            assessments: [{ id: `a${index}`, title: 'Eval', assessmentDate: new Date(), assessmentType: 'formativa', subjectId: 's', subjectName: 'Mate', topicId: 't', maxScore: 20 }]
        })),
        results: [{ assessmentId: 'a1', studentId: 'COD-SECRETO', percentage: 80 }],
        cohortSize: 5,
        classification: 'vark'
    })
    const methods = [{ _id: { toString: () => METHOD_ID }, name: 'Mundo letrado', isDefault: true, description: 'x' }]

    it('solo contiene estadísticas agregadas', () => {
        const ctx = buildReportContext(report, methods)
        const text = JSON.stringify(ctx)
        assert.ok(!text.includes('COD-SECRETO'))
        assert.ok(!text.includes('studentId'))
        assert.ok(!text.includes('perAssessment'))
        assert.equal(ctx.periods[0].resultsCount, 1)
        assert.equal(ctx.periods[0].participationRate, 20)
        assert.deepEqual(ctx.availableMethodologies, [{ id: METHOD_ID, name: 'Mundo letrado', origin: 'predeterminada', description: 'x' }])
        assert.match(ctx.classification.note, /no estilos de aprendizaje/)
    })

    it('las reglas del sistema prohíben causalidad y estilos fijos y piden indicar datos insuficientes', () => {
        assert.match(REPORT_SYSTEM_PROMPT, /No afirmes que una metodología o categoría causó/)
        assert.match(REPORT_SYSTEM_PROMPT, /estilo de aprendizaje fijo, predominante/)
        assert.match(REPORT_SYSTEM_PROMPT, /datos insuficientes/)
        assert.match(REPORT_SYSTEM_PROMPT, /el docente decide/)
        assert.match(REPORT_SYSTEM_PROMPT, /temas, dificultad, cantidad de evaluaciones y estudiantes/)
    })

    it('rechaza contextos demasiado grandes', () => {
        assert.throws(() => buildReportUserPrompt(buildReportContext(report, methods), { maxInputChars: 500 }), /demasiados datos/)
    })
})
