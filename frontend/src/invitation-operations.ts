import { gql } from '@apollo/client';
export interface Invitation { id: string; email: string; createdAt: string; expiresAt: string; acceptedAt: string | null; revokedAt: string | null }
export const INVITATIONS = gql`query Invitations($offset:Int,$limit:Int) {
  invitations(offset:$offset,limit:$limit) { total items { id email createdAt expiresAt acceptedAt revokedAt } }
}`;
export const CREATE_INVITATION = gql`mutation CreateInvitation($email:String!) {
  createInvitation(email:$email) { token invitation { id email createdAt expiresAt acceptedAt revokedAt } }
}`;
export const REVOKE_INVITATION = gql`mutation RevokeInvitation($id:ID!) { revokeInvitation(id:$id) }`;
