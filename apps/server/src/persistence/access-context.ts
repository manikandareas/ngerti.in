export type DataContext = {
  organizationId: string;
  userId: string;
  membershipGeneration: number;
  authorizationGeneration: number;
  readableAgents: string[];
  invocableAgents: string[];
  managedAgents: string[];
  canManage: boolean;
  allowedConnections?: string[];
  acquire?(): Promise<() => Promise<void>>;
  acquireResources?(): Promise<() => Promise<void>>;
  validate(privateWork?: boolean): Promise<unknown>;
  validateAudience?(id: string): Promise<void>;
  validateResources?(): Promise<unknown>;
};
