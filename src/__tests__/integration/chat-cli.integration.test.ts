/**
 * Integration Test: Chat CLI Command
 * 
 * Validates: Requirements 26.1, 26.2, 26.3, 26.4
 * 
 * Tests the enhanced `nexus chat` CLI command with --agent and --context options
 */

import { chatCommand } from '../../cli/commands';
import { ChatService } from '../../services/chat-service';
import { AgentRegistry } from '../../agents/registry';
import { AgentCapability, TaskType } from '../../types';

// Mock inquirer - must define mock inline to avoid hoisting issues
jest.mock('inquirer', () => {
  const mockFn = jest.fn();
  return { prompt: mockFn, default: { prompt: mockFn } };
});

// Access the mocked prompt function through the module
import inquirer from 'inquirer';
const mockPrompt = inquirer.prompt as unknown as jest.Mock;

// Mock process.exit to prevent actual exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
  throw new Error(`process.exit called with ${code}`);
}) as any);

// Mock console methods to capture output during tests
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
  // Capture for debugging if needed
});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  // Re-throw to surface the actual error in tests
  const msg = args.join(' ');
  if (msg.includes('Error:')) {
    // Extract the error message for debugging
  }
});

describe('Chat CLI Command Integration Tests', () => {
  let mockChatService: jest.Mocked<ChatService>;
  let mockRegistry: jest.Mocked<AgentRegistry>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockPrompt.mockReset();
    
    // Mock ChatService
    mockChatService = {
      createSession: jest.fn(),
      sendMessage: jest.fn(),
      closeSession: jest.fn(),
      getSession: jest.fn(),
      listSessions: jest.fn(),
      buildChatContext: jest.fn(),
    } as any;

    // Mock AgentRegistry
    mockRegistry = {
      listAgents: jest.fn(),
      getAgent: jest.fn(),
      register: jest.fn(),
      unregister: jest.fn(),
      findAgentForTask: jest.fn(),
      findAgentsWithCapability: jest.fn(),
    } as any;
  });

  describe('Requirement 26.1: Chat command with --agent option', () => {
    it('should start chat session with specified agent', async () => {
      // Setup
      const mockAgent = {
        name: 'coder',
        capabilities: [AgentCapability.CODE_GENERATION],
        supportedTaskTypes: [TaskType.FEATURE],
        execute: jest.fn(),
      };

      const mockSession = {
        id: 'session-123',
        agentName: 'coder',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue([mockAgent]);
      mockRegistry.getAgent.mockReturnValue(mockAgent);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock user typing "exit" immediately
      mockPrompt.mockResolvedValueOnce({ message: 'exit' });

      // Execute
      await chatCommand(mockChatService, mockRegistry, {
        agent: 'coder',
      });

      // Verify
      expect(mockRegistry.getAgent).toHaveBeenCalledWith('coder');
      expect(mockChatService.createSession).toHaveBeenCalledWith('coder');
      expect(mockChatService.closeSession).toHaveBeenCalledWith('session-123');
    });

    it('should prompt for agent selection when --agent not provided', async () => {
      // Setup
      const mockAgents = [
        {
          name: 'coder',
          capabilities: [AgentCapability.CODE_GENERATION],
          supportedTaskTypes: [TaskType.FEATURE],
          execute: jest.fn(),
        },
        {
          name: 'reviewer',
          capabilities: [AgentCapability.CODE_REVIEW],
          supportedTaskTypes: [TaskType.REVIEW],
          execute: jest.fn(),
        },
      ];

      const mockSession = {
        id: 'session-456',
        agentName: 'reviewer',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue(mockAgents);
      mockRegistry.getAgent.mockReturnValue(mockAgents[1]);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock user selecting reviewer, then typing "exit"
      mockPrompt
        .mockResolvedValueOnce({ agent: 'reviewer' })
        .mockResolvedValueOnce({ message: 'exit' });

      // Execute
      await chatCommand(mockChatService, mockRegistry, {});

      // Verify
      expect(mockPrompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'list',
            name: 'agent',
            message: 'Select an agent to chat with:',
          }),
        ])
      );
      expect(mockChatService.createSession).toHaveBeenCalledWith('reviewer');
    });

    it('should auto-select agent when only one is available', async () => {
      // Setup
      const mockAgent = {
        name: 'coder',
        capabilities: [AgentCapability.CODE_GENERATION],
        supportedTaskTypes: [TaskType.FEATURE],
        execute: jest.fn(),
      };

      const mockSession = {
        id: 'session-789',
        agentName: 'coder',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue([mockAgent]);
      mockRegistry.getAgent.mockReturnValue(mockAgent);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock user typing "exit"
      mockPrompt.mockResolvedValueOnce({ message: 'exit' });

      // Execute
      await chatCommand(mockChatService, mockRegistry, {});

      // Verify - should NOT prompt for agent selection
      expect(mockPrompt).not.toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'list',
            name: 'agent',
          }),
        ])
      );
      expect(mockChatService.createSession).toHaveBeenCalledWith('coder');
    });
  });

  describe('Requirement 26.2: Chat command with --context option', () => {
    it('should add context files to session when provided', async () => {
      // Setup
      const mockAgent = {
        name: 'coder',
        capabilities: [AgentCapability.CODE_GENERATION],
        supportedTaskTypes: [TaskType.FEATURE],
        execute: jest.fn(),
      };

      const mockSession = {
        id: 'session-context',
        agentName: 'coder',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue([mockAgent]);
      mockRegistry.getAgent.mockReturnValue(mockAgent);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock user typing "exit"
      mockPrompt.mockResolvedValueOnce({ message: 'exit' });

      // Execute
      await chatCommand(mockChatService, mockRegistry, {
        agent: 'coder',
        context: ['src/auth.ts', 'src/utils.ts'],
      });

      // Verify
      expect(mockSession.contextFiles).toContain('src/auth.ts');
      expect(mockSession.contextFiles).toContain('src/utils.ts');
      expect(mockSession.contextFiles.length).toBe(2);
    });

    it('should handle empty context array', async () => {
      // Setup
      const mockAgent = {
        name: 'coder',
        capabilities: [AgentCapability.CODE_GENERATION],
        supportedTaskTypes: [TaskType.FEATURE],
        execute: jest.fn(),
      };

      const mockSession = {
        id: 'session-no-context',
        agentName: 'coder',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue([mockAgent]);
      mockRegistry.getAgent.mockReturnValue(mockAgent);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock user typing "exit"
      mockPrompt.mockResolvedValueOnce({ message: 'exit' });

      // Execute
      await chatCommand(mockChatService, mockRegistry, {
        agent: 'coder',
        context: [],
      });

      // Verify
      expect(mockSession.contextFiles.length).toBe(0);
    });
  });

  describe('Requirement 26.3: Interactive REPL session', () => {
    it('should send messages and stream responses', async () => {
      // Setup
      const mockAgent = {
        name: 'coder',
        capabilities: [AgentCapability.CODE_GENERATION],
        supportedTaskTypes: [TaskType.FEATURE],
        execute: jest.fn(),
      };

      const mockSession = {
        id: 'session-repl',
        agentName: 'coder',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue([mockAgent]);
      mockRegistry.getAgent.mockReturnValue(mockAgent);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock streaming response
      async function* mockStream() {
        yield { sessionId: 'session-repl', messageId: 'msg-1', chunk: 'Hello ', isComplete: false };
        yield { sessionId: 'session-repl', messageId: 'msg-1', chunk: 'world!', isComplete: true };
      }
      mockChatService.sendMessage.mockReturnValue(mockStream());

      // Mock user typing a message, then "exit"
      mockPrompt
        .mockResolvedValueOnce({ message: 'Hello agent' })
        .mockResolvedValueOnce({ message: 'exit' });

      // Execute
      await chatCommand(mockChatService, mockRegistry, {
        agent: 'coder',
      });

      // Verify
      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        'session-repl',
        expect.objectContaining({
          type: 'message',
          content: 'Hello agent',
        })
      );
    });

    it('should handle "quit" command to exit', async () => {
      // Setup
      const mockAgent = {
        name: 'coder',
        capabilities: [AgentCapability.CODE_GENERATION],
        supportedTaskTypes: [TaskType.FEATURE],
        execute: jest.fn(),
      };

      const mockSession = {
        id: 'session-quit',
        agentName: 'coder',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue([mockAgent]);
      mockRegistry.getAgent.mockReturnValue(mockAgent);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock user typing "quit"
      mockPrompt.mockResolvedValueOnce({ message: 'quit' });

      // Execute
      await chatCommand(mockChatService, mockRegistry, {
        agent: 'coder',
      });

      // Verify
      expect(mockChatService.closeSession).toHaveBeenCalledWith('session-quit');
    });

    it('should skip empty messages', async () => {
      // Setup
      const mockAgent = {
        name: 'coder',
        capabilities: [AgentCapability.CODE_GENERATION],
        supportedTaskTypes: [TaskType.FEATURE],
        execute: jest.fn(),
      };

      const mockSession = {
        id: 'session-empty',
        agentName: 'coder',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue([mockAgent]);
      mockRegistry.getAgent.mockReturnValue(mockAgent);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock user typing empty message, then "exit"
      mockPrompt
        .mockResolvedValueOnce({ message: '   ' })
        .mockResolvedValueOnce({ message: 'exit' });

      // Execute
      await chatCommand(mockChatService, mockRegistry, {
        agent: 'coder',
      });

      // Verify - sendMessage should NOT be called for empty message
      expect(mockChatService.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 26.4: Error handling and exit codes', () => {
    it('should throw error when no agents are available', async () => {
      // Setup
      mockRegistry.listAgents.mockReturnValue([]);

      // Execute & Verify - process.exit mock throws
      await expect(
        chatCommand(mockChatService, mockRegistry, {})
      ).rejects.toThrow('process.exit');
      
      // Verify that exit was called with code 1
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should throw error when specified agent does not exist', async () => {
      // Setup
      const mockAgent = {
        name: 'coder',
        capabilities: [AgentCapability.CODE_GENERATION],
        supportedTaskTypes: [TaskType.FEATURE],
        execute: jest.fn(),
      };

      mockRegistry.listAgents.mockReturnValue([mockAgent]);
      mockRegistry.getAgent.mockReturnValue(undefined);

      // Execute & Verify - process.exit mock throws
      await expect(
        chatCommand(mockChatService, mockRegistry, {
          agent: 'nonexistent',
        })
      ).rejects.toThrow('process.exit');
      
      // Verify that exit was called with code 1
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle streaming errors gracefully', async () => {
      // Setup
      const mockAgent = {
        name: 'coder',
        capabilities: [AgentCapability.CODE_GENERATION],
        supportedTaskTypes: [TaskType.FEATURE],
        execute: jest.fn(),
      };

      const mockSession = {
        id: 'session-error',
        agentName: 'coder',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue([mockAgent]);
      mockRegistry.getAgent.mockReturnValue(mockAgent);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock streaming error
      async function* mockErrorStream() {
        throw new Error('Stream interrupted');
      }
      mockChatService.sendMessage.mockReturnValue(mockErrorStream());

      // Mock user typing a message, then "exit"
      mockPrompt
        .mockResolvedValueOnce({ message: 'Test message' })
        .mockResolvedValueOnce({ message: 'exit' });

      // Execute - should not throw, error should be caught
      await chatCommand(mockChatService, mockRegistry, {
        agent: 'coder',
      });

      // Verify - session should still be closed
      expect(mockChatService.closeSession).toHaveBeenCalledWith('session-error');
    });
  });

  describe('Combined scenarios', () => {
    it('should handle full chat session with agent selection and context', async () => {
      // Setup
      const mockAgents = [
        {
          name: 'coder',
          capabilities: [AgentCapability.CODE_GENERATION],
          supportedTaskTypes: [TaskType.FEATURE],
          execute: jest.fn(),
        },
        {
          name: 'reviewer',
          capabilities: [AgentCapability.CODE_REVIEW],
          supportedTaskTypes: [TaskType.REVIEW],
          execute: jest.fn(),
        },
      ];

      const mockSession = {
        id: 'session-full',
        agentName: 'coder',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        contextFiles: [],
        contextNodeIds: [],
        status: 'active' as const,
      };

      mockRegistry.listAgents.mockReturnValue(mockAgents);
      mockRegistry.getAgent.mockReturnValue(mockAgents[0]);
      mockChatService.createSession.mockReturnValue(mockSession);

      // Mock streaming responses
      async function* mockStream1() {
        yield { sessionId: 'session-full', messageId: 'msg-1', chunk: 'Response 1', isComplete: true };
      }
      async function* mockStream2() {
        yield { sessionId: 'session-full', messageId: 'msg-2', chunk: 'Response 2', isComplete: true };
      }

      mockChatService.sendMessage
        .mockReturnValueOnce(mockStream1())
        .mockReturnValueOnce(mockStream2());

      // Mock user interaction: select agent, send 2 messages, exit
      mockPrompt
        .mockResolvedValueOnce({ agent: 'coder' })
        .mockResolvedValueOnce({ message: 'First message' })
        .mockResolvedValueOnce({ message: 'Second message' })
        .mockResolvedValueOnce({ message: 'exit' });

      // Execute
      await chatCommand(mockChatService, mockRegistry, {
        context: ['src/test.ts'],
      });

      // Verify
      expect(mockChatService.createSession).toHaveBeenCalledWith('coder');
      expect(mockSession.contextFiles).toContain('src/test.ts');
      expect(mockChatService.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockChatService.closeSession).toHaveBeenCalledWith('session-full');
    });
  });
});
