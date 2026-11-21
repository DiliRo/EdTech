import { body, query, param, checkExact } from 'express-validator'
import { validate } from '../middlewares/validate.middleware.js'
import {
    ASSESSMENT_TYPES,
    MAX_SCORE_LIMIT,
    TITLE_MAX,
    OBSERVATIONS_MAX,
    CORRECTION_REASON_MAX,
    MAX_RESULTS_PER_REQUEST
} from '../config/assessment.js'

const mongoBody = (field, { optional = false } = {}) => {
    const chain = optional ? body(field).optional({ values: 'null' }) : body(field)
    return chain.isMongoId().withMessage(`${field} debe ser un identificador válido`)
}

const dateQuery = (field) =>
    query(field).optional().isISO8601({ strict: true }).withMessage(`${field} debe ser una fecha (AAAA-MM-DD)`).toDate()

const idParam = (label) => param('id').isMongoId().withMessage(`Identificador de ${label} inválido`)

export const createAssessmentValidator = [
    checkExact([
        body('title')
            .isString().withMessage('El título es obligatorio').bail()
            .trim()
            .notEmpty().withMessage('El título es obligatorio').bail()
            .isLength({ max: TITLE_MAX }).withMessage(`Máximo ${TITLE_MAX} caracteres`),
        mongoBody('classroomId'),
        mongoBody('subjectId'),
        mongoBody('topicId', { optional: true }),
        mongoBody('teachingMethodId', { optional: true }),
        body('assessmentDate')
            .isISO8601({ strict: true }).withMessage('assessmentDate debe ser una fecha (AAAA-MM-DD)').bail()
            .toDate(),
        body('maxScore')
            .isFloat({ gt: 0, max: MAX_SCORE_LIMIT }).withMessage(`maxScore debe ser mayor que 0 y hasta ${MAX_SCORE_LIMIT}`)
            .toFloat(),
        body('assessmentType')
            .isIn(ASSESSMENT_TYPES).withMessage(`assessmentType debe ser: ${ASSESSMENT_TYPES.join(', ')}`)
    ]),
    validate
]

export const listAssessmentsValidator = [
    checkExact([
        query('classroomId').optional().isMongoId().withMessage('classroomId inválido'),
        query('subjectId').optional().isMongoId().withMessage('subjectId inválido'),
        query('assessmentType').optional().isIn(ASSESSMENT_TYPES).withMessage(`assessmentType debe ser: ${ASSESSMENT_TYPES.join(', ')}`),
        dateQuery('from'),
        dateQuery('to')
    ], { locations: ['query'] }),
    validate
]

export const assessmentIdValidator = [idParam('evaluación'), validate]

/**
 * { "results": [{ "studentId": "...", "score": 18, "observations": "...", "correctionReason": "..." }] }
 * El estudiante se identifica SIEMPRE por studentId; studentCode no se acepta.
 */
const RESULT_FIELDS = ['studentId', 'score', 'observations', 'correctionReason']

/**
 * checkExact no revisa las claves dentro de cada elemento de una lista, así que se
 * verifican aquí. En particular rechaza `studentCode`: las calificaciones se relacionan por `studentId`.
 */
const rejectUnknownResultFields = (req, res, next) => {
    const items = Array.isArray(req.body?.results) ? req.body.results : []
    const errors = []
    items.forEach((item, i) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
            for (const key of Object.keys(item)) {
                if (!RESULT_FIELDS.includes(key)) errors.push({ field: `results[${i}].${key}`, message: 'Campo no permitido' })
            }
        }
    })
    if (!errors.length) return next()
    return res.status(400).json({ success: false, message: 'Errores de validación', errors })
}

export const recordResultsValidator = [
    rejectUnknownResultFields,
    body('results.*').isObject().withMessage('Cada calificación debe ser un objeto'),
    checkExact([
        idParam('evaluación'),
        body('results')
            .isArray({ min: 1, max: MAX_RESULTS_PER_REQUEST })
            .withMessage(`results debe ser una lista de 1 a ${MAX_RESULTS_PER_REQUEST} calificaciones`),
        body('results.*.studentId').isMongoId().withMessage('studentId debe ser un identificador válido'),
        body('results.*.score')
            .isFloat({ min: 0 }).withMessage('score debe ser un número mayor o igual a 0 (para "sin nota", no envíes al estudiante)')
            .toFloat(),
        body('results.*.observations')
            .optional()
            .isString().withMessage('observations debe ser texto').bail()
            .trim()
            .isLength({ max: OBSERVATIONS_MAX }).withMessage(`observations: máximo ${OBSERVATIONS_MAX} caracteres`),
        body('results.*.correctionReason')
            .optional()
            .isString().withMessage('correctionReason debe ser texto').bail()
            .trim()
            .isLength({ max: CORRECTION_REASON_MAX }).withMessage(`correctionReason: máximo ${CORRECTION_REASON_MAX} caracteres`)
    ]),
    validate
]

const thresholdQuery = () =>
    query('threshold').optional().isFloat({ min: 0, max: 100 }).withMessage('threshold debe estar entre 0 y 100').toFloat()

export const studentResultsValidator = [
    checkExact([idParam('estudiante'), query('subjectId').optional().isMongoId().withMessage('subjectId inválido'), dateQuery('from'), dateQuery('to')]),
    validate
]

export const studentProgressValidator = [
    checkExact([
        idParam('estudiante'),
        query('subjectId').optional().isMongoId().withMessage('subjectId inválido'),
        dateQuery('from'),
        dateQuery('to'),
        thresholdQuery()
    ]),
    validate
]

export const classroomPerformanceValidator = [
    checkExact([
        idParam('aula'),
        query('subjectId').optional().isMongoId().withMessage('subjectId inválido'),
        dateQuery('from'),
        dateQuery('to'),
        thresholdQuery()
    ]),
    validate
]
