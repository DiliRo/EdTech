import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { extractJson, validateGuideContent } from '../../src/validators/lessonGuideContent.js'
import { validAIGuide } from '../helpers/aiFixtures.js'

const fields = (result) => result.errors.map((e) => e.field)
const ai = (content, opts = {}) => validateGuideContent(content, { source: 'ai', durationMinutes: 45, allowedCompetencyCodes: ['1', '2'], ...opts })

describe('extractJson', () => {
    it('lee JSON puro, con bloque ```json``` o con texto alrededor', () => {
        assert.deepEqual(extractJson('{"a":1}'), { a: 1 })
        assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 })
        assert.deepEqual(extractJson('Aquí está la guía: {"a":1} ¡Éxito!'), { a: 1 })
    })

    it('devuelve null si no hay un objeto JSON válido', () => {
        for (const text of ['', 'sin json', '{"a":', '[1,2]', null, 42]) {
            assert.equal(extractJson(text), null, String(text))
        }
    })
})

describe('validateGuideContent (respuesta de la IA)', () => {
    it('acepta una guía completa y bien formada', () => {
        assert.deepEqual(ai(validAIGuide()).errors, [])
    })

    it('exige todas las secciones: objetivos, inicio, desarrollo, cierre, materiales, evaluación y recomendaciones', () => {
        const result = ai({})
        for (const field of ['title', 'objectives', 'opening', 'development', 'closing', 'materials', 'shortAssessment', 'teacherRecommendations']) {
            assert.ok(fields(result).includes(field), field)
        }
    })

    it('rechaza competencias que no existen en el tema (inventadas)', () => {
        const result = ai(validAIGuide({ competenciesUsed: ['1', '7.3'] }))
        assert.deepEqual(fields(result), ['competenciesUsed[1]'])
        assert.match(result.errors[0].message, /inventadas/)
    })

    it('si el tema no tiene competencias, la IA no puede citar ninguna', () => {
        const result = ai(validAIGuide({ competenciesUsed: ['1'] }), { allowedCompetencyCodes: [] })
        assert.deepEqual(fields(result), ['competenciesUsed[0]'])
    })

    it('cada pregunta de la evaluación debe apuntar a un objetivo existente', () => {
        const guide = validAIGuide()
        guide.shortAssessment.items[1].objectiveIndex = 3 // solo hay 2 objetivos
        guide.shortAssessment.items.push({ question: 'Sin objetivo' })
        const result = ai(guide)
        assert.deepEqual(fields(result), ['shortAssessment.items[1].objectiveIndex', 'shortAssessment.items[2].objectiveIndex'])
    })

    it('la suma de las fases no puede superar la duración de la clase', () => {
        const guide = validAIGuide({ development: { durationMinutes: 40, activities: [{ description: 'x' }] } })
        const result = ai(guide)
        assert.deepEqual(fields(result), ['durationMinutes'])
        assert.match(result.errors[0].message, /60 minutos y superan los 45/)
    })

    it('rechaza campos desconocidos en cualquier nivel', () => {
        const guide = validAIGuide({ nota: 'x' })
        guide.opening.extra = 1
        guide.opening.activities[0].durationMinutes = 5
        guide.shortAssessment.items[0].puntos = 5
        assert.deepEqual(fields(ai(guide)).sort(), [
            'nota', 'opening.activities[0].durationMinutes', 'opening.extra', 'shortAssessment.items[0].puntos'
        ])
    })

    it('limita la cantidad y longitud de los textos', () => {
        const guide = validAIGuide({
            title: 'x'.repeat(151),
            objectives: Array.from({ length: 7 }, () => 'Objetivo'),
            materials: ['y'.repeat(151)]
        })
        const result = ai(guide)
        assert.ok(fields(result).includes('title'))
        assert.ok(fields(result).includes('objectives'))
        assert.ok(fields(result).includes('materials[0]'))
    })

    it('rechaza tipos incorrectos', () => {
        const guide = validAIGuide({ objectives: 'un objetivo', materials: [1] })
        guide.closing.durationMinutes = '10'
        const result = ai(guide)
        assert.ok(fields(result).includes('objectives'))
        assert.ok(fields(result).includes('materials[0]'))
        assert.ok(fields(result).includes('closing.durationMinutes'))
    })
})

describe('validateGuideContent (guía del docente)', () => {
    it('no acepta competenciesUsed: solo la IA las declara', () => {
        const { competenciesUsed, ...guide } = validAIGuide()
        assert.ok(competenciesUsed)
        assert.deepEqual(validateGuideContent(guide, { source: 'manual', durationMinutes: 45 }).errors, [])
        assert.deepEqual(fields(validateGuideContent(validAIGuide(), { source: 'manual' })), ['competenciesUsed'])
    })

    it('las recomendaciones son opcionales para el docente', () => {
        const { competenciesUsed, curriculumGaps, teacherRecommendations, ...guide } = validAIGuide()
        assert.equal(validateGuideContent(guide, { source: 'manual' }).valid, true)
    })
})
