export interface StringifyOpts {
  /** How far a line will go before it wraps */
  wrapWidth?: number;

  /** Amount to indent each level */
  indentIncrement?: number | string;

  /** Amount to indent the root level, except the first line which must be
   * indented externally if the need requires */
  baseIndent?: number | string;

  /** A function that describes how to stringify a value that doesn't already
   * implement the Stringifiable protocol. The default value is to use
   * `defaultFormatter`. */
  formatter?: (value: any) => Stringifiable;
}

export interface RenderParameters {
  wrapWidth: number;
  indentSize: string;
}

export const stringifySymbol = Symbol('stringify');

export interface Stringifiable {
  /**
   * Stringify the value
   *
   * Note that stringification is done in 2 passes. The first pass is the
   * "measure" pass which calculates how much space the result will take up, and
   * the second pass renders the measured result to a string.
   */
  [stringifySymbol](params: RenderParams): RenderResult;

  toString(opts?: StringifyOpts): string;
}

export interface RenderParams {
  /**
   * The column at which the user has requested to wrap the output
   */
  wrapWidth: number;

  /**
   * Function to call to get a stringifier for a nested value
   */
  render: (value: any, measureParams: RenderParams) => RenderResult;

  /** The indentation to put after any inserted line breaks (but generally not
   * at the start of the string) */
  indent: string;

  /** The amount to add to the indent to created nested indents. */
  indentIncrement: string;
}

export interface RenderResult {
  /**
   * Must be true if `render` will return a string with multiple lines.
   */
  isMultiline: boolean;

  content: string
}

export function stringify(value: any, opts?: StringifyOpts): string {
  const wrapWidth = opts?.wrapWidth ?? 120;

  const indentIncrement = typeof opts?.indentIncrement === 'string'
    ? opts?.indentIncrement
    : spaceWithLength(opts?.indentIncrement ?? 2);

  const indent = typeof opts?.baseIndent === 'string'
    ? opts?.baseIndent
    : spaceWithLength(opts?.baseIndent ?? 0);

  const formatter = opts?.formatter ?? defaultFormatter;

  // For detecting circular references
  const alreadyVisited = new Set<any>();

  const rendered = render(value, { render, wrapWidth, indent, indentIncrement });

  return rendered.content;

  function render(value: any, measureParams: RenderParams): RenderResult {
    if (isObject(value)) {
      if (alreadyVisited.has(value)) {
        return text`<circular>`[stringifySymbol](measureParams);
      }
      try {
        alreadyVisited.add(value);

        const stringifiable = isStringifiable(value)
          ? value
          : formatter(value)

        return stringifiable[stringifySymbol](measureParams);
      } finally {
        alreadyVisited.delete(value);
      }
    } else {
      const stringifiable = isStringifiable(value)
        ? value
        : formatter(value)

      return stringifiable[stringifySymbol](measureParams);
    }
  }
}

function isObject(value: any): boolean {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}

/**
 * Renders a list of key-value pairs to the form "{ a: b, c: d, ... }"
 */
function objectLike(keyValuePairs: Iterable<any[]>): Stringifiable {
  return block`{ ${
    list(', ', [...keyValuePairs].map(([k, v]) =>
      inline`${
        text`${stringifyKey(k)}`
      }: ${
        v
      }`),
      { sort: true }
    )
  } }`;
}

function isStringifiable(value: any): value is Stringifiable {
  return isObject(value) && typeof value[stringifySymbol] === 'function';
}

function spaceWithLength(n: number): string {
  return new Array(n + 1).join(' ');
}

const escapeSubstitutes = {
  '\0': '\\0',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\v': '\\v',
  '\\': '\\\\',
  '\'': '\\t'
}

export function stringifyStringLiteral(s: string): string {
  // Single-quoted escape
  return `'${s.replace(/\0|\x08|\f|\n|\r|\t|\v|\\|\'/g, s => escapeSubstitutes[s])}'`;
}

