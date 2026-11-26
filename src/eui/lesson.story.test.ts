import { expect, test } from 'bun:test';

import { Component } from '@effect/ui';
import { Story } from '@effect/ui/testing';

import { PlayCue } from './contract';
import {
  Lesson,
  LessonMessage,
  NoteCheck,
  NoteReached,
  NoteUnlock,
  OpenEngine,
  WaitBeforeStep,
  WarmCompiler,
} from './lesson';

const props = { calm: true, fine: true, full: false, unit: 'start' };
const newline = '\n';

test('story: the drill gate passes only after the whole template is typed and Esc', () => {
  const story = Story.start(Lesson, props);
  const settle = (): void => {
    for (const entry of story.pending.slice()) {
      if (entry.command.name === 'lesson/NoteCheck') {
        story.resolve(NoteCheck, Component.noop);
      }
      if (entry.command.name === 'lesson/NoteReached') {
        story.resolve(NoteReached, Component.noop);
      }
      if (entry.command.name === 'lesson/WarmCompiler') {
        story.resolve(WarmCompiler, Component.noop);
      }
      if (entry.command.name === 'cues/PlayCue') {
        story.resolve(PlayCue, Component.noop);
      }
      if (entry.command.name === 'lesson/NoteUnlock') {
        story.resolve(NoteUnlock, Component.noop);
      }
    }
  };
  const booting = story.subscriptions;
  story.send(LessonMessage.Booted());
  story.resolve(
    OpenEngine,
    LessonMessage.CompletedOpenEngine({ passed: [], position: 'type-template', unlocked: [] }),
  );
  settle();
  if (story.pending.some((entry) => entry.command.name === 'WaitBeforeStep')) {
    story.resolve(WaitBeforeStep, LessonMessage.CompletedWaitStep({ token: story.model.token }));
  }
  const { target, position } = story.model.drill;
  story.send(LessonMessage.PressedKey({ key: 'i' }));
  for (const char of target.slice(position)) {
    story.send(LessonMessage.PressedKey({ key: char === newline ? 'Enter' : char }));
    settle();
  }
  const beforeEscape = story.model.phase;
  story.send(LessonMessage.PressedKey({ key: 'Escape' }));
  settle();
  expect(booting.some((key) => key.startsWith('boot'))).toBe(true);
  expect(beforeEscape).toBe('blocked');
  expect(story.model.phase).toBe('ready');
  expect(story.model.passed).toContain('type-template');
  expect(story.pending).toHaveLength(0);
});
