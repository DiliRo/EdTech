import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { getGrades, getSubjects, getTopics, getTopic } from '../controllers/catalog.controller.js'
import {
    listGradesValidator,
    listSubjectsValidator,
    listTopicsValidator,
    topicIdValidator
} from '../validators/catalog.validator.js'

/**
 * Catálogo curricular: SOLO LECTURA para docentes autenticados.
 * Los datos se cargan con el script de importación (npm run catalog:import),
 * nunca desde la API.
 */
export const gradeRoutes = Router().get('/', requireAuth, listGradesValidator, getGrades)

export const subjectRoutes = Router().get('/', requireAuth, listSubjectsValidator, getSubjects)

export const topicRoutes = Router()
    .get('/', requireAuth, listTopicsValidator, getTopics)
    .get('/:id', requireAuth, topicIdValidator, getTopic)
