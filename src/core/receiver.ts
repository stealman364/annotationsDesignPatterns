/** Instance-scoped state requires portable object identity, including functions. */
export function assertObjectReceiver(receiver: unknown, name: string): asserts receiver is object {
  if (receiver !== null && (typeof receiver === 'object' || typeof receiver === 'function')) return;
  throw new TypeError(`${name} requires an object receiver. Call the method with its instance.`);
}
