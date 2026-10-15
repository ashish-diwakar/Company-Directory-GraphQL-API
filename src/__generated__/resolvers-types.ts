import type { GraphQLResolveInfo } from 'graphql';
import type { InvitationRecord, AssignmentEventRecord, UserRecord, EmployeeRecord, TeamRecord, EquipmentRecord } from '../data/models.js';
import type { Context } from '../context.js';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export enum AccountRole {
  Admin = 'ADMIN',
  Employee = 'EMPLOYEE'
}

export enum AssignmentAction {
  Assigned = 'ASSIGNED',
  Reassigned = 'REASSIGNED',
  Returned = 'RETURNED'
}

export type AssignmentEvent = {
  __typename?: 'AssignmentEvent';
  action: AssignmentAction;
  actorEmail: Scalars['String']['output'];
  actorId: Scalars['ID']['output'];
  actorName: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  equipmentId: Scalars['ID']['output'];
  equipmentModel: Scalars['String']['output'];
  fromEmployeeId?: Maybe<Scalars['ID']['output']>;
  fromEmployeeName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  serialNumber: Scalars['String']['output'];
  toEmployeeId?: Maybe<Scalars['ID']['output']>;
  toEmployeeName?: Maybe<Scalars['String']['output']>;
};

export type AssignmentHistoryPage = {
  __typename?: 'AssignmentHistoryPage';
  items: Array<AssignmentEvent>;
  total: Scalars['Int']['output'];
};

export type AuthPayload = {
  __typename?: 'AuthPayload';
  expiresAt: Scalars['String']['output'];
  token: Scalars['String']['output'];
  user: User;
};

export type Employee = {
  __typename?: 'Employee';
  assignedEquipment: Array<Equipment>;
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  role: Scalars['String']['output'];
  team: Team;
};

export type EmployeePage = {
  __typename?: 'EmployeePage';
  items: Array<Employee>;
  total: Scalars['Int']['output'];
};

export type Equipment = {
  __typename?: 'Equipment';
  assignedTo?: Maybe<Employee>;
  id: Scalars['ID']['output'];
  model: Scalars['String']['output'];
  serialNumber: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type EquipmentInput = {
  model: Scalars['String']['input'];
  serialNumber: Scalars['String']['input'];
  type: Scalars['String']['input'];
};

export type EquipmentPage = {
  __typename?: 'EquipmentPage';
  items: Array<Equipment>;
  total: Scalars['Int']['output'];
};

export type Invitation = {
  __typename?: 'Invitation';
  acceptedAt?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  email: Scalars['String']['output'];
  expiresAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  revokedAt?: Maybe<Scalars['String']['output']>;
};

export type InvitationPage = {
  __typename?: 'InvitationPage';
  items: Array<Invitation>;
  total: Scalars['Int']['output'];
};

export type InvitationPayload = {
  __typename?: 'InvitationPayload';
  invitation: Invitation;
  token: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  assignEquipment: Equipment;
  changePassword: Scalars['Boolean']['output'];
  createEmployee: Employee;
  createEmployeeForAccount: Employee;
  createEquipment: Equipment;
  createInvitation: InvitationPayload;
  createTeam: Team;
  linkAccountToEmployee: User;
  register: AuthPayload;
  returnEquipment: Equipment;
  revokeInvitation: Scalars['Boolean']['output'];
  setAccountActive: User;
  signIn: AuthPayload;
  signOut: Scalars['Boolean']['output'];
  updateEmployee: Employee;
  updateEquipment: Equipment;
  updateProfile: User;
};


export type MutationAssignEquipmentArgs = {
  employeeId: Scalars['ID']['input'];
  equipmentId: Scalars['ID']['input'];
};


export type MutationChangePasswordArgs = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};


export type MutationCreateEmployeeArgs = {
  input: PublicEmployeeInput;
};


export type MutationCreateEmployeeForAccountArgs = {
  input: PublicEmployeeInput;
  userId: Scalars['ID']['input'];
};


export type MutationCreateEquipmentArgs = {
  input: EquipmentInput;
};


export type MutationCreateInvitationArgs = {
  email: Scalars['String']['input'];
};


export type MutationCreateTeamArgs = {
  department: Scalars['String']['input'];
  name: Scalars['String']['input'];
};


