import { updateOwnProfile } from '../services/teacher.service.js'

export const updateMe = async (req, res) => {
    const teacher = await updateOwnProfile(req.user.id, req.body)
    res.status(200).json({
        success: true,
        message: 'Perfil actualizado',
        data: { teacher }
    })
}
