import { Router } from 'express'
import { register, login, me } from '../controllers/auth.controller.js'
import { registerValidator, loginValidator } from '../validators/auth.validator.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { loginLimiter, registerLimiter } from '../middlewares/rateLimit.middleware.js'

const router = Router()

// Públicas
router.post('/register', registerLimiter, registerValidator, register)
router.post('/login', loginLimiter, loginValidator, login)

// Privada
router.get('/me', requireAuth, me)

export default router
