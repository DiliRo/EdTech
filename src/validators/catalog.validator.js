import { query, param, checkExact } from 'express-validator'
import { validate } from '../middlewares/validate.middleware.js'
import { EDUCATION_LEVELS } from '../config/curriculum.js'
import { TOPICS_MAX_LIMIT } from '../services/catalog.service.js'

const mongoId = (field, label) =>
    query(field).optional().isMongoId().withMessage(`${label} debe ser un identificador válido`)

export const listGradesValidator = [
    checkExact([
        query('level')
            .optional()
            .isIn(EDUCATION_LEVELS)
            .withMessage(`Nivel no soportado. Valores: ${EDUCATION_LEVELS.join(', ')}`)
    ], { locations: ['query'] }),
    validate
]

export const listSubjectsValidator = [
    checkExact([mongoId('grade', 'grade')], { locations: ['query'] }),
    validate
]

export const listTopicsValidator = [
    checkExact([
        mongoId('subject', 'subject'),
        mongoId('grade', 'grade'),
        query('page')
            .optional()
            .isInt({ min: 1, max: 100000 }).withMessage('page debe ser un entero mayor o igual a 1')
            .toInt(),
        query('limit')
            .optional()
            .isInt({ min: 1, max: TOPICS_MAX_LIMIT }).withMessage(`limit debe estar entre 1 y ${TOPICS_MAX_LIMIT}`)
            .toInt()
    ], { locations: ['query'] }),
    validate
]

export const topicIdValidator = [
    param('id').isMongoId().withMessage('Identificador de tema inválido'),
    validate
]
