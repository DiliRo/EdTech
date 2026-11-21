import TeachingMethod from '../models/teachingMethod.model.js'
import Subject from '../models/subject.model.js'
import Grade from '../models/grade.model.js'
import { AppError } from '../utils/AppError.js'

export const METHOD_NOT_FOUND = 'Metodología no encontrada'
export const DEFAULT_READ_ONLY = 'Las metodologías predeterminadas no se pueden modificar. Puedes crear una propia basada en ella.'

export const EDITABLE_METHOD_FIELDS = [
    'name', 'description', 'objectives', 'steps', 'suggestedActivities', 'materials',
    'estimatedDuration', 'compatibleSubjects', 'compatibleGrades', 'learningPreferences', 'sourceReference'
]

/** Lo que un docente puede ver: las predeterminadas y las suyas. */
const visibleTo = (teacherId) => ({ $or: [{ isDefault: true }, { createdBy: teacherId }] })

const scopeFilter = (teacherId, scope) => {
    if (scope === 'default') return { isDefault: true }
    if (scope === 'mine') return { createdBy: teacherId }
    return visibleTo(teacherId)
}

/** Una lista vacía de compatibilidad significa "aplicable a todas". */
const compatibleWith = (field, id) => ({ $or: [{ [field]: id }, { [field]: { $size: 0 } }] })

const withRelations = (query) =>
    query
        .populate('compatibleSubjects', 'code name isSample')
        .populate('compatibleGrades', 'number name level')

export const listMethods = async (teacherId, { scope = 'all', subject, grade, maxDuration, learningPreferences } = {}) => {
    const conditions = [scopeFilter(teacherId, scope), { isActive: true }]
    if (subject) conditions.push(compatibleWith('compatibleSubjects', subject))
    if (grade) conditions.push(compatibleWith('compatibleGrades', grade))
    // Metodologías cuya duración mínima cabe en el tiempo disponible (las que no indican duración no se incluyen)
    if (maxDuration !== undefined) conditions.push({ 'estimatedDuration.minMinutes': { $lte: maxDuration } })
    if (learningPreferences?.length) conditions.push({ learningPreferences: { $in: learningPreferences } })

    return withRelations(TeachingMethod.find({ $and: conditions })).sort({ isDefault: -1, name: 1 })
}

/** Busca una metodología visible para el docente. Las de otros docentes dan 404. */
const findVisible = async (teacherId, id, { populate = false } = {}) => {
    const query = TeachingMethod.findOne({ $and: [{ _id: id }, visibleTo(teacherId)] })
    const method = await (populate ? withRelations(query) : query)
    if (!method) throw new AppError(404, METHOD_NOT_FOUND)
    return method
}

/** Incluye pasos y actividades completos (para usar en guías de clase). Las archivadas propias siguen visibles por id. */
export const getMethod = async (teacherId, id) => {
    const method = await findVisible(teacherId, id, { populate: true })
    if (method.isDefault && !method.isActive) throw new AppError(404, METHOD_NOT_FOUND)
    return method
}

const assertReferencesExist = async ({ compatibleSubjects, compatibleGrades }) => {
    const errors = []
    const check = async (Model, ids, field, label) => {
        if (!ids?.length) return
        const found = new Set((await Model.find({ _id: { $in: ids } })).map((d) => d._id.toString()))
        ids.forEach((id, i) => {
            if (!found.has(String(id))) errors.push({ field: `${field}[${i}]`, message: `${label} no existe` })
        })
    }
    await check(Subject, compatibleSubjects, 'compatibleSubjects', 'La materia')
    await check(Grade, compatibleGrades, 'compatibleGrades', 'El grado')
    if (errors.length) throw new AppError(400, 'Errores de validación', errors)
}

export const createMethod = async (teacherId, data) => {
    await assertReferencesExist(data)
    const method = new TeachingMethod({
        ...Object.fromEntries(EDITABLE_METHOD_FIELDS.filter((f) => data[f] !== undefined).map((f) => [f, data[f]])),
        isDefault: false,
        createdBy: teacherId,
        isActive: true
    })
    await method.save()
    return findVisible(teacherId, method._id, { populate: true })
}

/** Solo el autor edita. Las predeterminadas responden 403 aunque el docente las pueda ver. */
const findEditable = async (teacherId, id) => {
    const method = await findVisible(teacherId, id)
    if (method.isDefault) throw new AppError(403, DEFAULT_READ_ONLY)
    return method
}

export const updateMethod = async (teacherId, id, changes) => {
    const method = await findEditable(teacherId, id)
    await assertReferencesExist(changes)

    for (const field of EDITABLE_METHOD_FIELDS) {
        if (changes[field] !== undefined) method[field] = changes[field]
    }
    if (changes.isActive !== undefined) method.isActive = changes.isActive

    await method.save()
    return findVisible(teacherId, id, { populate: true })
}

/** Archivado lógico: las guías que la usen podrán seguir consultándola. */
export const archiveMethod = async (teacherId, id) => {
    const method = await findEditable(teacherId, id)
    if (method.isActive) {
        method.isActive = false
        await method.save()
    }
    return method
}
