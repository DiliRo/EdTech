// Se carga antes que cualquier test (node --import). Fija un entorno aislado:
// las pruebas nunca usan tu .env ni tu base de datos real.
process.env.NODE_ENV = 'test'
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/edtech-test-no-usada'
process.env.CORS_ORIGIN = 'http://localhost:5173'
