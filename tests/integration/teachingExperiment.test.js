import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { connectDB, disconnectDB } from '../../src/config/db.js'
import { createApp } from '../../src/app.js'
import Grade from '../../src/models/grade.model.js'
import Subject from '../../src/models/subject.model.js'
import TeachingMethod from '../../src/models/teachingMethod.model.js'
import TeachingExperiment from '../../src/models/teachingExperiment.model.js'
import ExperimentReport from '../../src/models/experimentReport.model.js'
import { importCatalog } from '../../src/services/catalogImport.service.js'
import { seedDefaultMethods } from '../../src/services/methodologySeed.service.js'
import { setAIProvider } from '../../src/services/ai/index.js'
import { registerTeacher, bearer } from '../helpers/factories.js'

const read = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'))

describe('Integración: seguimiento de estrategias', () => {
    let mongo
    let teacher
    const app = createApp()
    const as = () => bearer(teacher.token)

    before(async () => {
        mongo = await MongoMemoryServer.create()
        await connectDB(mongo.getUri('edtech-experiment-test'))
        await importCatalog(await read('../../data/catalog/sample.catalog.json'))
        await seedDefaultMethods(await read('../../data/methodologies/mineduc-defaults.json'))
        teacher = await registerTeacher(app)
        setAIProvider(null) // proveedor simulado por defecto (AI_PROVIDER=mock)
    })

    after(async () => {
        await disconnectDB()
        await mongo?.stop()
    })

    it('flujo completo: aula, evaluaciones, seguimiento, estadísticas y reporte guardado', async () => {
        const grade = await Grade.findOne({ number: 1 })
        const math = await Subject.findOne({ code: 'prueba-matematicas' })
        const method = await TeachingMethod.findOne({ defaultKey: 'aprendizaje-cooperativo' })

        const classroom = (await request(app).post('/api/classrooms').set(as())
            .send({ name: 'A', gradeId: grade._id.toString(), section: 'A', schoolYear: 2026, subjectIds: [math._id.toString()] })).body.data.classroom
        const students = []
        for (let i = 1; i <= 6; i += 1) {
            students.push((await request(app).post(`/api/classrooms/${classroom.id}/students`).set(as()).send({ studentCode: `E${i}` })).body.data.student)
        }

        const periods = []
        for (const [index, month] of [[1, '03'], [2, '04']]) {
            const ids = []
            for (const day of ['05', '20']) {
                const a = (await request(app).post('/api/assessments').set(as()).send({
                    title: `Eval ${month}-${day}`, classroomId: classroom.id, subjectId: math._id.toString(),
                    assessmentDate: `2026-${month}-${day}`, maxScore: 10, assessmentType: 'formativa'
                })).body.data.assessment
                await request(app).post(`/api/assessments/${a.id}/results`).set(as())
                    .send({ results: students.map((s, i) => ({ studentId: s.id, score: 5 + (i % 5) })) })
                ids.push(a.id)
            }
            periods.push({ index, category: index === 1 ? 'visual' : 'auditivo', teachingMethodIds: [method._id.toString()], assessmentIds: ids, conditions: { difficulty: 'media' } })
        }

        const exp = await request(app).post('/api/teaching-experiments').set(as())
            .send({ classroomId: classroom.id, title: 'Prueba', startDate: '2026-03-01', periods })
        assert.equal(exp.status, 201, JSON.stringify(exp.body))
        const id = exp.body.data.experiment.id

        const stats = await request(app).get(`/api/teaching-experiments/${id}/statistics`).set(as())
        assert.equal(stats.body.data.statistics.periods[0].resultsCount, 12)
        assert.equal(stats.body.data.statistics.overall.canCompare, true)

        const report = await request(app).post(`/api/teaching-experiments/${id}/report`).set(as()).send({})
        assert.equal(report.status, 201, JSON.stringify(report.body))

        const stored = await ExperimentReport.findById(report.body.data.report.id)
        assert.equal(stored.statistics.periods.length, 4)
        assert.equal(stored.ai.provider, 'mock')
        assert.equal(await TeachingExperiment.countDocuments(), 1)
    })
})
