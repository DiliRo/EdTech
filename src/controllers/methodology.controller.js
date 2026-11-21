import { matchedData } from 'express-validator'
import { listMethods, getMethod, createMethod, updateMethod, archiveMethod } from '../services/methodology.service.js'
import { LEARNING_PREFERENCES } from '../config/methodology.js'
import { EDITABLE_METHOD_FIELDS } from '../services/methodology.service.js'

// checkExact ya rechazó campos desconocidos y los sanitizadores (trim, toInt) actualizaron req.body.
// Se copia de req.body para conservar valores null (p. ej. estimatedDuration: null borra la duración).
const validBody = (req) =>
    Object.fromEntries(
        [...EDITABLE_METHOD_FIELDS, 'isActive'].filter((f) => f in req.body).map((f) => [f, req.body[f]])
    )

export const getMethodologies = async (req, res) => {
    const methods = await listMethods(req.user.id, matchedData(req, { locations: ['query'] }))
    res.status(200).json({
        success: true,
        message: 'Metodologías',
        data: { methodologies: methods },
        // Catálogo de preferencias para que el frontend muestre etiquetas y filtros
        meta: { learningPreferences: LEARNING_PREFERENCES }
    })
}

export const getMethodology = async (req, res) => {
    const method = await getMethod(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Metodología', data: { methodology: method } })
}

export const postMethodology = async (req, res) => {
    const method = await createMethod(req.user.id, validBody(req))
    res.status(201).json({ success: true, message: 'Metodología creada', data: { methodology: method } })
}

export const patchMethodology = async (req, res) => {
    const method = await updateMethod(req.user.id, req.params.id, validBody(req))
    res.status(200).json({ success: true, message: 'Metodología actualizada', data: { methodology: method } })
}

export const deleteMethodology = async (req, res) => {
    const method = await archiveMethod(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Metodología archivada', data: { methodology: method } })
}
