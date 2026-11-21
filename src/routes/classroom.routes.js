import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import {
    getClassrooms,
    postClassroom,
    getClassroomById,
    patchClassroom,
    deleteClassroom,
    getClassroomStudents,
    postClassroomStudent
} from '../controllers/classroom.controller.js'
import {
    listClassroomsValidator,
    createClassroomValidator,
    updateClassroomValidator,
    classroomIdValidator
} from '../validators/classroom.validator.js'
import { listStudentsValidator, createStudentValidator } from '../validators/student.validator.js'
import { getPerformanceOfClassroom } from '../controllers/assessment.controller.js'
import { classroomPerformanceValidator } from '../validators/assessment.validator.js'

// Todas las rutas son privadas; cada servicio además comprueba que el aula sea del docente.
const router = Router()
router.use(requireAuth)

router.get('/', listClassroomsValidator, getClassrooms)
router.post('/', createClassroomValidator, postClassroom)
router.get('/:id', classroomIdValidator, getClassroomById)
router.patch('/:id', updateClassroomValidator, patchClassroom)
router.delete('/:id', classroomIdValidator, deleteClassroom) // archivado lógico

router.get('/:id/students', listStudentsValidator, getClassroomStudents)
router.post('/:id/students', createStudentValidator, postClassroomStudent)

router.get('/:id/performance', classroomPerformanceValidator, getPerformanceOfClassroom)

export default router
