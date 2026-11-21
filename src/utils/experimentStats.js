import { round, summarize, trend } from './performance.js'
import { SCORE_BANDS, SUFFICIENCY, COMPARABILITY, EXPERIMENT_DISCLAIMER } from '../config/pedagogy.js'

/**
 * Cálculos del seguimiento de estrategias (puros, sin base de datos).
 *
 * Entrada de cada período (ya resuelta por el servicio):
 *   { index, startDate, endDate, category: {code,label}|null, methods: [{id,name}],
 *     difficulty, assessments: [{ id, title, assessmentDate, assessmentType, subjectId, subjectName, topicId, maxScore }] }
 * `results`: [{ assessmentId, studentId, percentage }] de TODAS las evaluaciones del experimento.
 * `cohortSize`: estudiantes considerados (activos del aula + los que tienen notas en el experimento).
 *
 * Las calificaciones faltantes no cuentan como cero: solo se usan las registradas.
 */

const pct = (part, total) => (total > 0 ? round((part / total) * 100) : null)

export const distribution = (percentages) => {
    const total = percentages.length
    return SCORE_BANDS.map((band) => {
        const count = percentages.filter((p) => p >= band.min && p < band.max).length
        return { range: band.key, count, percentage: pct(count, total) }
    })
}

export const assessSufficiency = ({ assessmentsCount, resultsCount, participationRate }) => {
    const reasons = []
    if (assessmentsCount < SUFFICIENCY.minAssessments) {
        reasons.push(`Tiene ${assessmentsCount} evaluación(es); se necesitan al menos ${SUFFICIENCY.minAssessments}.`)
    }
    if (resultsCount < SUFFICIENCY.minResults) {
        reasons.push(`Tiene ${resultsCount} calificación(es) registradas; se necesitan al menos ${SUFFICIENCY.minResults}.`)
    }
    if (participationRate === null || participationRate < SUFFICIENCY.minParticipationRate) {
        reasons.push(`La participación es ${participationRate ?? 0} %; se necesita al menos ${SUFFICIENCY.minParticipationRate} %.`)
    }
    return { sufficient: reasons.length === 0, reasons }
}

export const computePeriodStats = (period, results, cohortSize) => {
    const ids = new Set(period.assessments.map((a) => String(a.id)))
    const own = results.filter((r) => ids.has(String(r.assessmentId)))
    const percentages = own.map((r) => r.percentage)
    const stats = summarize(percentages)
    const students = new Set(own.map((r) => String(r.studentId)))
    const participationRate = pct(students.size, cohortSize)

    const perAssessment = period.assessments.map((a) => {
        const values = own.filter((r) => String(r.assessmentId) === String(a.id)).map((r) => r.percentage)
        const s = summarize(values)
        return {
            assessmentId: String(a.id),
            title: a.title,
            assessmentDate: a.assessmentDate,
            assessmentType: a.assessmentType,
            subjectName: a.subjectName ?? null,
            resultsCount: s.count,
            averagePercentage: s.average,
            completionRate: pct(s.count, cohortSize)
        }
    })

    const subjects = [...new Map(period.assessments.map((a) => [String(a.subjectId), a.subjectName ?? null])).entries()]
        .map(([id, name]) => ({ id, name }))
    const assessmentTypes = period.assessments.reduce((acc, a) => ({ ...acc, [a.assessmentType]: (acc[a.assessmentType] ?? 0) + 1 }), {})

    const base = {
        index: period.index,
        startDate: period.startDate,
        endDate: period.endDate,
        category: period.category,
        methods: period.methods,
        assessmentsCount: period.assessments.length,
        resultsCount: stats.count,
        averagePercentage: stats.average,
        medianPercentage: stats.median,
        minPercentage: stats.min,
        maxPercentage: stats.max,
        distribution: distribution(percentages),
        participation: { studentsWithResults: students.size, cohortSize, rate: participationRate },
        context: {
            subjects,
            topicsCount: new Set(period.assessments.map((a) => a.topicId).filter(Boolean).map(String)).size,
            assessmentTypes,
            difficulty: period.difficulty ?? null
        },
        perAssessment
    }
    return { ...base, dataSufficiency: assessSufficiency({ ...base, participationRate }) }
}

const delta = (current, previous) => (current === null || previous === null ? null : round(current - previous))

/** Agrega los cambios respecto al período anterior con datos y respecto al primero con datos. */
export const addChanges = (periods) => {
    let previous = null
    const first = periods.find((p) => p.averagePercentage !== null) ?? null
    return periods.map((p) => {
        const withChanges = {
            ...p,
            changes: {
                fromPrevious: previous
                    ? {
                        comparedWithPeriod: previous.index,
                        averageDelta: delta(p.averagePercentage, previous.averagePercentage),
                        participationDelta: delta(p.participation.rate, previous.participation.rate),
                        assessmentsDelta: p.assessmentsCount - previous.assessmentsCount
                    }
                    : null,
                fromFirst: first && first.index !== p.index
                    ? { comparedWithPeriod: first.index, averageDelta: delta(p.averagePercentage, first.averagePercentage) }
                    : null
            }
        }
        if (p.averagePercentage !== null) previous = p
        return withChanges
    })
}