export function text(strings: TemplateStringsArray, ...interpolations: any[]): Stringifiable {
  const result: Stringifiable = {
    toString: opts => stringify(result, opts),
    [stringifySymbol]({ wrapWidth, indent }): RenderResult {
      const text = interpolate(strings, ...interpolations.map(x => '' + x));
      const lines = text.split(/\r?\n/g);

      if (lines.length === 1) {
        return {
          isMultiline: false,
          content: text,
        }
      } else {
        // This logic attempts to re-indent the text if there are multiple
        // lines. It does so by detecting the smallest indent across all
        // non-blank lines and then replacing that with the new indent. It
        // tries to preserve nested indentation in the text itself.
        const [firstLine, ...restLines] = lines;
        const indentOfLine = (line: string) => (line.match(/^ */) as any)[0].length;
        const nonBlankLines = restLines.filter(l => !(/^\s*$/g).test(l));
        const minIndentSize = Math.min.apply(Math, nonBlankLines.map(indentOfLine));
        const minIndent = ' '.repeat(isFinite(minIndentSize) ? minIndentSize : 0);
        const matchIndent = new RegExp('^' + minIndent, 'gm');
        // By convention in this library, any newline/indentation on the
        // first line of an element is handled by the parent, not the child
        const reIndentedLines = [firstLine, ...restLines.map(l => l.replace(matchIndent, indent))];
        return {
          isMultiline: true,
          content: reIndentedLines.join('\n'),
        }
      }
    }
  };

  return result;
}

function sum(ns: number[]) {
  return ns.reduce((a, n) => a + n, 0);
}


export function block(strings: TemplateStringsArray, ...interpolations: any[]): Stringifiable {
  if (strings.length !== interpolations.length + 1) {
    throw new Error('Expected a tagged template to be invoked with exactly one more string than interpolation')
  }
  const result: Stringifiable = {
    toString: opts => stringify(result, opts),
    [stringifySymbol]({ wrapWidth, render, indent, indentIncrement }): RenderResult {
      const childIndent = indent + indentIncrement;

      const renderedInterpolations = interpolations.map(x => render(x, {
        indentIncrement, render, wrapWidth,
        indent: childIndent
      }));

      const singleLineLength = sum(strings.map(s => s.length)) + sum(renderedInterpolations.map(s => s.content.length));

      const isMultiline =
        renderedInterpolations.some(x => x.isMultiline) ||
        (indent.length + singleLineLength > wrapWidth) ||
        strings.some(s => s.includes('\n'));


      let content: string;
      if (isMultiline) {
        content = interpolate(
          strings.map((s, i) => {
            // When we're breaking the content onto multiple lines,
            // whitespace at the start or end of each line is considered to be superfluous.
            s = s.trim();
            // The opening string does not have any indentation or a
            // preceding line break
            if (i === 0) return s;
            // For convenience, blank lines are omitted, since
            // ``block`(${a} ${b})` `` probably doesn't intend there to be
            // a blank line between `a` and `b`
            if (s === '') return s;
            // Otherwise, each string is on a fresh line, indented by the
            // indent amount (not the child indent amount)
            return `\n${indent}${s}`;
          }),
          // Each child also occurs on its own line, but indented by the
          // child indent amount
          ...renderedInterpolations.map(x => `\n${childIndent}${x.content.trim()}`)
        );
      } else {
        content = interpolate(strings, ...renderedInterpolations.map(x => x.content));
      }

      return {
        isMultiline,
        content,
      }
    }
  };

  return result;
}

export function inline(strings: TemplateStringsArray, ...interpolations: any[]): Stringifiable {
  if (strings.length !== interpolations.length + 1) {
    throw new Error('Expected a tagged template to be invoked with exactly one more string than interpolation')
  }
  const result: Stringifiable = {
    toString: opts => stringify(result, opts),
    [stringifySymbol](params): RenderResult {
      const { wrapWidth, render, indent, indentIncrement } = params;

      const renderedInterpolations = interpolations.map(x => render(x, params));

      const singleLineLength =
        sum(strings.map(s => s.length)) +
        sum(renderedInterpolations.map(s => s.content.length));

      const isMultiline =
        renderedInterpolations.some(x => x.isMultiline) ||
        (indent.length + singleLineLength > wrapWidth) ||
        strings.some(s => s.includes('\n'));

      // `inline` adds no line break points of its own, so the multi-line
      // and single-line are the same
      const content = interpolate(strings, ...renderedInterpolations.map(x => x.content));

      return {
        isMultiline,
        content
      }
    }
  };

  return result;
}

