# Performance Audit Tests

This directory contains performance audit tests for the Nexus Coder V2 IDE widgets.

## Memory Leak Detection Tests

The memory leak detection tests validate that widgets properly release references when unmounted by running multiple mount/unmount cycles and measuring heap growth.

### Test Files

- `memory-leak.ts` - Memory leak detector implementation
- `memory-leak.integration.test.tsx` - Integration tests for memory leak detection

### Requirements Validated

- **17.1**: 100x mount/unmount cycles
- **17.2**: Heap growth measurement
- **17.3**: Reference release verification (GraphExplorer, ReasoningLog)
- **17.4**: Event listener cleanup

### Running Tests

#### Standard Mode (Infrastructure Validation)

```bash
npm test -- src/__tests__/audit/performance/memory-leak.integration.test.tsx
```

In standard mode, tests validate that:
- 100 mount/unmount cycles complete successfully
- Heap measurements are captured correctly
- Memory snapshots contain all required fields
- Retained object analysis works
- Violation reports are generated correctly

**Note**: Heap growth assertions are skipped without GC available.

#### Accurate Memory Leak Detection (with GC)

For accurate heap growth measurements, run with the `--expose-gc` flag:

```bash
node --expose-gc node_modules/.bin/jest src/__tests__/audit/performance/memory-leak.integration.test.tsx
```

With GC enabled, tests additionally validate:
- Heap growth stays within 10% after 100 cycles
- All widgets pass memory leak detection
- Event listeners are properly cleaned up

### Test Coverage

The integration tests cover:

1. **GraphExplorer** - Validates graph data structure release
2. **ReasoningLog** - Validates log entry release (50 and 1000 entries)
3. **TaskPanel** - Validates task list release (50 and 100 tasks)
4. **Event Listener Cleanup** - Validates all widgets clean up listeners
5. **Batch Testing** - Tests multiple widgets together
6. **Memory Snapshots** - Validates snapshot capture infrastructure

### Performance Thresholds

- **Cycles**: 100 mount/unmount cycles (50 for large datasets)
- **Max Heap Growth**: 10% of baseline
- **GC Attempts**: 3 attempts with 100ms delay between each
- **Snapshot Frequency**: Every 10 cycles + baseline + final

### Understanding Test Results

#### Without GC (Standard Mode)

```
WARNING: Tests running without --expose-gc flag.
Heap growth assertions will be skipped.
```

Tests validate infrastructure but skip heap growth assertions.

#### With GC (Accurate Mode)

```
=== GraphExplorer Memory Leak Test ✓ PASS ===
Cycles: 100
Baseline Heap: 250000.00KB
Final Heap: 255000.00KB
Heap Growth: 5000.00KB (2.00%)
Limit: 10%
```

Tests validate both infrastructure and actual heap behavior.

### Interpreting Failures

If a widget fails memory leak detection with GC enabled:

1. **Check Retained Objects**: The test output shows estimated retained object types
2. **Review Event Listeners**: Ensure all event listeners are removed in cleanup
3. **Check Closures**: Look for closures that capture component references
4. **Verify useEffect Cleanup**: Ensure all useEffect hooks return cleanup functions

Example failure output:

```
=== TaskPanel Memory Leak Test ✗ FAIL ===
Cycles: 100
Baseline Heap: 300000.00KB
Final Heap: 350000.00KB
Heap Growth: 50000.00KB (16.67%)
Limit: 10%

Estimated Retained Objects:
  - React Component Instance: ~16
  - Event Listener: ~100
  - Closure/Callback: ~250
```

This indicates event listeners or callbacks are not being cleaned up properly.

### CI/CD Integration

For CI pipelines, run tests in both modes:

```yaml
# Standard mode (fast, validates infrastructure)
- run: npm test -- src/__tests__/audit/performance/memory-leak.integration.test.tsx

# Accurate mode (slower, validates actual memory behavior)
- run: node --expose-gc node_modules/.bin/jest src/__tests__/audit/performance/memory-leak.integration.test.tsx
```

### Troubleshooting

#### Tests timeout

Increase timeout in jest.config.js or use `--testTimeout`:

```bash
npm test -- src/__tests__/audit/performance/memory-leak.integration.test.tsx --testTimeout=300000
```

#### High heap growth in CI

CI environments may have different memory characteristics. Consider:
- Running with `--expose-gc` for accurate measurements
- Adjusting the `MAX_HEAP_GROWTH_PERCENT` threshold if needed
- Checking for CI-specific memory pressure

#### Flaky results

Memory measurements can vary. The tests use:
- Multiple GC attempts to stabilize heap
- Snapshots every 10 cycles to track trends
- Variance checking across runs

If results are inconsistent, check for:
- Background processes consuming memory
- Insufficient system memory
- Other tests running in parallel

## Related Documentation

- [Design Document](../../../../.kiro/specs/nexus-codebase-audit/design.md) - Performance audit design
- [Requirements](../../../../.kiro/specs/nexus-codebase-audit/requirements.md) - Requirement 17 (Memory Leaks)
- [Tasks](../../../../.kiro/specs/nexus-codebase-audit/tasks.md) - Task 11.4 (Memory Leak Integration Tests)
