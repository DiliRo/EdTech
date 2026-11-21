import { body, query, param, checkExact } from 'express-validator'
import { validate } from '../middlewares/validate.middleware.js'
import { requireAtLeastOne } from './classroom.validator.js'
import { GUIDE_STATUSES } from '../models/lessonGuide.model.js'
import { EDITABLE_CONTENT_FIELDS } from '../services/lessonGuide.service.js'
import { CONTEXT_LIMITS } from '../services/ai/lessonGuidePrompt.js'

export const DURATION_LIMITS = Object.freeze({ min: 10, max: 240 })

const mongo = (field, { optional = false, nullable = false } = {}) => {
    let chain = body(field)
    if (optional) chain = chain.optional(nullable ? { values: 'null' } : undefined)
    return chain.isMongoId().withMessage(`${field} debe ser un identificador válido`)
}

const duration = ({ optional = false } = {}) => {
    const chain = optional ? body('durationMinutes').optional() : body('durationMinutes')
    return chain
        .isInt(DURATION_LIMITS).withMessage(`durationMinutes debe estar entre ${DURATION_LIMITS.min} y ${DURATION_LIMITS.max}`)
        .toInt()
}

/** Sin `guideId` se generan desde cero (grado, materia, metodología y duración obligatorios). */
const requiredUnlessRegenerating = (field) =>
    body(field).if(body('guideId').not().exists())
        .exists({ values: 'null' }).withMessage(`${field} es obligatorio`)

export const generateGuideValidator = [
    checkExact([
        mongo('guideId', { optional: true }),
        requiredUnlessRegenerating('gradeId'),
        requiredUnlessRegenerating('subjectId'),
        requiredUnlessRegenerating('teachingMethodId'),
        requiredUnlessRegenerating('durationMinutes'),
        mongo('gradeId', { optional: true }),
        mongo('subjectId', { optional: true }),
        mongo('topicId', { optional: true, nullable: true }),
        mongo('teachingMethodId', { optional: true }),
        duration({ optional: true }),
        body('additionalInstructions')
            .optional()
            .isString().withMessage('additionalInstructions debe ser texto').bail()
            .trim()
            .isLength({ max: CONTEXT_LIMITS.additionalInstructions })
            .withMessage(`additionalInstructions: máximo ${CONTEXT_LIMITS.additionalInstructions} caracteres`)
    ]),
    validate,
    // Al regenerar, grado, materia y tema son los de la guía: no se pueden cambiar
    (req, res, next) => {
        if (!req.body.guideId) return next()
        const locked = ['gradeId', 'subjectId', 'topicId'].filter((f) => f in req.body)
        if (!locked.length) return next()
        return res.status(400).json({
            success: false,
            message: 'Errores de validación',
            errors: locked.map((field) => ({ field, message: 'No se puede cambiar al regenerar una guía' }))
        })
    }
]

/** El contenido se valida en el servicio con validateGuideContent; aquí solo se aceptan sus claves. */
const contentKeys = () => EDITABLE_CONTENT_FIELDS.map((f) => body(f).optional())

export const createGuideValidator = [
    checkExact([
        mongo('gradeId'),
        mongo('subjectId'),
        mongo('topicId', { optional: true, nullable: true }),
        mongo('teachingMethodId'),
        duration(),
        body('status').optional().isIn(GUIDE_STATUSES).withMessage(`status debe ser: ${GUIDE_STATUSES.join(', ')}`),
        ...contentKeys()
    ]),
    validate
]

export const updateGuideValidator = [
    checkExact([
        param('id').isMongoId().withMessage('Identificador de guía inválido'),
        body('status').optional().isIn(GUIDE_STATUSES).withMessage(`status debe ser: ${GUIDE_STATUSES.join(', ')}`),
        ...contentKeys()
    ]),
    validate,
    requireAtLeastOne([...EDITABLE_CONTENT_FIELDS, 'status'])
]

export const guideIdValidator = [param('id').isMongoId().withMessage('Identificador de guía inválido'), validate]

export const listGuidesValidator = [
    checkExact([
        query('status').optional().isIn(GUIDE_STATUSES).withMessage(`status debe ser: ${GUIDE_STATUSES.join(', ')}`),
        query('gradeId').optional().isMongoId().withMessage('gradeId inválido'),
        query('subjectId').optional().isMongoId().withMessage('subjectId inválido'),
        query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('page inválido').toInt(),
        query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit debe estar entre 1 y 50').toInt()
    ], { locations: ['query'] }),
    validate
]
