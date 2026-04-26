/**
 * Production HTTP runtime: stateless app + session-scoped agent APIs.
 */

export { createHttpService, listenService } from './server.js';
export { getRuntimeOpenApiJson } from './openapi.js';
export type { CreateHttpServiceOptions, HttpService, RequestAuditEntry, RegisteredAgent } from './types.js';
export {
    createAuthMiddleware,
    apiKeyAuth,
    bearerAuth,
} from './auth.js';
export type {
    AuthMiddlewareOptions,
    AuthResult,
    AuthContext,
    ApiKeyStrategyOptions,
    BearerStrategyOptions,
    BasicStrategyOptions,
    CustomStrategyOptions,
} from './auth.js';

// JWT RBAC
export { jwtAuth, verifyJwtHs256, verifyJwtAsymmetric, hasRole } from './jwt-rbac.js';
export type { JwtAuthOptions, JwtPayload } from './jwt-rbac.js';

// Admin API
export type { AdminApiOptions, AdminStats } from './admin.js';

// WebSocket transport
export { attachWebSocketTransport } from './ws-transport.js';
