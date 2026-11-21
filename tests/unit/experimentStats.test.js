import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
    distribution, assessSufficiency, computePeriodStats, addChanges, comparabilityWarnings, buildComparativeReport
} from '../../src/utils/experimentStats.js'
import { addMonthsUTC, buildPeriodDates } from '../../src/services/teachingExperiment.service.js'
import { CLASSIFICATIONS, categoryCodes, DEFAULT_CLASSIFICATION } from '../../src/config/pedagogy.js'

/** Período sintético: `n` evaluaciones de la materia indicada. */
const period = (index, { assessments = 2, subject = 'mate', difficulty = 'media', type = 'formativa', category = { code: 'visual', label: 'Visual' } } = {}) => ({
    index,
    startDate: new Date(Date.UTC(2026, index + 1, 1)),
    endDate: new Date(Date.UTC(2026, index + 2, 0)),
    category,
    methods: [{ id: `m${index}`, name: `Metodología ${index}` }],
    difficulty,
    assessments: Array.from({ length: assessments }, (_, i) => ({
        id: `p${index}a${i}`, title: `Eval ${index}.${i}`, assessmentDate: new Date(), assessmentType: type,
        subjectId: subject, subjectName: subject, topicId: `t${index}${i}`, maxScore: 20
    }))
})

/** Calificaciones: cada estudiante de la lista obtiene `percentage` en cada evaluación del período. */
const resultsFor = (p, students, percentage) =>
    p.assessments.flatMap((a) => students.map((s, i) => ({
        assessmentId: a.id, studentId: s, percentage: typeof percentage === 'function' ? percentage(i) : percentage
    })))

const students = (n) => Array.from({ length: n }, (_, i) => `s${i}`)

describe('Clasificaciones pedagógicas', () => {
    it('VARK y Honey-Alonso son clasificaciones separadas, con fuente y sin categorías compartidas', () => {
        assert.deepEqual(categoryCodes('vark'), ['visual', 'auditivo', 'lectoescritura', 'kinestesico'])
        assert.deepEqual(categoryCodes('honey-alonso'), ['activo', 'reflexivo', 'teorico', 'pragmatico'])
        const shared = categoryCodes('vark').filter((c) => categoryCodes('honey-alonso').includes(c))
        assert.deepEqual(shared, [])
        for (const c of Object.values(CLASSIFICATIONS)) assert.ok(c.source.length > 20)
        assert.equal(DEFAULT_CLASSIFICATION, 'vark')
    })
})

