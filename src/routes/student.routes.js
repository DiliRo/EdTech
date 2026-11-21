import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { patchStudent, deleteStudent } from '../controllers/student.controller.js'
import { updateStudentValidator, studentIdValidator } from '../validators/student.validator.js'
import { getResultsOfStudent, getProgressOfStudent } from '../controllers/assessment.controller.js'
import { studentResultsValidator, studentProgressValidator } from '../validators/assessment.validator.js'

// Los estudiantes no tienen sesión: estas rutas las usa el docente dueño del aula.
const router = Router()
router.use(requireAuth)

router.patch('/:id', updateStudentValidator, patchStudent)
router.delete('/:id', studentIdValidator, deleteStudent) // archivado lógico

// Seguimiento académico: se consulta por el _id del estudiante, nunca por su código
router.get('/:id/results', studentResultsValidator, getResultsOfStudent)
router.get('/:id/progress', studentProgressValidator, getProgressOfStudent)

export default router