/**
 * Advertencias que impiden comparar los períodos directamente. Son las diferencias de
 * contexto que exige la regla: temas, dificultad, cantidad de evaluaciones y participantes.
 */
export const comparabilityWarnings = (periods) => {
    const warnings = []
    const add = (code, message, periodsAffected = []) => warnings.push({ code, message, periods: periodsAffected })
    const withData = periods.filter((p) => p.resultsCount > 0)

    const insufficient = periods.filter((p) => !p.dataSufficiency.sufficient).map((p) => p.index)
    if (insufficient.length) {
        add('insufficient_data', `Los períodos ${insufficient.join(', ')} tienen datos insuficientes; sus resultados no deben compararse.`, insufficient)
    }

    const counts = withData.map((p) => p.assessmentsCount)
    if (counts.length >= 2 && Math.min(...counts) > 0 && Math.max(...counts) / Math.min(...counts) >= COMPARABILITY.assessmentsRatio) {
        add('assessments_count', 'La cantidad de evaluaciones varía mucho entre períodos; los promedios con pocas evaluaciones son menos estables.')
    }

    const rates = withData.map((p) => p.participation.rate ?? 0)
    if (rates.length >= 2 && Math.max(...rates) - Math.min(...rates) >= COMPARABILITY.participationGap) {
        add('participation', 'La participación de estudiantes difiere en más de 20 puntos entre períodos: los promedios no representan al mismo grupo.')
    }

    const subjectSets = withData.map((p) => p.context.subjects.map((s) => s.id).sort().join(','))
    if (new Set(subjectSets).size > 1) {
        add('subjects', 'Los períodos evaluaron materias distintas.')
    }
    if (withData.length >= 2) {
        add('topics', 'Cada período trabajó temas diferentes, con contenidos y exigencias propios.')
    }

    const difficulties = withData.map((p) => p.context.difficulty)
    if (difficulties.some((d) => d === null)) {
        const missing = withData.filter((p) => p.context.difficulty === null).map((p) => p.index)
        add('difficulty_unknown', 'No se registró la dificultad de los temas en algunos períodos.', missing)
    } else if (new Set(difficulties).size > 1) {
        add('difficulty', 'La dificultad registrada de los temas cambia entre períodos.')
    }

    const typeSets = withData.map((p) => Object.keys(p.context.assessmentTypes).sort().join(','))
    if (new Set(typeSets).size > 1) {
        add('assessment_types', 'Los tipos de evaluación (diagnóstica, formativa, sumativa) no son los mismos en todos los períodos.')
    }

    const noCategory = periods.filter((p) => !p.category).map((p) => p.index)
    if (noCategory.length) add('missing_category', 'Hay períodos sin categoría pedagógica registrada.', noCategory)

    return warnings
}

/** Reporte comparativo de los cuatro períodos, calculado completamente por el backend. */
export const buildComparativeReport = ({ periods, results, cohortSize, classification }) => {
    const stats = addChanges(periods.map((p) => computePeriodStats(p, results, cohortSize)))
    const sufficientPeriods = stats.filter((p) => p.dataSufficiency.sufficient).map((p) => p.index)
    const averages = stats.map((p) => p.averagePercentage).filter((v) => v !== null)

    return {
        classification,
        cohortSize,
        periods: stats,
        overall: {
            assessmentsCount: stats.reduce((s, p) => s + p.assessmentsCount, 0),
            resultsCount: stats.reduce((s, p) => s + p.resultsCount, 0),
            periodsWithData: stats.filter((p) => p.resultsCount > 0).map((p) => p.index),
            sufficientPeriods,
            // Solo tiene sentido describir diferencias si al menos dos períodos tienen datos suficientes
            canCompare: sufficientPeriods.length >= 2,
            // Sin datos suficientes no se informa tendencia: podría leerse como una conclusión
            trendOfMonthlyAverages: sufficientPeriods.length >= 2 ? trend(averages) : null
        },
        dataSufficiency: {
            sufficient: sufficientPeriods.length === stats.length,
            message: sufficientPeriods.length === stats.length
                ? 'Todos los períodos cumplen los mínimos de datos.'
                : sufficientPeriods.length >= 2
                    ? `Solo los períodos ${sufficientPeriods.join(', ')} tienen datos suficientes; los demás deben interpretarse con cautela.`
                    : 'Datos insuficientes para comparar los períodos.'
        },
        comparabilityWarnings: comparabilityWarnings(stats),
        thresholds: { ...SUFFICIENCY },
        disclaimer: EXPERIMENT_DISCLAIMER
    }
}
