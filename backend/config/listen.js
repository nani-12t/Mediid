// Turn asynchronous bind failures into startup errors before background jobs start.
module.exports = function listen(server, port, host) {
    return new Promise((resolve, reject) => {
        const onListening = () => {
            server.removeListener('error', onError);
            resolve(server.address());
        };
        const onError = (error) => {
            server.removeListener('listening', onListening);
            if (error.code === 'EADDRINUSE') {
                error.message = 'Port ' + port + ' is already in use. Stop the process using it or change PORT in backend/.env and the frontend REACT_APP_API_URL to match.';
            }
            reject(error);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        try {
            server.listen({ port: Number(port), host });
        } catch (error) {
            server.removeListener('error', onError);
            onError(error);
        }
    });
};