export function list(joiner: string, items: Iterable<any>, opts?: { sort?: boolean }): Stringifiable {
  const result: Stringifiable = {
    toString: opts => stringify(result, opts),
    [stringifySymbol](params): RenderResult {
      const { wrapWidth, render, indent } = params;

      const renderedItems = [...items].map(x => render(x, params));
      if (opts?.sort) {
        renderedItems.sort((a, b) => a.content > b.content ? 1 : a.content === b.content ? 0 : -1);
      }

      const singleLineLength =
        sum(renderedItems.map(x => x.content.length)) +
        joiner.length * Math.max(renderedItems.length - 1, 0);

      const isMultiline =
      renderedItems.some(x => x.isMultiline) ||
        (indent.length + singleLineLength > wrapWidth) ||
        joiner.includes('\n');

      let content: string;
      if (isMultiline) {
        content = renderedItems
          .map(x => x.content)
          .join(`${joiner.trimEnd()}\n${indent}`)
      } else {
        content = renderedItems.map(x => x.content).join(joiner)
      }

      return {
        isMultiline,
        content
      }
    }
  };

  return result;
}

function isNameString(name: string): boolean {
  return /^[a-zA-Z_]+[a-zA-Z0-9_]*$/.test(name);
}

function stringifyKey(value: any): string {
  switch (typeof value) {
    case 'undefined': return '[undefined]';
    case 'function': return '[<function>]';
    case 'boolean': return `[${value ? 'true' : 'false'}]`;
    case 'symbol': return `[${value.toString()}]`;
    case 'number': return `[${value}]`;
    case 'bigint': return `[${value}]`;
    case 'string':
      return isNameString(value)
      ? value
      : stringifyStringLiteral(value);
    case 'object': {
      if (value === null) return 'null';
      return '[<object>]';
    }
    default:
      return '[<unknown>]'
  }
}

export function defaultFormatter(value: any): Stringifiable {
  switch (typeof value) {
    case 'undefined': return text`undefined`;
    case 'boolean': return text`${value ? 'true' : 'false'}`;
    case 'symbol': return text`${value}`;
    case 'number': return text`${value}`;
    case 'bigint': return text`${value}`;
    case 'string': return text`${stringifyStringLiteral(value)}`;
    case 'function':
    case 'object': {
      if (value === null) return text`null`;

      if (Array.isArray(value)) {
        return block`[${list(', ', value)}]`;
      }

      if (value instanceof Set) {
        return block`Set [${list(', ', value, { sort: true })}]`;
      }

      if (value instanceof Map) {
        return inline`Map ${objectLike(value.entries())}`
      }

      return objectLike(Object.entries(value))
    }
    default: return text`<unknown>`; // Shouldn't get here, unless I've missed one of the types
  }
}

function interpolate(strings: Iterable<string>, ...interpolations: string[]): string {
  const stringIter = strings[Symbol.iterator]();
  const interpolationIter = interpolations[Symbol.iterator]();
  let stringNext = stringIter.next();
  if (stringNext.done) {
    // Even a blank interpolation like `` has one string in it
    throw new Error('Expected at least one interpolated string')
  }
  let s = '' + stringNext.value;
  stringNext = stringIter.next();
  let interpolationNext = interpolationIter.next();
  while (!stringNext.done && !interpolationNext.done) {
    s += '' + interpolationNext.value;
    s += '' + stringNext.value;
    stringNext = stringIter.next();
    interpolationNext = interpolationIter.next();
  }
  // Expect both iterators to complete at the same time
  if (!stringNext.done || !interpolationNext.done) {
    throw new Error('A tagged template expects exactly one more string than interpolation value')
  }

  return s;
}