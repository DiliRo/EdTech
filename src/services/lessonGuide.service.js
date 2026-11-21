import LessonGuide, { MAX_GENERATIONS_KEPT } from '../models/lessonGuide.model.js'
import Grade from '../models/grade.model.js'
import Subject from '../models/subject.model.js'
import Topic from '../models/topic.model.js'
import TeachingMethod from '../models/teachingMethod.model.js'
import { AppError } from '../utils/AppError.js'
import { aiConfig } from '../config/ai.js'
import { runStructuredGeneration, assertDailyQuota } from './ai/runStructured.js'
import { buildGuideContext, buildUserPrompt, SYSTEM_PROMPT, PROMPT_VERSION } from './ai/lessonGuidePrompt.js'
import { validateGuideContent } from '../validators/lessonGuideContent.js'

export const GUIDE_NOT_FOUND = 'Guía no encontrada'
export const GUIDE_DISCLAIMER =
    'Esta guía es una propuesta editable para apoyar la planificación; no es una instrucción obligatoria. ' +
    'Revísala y adáptala a tu aula.'

/** Campos de contenido que el docente puede escribir o editar. `curriculumGaps` lo calcula el servidor. */
export const EDITABLE_CONTENT_FIELDS = [
    'title', 'objectives', 'opening', 'development', 'closing', 'materials', 'shortAssessment', 'teacherRecommendations'
]

const sameId = (a, b) => a != null && b != null && a.toString() === b.toString()
const validationError = (errors) => new AppError(400, 'Errores de validación', errors)

// ── Referencias curriculares ─────────────────────────────────

/** Valida grado, materia, tema y metodología, y devuelve los documentos. */
const resolveReferences = async (teacherId, { gradeId, subjectId, topicId, teachingMethodId }) => {
    const errors = []
    const [grade, subject, topic, method] = await Promise.all([
        Grade.findById(gradeId),
        Subject.findById(subjectId),
        topicId ? Topic.findById(topicId) : null,
        TeachingMethod.findOne({
            $and: [{ _id: teachingMethodId }, { isActive: true }, { $or: [{ isDefault: true }, { createdBy: teacherId }] }]
        })
    ])

    if (!grade) errors.push({ field: 'gradeId', message: 'El grado no existe' })
    if (!subject) errors.push({ field: 'subjectId', message: 'La materia no existe' })
    else if (grade && !subject.grades.some((g) => sameId(g, grade._id))) {
        errors.push({ field: 'subjectId', message: 'La materia no se imparte en ese grado' })
    }
    if (topicId) {
        if (!topic) errors.push({ field: 'topicId', message: 'El tema no existe' })
        else if (!sameId(topic.subject, subjectId) || !sameId(topic.grade, gradeId)) {
            errors.push({ field: 'topicId', message: 'El tema no corresponde a la materia y grado' })
        }
    }
    if (!method) errors.push({ field: 'teachingMethodId', message: 'La metodología no existe' })

    if (errors.length) throw validationError(errors)
    return { grade, subject, topic, method }
}

/** Información curricular que falta: la guía lo declara en lugar de inventarla. */
export const detectCurriculumGaps = (topic) => {
    if (!topic) {
        return ['No se seleccionó un tema del CNB: la guía no está vinculada a competencias ni indicadores oficiales.']
    }
    const gaps = []
    if (topic.isSample) gaps.push('El tema seleccionado es un dato de PRUEBA, no contenido oficial del CNB.')
    if (!topic.competencies?.length) gaps.push('El tema no tiene competencias del CNB registradas.')
    if (!topic.achievementIndicators?.length) gaps.push('El tema no tiene indicadores de logro registrados.')
    const ref = topic.curriculumReference
    if (!ref?.page && !ref?.url) gaps.push('El tema no indica la página o el enlace del documento del CNB.')
    return gaps
}

const curriculumSnapshot = ({ grade, subject, topic }) => ({
    grade: { id: grade._id, number: grade.number, name: grade.name },
    subject: { id: subject._id, code: subject.code, name: subject.name },
    topic: topic ? { id: topic._id, code: topic.code, name: topic.name, isSample: topic.isSample } : null,
    competencies: (topic?.competencies ?? []).map(({ code, description }) => ({ code, description })),
    achievementIndicators: (topic?.achievementIndicators ?? []).map(({ code, competencyCode, description }) => ({ code, competencyCode, description })),
    curriculumReference: topic?.curriculumReference?.toObject?.() ?? topic?.curriculumReference ?? null,
    dataStatus: !topic ? 'missing' : topic.isSample ? 'sample' : 'official'
})

const methodologySnapshot = (method) => ({
    id: method._id,
    name: method.name,
    isDefault: method.isDefault,
    sourceReference: method.sourceReference
        ? {
            title: method.sourceReference.title,
            section: method.sourceReference.section,
            pages: method.sourceReference.pages,
            url: method.sourceReference.url
        }
        : null
})

const uniqueStrings = (values) => [...new Set(values.map((v) => v.trim()).filter(Boolean))]

// ── Consumo de IA ────────────────────────────────────────────

/** Pide la guía a la IA y valida que sea una guía completa sin competencias inventadas. */
const requestGuideFromAI = (teacherId, context, allowedCompetencyCodes) =>
    runStructuredGeneration({
        teacherId,
        feature: 'lesson-guide',
        system: SYSTEM_PROMPT,
        buildUser: (feedback) => buildUserPrompt(context, { maxInputChars: aiConfig.maxInputChars, retryFeedback: feedback }),
        context,
        validate: (content) =>
            validateGuideContent(content, { source: 'ai', durationMinutes: context.durationMinutes, allowedCompetencyCodes })
    })

