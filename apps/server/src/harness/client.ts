import type { Entity } from "../contracts";
import type { NativeSkillMetadata } from "../learning/contracts";
import type { HarnessId } from "./availability";
import type { LaunchContext } from "./context";
import type { NativeEvent, Settings } from "./contracts";
import type { ProductTools } from "./tools";

export type SessionIdentity = { native_session_id: string };
export type Inspection = {
  account_plan?: string | null;
  login: Entity<"connection">["login"];
  account_id: string | null;
  auth_method: Entity<"connection">["authentication"]["method"];
  billing_source: Entity<"connection">["authentication"]["billing_source"];
  capabilities: Entity<"connection">["capabilities"];
};
export type ToolLease = Awaited<ReturnType<ProductTools["issue"]>>;
export type RecoveryObservation = {
  native_session_id: string;
  native_run_id: string;
  status: "succeeded" | "failed" | "cancelled" | "unknown";
  text: string;
};
/** One client/process per connection + agent + thread. No global account/model mutation. */
export interface HarnessClient {
  inspect(): Promise<Inspection>;
  skills?(): Promise<NativeSkillMetadata[]>;
  discoverModels(): Promise<Entity<"connection">["models"]>;
  start(settings: Settings): Promise<SessionIdentity>;
  resume(identity: SessionIdentity, settings: Settings): Promise<SessionIdentity>;
  settings(identity: SessionIdentity, settings: Settings): Promise<void>;
  prompt(request: {
    identity: SessionIdentity;
    run_id: string;
    text: string;
    images?: string[];
    learning_context?: string;
    settings: Settings;
    tools: ToolLease;
    signal: AbortSignal;
    onEvent(event: NativeEvent): void | Promise<void>;
  }): Promise<unknown>;
  stop(identity: SessionIdentity, runId: string): Promise<{ confirmed: boolean }>;
  steer?(identity: SessionIdentity, runId: string, text: string): Promise<void>;
  reconcile?(identity: SessionIdentity, nativeRunId: string): Promise<RecoveryObservation>;
  interactions?(runId: string): unknown;
  respond?(runId: string, answer: unknown): Promise<unknown>;
  close(): Promise<void>;
}
export interface HarnessAdapter {
  readonly harness: HarnessId;
  connect(
    context: LaunchContext & {
      executable: string;
      connection_id: string;
      agent_id: string;
      thread_id: string;
      instructions?: string;
      model_id?: string;
    },
  ): Promise<HarnessClient>;
}
