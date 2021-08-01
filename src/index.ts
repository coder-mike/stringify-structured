export interface StringifyOpts {
  /** How far a line will go before it wraps */
  wrapWidth?: number;

  /** Amount to indent each level */
  indentSize?: number | string;

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
  [stringifySymbol](params: MeasureParams): MeasureResult;

  toString(opts?: StringifyOpts): string;
}

export interface MeasureParams {
  /**
   * The text column at which the value will be rendered, if the parent chooses
   * to render the value inline. The caller can always change its mind and
   * render the value at an earlier column (by starting this value on its own
   * line), but not a later column, so `startCol` can be used to trigger
   * wrapping behavior of the measured value.
   */
  startCol: number;

  /**
   * The column at which the user has requested to wrap the output
   */
  wrapWidth: number;

  /**
   * Function to call to get a stringifier for a nested value
   */
  measure: (value: any, measureParams: MeasureParams) => MeasureResult;
}

export interface MeasureResult {
  /**
   * If the content could be rendered as a single line, this is how long the
   * line would be (if `isMultiline` is true then this field is meaningless).
   */
  singleLineLength?: number;

  /**
   * Must be true if `render` will return a string with multiple lines.
   */
  isMultiline: boolean;

  /**
   * Render the value into a string.
   *
   * If `isMultiline` is false, the result of this function must not contain
   * line breaks.
   *
   * @param indent The indentation to put after any inserted line breaks (but
   * generally not at the start of the string)
   *
   * @param indentIncrement The amount to add to the indent to created nested
   * indents.
   */
  render(indent: string, indentIncrement: string): string
}

