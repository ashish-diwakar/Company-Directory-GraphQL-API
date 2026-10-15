import { expect, it } from '@jest/globals';
import { ApolloClient, ApolloLink, InMemoryCache, Observable, gql } from '@apollo/client';
import { DIRECTORY } from '../frontend/src/operations.js';
import { invalidateEmployeeLists } from '../frontend/src/employee-cache.js';

it('fetches newly created employees when revisiting a previously cached, inactive directory', async () => {
  const employee = (id: string) => ({ __typename: 'Employee', id, name: id, email: `${id}@example.com`, role: 'Engineer', team: { __typename: 'Team', id: 'team', name: 'Platform', department: 'Engineering' }, assignedEquipment: [] });
  let employees = [employee('first')];
  let directoryRequests = 0;
  const create = gql`mutation CreateEmployee { createEmployee { id name } }`;
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new ApolloLink(operation => new Observable(observer => {
    if (operation.operationName === 'CreateEmployee') {
      const added = employee('second'); employees = [...employees, added];
      observer.next({ data: { createEmployee: { __typename: 'Employee', id: added.id, name: added.name } } });
    } else {
      directoryRequests++;
      observer.next({ data: { employees } });
    }
    observer.complete();
  })) });
  try {
    // query() leaves no mounted observer, matching navigation away from Accounts.
    await client.query({ query: DIRECTORY });
    expect(directoryRequests).toBe(1);
    await client.mutate({ mutation: create, update: invalidateEmployeeLists });
    const reopened = await client.query<{ employees: { id: string }[] }>({ query: DIRECTORY });
    expect(directoryRequests).toBe(2);
    expect(reopened.data?.employees.map(item => item.id)).toEqual(['first', 'second']);
  } finally { client.stop(); }
});
