import { gql } from '@apollo/client';
export interface AssignmentEvent {
  id: string; equipmentId: string; equipmentModel: string; serialNumber: string;
  action: 'ASSIGNED' | 'REASSIGNED' | 'RETURNED'; actorName: string; actorEmail: string;
  fromEmployeeName: string | null; toEmployeeName: string | null; notes: string | null; createdAt: string;
}
export const HISTORY = gql`query EquipmentHistory($equipmentId:ID,$offset:Int,$limit:Int) {
  equipmentHistory(equipmentId:$equipmentId,offset:$offset,limit:$limit) {
    total items { id equipmentId equipmentModel serialNumber action actorName actorEmail fromEmployeeName toEmployeeName notes createdAt }
  }
}`;
export const RETURN_EQUIPMENT = gql`mutation ReturnEquipment($equipmentId:ID!,$expectedEmployeeId:ID!,$notes:String) {
  returnEquipment(equipmentId:$equipmentId,expectedEmployeeId:$expectedEmployeeId,notes:$notes) {
    id type model serialNumber assignedTo { id name }
  }
}`;
export const RETURN_ALERTS = gql`subscription ReturnAlerts {
  equipmentReturned { id model serialNumber assignedTo { id name } }
}`;
