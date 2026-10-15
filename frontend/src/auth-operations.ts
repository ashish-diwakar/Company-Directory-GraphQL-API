import { gql } from '@apollo/client';
export interface Account { id: string; name: string; email: string; role: 'ADMIN' | 'EMPLOYEE'; active: boolean; employee: { id: string; name: string } | null }
export interface AuthPayload { token: string; user: Account; expiresAt: string }
export const ME = gql`query CurrentAccount { me { id name email role active employee { id name } } }`;
export const REGISTER = gql`mutation Register($input: RegisterInput!) {
  register(input: $input) { token expiresAt user { id name email role active employee { id name } } }
}`;
export const SIGN_IN = gql`mutation SignIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) { token expiresAt user { id name email role active employee { id name } } }
}`;
export const SIGN_OUT = gql`mutation SignOut { signOut }`;
export const UPDATE_PROFILE = gql`mutation UpdateProfile($name: String!) { updateProfile(name: $name) { id name email role } }`;
export const CHANGE_PASSWORD = gql`mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
  changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
}`;
export const USERS = gql`query WorkspaceAccounts { users { id name email role active employee { id name } } }`;
export const REGISTRATION_OPEN = gql`query RegistrationOpen { registrationOpen }`;
export const SET_ACCOUNT_ACTIVE = gql`mutation SetAccountActive($userId:ID!,$active:Boolean!) {
  setAccountActive(userId:$userId,active:$active) { id active }
}`;
export const LINK_ACCOUNT = gql`mutation LinkAccount($userId:ID!,$employeeId:ID) {
  linkAccountToEmployee(userId:$userId,employeeId:$employeeId) { id name email role active employee { id name } }
}`;
export const MY_EQUIPMENT = gql`query MyEquipment {
  myEquipment { id type model serialNumber assignedTo { id name } }
}`;
export const MY_EQUIPMENT_CHANGED = gql`subscription MyEquipmentChanged { myEquipmentChanged }`;

