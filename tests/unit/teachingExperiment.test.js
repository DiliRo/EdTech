import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { Types } from 'mongoose'

import { createApp } from '../../src/app.js'
import TeachingExperiment from '../../src/models/teachingExperiment.model.js'
import ExperimentReport from '../../src/models/experimentReport.model.js'
import AIUsageLog from '../../src/models/aiUsageLog.model.js'
import { setAIProvider } from '../../src/services/ai/index.js'
import { setupAssessmentScenario, assessmentData } from '../helpers/assessmentFixtures.js'
import { installFakeModel } from '../helpers/fakeModel.js'
import { bearer } from '../helpers/factories.js'
import { fakeProvider } from '../helpers/aiFixtures.js'
import { validInterpretation } from '../helpers/aiFixtures.js'

const app = createApp()

describe('Seguimiento de estrategias pedagógicas', () => {
    let s
    let experiments
    let reports
    let codes // códigos de los 8 estudiantes del aula A

    const as = (t) => bearer(t.token)
    const api = (teacher = s.teacherA) => ({
        create: (body) => request(app).post('/api/teaching-experiments').set(as(teacher)).send(body),
        get: (id) => request(app).get(`/api/teaching-experiments/${id}`).set(as(teacher)),
        patch: (id, body) => request(app).patch(`/api/teaching-experiments/${id}`).set(as(teacher)).send(body),
        observe: (id, index, body) => request(app).post(`/api/teaching-experiments/${id}/periods/${index}/observations`).set(as(teacher)).send(body),
        stats: (id) => request(app).get(`/api/teaching-experiments/${id}/statistics`).set(as(teacher)),
        report: (id, body = {}) => request(app).post(`/api/teaching-experiments/${id}/report`).set(as(teacher)).send(body),
        reports: (id) => request(app).get(`/api/teaching-experiments/${id}/reports`).set(as(teacher)),
        patchReport: (id, reportId, body) => request(app).patch(`/api/teaching-experiments/${id}/reports/${reportId}`).set(as(teacher)).send(body)
    })
    const experimentData = (overrides = {}) => ({
        classroomId: s.classroomA.id, title: 'Estrategias de lectura', startDate: '2026-03-01', ...overrides
    })
    const createOk = async (overrides) => {
        const res = await api().create(experimentData(overrides))
        assert.equal(res.status, 201, JSON.stringify(res.body))
        return res.body.data.experiment
    }
    /** Crea una evaluación en el aula A y califica a los estudiantes indicados. */
    const assessmentWithResults = async (date, percentages) => {
        const a = (await request(app).post('/api/assessments').set(as(s.teacherA))
            .send(assessmentData(s, { title: `Eval ${date}`, assessmentDate: date, maxScore: 100 }))).body.data.assessment
        const results = Object.entries(percentages)
            .filter(([, score]) => score !== undefined) // sin nota: el estudiante no se envía
            .map(([code, score]) => ({ studentId: s.students[code].id, score }))
        if (results.length) {
            const res = await request(app).post(`/api/assessments/${a.id}/results`).set(as(s.teacherA)).send({ results })
            assert.equal(res.status, 200, JSON.stringify(res.body))
        }
        return a
    }
    const allStudents = (score) => Object.fromEntries(codes.map((c) => [c, typeof score === 'function' ? score(c) : score]))

    beforeEach(async () => {
        s = await setupAssessmentScenario(app)
        experiments = installFakeModel(TeachingExperiment)
        reports = installFakeModel(ExperimentReport)
        installFakeModel(AIUsageLog)
        for (const code of ['A04', 'A05', 'A06', 'A07', 'A08']) {
            s.students[code] = (await request(app).post(`/api/classrooms/${s.classroomA.id}/students`).set(as(s.teacherA)).send({ studentCode: code })).body.data.student
        }
        codes = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08']
    })
    afterEach(() => {
        setAIProvider(null)
        mock.restoreAll()
    })

    describe('POST /api/teaching-experiments', () => {
        it('crea cuatro períodos mensuales con la clasificación por defecto', async () => {
            const exp = await createOk()
            assert.equal(exp.status, 'active')
            assert.equal(exp.classification, 'vark')
            assert.equal(exp.classificationInfo.name, 'VARK')
            assert.equal(exp.periods.length, 4)
            assert.deepEqual(exp.periods.map((p) => p.startDate.slice(0, 10)), ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01'])
            assert.equal(exp.endDate, '2026-06-30T23:59:59.999Z')
            assert.equal(exp.teacherId, s.teacherA.teacher.id)
        })

        it('asigna categoría, metodologías y evaluaciones al crear', async () => {
            const a = await assessmentWithResults('2026-03-10', {})
            const exp = await createOk({
                classification: 'honey-alonso',
                periods: [{ index: 1, category: 'activo', teachingMethodIds: [s.defaultMethod._id.toString()], assessmentIds: [a.id], conditions: { difficulty: 'media' } }]
            })
            assert.equal(exp.periods[0].category, 'activo')
            assert.deepEqual(exp.periods[0].assessmentIds, [a.id])
            assert.equal(exp.periods[0].conditions.difficulty, 'media')
        })

        it('no mezcla clasificaciones: una categoría Honey-Alonso no vale en un seguimiento VARK', async () => {
            const res = await api().create(experimentData({ periods: [{ index: 1, category: 'activo' }] }))
            assert.equal(res.status, 400)
            assert.match(res.body.errors[0].message, /clasificación vark/)
        })

        it('rechaza clasificaciones desconocidas', async () => {
            const res = await api().create(experimentData({ classification: 'inteligencias-multiples' }))
            assert.equal(res.status, 400)
        })

        it('valida las evaluaciones: misma aula, dentro del período y en un solo período', async () => {
            const march = await assessmentWithResults('2026-03-10', {})
            const otherClass = (await request(app).post('/api/assessments').set(as(s.teacherA))
                .send(assessmentData(s, { classroomId: s.classroomA2.id, assessmentDate: '2026-03-11' }))).body.data.assessment

            const res = await api().create(experimentData({
                periods: [
                    { index: 1, assessmentIds: [march.id, otherClass.id, new Types.ObjectId().toString()] },
                    { index: 2, assessmentIds: [march.id] } // fuera de abril y repetida
                ]
            }))
            assert.equal(res.status, 400)
            const messages = res.body.errors.map((e) => e.message).join(' | ')
            assert.match(messages, /ya está en el período 1/)
            assert.match(messages, /no existe en esta aula/)
            assert.match(messages, /fuera del período 2/)
        })

        it('rechaza metodologías de otro docente y aulas ajenas', async () => {
            const foreign = await s.stores.methods.seed({ name: 'De B', description: 'x', createdBy: s.teacherB.teacher.id })
            const res = await api().create(experimentData({ periods: [{ index: 1, teachingMethodIds: [foreign[0]._id.toString()] }] }))
            assert.equal(res.status, 400)
            assert.equal((await api(s.teacherB).create(experimentData())).status, 404)
        })

        it('rechaza campos desconocidos dentro de los períodos', async () => {
            const res = await api().create(experimentData({ periods: [{ index: 1, learningStyle: 'visual', conditions: { studentNames: 'x' } }] }))
            assert.equal(res.status, 400)
            assert.deepEqual(res.body.errors.map((e) => e.field).sort(), ['periods[0].conditions.studentNames', 'periods[0].learningStyle'])
        })
    })

    describe('PATCH, observaciones y aislamiento', () => {
        it('actualiza períodos sin tocar los demás y no permite cambiar la clasificación', async () => {
            const exp = await createOk({ periods: [{ index: 1, category: 'visual' }] })
            const res = await api().patch(exp.id, { periods: [{ index: 2, category: 'auditivo', conditions: { difficulty: 'alta' } }] })
            assert.equal(res.status, 200)
            assert.equal(res.body.data.experiment.periods[0].category, 'visual')
            assert.equal(res.body.data.experiment.periods[1].category, 'auditivo')

            const change = await api().patch(exp.id, { classification: 'honey-alonso' })
            assert.equal(change.status, 400)
        })

        it('registra observaciones con fecha dentro del período', async () => {
            const exp = await createOk()
            const ok = await api().observe(exp.id, 2, { text: 'Hubo una semana de feria escolar.', date: '2026-04-15' })
            assert.equal(ok.status, 201)
            assert.equal(ok.body.data.experiment.periods[1].observations[0].text, 'Hubo una semana de feria escolar.')
            assert.ok(ok.body.data.experiment.periods[1].observations[0].id)

            const outside = await api().observe(exp.id, 2, { text: 'x', date: '2026-07-01' })
            assert.equal(outside.status, 400)
            assert.equal((await api().observe(exp.id, 5, { text: 'x' })).status, 400)
        })

        it('un seguimiento completado no edita períodos hasta reabrirlo; uno cancelado no se modifica', async () => {
            const exp = await createOk()
            await api().patch(exp.id, { status: 'completed' })
            assert.equal((await api().patch(exp.id, { periods: [{ index: 1, category: 'visual' }] })).status, 409)
            assert.equal((await api().patch(exp.id, { status: 'active', periods: [{ index: 1, category: 'visual' }] })).status, 200)

            await api().patch(exp.id, { status: 'cancelled' })
            assert.equal((await api().patch(exp.id, { title: 'x' })).status, 409)
        })

        it('otro docente recibe 404 en todas las operaciones', async () => {
            const exp = await createOk()
            const b = api(s.teacherB)
            assert.equal((await b.get(exp.id)).status, 404)
            assert.equal((await b.patch(exp.id, { title: 'x' })).status, 404)
            assert.equal((await b.observe(exp.id, 1, { text: 'x' })).status, 404)
            assert.equal((await b.stats(exp.id)).status, 404)
            assert.equal((await b.report(exp.id)).status, 404)
            assert.equal((await b.reports(exp.id)).status, 404)
        })
    })

    describe('GET /statistics', () => {
        it('calcula número de evaluaciones, promedio, distribución, participación y cambios por mes', async () => {
            const m1 = await assessmentWithResults('2026-03-05', allStudents(60))
            const m2 = await assessmentWithResults('2026-03-20', allStudents((c) => (c === 'A08' ? undefined : 80)))
            const a1 = await assessmentWithResults('2026-04-08', allStudents(90))
            const a2 = await assessmentWithResults('2026-04-22', allStudents(70))
            const exp = await createOk({
                periods: [
                    { index: 1, category: 'visual', teachingMethodIds: [s.defaultMethod._id.toString()], assessmentIds: [m1.id, m2.id], conditions: { difficulty: 'media' } },
                    { index: 2, category: 'auditivo', assessmentIds: [a1.id, a2.id], conditions: { difficulty: 'media' } }
                ]
            })

            const res = await api().stats(exp.id)
            assert.equal(res.status, 200)
            const { periods, overall, dataSufficiency, comparabilityWarnings, cohortSize } = res.body.data.statistics
            assert.equal(cohortSize, 8)

            const [p1, p2, p3] = periods
            assert.equal(p1.assessmentsCount, 2)
            assert.equal(p1.resultsCount, 15) // A08 sin nota en la 2.ª: no cuenta como cero
            assert.equal(p1.averagePercentage, 69.33) // (8×60 + 7×80) / 15
            assert.deepEqual(p1.distribution.map((d) => d.count), [0, 0, 8, 7]) // 60 % → 60-79; 80 % → 80-100
            assert.equal(p1.participation.rate, 100)
            assert.equal(p1.category.label, 'Visual')
            assert.equal(p1.methods[0].name, 'Mundo letrado')
            assert.equal(p1.dataSufficiency.sufficient, true)

            assert.equal(p2.averagePercentage, 80)
            assert.equal(p2.changes.fromPrevious.averageDelta, 10.67)
            assert.equal(p3.assessmentsCount, 0)
            assert.equal(p3.averagePercentage, null)
            assert.equal(p3.dataSufficiency.sufficient, false)

            assert.equal(overall.canCompare, true)
            assert.equal(dataSufficiency.sufficient, false)
            assert.ok(comparabilityWarnings.some((w) => w.code === 'insufficient_data'))
            assert.match(res.body.meta.disclaimer, /no demuestran/)
        })
    })

    describe('POST /report', () => {
        const fullExperiment = async () => {
            const ids = []
            for (const [month, base] of [['03', 60], ['04', 70], ['05', 65], ['06', 75]]) {
                const a = await assessmentWithResults(`2026-${month}-05`, allStudents(base))
                const b = await assessmentWithResults(`2026-${month}-20`, allStudents(base + 10))
                ids.push([a.id, b.id])
            }
            const exp = await createOk({
                periods: ids.map((assessmentIds, i) => ({
                    index: i + 1, category: ['visual', 'auditivo', 'lectoescritura', 'kinestesico'][i],
                    teachingMethodIds: [s.defaultMethod._id.toString()], assessmentIds, conditions: { difficulty: 'media' }
                }))
            })
            await api().observe(exp.id, 1, { text: 'A03 faltó por enfermedad', date: '2026-03-12' })
            return exp
        }

        it('sin IA guarda el reporte con las estadísticas calculadas', async () => {
            const exp = await fullExperiment()
            const res = await api().report(exp.id, { useAI: false, teacherNotes: 'Primer corte' })
            assert.equal(res.status, 201)
            const report = res.body.data.report
            assert.equal(report.aiInterpretation, null)
            assert.match(report.aiSkippedReason, /No se solicitó/)
            assert.equal(report.statistics.periods.length, 4)
            assert.equal(report.statistics.overall.canCompare, true)
            assert.equal(report.teacherNotes, 'Primer corte')
            assert.equal(reports.rows.size, 1)
        })

        it('con IA envía solo estadísticas agregadas y guarda recomendaciones del catálogo', async () => {
            const exp = await fullExperiment()
            const provider = fakeProvider([validInterpretation({ recommendations: [{ teachingMethodId: s.defaultMethod._id.toString(), rationale: 'Podría sostener el trabajo con textos del entorno.' }] })])
            setAIProvider(provider)

            const res = await api().report(exp.id)
            assert.equal(res.status, 201, JSON.stringify(res.body))
            const report = res.body.data.report
            assert.equal(report.aiInterpretation.summary.length > 0, true)
            assert.deepEqual(report.recommendations.map((r) => [r.methodName, r.teacherDecision]), [['Mundo letrado', 'pending']])
            assert.equal(report.ai.attempts, 1)

            const sent = provider.calls[0].system + provider.calls[0].user
            for (const forbidden of [...codes, 'faltó por enfermedad', s.students.A01.id, 'studentId', s.teacherA.data.email]) {
                assert.ok(!sent.includes(forbidden), `no debe enviar: ${forbidden}`)
            }
            assert.match(provider.calls[0].user, /"averagePercentage"/)
            assert.match(provider.calls[0].user, /comparabilityWarnings/)
        })

        it('si la IA afirma causalidad o recomienda algo fuera del catálogo, reintenta', async () => {
            const exp = await fullExperiment()
            const provider = fakeProvider([
                validInterpretation({ summary: 'El cambio a auditivo causó una mejora clara.' }),
                validInterpretation({ recommendations: [{ teachingMethodId: s.defaultMethod._id.toString(), rationale: 'Sugerencia orientativa.' }] })
            ])
            setAIProvider(provider)
            const res = await api().report(exp.id)
            assert.equal(res.status, 201)
            assert.equal(provider.calls.length, 2)
            assert.match(provider.calls[1].user, /afirmación causal/)
        })

        it('si la IA insiste en recomendar metodologías inexistentes responde 502 y no guarda', async () => {
            const exp = await fullExperiment()
            setAIProvider(fakeProvider([validInterpretation({ recommendations: [{ teachingMethodId: new Types.ObjectId().toString(), rationale: 'x' }] })]))
            const res = await api().report(exp.id)
            assert.equal(res.status, 502)
            assert.equal(reports.rows.size, 0)
        })

        it('con datos insuficientes la IA debe indicarlo explícitamente', async () => {
            const a = await assessmentWithResults('2026-03-05', { A01: 80, A02: 70 })
            const exp = await createOk({ periods: [{ index: 1, assessmentIds: [a.id] }] })
            const { dataSufficiencyNote, ...withoutNote } = validInterpretation({ recommendations: [] })
            assert.ok(dataSufficiencyNote)
            const provider = fakeProvider([withoutNote, validInterpretation({ recommendations: [], dataSufficiencyNote: 'Solo hay una evaluación: datos insuficientes.' })])
            setAIProvider(provider)

            const res = await api().report(exp.id)
            assert.equal(res.status, 201)
            assert.equal(provider.calls.length, 2)
            assert.match(res.body.data.report.aiInterpretation.dataSufficiencyNote, /insuficientes/)
            assert.equal(res.body.data.report.statistics.dataSufficiency.message, 'Datos insuficientes para comparar los períodos.')
        })

        it('sin calificaciones no llama a la IA e indica datos insuficientes', async () => {
            const exp = await createOk()
            const provider = fakeProvider([validInterpretation()])
            setAIProvider(provider)
            const res = await api().report(exp.id)
            assert.equal(res.status, 201)
            assert.equal(provider.calls.length, 0)
            assert.match(res.body.data.report.aiSkippedReason, /Datos insuficientes/)
        })

        it('el proveedor simulado por defecto produce un reporte válido', async () => {
            const exp = await fullExperiment()
            const res = await api().report(exp.id)
            assert.equal(res.status, 201, JSON.stringify(res.body))
            assert.match(res.body.data.report.aiInterpretation.summary, /\[EJEMPLO\]/)
            assert.equal(res.body.data.report.ai.provider, 'mock')
        })
    })

    describe('consultar y decidir sobre reportes', () => {
        it('lista y consulta los reportes guardados, y el docente decide cada recomendación', async () => {
            const a = await assessmentWithResults('2026-03-05', allStudents(70))
            const exp = await createOk({ periods: [{ index: 1, assessmentIds: [a.id] }] })
            setAIProvider(fakeProvider([validInterpretation({ recommendations: [{ teachingMethodId: s.defaultMethod._id.toString(), rationale: 'Orientativa.' }] })]))
            const created = (await api().report(exp.id)).body.data.report

            const list = await api().reports(exp.id)
            assert.deepEqual(list.body.data.reports.map((r) => r.id), [created.id])
            const one = await request(app).get(`/api/teaching-experiments/${exp.id}/reports/${created.id}`).set(as(s.teacherA))
            assert.equal(one.status, 200)

            const decided = await api().patchReport(exp.id, created.id, {
                teacherNotes: 'La aplicaré en julio.',
                recommendations: [{ teachingMethodId: s.defaultMethod._id.toString(), teacherDecision: 'accepted' }]
            })
            assert.equal(decided.status, 200)
            assert.equal(decided.body.data.report.recommendations[0].teacherDecision, 'accepted')
            assert.ok(decided.body.data.report.recommendations[0].decidedAt)
            assert.equal(decided.body.data.report.teacherNotes, 'La aplicaré en julio.')

            const unknown = await api().patchReport(exp.id, created.id, { recommendations: [{ teachingMethodId: new Types.ObjectId().toString(), teacherDecision: 'discarded' }] })
            assert.equal(unknown.status, 400)

            const foreign = await request(app).get(`/api/teaching-experiments/${exp.id}/reports/${created.id}`).set(as(s.teacherB))
            assert.equal(foreign.status, 404)
        })
    })
})
