# stringify-structured

A customizable stringification algorithm for POD data.

  - Similar in spirit to `JSON.stringify` but has out-of-the-box support for:
    - Maps
    - Sets
    - `undefined`
  - Automatically detects circular references
  - Produces stable ordering for maps, sets, and objects
  - Visually lighter-weight output than JSON (less syntactic noise by default).
    - Tries not to quote keys in objects. I.e. `{ a: 1 }` instead of `{ "a": 1 }`
    - Uses single quotes instead of double quotes for strings
    - Avoids needless line breaks. Small substructures like `[1, 2, 3]` will be put on a single line by default.
  - **Easy to customize** the output syntax of individual values in the tree in-place (without needing a "replacer function" although this is also supported)
  - Opinionated wrapping and indentation rules (tries to fill up a given output width instead of putting everything on a new line)

The customizability is a key reason why I created this library. You have a lot of control over the output syntax (allowing for readable output syntax for custom types and substructures), but the sensible defaults mean that getting started with the library is as simple as calling `stringify` directly on a POD value and then syntax customization can be done incrementally.

Limitations:

  - This library is not intended to express output syntax where whitespace is significant, since all line breaks are considered optional and whitespace around line breaks can be automatically trimmed. It's better suited to JSON-like output syntaxes where line breaks can be used purely for readability but do not affect semantics.

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
  - `replacer` - similar to the replacer for `JSON.stringify`, this is executed on every element, allowing it to customize it's own output

# Customize output syntax

A major point of this library is the ability to customize the output syntax incrementally to make it more readable in the context of knowledge about specific types in the data structure. The output can be described using the following structural primitives:

  - `text` - puts custom text into the output verbatim
  - `block` - for a parent-child relationship in the data
  - `list` - for a sibling relationship in the data
  - `inline` - for joining custom prefixes and suffixes on other structures

To give an idea of the power of these structural primitives, note that the default JSON-like syntax is implemented in terms of these as well. See [here](https://github.com/coder-mike/stringify-structured/blob/1ea390f68598f599cbf26ee96764d4aa766c5ebf/src/index.ts#L355). For example, the syntax of an array is defined as a `[]` `block` containing a comma-separated `list` of children.

The following examples assume that all of these primitives have been imported at the top level. The examples use `wrapWidth: 0` to help illustrate the output when line breaks and indentation are used at every possible point.

```js
import { stringify, block, text, inline, list } from 'stringify-structured';
```

## Block

`block` is a [tagged template](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates). The interpolations are treated as children of the block

```js
stringify(block`[${42}]`, { wrapWidth: 0 })
```

```
[
  42
]
```

```js
stringify(block`<a>${42}</a>`, { wrapWidth: 0 })
```

```
<a>
  42
</a>
```

```js
stringify(block`A: ${42} B: ${43} C: ${44}`, { wrapWidth: 0 })
```

```
A:
  42
B:
  43
C:
  44
```

A `block` introduces implicit line-wrap points between each item which will turn into line breaks if the block exceeds the defined `wrapWidth`.

## List

`list(joiner, [items], options?)`

A `list` describes a set of sibling values

```js
stringify(list(', ', [42, 43, 44]), { wrapWidth: 0 });
```

```
42,
43,
44
```

A list is useful inside a block to have multiple children of the block:

```js
stringify(
  block`[${
    list(', ', [
      42,
      43,
      44
    ])
  }]`,
  { wrapWidth: 0 }
)
```

```
[
  42,
  43,
  44
]
```

`list` introduces implicit line-wrap points after each item (after the joiner).

Using the list with `{ sort: true }` options will cause the list to be sorted lexicographically in the output, which is a simple way to produce deterministic/stable output when the list items do not have an inherent order (e.g. a list of items in a `Set`).

## Inline

The `inline` tagged template is similar to `block` except that the values inside it are not treated as children and no line-wrap points are introduced.

```js
stringify(inline`a ${42} b ${43} c`, { wrapWidth: 0 })
```

```
a 42 b 43 c
```

```js
stringify(
  inline`try ${
    block`{ ${
      42
    } }`
  } catch ${
    block`{ ${
      43
    } }`
  }`,
  { wrapWidth: 0 }
);
```

```
try {
  42
} catch {
  43
}
```

## Customization: `text`

The `text` tagged template is similar to `inline` except that its interpolations are treated as pre-formatted output text (verbatim except for the re-indentation shown below).

If the text has multiple lines, the lines will be re-indented inside the parent hierarchy.

```js
stringify(text`foo`);
```

```
foo
```

```js
stringify(text`First line\nSecond line\nThird line`);
```

```
First line
Second line
Third line
```

```js
stringify(
  block`<p>${
    text`First line\nSecond line\nThird line`
  }</p>`,
  { wrapWidth: 0 }
);
```

```
<p>
  First line
  Second line
  Third line
</p>
```

## Mixing custom syntax and default syntax

Custom syntax can be mixed in with default formatting.

```js
stringify({
  a: 'Normal string',
  b: text`--Custom syntax--`,
}, { wrapWidth: 0 });
```

```
{
  a: 'Normal string',
  b: --Custom syntax--
}
```

The recommended pattern for stringifying some values with custom syntax is to have a first pass that produces a new data structure with syntax awareness, as in the following example where a lat/long value embedded in a `person` has custom formatting while the `person` just defaults to the normal object formatting:

```js
const person = {
  name: 'Michael Hunter',
  location: { lat: 24, long: 42 }
};

const renderPerson = person => ({
  ...person,
  // Override the rendering for just the location, while leaving the other fields to be default-formatted
  location: renderLocation(person.location)
})

const renderLocation = ({ lat, long }) =>
  text`${Math.abs(lat)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(long)}°${long < 0 ? 'W' : 'E'}`

stringify(renderPerson(person));
```

```
{ name: 'Michael Hunter', location: 24°N 42°E }
```

We can then incrementally improve the syntax, for example by providing custom syntax for the person:

```js
const renderPerson = person =>
  inline`Person ${person.name} @ ${renderLocation(person.location)}`

stringify(renderPerson(person));
```

```
Person 'Michael Hunter' @ 24°N 42°E
```

## Replacer

Another way of providing custom rendering behavior is using a replacer function.

```js
function replacer(value) {
  if (value instanceof Date) {
    return inline`date ${value.toISOString()}`
  }
  return value;
}

stringify([42, 43, new Date()], { replacer })
```

```
[42, 43, date '2021-08-01T05:21:18.394Z']
```

# Layout rules

The algorithm uses opinionated wrapping and layout behavior.

To describe the wrapping behavior, it's easiest to define the new terms "breaking points" and "levels".

  - A breaking point is a point in the output text where a line break _may_ occur

  - Some breaking points may introduce _level_ changes, meaning that if a line break _does_ occur at that point, the new line will be at a different indentation level to the previous line. A `block` is the only construct that introduces level changes: the beginning of each interpolation increases the level, and the end of each interpolation decreases the level again.

The rules can then be described as follows:

  - Within a single construct (`block`, `list`, `inline`, or `text`), either _all_ the breaking points manifest as real line breaks or _none_ of them do. For example, either all items in an array are on separate lines, or none of them are.

  - If a node has any children that contain line breaks, all the line breaks in the (parent) node will also be manifested. E.g. in an array where any child needs to be on multiple lines, the array itself will put line breaks between all items. It doesn't make sense to have a single-line array with some elements consuming multiple lines.

  - Whitespace will be trimmed on either side of a line break, since the line break is considered to replace the whitespace.

