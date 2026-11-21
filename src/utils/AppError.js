/**
 * Error controlado de la aplicación. Su mensaje SÍ se envía al cliente,
 * así que solo debe contener texto seguro de mostrar.
 */
export class AppError extends Error {
    /**
     * @param {number} statusCode Código HTTP
     * @param {string} message Mensaje para el cliente
     * @param {Array<{field: string, message: string}>} [errors] Detalle por campo
     */
    constructor(statusCode, message, errors = undefined) {
        super(message)
        this.name = 'AppError'
        this.statusCode = statusCode
        this.errors = errors
    }
}
