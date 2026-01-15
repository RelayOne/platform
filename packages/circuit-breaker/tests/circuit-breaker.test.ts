/**
 * @fileoverview Tests for @relay/circuit-breaker package
 * @module tests/circuit-breaker
 *
 * Tests for the circuit breaker pattern implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  CircuitTimeoutError,
  circuitBreakers,
  withCircuit,
  withRetry,
  withCircuitAndRetry,
  Circuits,
} from '../src/index.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    // Clear the registry before each test
    circuitBreakers.clear();
  });

  describe('constructor', () => {
    it('should create circuit breaker with default options', () => {
      const breaker = new CircuitBreaker('test');
      expect(breaker.getName()).toBe('test');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should accept custom options', () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 10,
        resetTimeout: 60000,
      });
      expect(breaker.getName()).toBe('test');
    });
  });

  describe('execute', () => {
    it('should execute successful function', async () => {
      const breaker = new CircuitBreaker('test');
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should propagate function errors', async () => {
      const breaker = new CircuitBreaker('test');
      await expect(
        breaker.execute(async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
    });

    it('should track statistics', async () => {
      const breaker = new CircuitBreaker('test');

      // Successful calls
      await breaker.execute(async () => 'result');
      await breaker.execute(async () => 'result');

      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(0);
    });
  });

  describe('state transitions', () => {
    it('should open circuit after failure threshold', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 3,
        failureWindow: 60000,
      });

      // Generate failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('failure');
          });
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject requests when open', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        resetTimeout: 60000,
      });

      // Trigger open state
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      // Should reject next request
      await expect(breaker.execute(async () => 'success')).rejects.toThrow(
        CircuitOpenError
      );
    });

    it('should transition to half-open after reset timeout', async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        resetTimeout: 1000,
      });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past reset timeout
      vi.advanceTimersByTime(1100);

      // Next request should be allowed (half-open)
      expect(breaker.isAllowed()).toBe(true);

      vi.useRealTimers();
    });

    it('should close circuit after success threshold in half-open', async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        successThreshold: 2,
        resetTimeout: 1000,
      });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      // Advance to half-open
      vi.advanceTimersByTime(1100);

      // Two successful requests should close the circuit
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      vi.useRealTimers();
    });

    it('should reopen circuit on failure in half-open', async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        resetTimeout: 1000,
      });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      // Advance to half-open
      vi.advanceTimersByTime(1100);

      // Failure should reopen
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      vi.useRealTimers();
    });
  });

  describe('timeout', () => {
    it('should timeout slow requests', async () => {
      const breaker = new CircuitBreaker('test', {
        requestTimeout: 100,
      });

      await expect(
        breaker.execute(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('result'), 200);
            })
        )
      ).rejects.toThrow(CircuitTimeoutError);
    });

    it('should not timeout fast requests', async () => {
      const breaker = new CircuitBreaker('test', {
        requestTimeout: 1000,
      });

      const result = await breaker.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'success';
      });

      expect(result).toBe('success');
    });
  });

  describe('callbacks', () => {
    it('should call onSuccess callback', async () => {
      const onSuccess = vi.fn();
      const breaker = new CircuitBreaker('test', { onSuccess });

      await breaker.execute(async () => 'success');

      expect(onSuccess).toHaveBeenCalled();
    });

    it('should call onFailure callback', async () => {
      const onFailure = vi.fn();
      const breaker = new CircuitBreaker('test', { onFailure });

      try {
        await breaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }

      expect(onFailure).toHaveBeenCalled();
    });

    it('should call onStateChange callback', async () => {
      const onStateChange = vi.fn();
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        onStateChange,
      });

      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitState.OPEN,
        CircuitState.CLOSED
      );
    });
  });

  describe('fallback', () => {
    it('should use fallback when circuit is open', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        resetTimeout: 60000,
        fallback: () => 'fallback value',
      });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      // Should return fallback
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('fallback value');
    });
  });

  describe('isFailure filter', () => {
    it('should not count filtered errors as failures', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 2,
        isFailure: (error) => error.message !== 'not-a-failure',
      });

      // This should not count as failure
      try {
        await breaker.execute(async () => {
          throw new Error('not-a-failure');
        });
      } catch {
        // Expected
      }

      // This should count
      try {
        await breaker.execute(async () => {
          throw new Error('real-failure');
        });
      } catch {
        // Expected
      }

      // Circuit should still be closed (only 1 real failure)
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('reset', () => {
    it('should reset circuit to closed state', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 1 });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('forceOpen', () => {
    it('should force circuit to open state', () => {
      const breaker = new CircuitBreaker('test');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.forceOpen();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 10 });

      // 3 successes
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => 'success');

      // 2 failures
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(5);
      expect(stats.successfulRequests).toBe(3);
      expect(stats.failedRequests).toBe(2);
      expect(stats.failureRate).toBe(40); // 2/5 = 40%
    });
  });
});

describe('circuitBreakers registry', () => {
  beforeEach(() => {
    circuitBreakers.clear();
  });

  it('should create and retrieve circuit breaker', () => {
    const breaker = circuitBreakers.get('service-a');
    expect(breaker).toBeInstanceOf(CircuitBreaker);
    expect(breaker.getName()).toBe('service-a');
  });

  it('should return same instance for same name', () => {
    const breaker1 = circuitBreakers.get('service-a');
    const breaker2 = circuitBreakers.get('service-a');
    expect(breaker1).toBe(breaker2);
  });

  it('should check if breaker exists', () => {
    circuitBreakers.get('service-a');
    expect(circuitBreakers.has('service-a')).toBe(true);
    expect(circuitBreakers.has('service-b')).toBe(false);
  });

  it('should remove circuit breaker', () => {
    circuitBreakers.get('service-a');
    expect(circuitBreakers.remove('service-a')).toBe(true);
    expect(circuitBreakers.has('service-a')).toBe(false);
  });

  it('should get all circuit breakers', () => {
    circuitBreakers.get('service-a');
    circuitBreakers.get('service-b');
    const all = circuitBreakers.getAll();
    expect(all.size).toBe(2);
  });

  it('should get all stats', () => {
    circuitBreakers.get('service-a');
    circuitBreakers.get('service-b');
    const stats = circuitBreakers.getAllStats();
    expect(stats.size).toBe(2);
  });

  it('should reset all circuit breakers', async () => {
    const breaker = circuitBreakers.get('service-a', { failureThreshold: 1 });

    // Open the circuit
    try {
      await breaker.execute(async () => {
        throw new Error('failure');
      });
    } catch {
      // Expected
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    circuitBreakers.resetAll();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});

describe('withCircuit', () => {
  beforeEach(() => {
    circuitBreakers.clear();
  });

  it('should wrap function with circuit breaker', async () => {
    const fn = async (value: string) => `result: ${value}`;
    const protectedFn = withCircuit(fn, 'test-circuit');

    const result = await protectedFn('test');
    expect(result).toBe('result: test');
  });

  it('should share circuit breaker state', async () => {
    const fn = async () => {
      throw new Error('failure');
    };
    const protectedFn = withCircuit(fn, 'shared-circuit', {
      failureThreshold: 1,
    });

    try {
      await protectedFn();
    } catch {
      // Expected
    }

    const breaker = circuitBreakers.get('shared-circuit');
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });
});

describe('withRetry', () => {
  it('should retry on failure', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('temporary failure');
      }
      return 'success';
    };

    const retryFn = withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    const result = await retryFn();

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should fail after max retries', async () => {
    const fn = async () => {
      throw new Error('persistent failure');
    };

    const retryFn = withRetry(fn, { maxRetries: 2, baseDelay: 10 });

    await expect(retryFn()).rejects.toThrow('persistent failure');
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('failure');
      }
      return 'success';
    };

    const retryFn = withRetry(fn, { maxRetries: 3, baseDelay: 10, onRetry });
    await retryFn();

    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('should respect shouldRetry predicate by calling it on each failure', async () => {
    let attempts = 0;
    let shouldRetryCalls = 0;

    const fn = async () => {
      attempts++;
      throw new Error('error');
    };

    const retryFn = withRetry(fn, {
      maxRetries: 3,
      baseDelay: 10,
      shouldRetry: () => {
        shouldRetryCalls++;
        return true; // Always return true, max retries will limit
      },
    });

    await expect(retryFn()).rejects.toThrow('error');
    // shouldRetry is called after each failure before deciding to retry
    // With maxRetries=3, there are 4 attempts (0,1,2,3) and 3 retry decisions (after 0,1,2)
    expect(shouldRetryCalls).toBe(3);
  });
});

describe('withCircuitAndRetry', () => {
  beforeEach(() => {
    circuitBreakers.clear();
  });

  it('should combine circuit breaker and retry', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('temporary');
      }
      return 'success';
    };

    const protectedFn = withCircuitAndRetry(fn, 'combined', {
      failureThreshold: 5,
      maxRetries: 3,
      baseDelay: 10,
    });

    const result = await protectedFn();
    expect(result).toBe('success');
  });

  it('should not retry on CircuitOpenError', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error('failure');
    };

    const protectedFn = withCircuitAndRetry(fn, 'no-retry-open', {
      failureThreshold: 1,
      maxRetries: 3,
      baseDelay: 10,
    });

    // First call opens circuit
    try {
      await protectedFn();
    } catch {
      // Expected
    }

    // Second call should throw CircuitOpenError without retrying
    const attemptsBefore = attempts;
    try {
      await protectedFn();
    } catch (error) {
      expect(error).toBeInstanceOf(CircuitOpenError);
    }

    // Should not have made additional attempts
    expect(attempts).toBe(attemptsBefore);
  });
});

describe('Error classes', () => {
  describe('CircuitOpenError', () => {
    it('should have correct properties', () => {
      const error = new CircuitOpenError('Circuit is open', 12345);
      expect(error.name).toBe('CircuitOpenError');
      expect(error.message).toBe('Circuit is open');
      expect(error.resetTime).toBe(12345);
    });

    it('should use default message', () => {
      const error = new CircuitOpenError();
      expect(error.message).toBe('Circuit breaker is open');
    });
  });

  describe('CircuitTimeoutError', () => {
    it('should have correct properties', () => {
      const error = new CircuitTimeoutError('Timeout occurred');
      expect(error.name).toBe('CircuitTimeoutError');
      expect(error.message).toBe('Timeout occurred');
    });

    it('should use default message', () => {
      const error = new CircuitTimeoutError();
      expect(error.message).toBe('Request timed out');
    });
  });
});

describe('Circuits (pre-configured)', () => {
  it('should have pre-configured circuit breakers', () => {
    expect(Circuits.OPENAI).toBeInstanceOf(CircuitBreaker);
    expect(Circuits.ANTHROPIC).toBeInstanceOf(CircuitBreaker);
    expect(Circuits.GOOGLE).toBeInstanceOf(CircuitBreaker);
    expect(Circuits.STRIPE).toBeInstanceOf(CircuitBreaker);
    expect(Circuits.MONGODB).toBeInstanceOf(CircuitBreaker);
    expect(Circuits.INTEGRATIONS).toBeInstanceOf(CircuitBreaker);
  });
});
