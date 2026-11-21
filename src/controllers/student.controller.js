import { matchedData } from 'express-validator'
import { updateStudent, archiveStudent } from '../services/student.service.js'

export const patchStudent = async (req, res) => {
    const changes = matchedData(req, { locations: ['body'] })
    const student = await updateStudent(req.user.id, req.params.id, changes)
    res.status(200).json({ success: true, message: 'Estudiante actualizado', data: { student } })
}

export const deleteStudent = async (req, res) => {
    const student = await archiveStudent(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Estudiante archivado', data: { student } })
}
