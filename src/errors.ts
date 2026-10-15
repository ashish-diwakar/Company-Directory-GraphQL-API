import { GraphQLError } from 'graphql';
import { Prisma } from './generated/prisma/client.js';
export function notFound(entity: string, id: string) {
  return new GraphQLError(`${entity} '${id}' was not found.`, { extensions: { code: 'NOT_FOUND' } });
}
export function badInput(message: string) {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}
export function databaseError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw badInput('An employee with this email already exists.');
    if (error.code === 'P2003') throw badInput('The referenced team or employee does not exist.');
    if (error.code === 'P2025') throw new GraphQLError('The requested record was not found.', { extensions: { code: 'NOT_FOUND' } });
  }
  throw error;
}

