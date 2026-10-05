import type { User } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    currentUser: User;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number };
    user: { sub: number };
  }
}
