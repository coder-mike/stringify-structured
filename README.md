# stringify-structured

A customizable stringification algorithm for tree-structured data (e.g. object graphs) for diagnostic purposes.

  - Similar in spirit to `JSON.stringify` but has out-of-the-box support for:
    - Maps
    - Sets
    - `undefined`
  - Automatically detects circular references
  - Lighter-weight output than JSON (less syntactic noise by default).
    - Tries not to quote keys in objects. I.e. `{ a: 1 }` instead of `{ "a": 1 }`
    - Uses single quotes instead of double quotes for strings
    - Avoids needless line breaks. Small substructures like `[1, 2, 3]` will be put on a single line by default.
  - **Easy to customize** the output syntax of individual values in the tree in-place (without needing a "replacer function")
  - Opinionated wrapping and indentation rules (tries to fill up a given output width instead of putting everything on a new line)

The customization is a key reason why I created this library. You can easily `stringify` a POD structure to get a dump of its contents (e.g. for debug output or unit test artifacts), and then you can _incrementally_ customize how certain values are displayed to improve the output structure over time.

## Basic Usage

```sh
npm install stringify-structured
```

```js
import { stringify } from 'stringify-structured';

const value = { a: 1, b: '2', c: ['x', undefined, true], d: new Set(42, 43) };
stringify(value, { wrapWidth: 50 });
```

Outputs:

```
{
  a: 1,
  b: '2',
  c: ['x', undefined, true],
  d: set [42, 43]
}
```

## Options

  - `wrapWidth` (default: `120`) - how far a line will go before it wraps. A value of `0` means it will wrap as soon as possible on each line.
  - `indentIncrement` (default: `2`) - amount to indent each level
  - `baseIndent` (default: `0`) - Amount to indent the root level, except the first line which must be indented
    externally if the need requires

## Customization: `block`

```js
import { stringify, block } from 'stringify-structured';

stringify(block`value ${42}`); // "value 42"
```

The above example is different to just using normal string interpolation because the wrapping and indentation algorithm is aware that `42` is a child of the formatted value, and so will indent it if there is an overflow.

Uses of `block` can be nested to create hierarchical structures:

```js
const value = block`parent(${
  block`child(${
    42
  })`
})`
stringify(value); // parent(child(42))

stringify(value, { wrapWidth: 0 }); /* Outputs:
parent(
  child(
    42
  )
)
*/
```

`block` introduces implicit wrap points after each literal string and each interpolated value. (See section on wrapping rules later in this doc).

## Customization: `list(joiner, [items])`

A `list` allows you to define multiple children for a block.

```js
const value = block`parent(${
  list(', ', [
    block`childA(${
      42
    })`,
    block`childB(${
      list(', ',
        43,
        44,
      )
    })`
  ])
})`
```

We can `stringify` this with different `wrapWidth`s to see how this `value` is structure-aware:

```js
stringify(value) /* Output:
parent(childA(42), childB(43, 44))
```

```js
stringify(value, { wrapWidth: 20 }) /* Output:
parent(
  childA(42),
  childB(43, 44)
)
```

```js
stringify(value, { wrapWidth: 0 }) /* Output:
parent(
  childA(
    42
  ),
  childB(
    43,
    44
  )
)
```

`list` introduces implicit wrap points after each item (after the joiner).

## Customization: `inline`

The `inline` tagged template is similar to `block` except that its interpolations aren't treated as children and it does not introduce any implicit wrap points.

As a general rule of when to use `inline` vs `block`: use `block` to represent something that has an open and close parenthesis (or equivalent) and so would need the insides to be indented. Use `inline` everywhere else.

```js
const value = inline`try ${
  block`{ ${
    'foo'
  } }`
} catch ${
  block`{ ${
    'bar'
  } }`
}`;

stringify(value); // "try { 'foo' } catch { 'bar' }"
stringify(value, { wrapWidth: 0 }) /* Output:
try {
  'foo'
} catch {
  'bar'
}
```

## Customization: `text`

The `text` tagged template is similar to `inline` except that its interpolations are treated as pre-formatted output text.

If the text has multiple lines, the lines will be re-indented inside the parent hierarchy.

```js
stringify(text`foo`); // foo

stringify(
  block`(${
    text`foo\nbar`
  })`);
/*
(
  foo
  bar
)
*/
```

## Cookbook: Multiple root-level nodes

```js
const value = list('\n', ['a', 'b', 'c']);
stringify(value); /* Output:
'a'
'b'
'c'
```

## Cookbook: Custom array-like type

```js
import { stringify, block, list } from 'stringify-structured';

const stringifyMyArr = arr => block`my array [${list(', ', arr)}]`;
stringify(stringifyMyArr(1, 2, 3), { wrapWidth: 0 } );
/*
my array [
  1,
  2,
  3
],
*/
```

## Cookbook: Custom object-like type

```js
const myObjType = obj => block`myObj { ${
  list(', ', Object.entries(obj).map(([key, value]) =>
    inline`${key}:${value}`)
  )
} }`
const customObject = myObjType({ a: 1, b: 2, c: 3 });
const normalObject = { x: 1, y: customObject, z: 5 };
stringify(normalObject, { wrapWidth: 30 });
/*
{
  x: 1,
  y: myObj { a: 1, b: 2, c: 3 },
  z: 5
}
*/
```

## Cookbook: A try-catch-like output

```js
const tryCatch = (tryBody, catchBody) => inline`try ${
  block`{ ${
    tryBody
  } }`
} catch ${
  block`{ ${
    catchBody
  } }`
}`;

const myTryCatch = tryCatch('foo', 'bar');

stringify(myTryCatch); // try { 'foo' } catch { 'bar' }

stringify(myTryCatch, { structure: 0 });
/*
try {
  'foo'
} catch {
  'bar'
}
*/
```

## Layout rules

The algorithm uses opinionated wrapping and layout behavior.

To describe the wrapping behavior, it's easiest to define the new terms "breaking points" and "levels".

  - A breaking point is a point in the output text where a line break _may_ occur

  - Some breaking points may introduce _level_ changes, meaning that if a line break _does_ occur at that point, the new line will be at a different indentation level to the previous line. A `block` is the only construct that introduces level changes: the beginning of each interpolation increases the level, and the end of each interpolation decreases the level again.

The rules can then be described as follows:

  - Within a single construct (`block`, `list`, `inline`, or `text`), either _all_ the breaking points manifest as real line breaks or _none_ of them do. For example, either all items in an array are on separate lines, or none of them are.

  - If a node has any children that contain line breaks, all the line breaks in the (parent) node will also be manifested. E.g. in an array where any child needs to be on multiple lines, the array itself will put line breaks between all items. It doesn't make sense to have a single-line array with some elements consuming multiple lines.

  - Whitespace will be trimmed on either side of a line break, since the line break is considered to replace the whitespace.