export type MutationLinkAccountToEmployeeArgs = {
  employeeId?: InputMaybe<Scalars['ID']['input']>;
  userId: Scalars['ID']['input'];
};


export type MutationRegisterArgs = {
  input: RegisterInput;
};


export type MutationReturnEquipmentArgs = {
  equipmentId: Scalars['ID']['input'];
  expectedEmployeeId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationRevokeInvitationArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSetAccountActiveArgs = {
  active: Scalars['Boolean']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationSignInArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationUpdateEmployeeArgs = {
  id: Scalars['ID']['input'];
  input: PublicEmployeeInput;
};


export type MutationUpdateEquipmentArgs = {
  id: Scalars['ID']['input'];
  input: EquipmentInput;
};


export type MutationUpdateProfileArgs = {
  name: Scalars['String']['input'];
};

export type PublicEmployeeInput = {
  email: Scalars['String']['input'];
  name: Scalars['String']['input'];
  role: Scalars['String']['input'];
  teamId: Scalars['ID']['input'];
};

export type Query = {
  __typename?: 'Query';
  employee?: Maybe<Employee>;
  employeeManagement: EmployeePage;
  employees: Array<Employee>;
  equipmentHistory: AssignmentHistoryPage;
  equipmentInventory: EquipmentPage;
  invitations: InvitationPage;
  me?: Maybe<User>;
  myEquipment: Array<Equipment>;
  registrationOpen: Scalars['Boolean']['output'];
  teams: Array<Team>;
  users: Array<User>;
};


export type QueryEmployeeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryEmployeeManagementArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  teamId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryEmployeesArgs = {
  role?: InputMaybe<Scalars['String']['input']>;
};


export type QueryEquipmentHistoryArgs = {
  equipmentId?: InputMaybe<Scalars['ID']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryEquipmentInventoryArgs = {
  assigned?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryInvitationsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type RegisterInput = {
  email: Scalars['String']['input'];
  invitationToken?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type Subscription = {
  __typename?: 'Subscription';
  equipmentAssigned: Equipment;
  equipmentReturned: Equipment;
  myEquipmentChanged: Scalars['Boolean']['output'];
};

export type Team = {
  __typename?: 'Team';
  department: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  members: Array<Employee>;
  name: Scalars['String']['output'];
};

export type User = {
  __typename?: 'User';
  active: Scalars['Boolean']['output'];
  email: Scalars['String']['output'];
  employee?: Maybe<Employee>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  role: AccountRole;
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AccountRole: AccountRole;
  AssignmentAction: AssignmentAction;
  AssignmentEvent: ResolverTypeWrapper<AssignmentEventRecord>;
  AssignmentHistoryPage: ResolverTypeWrapper<Omit<AssignmentHistoryPage, 'items'> & { items: Array<ResolversTypes['AssignmentEvent']> }>;
  AuthPayload: ResolverTypeWrapper<Omit<AuthPayload, 'user'> & { user: ResolversTypes['User'] }>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Employee: ResolverTypeWrapper<EmployeeRecord>;
  EmployeePage: ResolverTypeWrapper<Omit<EmployeePage, 'items'> & { items: Array<ResolversTypes['Employee']> }>;
  Equipment: ResolverTypeWrapper<EquipmentRecord>;
  EquipmentInput: EquipmentInput;
  EquipmentPage: ResolverTypeWrapper<Omit<EquipmentPage, 'items'> & { items: Array<ResolversTypes['Equipment']> }>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Invitation: ResolverTypeWrapper<InvitationRecord>;
  InvitationPage: ResolverTypeWrapper<Omit<InvitationPage, 'items'> & { items: Array<ResolversTypes['Invitation']> }>;
  InvitationPayload: ResolverTypeWrapper<Omit<InvitationPayload, 'invitation'> & { invitation: ResolversTypes['Invitation'] }>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  PublicEmployeeInput: PublicEmployeeInput;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  RegisterInput: RegisterInput;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Subscription: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Team: ResolverTypeWrapper<TeamRecord>;
  User: ResolverTypeWrapper<UserRecord>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AssignmentEvent: AssignmentEventRecord;
  AssignmentHistoryPage: Omit<AssignmentHistoryPage, 'items'> & { items: Array<ResolversParentTypes['AssignmentEvent']> };
  AuthPayload: Omit<AuthPayload, 'user'> & { user: ResolversParentTypes['User'] };
  Boolean: Scalars['Boolean']['output'];
  Employee: EmployeeRecord;
  EmployeePage: Omit<EmployeePage, 'items'> & { items: Array<ResolversParentTypes['Employee']> };
  Equipment: EquipmentRecord;
  EquipmentInput: EquipmentInput;
  EquipmentPage: Omit<EquipmentPage, 'items'> & { items: Array<ResolversParentTypes['Equipment']> };
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Invitation: InvitationRecord;
  InvitationPage: Omit<InvitationPage, 'items'> & { items: Array<ResolversParentTypes['Invitation']> };
  InvitationPayload: Omit<InvitationPayload, 'invitation'> & { invitation: ResolversParentTypes['Invitation'] };
  Mutation: Record<PropertyKey, never>;
  PublicEmployeeInput: PublicEmployeeInput;
  Query: Record<PropertyKey, never>;
  RegisterInput: RegisterInput;
  String: Scalars['String']['output'];
  Subscription: Record<PropertyKey, never>;
  Team: TeamRecord;
  User: UserRecord;
};

export type AssignmentEventResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AssignmentEvent'] = ResolversParentTypes['AssignmentEvent']> = {
  action?: Resolver<ResolversTypes['AssignmentAction'], ParentType, ContextType>;
  actorEmail?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  actorId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  actorName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  equipmentId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  equipmentModel?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  fromEmployeeId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  fromEmployeeName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  notes?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  serialNumber?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  toEmployeeId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  toEmployeeName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type AssignmentHistoryPageResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AssignmentHistoryPage'] = ResolversParentTypes['AssignmentHistoryPage']> = {
  items?: Resolver<Array<ResolversTypes['AssignmentEvent']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type AuthPayloadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AuthPayload'] = ResolversParentTypes['AuthPayload']> = {
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  token?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
};

export type EmployeeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Employee'] = ResolversParentTypes['Employee']> = {
  assignedEquipment?: Resolver<Array<ResolversTypes['Equipment']>, ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  team?: Resolver<ResolversTypes['Team'], ParentType, ContextType>;
};

export type EmployeePageResolvers<ContextType = Context, ParentType extends ResolversParentTypes['EmployeePage'] = ResolversParentTypes['EmployeePage']> = {
  items?: Resolver<Array<ResolversTypes['Employee']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type EquipmentResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Equipment'] = ResolversParentTypes['Equipment']> = {
  assignedTo?: Resolver<Maybe<ResolversTypes['Employee']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  model?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  serialNumber?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type EquipmentPageResolvers<ContextType = Context, ParentType extends ResolversParentTypes['EquipmentPage'] = ResolversParentTypes['EquipmentPage']> = {
  items?: Resolver<Array<ResolversTypes['Equipment']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type InvitationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Invitation'] = ResolversParentTypes['Invitation']> = {
  acceptedAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  revokedAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type InvitationPageResolvers<ContextType = Context, ParentType extends ResolversParentTypes['InvitationPage'] = ResolversParentTypes['InvitationPage']> = {
  items?: Resolver<Array<ResolversTypes['Invitation']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type InvitationPayloadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['InvitationPayload'] = ResolversParentTypes['InvitationPayload']> = {
  invitation?: Resolver<ResolversTypes['Invitation'], ParentType, ContextType>;
  token?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  assignEquipment?: Resolver<ResolversTypes['Equipment'], ParentType, ContextType, RequireFields<MutationAssignEquipmentArgs, 'employeeId' | 'equipmentId'>>;
  changePassword?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationChangePasswordArgs, 'currentPassword' | 'newPassword'>>;
  createEmployee?: Resolver<ResolversTypes['Employee'], ParentType, ContextType, RequireFields<MutationCreateEmployeeArgs, 'input'>>;
  createEmployeeForAccount?: Resolver<ResolversTypes['Employee'], ParentType, ContextType, RequireFields<MutationCreateEmployeeForAccountArgs, 'input' | 'userId'>>;
  createEquipment?: Resolver<ResolversTypes['Equipment'], ParentType, ContextType, RequireFields<MutationCreateEquipmentArgs, 'input'>>;
  createInvitation?: Resolver<ResolversTypes['InvitationPayload'], ParentType, ContextType, RequireFields<MutationCreateInvitationArgs, 'email'>>;
  createTeam?: Resolver<ResolversTypes['Team'], ParentType, ContextType, RequireFields<MutationCreateTeamArgs, 'department' | 'name'>>;
  linkAccountToEmployee?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationLinkAccountToEmployeeArgs, 'userId'>>;
  register?: Resolver<ResolversTypes['AuthPayload'], ParentType, ContextType, RequireFields<MutationRegisterArgs, 'input'>>;
  returnEquipment?: Resolver<ResolversTypes['Equipment'], ParentType, ContextType, RequireFields<MutationReturnEquipmentArgs, 'equipmentId' | 'expectedEmployeeId'>>;
  revokeInvitation?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationRevokeInvitationArgs, 'id'>>;
  setAccountActive?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationSetAccountActiveArgs, 'active' | 'userId'>>;
  signIn?: Resolver<ResolversTypes['AuthPayload'], ParentType, ContextType, RequireFields<MutationSignInArgs, 'email' | 'password'>>;
  signOut?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  updateEmployee?: Resolver<ResolversTypes['Employee'], ParentType, ContextType, RequireFields<MutationUpdateEmployeeArgs, 'id' | 'input'>>;
  updateEquipment?: Resolver<ResolversTypes['Equipment'], ParentType, ContextType, RequireFields<MutationUpdateEquipmentArgs, 'id' | 'input'>>;
  updateProfile?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationUpdateProfileArgs, 'name'>>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  employee?: Resolver<Maybe<ResolversTypes['Employee']>, ParentType, ContextType, RequireFields<QueryEmployeeArgs, 'id'>>;
  employeeManagement?: Resolver<ResolversTypes['EmployeePage'], ParentType, ContextType, RequireFields<QueryEmployeeManagementArgs, 'limit' | 'offset'>>;
  employees?: Resolver<Array<ResolversTypes['Employee']>, ParentType, ContextType, Partial<QueryEmployeesArgs>>;
  equipmentHistory?: Resolver<ResolversTypes['AssignmentHistoryPage'], ParentType, ContextType, RequireFields<QueryEquipmentHistoryArgs, 'limit' | 'offset'>>;
  equipmentInventory?: Resolver<ResolversTypes['EquipmentPage'], ParentType, ContextType, RequireFields<QueryEquipmentInventoryArgs, 'limit' | 'offset'>>;
  invitations?: Resolver<ResolversTypes['InvitationPage'], ParentType, ContextType, RequireFields<QueryInvitationsArgs, 'limit' | 'offset'>>;
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  myEquipment?: Resolver<Array<ResolversTypes['Equipment']>, ParentType, ContextType>;
  registrationOpen?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  teams?: Resolver<Array<ResolversTypes['Team']>, ParentType, ContextType>;
  users?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
};

export type SubscriptionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = {
  equipmentAssigned?: SubscriptionResolver<ResolversTypes['Equipment'], "equipmentAssigned", ParentType, ContextType>;
  equipmentReturned?: SubscriptionResolver<ResolversTypes['Equipment'], "equipmentReturned", ParentType, ContextType>;
  myEquipmentChanged?: SubscriptionResolver<ResolversTypes['Boolean'], "myEquipmentChanged", ParentType, ContextType>;
};

export type TeamResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Team'] = ResolversParentTypes['Team']> = {
  department?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['Employee']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type UserResolvers<ContextType = Context, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  active?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  employee?: Resolver<Maybe<ResolversTypes['Employee']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['AccountRole'], ParentType, ContextType>;
};

export type Resolvers<ContextType = Context> = {
  AssignmentEvent?: AssignmentEventResolvers<ContextType>;
  AssignmentHistoryPage?: AssignmentHistoryPageResolvers<ContextType>;
  AuthPayload?: AuthPayloadResolvers<ContextType>;
  Employee?: EmployeeResolvers<ContextType>;
  EmployeePage?: EmployeePageResolvers<ContextType>;
  Equipment?: EquipmentResolvers<ContextType>;
  EquipmentPage?: EquipmentPageResolvers<ContextType>;
  Invitation?: InvitationResolvers<ContextType>;
  InvitationPage?: InvitationPageResolvers<ContextType>;
  InvitationPayload?: InvitationPayloadResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  Team?: TeamResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
};

