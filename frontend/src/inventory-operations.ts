import { gql } from '@apollo/client';
export interface EquipmentItem {
  id: string; type: string; model: string; serialNumber: string;
  assignedTo: { id: string; name: string } | null;
}
export interface InventoryData { equipmentInventory: { items: EquipmentItem[]; total: number } }
export interface EquipmentInput { type: string; model: string; serialNumber: string }
export const INVENTORY = gql`query EquipmentInventory($search:String,$assigned:Boolean,$offset:Int,$limit:Int) {
  equipmentInventory(search:$search,assigned:$assigned,offset:$offset,limit:$limit) {
    total items { id type model serialNumber assignedTo { id name } }
  }
}`;
export const CREATE_EQUIPMENT = gql`mutation CreateEquipment($input:EquipmentInput!) {
  createEquipment(input:$input) { id type model serialNumber assignedTo { id name } }
}`;
export const UPDATE_EQUIPMENT = gql`mutation UpdateEquipment($id:ID!,$input:EquipmentInput!) {
  updateEquipment(id:$id,input:$input) { id type model serialNumber assignedTo { id name } }
}`;
