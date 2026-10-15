import { gql } from '@apollo/client';
export interface Employee {
  id: string; name: string; email: string; role: string;
  team: { id: string; name: string; department: string };
  assignedEquipment: { id: string; model: string; serialNumber: string }[];
}
export interface Assignment {
  id: string; model: string; serialNumber: string;
  assignedTo: { id: string; name: string } | null;
}
export const DIRECTORY = gql`query Directory {
  employees { id name email role team { id name department }
    assignedEquipment { id model serialNumber } }
}`;
export const ASSIGN = gql`mutation AssignEquipment($employeeId: ID!, $equipmentId: ID!) {
  assignEquipment(employeeId: $employeeId, equipmentId: $equipmentId) {
    id model serialNumber assignedTo { id name }
  }
}`;
export const ALERTS = gql`subscription AssignmentAlerts {
  equipmentAssigned { id model serialNumber assignedTo { id name } }
}`;
