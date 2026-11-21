import Teacher, { UPDATABLE_PROFILE_FIELDS } from '../models/teacher.model.js'
import { AppError } from '../utils/AppError.js'

/**
 * Actualiza el perfil del docente autenticado. Solo copia los campos
 * permitidos, aunque el validador ya haya rechazado los demás.
 */
export const updateOwnProfile = async (teacherId, changes) => {
    const teacher = await Teacher.findById(teacherId)
    if (!teacher) throw new AppError(404, 'Docente no encontrado')

    for (const field of UPDATABLE_PROFILE_FIELDS) {
        if (changes[field] !== undefined) teacher[field] = changes[field]
    }

    await teacher.save()
    return teacher
}
