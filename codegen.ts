import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'src/schema.graphql',
  generates: {
    'src/__generated__/resolvers-types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        useTypeImports: true,
        contextType: '../context.js#Context',
        mappers: {
          Invitation: '../data/models.js#InvitationRecord',
          AssignmentEvent: '../data/models.js#AssignmentEventRecord',
          User: '../data/models.js#UserRecord',
          Employee: '../data/models.js#EmployeeRecord',
          Team: '../data/models.js#TeamRecord',
          Equipment: '../data/models.js#EquipmentRecord',
        },
      },
    },
  },
};
export default config;
