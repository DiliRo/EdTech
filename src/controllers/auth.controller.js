import { registerTeacher, loginTeacher } from '../services/auth.service.js'

// Express 5 envía al errorHandler las promesas rechazadas; no hace falta try/catch.

export const register = async (req, res) => {
    const { teacher, token } = await registerTeacher(req.body)
    res.status(201).json({
        success: true,
        message: 'Cuenta creada correctamente',
        data: { teacher, token }
    })
}

export const login = async (req, res) => {
    const { teacher, token } = await loginTeacher(req.body)
    res.status(200).json({
        success: true,
        message: 'Inicio de sesión exitoso',
        data: { teacher, token }
    })
}

export const me = (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Perfil del docente',
        data: { teacher: req.teacher }
    })
}
