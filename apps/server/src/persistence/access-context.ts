export type ScopeLease = (() => Promise<void>) & {
  validate?: (privateWork?: boolean) => Promise<unknown>;
};
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
  allowedAppConnections?: string[];
  acquire?(): Promise<ScopeLease>;
  acquireResources?(): Promise<ScopeLease>;
  validate(privateWork?: boolean): Promise<unknown>;
  validateAudience?(id: string): Promise<void>;
  validateResources?(): Promise<unknown>;
};
