import { Router } from 'express'
import healthRoutes from './health.routes.js'
import authRoutes from './auth.routes.js'
import teacherRoutes from './teacher.routes.js'

// Punto único donde se registran las rutas de la API. Cada módulo nuevo agrega aquí su router.
const router = Router()

router.use('/health', healthRoutes)
router.use('/auth', authRoutes)
router.use('/teachers', teacherRoutes)

export default router
