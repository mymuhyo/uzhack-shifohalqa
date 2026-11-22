import { describe, expect, it } from 'vitest';
import { doctorReplyTemplates, doctorReplyTemplatesMap } from '../../src/lib/clinical-templates';

describe('clinical reply templates', () => {
  it('provides concise Uzbek templates within 500 chars for every rule key', () => {
    for (const [key, templates] of Object.entries(doctorReplyTemplatesMap)) {
      expect(templates.length).toBeGreaterThanOrEqual(2);
      for (const template of templates) {
        expect(template.trim().length).toBeGreaterThan(10);
        expect(template.length).toBeLessThanOrEqual(500);
      }
      expect(doctorReplyTemplates(key)).toEqual(templates);
    }
    expect(doctorReplyTemplates('unknown_rule').length).toBeGreaterThanOrEqual(2);
  });
});
