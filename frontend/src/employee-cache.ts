import type { ApolloCache } from '@apollo/client';

// Inactive queries are not covered by refetchQueries. Invalidate every list variant
// so a later screen visit cannot reuse an old employee list or team membership.
export function invalidateEmployeeLists(cache: ApolloCache) {
  for (const fieldName of ['employees', 'employeeManagement', 'teams']) {
    cache.evict({ id: 'ROOT_QUERY', fieldName });
  }
}
