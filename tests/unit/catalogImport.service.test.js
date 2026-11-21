import { describe, it, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Types } from 'mongoose'

import Grade from '../../src/models/grade.model.js'
import Subject from '../../src/models/subject.model.js'
import Topic from '../../src/models/topic.model.js'
import { importCatalog, CatalogImportError } from '../../src/services/catalogImport.service.js'
import { queryChain } from '../helpers/queryChain.js'

const sampleFile = JSON.parse(await readFile(new URL('../../data/catalog/sample.catalog.json', import.meta.url), 'utf8'))
const clone = (value) => structuredClone(value)
const now = new Date('2026-11-21T00:00:00Z')

/**
 * Simula la BD del catálogo. `grades`, `subjects` y `topics` son lo que ya existe;
 * cada bulkWrite queda registrado en `writes` y los upserts se agregan a lo existente.
 */
const fakeDb = ({ grades = [], subjects = [], topics = [] } = {}) => {
    const state = { grades: [...grades], subjects: [...subjects], topics: [...topics] }
    const writes = { Grade: [], Subject: [], Topic: [] }

    mock.method(Grade, 'find', (filter) =>
        queryChain(() => state.grades.filter((g) => filter.number.$in.includes(g.number))))
    mock.method(Subject, 'find', (filter) =>
        queryChain(() => state.subjects.filter((s) => filter.code.$in.includes(s.code))))
    mock.method(Topic, 'find', () => queryChain(() => state.topics))

    mock.method(Grade, 'bulkWrite', async (ops) => {
        writes.Grade.push(...ops)
        for (const { updateOne } of ops) {
            if (!state.grades.some((g) => g.number === updateOne.filter.number)) {
                state.grades.push({ _id: new Types.ObjectId(), number: updateOne.filter.number, level: 'primaria' })
            }
        }
        return { upsertedCount: ops.length, modifiedCount: 0 }
    })
    mock.method(Subject, 'bulkWrite', async (ops) => {
        writes.Subject.push(...ops)
        for (const { updateOne } of ops) {
            if (!state.subjects.some((s) => s.code === updateOne.filter.code)) {
                state.subjects.push({ _id: new Types.ObjectId(), code: updateOne.filter.code, grades: [], isSample: true })
            }
        }
        return { upsertedCount: ops.length, modifiedCount: 0 }
    })
    mock.method(Topic, 'bulkWrite', async (ops) => {
        writes.Topic.push(...ops)
        return { upsertedCount: ops.length, modifiedCount: 0 }
    })

    return { state, writes }
}

const expectImportError = async (promise, check) => {
    await assert.rejects(promise, (err) => {
        assert.ok(err instanceof CatalogImportError)
        check?.(err.errors)
        return true
    })
}

