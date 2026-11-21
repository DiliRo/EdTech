import { Router } from 'express'
import { updateMe } from '../controllers/teacher.controller.js'
import { updateProfileValidator } from '../validators/teacher.validator.js'
import { requireAuth } from '../middlewares/auth.middleware.js'

const router = Router()

// Todas las rutas de docentes son privadas.
router.use(requireAuth)

router.patch('/me', updateProfileValidator, updateMe)

export default router
