import { Emits, On, Subject, StateMachine, TransitionTo, When } from 'annotations-design-patterns';
import { definePolicy } from 'annotations-design-patterns/policy';
import {
  cachedFor,
  cachedForWithHandle,
  memoize,
  memoizeWithHandle,
  semaphore,
  type InvocationInfo,
  type SemaphoreOptions,
} from 'annotations-design-patterns/operators';

interface Events {
  message: string;
  count: number;
}
const bus = new Subject<Events>();
class Listener {
  @On(bus, 'message')
  receive(value: string): void {
    void value;
  }

  // @ts-expect-error unknown event must fail in installed declarations
  @On(bus, 'missing')
  wrongEvent(value: unknown): void {
    void value;
  }

  // @ts-expect-error payload must match the selected event
  @On(bus, 'count')
  wrongPayload(value: string): void {
    void value;
  }
}
class Publisher extends Subject<Events> {
  @Emits('message')
  message(): string {
    return 'ok';
  }

  // @ts-expect-error unknown event must fail in installed declarations
  @Emits('missing')
  missing(): string {
    return 'wrong';
  }

  // @ts-expect-error must reject another event's payload after await
  @Emits('message')
  async wrongPayload(): Promise<number> {
    return 1;
  }
}
const publisher = new Publisher();
class PublisherListener {
  @On(publisher, 'message')
  receive(value: string): void {
    void value;
  }

  // @ts-expect-error interface-derived subclasses retain closed event names
  @On(publisher, 'missing')
  wrongEvent(value: unknown): void {
    void value;
  }

  // @ts-expect-error interface-derived subclasses retain the selected payload
  @On(publisher, 'count')
  wrongPayload(value: string): void {
    void value;
  }
}
class Article extends StateMachine<'draft' | 'published'> {
  @When('draft')
  @TransitionTo('published')
  publish(): void {}

  // @ts-expect-error typo must fail in installed declarations
  @When('publised')
  wrongGuard(): void {}

  // @ts-expect-error typo must fail in installed declarations
  @TransitionTo('publised')
  wrongTransition(): void {}
}
class OpenMachine extends StateMachine<string> {
  @When('arbitrary')
  @TransitionTo('another')
  change(): void {}
}
const reusable = definePolicy<object, readonly [], string>({
  retry: { attempts: 2, idempotent: true },
  timeout: { ms: 100, scope: 'global' },
});
void [Listener, Publisher, PublisherListener, Article, OpenMachine, reusable];

type Receiver = { readonly tenant: string };
type Args = readonly [id: string];
const semaphoreOptions: SemaphoreOptions<Receiver, Args> = {
  permits: 2,
  maxQueue: 5,
  key: ({ receiver, args }) => `${receiver.tenant}:${args[0]}`,
};
const limited = semaphore<Receiver, Args, string>(semaphoreOptions).apply((id) => id);
const partitioned = memoize<Receiver, Args, string>({ perReceiver: true }).apply((id) => id);
const bounded = cachedFor<Receiver, Args, string>(100, {
  perReceiver: true,
  maxEntries: 10,
}).apply((id) => id);
memoizeWithHandle<Receiver, Args, string>({
  // @ts-expect-error handles cannot enumerate weak receiver partitions
  perReceiver: true,
});
cachedForWithHandle<Receiver, Args, string>(100, {
  maxEntries: 10,
  // @ts-expect-error handles cannot enumerate weak receiver partitions
  perReceiver: true,
});
const classified = definePolicy<Receiver, Args, string>({
  retry: { attempts: 2, idempotent: true, maxDelayMs: 100, jitter: 'equal' },
  circuitBreaker: {
    failures: 2,
    resetMs: 100,
    isFailure(_error, info) {
      const invocation: InvocationInfo<Receiver, Args> = info;
      const id: string = invocation.args[0];
      // @ts-expect-error classification info exposes readonly arguments
      info.args[0] = 'changed';
      return id.length > 0 && info.receiver.tenant.length > 0;
    },
  },
});
void [limited, partitioned, bounded, classified];
