import { EventEmitter } from 'events';
import logger from './logger';

export enum EventType {
  TASK_RECEIVED = 'task:received',
  TASK_CLASSIFIED = 'task:classified',
  PLAN_CREATED = 'plan:created',
  CONTEXT_ASSEMBLING = 'context:assembling',
  CONTEXT_ASSEMBLED = 'context:assembled',
  CODE_GENERATING = 'code:generating',
  CODE_GENERATED = 'code:generated',
  CODE_REVIEWING = 'code:reviewing',
  CODE_REVIEWED = 'code:reviewed',
  CHANGES_PROPOSED = 'changes:proposed',
  CHANGES_APPROVED = 'changes:approved',
  CHANGES_REJECTED = 'changes:rejected',
  CHANGES_APPLIED = 'changes:applied',
  GIT_COMMITTED = 'git:committed',
  ERROR_OCCURRED = 'error:occurred',
  AGENT_STARTED = 'agent:started',
  AGENT_COMPLETED = 'agent:completed',
  AGENT_FAILED = 'agent:failed',
  MODEL_ROUTED = 'model:routed',
  TOKEN_BUDGET_EXCEEDED = 'budget:exceeded',
}

export interface NexusEvent {
  type: EventType;
  timestamp: Date;
  data: unknown;
  source: string;
}

type EventHandler = (event: NexusEvent) => void | Promise<void>;

export class EventBus {
  private emitter: EventEmitter;
  private history: NexusEvent[];
  private maxHistory: number;
  private middlewares: Array<(event: NexusEvent) => NexusEvent | null>;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
    this.history = [];
    this.maxHistory = 1000;
    this.middlewares = [];
  }

  emit(type: EventType, data: unknown, source: string = 'system'): void {
    let event: NexusEvent = {
      type,
      timestamp: new Date(),
      data,
      source,
    };

    for (const middleware of this.middlewares) {
      const result = middleware(event);
      if (result === null) return;
      event = result;
    }

    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    logger.debug(`[EventBus] ${type} from ${source}`);
    this.emitter.emit(type, event);
  }

  on(type: EventType, handler: EventHandler): void {
    this.emitter.on(type, async (event: NexusEvent) => {
      try {
        await handler(event);
      } catch (error) {
        logger.error(`[EventBus] Error in handler for ${type}:`, error);
      }
    });
  }

  once(type: EventType, handler: EventHandler): void {
    this.emitter.once(type, async (event: NexusEvent) => {
      try {
        await handler(event);
      } catch (error) {
        logger.error(`[EventBus] Error in once handler for ${type}:`, error);
      }
    });
  }

  off(type: EventType, handler: EventHandler): void {
    this.emitter.off(type, handler as (...args: unknown[]) => void);
  }

  use(middleware: (event: NexusEvent) => NexusEvent | null): void {
    this.middlewares.push(middleware);
  }

  waitFor(type: EventType, timeoutMs: number = 60000): Promise<NexusEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event ${type}`));
      }, timeoutMs);

      this.once(type, (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
  }

  getHistory(type?: EventType): NexusEvent[] {
    if (type) {
      return this.history.filter(e => e.type === type);
    }
    return [...this.history];
  }

  getRecent(count: number = 10): NexusEvent[] {
    return this.history.slice(-count);
  }

  clearHistory(): void {
    this.history = [];
  }

  removeAllListeners(type?: EventType): void {
    if (type) {
      this.emitter.removeAllListeners(type);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}
