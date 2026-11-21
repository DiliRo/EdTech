import { body, param, query, checkExact } from 'express-validator'
import { validate } from '../middlewares/validate.middleware.js'
import { requireAtLeastOne } from './classroom.validator.js'
import { CLASSIFICATION_KEYS, EXPERIMENT_PERIODS, EXPERIMENT_STATUSES, DIFFICULTY_LEVELS } from '../config/pedagogy.js'
import { OBSERVATION_MAX } from '../models/teachingExperiment.model.js'
import { RECOMMENDATION_DECISIONS } from '../models/experimentReport.model.js'

const PERIOD_FIELDS = ['index', 'category', 'teachingMethodIds', 'assessmentIds', 'conditions']
const CONDITION_FIELDS = ['difficulty', 'topicsCovered', 'attendanceNotes', 'externalFactors']
const MAX_METHODS_PER_PERIOD = 5
const MAX_ASSESSMENTS_PER_PERIOD = 40

/**
 * checkExact no revisa las claves dentro de los elementos de una lista; se verifican aquí
 * para periods[] (y sus conditions) y para recommendations[] del reporte.
 */
const rejectUnknownItemKeys = (listField, allowed, nested = {}) => (req, res, next) => {
    const items = Array.isArray(req.body?.[listField]) ? req.body[listField] : []
    const errors = []
    items.forEach((item, i) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return
        for (const key of Object.keys(item)) {
            if (!allowed.includes(key)) errors.push({ field: `${listField}[${i}].${key}`, message: 'Campo no permitido' })
        }
        for (const [field, allowedNested] of Object.entries(nested)) {
            const value = item[field]
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                for (const key of Object.keys(value)) {
                    if (!allowedNested.includes(key)) errors.push({ field: `${listField}[${i}].${field}.${key}`, message: 'Campo no permitido' })
                }
            }
        }
    })
    if (!errors.length) return next()
    return res.status(400).json({ success: false, message: 'Errores de validación', errors })
}

const periodRules = () => [
    body('periods').optional().isArray({ min: 1, max: EXPERIMENT_PERIODS }).withMessage(`periods debe tener entre 1 y ${EXPERIMENT_PERIODS} elementos`),
    body('periods.*').isObject().withMessage('Cada período debe ser un objeto'),
    body('periods.*.index').isInt({ min: 1, max: EXPERIMENT_PERIODS }).withMessage(`index debe estar entre 1 y ${EXPERIMENT_PERIODS}`).toInt(),
    body('periods.*.category').optional({ values: 'null' }).isString().withMessage('category debe ser texto').trim(),
    body('periods.*.teachingMethodIds')
        .optional()
        .isArray({ max: MAX_METHODS_PER_PERIOD }).withMessage(`Máximo ${MAX_METHODS_PER_PERIOD} metodologías por período`).bail()
        .custom((v) => new Set(v.map(String)).size === v.length).withMessage('Metodologías repetidas'),
    body('periods.*.teachingMethodIds.*').isMongoId().withMessage('Identificador de metodología inválido'),
    body('periods.*.assessmentIds')
        .optional()
        .isArray({ max: MAX_ASSESSMENTS_PER_PERIOD }).withMessage(`Máximo ${MAX_ASSESSMENTS_PER_PERIOD} evaluaciones por período`).bail()
        .custom((v) => new Set(v.map(String)).size === v.length).withMessage('Evaluaciones repetidas'),
    body('periods.*.assessmentIds.*').isMongoId().withMessage('Identificador de evaluación inválido'),
    body('periods.*.conditions').optional().isObject().withMessage('conditions debe ser un objeto'),
    body('periods.*.conditions.difficulty').optional({ values: 'null' }).isIn(DIFFICULTY_LEVELS).withMessage(`difficulty debe ser: ${DIFFICULTY_LEVELS.join(', ')}`),
    ...['topicsCovered', 'attendanceNotes', 'externalFactors'].map((f) =>
        body(`periods.*.conditions.${f}`).optional().isString().withMessage(`${f} debe ser texto`).bail().trim()
            .isLength({ max: 500 }).withMessage(`${f}: máximo 500 caracteres`))
]

