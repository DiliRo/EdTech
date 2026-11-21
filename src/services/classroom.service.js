import Classroom from '../models/classroom.model.js'
import Grade from '../models/grade.model.js'
import Subject from '../models/subject.model.js'
import { AppError } from '../utils/AppError.js'
import { statusToFilter } from '../config/classroom.js'

export const CLASSROOM_NOT_FOUND = 'Aula no encontrada'

const EDITABLE_FIELDS = ['name', 'gradeId', 'section', 'schoolYear', 'subjectIds']

const withRelations = (query) =>
    query
        .populate('grade', 'number name level')
        .populate('subjects', 'code name isSample')
        .populate('activeStudentCount')

/**
 * Busca un aula SOLO si pertenece al docente. Para cualquier otro docente
 * responde 404 (no 403), así no se revela que el aula existe.
 * Todas las operaciones de aulas y estudiantes pasan por aquí.
 */
export const findOwnedClassroom = async (teacherId, classroomId, { populate = false } = {}) => {
    const query = Classroom.findOne({ _id: classroomId, teacherId })
    const classroom = await (populate ? withRelations(query) : query)
    if (!classroom) throw new AppError(404, CLASSROOM_NOT_FOUND)
    return classroom
}

/** El grado debe existir y cada materia debe existir e impartirse en ese grado. */
const assertGradeAndSubjects = async (gradeId, subjectIds = []) => {
    const grade = await Grade.findById(gradeId)
    if (!grade) {
        throw new AppError(400, 'Errores de validación', [{ field: 'gradeId', message: 'El grado no existe' }])
    }
    if (!subjectIds.length) return

    const subjects = await Subject.find({ _id: { $in: subjectIds } })
    const found = new Map(subjects.map((s) => [s._id.toString(), s]))
    const errors = []

    subjectIds.forEach((id, i) => {
        const subject = found.get(String(id))
        if (!subject) {
            errors.push({ field: `subjectIds[${i}]`, message: 'La materia no existe' })
        } else if (!subject.grades.some((g) => g.toString() === grade._id.toString())) {
            errors.push({ field: `subjectIds[${i}]`, message: `"${subject.name}" no se imparte en ${grade.name}` })
        }
    })

    if (errors.length) throw new AppError(400, 'Errores de validación', errors)
}

export const listClassrooms = async (teacherId, { status, schoolYear } = {}) => {
    const filter = { teacherId, ...statusToFilter(status) }
    if (schoolYear !== undefined) filter.schoolYear = schoolYear
    return withRelations(Classroom.find(filter)).sort({ schoolYear: -1, name: 1 })
}

export const createClassroom = async (teacherId, data) => {
    const subjectIds = data.subjectIds ?? []
    await assertGradeAndSubjects(data.gradeId, subjectIds)

    const classroom = new Classroom({
        name: data.name,
        gradeId: data.gradeId,
        section: data.section,
        schoolYear: data.schoolYear,
        subjectIds,
        teacherId,
        isActive: true
    })
    await classroom.save()
    return findOwnedClassroom(teacherId, classroom._id, { populate: true })
}

export const getClassroom = (teacherId, classroomId) =>
    findOwnedClassroom(teacherId, classroomId, { populate: true })

/**
 * Edita un aula propia. `isActive: true` la restaura si estaba archivada.
 * Un aula archivada no se puede editar sin restaurarla en la misma petición.
 */
export const updateClassroom = async (teacherId, classroomId, changes) => {
    const classroom = await findOwnedClassroom(teacherId, classroomId)

    if (!classroom.isActive && changes.isActive !== true) {
        throw new AppError(409, 'El aula está archivada. Restáurala con "isActive": true para editarla.')
    }

    const gradeId = changes.gradeId ?? classroom.gradeId
    const subjectIds = changes.subjectIds ?? classroom.subjectIds
    if (changes.gradeId !== undefined || changes.subjectIds !== undefined) {
        await assertGradeAndSubjects(gradeId, subjectIds)
    }

    for (const field of EDITABLE_FIELDS) {
        if (changes[field] !== undefined) classroom[field] = changes[field]
    }
    if (changes.isActive !== undefined) classroom.isActive = changes.isActive

    await classroom.save()
    return findOwnedClassroom(teacherId, classroomId, { populate: true })
}

/**
 * Archivado lógico. No toca a los estudiantes ni (en el futuro) sus evaluaciones.
 * Repetirlo no da error.
 */
export const archiveClassroom = async (teacherId, classroomId) => {
    const classroom = await findOwnedClassroom(teacherId, classroomId)
    if (classroom.isActive) {
        classroom.isActive = false
        await classroom.save()
    }
    return findOwnedClassroom(teacherId, classroomId, { populate: true })
}