describe('importCatalog', () => {
    afterEach(() => mock.restoreAll())

    it('importa el catálogo de prueba: grados → materias → temas', async () => {
        const { writes } = fakeDb()
        const summary = await importCatalog(clone(sampleFile), { now })

        assert.equal(writes.Grade.length, 6)
        assert.equal(writes.Subject.length, 2)
        assert.equal(writes.Topic.length, 3)
        assert.equal(summary.source, 'sample')
        assert.equal(summary.topics.created, 3)

        const subjectUpdate = writes.Subject[0].updateOne.update.$set
        assert.equal(subjectUpdate.isSample, true)
        assert.deepEqual(subjectUpdate.source, { type: 'sample', document: undefined, version: undefined, url: undefined, importedAt: now })
        assert.equal(subjectUpdate.grades.length, 3)
        assert.ok(subjectUpdate.grades.every((g) => g instanceof Types.ObjectId))

        const topicOp = writes.Topic[0].updateOne
        assert.equal(topicOp.upsert, true)
        assert.equal(topicOp.filter.code, 'tema-ejemplo-1')
        assert.ok(topicOp.filter.subject instanceof Types.ObjectId)
        assert.ok(topicOp.filter.grade instanceof Types.ObjectId)
        assert.equal(topicOp.update.$set.isSample, true)
    })

    it('usa upsert para que reimportar actualice en vez de duplicar', async () => {
        const { writes } = fakeDb()
        await importCatalog(clone(sampleFile), { now })
        assert.ok([...writes.Grade, ...writes.Subject, ...writes.Topic].every((op) => op.updateOne.upsert === true))
    })

    it('dryRun valida sin escribir', async () => {
        const { writes } = fakeDb()
        const summary = await importCatalog(clone(sampleFile), { dryRun: true })

        assert.equal(summary.dryRun, true)
        assert.equal(writes.Grade.length + writes.Subject.length + writes.Topic.length, 0)
        assert.equal(summary.topics.received, 3)
    })

    it('no toca la BD si el archivo es inválido', async () => {
        const { writes } = fakeDb()
        const data = clone(sampleFile)
        data.topics[0].competencies[0].description = 'sin marca'

        await expectImportError(importCatalog(data), (errors) => {
            assert.ok(errors.some((e) => e.path === 'topics[0].competencies[0].description'))
        })
        assert.equal(Grade.find.mock.callCount(), 0)
        assert.equal(writes.Grade.length, 0)
    })

    it('rechaza materias que no existen ni vienen en el archivo', async () => {
        fakeDb()
        const data = { metadata: { source: 'sample' }, topics: [clone(sampleFile.topics[0])] }
        data.topics[0].subject = 'no-existe'

        await expectImportError(importCatalog(data), (errors) => {
            assert.ok(errors.some((e) => e.path === 'topics[0].subject' && /no existe/.test(e.message)))
        })
    })

    it('rechaza grados que no existen ni vienen en el archivo', async () => {
        fakeDb()
        const data = clone(sampleFile)
        delete data.grades

        await expectImportError(importCatalog(data), (errors) => {
            assert.ok(errors.some((e) => /El grado 1 no existe/.test(e.message)))
        })
    })

    it('valida el grado de un tema contra los grados guardados de su materia', async () => {
        const grade1 = { _id: new Types.ObjectId(), number: 1, level: 'primaria' }
        const grade2 = { _id: new Types.ObjectId(), number: 2, level: 'primaria' }
        fakeDb({
            grades: [grade1, grade2],
            subjects: [{ _id: new Types.ObjectId(), code: 'prueba-matematicas', grades: [grade1._id], isSample: true }]
        })
        const data = { metadata: { source: 'sample' }, topics: [clone(sampleFile.topics[1])] } // grado 2

        await expectImportError(importCatalog(data), (errors) => {
            assert.ok(errors.some((e) => /no incluye el grado 2/.test(e.message)))
        })
    })

    it('un catálogo de prueba no puede reemplazar una materia oficial', async () => {
        fakeDb({ subjects: [{ _id: new Types.ObjectId(), code: 'prueba-matematicas', grades: [], isSample: false }] })

        await expectImportError(importCatalog(clone(sampleFile)), (errors) => {
            assert.ok(errors.some((e) => e.path === 'subjects[0].code' && /oficial/.test(e.message)))
        })
    })

    it('un catálogo de prueba no puede reemplazar un tema oficial', async () => {
        const { state } = fakeDb()
        state.topics.push({
            code: 'tema-ejemplo-1',
            isSample: false,
            subject: { code: 'prueba-matematicas' },
            grade: { number: 1, level: 'primaria' }
        })

        await expectImportError(importCatalog(clone(sampleFile)), (errors) => {
            assert.ok(errors.some((e) => e.path === 'topics[0].code' && /oficial/.test(e.message)))
        })
    })

    it('un tema oficial no puede pertenecer a una materia de prueba', async () => {
        const grade1 = { _id: new Types.ObjectId(), number: 1, level: 'primaria' }
        fakeDb({
            grades: [grade1],
            subjects: [{ _id: new Types.ObjectId(), code: 'prueba-matematicas', grades: [grade1._id], isSample: true }]
        })
        const data = {
            metadata: { source: 'cnb', document: 'Documento X', version: '2026' },
            topics: [{
                code: 'tema-a',
                name: 'Tema A',
                grade: 1,
                subject: 'prueba-matematicas',
                curriculumReference: { page: 3 }
            }]
        }

        await expectImportError(importCatalog(data), (errors) => {
            assert.ok(errors.some((e) => /es de prueba/.test(e.message)))
        })
    })

    it('guarda la página de la referencia como texto', async () => {
        const { writes } = fakeDb()
        const data = {
            metadata: { source: 'cnb', document: 'Documento X', version: '2026' },
            grades: [{ number: 1, name: 'Primer grado' }],
            subjects: [{ code: 'materia-a', name: 'Materia A', grades: [1] }],
            topics: [{ code: 'tema-a', name: 'Tema A', grade: 1, subject: 'materia-a', curriculumReference: { page: 12 } }]
        }
        await importCatalog(data, { now })

        const $set = writes.Topic[0].updateOne.update.$set
        assert.equal($set.curriculumReference.page, '12')
        assert.equal($set.isSample, false)
        assert.equal($set.source.type, 'cnb')
        assert.equal($set.source.document, 'Documento X')
    })
})
