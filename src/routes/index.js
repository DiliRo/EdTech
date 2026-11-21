import { Router } from 'express'
import healthRoutes from './health.routes.js'

// Punto único donde se registran las rutas de la API. Cada módulo nuevo agrega aquí su router.
const router = Router()

router.use('/health', healthRoutes)

export default router