export function stringify(value: any, opts?: StringifyOpts) {
  const wrapWidth = opts?.wrapWidth ?? 120;

  const indentSize = typeof opts?.indentSize === 'string'
    ? opts?.indentSize
    : spaceWithLength(opts?.indentSize ?? 2);

  const baseIndent = typeof opts?.baseIndent === 'string'
    ? opts?.baseIndent
    : spaceWithLength(opts?.baseIndent ?? 0);

  const formatter = opts?.formatter ?? defaultFormatter;

  // For detecting circular references
  const alreadyVisited = new Set<any>();

  const startCol = 0;

  const measured = measure(value, { startCol, measure, wrapWidth });
  const rendered = measured.render(baseIndent, indentSize);

  return rendered;

  function measure(value: any, measureParams: MeasureParams): MeasureResult {
    if (isObject(value)) {
      if (alreadyVisited.has(value)) {
        const s = '<circular>';
        return { isMultiline: false, singleLineLength: s.length, render: () => s };
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
      }`)
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
    [stringifySymbol]({ startCol, wrapWidth }) {
      const text = interpolate(strings, ...interpolations.map(x => '' + x));
      const lines = text.split(/\r?\n/g);
      if (lines.length === 1) {
        return {
          isMultiline: false,
          singleLineLength: text.length,
          render: () => text
        }
      } else {
        return {
          isMultiline: true,
          render(indent) {
            // This logic attempts to re-indent the text if there are multiple
            // lines. It does so by detecting the smallest indent across all
            // non-blank lines and then replacing that with the new indent. It
            // tries to preserve nested indentation in the text itself.
            const [firstLine, ...restLines] = lines;
            const indentOfLine = (line: string) => (line.match(/^ */) as any)[0].length;
            const nonBlankLines = restLines.filter(l => !(/^\s*$/g).test(l));
            const minIndent = ' '.repeat(Math.min.apply(Math, nonBlankLines.map(indentOfLine)));
            const matchIndent = new RegExp('^' + minIndent, 'gm');
            // By convention in this library, any newline/indentation on the
            // first line of an element is handled by the parent, not the child
            const reIndentedLines = [firstLine, ...restLines.map(l => l.replace(matchIndent, indent))];
            return reIndentedLines.join('\n');
          }
        }
      }
    }
  };

  return result;
}

export function block(strings: TemplateStringsArray, ...interpolations: any[]): Stringifiable {
  const result: Stringifiable = {
    toString: opts => stringify(result, opts),
    [stringifySymbol]({ startCol, wrapWidth, measure }) {
      const measuredInterpolations: MeasureResult[] = [];
      if (strings.length !== interpolations.length + 1) {
        throw new Error('Expected a tagged template to be invoked with exactly one more string than interpolation')
      }
      let col = startCol + strings[0].length;
      for (let i = 0; i < interpolations.length; i++) {
        const string = strings[i + 1];
        const interpolation = interpolations[i];
        const interpolationMeasurement = measure(interpolation, { startCol: col, wrapWidth, measure });
        col += interpolationMeasurement.singleLineLength + string.length;
        measuredInterpolations.push(interpolationMeasurement);
      }
      const singleLineLength = col - startCol;

      const isMultiline =
        measuredInterpolations.some(x => x.isMultiline) ||
        (startCol + singleLineLength > wrapWidth) ||
        strings.some(s => s.includes('\n'));

      return {
        isMultiline,
        singleLineLength,
        render(indent, indentIncrement) {
          const childIndent = indent + indentIncrement;
          const renderedInterpolations = measuredInterpolations.map(x =>
            x.render(childIndent, indentIncrement)
          );
          if (isMultiline) {
            return interpolate(
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
              ...renderedInterpolations.map(x => `\n${childIndent}${x.trim()}`));
          } else {
            return interpolate(strings, ...renderedInterpolations);
          }
        }
      }
    }
  };

  return result;
}

export function inline(strings: TemplateStringsArray, ...interpolations: any[]): Stringifiable {
  const result: Stringifiable = {
    toString: opts => stringify(result, opts),
    [stringifySymbol]({ startCol, wrapWidth, measure }) {
      const measuredInterpolations: MeasureResult[] = [];
      if (strings.length !== interpolations.length + 1) {
        throw new Error('Expected a tagged template to be invoked with exactly one more string than interpolation')
      }
      let col = startCol + strings[0].length;
      for (let i = 0; i < interpolations.length; i++) {
        const string = strings[i + 1];
        const interpolation = interpolations[i];
        const interpolationMeasurement = measure(interpolation, { startCol: col, wrapWidth, measure });
        col += interpolationMeasurement.singleLineLength + string.length;
        measuredInterpolations.push(interpolationMeasurement);
      }
      const singleLineLength = col - startCol;

      const isMultiline =
        measuredInterpolations.some(x => x.isMultiline) ||
        (startCol + singleLineLength > wrapWidth) ||
        strings.some(s => s.includes('\n'));

      return {
        isMultiline,
        singleLineLength,
        render(indent, indentIncrement) {
          // `inline` adds no line break points of its own, so the multi-line
          // and single-line are the same
          return interpolate(strings, ...measuredInterpolations.map(x => x.render(indent, indentIncrement)));
        }
      }
    }
  };

  return result;
}

export function list(joiner: string, items: Iterable<any>): Stringifiable {
  const result: Stringifiable = {
    toString: opts => stringify(result, opts),
    [stringifySymbol]({ startCol, wrapWidth, measure }) {
      const measured: MeasureResult[] = [];
      let col = startCol;
      let i = 0;
      for (const item of items) {
        if (i !== 0) col += joiner.length;
        const measuredItem = measure(item, { startCol: col, wrapWidth, measure });
        measured.push(measuredItem);
        col += measuredItem.singleLineLength;
        i++;
      }

      const singleLineLength = col - startCol;

      const isMultiline =
        measured.some(x => x.isMultiline) ||
        (startCol + singleLineLength > wrapWidth) ||
        joiner.includes('\n');

      return {
        isMultiline,
        singleLineLength,
        render(indent, indentIncrement) {
          if (isMultiline) {
            return measured
              .map(x => x.render(indent, indentIncrement))
              .join(`${joiner.trimEnd()}\n${indent}`)
          } else {
            return measured.map(x => x.render(indent, indentIncrement)).join(joiner)
          }
        }
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
        return block`Set [${list(', ', value)}]`;
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