import { body, query, param, checkExact } from 'express-validator'
import { validate } from '../middlewares/validate.middleware.js'
import { requireAtLeastOne } from './classroom.validator.js'
import {
    LEARNING_PREFERENCE_CODES,
    MIN_PREFERENCES_WHEN_SET,
    DURATION_RANGE,
    METHOD_LIMITS as L,
    METHOD_SCOPES
} from '../config/methodology.js'

const text = (field, label, max, { optional = false } = {}) => {
    const chain = optional ? body(field).optional() : body(field)
    return chain
        .isString().withMessage(`${label} debe ser texto`).bail()
        .trim()
        .notEmpty().withMessage(`${label} es obligatorio`).bail()
        .isLength({ max }).withMessage(`${label}: máximo ${max} caracteres`)
}

const optionalText = (field, label, max) =>
    body(field).optional({ values: 'null' })
        .isString().withMessage(`${label} debe ser texto`).bail()
        .trim()
        .isLength({ max }).withMessage(`${label}: máximo ${max} caracteres`)

const list = (field, label) =>
    body(field).optional().isArray({ max: L.listMax }).withMessage(`${label} debe ser una lista de hasta ${L.listMax} elementos`)

const idList = (field, label) => [
    body(field)
        .optional()
        .isArray({ max: L.compatibleMax }).withMessage(`${label} debe ser una lista de identificadores`).bail()
        .custom((ids) => new Set(ids.map(String)).size === ids.length).withMessage(`${label} tiene elementos repetidos`),
    body(`${field}.*`).isMongoId().withMessage('Identificador inválido')
]

/** Campos editables de una metodología propia. `optional` = todos opcionales (PATCH). */
const methodRules = (optional) => [
    text('name', 'El nombre', L.name, { optional }),
    text('description', 'La descripción', L.description, { optional }),

    list('objectives', 'objectives'),
    text('objectives.*', 'Cada objetivo', L.item),

    list('steps', 'steps'),
    body('steps.*').isObject().withMessage('Cada paso debe ser un objeto con description'),
    optionalText('steps.*.title', 'El título del paso', L.title),
    text('steps.*.description', 'La descripción del paso', L.item),

    list('suggestedActivities', 'suggestedActivities'),
    body('suggestedActivities.*').isObject().withMessage('Cada actividad debe ser un objeto con title'),
    text('suggestedActivities.*.title', 'El título de la actividad', L.title),
    optionalText('suggestedActivities.*.description', 'La descripción de la actividad', L.item),

    list('materials', 'materials'),
    text('materials.*', 'Cada material', L.title),

    // null borra la duración
    body('estimatedDuration')
        .optional({ values: 'null' })
        .isObject().withMessage('estimatedDuration debe tener minMinutes y maxMinutes').bail()
        .custom((d) => d.minMinutes <= d.maxMinutes).withMessage('La duración mínima no puede ser mayor que la máxima'),
    body(['estimatedDuration.minMinutes', 'estimatedDuration.maxMinutes'])
        .if(body('estimatedDuration').exists({ values: 'null' }))
        .isInt(DURATION_RANGE).withMessage(`La duración debe estar entre ${DURATION_RANGE.min} y ${DURATION_RANGE.max} minutos`)
        .toInt(),

    ...idList('compatibleSubjects', 'compatibleSubjects'),
    ...idList('compatibleGrades', 'compatibleGrades'),

    body('learningPreferences')
        .optional()
        .isArray().withMessage('learningPreferences debe ser una lista').bail()
        .custom((v) => new Set(v).size === v.length).withMessage('Hay preferencias repetidas').bail()
        .custom((v) => v.length === 0 || v.length >= MIN_PREFERENCES_WHEN_SET)
        .withMessage('Indica al menos dos preferencias: una metodología no es exclusiva de un estilo de aprendizaje'),
    body('learningPreferences.*')
        .isIn(LEARNING_PREFERENCE_CODES)
        .withMessage(`Preferencia no soportada. Valores: ${LEARNING_PREFERENCE_CODES.join(', ')}`),

    // Fuente pedagógica opcional para las metodologías propias (null la borra)
    body('sourceReference').optional({ values: 'null' }).isObject().withMessage('sourceReference debe ser un objeto'),
    optionalText('sourceReference.title', 'El título de la fuente', L.referenceText),
    optionalText('sourceReference.institution', 'La institución', L.referenceText),
    body('sourceReference.year').optional().isInt({ min: 1900, max: 2100 }).withMessage('Año inválido').toInt(),
    optionalText('sourceReference.section', 'La sección', L.referenceText),
    optionalText('sourceReference.pages', 'Las páginas', 30),
    body('sourceReference.url')
        .optional()
        .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('URL inválida'),
    optionalText('sourceReference.notes', 'Las notas', L.notes)
]

// isDefault, createdBy, defaultKey e isActive no se aceptan: checkExact los rechaza.
export const createMethodValidator = [checkExact(methodRules(false)), validate]

export const updateMethodValidator = [
    checkExact([
        param('id').isMongoId().withMessage('Identificador de metodología inválido'),
        ...methodRules(true),
        body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive debe ser true o false')
    ]),
    validate,
    requireAtLeastOne([
        'name', 'description', 'objectives', 'steps', 'suggestedActivities', 'materials', 'estimatedDuration',
        'compatibleSubjects', 'compatibleGrades', 'learningPreferences', 'sourceReference', 'isActive'
    ])
]

export const methodIdValidator = [param('id').isMongoId().withMessage('Identificador de metodología inválido'), validate]

/** `learningPreferences` acepta varios valores separados por coma: ?learningPreferences=visual,auditiva */
export const listMethodsValidator = [
    checkExact([
        query('scope').optional().isIn(METHOD_SCOPES).withMessage(`scope debe ser: ${METHOD_SCOPES.join(', ')}`),
        query('subject').optional().isMongoId().withMessage('subject debe ser un identificador válido'),
        query('grade').optional().isMongoId().withMessage('grade debe ser un identificador válido'),
        query('maxDuration')
            .optional()
            .isInt(DURATION_RANGE).withMessage(`maxDuration debe estar entre ${DURATION_RANGE.min} y ${DURATION_RANGE.max}`)
            .toInt(),
        query('learningPreferences')
            .optional()
            .isString().withMessage('learningPreferences debe ser texto separado por comas').bail()
            .customSanitizer((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
            .custom((values) => values.length > 0 && values.every((v) => LEARNING_PREFERENCE_CODES.includes(v)))
            .withMessage(`Preferencias válidas: ${LEARNING_PREFERENCE_CODES.join(', ')}`)
    ], { locations: ['query'] }),
    validate
]
