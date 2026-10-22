import{traceWork}from'./work-trace.ts';
/** Record completed synchronous host work without changing its result or refusal. */
export const timing = (spent: string[]) => <T>(what: string, fn: () => T): T => {
  const at = Date.now();
  const got = traceWork(what,fn);
  spent.push(`${what} ${Date.now() - at}`);
  return got;
};
