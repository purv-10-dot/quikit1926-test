/**
 * parseQuizPaste — bulk paste and option-label flexibility.
 *
 * The brief: an author should be able to paste 15+ questions at once, and the
 * parser should read the labels they actually typed rather than one rigid
 * house style. Every accepted style collapses to the same shape —
 *
 *     [Option|Choice] [ ( or [ ] TOKEN [ ) or ] ] DELIMITER text
 *
 * — where TOKEN is a letter, a number or a roman numeral and DELIMITER is one
 * of  ) . : ] - — – → .
 *
 * The interesting case is roman numerals, because I, V, X, C, D and M are also
 * ordinary letters. That is resolved by ORDER, not by guessing at a single
 * label: letters are tried first, then digits, then roman. "A) B) C)" reads as
 * letters even though C is roman 100; "I) II) III)" produces only one letter
 * match, falls through, and reads as roman. These tests pin both directions,
 * because getting one right by breaking the other would be easy.
 */
import { describe, it, expect } from 'vitest';
import { parseQuizPaste } from '@/lib/utils/parseQuizPaste';

/** Build a one-question block using a given label style. */
const q = (labels: string[]) =>
  ['What is the capital of France?', ...labels.map((l, i) => `${l} ${['London', 'Paris*', 'Berlin', 'Madrid'][i]}`)].join('\n');

const parseOne = (text: string) => {
  const r = parseQuizPaste(text);
  return r.questions[0];
};

describe('letter labels', () => {
  const styles: [string, string[]][] = [
    ['A)',        ['A)', 'B)', 'C)', 'D)']],
    ['A.',        ['A.', 'B.', 'C.', 'D.']],
    ['A:',        ['A:', 'B:', 'C:', 'D:']],
    ['(A)',       ['(A)', '(B)', '(C)', '(D)']],
    ['[A]',       ['[A]', '[B]', '[C]', '[D]']],
    ['A —',       ['A —', 'B —', 'C —', 'D —']],
    ['A –',       ['A –', 'B –', 'C –', 'D –']],
    ['A →',       ['A →', 'B →', 'C →', 'D →']],
    ['A -',       ['A -', 'B -', 'C -', 'D -']],
    ['lower a)',  ['a)', 'b)', 'c)', 'd)']],
    ['lower (a)', ['(a)', '(b)', '(c)', '(d)']],
    ['lower [a]', ['[a]', '[b]', '[c]', '[d]']],
    ['lower a.',  ['a.', 'b.', 'c.', 'd.']],
  ];

  for (const [name, labels] of styles) {
    it(`reads ${name}`, () => {
      const parsed = parseOne(q(labels));
      expect(parsed.options).toEqual(['London', 'Paris', 'Berlin', 'Madrid']);
      expect(parsed.correctAnswerIndex).toBe(1);
    });
  }
});

describe('number labels', () => {
  const styles: [string, string[]][] = [
    ['1)',  ['1)', '2)', '3)', '4)']],
    ['1.',  ['1.', '2.', '3.', '4.']],
    ['1:',  ['1:', '2:', '3:', '4:']],
    ['(1)', ['(1)', '(2)', '(3)', '(4)']],
    ['[1]', ['[1]', '[2]', '[3]', '[4]']],
    ['1 —', ['1 —', '2 —', '3 —', '4 —']],
    ['1 →', ['1 →', '2 →', '3 →', '4 →']],
  ];

  for (const [name, labels] of styles) {
    it(`reads ${name}`, () => {
      const parsed = parseOne(q(labels));
      expect(parsed.options).toEqual(['London', 'Paris', 'Berlin', 'Madrid']);
      expect(parsed.correctAnswerIndex).toBe(1);
    });
  }
});

describe('roman labels', () => {
  const styles: [string, string[]][] = [
    ['I)',   ['I)', 'II)', 'III)', 'IV)']],
    ['I.',   ['I.', 'II.', 'III.', 'IV.']],
    ['I:',   ['I:', 'II:', 'III:', 'IV:']],
    ['(I)',  ['(I)', '(II)', '(III)', '(IV)']],
    ['[I]',  ['[I]', '[II]', '[III]', '[IV]']],
    ['i)',   ['i)', 'ii)', 'iii)', 'iv)']],
    ['(i)',  ['(i)', '(ii)', '(iii)', '(iv)']],
    ['[i]',  ['[i]', '[ii]', '[iii]', '[iv]']],
  ];

  for (const [name, labels] of styles) {
    it(`reads ${name}`, () => {
      const parsed = parseOne(q(labels));
      expect(parsed.options).toEqual(['London', 'Paris', 'Berlin', 'Madrid']);
      expect(parsed.correctAnswerIndex).toBe(1);
    });
  }

  it('does NOT hijack a plain A–D list just because C and D are roman', () => {
    // The regression this ordering exists to prevent.
    const parsed = parseOne(q(['A)', 'B)', 'C)', 'D)']));
    expect(parsed.options).toEqual(['London', 'Paris', 'Berlin', 'Madrid']);
  });

  it('does NOT hijack a list that merely starts at I', () => {
    // I, J, K are consecutive letters; J is not roman at all.
    const parsed = parseOne(q(['I)', 'J)', 'K)', 'L)']));
    expect(parsed.options).toEqual(['London', 'Paris', 'Berlin', 'Madrid']);
  });

  it('rejects non-canonical numerals rather than guessing', () => {
    // "IIII" is not how 4 is written; treat the block as unlabelled instead of
    // inventing an index for it.
    const r = parseQuizPaste('Q\nIIII) a\nIIIII) b');
    expect(r.questions).toHaveLength(0);
  });
});

