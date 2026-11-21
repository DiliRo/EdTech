import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { Types } from 'mongoose'

import { createApp } from '../../src/app.js'
import Classroom from '../../src/models/classroom.model.js'
import { setupClassroomScenario, classroomData } from '../helpers/classroomFixtures.js'
import { bearer } from '../helpers/factories.js'

const app = createApp()

describe('Aulas', () => {
    let s
    beforeEach(async () => { s = await setupClassroomScenario(app) })
    afterEach(() => mock.restoreAll())

    const create = (teacher, body) => request(app).post('/api/classrooms').set(bearer(teacher.token)).send(body)
    const createOk = async (teacher, overrides) => {
        const res = await create(teacher, classroomData(s.grade1, overrides))
        assert.equal(res.status, 201, JSON.stringify(res.body))
        return res.body.data.classroom
    }

    describe('autenticación', () => {
        const id = new Types.ObjectId()
        for (const [method, path] of [
            ['get', '/api/classrooms'], ['post', '/api/classrooms'], ['get', `/api/classrooms/${id}`],
            ['patch', `/api/classrooms/${id}`], ['delete', `/api/classrooms/${id}`],
            ['get', `/api/classrooms/${id}/students`], ['post', `/api/classrooms/${id}/students`]
        ]) {
            it(`${method.toUpperCase()} ${path.replace(String(id), ':id')} exige sesión`, async () => {
                const res = await request(app)[method](path).send({})
                assert.equal(res.status, 401)
            })
        }
    })

    describe('POST /api/classrooms', () => {
        it('crea el aula con el docente del token y la deja activa', async () => {
            const classroom = await createOk(s.teacherA, { subjectIds: [s.mathG1G2._id.toString(), s.readingG1._id.toString()] })

            assert.equal(classroom.name, 'Primero A matutina')
            assert.equal(classroom.gradeId, s.grade1._id.toString())
            assert.equal(classroom.section, 'A')
            assert.equal(classroom.schoolYear, 2026)
            assert.equal(classroom.teacherId, s.teacherA.teacher.id)
            assert.equal(classroom.isActive, true)
            assert.equal(classroom.subjectIds.length, 2)
            assert.ok(classroom.id)
        })

        it('normaliza la sección a mayúsculas', async () => {
            const classroom = await createOk(s.teacherA, { section: 'b' })
            assert.equal(classroom.section, 'B')
        })

        it('no acepta teacherId ni isActive del cliente', async () => {
            const res = await create(s.teacherA, {
                ...classroomData(s.grade1),
                teacherId: s.teacherB.teacher.id,
                isActive: false
            })
            assert.equal(res.status, 400)
            const fields = res.body.errors.map((e) => e.field)
            assert.ok(fields.includes('teacherId'))
            assert.ok(fields.includes('isActive'))
            assert.equal(s.stores.classrooms.rows.size, 0)
        })

        it('rechaza un grado inexistente', async () => {
            const res = await create(s.teacherA, classroomData(s.grade1, { gradeId: new Types.ObjectId().toString() }))
            assert.equal(res.status, 400)
            assert.equal(res.body.errors[0].field, 'gradeId')
        })

        it('rechaza materias inexistentes o que no se imparten en el grado', async () => {
            const res = await create(s.teacherA, classroomData(s.grade2, {
                subjectIds: [s.readingG1._id.toString(), new Types.ObjectId().toString()]
            }))
            assert.equal(res.status, 400)
            assert.deepEqual(res.body.errors.map((e) => e.field), ['subjectIds[0]', 'subjectIds[1]'])
            assert.match(res.body.errors[0].message, /no se imparte/)
            assert.match(res.body.errors[1].message, /no existe/)
        })

        it('rechaza materias repetidas', async () => {
            const id = s.mathG1G2._id.toString()
            const res = await create(s.teacherA, classroomData(s.grade1, { subjectIds: [id, id] }))
            assert.equal(res.status, 400)
        })

        for (const [label, override, field] of [
            ['sin nombre', { name: '' }, 'name'],
            ['gradeId inválido', { gradeId: 'abc' }, 'gradeId'],
            ['sin sección', { section: ' ' }, 'section'],
            ['año fuera de rango', { schoolYear: 1990 }, 'schoolYear'],
            ['año no numérico', { schoolYear: 'dos mil' }, 'schoolYear']
        ]) {
            it(`responde 400 ${label}`, async () => {
                const res = await create(s.teacherA, classroomData(s.grade1, override))
                assert.equal(res.status, 400)
                assert.ok(res.body.errors.some((e) => e.field === field))
            })
        }
    })

    describe('GET /api/classrooms', () => {
        it('lista solo las aulas activas del docente', async () => {
            await createOk(s.teacherA, { name: 'A1' })
            await createOk(s.teacherA, { name: 'A2' })
            await createOk(s.teacherB, { name: 'B1' })

            const res = await request(app).get('/api/classrooms').set(bearer(s.teacherA.token))
            assert.equal(res.status, 200)
            assert.deepEqual(res.body.data.classrooms.map((c) => c.name), ['A1', 'A2'])
        })

        it('filtra por estado y ciclo escolar', async () => {
            const archived = await createOk(s.teacherA, { name: 'Vieja', schoolYear: 2025 })
            await createOk(s.teacherA, { name: 'Actual', schoolYear: 2026 })
            await request(app).delete(`/api/classrooms/${archived.id}`).set(bearer(s.teacherA.token))

            const names = async (qs) =>
                (await request(app).get(`/api/classrooms${qs}`).set(bearer(s.teacherA.token))).body.data.classrooms.map((c) => c.name)

            assert.deepEqual(await names(''), ['Actual'])
            assert.deepEqual(await names('?status=archived'), ['Vieja'])
            assert.deepEqual(await names('?status=all'), ['Actual', 'Vieja'])
            assert.deepEqual(await names('?status=all&schoolYear=2025'), ['Vieja'])
        })

        it('rechaza filtros inválidos', async () => {
            for (const qs of ['?status=borradas', '?schoolYear=abc', '?teacherId=x']) {
                const res = await request(app).get(`/api/classrooms${qs}`).set(bearer(s.teacherA.token))
                assert.equal(res.status, 400, qs)
            }
        })
    })

    describe('GET /api/classrooms/:id', () => {
        it('devuelve el aula propia', async () => {
            const created = await createOk(s.teacherA)
            const res = await request(app).get(`/api/classrooms/${created.id}`).set(bearer(s.teacherA.token))
            assert.equal(res.status, 200)
            assert.equal(res.body.data.classroom.id, created.id)
        })

        it('responde 404 para un aula inexistente y 400 para un id inválido', async () => {
            const missing = await request(app).get(`/api/classrooms/${new Types.ObjectId()}`).set(bearer(s.teacherA.token))
            const invalid = await request(app).get('/api/classrooms/123').set(bearer(s.teacherA.token))
            assert.equal(missing.status, 404)
            assert.equal(invalid.status, 400)
        })
    })

    describe('PATCH /api/classrooms/:id', () => {
        it('edita nombre, sección, año y materias', async () => {
            const created = await createOk(s.teacherA)
            const res = await request(app)
                .patch(`/api/classrooms/${created.id}`)
                .set(bearer(s.teacherA.token))
                .send({ name: 'Primero B', section: 'b', schoolYear: 2027, subjectIds: [s.readingG1._id.toString()] })

            assert.equal(res.status, 200)
            const classroom = res.body.data.classroom
            assert.equal(classroom.name, 'Primero B')
            assert.equal(classroom.section, 'B')
            assert.equal(classroom.schoolYear, 2027)
            assert.deepEqual(classroom.subjectIds, [s.readingG1._id.toString()])
            assert.equal(classroom.id, created.id)
        })

        it('al cambiar de grado valida las materias actuales del aula', async () => {
            const created = await createOk(s.teacherA, { subjectIds: [s.readingG1._id.toString()] })
            const res = await request(app)
                .patch(`/api/classrooms/${created.id}`)
                .set(bearer(s.teacherA.token))
                .send({ gradeId: s.grade2._id.toString() })
            assert.equal(res.status, 400)
            assert.match(res.body.errors[0].message, /no se imparte/)
        })

        it('no permite cambiar el docente', async () => {
            const created = await createOk(s.teacherA)
            const res = await request(app)
                .patch(`/api/classrooms/${created.id}`)
                .set(bearer(s.teacherA.token))
                .send({ teacherId: s.teacherB.teacher.id })
            assert.equal(res.status, 400)
            assert.equal(s.stores.classrooms.get(created.id).teacherId.toString(), s.teacherA.teacher.id)
        })

        it('responde 400 si el cuerpo está vacío', async () => {
            const created = await createOk(s.teacherA)
            const res = await request(app).patch(`/api/classrooms/${created.id}`).set(bearer(s.teacherA.token)).send({})
            assert.equal(res.status, 400)
        })
    })

    describe('DELETE /api/classrooms/:id (archivado lógico)', () => {
        it('archiva el aula sin borrarla', async () => {
            const created = await createOk(s.teacherA)
            const res = await request(app).delete(`/api/classrooms/${created.id}`).set(bearer(s.teacherA.token))

            assert.equal(res.status, 200)
            assert.equal(res.body.data.classroom.isActive, false)
            assert.equal(s.stores.classrooms.rows.size, 1)
            assert.equal(s.stores.classrooms.get(created.id).isActive, false)

            const get = await request(app).get(`/api/classrooms/${created.id}`).set(bearer(s.teacherA.token))
            assert.equal(get.status, 200)
        })

        it('archivar de nuevo no da error', async () => {
            const created = await createOk(s.teacherA)
            await request(app).delete(`/api/classrooms/${created.id}`).set(bearer(s.teacherA.token))
            const again = await request(app).delete(`/api/classrooms/${created.id}`).set(bearer(s.teacherA.token))
            assert.equal(again.status, 200)
        })

        it('no archiva a los estudiantes del aula', async () => {
            const created = await createOk(s.teacherA)
            const student = await request(app)
                .post(`/api/classrooms/${created.id}/students`)
                .set(bearer(s.teacherA.token))
                .send({ studentCode: 'A01' })

            await request(app).delete(`/api/classrooms/${created.id}`).set(bearer(s.teacherA.token))
            assert.equal(s.stores.students.get(student.body.data.student.id).isActive, true)
        })

        it('un aula archivada no se edita salvo que se restaure', async () => {
            const created = await createOk(s.teacherA)
            await request(app).delete(`/api/classrooms/${created.id}`).set(bearer(s.teacherA.token))

            const edit = await request(app).patch(`/api/classrooms/${created.id}`).set(bearer(s.teacherA.token)).send({ name: 'X' })
            assert.equal(edit.status, 409)

            const restore = await request(app)
                .patch(`/api/classrooms/${created.id}`)
                .set(bearer(s.teacherA.token))
                .send({ isActive: true, name: 'Restaurada' })
            assert.equal(restore.status, 200)
            assert.equal(restore.body.data.classroom.isActive, true)
            assert.equal(restore.body.data.classroom.name, 'Restaurada')
        })
    })

    describe('aislamiento entre docentes', () => {
        it('otro docente recibe 404 en GET, PATCH, DELETE y en los estudiantes del aula', async () => {
            const created = await createOk(s.teacherA, { name: 'De A' })
            const asB = (method, path, body) => request(app)[method](path).set(bearer(s.teacherB.token)).send(body)

            assert.equal((await asB('get', `/api/classrooms/${created.id}`)).status, 404)
            assert.equal((await asB('patch', `/api/classrooms/${created.id}`, { name: 'Robada' })).status, 404)
            assert.equal((await asB('delete', `/api/classrooms/${created.id}`)).status, 404)
            assert.equal((await asB('get', `/api/classrooms/${created.id}/students`)).status, 404)
            assert.equal((await asB('post', `/api/classrooms/${created.id}/students`, { studentCode: 'X01' })).status, 404)

            const stored = s.stores.classrooms.get(created.id)
            assert.equal(stored.name, 'De A')
            assert.equal(stored.isActive, true)
            assert.equal(s.stores.students.rows.size, 0)
        })

        it('la respuesta 404 es igual a la de un aula inexistente', async () => {
            const created = await createOk(s.teacherA)
            const foreign = await request(app).get(`/api/classrooms/${created.id}`).set(bearer(s.teacherB.token))
            const missing = await request(app).get(`/api/classrooms/${new Types.ObjectId()}`).set(bearer(s.teacherB.token))
            assert.deepEqual(foreign.body, missing.body)
        })
    })
})

describe('Modelo Classroom', () => {
    it('teacherId no se puede cambiar una vez creado', () => {
        assert.equal(Classroom.schema.path('teacherId').options.immutable, true)
    })

    it('tiene índice para listar por docente y estado', () => {
        const indexes = Classroom.schema.indexes().map(([fields]) => fields)
        assert.deepEqual(indexes, [{ teacherId: 1, isActive: 1, schoolYear: -1, name: 1 }])
    })
})
