import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  userId?: string;
  isAdmin?: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext {
  return storage.getStore() ?? {};
}
