import { expect, test } from 'bun:test';

import { Component } from '@effect/ui';
import { Story } from '@effect/ui/testing';

import { NoteCheck, NoteReached, NoteUnlock, OpenEngine, WaitBeforeStep } from './commands';
import { PlayCue } from './contract';
import { Lesson, LessonMessage } from './lesson';

const props = { calm: true, fine: true, full: false, unit: 'start' };
const newline = '\n';

test('story: the drill gate passes only after the whole template is typed and Esc', () => {
  const story = Story.start(Lesson, props);
  const settle = (): void => {
    for (const entry of [...story.pending]) {
      if (entry.command.name === 'NoteCheck') {
        story.resolve(NoteCheck, undefined);
      }
      if (entry.command.name === 'NoteReached') {
        story.resolve(NoteReached, undefined);
      }
      if (entry.command.name === 'cues/PlayCue') {
        story.resolve(PlayCue, Component.noop);
      }
      if (entry.command.name === 'NoteUnlock') {
        story.resolve(NoteUnlock, undefined);
      }
    }
  };
  const booting = story.subscriptions;
  story.send(LessonMessage.Booted());
  story.resolve(OpenEngine, { passed: [], position: 'type-template', unlocked: [] });
  settle();
  if (story.pending.some((entry) => entry.command.name === 'WaitBeforeStep')) {
    story.resolve(WaitBeforeStep, story.model.token);
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
