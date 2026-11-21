import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Types } from 'mongoose'

import Grade from '../../src/models/grade.model.js'
import Subject from '../../src/models/subject.model.js'
import Topic from '../../src/models/topic.model.js'

const source = { type: 'sample', importedAt: new Date() }
const indexKeys = (model) => model.schema.indexes().map(([fields, options]) => ({ fields, unique: !!options.unique }))

describe('Modelo Grade', () => {
    it('acepta grados de primaria del 1 al 6', async () => {
        for (const number of [1, 6]) {
            await new Grade({ number, name: 'x', level: 'primaria' }).validate()
        }
    })

    it('rechaza grados fuera de rango y niveles no soportados', async () => {
        await assert.rejects(new Grade({ number: 7, name: 'x' }).validate(), /fuera del rango/)
        await assert.rejects(new Grade({ number: 1.5, name: 'x' }).validate(), /fuera del rango/)
        await assert.rejects(new Grade({ number: 1, name: 'x', level: 'basico' }).validate(), /Nivel/)
    })

    it('tiene índice único por nivel y número', () => {
        assert.deepEqual(indexKeys(Grade), [{ fields: { level: 1, number: 1 }, unique: true }])
    })
})

describe('Modelo Subject', () => {
    it('exige al menos un grado, código válido y procedencia', async () => {
        await assert.rejects(new Subject({ code: 'a', name: 'A', grades: [], source }).validate(), /al menos un grado/)
        await assert.rejects(
            new Subject({ code: 'Con Espacios', name: 'A', grades: [new Types.ObjectId()], source }).validate(),
            /Código inválido/
        )
        await assert.rejects(new Subject({ code: 'a', name: 'A', grades: [new Types.ObjectId()] }).validate(), /source/)
    })

    it('tiene índices para código único y filtro por grado', () => {
        assert.deepEqual(indexKeys(Subject), [
            { fields: { code: 1 }, unique: true },
            { fields: { grades: 1, name: 1 }, unique: false }
        ])
    })
})

describe('Modelo Topic', () => {
    const gradeDoc = new Grade({ number: 2, name: 'Segundo grado', level: 'primaria' })
    const subjectDoc = new Subject({ code: 'prueba-mate', name: '[PRUEBA] Mate', grades: [gradeDoc._id], isSample: true, source })

    // Asignar documentos a una referencia equivale a tenerla poblada.
    const buildTopic = (overrides = {}) => {
        const topic = new Topic({
            code: 'tema-1',
            name: '[PRUEBA] Tema',
            description: '[PRUEBA] desc',
            grade: gradeDoc._id,
            subject: subjectDoc._id,
            competencies: [{ code: 'P1', description: '[PRUEBA] c' }],
            achievementIndicators: [{ code: 'P1.1', competencyCode: 'P1', description: '[PRUEBA] i' }],
            curriculumReference: { document: 'Ninguno' },
            isSample: true,
            source,
            ...overrides
        })
        if (!overrides.grade) topic.grade = gradeDoc
        if (!overrides.subject) topic.subject = subjectDoc
        return topic
    }

    it('tiene índices para código único por materia y grado y para filtros', () => {
        assert.deepEqual(indexKeys(Topic), [
            { fields: { subject: 1, grade: 1, code: 1 }, unique: true },
            { fields: { grade: 1, subject: 1, name: 1 }, unique: false }
        ])
    })

    it('exige descripción en competencias e indicadores', async () => {
        const topic = buildTopic({ competencies: [{ code: '1' }] })
        await assert.rejects(topic.validate(), /description/)
    })

    describe('toAIContext', () => {
        it('marca los datos de prueba con dataStatus y advertencia', () => {
            const context = buildTopic().toAIContext()
            assert.equal(context.dataStatus, 'sample')
            assert.match(context.disclaimer, /PRUEBA/)
        })

        it('marca los datos oficiales sin advertencia', () => {
            const context = buildTopic({ isSample: false, source: { ...source, type: 'cnb' } }).toAIContext()
            assert.equal(context.dataStatus, 'official')
            assert.equal(context.disclaimer, null)
        })

        it('incluye tema, grado, materia, competencias, indicadores y referencia', () => {
            const context = buildTopic().toAIContext()
            assert.deepEqual(Object.keys(context).sort(), [
                'achievementIndicators', 'competencies', 'curriculumReference', 'dataStatus',
                'disclaimer', 'grade', 'subject', 'topic'
            ])
            assert.equal(context.topic.code, 'tema-1')
            assert.deepEqual(context.grade, { number: 2, name: 'Segundo grado', level: 'primaria' })
            assert.deepEqual(context.subject, { code: 'prueba-mate', name: '[PRUEBA] Mate' })
            assert.deepEqual(context.competencies, [{ code: 'P1', description: '[PRUEBA] c' }])
            assert.deepEqual(context.achievementIndicators, [{ code: 'P1.1', competencyCode: 'P1', description: '[PRUEBA] i' }])
            assert.equal(context.curriculumReference.document, 'Ninguno')
        })

        it('deja grado y materia en null si no están poblados', () => {
            const context = buildTopic({ grade: new Types.ObjectId(), subject: new Types.ObjectId() }).toAIContext()
            assert.equal(context.grade, null)
            assert.equal(context.subject, null)
        })

        it('se puede serializar a JSON', () => {
            assert.doesNotThrow(() => JSON.stringify(buildTopic().toAIContext()))
        })
    })
})
