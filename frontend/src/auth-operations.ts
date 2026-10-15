import { gql } from '@apollo/client';
export interface Account { id: string; name: string; email: string; role: 'ADMIN' | 'EMPLOYEE' }
export interface AuthPayload { token: string; user: Account; expiresAt: string }
export const ME = gql`query CurrentAccount { me { id name email role } }`;
export const REGISTER = gql`mutation Register($input: RegisterInput!) {
  register(input: $input) { token expiresAt user { id name email role } }
}`;
export const SIGN_IN = gql`mutation SignIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) { token expiresAt user { id name email role } }
}`;
export const SIGN_OUT = gql`mutation SignOut { signOut }`;
export const UPDATE_PROFILE = gql`mutation UpdateProfile($name: String!) { updateProfile(name: $name) { id name email role } }`;
export const CHANGE_PASSWORD = gql`mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
  changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
}`;
export const USERS = gql`query WorkspaceAccounts { users { id name email role } }`;
