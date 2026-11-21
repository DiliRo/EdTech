import { body, param, query, checkExact } from 'express-validator'
import { validate } from '../middlewares/validate.middleware.js'
import {
    CLASSROOM_NAME_MAX,
    SECTION_MAX,
    SCHOOL_YEAR_RANGE,
    MAX_SUBJECTS_PER_CLASSROOM,
    STATUS_FILTERS
} from '../config/classroom.js'

export const idParam = (name, label) => param(name).isMongoId().withMessage(`Identificador de ${label} inválido`)

export const statusQuery = () =>
    query('status')
        .optional()
        .isIn(STATUS_FILTERS)
        .withMessage(`status debe ser: ${STATUS_FILTERS.join(', ')}`)

/** Exige que el cuerpo traiga al menos uno de los campos indicados. */
export const requireAtLeastOne = (fields) => (req, res, next) => {
    const body = req.body
    const isObject = body && typeof body === 'object' && !Array.isArray(body)
    if (isObject && fields.some((field) => field in body)) return next()
    return res.status(400).json({
        success: false,
        message: 'Errores de validación',
        errors: [{ field: 'body', message: `Envía al menos un campo: ${fields.join(', ')}` }]
    })
}

const nameRule = (optional) => {
    const chain = optional ? body('name').optional() : body('name')
    return chain
        .isString().withMessage('El nombre del aula es obligatorio').bail()
        .trim()
        .notEmpty().withMessage('El nombre del aula es obligatorio').bail()
        .isLength({ max: CLASSROOM_NAME_MAX }).withMessage(`Máximo ${CLASSROOM_NAME_MAX} caracteres`)
}

const gradeRule = (optional) => {
    const chain = optional ? body('gradeId').optional() : body('gradeId')
    return chain.isMongoId().withMessage('gradeId debe ser un identificador válido')
}

const sectionRule = (optional) => {
    const chain = optional ? body('section').optional() : body('section')
    return chain
        .isString().withMessage('La sección es obligatoria').bail()
        .trim()
        .notEmpty().withMessage('La sección es obligatoria').bail()
        .isLength({ max: SECTION_MAX }).withMessage(`Máximo ${SECTION_MAX} caracteres`).bail()
        .matches(/^[\p{L}0-9 -]+$/u).withMessage('La sección solo puede tener letras, números, espacios o guiones')
}

const schoolYearRule = (optional) => {
    const chain = optional ? body('schoolYear').optional() : body('schoolYear')
    return chain
        .isInt({ min: SCHOOL_YEAR_RANGE.min, max: SCHOOL_YEAR_RANGE.max })
        .withMessage(`El ciclo escolar debe ser un año entre ${SCHOOL_YEAR_RANGE.min} y ${SCHOOL_YEAR_RANGE.max}`)
        .bail()
        .toInt()
}

const subjectIdsRules = () => [
    body('subjectIds')
        .optional()
        .isArray({ max: MAX_SUBJECTS_PER_CLASSROOM })
        .withMessage(`subjectIds debe ser una lista de hasta ${MAX_SUBJECTS_PER_CLASSROOM} materias`)
        .bail()
        .custom((ids) => new Set(ids.map(String)).size === ids.length)
        .withMessage('Hay materias repetidas'),
    body('subjectIds.*').isMongoId().withMessage('Cada materia debe ser un identificador válido')
]

export const listClassroomsValidator = [
    checkExact([
        statusQuery(),
        query('schoolYear')
            .optional()
            .isInt({ min: SCHOOL_YEAR_RANGE.min, max: SCHOOL_YEAR_RANGE.max })
            .withMessage('schoolYear debe ser un año válido')
            .toInt()
    ], { locations: ['query'] }),
    validate
]

// teacherId e isActive no se aceptan al crear: el docente sale del token y el aula nace activa.
export const createClassroomValidator = [
    checkExact([nameRule(false), gradeRule(false), sectionRule(false), schoolYearRule(false), ...subjectIdsRules()]),
    validate
]

export const UPDATABLE_CLASSROOM_FIELDS = ['name', 'gradeId', 'section', 'schoolYear', 'subjectIds', 'isActive']

export const updateClassroomValidator = [
    checkExact([
        idParam('id', 'aula'),
        nameRule(true),
        gradeRule(true),
        sectionRule(true),
        schoolYearRule(true),
        ...subjectIdsRules(),
        body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive debe ser true o false')
    ]),
    validate,
    requireAtLeastOne(UPDATABLE_CLASSROOM_FIELDS)
]

export const classroomIdValidator = [idParam('id', 'aula'), validate]
