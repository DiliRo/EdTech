import Student from '../models/student.model.js'
import { AppError } from '../utils/AppError.js'
import { findOwnedClassroom, CLASSROOM_NOT_FOUND } from './classroom.service.js'
import { statusToFilter } from '../config/classroom.js'

export const STUDENT_NOT_FOUND = 'Estudiante no encontrado'

const duplicateCodeError = (code) =>
    new AppError(409, `Ya existe un estudiante con el código "${code}" en esta aula`, [
        { field: 'studentCode', message: 'El código ya está en uso en esta aula (también cuenta a los archivados)' }
    ])

const normalizeCode = (code) => String(code).trim().toUpperCase()

/** Validación de aplicación; el índice único compuesto es la garantía final. */
const assertCodeAvailable = async (classroomId, studentCode, exceptStudentId) => {
    const filter = { classroomId, studentCode }
    if (exceptStudentId) filter._id = { $ne: exceptStudentId }
    if (await Student.exists(filter)) throw duplicateCodeError(studentCode)
}

const saveHandlingDuplicates = async (student) => {
    try {
        await student.save()
    } catch (err) {
        // Dos peticiones simultáneas con el mismo código: lo detiene el índice único.
        if (err?.code === 11000) throw duplicateCodeError(student.studentCode)
        throw err
    }
    return student
}

/**
 * Busca un estudiante y comprueba que su aula sea del docente.
 * Si el aula es de otro docente responde 404 igual que si no existiera.
 */
const findOwnedStudent = async (teacherId, studentId) => {
    const student = await Student.findById(studentId)
    if (!student) throw new AppError(404, STUDENT_NOT_FOUND)
    try {
        const classroom = await findOwnedClassroom(teacherId, student.classroomId)
        return { student, classroom }
    } catch (err) {
        if (err instanceof AppError && err.message === CLASSROOM_NOT_FOUND) {
            throw new AppError(404, STUDENT_NOT_FOUND)
        }
        throw err
    }
}

export const listStudents = async (teacherId, classroomId, { status } = {}) => {
    await findOwnedClassroom(teacherId, classroomId)
    return Student.find({ classroomId, ...statusToFilter(status) }).sort({ studentCode: 1 })
}

export const createStudent = async (teacherId, classroomId, { studentCode }) => {
    const classroom = await findOwnedClassroom(teacherId, classroomId)
    if (!classroom.isActive) {
        throw new AppError(409, 'No se pueden agregar estudiantes a un aula archivada')
    }

    const code = normalizeCode(studentCode)
    await assertCodeAvailable(classroom._id, code)

    const student = new Student({ studentCode: code, classroomId: classroom._id, isActive: true })
    return saveHandlingDuplicates(student)
}

/**
 * Cambia el código visible y/o restaura un estudiante archivado.
 * El `_id` no cambia, así que el historial ligado a él se conserva.
 */
export const updateStudent = async (teacherId, studentId, changes) => {
    const { student, classroom } = await findOwnedStudent(teacherId, studentId)

    if (changes.isActive === true && !classroom.isActive) {
        throw new AppError(409, 'Restaura primero el aula para reactivar al estudiante')
    }

    if (changes.studentCode !== undefined) {
        const code = normalizeCode(changes.studentCode)
        if (code !== student.studentCode) {
            await assertCodeAvailable(student.classroomId, code, student._id)
            student.studentCode = code
        }
    }
    if (changes.isActive !== undefined) student.isActive = changes.isActive

    return saveHandlingDuplicates(student)
}

/** Archivado lógico: el registro y su `_id` se conservan. Repetirlo no da error. */
export const archiveStudent = async (teacherId, studentId) => {
    const { student } = await findOwnedStudent(teacherId, studentId)
    if (student.isActive) {
        student.isActive = false
        await student.save()
    }
    return student
}
