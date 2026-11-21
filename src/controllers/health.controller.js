import { getHealth } from '../services/health.service.js'

export const health = async (req, res) => {
    const { healthy, ...data } = await getHealth()

    res.status(healthy ? 200 : 503).json({
        success: healthy,
        message: healthy ? 'Servidor y base de datos en funcionamiento' : 'Base de datos no disponible',
        data
    })
}
