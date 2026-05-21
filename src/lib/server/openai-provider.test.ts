import { describe, it, expect } from 'vitest';
import { mergeSameRole } from './openai-provider';
import type { ChatMessage } from './openai-provider';

describe.skip('mergeSameRole', () => {
  it('leaves alternating roles unchanged', () => {
    const input: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'What is your name?' },
    ];
    const result = mergeSameRole(input);
    expect(result).toEqual(input);
  });

  it('merges consecutive user messages', () => {
    const input: ChatMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'First question' },
      { role: 'user', content: 'Second question' },
    ];
    const result = mergeSameRole(input);
    expect(result).toEqual([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'First question\nSecond question' },
    ]);
  });

  it('merges consecutive assistant messages', () => {
    const input: ChatMessage[] = [
      { role: 'assistant', content: 'Part one' },
      { role: 'assistant', content: 'Part two' },
    ];
    const result = mergeSameRole(input);
    expect(result).toEqual([
      { role: 'assistant', content: 'Part one\nPart two' },
    ]);
  });

  it('merges multiple consecutive same-role messages into one', () => {
    const input: ChatMessage[] = [
      { role: 'user', content: 'A' },
      { role: 'user', content: 'B' },
      { role: 'user', content: 'C' },
    ];
    const result = mergeSameRole(input);
    expect(result).toEqual([
      { role: 'user', content: 'A\nB\nC' },
    ]);
  });

  it('does not merge consecutive system messages (system is excluded)', () => {
    const input: ChatMessage[] = [
      { role: 'system', content: 'System one' },
      { role: 'system', content: 'System two' },
      { role: 'user', content: 'User message' },
    ];
    const result = mergeSameRole(input);
    // system messages are NOT merged (because msg.role !== 'system' check)
    expect(result).toEqual([
      { role: 'system', content: 'System one' },
      { role: 'system', content: 'System two' },
      { role: 'user', content: 'User message' },
    ]);
  });

  it('handles empty array', () => {
    const input: ChatMessage[] = [];
    const result = mergeSameRole(input);
    expect(result).toEqual([]);
  });

  it('handles single message', () => {
    const input: ChatMessage[] = [
      { role: 'user', content: 'Only one' },
    ];
    const result = mergeSameRole(input);
    expect(result).toEqual(input);
  });

  it('real-world scenario: system + history user + new user question', () => {
    // This is the exact scenario that broke Mistral 14B:
    // system → user(history) → user(new question)
    const input: ChatMessage[] = [
      { role: 'system', content: 'System with RAG context...' },
      { role: 'user', content: 'What does Daniel do?' },
      { role: 'user', content: 'Tell me more about his experience' },
    ];
    const result = mergeSameRole(input);
    expect(result).toEqual([
      { role: 'system', content: 'System with RAG context...' },
      { role: 'user', content: 'What does Daniel do?\nTell me more about his experience' },
    ]);
  });

  it('does not mutate original array', () => {
    const input: ChatMessage[] = [
      { role: 'user', content: 'A' },
      { role: 'user', content: 'B' },
      { role: 'assistant', content: 'C' },
    ];
    const copy = [...input];
    mergeSameRole(input);
    expect(input).toEqual(copy);
  });
});
