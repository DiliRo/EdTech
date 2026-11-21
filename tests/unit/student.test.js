import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { Types } from 'mongoose'

import { createApp } from '../../src/app.js'
import Student from '../../src/models/student.model.js'
import { setupClassroomScenario, classroomData } from '../helpers/classroomFixtures.js'
import { bearer } from '../helpers/factories.js'

const app = createApp()

describe('Estudiantes', () => {
    let s
    let classroomA // aula del docente A
    let classroomA2 // segunda aula del docente A
    let classroomB // aula del docente B

    const newClassroom = async (teacher, overrides) => {
        const res = await request(app).post('/api/classrooms').set(bearer(teacher.token)).send(classroomData(s.grade1, overrides))
        return res.body.data.classroom
    }
    const addStudent = (teacher, classroomId, body) =>
        request(app).post(`/api/classrooms/${classroomId}/students`).set(bearer(teacher.token)).send(body)
    const addOk = async (teacher, classroomId, code) => {
        const res = await addStudent(teacher, classroomId, { studentCode: code })
        assert.equal(res.status, 201, JSON.stringify(res.body))
        return res.body.data.student
    }
    const patch = (teacher, id, body) => request(app).patch(`/api/students/${id}`).set(bearer(teacher.token)).send(body)
    const archive = (teacher, id) => request(app).delete(`/api/students/${id}`).set(bearer(teacher.token))
    const list = async (teacher, classroomId, qs = '') =>
        (await request(app).get(`/api/classrooms/${classroomId}/students${qs}`).set(bearer(teacher.token))).body.data.students

    beforeEach(async () => {
        s = await setupClassroomScenario(app)
        classroomA = await newClassroom(s.teacherA, { name: 'A' })
        classroomA2 = await newClassroom(s.teacherA, { name: 'A2' })
        classroomB = await newClassroom(s.teacherB, { name: 'B' })
    })
    afterEach(() => mock.restoreAll())

    describe('registro solo con código', () => {
        it('registra al estudiante con su código y nada más', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'MAT-03')

            assert.deepEqual(Object.keys(student).sort(), ['classroomId', 'createdAt', 'id', 'isActive', 'studentCode', 'updatedAt'])
            assert.equal(student.studentCode, 'MAT-03')
            assert.equal(student.classroomId, classroomA.id)
            assert.equal(student.isActive, true)
        })

        it('guarda el código en mayúsculas y sin espacios alrededor', async () => {
            const student = await addOk(s.teacherA, classroomA.id, '  est_12 ')
            assert.equal(student.studentCode, 'EST_12')
        })

        for (const field of ['name', 'firstName', 'lastName', 'email', 'password', 'birthDate', 'dpi']) {
            it(`rechaza el dato personal "${field}"`, async () => {
                const res = await addStudent(s.teacherA, classroomA.id, { studentCode: 'A01', [field]: 'x' })
                assert.equal(res.status, 400)
                assert.match(res.body.message, /no son usuarios/)
                assert.deepEqual(res.body.errors, [{ field, message: 'Dato personal no permitido' }])
                assert.equal(s.stores.students.rows.size, 0)
            })
        }

        it('rechaza otros campos como classroomId o isActive', async () => {
            const res = await addStudent(s.teacherA, classroomA.id, { studentCode: 'A01', classroomId: classroomB.id, isActive: false })
            assert.equal(res.status, 400)
            assert.deepEqual(res.body.errors.map((e) => e.field).sort(), ['classroomId', 'isActive'])
        })

        for (const [label, code] of [
            ['vacío', ''], ['con espacios', 'A 01'], ['con tilde', 'NIÑO1'], ['muy largo', 'A'.repeat(21)],
            ['que empieza con guion', '-A01'], ['que no es texto', 101]
        ]) {
            it(`rechaza un código ${label}`, async () => {
                const res = await addStudent(s.teacherA, classroomA.id, { studentCode: code })
                assert.equal(res.status, 400)
                assert.equal(res.body.errors[0].field, 'studentCode')
            })
        }

        it('no permite agregar estudiantes a un aula archivada', async () => {
            await request(app).delete(`/api/classrooms/${classroomA.id}`).set(bearer(s.teacherA.token))
            const res = await addStudent(s.teacherA, classroomA.id, { studentCode: 'A01' })
            assert.equal(res.status, 409)
        })
    })

    describe('códigos duplicados', () => {
        it('rechaza el mismo código en la misma aula (sin importar mayúsculas)', async () => {
            await addOk(s.teacherA, classroomA.id, 'A01')
            const res = await addStudent(s.teacherA, classroomA.id, { studentCode: 'a01' })

            assert.equal(res.status, 409)
            assert.equal(res.body.errors[0].field, 'studentCode')
            assert.equal(s.stores.students.rows.size, 1)
        })

        it('permite el mismo código en otra aula del mismo docente', async () => {
            await addOk(s.teacherA, classroomA.id, 'A01')
            await addOk(s.teacherA, classroomA2.id, 'A01')
            assert.equal(s.stores.students.rows.size, 2)
        })

        it('permite el mismo código en el aula de otro docente', async () => {
            await addOk(s.teacherA, classroomA.id, 'A01')
            await addOk(s.teacherB, classroomB.id, 'A01')
        })

        it('un estudiante archivado conserva su código ocupado', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            await archive(s.teacherA, student.id)
            const res = await addStudent(s.teacherA, classroomA.id, { studentCode: 'A01' })
            assert.equal(res.status, 409)
        })

        it('el índice único detiene duplicados que pasen la validación (peticiones simultáneas)', async () => {
            await addOk(s.teacherA, classroomA.id, 'A01')
            mock.method(Student, 'exists', async () => null) // simula que la validación de aplicación no lo vio
            const res = await addStudent(s.teacherA, classroomA.id, { studentCode: 'A01' })
            assert.equal(res.status, 409)
            assert.equal(s.stores.students.rows.size, 1)
        })

        it('el modelo declara el índice único compuesto { classroomId, studentCode }', () => {
            const unique = Student.schema.indexes().find(([, options]) => options.unique)
            assert.deepEqual(unique[0], { classroomId: 1, studentCode: 1 })
        })
    })

    describe('edición del código', () => {
        it('cambia el código y conserva el mismo _id y fecha de creación', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            const res = await patch(s.teacherA, student.id, { studentCode: 'EST-01' })

            assert.equal(res.status, 200)
            assert.equal(res.body.data.student.id, student.id)
            assert.equal(res.body.data.student.studentCode, 'EST-01')
            assert.equal(res.body.data.student.createdAt, student.createdAt)
            assert.equal(s.stores.students.rows.size, 1)
            assert.ok(s.stores.students.rows.has(student.id))
        })

        it('el código anterior queda libre para otro estudiante', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            await patch(s.teacherA, student.id, { studentCode: 'A99' })
            await addOk(s.teacherA, classroomA.id, 'A01')
        })

        it('rechaza un código que ya usa otro estudiante de la misma aula', async () => {
            await addOk(s.teacherA, classroomA.id, 'A01')
            const other = await addOk(s.teacherA, classroomA.id, 'A02')
            const res = await patch(s.teacherA, other.id, { studentCode: 'a01' })

            assert.equal(res.status, 409)
            assert.equal(s.stores.students.get(other.id).studentCode, 'A02')
        })

        it('acepta volver a enviar su propio código', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            const res = await patch(s.teacherA, student.id, { studentCode: 'a01' })
            assert.equal(res.status, 200)
        })

        it('no permite mover al estudiante de aula ni agregar datos personales', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            const move = await patch(s.teacherA, student.id, { classroomId: classroomA2.id })
            const personal = await patch(s.teacherA, student.id, { firstName: 'Ana' })

            assert.equal(move.status, 400)
            assert.equal(personal.status, 400)
            assert.equal(s.stores.students.get(student.id).classroomId.toString(), classroomA.id)
        })

        it('responde 400 si el cuerpo está vacío', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            assert.equal((await patch(s.teacherA, student.id, {})).status, 400)
        })
    })

    describe('archivado', () => {
        it('archiva sin borrar el registro ni cambiar su _id', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            const res = await archive(s.teacherA, student.id)

            assert.equal(res.status, 200)
            assert.equal(res.body.data.student.isActive, false)
            assert.equal(res.body.data.student.id, student.id)
            assert.equal(s.stores.students.get(student.id).studentCode, 'A01')
        })

        it('el listado muestra activos por defecto y permite ver archivados', async () => {
            await addOk(s.teacherA, classroomA.id, 'B02')
            const archived = await addOk(s.teacherA, classroomA.id, 'A01')
            await addOk(s.teacherA, classroomA.id, 'A03')
            await archive(s.teacherA, archived.id)

            assert.deepEqual((await list(s.teacherA, classroomA.id)).map((x) => x.studentCode), ['A03', 'B02'])
            assert.deepEqual((await list(s.teacherA, classroomA.id, '?status=archived')).map((x) => x.studentCode), ['A01'])
            assert.deepEqual((await list(s.teacherA, classroomA.id, '?status=all')).map((x) => x.studentCode), ['A01', 'A03', 'B02'])
        })

        it('archivar de nuevo no da error', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            await archive(s.teacherA, student.id)
            assert.equal((await archive(s.teacherA, student.id)).status, 200)
        })

        it('se puede restaurar con isActive: true', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            await archive(s.teacherA, student.id)
            const res = await patch(s.teacherA, student.id, { isActive: true })
            assert.equal(res.status, 200)
            assert.equal(res.body.data.student.isActive, true)
        })

        it('no se restaura un estudiante si su aula está archivada', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            await archive(s.teacherA, student.id)
            await request(app).delete(`/api/classrooms/${classroomA.id}`).set(bearer(s.teacherA.token))

            const res = await patch(s.teacherA, student.id, { isActive: true })
            assert.equal(res.status, 409)
        })
    })

    describe('aislamiento entre docentes', () => {
        it('otro docente no puede ver, editar ni archivar estudiantes ajenos', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')

            const view = await request(app).get(`/api/classrooms/${classroomA.id}/students`).set(bearer(s.teacherB.token))
            const edit = await patch(s.teacherB, student.id, { studentCode: 'HACK' })
            const del = await archive(s.teacherB, student.id)

            assert.equal(view.status, 404)
            assert.equal(edit.status, 404)
            assert.equal(del.status, 404)
            assert.equal(edit.body.message, 'Estudiante no encontrado')

            const stored = s.stores.students.get(student.id)
            assert.equal(stored.studentCode, 'A01')
            assert.equal(stored.isActive, true)
        })

        it('el 404 de un estudiante ajeno es igual al de uno inexistente', async () => {
            const student = await addOk(s.teacherA, classroomA.id, 'A01')
            const foreign = await patch(s.teacherB, student.id, { studentCode: 'X' })
            const missing = await patch(s.teacherB, new Types.ObjectId().toString(), { studentCode: 'X' })
            assert.equal(foreign.status, missing.status)
            assert.deepEqual(foreign.body, missing.body)
        })

        it('responde 400 con un id de estudiante inválido', async () => {
            assert.equal((await patch(s.teacherA, 'abc', { studentCode: 'A01' })).status, 400)
            assert.equal((await archive(s.teacherA, 'abc')).status, 400)
        })
    })
})

describe('Modelo Student', () => {
    it('no admite campos fuera del esquema (datos personales)', () => {
        assert.throws(() => new Student({ studentCode: 'A01', classroomId: new Types.ObjectId(), firstName: 'Ana' }))
        assert.throws(() => new Student({ studentCode: 'A01', classroomId: new Types.ObjectId(), email: 'a@b.gt' }))
    })

    it('solo tiene los campos de un registro académico', () => {
        const paths = Object.keys(Student.schema.paths).sort()
        assert.deepEqual(paths, ['__v', '_id', 'classroomId', 'createdAt', 'isActive', 'studentCode', 'updatedAt'])
    })

    it('classroomId no se puede cambiar', () => {
        assert.equal(Student.schema.path('classroomId').options.immutable, true)
    })
})
