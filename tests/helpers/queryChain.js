/**
 * Imita una consulta de Mongoose (find().populate().sort().skip().limit()) que
 * al esperarse devuelve `result`. Registra cada método llamado para poder
 * verificar filtros, orden y paginación.
 */
export const queryChain = (result) => {
    const calls = []
    const proxy = new Proxy(
        {},
        {
            get(target, prop) {
                if (prop === 'then') {
                    return (resolve, reject) => Promise.resolve(typeof result === 'function' ? result() : result).then(resolve, reject)
                }
                if (prop === 'calls') return calls
                return (...args) => {
                    calls.push({ method: prop, args })
                    return proxy
                }
            }
        }
    )
    return proxy
}

/** Devuelve los argumentos de la primera llamada a `method` en la cadena. */
export const callArgs = (chain, method) => chain.calls.find((c) => c.method === method)?.args