const titleRule = (optional) => {
    const chain = optional ? body('title').optional() : body('title')
    return chain.isString().withMessage('El título es obligatorio').bail().trim()
        .notEmpty().withMessage('El título es obligatorio').bail()
        .isLength({ max: 150 }).withMessage('Máximo 150 caracteres')
}

const statusRule = () => body('status').optional().isIn(EXPERIMENT_STATUSES).withMessage(`status debe ser: ${EXPERIMENT_STATUSES.join(', ')}`)
const idParam = () => param('id').isMongoId().withMessage('Identificador de seguimiento inválido')

export const createExperimentValidator = [
    rejectUnknownItemKeys('periods', PERIOD_FIELDS, { conditions: CONDITION_FIELDS }),
    checkExact([
        body('classroomId').isMongoId().withMessage('classroomId debe ser un identificador válido'),
        titleRule(false),
        body('startDate').isISO8601({ strict: true }).withMessage('startDate debe ser una fecha (AAAA-MM-DD)').bail().toDate(),
        body('classification').optional().isIn(CLASSIFICATION_KEYS).withMessage(`classification debe ser: ${CLASSIFICATION_KEYS.join(', ')}`),
        statusRule(),
        ...periodRules()
    ]),
    validate
]

// classification, classroomId y fechas no se cambian después de crear.
export const updateExperimentValidator = [
    rejectUnknownItemKeys('periods', PERIOD_FIELDS, { conditions: CONDITION_FIELDS }),
    checkExact([idParam(), titleRule(true), statusRule(), ...periodRules()]),
    validate,
    requireAtLeastOne(['title', 'status', 'periods'])
]

export const experimentIdValidator = [idParam(), validate]

export const listExperimentsValidator = [
    checkExact([
        query('classroomId').optional().isMongoId().withMessage('classroomId inválido'),
        query('status').optional().isIn(EXPERIMENT_STATUSES).withMessage(`status debe ser: ${EXPERIMENT_STATUSES.join(', ')}`)
    ], { locations: ['query'] }),
    validate
]

export const addObservationValidator = [
    checkExact([
        idParam(),
        param('index').isInt({ min: 1, max: EXPERIMENT_PERIODS }).withMessage(`El período debe estar entre 1 y ${EXPERIMENT_PERIODS}`).toInt(),
        body('text').isString().withMessage('text es obligatorio').bail().trim()
            .notEmpty().withMessage('text es obligatorio').bail()
            .isLength({ max: OBSERVATION_MAX }).withMessage(`Máximo ${OBSERVATION_MAX} caracteres`),
        body('date').optional().isISO8601({ strict: true }).withMessage('date debe ser una fecha (AAAA-MM-DD)').bail().toDate()
    ]),
    validate
]

export const generateReportValidator = [
    checkExact([
        idParam(),
        body('useAI').optional().isBoolean({ strict: true }).withMessage('useAI debe ser true o false'),
        body('teacherNotes').optional().isString().withMessage('teacherNotes debe ser texto').bail().trim()
            .isLength({ max: 2000 }).withMessage('Máximo 2000 caracteres')
    ]),
    validate
]

const reportParams = () => [idParam(), param('reportId').isMongoId().withMessage('Identificador de reporte inválido')]

export const reportIdValidator = [...reportParams(), validate]

export const updateReportValidator = [
    rejectUnknownItemKeys('recommendations', ['teachingMethodId', 'teacherDecision']),
    checkExact([
        ...reportParams(),
        body('teacherNotes').optional().isString().withMessage('teacherNotes debe ser texto').bail().trim()
            .isLength({ max: 2000 }).withMessage('Máximo 2000 caracteres'),
        body('recommendations').optional().isArray({ min: 1, max: 4 }).withMessage('recommendations debe tener entre 1 y 4 elementos'),
        body('recommendations.*').isObject().withMessage('Cada decisión debe ser un objeto'),
        body('recommendations.*.teachingMethodId').isMongoId().withMessage('teachingMethodId inválido'),
        body('recommendations.*.teacherDecision').isIn(RECOMMENDATION_DECISIONS).withMessage(`teacherDecision debe ser: ${RECOMMENDATION_DECISIONS.join(', ')}`)
    ]),
    validate,
    requireAtLeastOne(['teacherNotes', 'recommendations'])
]
