import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import {
    getMethodologies,
    getMethodology,
    postMethodology,
    patchMethodology,
    deleteMethodology
} from '../controllers/methodology.controller.js'
import {
    listMethodsValidator,
    methodIdValidator,
    createMethodValidator,
    updateMethodValidator
} from '../validators/methodology.validator.js'

// Predeterminadas: solo lectura. Personalizadas: solo su autor las ve y modifica.
const router = Router()
router.use(requireAuth)

router.get('/', listMethodsValidator, getMethodologies)
router.get('/:id', methodIdValidator, getMethodology)
router.post('/', createMethodValidator, postMethodology)
router.patch('/:id', updateMethodValidator, patchMethodology)
router.delete('/:id', methodIdValidator, deleteMethodology) // archivado lógico

export default router
