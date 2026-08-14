import { AsyncMemoryStore } from '../../src/store';
import {
  describeAtomicStoreCapabilityContract,
  describeAsyncAtomicStoreContract,
} from './store-contract';

describeAsyncAtomicStoreContract('AsyncMemoryStore', () => new AsyncMemoryStore<string, number>(), {
  ttl: true,
});
describeAtomicStoreCapabilityContract(
  'AsyncMemoryStore',
  () => new AsyncMemoryStore<string, number>(),
);
