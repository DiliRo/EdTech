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
import { importCatalog } from '../../src/services/catalogImport.service.js'
import { registerTeacher, bearer } from '../helpers/factories.js'

const sampleFile = JSON.parse(await readFile(new URL('../../data/catalog/sample.catalog.json', import.meta.url), 'utf8'))

describe('Integración: aulas y estudiantes', () => {
    let mongo
    let teacherA
    let teacherB
    let grade1
    let math
    const app = createApp()

    before(async () => {
        mongo = await MongoMemoryServer.create()
        await connectDB(mongo.getUri('edtech-classroom-test'))
        await Promise.all([Grade, Subject, Topic, Classroom, Student].map((m) => m.syncIndexes()))
        await importCatalog(structuredClone(sampleFile))
        grade1 = await Grade.findOne({ number: 1 })
        math = await Subject.findOne({ code: 'prueba-matematicas' })
        teacherA = await registerTeacher(app)
        teacherB = await registerTeacher(app)
    })

    after(async () => {
        await disconnectDB()
        await mongo?.stop()
    })

    const createClassroom = async (teacher, name = 'Primero A') => {
        const res = await request(app)
            .post('/api/classrooms')
            .set(bearer(teacher.token))
            .send({ name, gradeId: grade1._id.toString(), section: 'A', schoolYear: 2026, subjectIds: [math._id.toString()] })
        assert.equal(res.status, 201, JSON.stringify(res.body))
        return res.body.data.classroom
    }

    const addStudent = (teacher, classroomId, studentCode) =>
        request(app).post(`/api/classrooms/${classroomId}/students`).set(bearer(teacher.token)).send({ studentCode })

    it('el aula incluye grado, materias y conteo de estudiantes activos', async () => {
        const classroom = await createClassroom(teacherA)
        await addStudent(teacherA, classroom.id, 'A01')
        await addStudent(teacherA, classroom.id, 'A02')

        const res = await request(app).get(`/api/classrooms/${classroom.id}`).set(bearer(teacherA.token))
        assert.equal(res.status, 200)
        assert.equal(res.body.data.classroom.grade.number, 1)
        assert.equal(res.body.data.classroom.subjects[0].code, 'prueba-matematicas')
        assert.equal(res.body.data.classroom.activeStudentCount, 2)
    })

    it('el índice único de MongoDB impide códigos repetidos en la misma aula', async () => {
        const classroom = await createClassroom(teacherA, 'Índice')
        await addStudent(teacherA, classroom.id, 'X01')

        await assert.rejects(
            Student.create({ classroomId: classroom.id, studentCode: 'x01' }),
            (err) => err.code === 11000
        )
        // En otra aula sí se permite
        const other = await createClassroom(teacherA, 'Otra')
        await Student.create({ classroomId: other.id, studentCode: 'X01' })
    })

    it('peticiones simultáneas con el mismo código crean un solo estudiante', async () => {
        const classroom = await createClassroom(teacherA, 'Simultáneas')
        const results = await Promise.all([
            addStudent(teacherA, classroom.id, 'S01'),
            addStudent(teacherA, classroom.id, 'S01'),
            addStudent(teacherA, classroom.id, 'S01')
        ])
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409])
        assert.equal(await Student.countDocuments({ classroomId: classroom.id, studentCode: 'S01' }), 1)
    })

    it('editar el código conserva el _id (las relaciones futuras siguen válidas)', async () => {
        const classroom = await createClassroom(teacherA, 'Edición')
        const { body } = await addStudent(teacherA, classroom.id, 'E01')
        const id = body.data.student.id

        const res = await request(app).patch(`/api/students/${id}`).set(bearer(teacherA.token)).send({ studentCode: 'E99' })
        assert.equal(res.status, 200)

        const stored = await Student.findById(id)
        assert.equal(stored.studentCode, 'E99')
        assert.equal(await Student.countDocuments({ classroomId: classroom.id }), 1)
    })

    it('archivar conserva el documento y descuenta del conteo de activos', async () => {
        const classroom = await createClassroom(teacherA, 'Archivo')
        const { body } = await addStudent(teacherA, classroom.id, 'R01')
        await addStudent(teacherA, classroom.id, 'R02')

        await request(app).delete(`/api/students/${body.data.student.id}`).set(bearer(teacherA.token))

        const stored = await Student.findById(body.data.student.id)
        assert.equal(stored.isActive, false)
        const res = await request(app).get(`/api/classrooms/${classroom.id}`).set(bearer(teacherA.token))
        assert.equal(res.body.data.classroom.activeStudentCount, 1)
    })

    it('otro docente no ve ni modifica aulas o estudiantes ajenos', async () => {
        const classroom = await createClassroom(teacherA, 'Privada')
        const { body } = await addStudent(teacherA, classroom.id, 'P01')

        const list = await request(app).get('/api/classrooms?status=all').set(bearer(teacherB.token))
        assert.ok(!list.body.data.classrooms.some((c) => c.id === classroom.id))

        assert.equal((await request(app).get(`/api/classrooms/${classroom.id}`).set(bearer(teacherB.token))).status, 404)
        assert.equal(
            (await request(app).patch(`/api/students/${body.data.student.id}`).set(bearer(teacherB.token)).send({ studentCode: 'Z' })).status,
            404
        )
        assert.equal((await Student.findById(body.data.student.id)).studentCode, 'P01')
    })
})
