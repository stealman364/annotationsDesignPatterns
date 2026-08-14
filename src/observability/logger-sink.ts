import type { EventSink, PolicyEvent } from '../core/events';

export interface StructuredLogger {
  log(event: PolicyEvent): void;
}

export interface LoggerEventSinkOptions {
  readonly operators?: readonly string[];
}

/**
 * Optional adapter for structured loggers. Logging remains observational: a
 * logger failure is never allowed to alter an operation result.
 */
export class LoggerEventSink implements EventSink {
  private readonly operators: ReadonlySet<string> | undefined;

  constructor(
    private readonly logger: StructuredLogger,
    options: LoggerEventSinkOptions = {},
  ) {
    this.operators = options.operators === undefined ? undefined : new Set(options.operators);
  }

  emit(event: PolicyEvent): void {
    if (this.operators !== undefined && !this.operators.has(event.operator)) {
      return;
    }

    try {
      this.logger.log(event);
    } catch {
      // Logging is opt-in observability and cannot break the pipeline.
    }
  }
}
