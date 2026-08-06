import { describe, expect, it } from 'vitest';
import { CALENDAR_MONTH_NAMES, CALENDAR_TASKS } from '../src/calendarTasks.js';

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

        if (task.guideSteps) {
          expect(task.guideSteps.length).toBeGreaterThan(0);
          for (const step of task.guideSteps) {
            expect(step.caption).toBeTruthy();
            expect(step.src).toBeUndefined();
          }
        }
      }
    }
  });

  it('has no image asset references', () => {
    const blob = JSON.stringify(CALENDAR_TASKS);
    expect(blob).not.toMatch(/\/calendar\//);
    expect(blob).not.toMatch(/\.webp|\.jpg|\.png/);
  });
});