// ── Casos de uso ─────────────────────────────────────────────

export const findOwnedGuide = async (teacherId, id) => {
    const guide = await LessonGuide.findOne({ _id: id, teacherId })
    if (!guide) throw new AppError(404, GUIDE_NOT_FOUND)
    return guide
}

/**
 * Genera una guía con IA y la guarda como BORRADOR.
 * Con `guideId` regenera un borrador existente (mismo grado, materia y tema; puede cambiar
 * metodología, duración e instrucciones). Cada generación queda registrada en `generations`.
 */
export const generateGuide = async (teacherId, input, { now = new Date() } = {}) => {
    const existing = input.guideId ? await findOwnedGuide(teacherId, input.guideId) : null
    if (existing && existing.status !== 'draft') {
        throw new AppError(409, 'Solo se pueden regenerar borradores. Cambia el estado de la guía a "draft" para regenerarla.')
    }

    const params = {
        gradeId: existing?.gradeId ?? input.gradeId,
        subjectId: existing?.subjectId ?? input.subjectId,
        topicId: existing ? existing.topicId : input.topicId ?? null,
        teachingMethodId: input.teachingMethodId ?? existing?.teachingMethodId,
        durationMinutes: input.durationMinutes ?? existing?.durationMinutes,
        additionalInstructions: input.additionalInstructions ?? ''
    }

    const refs = await resolveReferences(teacherId, params)
    await assertDailyQuota(teacherId, now)

    const serverGaps = detectCurriculumGaps(refs.topic)
    const context = buildGuideContext({ ...refs, durationMinutes: params.durationMinutes, additionalInstructions: params.additionalInstructions, curriculumGaps: serverGaps })
    const allowedCodes = (refs.topic?.competencies ?? []).map((c) => c.code).filter(Boolean)

    const ai = await requestGuideFromAI(teacherId, context, allowedCodes)
    const { competenciesUsed = [], curriculumGaps: aiGaps = [], ...content } = ai.content
    const curriculumGaps = uniqueStrings([...serverGaps, ...aiGaps]).slice(0, 10)

    const generation = {
        generatedAt: now,
        provider: ai.provider,
        model: ai.model,
        promptVersion: PROMPT_VERSION,
        attempts: ai.attempts,
        inputTokens: ai.usage.inputTokens || null,
        outputTokens: ai.usage.outputTokens || null,
        durationMinutes: params.durationMinutes,
        additionalInstructions: context.additionalInstructions,
        methodology: methodologySnapshot(refs.method),
        curriculum: curriculumSnapshot(refs),
        competenciesUsed,
        curriculumGaps
    }

    const guide = existing ?? new LessonGuide({
        teacherId,
        gradeId: refs.grade._id,
        subjectId: refs.subject._id,
        topicId: refs.topic?._id ?? null,
        origin: 'ai',
        status: 'draft'
    })

    Object.assign(guide, content)
    guide.teachingMethodId = refs.method._id
    guide.durationMinutes = params.durationMinutes
    guide.curriculumGaps = curriculumGaps
    guide.editedByTeacher = false
    guide.generations = [...(existing?.generations ?? []), generation].slice(-MAX_GENERATIONS_KEPT)

    await guide.save()
    return guide
}

/** Crea una guía escrita por el docente (sin IA). */
export const createManualGuide = async (teacherId, body) => {
    const refs = await resolveReferences(teacherId, body)
    const content = Object.fromEntries(EDITABLE_CONTENT_FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]))
    const { valid, errors } = validateGuideContent(content, { source: 'manual', durationMinutes: body.durationMinutes })
    if (!valid) throw validationError(errors)

    const guide = new LessonGuide({
        ...content,
        teacherId,
        gradeId: refs.grade._id,
        subjectId: refs.subject._id,
        topicId: refs.topic?._id ?? null,
        teachingMethodId: refs.method._id,
        durationMinutes: body.durationMinutes,
        curriculumGaps: detectCurriculumGaps(refs.topic),
        status: body.status ?? 'draft',
        origin: 'manual'
    })
    await guide.save()
    return guide
}

export const listGuides = async (teacherId, { status, gradeId, subjectId, page = 1, limit = 20 } = {}) => {
    const filter = { teacherId }
    if (status) filter.status = status
    if (gradeId) filter.gradeId = gradeId
    if (subjectId) filter.subjectId = subjectId

    const [guides, total] = await Promise.all([
        LessonGuide.find(filter).select('-generations').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
        LessonGuide.countDocuments(filter)
    ])
    return { guides, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

/**
 * Edita el contenido y/o el estado. Se valida la guía COMPLETA resultante, así las
 * preguntas siguen apuntando a objetivos existentes y las fases no superan la duración.
 */
export const updateGuide = async (teacherId, id, changes) => {
    const guide = await findOwnedGuide(teacherId, id)

    const contentChanges = Object.fromEntries(EDITABLE_CONTENT_FIELDS.filter((f) => changes[f] !== undefined).map((f) => [f, changes[f]]))
    if (Object.keys(contentChanges).length) {
        const current = guide.toObject()
        const merged = Object.fromEntries(EDITABLE_CONTENT_FIELDS.map((f) => [f, contentChanges[f] ?? current[f]]))
        const { valid, errors } = validateGuideContent(merged, { source: 'manual', durationMinutes: guide.durationMinutes })
        if (!valid) throw validationError(errors)
        Object.assign(guide, contentChanges)
        guide.editedByTeacher = true
    }
    if (changes.status) guide.status = changes.status

    await guide.save()
    return guide
}
