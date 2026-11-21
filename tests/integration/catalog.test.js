import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { connectDB, disconnectDB } from '../../src/config/db.js'
import { createApp } from '../../src/app.js'
import Grade from '../../src/models/grade.model.js'
import Subject from '../../src/models/subject.model.js'
import Topic from '../../src/models/topic.model.js'
import { importCatalog, CatalogImportError } from '../../src/services/catalogImport.service.js'
import { registerTeacher, bearer } from '../helpers/factories.js'

const sampleFile = JSON.parse(await readFile(new URL('../../data/catalog/sample.catalog.json', import.meta.url), 'utf8'))

// Importación y consultas del catálogo contra un MongoDB real en memoria.
describe('Integración: catálogo académico', () => {
    let mongo
    let token
    const app = createApp()

    before(async () => {
        mongo = await MongoMemoryServer.create()
        await connectDB(mongo.getUri('edtech-catalog-test'))
        await Promise.all([Grade.syncIndexes(), Subject.syncIndexes(), Topic.syncIndexes()])
        await importCatalog(structuredClone(sampleFile))
        ;({ token } = await registerTeacher(app))
    })

    after(async () => {
        await disconnectDB()
        await mongo?.stop()
    })

    it('importa grados, materias y temas', async () => {
        assert.equal(await Grade.countDocuments(), 6)
        assert.equal(await Subject.countDocuments(), 2)
        assert.equal(await Topic.countDocuments(), 3)
        assert.equal(await Topic.countDocuments({ isSample: true }), 3)
    })

    it('reimportar el mismo archivo no duplica registros', async () => {
        const summary = await importCatalog(structuredClone(sampleFile))
        assert.equal(summary.topics.created, 0)
        assert.equal(await Topic.countDocuments(), 3)
    })

    it('GET /api/grades devuelve los 6 grados en orden', async () => {
        const res = await request(app).get('/api/grades').set(bearer(token))
        assert.equal(res.status, 200)
        assert.deepEqual(res.body.data.grades.map((g) => g.number), [1, 2, 3, 4, 5, 6])
    })

    it('GET /api/subjects?grade filtra por grado', async () => {
        const grade3 = await Grade.findOne({ number: 3 })
        const res = await request(app).get(`/api/subjects?grade=${grade3._id}`).set(bearer(token))

        assert.equal(res.status, 200)
        assert.deepEqual(res.body.data.subjects.map((s) => s.code), ['prueba-matematicas'])
        assert.equal(res.body.meta.containsSampleData, true)
    })

    it('GET /api/topics filtra por materia y grado', async () => {
        const subject = await Subject.findOne({ code: 'prueba-matematicas' })
        const grade1 = await Grade.findOne({ number: 1 })

        const res = await request(app)
            .get(`/api/topics?subject=${subject._id}&grade=${grade1._id}`)
            .set(bearer(token))

        assert.equal(res.status, 200)
        assert.deepEqual(res.body.data.topics.map((t) => t.code), ['tema-ejemplo-1'])
        assert.equal(res.body.data.topics[0].grade.number, 1)
        assert.equal(res.body.data.topics[0].subject.code, 'prueba-matematicas')
        assert.equal(res.body.meta.total, 1)
    })

    it('GET /api/topics/:id devuelve el tema y sirve de contexto para la IA', async () => {
        const topic = await Topic.findOne({ code: 'tema-ejemplo-2' })
        const res = await request(app).get(`/api/topics/${topic._id}`).set(bearer(token))

        assert.equal(res.status, 200)
        assert.equal(res.body.data.topic.isSample, true)
        assert.equal(res.body.data.topic.achievementIndicators[0].code, 'P2.1')

        const populated = await Topic.findById(topic._id).populate('grade').populate('subject')
        const context = populated.toAIContext()
        assert.equal(context.dataStatus, 'sample')
        assert.equal(context.grade.number, 2)
    })

    it('el índice único impide temas duplicados en la misma materia y grado', async () => {
        const existing = await Topic.findOne({ code: 'tema-ejemplo-1' }).lean()
        delete existing._id
        await assert.rejects(Topic.create(existing), (err) => err.code === 11000)
    })

    it('un catálogo oficial puede reemplazar datos de prueba, pero no al revés', async () => {
        await importCatalog({
            metadata: { source: 'cnb', document: 'Documento de prueba de integración', version: 'test' },
            subjects: [{ code: 'materia-oficial', name: 'Materia oficial', grades: [4] }],
            topics: [{ code: 'tema-oficial', name: 'Tema oficial', grade: 4, subject: 'materia-oficial', curriculumReference: { page: 1 } }]
        })

        await assert.rejects(
            importCatalog({
                metadata: { source: 'sample' },
                subjects: [{ code: 'materia-oficial', name: '[PRUEBA] x', grades: [4] }]
            }),
            CatalogImportError
        )
        const subject = await Subject.findOne({ code: 'materia-oficial' })
        assert.equal(subject.isSample, false)
        assert.equal(subject.name, 'Materia oficial')
    })
})
