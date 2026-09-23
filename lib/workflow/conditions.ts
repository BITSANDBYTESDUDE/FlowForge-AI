/**
 * Safe condition evaluator for DECISION nodes.
 *
 * Workflow conditions are authored by users (and, indirectly, by the model), so
 * they are untrusted input. `eval`/`new Function` are never used: this is a
 * small recursive-descent parser over a deliberately tiny grammar. There are no
 * function calls, property access, or assignment — an attacker cannot reach
 * anything outside the supplied fact set.
 *
 * Grammar:
 *   expr    := or
 *   or      := and ( '||' and )*
 *   and     := comparison ( '&&' comparison )*
 *   comparison := unary ( ('=='|'!='|'>='|'<='|'>'|'<') unary )?
 *   unary   := '!' unary | primary
 *   primary := '(' expr ')' | number | string | 'true' | 'false' | identifier
 */

export type ConditionFacts = Record<string, string | number | boolean>;

export type ConditionResult =
  | { ok: true; value: boolean }
  | { ok: false; error: string };

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'identifier'; value: string }
  | { kind: 'operator'; value: string }
  | { kind: 'paren'; value: '(' | ')' }
  | { kind: 'eof' };

class ConditionSyntaxError extends Error {}

const OPERATORS = ['==', '!=', '>=', '<=', '&&', '||', '>', '<', '!'];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index]!;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', value: char });
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      index += 1;
      while (index < input.length && input[index] !== quote) {
        value += input[index];
        index += 1;
      }
      if (index >= input.length) throw new ConditionSyntaxError('Unterminated string literal');
      index += 1;
      tokens.push({ kind: 'string', value });
      continue;
    }

    if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(input[index + 1] ?? ''))) {
      let raw = '';
      if (char === '-') {
        raw += '-';
        index += 1;
      }
      while (index < input.length && /[0-9.]/.test(input[index]!)) {
        raw += input[index];
        index += 1;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new ConditionSyntaxError(`Invalid number "${raw}"`);
      tokens.push({ kind: 'number', value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let raw = '';
      while (index < input.length && /[A-Za-z0-9_.]/.test(input[index]!)) {
        raw += input[index];
        index += 1;
      }
      if (raw === 'true' || raw === 'false') {
        tokens.push({ kind: 'boolean', value: raw === 'true' });
      } else {
        tokens.push({ kind: 'identifier', value: raw });
      }
      continue;
    }

    const operator = OPERATORS.find((op) => input.startsWith(op, index));
    if (operator) {
      tokens.push({ kind: 'operator', value: operator });
      index += operator.length;
      continue;
    }

    throw new ConditionSyntaxError(`Unexpected character "${char}"`);
  }

  tokens.push({ kind: 'eof' });
  return tokens;
}

type Primitive = string | number | boolean;

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly facts: ConditionFacts,
  ) {}

  private peek(): Token {
    return this.tokens[this.position]!;
  }

  private next(): Token {
    const token = this.tokens[this.position]!;
    this.position += 1;
    return token;
  }

  private matchOperator(...values: string[]): string | null {
    const token = this.peek();
    if (token.kind === 'operator' && values.includes(token.value)) {
      this.next();
      return token.value;
    }
    return null;
  }

  parse(): Primitive {
    const value = this.parseOr();
    if (this.peek().kind !== 'eof') throw new ConditionSyntaxError('Unexpected trailing input');
    return value;
  }

  private parseOr(): Primitive {
    let left = this.parseAnd();
    while (this.matchOperator('||')) {
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): Primitive {
    let left = this.parseComparison();
    while (this.matchOperator('&&')) {
      const right = this.parseComparison();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseComparison(): Primitive {
    const left = this.parseUnary();
    const operator = this.matchOperator('==', '!=', '>=', '<=', '>', '<');
    if (!operator) return left;

    const right = this.parseUnary();
    return compare(left, right, operator);
  }

  private parseUnary(): Primitive {
    if (this.matchOperator('!')) {
      return !Boolean(this.parseUnary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Primitive {
    const token = this.next();

    switch (token.kind) {
      case 'number':
      case 'string':
      case 'boolean':
        return token.value;
      case 'identifier': {
        if (!(token.value in this.facts)) {
          throw new ConditionSyntaxError(`Unknown field "${token.value}"`);
        }
        return this.facts[token.value]!;
      }
      case 'paren': {
        if (token.value === '(') {
          const value = this.parseOr();
          const closing = this.next();
          if (closing.kind !== 'paren' || closing.value !== ')') {
            throw new ConditionSyntaxError('Missing closing parenthesis');
          }
          return value;
        }
        throw new ConditionSyntaxError('Unexpected ")"');
      }
      default:
        throw new ConditionSyntaxError('Unexpected end of expression');
    }
  }
}

function compare(left: Primitive, right: Primitive, operator: string): boolean {
  // Numeric comparison when both sides are numbers; otherwise compare as strings
  // so `label == "Client A"` behaves as expected.
  if (typeof left === 'number' && typeof right === 'number') {
    switch (operator) {
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
    }
  }

  const a = String(left);
  const b = String(right);
  switch (operator) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    // Ordering on non-numeric values is a modelling mistake, not a crash.
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    default:
      return false;
  }
}

/**
 * Evaluates a condition against a fixed fact set.
 *
 * Returns a result object instead of throwing so the execution engine can log a
 * malformed condition and fall back to the default branch rather than failing a
 * user's run.
 */
export function evaluateCondition(expression: string, facts: ConditionFacts): ConditionResult {
  const trimmed = expression.trim();
  if (trimmed.length === 0) return { ok: false, error: 'Condition is empty' };
  if (trimmed.length > 500) return { ok: false, error: 'Condition is too long' };

  try {
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens, facts);
    const value = parser.parse();
    return { ok: true, value: Boolean(value) };
  } catch (error) {
    const message =
      error instanceof ConditionSyntaxError
        ? error.message
        : 'Condition could not be evaluated';
    return { ok: false, error: message };
  }
}