describe('word-prefixed labels', () => {
  it('reads "Option A:"', () => {
    const parsed = parseOne(q(['Option A:', 'Option B:', 'Option C:', 'Option D:']));
    expect(parsed.options).toEqual(['London', 'Paris', 'Berlin', 'Madrid']);
    expect(parsed.correctAnswerIndex).toBe(1);
  });

  it('reads "Option A —"', () => {
    const parsed = parseOne(q(['Option A —', 'Option B —', 'Option C —', 'Option D —']));
    expect(parsed.correctAnswerIndex).toBe(1);
  });

  it('reads "Choice A:"', () => {
    const parsed = parseOne(q(['Choice A:', 'Choice B:', 'Choice C:', 'Choice D:']));
    expect(parsed.correctAnswerIndex).toBe(1);
  });

  it('reads "Choice 1:"', () => {
    const parsed = parseOne(q(['Choice 1:', 'Choice 2:', 'Choice 3:', 'Choice 4:']));
    expect(parsed.options).toEqual(['London', 'Paris', 'Berlin', 'Madrid']);
  });
});

describe('answer lines', () => {
  it('resolves a roman answer reference', () => {
    const parsed = parseOne(
      'Capital of France?\nI) London\nII) Paris\nIII) Berlin\nIV) Madrid\nAnswer: II',
    );
    expect(parsed.correctAnswerIndex).toBe(1);
  });

  it('keeps a letter answer as a letter when that reading fits', () => {
    // C is roman 100, but index 2 exists here, so the letter reading wins.
    const parsed = parseOne(
      'Capital of France?\nA) London\nB) Paris\nC) Berlin\nD) Madrid\nAnswer: C',
    );
    expect(parsed.correctAnswerIndex).toBe(2);
  });

  it('still resolves multi-select via "Answer: B, D"', () => {
    const parsed = parseOne(
      'Which are prime?\nA) 4\nB) 7\nC) 9\nD) 11\nAnswer: B, D',
    );
    expect(parsed.isMultiSelect).toBe(true);
    expect(parsed.correctAnswerIndex).toEqual([1, 3]);
  });
});

describe('bulk paste', () => {
  it('splits 15 questions into 15 separate entries', () => {
    const block = Array.from({ length: 15 }, (_, i) =>
      [`${i + 1}. Question number ${i + 1}?`, 'A) wrong', `B) right${i}*`, 'C) also wrong'].join('\n'),
    ).join('\n\n');

    const r = parseQuizPaste(block);

    expect(r.questions).toHaveLength(15);
    expect(r.questions[0].text).toBe('Question number 1?');
    expect(r.questions[14].text).toBe('Question number 15?');
    // Every one keeps its own options and its own correct answer.
    for (let i = 0; i < 15; i++) {
      expect(r.questions[i].options).toHaveLength(3);
      expect(r.questions[i].correctAnswerIndex).toBe(1);
      expect(r.questions[i].options[1]).toBe(`right${i}`);
    }
  });

  it('handles 15 questions in MIXED label styles in one paste', () => {
    // Nobody pastes 15 questions in a single consistent style; the label
    // detection is per question-block, so a mixed document must still work.
    const styles = [
      ['A)', 'B)', 'C)'],
      ['1.', '2.', '3.'],
      ['(i)', '(ii)', '(iii)'],
      ['Option A:', 'Option B:', 'Option C:'],
      ['a —', 'b —', 'c —'],
    ];
    const block = Array.from({ length: 15 }, (_, i) => {
      const s = styles[i % styles.length];
      return [`Q${i + 1}. Question ${i + 1}?`, `${s[0]} wrong`, `${s[1]} right*`, `${s[2]} nope`].join('\n');
    }).join('\n\n');

    const r = parseQuizPaste(block);

    expect(r.questions).toHaveLength(15);
    for (const parsed of r.questions) {
      expect(parsed.options).toEqual(['wrong', 'right', 'nope']);
      expect(parsed.correctAnswerIndex).toBe(1);
    }
  });

  it('separates questions on --- as well as blank lines', () => {
    const r = parseQuizPaste('One?\nA) x*\nB) y\n---\nTwo?\nA) p\nB) q*');
    expect(r.questions).toHaveLength(2);
    expect(r.questions[1].correctAnswerIndex).toBe(1);
  });
});

describe('formats that already worked keep working', () => {
  it('trailing asterisk', () => {
    expect(parseOne('Q?\nA) no\nB) yes*').correctAnswerIndex).toBe(1);
  });

  it('[correct] marker', () => {
    expect(parseOne('Q?\nA) no\nB) yes [correct]').correctAnswerIndex).toBe(1);
  });

  it('checkmark marker', () => {
    expect(parseOne('Q?\nA) no\nB) yes ✓').correctAnswerIndex).toBe(1);
  });

  it('true/false switches type', () => {
    const parsed = parseOne('The sky is blue.\n- True\n- False\nAnswer: True');
    expect(parsed.type).toBe('True/False');
  });

  it('answer by option text', () => {
    const parsed = parseOne('Capital?\nA) London\nB) Paris\nAnswer: Paris');
    expect(parsed.correctAnswerIndex).toBe(1);
  });
});
