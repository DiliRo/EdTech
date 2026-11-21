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
import Classroom from '../../src/models/classroom.model.js'
import Student from '../../src/models/student.model.js'
import Assessment from '../../src/models/assessment.model.js'
import AssessmentResult from '../../src/models/assessmentResult.model.js'
import { importCatalog } from '../../src/services/catalogImport.service.js'
import { registerTeacher, bearer } from '../helpers/factories.js'

const catalogFile = JSON.parse(await readFile(new URL('../../data/catalog/sample.catalog.json', import.meta.url), 'utf8'))

describe('Integración: evaluaciones', () => {
    let mongo
    let teacher
    let other
    let classroom
    let students
    const app = createApp()
    const as = (t) => bearer(t.token)

    before(async () => {
        mongo = await MongoMemoryServer.create()
        await connectDB(mongo.getUri('edtech-assessment-test'))
        await Promise.all([Grade, Subject, Topic, Classroom, Student, Assessment, AssessmentResult].map((m) => m.syncIndexes()))
        await importCatalog(structuredClone(catalogFile))
        teacher = await registerTeacher(app)
        other = await registerTeacher(app)

        const grade1 = await Grade.findOne({ number: 1 })
        const math = await Subject.findOne({ code: 'prueba-matematicas' })
        classroom = (await request(app).post('/api/classrooms').set(as(teacher))
            .send({ name: 'A', gradeId: grade1._id.toString(), section: 'A', schoolYear: 2026, subjectIds: [math._id.toString()] })).body.data.classroom
        students = {}
        for (const code of ['A01', 'A02', 'A03']) {
            students[code] = (await request(app).post(`/api/classrooms/${classroom.id}/students`).set(as(teacher)).send({ studentCode: code })).body.data.student
        }
    })

    after(async () => {
        await disconnectDB()
        await mongo?.stop()
    })

    const newAssessment = async (title, assessmentDate, maxScore = 20) => {
        const math = await Subject.findOne({ code: 'prueba-matematicas' })
        const topic = await Topic.findOne({ code: 'tema-ejemplo-1' })
        const res = await request(app).post('/api/assessments').set(as(teacher)).send({
            title, classroomId: classroom.id, subjectId: math._id.toString(), topicId: topic._id.toString(),
            assessmentDate, maxScore, assessmentType: 'formativa'
        })
        assert.equal(res.status, 201, JSON.stringify(res.body))
        return res.body.data.assessment
    }
    const record = (id, results) => request(app).post(`/api/assessments/${id}/results`).set(as(teacher)).send({ results })

    it('flujo completo: crear, calificar, corregir y consultar progreso', async () => {
        const march = await newAssessment('Marzo', '2026-03-10')
        const april = await newAssessment('Abril', '2026-04-10', 50)

        assert.equal((await record(march.id, [{ studentId: students.A01.id, score: 10 }, { studentId: students.A02.id, score: 8 }])).status, 200)
        assert.equal((await record(april.id, [{ studentId: students.A01.id, score: 45 }])).status, 200)

        const fix = await record(march.id, [{ studentId: students.A01.id, score: 12, correctionReason: 'Suma mal hecha' }])
        assert.equal(fix.body.data.results[0].corrections[0].previousScore, 10)

        const stored = await AssessmentResult.findOne({ assessmentId: march.id, studentId: students.A01.id })
        assert.equal(stored.score, 12)
        assert.equal(stored.percentage, 60)
        assert.equal(stored.corrections[0].changedBy.toString(), teacher.teacher.id)

        const progress = await request(app).get(`/api/students/${students.A01.id}/progress`).set(as(teacher))
        assert.equal(progress.body.data.summary.averagePercentage, 75) // (60 + 90) / 2
        assert.deepEqual(progress.body.data.trend, { change: 30, direction: 'up' })

        const detail = await request(app).get(`/api/assessments/${march.id}`).set(as(teacher))
        assert.equal(detail.body.data.assessment.subject.code, 'prueba-matematicas')
        assert.equal(detail.body.data.assessment.topic.code, 'tema-ejemplo-1')
        assert.deepEqual(detail.body.data.pendingStudents.map((p) => p.studentCode), ['A03'])
    })

    it('el índice único impide dos resultados para la misma evaluación y estudiante', async () => {
        const a = await newAssessment('Índice', '2026-05-01')
        await record(a.id, [{ studentId: students.A03.id, score: 5 }])
        await assert.rejects(
            AssessmentResult.create({ assessmentId: a.id, studentId: students.A03.id, score: 6, percentage: 30, recordedBy: teacher.teacher.id }),
            (err) => err.code === 11000
        )
    })

    it('cambiar el código conserva los resultados en la base de datos', async () => {
        const before = await AssessmentResult.countDocuments({ studentId: students.A02.id })
        await request(app).patch(`/api/students/${students.A02.id}`).set(as(teacher)).send({ studentCode: 'NUEVO-02' })

        assert.equal(await AssessmentResult.countDocuments({ studentId: students.A02.id }), before)
        const perf = await request(app).get(`/api/classrooms/${classroom.id}/performance`).set(as(teacher))
        assert.ok(perf.body.data.perStudent.some((p) => p.studentCode === 'NUEVO-02' && p.resultsCount === before))
    })

    it('otro docente no accede a evaluaciones, resultados ni estadísticas', async () => {
        const a = await newAssessment('Privada', '2026-06-01')
        assert.equal((await request(app).get(`/api/assessments/${a.id}`).set(as(other))).status, 404)
        assert.equal((await request(app).post(`/api/assessments/${a.id}/results`).set(as(other)).send({ results: [{ studentId: students.A01.id, score: 1 }] })).status, 404)
        assert.equal((await request(app).get(`/api/students/${students.A01.id}/results`).set(as(other))).status, 404)
        assert.equal((await request(app).get(`/api/classrooms/${classroom.id}/performance`).set(as(other))).status, 404)
    })
})
