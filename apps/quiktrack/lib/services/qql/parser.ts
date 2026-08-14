/**
 * QQL (QuikTrack Query Language) parser — QUIKTR-117.
 * Recursive-descent over the tokenizer's stream. Grammar (AND binds tighter
 * than OR, standard precedence):
 *
 *   query      := orExpr (ORDER BY field (ASC|DESC)?)?
 *   orExpr     := andExpr (OR andExpr)*
 *   andExpr    := primary (AND primary)*
 *   primary    := "(" orExpr ")" | field OP value | field (NOT)? IN "(" valueList ")"
 */
import { tokenize, QqlParseError, type Token, type TokenType } from "./tokenizer";

export type QqlOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "~";

export interface ComparisonNode {
  kind: "comparison";
  field: string;
  op: QqlOp;
  value: string;
  pos: number;
}

export interface InNode {
  kind: "in";
  field: string;
  negate: boolean;
  values: string[];
  pos: number;
}

export interface AndNode {
  kind: "and";
  left: QqlNode;
  right: QqlNode;
}

export interface OrNode {
  kind: "or";
  left: QqlNode;
  right: QqlNode;
}

export type QqlNode = ComparisonNode | InNode | AndNode | OrNode;

export interface QqlOrderBy {
  field: string;
  dir: "ASC" | "DESC";
}

export interface QqlQuery {
  where: QqlNode | null;
  orderBy: QqlOrderBy | null;
}

class Parser {
  private i = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i]!;
  }

  private advance(): Token {
    return this.tokens[this.i++]!;
  }

  private expect(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new QqlParseError(`Expected ${type} but found "${t.value || t.type}"`, t.pos);
    }
    return this.advance();
  }

  parse(): QqlQuery {
    let where: QqlNode | null = null;
    if (this.peek().type !== "ORDER" && this.peek().type !== "EOF") {
      where = this.parseOr();
    }

    let orderBy: QqlOrderBy | null = null;
    if (this.peek().type === "ORDER") {
      this.advance();
      this.expect("BY");
      const field = this.expect("IDENT").value.toLowerCase();
      let dir: "ASC" | "DESC" = "ASC";
      if (this.peek().type === "ASC" || this.peek().type === "DESC") {
        dir = this.advance().type as "ASC" | "DESC";
      }
      orderBy = { field, dir };
    }

    if (this.peek().type !== "EOF") {
      const t = this.peek();
      throw new QqlParseError(`Unexpected "${t.value || t.type}"`, t.pos);
    }
    return { where, orderBy };
  }

  private parseOr(): QqlNode {
    let left = this.parseAnd();
    while (this.peek().type === "OR") {
      this.advance();
      left = { kind: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): QqlNode {
    let left = this.parsePrimary();
    while (this.peek().type === "AND") {
      this.advance();
      left = { kind: "and", left, right: this.parsePrimary() };
    }
    return left;
  }

  private parsePrimary(): QqlNode {
    if (this.peek().type === "LPAREN") {
      this.advance();
      const node = this.parseOr();
      this.expect("RPAREN");
      return node;
    }

    const fieldToken = this.expect("IDENT");
    const field = fieldToken.value.toLowerCase();

    let negate = false;
    if (this.peek().type === "NOT") {
      this.advance();
      negate = true;
    }

    if (this.peek().type === "IN") {
      this.advance();
      this.expect("LPAREN");
      const values = [this.parseValue()];
      while (this.peek().type === "COMMA") {
        this.advance();
        values.push(this.parseValue());
      }
      this.expect("RPAREN");
      return { kind: "in", field, negate, values, pos: fieldToken.pos };
    }
    if (negate) {
      throw new QqlParseError('Expected "IN" after "NOT"', this.peek().pos);
    }

    const opToken = this.expect("OP");
    const value = this.parseValue();
    return { kind: "comparison", field, op: opToken.value as QqlOp, value, pos: fieldToken.pos };
  }

  private parseValue(): string {
    const t = this.peek();
    if (t.type === "STRING" || t.type === "IDENT") {
      this.advance();
      return t.value;
    }
    throw new QqlParseError(`Expected a value but found "${t.value || t.type}"`, t.pos);
  }
}

export function parseQql(input: string): QqlQuery {
  return new Parser(tokenize(input)).parse();
}

export { QqlParseError };
