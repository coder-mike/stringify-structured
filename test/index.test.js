const { stringify, list, block, inline, text } = require('..');
const assert = require('assert');

const stringifyExpanded = value => stringify(value, { wrapWidth: 0 })
const stringifyIndented = value => stringify(value, { wrapWidth: 0, baseIndent: '      ' })

const text1 = text`foo`;
const block1 = block`{ ${text1} }`;
const list1 = list(', ', [1, 2, 3])
const list2 = list(', ', [block1, block1, block1]);
const block2 = block`{ ${list1} }`;
const text2 = text
  `# Interesting text

    - Point1
    - Point2

  Paragraph`;
const block3 = block`{ ${text2} }`;
const list3 = list('', [text2, text2]);
const inline1 = inline`a ${text1} c`;
const inline2 = inline`a ${block1} b ${block1} c ${block1}`;

describe('primitives', function () {
  it('simple string', function() {
    const result = stringify('foo');
    assert.strictEqual(result, "'foo'");
  });

  it('multi-line string', function() {
    const result = stringify('foo\nbar');
    assert.strictEqual(result, "'foo\\nbar'");
  });

  it('number', function() {
    const result = stringify(5);
    assert.strictEqual(result, '5');
  });

  it('boolean', function() {
    assert.strictEqual(stringify(true), 'true');
    assert.strictEqual(stringify(false), 'false');
  });
});

describe('text', function () {
  it('simple', function() {
    assert.strictEqual(stringify(text`hello`), 'hello');
  });

  it('multi-line', function() {
    assert.strictEqual(stringify(text`hello\nthere\nworld`), 'hello\nthere\nworld');
    assert.strictEqual(stringifyIndented(text`hello\nthere\nworld`),
      `hello
      there
      world`);
    assert.strictEqual(stringifyIndented(text`hello\n    there\n    world`),
      `hello
      there
      world`);
  });
});

describe('block', function () {
  let s = block`{ ${text1} }`;

  it('simple', function() {
    assert.strictEqual(stringify(s), '{ foo }');
    assert.strictEqual(stringifyExpanded(s), '{\n  foo\n}');
  });

  it('indented', function() {
    assert.strictEqual(stringifyIndented(s),
      `{
        foo
      }`);
  });

  it('block of list', function() {
    assert.strictEqual(stringify(block2), '{ 1, 2, 3 }');
    assert.strictEqual(stringifyIndented(block2),
      `{
        1,
        2,
        3
      }`);
  });

  it('block of text', function() {
    assert.strictEqual(stringifyIndented(block3),
      `{
        # Interesting text

          - Point1
          - Point2

        Paragraph
      }`);
  });
});

describe('list', function () {
  it('simple', function() {
    assert.strictEqual(stringify(list1), '1, 2, 3');
    assert.strictEqual(stringifyExpanded(list1), '1,\n2,\n3');
  });

  it('indented', function() {
    assert.strictEqual(stringifyIndented(list1),
      `1,
      2,
      3`);
  });

  it('list of block', function() {
    assert.strictEqual(stringify(list2), '{ foo }, { foo }, { foo }');
    assert.strictEqual(stringifyIndented(list2),
      `{
        foo
      },
      {
        foo
      },
      {
        foo
      }`);
  });

  it('list of text', function() {
    assert.strictEqual(stringifyIndented(list3),
      `# Interesting text

        - Point1
        - Point2

      Paragraph
      # Interesting text

        - Point1
        - Point2

      Paragraph`);
  });
})

describe('inline', function() {
  it('simple', function() {
    assert.strictEqual(stringify(inline1), 'a foo c');
    assert.strictEqual(stringifyExpanded(inline1), 'a foo c'); // Does not break
  });

  it('inline of blocks', function() {
    assert.strictEqual(stringify(inline2), 'a { foo } b { foo } c { foo }');
    assert.strictEqual(stringifyIndented(inline2),
      `a {
        foo
      } b {
        foo
      } c {
        foo
      }`);
  });
})

describe('array', function() {
  it('array', function() {
    const arr = [1, 2, 3];
    assert.strictEqual(stringify(arr), '[1, 2, 3]');
    assert.strictEqual(stringifyIndented(arr),
      `[
        1,
        2,
        3
      ]`);
  });
})

describe('object', function() {
  it('object', function() {
    const obj = { a: 1, '#b': 2, c: 3 };
    assert.strictEqual(stringify(obj), "{ a: 1, '#b': 2, c: 3 }");
    assert.strictEqual(stringifyIndented(obj),
      `{
        a: 1,
        '#b': 2,
        c: 3
      }`);
  });
});

describe('set', function() {
  it('set', function() {
    const set = new Set([1, 2, 3]);
    assert.strictEqual(stringify(set), 'Set [1, 2, 3]');
    assert.strictEqual(stringifyIndented(set),
      `Set [
        1,
        2,
        3
      ]`);
  });
});

describe('map', function() {
  it('map', function() {
    const obj = new Map(Object.entries({ a: 1, '#b': 2, c: 3 }));
    assert.strictEqual(stringify(obj), "Map { a: 1, '#b': 2, c: 3 }");
    assert.strictEqual(stringifyIndented(obj),
      `Map {
        a: 1,
        '#b': 2,
        c: 3
      }`);
  });
});

describe('circular', function() {
  it('circular', function() {
    const arr = ['b', ['c']];
    arr[1].push(arr);
    arr.unshift(arr);

    assert.strictEqual(stringify(arr), `[<circular>, 'b', ['c', <circular>]]`);
    assert.strictEqual(stringifyIndented(arr),
      `[
        <circular>,
        'b',
        [
          'c',
          <circular>
        ]
      ]`);
  });
});

describe('partial expand', function() {
  it('partial expand', function() {
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const arr2 = [arr1, arr1, [arr1, arr1]]
    // Wrapping at col 80 should mean that instances of arr1 fit onto a line,
    // but the thing as a whole must be split across multiple lines
    assert.strictEqual(stringify(arr2, { wrapWidth: 80, baseIndent: '      ' }),
      `[
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]
      ]`);
    // If we reduce the wrap width, more of it must be split onto multiple lines
    assert.strictEqual(stringify(arr2, { wrapWidth: 50, baseIndent: '      ' }),
      `[
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        ]
      ]`);
    // Similarly if we have a wide wrap width but a significant indent
    assert.strictEqual(stringify(arr2, { wrapWidth: 80, baseIndent: '                                        ' }),
                                        `[
                                          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                                          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                                          [
                                            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                                            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                                          ]
                                        ]`);
    // For completeness, if we have an infinite wrap width then we can fit everything on one line
    assert.strictEqual(stringify(arr2, { wrapWidth: Infinity }),
      `[[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]]`);
  });
});