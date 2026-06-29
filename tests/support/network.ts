import http from 'node:http';

export function canListenOnLoopback(): Promise<boolean> {
    return new Promise((resolve) => {
        const server = http.createServer();
        let resolved = false;

        const finish = (canListen: boolean) => {
            if (resolved) return;
            resolved = true;
            server.removeAllListeners('error');
            server.removeAllListeners('listening');
            if (server.listening) {
                server.close(() => resolve(canListen));
                return;
            }
            resolve(canListen);
        };

        server.once('error', () => finish(false));
        server.once('listening', () => finish(true));
        server.listen(0, '127.0.0.1');
    });
}
