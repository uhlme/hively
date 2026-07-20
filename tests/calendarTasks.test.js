import { describe, expect, it } from 'vitest';
import { CALENDAR_MONTH_NAMES, CALENDAR_TASKS } from '../src/calendarTasks.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('calendarTasks schema', () => {
  it('has twelve German month names', () => {
    expect(CALENDAR_MONTH_NAMES).toHaveLength(12);
    expect(CALENDAR_MONTH_NAMES[0]).toBe('Januar');
    expect(CALENDAR_MONTH_NAMES[11]).toBe('Dezember');
  });

  it('covers all months with valid task shapes', () => {
    for (let month = 1; month <= 12; month += 1) {
      const key = String(month);
      const tasks = CALENDAR_TASKS[key];
      expect(tasks, `month ${key} missing`).toBeTruthy();
      expect(tasks.length).toBeGreaterThan(0);

      const ids = new Set();
      for (const task of tasks) {
        expect(task.id).toBeTruthy();
        expect(task.title).toBeTruthy();
        expect(task.approxDate).toBeTruthy();
        expect(task.guide).toBeTruthy();
        expect(ids.has(task.id)).toBe(false);
        ids.add(task.id);

        if (task.visualSteps) {
          for (const step of task.visualSteps) {
            expect(step.src).toMatch(/^\/calendar\/.+\.webp$/);
            expect(step.fallback).toMatch(/^\/calendar\/.+\.jpg$/);
            expect(step.caption).toBeTruthy();
            expect(step.alt).toBeTruthy();
          }
        }
      }
    }
  });

  it('references existing calendar image assets', () => {
    const referenced = new Set();
    for (const tasks of Object.values(CALENDAR_TASKS)) {
      for (const task of tasks) {
        for (const step of task.visualSteps || []) {
          referenced.add(step.src);
          if (step.fallback) referenced.add(step.fallback);
        }
      }
    }

    expect(referenced.size).toBeGreaterThan(0);
    for (const path of referenced) {
      const filePath = join(process.cwd(), 'public', path);
      expect(existsSync(filePath), `missing asset ${path}`).toBe(true);
    }
  });
});
