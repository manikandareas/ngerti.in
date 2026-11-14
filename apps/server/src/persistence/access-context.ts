export type DataContext = {
  organizationId: string;
  userId: string;
  membershipGeneration: number;
  authorizationGeneration: number;
  readableAgents: string[];
  invocableAgents: string[];
  managedAgents: string[];
  canManage: boolean;
  acquire?(): Promise<() => Promise<void>>;
  validate(privateWork?: boolean): Promise<unknown>;
};