describe('Fechas de los períodos', () => {
    it('crea cuatro meses consecutivos sin huecos ni solapes', () => {
        const periods = buildPeriodDates(new Date('2026-03-01'))
        assert.deepEqual(periods.map((p) => p.startDate.toISOString().slice(0, 10)), ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01'])
        assert.equal(periods[0].endDate.toISOString(), '2026-03-31T23:59:59.999Z')
        assert.equal(periods[3].endDate.toISOString(), '2026-06-30T23:59:59.999Z')
        for (let i = 1; i < 4; i += 1) assert.equal(periods[i].startDate - periods[i - 1].endDate, 1)
    })

    it('ajusta fin de mes (31 de enero + 1 mes = 28 de febrero)', () => {
        assert.equal(addMonthsUTC(new Date('2026-01-31'), 1).toISOString().slice(0, 10), '2026-02-28')
        assert.equal(addMonthsUTC(new Date('2028-01-31'), 1).toISOString().slice(0, 10), '2028-02-29')
    })
})

describe('Estadísticas por período', () => {
    it('distribución por rangos de logro', () => {
        assert.deepEqual(distribution([10, 45, 59.99, 60, 79, 80, 100]), [
            { range: '0-39', count: 1, percentage: 14.29 },
            { range: '40-59', count: 2, percentage: 28.57 },
            { range: '60-79', count: 2, percentage: 28.57 },
            { range: '80-100', count: 2, percentage: 28.57 }
        ])
        assert.ok(distribution([]).every((b) => b.count === 0 && b.percentage === null))
    })

    it('número de evaluaciones, promedio, participación y logro por evaluación', () => {
        const p = period(1, { assessments: 2 })
        // 8 estudiantes en la primera evaluación, 6 en la segunda (faltan 2: no cuentan como cero)
        const results = [
            ...students(8).map((s) => ({ assessmentId: 'p1a0', studentId: s, percentage: 70 })),
            ...students(6).map((s) => ({ assessmentId: 'p1a1', studentId: s, percentage: 90 }))
        ]
        const stats = computePeriodStats(p, results, 10)

        assert.equal(stats.assessmentsCount, 2)
        assert.equal(stats.resultsCount, 14)
        assert.equal(stats.averagePercentage, 78.57) // (8×70 + 6×90) / 14
        assert.deepEqual(stats.participation, { studentsWithResults: 8, cohortSize: 10, rate: 80 })
        assert.deepEqual(stats.perAssessment.map((a) => [a.averagePercentage, a.completionRate]), [[70, 80], [90, 60]])
        assert.equal(stats.context.topicsCount, 2)
        assert.deepEqual(stats.context.assessmentTypes, { formativa: 2 })
        assert.equal(stats.dataSufficiency.sufficient, true)
    })

    it('marca datos insuficientes y explica por qué', () => {
        const { sufficient, reasons } = assessSufficiency({ assessmentsCount: 1, resultsCount: 4, participationRate: 40 })
        assert.equal(sufficient, false)
        assert.equal(reasons.length, 3)
        assert.match(reasons.join(' '), /al menos 2/)
        assert.match(reasons.join(' '), /al menos 10/)
        assert.match(reasons.join(' '), /al menos 60 %/)
    })

    it('un período sin evaluaciones tiene valores null, no ceros', () => {
        const stats = computePeriodStats(period(2, { assessments: 0 }), [], 10)
        assert.equal(stats.averagePercentage, null)
        assert.equal(stats.participation.rate, 0)
        assert.equal(stats.dataSufficiency.sufficient, false)
    })
})

describe('Cambios respecto a mediciones anteriores', () => {
    it('compara con el período anterior que tenga datos y con el primero', () => {
        const ps = [period(1), period(2, { assessments: 0 }), period(3), period(4)]
        const results = [...resultsFor(ps[0], students(8), 60), ...resultsFor(ps[2], students(8), 75), ...resultsFor(ps[3], students(8), 70)]
        const stats = addChanges(ps.map((p) => computePeriodStats(p, results, 8)))

        assert.equal(stats[0].changes.fromPrevious, null)
        assert.equal(stats[1].changes.fromPrevious.averageDelta, null) // sin datos
        assert.deepEqual(stats[2].changes.fromPrevious, { comparedWithPeriod: 1, averageDelta: 15, participationDelta: 0, assessmentsDelta: 0 })
        assert.equal(stats[3].changes.fromPrevious.comparedWithPeriod, 3)
        assert.equal(stats[3].changes.fromPrevious.averageDelta, -5)
        assert.deepEqual(stats[3].changes.fromFirst, { comparedWithPeriod: 1, averageDelta: 10 })
    })
})

describe('Advertencias de comparabilidad', () => {
    const build = (ps, results, cohort = 8) => addChanges(ps.map((p) => computePeriodStats(p, results, cohort)))
    const codes = (warnings) => warnings.map((w) => w.code)

    it('detecta diferencias de evaluaciones, participación, materias, dificultad y tipos', () => {
        const ps = [
            period(1, { assessments: 2, difficulty: 'baja' }),
            period(2, { assessments: 4, subject: 'lectura', difficulty: 'alta', type: 'sumativa' }),
            period(3, { difficulty: null }),
            period(4, { category: null })
        ]
        const results = [
            ...resultsFor(ps[0], students(8), 70),
            ...resultsFor(ps[1], students(4), 80), // 50 % de participación
            ...resultsFor(ps[2], students(8), 70),
            ...resultsFor(ps[3], students(8), 70)
        ]
        const warnings = comparabilityWarnings(build(ps, results))
        assert.deepEqual(codes(warnings), [
            'insufficient_data', 'assessments_count', 'participation', 'subjects', 'topics',
            'difficulty_unknown', 'assessment_types', 'missing_category'
        ])
        assert.deepEqual(warnings.find((w) => w.code === 'insufficient_data').periods, [2])
        assert.deepEqual(warnings.find((w) => w.code === 'difficulty_unknown').periods, [3])
        assert.deepEqual(warnings.find((w) => w.code === 'missing_category').periods, [4])
    })

    it('siempre advierte que los temas difieren entre períodos con datos', () => {
        const ps = [period(1), period(2)]
        const warnings = comparabilityWarnings(build(ps, [...resultsFor(ps[0], students(8), 70), ...resultsFor(ps[1], students(8), 70)]))
        assert.ok(codes(warnings).includes('topics'))
    })
})

describe('Reporte comparativo', () => {
    it('con cuatro períodos suficientes permite comparar y calcula la tendencia', () => {
        const ps = [period(1), period(2), period(3), period(4)]
        const results = ps.flatMap((p, i) => resultsFor(p, students(8), 60 + i * 5))
        const report = buildComparativeReport({ periods: ps, results, cohortSize: 8, classification: 'vark' })

        assert.equal(report.overall.assessmentsCount, 8)
        assert.equal(report.overall.resultsCount, 64)
        assert.equal(report.overall.canCompare, true)
        assert.deepEqual(report.overall.trendOfMonthlyAverages, { change: 15, direction: 'up' })
        assert.equal(report.dataSufficiency.sufficient, true)
        assert.match(report.disclaimer, /no demuestran que una metodología sea superior/)
        assert.match(report.disclaimer, /estilos de aprendizaje fijos o predominantes/)
    })

    it('con datos insuficientes lo indica explícitamente', () => {
        const ps = [period(1), period(2, { assessments: 1 }), period(3, { assessments: 0 }), period(4, { assessments: 0 })]
        const results = [...resultsFor(ps[0], students(8), 70), ...resultsFor(ps[1], students(8), 70)]
        const report = buildComparativeReport({ periods: ps, results, cohortSize: 8, classification: 'vark' })

        assert.equal(report.overall.canCompare, false)
        assert.equal(report.dataSufficiency.sufficient, false)
        assert.equal(report.dataSufficiency.message, 'Datos insuficientes para comparar los períodos.')
        assert.deepEqual(report.overall.sufficientPeriods, [1])
        assert.equal(report.overall.trendOfMonthlyAverages, null)
    })
})
