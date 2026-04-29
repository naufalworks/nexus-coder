/**
 * Integration tests for CLI chat command
 * Tests the new auto-routing and full-context options
 * 
 * Requirements: 5.1-5.9
 */

import 'openai/shims/node';
import { ChatService } from '../../services/chat-service';
import { AgentRegistry } from '../../agents/registry';
import { UnifiedClient } from '../../core/models/unified-client';
import { ContextEngine } from '../../core/context/engine';
import { EventBus } from '../../core/event-bus';
import { ChatSessionOptions } from '../../types/chat';
import { AgentCapability, TaskType } from '../../types/task';
import { GraphTraversal } from '../../core/context/graph/traversal';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createMockContextEngine = (): jest.Mocked<ContextEngine> => ({
  getTraversal: jest.fn().mockReturnValue({
    getNode: jest.fn(),
    getRelatedNodes: jest.fn().mockReturnValue([]),
  } as unknown as GraphTraversal),
  getFileContent: jest.fn().mockResolvedValue('mock file content'),
  getGraph: jest.fn().mockReturnValue({
    nodes: new Map(),
    edges: [],
    fileCount: 0,
  }),
} as unknown as jest.Mocked<ContextEngine>);

describe('CLI Chat Integration Tests', () => {
  let chatService: ChatService;
  let registry: AgentRegistry;
  let client: jest.Mocked<UnifiedClient>;
  let contextEngine: jest.Mocked<ContextEngine>;
  let eventBus: EventBus;

  beforeEach(() => {
    // Polyfill setImmediate for winston in jsdom
    if (typeof (globalThis as Record<string, unknown>).setImmediate === 'undefined') {
      (globalThis as Record<string, unknown>).setImmediate = (cb: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(cb, 0, ...args);
    }

    client = {} as jest.Mocked<UnifiedClient>;
    eventBus = new EventBus();
    contextEngine = createMockContextEngine();
    registry = new AgentRegistry();

    // Register test agents
    registry.register({
      name: 'reviewer',
      capabilities: [AgentCapability.CODE_REVIEW],
      supportedTaskTypes: [TaskType.REVIEW],
      execute: async () => ({ success: true, output: 'Review complete', tokensUsed: 100 }),
    });

    registry.register({
      name: 'coder',
      capabilities: [AgentCapability.CODE_GENERATION],
      supportedTaskTypes: [TaskType.FEATURE, TaskType.BUG_FIX],
      execute: async () => ({ success: true, output: 'Code generated', tokensUsed: 200 }),
    });

    registry.register({
      name: 'orchestrator',
      capabilities: [AgentCapability.TASK_PLANNING],
      supportedTaskTypes: [TaskType.UNKNOWN],
      execute: async () => ({ success: true, output: 'Task orchestrated', tokensUsed: 150 }),
    });

    chatService = new ChatService(registry, client, contextEngine, eventBus);
  });

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  describe('Requirement 5.1: nexus chat without options starts auto mode', () => {
    it('should create auto mode session when no agent specified', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const session = chatService.createSession(options);

      expect(session.mode).toBe('auto');
      expect(session.autoRouting).toBe(true);
      expect(session.fullGraphContext).toBe(true);
      expect(session.agentName).toBe('orchestrator'); // Default agent
    });
  });

  describe('Requirement 5.2: nexus chat --agent <name> starts manual mode', () => {
    it('should create manual mode session when agent specified', () => {
      const options: ChatSessionOptions = {
        mode: 'manual',
        agentName: 'reviewer',
      };

      const session = chatService.createSession(options);

      expect(session.mode).toBe('manual');
      expect(session.agentName).toBe('reviewer');
      expect(session.autoRouting).toBe(false);
      expect(session.fullGraphContext).toBe(false);
    });

    it('should throw error if agent not found', () => {
      const options: ChatSessionOptions = {
        mode: 'manual',
        agentName: 'nonexistent',
      };

      expect(() => chatService.createSession(options)).toThrow('Agent not found: nonexistent');
    });
  });

  describe('Requirement 5.3: nexus chat --no-auto disables auto-routing', () => {
    it('should disable auto-routing when --no-auto flag used', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
        autoRouting: false,
      };

      const session = chatService.createSession(options);

      expect(session.autoRouting).toBe(false);
    });
  });

  describe('Requirement 5.4: nexus chat --no-full-context disables graph context', () => {
    it('should disable full graph context when --no-full-context flag used', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
        fullGraphContext: false,
      };

      const session = chatService.createSession(options);

      expect(session.fullGraphContext).toBe(false);
    });
  });

  describe('Requirement 5.5: Display session mode', () => {
    it('should include mode in session object for auto mode', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const session = chatService.createSession(options);

      expect(session.mode).toBe('auto');
    });

    it('should include mode in session object for manual mode', () => {
      const options: ChatSessionOptions = {
        mode: 'manual',
        agentName: 'coder',
      };

      const session = chatService.createSession(options);

      expect(session.mode).toBe('manual');
    });
  });

  describe('Requirement 5.6: Display auto mode message', () => {
    it('should set autoRouting to true for auto mode', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const session = chatService.createSession(options);

      expect(session.autoRouting).toBe(true);
      // CLI would display: "Agent will be automatically selected based on your message"
    });
  });

  describe('Requirement 5.7: Display manual mode agent name', () => {
    it('should set agentName for manual mode', () => {
      const options: ChatSessionOptions = {
        mode: 'manual',
        agentName: 'reviewer',
      };

      const session = chatService.createSession(options);

      expect(session.agentName).toBe('reviewer');
      // CLI would display: "Agent: reviewer"
    });
  });

  describe('Requirement 5.8: Display session ID', () => {
    it('should generate unique session ID', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const session = chatService.createSession(options);

      expect(session.id).toBeDefined();
      expect(typeof session.id).toBe('string');
      expect(session.id.length).toBeGreaterThan(0);
    });

    it('should generate different IDs for different sessions', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const session1 = chatService.createSession(options);
      const session2 = chatService.createSession(options);

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('Requirement 5.9: Graph initialization check', () => {
    it('should not throw error when creating session even without graph', () => {
      // Mock context engine without graph
      const uninitializedEngine = createMockContextEngine();
      uninitializedEngine.getGraph = jest.fn().mockReturnValue(null);

      const uninitializedService = new ChatService(
        registry,
        client,
        uninitializedEngine,
        eventBus
      );

      const options: ChatSessionOptions = {
        mode: 'auto',
        fullGraphContext: true,
      };

      // Session creation should succeed
      const session = uninitializedService.createSession(options);
      expect(session).toBeDefined();
      
      // The error "Graph not initialized. Run `nexus init` first."
      // would be thrown by GraphContextBuilder when sendMessage is called
      // and fullGraphContext is enabled
    });
  });

  describe('Session creation with various option combinations', () => {
    it('should handle auto mode with explicit autoRouting=true', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
        autoRouting: true,
      };

      const session = chatService.createSession(options);

      expect(session.mode).toBe('auto');
      expect(session.autoRouting).toBe(true);
    });

    it('should handle manual mode with explicit autoRouting=false', () => {
      const options: ChatSessionOptions = {
        mode: 'manual',
        agentName: 'coder',
        autoRouting: false,
      };

      const session = chatService.createSession(options);

      expect(session.mode).toBe('manual');
      expect(session.autoRouting).toBe(false);
    });

    it('should handle auto mode with fullGraphContext=true', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
        fullGraphContext: true,
      };

      const session = chatService.createSession(options);

      expect(session.fullGraphContext).toBe(true);
    });

    it('should handle manual mode with fullGraphContext=false', () => {
      const options: ChatSessionOptions = {
        mode: 'manual',
        agentName: 'reviewer',
        fullGraphContext: false,
      };

      const session = chatService.createSession(options);

      expect(session.fullGraphContext).toBe(false);
    });

    it('should allow manual mode with auto-routing enabled (override)', () => {
      const options: ChatSessionOptions = {
        mode: 'manual',
        agentName: 'coder',
        autoRouting: true, // Override default
      };

      const session = chatService.createSession(options);

      expect(session.mode).toBe('manual');
      expect(session.autoRouting).toBe(true);
    });

    it('should allow auto mode with full context disabled (override)', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
        fullGraphContext: false, // Override default
      };

      const session = chatService.createSession(options);

      expect(session.mode).toBe('auto');
      expect(session.fullGraphContext).toBe(false);
    });
  });

  describe('Backward compatibility', () => {
    it('should support legacy string parameter (agent name only)', () => {
      // Legacy API: createSession(agentName: string)
      const session = chatService.createSession('reviewer' as any);

      expect(session.mode).toBe('manual');
      expect(session.agentName).toBe('reviewer');
      expect(session.autoRouting).toBe(false);
      expect(session.fullGraphContext).toBe(false);
    });
  });

  describe('Requirement 7.1-7.4: Backward Compatibility Tests', () => {
    describe('Requirement 7.1: Manual mode with --agent works as before', () => {
      it('should create manual mode session with nexus chat --agent reviewer', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'reviewer',
        };

        const session = chatService.createSession(options);

        expect(session.mode).toBe('manual');
        expect(session.agentName).toBe('reviewer');
        expect(session.autoRouting).toBe(false);
        expect(session.fullGraphContext).toBe(false);
      });

      it('should create manual mode session with nexus chat --agent coder', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'coder',
        };

        const session = chatService.createSession(options);

        expect(session.mode).toBe('manual');
        expect(session.agentName).toBe('coder');
        expect(session.autoRouting).toBe(false);
        expect(session.fullGraphContext).toBe(false);
      });
    });

    describe('Requirement 7.2: Manual mode with --context works as before', () => {
      it('should create manual mode session with context files', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'coder',
        };

        const session = chatService.createSession(options);

        // Simulate adding context files (as would happen with --context flag)
        session.contextFiles = ['src/file1.ts', 'src/file2.ts'];

        expect(session.mode).toBe('manual');
        expect(session.agentName).toBe('coder');
        expect(session.contextFiles).toEqual(['src/file1.ts', 'src/file2.ts']);
        expect(session.autoRouting).toBe(false);
        expect(session.fullGraphContext).toBe(false);
      });

      it('should allow context files to be added to manual mode session', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'reviewer',
        };

        const session = chatService.createSession(options);

        // Add context files after session creation
        session.contextFiles.push('src/utils.ts');
        session.contextFiles.push('src/helpers.ts');

        expect(session.contextFiles).toHaveLength(2);
        expect(session.contextFiles).toContain('src/utils.ts');
        expect(session.contextFiles).toContain('src/helpers.ts');
      });
    });

    describe('Requirement 7.3: Manual mode does NOT perform auto-routing', () => {
      it('should not enable auto-routing in manual mode by default', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'reviewer',
        };

        const session = chatService.createSession(options);

        expect(session.autoRouting).toBe(false);
      });

      it('should keep agent stable in manual mode even with autoRouting=false', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'coder',
          autoRouting: false, // Explicitly disabled
        };

        const session = chatService.createSession(options);

        expect(session.mode).toBe('manual');
        expect(session.agentName).toBe('coder');
        expect(session.autoRouting).toBe(false);
      });

      it('should not change agent in manual mode during conversation', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'reviewer',
        };

        const session = chatService.createSession(options);
        const initialAgent = session.agentName;

        // Simulate multiple messages (agent should not change)
        // In real implementation, sendMessage would be called here
        // but we're testing that the session configuration prevents routing

        expect(session.agentName).toBe(initialAgent);
        expect(session.agentName).toBe('reviewer');
        expect(session.autoRouting).toBe(false);
      });
    });

    describe('Requirement 7.4: Manual mode does NOT auto-build graph context', () => {
      it('should not enable full graph context in manual mode by default', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'coder',
        };

        const session = chatService.createSession(options);

        expect(session.fullGraphContext).toBe(false);
      });

      it('should keep fullGraphContext disabled in manual mode', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'reviewer',
          fullGraphContext: false, // Explicitly disabled
        };

        const session = chatService.createSession(options);

        expect(session.mode).toBe('manual');
        expect(session.fullGraphContext).toBe(false);
      });

      it('should not build graph context automatically in manual mode', () => {
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'coder',
        };

        const session = chatService.createSession(options);

        // Verify graph context is not enabled
        expect(session.fullGraphContext).toBe(false);
        
        // In manual mode, users must explicitly provide context via --context flag
        // or by adding files to session.contextFiles
        expect(session.contextFiles).toEqual([]);
      });
    });

    describe('Integration: Complete backward compatibility workflow', () => {
      it('should replicate nexus chat --agent reviewer workflow', () => {
        // Simulate: nexus chat --agent reviewer
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'reviewer',
        };

        const session = chatService.createSession(options);

        // Verify all backward compatibility requirements
        expect(session.mode).toBe('manual'); // Manual mode
        expect(session.agentName).toBe('reviewer'); // Specific agent
        expect(session.autoRouting).toBe(false); // No auto-routing
        expect(session.fullGraphContext).toBe(false); // No auto graph context
        expect(session.contextFiles).toEqual([]); // No automatic context
        expect(session.status).toBe('active'); // Session is active
      });

      it('should replicate nexus chat --agent coder --context file.ts workflow', () => {
        // Simulate: nexus chat --agent coder --context file.ts
        const options: ChatSessionOptions = {
          mode: 'manual',
          agentName: 'coder',
        };

        const session = chatService.createSession(options);

        // Add context file (as --context flag would do)
        session.contextFiles.push('src/file.ts');

        // Verify all backward compatibility requirements
        expect(session.mode).toBe('manual'); // Manual mode
        expect(session.agentName).toBe('coder'); // Specific agent
        expect(session.autoRouting).toBe(false); // No auto-routing
        expect(session.fullGraphContext).toBe(false); // No auto graph context
        expect(session.contextFiles).toEqual(['src/file.ts']); // Explicit context
        expect(session.status).toBe('active'); // Session is active
      });

      it('should maintain existing user workflows without breaking changes', () => {
        // Test that all existing manual mode patterns still work

        // Pattern 1: Simple agent selection
        const session1 = chatService.createSession({
          mode: 'manual',
          agentName: 'reviewer',
        });
        expect(session1.agentName).toBe('reviewer');
        expect(session1.autoRouting).toBe(false);

        // Pattern 2: Agent with context files
        const session2 = chatService.createSession({
          mode: 'manual',
          agentName: 'coder',
        });
        session2.contextFiles = ['src/main.ts', 'src/utils.ts'];
        expect(session2.contextFiles).toHaveLength(2);
        expect(session2.fullGraphContext).toBe(false);

        // Pattern 3: Legacy string parameter
        const session3 = chatService.createSession('orchestrator' as any);
        expect(session3.mode).toBe('manual');
        expect(session3.agentName).toBe('orchestrator');
        expect(session3.autoRouting).toBe(false);
      });
    });
  });

  describe('Session state initialization', () => {
    it('should initialize session with empty messages array', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const session = chatService.createSession(options);

      expect(session.messages).toEqual([]);
    });

    it('should initialize session with active status', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const session = chatService.createSession(options);

      expect(session.status).toBe('active');
    });

    it('should initialize session with empty context arrays', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const session = chatService.createSession(options);

      expect(session.contextFiles).toEqual([]);
      expect(session.contextNodeIds).toEqual([]);
    });

    it('should initialize session with empty intent history', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const session = chatService.createSession(options);

      expect(session.intentHistory).toEqual([]);
    });

    it('should set creation and update timestamps', () => {
      const options: ChatSessionOptions = {
        mode: 'auto',
      };

      const before = new Date();
      const session = chatService.createSession(options);
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(session.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Error handling', () => {
    it('should throw error for manual mode without agent name', () => {
      const options: ChatSessionOptions = {
        mode: 'manual',
        // agentName missing
      };

      expect(() => chatService.createSession(options)).toThrow(
        'Agent name is required for manual mode'
      );
    });

    it('should throw error for invalid agent name', () => {
      const options: ChatSessionOptions = {
        mode: 'manual',
        agentName: 'invalid-agent',
      };

      expect(() => chatService.createSession(options)).toThrow(
        'Agent not found: invalid-agent'
      );
    });
  });
});
