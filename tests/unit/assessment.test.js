import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { Types } from 'mongoose'

import { createApp } from '../../src/app.js'
import AssessmentResult from '../../src/models/assessmentResult.model.js'
import Assessment from '../../src/models/assessment.model.js'
import { setupAssessmentScenario, assessmentData } from '../helpers/assessmentFixtures.js'
import { bearer } from '../helpers/factories.js'

const app = createApp()

describe('Evaluaciones y seguimiento', () => {
    let s

    const as = (teacher) => bearer(teacher.token)
    const createAssessment = (teacher, body) => request(app).post('/api/assessments').set(as(teacher)).send(body)
    const createOk = async (overrides = {}, teacher = s.teacherA) => {
        const res = await createAssessment(teacher, assessmentData(s, overrides))
        assert.equal(res.status, 201, JSON.stringify(res.body))
        return res.body.data.assessment
    }
    const record = (assessmentId, results, teacher = s.teacherA) =>
        request(app).post(`/api/assessments/${assessmentId}/results`).set(as(teacher)).send({ results })
    const recordOk = async (assessmentId, results) => {
        const res = await record(assessmentId, results)
        assert.equal(res.status, 200, JSON.stringify(res.body))
        return res.body.data
    }
    const grade = (code, score, extra = {}) => ({ studentId: s.students[code].id, score, ...extra })

    beforeEach(async () => { s = await setupAssessmentScenario(app) })
    afterEach(() => mock.restoreAll())

    it('todas las rutas exigen sesión', async () => {
        const id = new Types.ObjectId()
        for (const [method, path] of [
            ['post', '/api/assessments'], ['get', '/api/assessments'], ['get', `/api/assessments/${id}`],
            ['post', `/api/assessments/${id}/results`], ['get', `/api/students/${id}/results`],
            ['get', `/api/students/${id}/progress`], ['get', `/api/classrooms/${id}/performance`]
        ]) {
            assert.equal((await request(app)[method](path).send({})).status, 401, `${method} ${path}`)
        }
    })

    describe('POST /api/assessments', () => {
        it('crea la evaluación con tema y metodología', async () => {
            const a = await createOk({ topicId: s.topic._id.toString(), teachingMethodId: s.defaultMethod._id.toString() })
            assert.equal(a.title, 'Prueba corta de sumas')
            assert.equal(a.teacherId, s.teacherA.teacher.id)
            assert.equal(a.maxScore, 20)
            assert.equal(a.assessmentType, 'formativa')
            assert.equal(a.topicId, s.topic._id.toString())
            assert.equal(new Date(a.assessmentDate).toISOString().slice(0, 10), '2026-03-10')
        })

        it('no permite evaluar un aula de otro docente (404)', async () => {
            const res = await createAssessment(s.teacherB, assessmentData(s))
            assert.equal(res.status, 404)
            assert.equal(s.stores.assessments.rows.size, 0)
        })

        it('valida materia, tema y metodología contra el aula', async () => {
            const foreignMethod = await s.stores.methods.seed({ name: 'De B', description: 'x', createdBy: s.teacherB.teacher.id })
            const res = await createAssessment(s.teacherA, assessmentData(s, {
                subjectId: s.readingG1._id.toString(), // no asignada al aula A
                topicId: s.topicGrade2._id.toString(), // tema de otro grado
                teachingMethodId: foreignMethod[0]._id.toString() // metodología ajena
            }))
            assert.equal(res.status, 400)
            assert.deepEqual(res.body.errors.map((e) => e.field), ['subjectId', 'topicId', 'teachingMethodId'])
        })

        it('no permite evaluaciones en un aula archivada', async () => {
            await request(app).delete(`/api/classrooms/${s.classroomA.id}`).set(as(s.teacherA))
            assert.equal((await createAssessment(s.teacherA, assessmentData(s))).status, 409)
        })

        for (const [label, override, field] of [
            ['nota máxima 0', { maxScore: 0 }, 'maxScore'],
            ['tipo desconocido', { assessmentType: 'oral' }, 'assessmentType'],
            ['fecha inválida', { assessmentDate: '10/03/2026' }, 'assessmentDate'],
            ['sin título', { title: ' ' }, 'title'],
            ['teacherId enviado', { teacherId: new Types.ObjectId().toString() }, 'teacherId']
        ]) {
            it(`responde 400 con ${label}`, async () => {
                const res = await createAssessment(s.teacherA, assessmentData(s, override))
                assert.equal(res.status, 400)
                assert.ok(res.body.errors.some((e) => e.field === field), JSON.stringify(res.body.errors))
            })
        }

        it('maxScore no se puede cambiar después de crear', () => {
            assert.equal(Assessment.schema.path('maxScore').options.immutable, true)
        })
    })

    describe('GET /api/assessments', () => {
        it('lista solo las evaluaciones propias, con filtros', async () => {
            await createOk({ title: 'Marzo', assessmentDate: '2026-03-10' })
            await createOk({ title: 'Abril', assessmentDate: '2026-04-10', assessmentType: 'sumativa' })
            await createOk({ title: 'De B', classroomId: s.classroomB.id, subjectId: s.mathG1G2._id.toString() }, s.teacherB)

            const titles = async (qs = '') =>
                (await request(app).get(`/api/assessments${qs}`).set(as(s.teacherA))).body.data.assessments.map((a) => a.title)

            assert.deepEqual(await titles(), ['Abril', 'Marzo'])
            assert.deepEqual(await titles('?assessmentType=sumativa'), ['Abril'])
            assert.deepEqual(await titles('?from=2026-04-01'), ['Abril'])
            assert.deepEqual(await titles('?to=2026-03-31'), ['Marzo'])
            assert.deepEqual(await titles(`?classroomId=${s.classroomA2.id}`), [])
        })

        it('rechaza filtros inválidos', async () => {
            for (const qs of ['?from=ayer', '?classroomId=1', '?assessmentType=x', '?teacherId=1']) {
                assert.equal((await request(app).get(`/api/assessments${qs}`).set(as(s.teacherA))).status, 400, qs)
            }
        })
    })

    describe('POST /api/assessments/:id/results (registro masivo)', () => {
        it('registra calificaciones, calcula el porcentaje y muestra el código', async () => {
            const a = await createOk()
            const data = await recordOk(a.id, [grade('A01', 15), grade('A02', 10, { observations: 'Revisar llevadas' })])

            assert.deepEqual(data.summary, { created: 2, updated: 0, unchanged: 0 })
            const [r1, r2] = data.results
            assert.equal(r1.studentId, s.students.A01.id)
            assert.equal(r1.studentCode, 'A01')
            assert.equal(r1.percentage, 75)
            assert.equal(r2.percentage, 50)
            assert.equal(r2.observations, 'Revisar llevadas')
            assert.equal(r1.recordedBy, s.teacherA.teacher.id)
        })

        it('un estudiante sin calificación queda pendiente, no con cero', async () => {
            const a = await createOk()
            await recordOk(a.id, [grade('A01', 20), grade('A02', 10)])

            const res = await request(app).get(`/api/assessments/${a.id}`).set(as(s.teacherA))
            assert.equal(res.status, 200)
            assert.equal(res.body.data.results.length, 2)
            assert.deepEqual(res.body.data.pendingStudents, [{ studentId: s.students.A03.id, studentCode: 'A03' }])
            assert.equal(res.body.data.summary.average, 75) // (100 + 50) / 2, A03 no cuenta
            assert.equal(res.body.data.summary.pendingCount, 1)
            assert.equal(res.body.data.summary.completionRate, 66.67)
            assert.equal(s.stores.results.rows.size, 2)
        })

        it('rechaza estudiantes de otra aula o inexistentes con el mismo mensaje y no escribe nada', async () => {
            const a = await createOk()
            const res = await record(a.id, [
                grade('A01', 15),
                grade('Z01', 15), // otra aula del mismo docente
                grade('B01', 15), // aula de otro docente
                { studentId: new Types.ObjectId().toString(), score: 15 }
            ])
            assert.equal(res.status, 400)
            const messages = res.body.errors.map((e) => e.message)
            assert.equal(messages.length, 3)
            assert.ok(messages.every((m) => m === 'El estudiante no pertenece al aula evaluada'))
            assert.equal(s.stores.results.rows.size, 0)
        })

        it('rechaza notas mayores a la nota máxima y estudiantes repetidos en la lista', async () => {
            const a = await createOk()
            const res = await record(a.id, [grade('A01', 21), grade('A02', 5), grade('A02', 6)])
            assert.equal(res.status, 400)
            assert.deepEqual(res.body.errors.map((e) => e.field), ['results[0].score', 'results[2].studentId'])
            assert.equal(s.stores.results.rows.size, 0)
        })

        it('identifica estudiantes solo por studentId, no por studentCode', async () => {
            const a = await createOk()
            const res = await record(a.id, [{ studentCode: 'A01', score: 10 }])
            assert.equal(res.status, 400)
            assert.ok(res.body.errors.some((e) => e.field === 'results[0].studentCode' && e.message === 'Campo no permitido'))
        })

        it('rechaza notas negativas, no numéricas o listas vacías', async () => {
            const a = await createOk()
            assert.equal((await record(a.id, [grade('A01', -1)])).status, 400)
            assert.equal((await record(a.id, [grade('A01', 'diez')])).status, 400)
            assert.equal((await record(a.id, [grade('A01', null)])).status, 400)
            assert.equal((await record(a.id, [])).status, 400)
        })

        it('otro docente no puede registrar calificaciones (404)', async () => {
            const a = await createOk()
            const res = await record(a.id, [grade('A01', 10)], s.teacherB)
            assert.equal(res.status, 404)
            assert.equal(s.stores.results.rows.size, 0)
        })

        it('no se registran resultados nuevos para estudiantes archivados', async () => {
            const a = await createOk()
            await request(app).delete(`/api/students/${s.students.A03.id}`).set(as(s.teacherA))
            const res = await record(a.id, [grade('A03', 10)])
            assert.equal(res.status, 400)
            assert.equal(res.body.errors[0].message, 'El estudiante está archivado')
        })

        it('el índice único evita duplicados si dos registros llegan a la vez', async () => {
            const a = await createOk()
            await recordOk(a.id, [grade('A01', 10)])
            mock.method(AssessmentResult, 'find', () => ({ then: (resolve) => resolve([]) })) // la validación no ve el existente
            const res = await record(a.id, [grade('A01', 12)])
            assert.equal(res.status, 409)
            assert.equal(s.stores.results.rows.size, 1)
        })
    })

    describe('correcciones', () => {
        it('guarda el valor anterior, la fecha y el docente responsable', async () => {
            const a = await createOk()
            const first = await recordOk(a.id, [grade('A01', 10, { observations: 'Inicial' })])
            const before = Date.now()

            const second = await recordOk(a.id, [grade('A01', 14, { correctionReason: 'Error al transcribir' })])
            assert.deepEqual(second.summary, { created: 0, updated: 1, unchanged: 0 })

            const r = second.results[0]
            assert.equal(r.id, first.results[0].id, 'es el mismo resultado, no uno nuevo')
            assert.equal(r.score, 14)
            assert.equal(r.percentage, 70)
            assert.equal(r.observations, 'Inicial', 'sin observations nuevas se conservan las anteriores')
            assert.equal(r.corrections.length, 1)

            const c = r.corrections[0]
            assert.equal(c.previousScore, 10)
            assert.equal(c.previousPercentage, 50)
            assert.equal(c.previousObservations, 'Inicial')
            assert.equal(c.changedBy, s.teacherA.teacher.id)
            assert.equal(c.reason, 'Error al transcribir')
            assert.ok(new Date(c.changedAt).getTime() >= before - 1000)
            assert.equal(s.stores.results.rows.size, 1)
        })

        it('varias correcciones forman un historial', async () => {
            const a = await createOk()
            await recordOk(a.id, [grade('A01', 10)])
            await recordOk(a.id, [grade('A01', 12)])
            const last = await recordOk(a.id, [grade('A01', 16)])
            assert.deepEqual(last.results[0].corrections.map((c) => c.previousScore), [10, 12])
        })

        it('enviar la misma nota no genera corrección', async () => {
            const a = await createOk()
            await recordOk(a.id, [grade('A01', 10)])
            const again = await recordOk(a.id, [grade('A01', 10)])
            assert.deepEqual(again.summary, { created: 0, updated: 0, unchanged: 1 })
            assert.equal(again.results[0].corrections.length, 0)
        })

        it('se puede corregir la nota de un estudiante ya archivado', async () => {
            const a = await createOk()
            await recordOk(a.id, [grade('A03', 8)])
            await request(app).delete(`/api/students/${s.students.A03.id}`).set(as(s.teacherA))
            const res = await record(a.id, [grade('A03', 9, { correctionReason: 'Revisión' })])
            assert.equal(res.status, 200)
            assert.equal(res.body.data.results[0].studentIsActive, false)
        })
    })

    describe('historial y progreso del estudiante', () => {
        // A01: 10/20 (50 %) en marzo, 15/20 (75 %) en abril, sin nota en mayo, 45/50 (90 %) en junio
        const buildHistory = async () => {
            const march = await createOk({ title: 'Marzo', assessmentDate: '2026-03-10' })
            const april = await createOk({ title: 'Abril', assessmentDate: '2026-04-10' })
            const may = await createOk({ title: 'Mayo', assessmentDate: '2026-05-10' })
            const june = await createOk({ title: 'Junio', assessmentDate: '2026-06-10', maxScore: 50, assessmentType: 'sumativa' })
            // Se registran en desorden para comprobar el orden cronológico
            await recordOk(june.id, [grade('A01', 45), grade('A02', 20)])
            await recordOk(march.id, [grade('A01', 10), grade('A02', 16)])
            await recordOk(april.id, [grade('A01', 15)])
            return { march, april, may, june }
        }

        it('GET /api/students/:id/results devuelve el historial en orden cronológico', async () => {
            await buildHistory()
            const res = await request(app).get(`/api/students/${s.students.A01.id}/results`).set(as(s.teacherA))

            assert.equal(res.status, 200)
            assert.equal(res.body.data.student.studentCode, 'A01')
            assert.deepEqual(res.body.data.results.map((h) => h.assessment.title), ['Marzo', 'Abril', 'Junio'])
            assert.deepEqual(res.body.data.results.map((h) => h.result.percentage), [50, 75, 90])
            assert.equal(res.body.data.assessmentsWithoutResult, 1)
        })

        it('GET /api/students/:id/progress calcula promedio, evolución y tendencia', async () => {
            await buildHistory()
            const res = await request(app).get(`/api/students/${s.students.A01.id}/progress`).set(as(s.teacherA))
            assert.equal(res.status, 200)

            const { summary, trend, evolution, bySubject, threshold } = res.body.data
            assert.equal(threshold, 60)
            assert.deepEqual(summary, {
                resultsCount: 3,
                assessmentsWithoutResult: 1, // mayo: no cuenta como cero
                averagePercentage: 71.67, // (50 + 75 + 90) / 3
                medianPercentage: 75,
                minPercentage: 50,
                maxPercentage: 90,
                latestPercentage: 90,
                belowThreshold: false
            })
            assert.deepEqual(trend, { change: 40, direction: 'up' })
            assert.deepEqual(evolution.map((e) => [e.title, e.score, e.maxScore, e.percentage]), [
                ['Marzo', 10, 20, 50], ['Abril', 15, 20, 75], ['Junio', 45, 50, 90]
            ])
            assert.equal(bySubject.length, 1)
            assert.equal(bySubject[0].averagePercentage, 71.67)
            assert.equal(res.body.meta.note.includes('no es un diagnóstico'), true)
        })

        it('el umbral se puede ajustar por consulta', async () => {
            await buildHistory()
            const res = await request(app).get(`/api/students/${s.students.A01.id}/progress?threshold=75`).set(as(s.teacherA))
            assert.equal(res.body.data.threshold, 75)
            assert.equal(res.body.data.summary.belowThreshold, true)
        })

        it('sin calificaciones el promedio es null, no cero, y no se señala', async () => {
            await buildHistory()
            const res = await request(app).get(`/api/students/${s.students.A03.id}/progress`).set(as(s.teacherA))
            assert.equal(res.body.data.summary.averagePercentage, null)
            assert.equal(res.body.data.summary.assessmentsWithoutResult, 4)
            assert.equal(res.body.data.summary.belowThreshold, false)
            assert.deepEqual(res.body.data.trend, { change: null, direction: null })
        })

        it('otro docente recibe 404 en historial y progreso', async () => {
            await buildHistory()
            const id = s.students.A01.id
            assert.equal((await request(app).get(`/api/students/${id}/results`).set(as(s.teacherB))).status, 404)
            assert.equal((await request(app).get(`/api/students/${id}/progress`).set(as(s.teacherB))).status, 404)
        })

        it('responde 400 con id o umbral inválidos', async () => {
            assert.equal((await request(app).get('/api/students/A01/progress').set(as(s.teacherA))).status, 400)
            assert.equal((await request(app).get(`/api/students/${s.students.A01.id}/progress?threshold=120`).set(as(s.teacherA))).status, 400)
        })
    })

    describe('cambio de código sin pérdida de resultados', () => {
        it('los resultados siguen al estudiante por su _id y muestran el código nuevo', async () => {
            const a = await createOk({ title: 'Marzo' })
            const recorded = await recordOk(a.id, [grade('A01', 18)])
            const resultId = recorded.results[0].id

            const patch = await request(app).patch(`/api/students/${s.students.A01.id}`).set(as(s.teacherA)).send({ studentCode: 'EST-01' })
            assert.equal(patch.status, 200)

            const history = await request(app).get(`/api/students/${s.students.A01.id}/results`).set(as(s.teacherA))
            assert.equal(history.body.data.student.studentCode, 'EST-01')
            assert.equal(history.body.data.results[0].result.id, resultId)
            assert.equal(history.body.data.results[0].result.studentCode, 'EST-01')
            assert.equal(history.body.data.results[0].result.score, 18)

            const detail = await request(app).get(`/api/assessments/${a.id}`).set(as(s.teacherA))
            assert.equal(detail.body.data.results[0].studentCode, 'EST-01')

            const perf = await request(app).get(`/api/classrooms/${s.classroomA.id}/performance`).set(as(s.teacherA))
            const row = perf.body.data.perStudent.find((p) => p.studentId === s.students.A01.id)
            assert.equal(row.studentCode, 'EST-01')
            assert.equal(row.averagePercentage, 90)
        })

        it('el código anterior reutilizado por otro estudiante no hereda resultados', async () => {
            const a = await createOk()
            await recordOk(a.id, [grade('A01', 18)])
            await request(app).patch(`/api/students/${s.students.A01.id}`).set(as(s.teacherA)).send({ studentCode: 'EST-01' })
            const newcomer = (await request(app)
                .post(`/api/classrooms/${s.classroomA.id}/students`).set(as(s.teacherA)).send({ studentCode: 'A01' })).body.data.student

            const res = await request(app).get(`/api/students/${newcomer.id}/results`).set(as(s.teacherA))
            assert.deepEqual(res.body.data.results, [])
        })
    })

    describe('GET /api/classrooms/:id/performance', () => {
        it('calcula estadísticas del aula y señala promedios bajo el umbral', async () => {
            const march = await createOk({ title: 'Marzo', assessmentDate: '2026-03-10' })
            const april = await createOk({ title: 'Abril', assessmentDate: '2026-04-10' })
            // A01: 80, 90 → 85 | A02: 40, 50 → 45 | A03: sin notas
            await recordOk(march.id, [grade('A01', 16), grade('A02', 8)])
            await recordOk(april.id, [grade('A01', 18), grade('A02', 10)])

            const res = await request(app).get(`/api/classrooms/${s.classroomA.id}/performance`).set(as(s.teacherA))
            assert.equal(res.status, 200)
            const data = res.body.data

            assert.deepEqual(data.summary, {
                assessmentsCount: 2,
                studentsCount: 3,
                resultsCount: 4,
                completionRate: 66.67, // 4 de 6 esperadas
                averagePercentage: 65, // (80 + 40 + 90 + 50) / 4
                medianPercentage: 65,
                minPercentage: 40,
                maxPercentage: 90,
                averageOfStudentAverages: 65 // (85 + 45) / 2, A03 sin datos no cuenta
            })

            assert.deepEqual(data.perAssessment.map((p) => [p.title, p.resultsCount, p.pendingCount, p.averagePercentage, p.belowThresholdCount]), [
                ['Marzo', 2, 1, 60, 1],
                ['Abril', 2, 1, 70, 1]
            ])

            assert.deepEqual(data.perStudent.map((p) => [p.studentCode, p.averagePercentage, p.resultsCount, p.assessmentsWithoutResult, p.belowThreshold]), [
                ['A01', 85, 2, 0, false],
                ['A02', 45, 2, 0, true],
                ['A03', null, 0, 2, false]
            ])
            assert.deepEqual(data.perStudent[0].trend, { change: 10, direction: 'up' })

            assert.deepEqual(data.belowThreshold, {
                threshold: 60,
                resultsCount: 2,
                students: [{ studentId: s.students.A02.id, studentCode: 'A02', averagePercentage: 45, resultsCount: 2 }]
            })
            assert.match(res.body.meta.note, /no es un diagnóstico/)
        })

        it('el umbral es configurable por consulta', async () => {
            const a = await createOk()
            await recordOk(a.id, [grade('A01', 16), grade('A02', 8)])
            const res = await request(app).get(`/api/classrooms/${s.classroomA.id}/performance?threshold=90`).set(as(s.teacherA))
            assert.deepEqual(res.body.data.belowThreshold.students.map((x) => x.studentCode), ['A01', 'A02'])
        })

        it('incluye a archivados con notas y excluye a archivados sin notas', async () => {
            const a = await createOk()
            await recordOk(a.id, [grade('A01', 16), grade('A02', 8)])
            await request(app).delete(`/api/students/${s.students.A02.id}`).set(as(s.teacherA))
            await request(app).delete(`/api/students/${s.students.A03.id}`).set(as(s.teacherA))

            const res = await request(app).get(`/api/classrooms/${s.classroomA.id}/performance`).set(as(s.teacherA))
            assert.deepEqual(res.body.data.perStudent.map((p) => [p.studentCode, p.isActive]), [['A01', true], ['A02', false]])
            assert.equal(res.body.data.summary.studentsCount, 1)
        })

        it('un aula sin evaluaciones devuelve valores null, no ceros', async () => {
            const res = await request(app).get(`/api/classrooms/${s.classroomA.id}/performance`).set(as(s.teacherA))
            assert.equal(res.body.data.summary.averagePercentage, null)
            assert.equal(res.body.data.summary.completionRate, null)
            assert.deepEqual(res.body.data.belowThreshold.students, [])
        })

        it('otro docente recibe 404', async () => {
            const res = await request(app).get(`/api/classrooms/${s.classroomA.id}/performance`).set(as(s.teacherB))
            assert.equal(res.status, 404)
        })
    })
})
