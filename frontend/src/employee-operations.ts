import { gql } from '@apollo/client';
import type { Employee } from './operations';
export interface EmployeeInput { name: string; email: string; role: string; teamId: string }
export interface Team { id: string; name: string; department: string }
export interface EmployeePage { employeeManagement: { total: number; items: Employee[] } }
export const TEAMS = gql`query EmployeeTeams { teams { id name department } }`;
export const EMPLOYEES = gql`query EmployeeManagement($search:String,$teamId:ID,$offset:Int,$limit:Int) {
  employeeManagement(search:$search,teamId:$teamId,offset:$offset,limit:$limit) {
    total items { id name email role team { id name department } }
  }
}`;
export const CREATE_EMPLOYEE = gql`mutation CreateEmployee($input:PublicEmployeeInput!) {
  createEmployee(input:$input) { id name email role team { id name department } }
}`;
export const UPDATE_EMPLOYEE = gql`mutation UpdateEmployee($id:ID!,$input:PublicEmployeeInput!) {
  updateEmployee(id:$id,input:$input) { id name email role team { id name department } }
}`;
export const CREATE_AND_LINK = gql`mutation CreateEmployeeForAccount($userId:ID!,$input:PublicEmployeeInput!) {
  createEmployeeForAccount(userId:$userId,input:$input) { id name email role team { id name department } }
}`;
export const CREATE_TEAM = gql`mutation CreateTeam($name:String!,$department:String!) {
  createTeam(name:$name,department:$department) { id name department }
}`;
