import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { postAssessment, getAssessments, getAssessment, postResults } from '../controllers/assessment.controller.js'
import {
    createAssessmentValidator,
    listAssessmentsValidator,
    assessmentIdValidator,
    recordResultsValidator
} from '../validators/assessment.validator.js'

// Todas privadas; cada servicio comprueba que la evaluación o el aula sean del docente.
const router = Router()
router.use(requireAuth)

router.get('/', listAssessmentsValidator, getAssessments)
router.post('/', createAssessmentValidator, postAssessment)
router.get('/:id', assessmentIdValidator, getAssessment)
router.post('/:id/results', recordResultsValidator, postResults)

export default router
