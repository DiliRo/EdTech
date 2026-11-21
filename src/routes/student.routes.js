import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { patchStudent, deleteStudent } from '../controllers/student.controller.js'
import { updateStudentValidator, studentIdValidator } from '../validators/student.validator.js'

// Los estudiantes no tienen sesión: estas rutas las usa el docente dueño del aula.
const router = Router()
router.use(requireAuth)

router.patch('/:id', updateStudentValidator, patchStudent)
router.delete('/:id', studentIdValidator, deleteStudent) // archivado lógico

export default router
