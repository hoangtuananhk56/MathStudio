import { describe, expect, it } from 'vitest';
import { latexToOmml } from '../src/core/equation';
import { parseXml } from '../src/core/xml';
import { PALETTE } from '../src/editor/palette';

const NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('every palette template converts to OMML', () => {
  for (const cat of PALETTE) {
    for (const item of cat.items) {
      it(`${cat.id}: ${item.insert}`, () => {
        // Fill slots the way a user would.
        const latex = item.insert.replace(/#0/g, ' x ').replace(/#\?/g, ' a ');
        const omml = latexToOmml(latex, { layout: 'inline', fontId: 'stix' });
        parseXml(`<m:oMath ${NS}>${omml}</m:oMath>`);
        expect(omml).not.toMatch(/<m:t>\\/); // no raw LaTeX commands leaking into the output
        expect(omml.length).toBeGreaterThan(0);
      });
    }
  }
});
