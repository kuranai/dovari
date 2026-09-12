import type { AccessIdentity } from './auth/access';

export interface SecurityEnvironment {
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  DOVARI_ENV?: string;
}

export type WorkerBindings = CloudflareBindings & SecurityEnvironment;

export interface WorkerVariables {
  identity?: AccessIdentity;
  requestId: string;
}

export type WorkerApp = {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
};
