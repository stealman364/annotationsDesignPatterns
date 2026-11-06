/** Readonly invocation data for decision callbacks; execution controls stay private. */
export interface InvocationInfo<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
> {
  readonly receiver: This;
  readonly args: Readonly<Args>;
  readonly key?: PropertyKey;
  readonly operationId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}
