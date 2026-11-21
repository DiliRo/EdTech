import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { connectDB, disconnectDB } from '../../src/config/db.js'
import { createApp } from '../../src/app.js'
import TeachingMethod from '../../src/models/teachingMethod.model.js'
import Subject from '../../src/models/subject.model.js'
import Grade from '../../src/models/grade.model.js'
import Topic from '../../src/models/topic.model.js'
import { importCatalog } from '../../src/services/catalogImport.service.js'
import { seedDefaultMethods } from '../../src/services/methodologySeed.service.js'
import { registerTeacher, bearer } from '../helpers/factories.js'

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const defaultsFile = await read('../../data/methodologies/mineduc-defaults.json')
const catalogFile = await read('../../data/catalog/sample.catalog.json')

describe('Integración: metodologías', () => {
    let mongo
    let teacherA
    let teacherB
    let math
    const app = createApp()

    before(async () => {
        mongo = await MongoMemoryServer.create()
        await connectDB(mongo.getUri('edtech-methodology-test'))
        await Promise.all([TeachingMethod, Subject, Grade, Topic].map((m) => m.syncIndexes()))
        await importCatalog(structuredClone(catalogFile))
        await seedDefaultMethods(structuredClone(defaultsFile))
        math = await Subject.findOne({ code: 'prueba-matematicas' })
        teacherA = await registerTeacher(app)
        teacherB = await registerTeacher(app)
    })

    after(async () => {
        await disconnectDB()
        await mongo?.stop()
    })

    it('la carga inicial es repetible', async () => {
        await seedDefaultMethods(structuredClone(defaultsFile))
        assert.equal(await TeachingMethod.countDocuments({ isDefault: true }), 4)
    })

    it('el índice parcial impide claves predeterminadas repetidas pero no afecta a las personalizadas', async () => {
        const existing = await TeachingMethod.findOne({ defaultKey: 'mundo-letrado' }).lean()
        delete existing._id
        await assert.rejects(TeachingMethod.create(existing), (err) => err.code === 11000)
    })

    it('filtros con datos reales: materia (incluye generales), duración y preferencias', async () => {
        const create = (body) => request(app).post('/api/methodologies').set(bearer(teacherA.token)).send(body)
        await create({ name: 'Mate corta', description: 'x', compatibleSubjects: [math._id.toString()], estimatedDuration: { minMinutes: 15, maxMinutes: 25 }, learningPreferences: ['visual', 'kinestesica'] })
        await create({ name: 'Otra materia', description: 'x', compatibleSubjects: [(await Subject.findOne({ code: 'prueba-comunicacion' }))._id.toString()] })
        await request(app).post('/api/methodologies').set(bearer(teacherB.token)).send({ name: 'De B', description: 'x' })

        const list = async (qs) =>
            (await request(app).get(`/api/methodologies${qs}`).set(bearer(teacherA.token))).body.data.methodologies.map((m) => m.name)

        assert.deepEqual(await list(`?subject=${math._id}`), [
            'Aprendizaje cooperativo', 'Diálogo de saberes', 'Mundo letrado', 'Rincones de aprendizaje', 'Mate corta'
        ])
        assert.deepEqual(await list('?maxDuration=20'), ['Mate corta'])
        assert.deepEqual(await list('?learningPreferences=kinestesica'), ['Rincones de aprendizaje', 'Mate corta'])
        assert.ok(!(await list('?scope=all')).includes('De B'))
    })

    it('el detalle trae materias compatibles pobladas', async () => {
        const method = await TeachingMethod.findOne({ name: 'Mate corta' })
        const res = await request(app).get(`/api/methodologies/${method._id}`).set(bearer(teacherA.token))
        assert.equal(res.status, 200)
        assert.equal(res.body.data.methodology.compatibleSubjects[0].code, 'prueba-matematicas')
    })

    it('una predeterminada no cambia aunque un docente lo intente', async () => {
        const method = await TeachingMethod.findOne({ defaultKey: 'aprendizaje-cooperativo' })
        const res = await request(app).patch(`/api/methodologies/${method._id}`).set(bearer(teacherA.token)).send({ name: 'Mía' })
        assert.equal(res.status, 403)
        assert.equal((await TeachingMethod.findById(method._id)).name, 'Aprendizaje cooperativo')
    })
})
