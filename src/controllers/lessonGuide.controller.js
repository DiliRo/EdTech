import { matchedData } from 'express-validator'
import {
    generateGuide,
    createManualGuide,
    listGuides,
    findOwnedGuide,
    updateGuide,
    GUIDE_DISCLAIMER
} from '../services/lessonGuide.service.js'

const meta = { disclaimer: GUIDE_DISCLAIMER }

// checkExact ya rechazó campos no permitidos; el contenido se valida en el servicio.
const bodyOf = (req) => ({ ...req.body })

export const postGenerate = async (req, res) => {
    const guide = await generateGuide(req.user.id, bodyOf(req))
    const regenerated = Boolean(req.body.guideId)
    res.status(regenerated ? 200 : 201).json({
        success: true,
        message: regenerated ? 'Guía regenerada como borrador' : 'Guía generada como borrador',
        data: { guide },
        meta
    })
}

export const postGuide = async (req, res) => {
    const guide = await createManualGuide(req.user.id, bodyOf(req))
    res.status(201).json({ success: true, message: 'Guía guardada', data: { guide }, meta })
}

export const getGuides = async (req, res) => {
    const { guides, pagination } = await listGuides(req.user.id, matchedData(req, { locations: ['query'] }))
    res.status(200).json({ success: true, message: 'Guías', data: { guides }, meta: { ...meta, ...pagination } })
}

export const getGuide = async (req, res) => {
    const guide = await findOwnedGuide(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Guía', data: { guide }, meta })
}

export const patchGuide = async (req, res) => {
    const guide = await updateGuide(req.user.id, req.params.id, bodyOf(req))
    res.status(200).json({ success: true, message: 'Guía actualizada', data: { guide }, meta })
}
