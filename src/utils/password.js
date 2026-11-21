import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'

// bcrypt solo usa los primeros 72 bytes de la contraseña; el validador rechaza las más largas.
export const BCRYPT_MAX_BYTES = 72

export const hashPassword = (plain) => bcrypt.hash(plain, env.bcryptSaltRounds)

export const comparePassword = async (plain, hash) => {
    if (typeof plain !== 'string' || typeof hash !== 'string') return false
    try {
        return await bcrypt.compare(plain, hash)
    } catch {
        return false
    }
}

// Hash fijo para comparar cuando el correo no existe: así el login tarda lo mismo
// exista o no la cuenta y no se puede averiguar qué correos están registrados.
const DUMMY_HASH = bcrypt.hashSync('cuenta-inexistente-edtech', env.bcryptSaltRounds)

export const consumeComparisonTime = async (plain) => {
    await comparePassword(String(plain ?? ''), DUMMY_HASH)
    return false
}
