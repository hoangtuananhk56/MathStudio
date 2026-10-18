import { describe, expect, it } from 'vitest';
import { loosePictureLatex } from '../src/office/word';

/** What Word gives back for a MathStudio picture dragged out of its content control. */
const picture = (name: string, descr: string) =>
  `<w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="7" name="${name}" descr="${descr}"/></wp:inline></w:drawing></w:r>`;

describe('MathStudio pictures moved out of their content control', () => {
  it('an equation picture keeps its LaTeX in its alternative text', () => {
    expect(loosePictureLatex(picture('MathStudio Equation 12', 'x^2+y_1=\frac{a}{b}'))).toBe('x^2+y_1=\frac{a}{b}');
    expect(loosePictureLatex(picture('MathStudio Equation 3', 'a &lt; b &amp;&amp; c'))).toBe('a < b && c');
    // Word may write the attributes the other way round
    expect(loosePictureLatex('<wp:docPr id="7" descr="\sqrt{2}" name="MathStudio Equation 5"/>')).toBe('\sqrt{2}');
  });

  it('other pictures are not equations', () => {
    expect(loosePictureLatex(picture('Picture 1', 'a photo'))).toBeNull();
    expect(loosePictureLatex(picture('MathStudio Figure 4', 'MathStudio – hình vẽ'))).toBeNull();
  });
});
