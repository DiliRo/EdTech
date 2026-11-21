import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { aiConfig } from '../config/ai.js'
import { postGenerate, postGuide, getGuides, getGuide, patchGuide } from '../controllers/lessonGuide.controller.js'
import {
    generateGuideValidator,
    createGuideValidator,
    updateGuideValidator,
    guideIdValidator,
    listGuidesValidator
} from '../validators/lessonGuide.validator.js'

/** Límite por docente (no por IP) para la generación con IA. El límite diario se aplica en el servicio. */
const generationLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: aiConfig.perMinuteLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `guide-gen:${req.user.id}`,
    message: { success: false, message: 'Demasiadas generaciones seguidas. Espera un minuto.' }
})

const router = Router()
router.use(requireAuth)

router.post('/generate', generationLimiter, generateGuideValidator, postGenerate)
router.post('/', createGuideValidator, postGuide)
router.get('/', listGuidesValidator, getGuides)
router.get('/:id', guideIdValidator, getGuide)
router.patch('/:id', updateGuideValidator, patchGuide)

export default router
