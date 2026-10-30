// Next's server sets this global before loading its request storage; tests that
// import a route do the same. Import this first.
import { AsyncLocalStorage } from "node:async_hooks";

(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
