import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { aiConfig } from '../config/ai.js'
import {
    postExperiment,
    getExperiments,
    getExperiment,
    patchExperiment,
    postObservation,
    getExperimentStatistics,
    postReport,
    getReports,
    getReport,
    patchReport
} from '../controllers/teachingExperiment.controller.js'
import {
    createExperimentValidator,
    updateExperimentValidator,
    experimentIdValidator,
    listExperimentsValidator,
    addObservationValidator,
    generateReportValidator,
    reportIdValidator,
    updateReportValidator
} from '../validators/teachingExperiment.validator.js'

/** Límite por docente para generar reportes (pueden llamar a la IA). */
const reportLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: aiConfig.perMinuteLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `experiment-report:${req.user.id}`,
    message: { success: false, message: 'Demasiados reportes seguidos. Espera un minuto.' }
})

// Todas privadas: solo el docente dueño del seguimiento accede.
const router = Router()
router.use(requireAuth)

router.post('/', createExperimentValidator, postExperiment)
router.get('/', listExperimentsValidator, getExperiments)
router.get('/:id', experimentIdValidator, getExperiment)
router.patch('/:id', updateExperimentValidator, patchExperiment)
router.post('/:id/periods/:index/observations', addObservationValidator, postObservation)
router.get('/:id/statistics', experimentIdValidator, getExperimentStatistics)
router.post('/:id/report', reportLimiter, generateReportValidator, postReport)
router.get('/:id/reports', experimentIdValidator, getReports)
router.get('/:id/reports/:reportId', reportIdValidator, getReport)
router.patch('/:id/reports/:reportId', updateReportValidator, patchReport)

export default router
