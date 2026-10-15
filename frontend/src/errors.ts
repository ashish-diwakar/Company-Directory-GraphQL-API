import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
export function explainError(error: unknown): string {
  if (CombinedGraphQLErrors.is(error)) {
    const codes = error.errors.map(item => item.extensions?.code);
    if (codes.includes('FORBIDDEN')) return 'Admin access required. Your employee token cannot assign equipment.';
    if (codes.includes('UNAUTHENTICATED')) return error.errors[0]?.message ?? 'Please sign in again.';
    return error.errors.map(item => item.message).join(' ');
  }
  if (ServerError.is(error) && error.statusCode === 401) return 'Token rejected. Check the token or generate a fresh one.';
  return error instanceof Error ? error.message : 'Unable to complete this request.';
}
