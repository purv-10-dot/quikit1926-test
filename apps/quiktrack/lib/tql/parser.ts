/**
 * TQL parser — recursive-descent over the tokenizer's stream.
 *
 * Grammar (AND binds tighter than OR, standard precedence; NOT binds to a
 * single primary or a parenthesized group):
 *
 *   query      := orExpr? (ORDER BY orderItem ("," orderItem)*)?
 *   orderItem  := field (ASC|DESC)?
 *   orExpr     := andExpr (OR andExpr)*
 *   andExpr    := unary (AND unary)*
 *   unary      := NOT unary | primary
 *   primary    := "(" orExpr ")"
 *               | field IS NOT? (EMPTY|NULL)
 *               | field (NOT)? IN "(" valueList ")"
 *               | field OP value
 *   field      := IDENT | "cf" "[" (NUMBER|STRING) "]"
 *   value      := STRING | NUMBER | IDENT | funcCall
 *   funcCall   := IDENT "(" (value ("," value)*)? ")"
 */
import { tokenize, TqlParseError, type Token, type TokenType, type TqlPosition } from "./tokenizer";

export type TqlOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "~" | "!~";

export type TqlField =
  | { kind: "native"; name: string }
  | { kind: "customField"; ref: string };

export type TqlValue =
  | { kind: "literal"; value: string }
  | { kind: "function"; name: string; args: TqlValue[] };

export interface ComparisonNode {
  kind: "comparison";
  field: TqlField;
  op: TqlOp;
  value: TqlValue;
  pos: TqlPosition;
}

export interface InNode {
  kind: "in";
  field: TqlField;
  negate: boolean;
  values: TqlValue[];
  pos: TqlPosition;
}

export interface EmptyNode {
  kind: "empty";
  field: TqlField;
  negate: boolean;
  pos: TqlPosition;
}

export interface AndNode {
  kind: "and";
  clauses: TqlExpr[];
}

export interface OrNode {
  kind: "or";
  clauses: TqlExpr[];
}

export interface NotNode {
  kind: "not";
  clause: TqlExpr;
}

export type TqlExpr = ComparisonNode | InNode | EmptyNode | AndNode | OrNode | NotNode;

export interface TqlOrderClause {
  field: TqlField;
  dir: "ASC" | "DESC";
}

export interface TqlQuery {
  where: TqlExpr | null;
  orderBy: TqlOrderClause[];
}

class Parser {
  private i = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)]!;
  }

  private advance(): Token {
    return this.tokens[this.i++]!;
  }

  private at(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private expect(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new TqlParseError(`Expected ${type} but found "${t.value || t.type}"`, {
        pos: t.pos,
        line: t.line,
        col: t.col,
      });
    }
    return this.advance();
  }

  parse(): TqlQuery {
    let where: TqlExpr | null = null;
    if (!this.at("ORDER") && !this.at("EOF")) {
      where = this.parseOr();
    }

    const orderBy: TqlOrderClause[] = [];
    if (this.at("ORDER")) {
      this.advance();
      this.expect("BY");
      orderBy.push(this.parseOrderItem());
      while (this.at("COMMA")) {
        this.advance();
        orderBy.push(this.parseOrderItem());
      }
    }

    if (!this.at("EOF")) {
      const t = this.peek();
      throw new TqlParseError(`Unexpected "${t.value || t.type}"`, { pos: t.pos, line: t.line, col: t.col });
    }
    return { where, orderBy };
  }

  private parseOrderItem(): TqlOrderClause {
    const field = this.parseField();
    let dir: "ASC" | "DESC" = "ASC";
    if (this.at("ASC") || this.at("DESC")) {
      dir = this.advance().type as "ASC" | "DESC";
    }
    return { field, dir };
  }

  private parseOr(): TqlExpr {
    const clauses = [this.parseAnd()];
    while (this.at("OR")) {
      this.advance();
      clauses.push(this.parseAnd());
    }
    return clauses.length === 1 ? clauses[0]! : { kind: "or", clauses };
  }

  private parseAnd(): TqlExpr {
    const clauses = [this.parseUnary()];
    while (this.at("AND")) {
      this.advance();
      clauses.push(this.parseUnary());
    }
    return clauses.length === 1 ? clauses[0]! : { kind: "and", clauses };
  }

  private parseUnary(): TqlExpr {
    if (this.at("NOT")) {
      this.advance();
      return { kind: "not", clause: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): TqlExpr {
    if (this.at("LPAREN")) {
      this.advance();
      const node = this.parseOr();
      this.expect("RPAREN");
      return node;
    }

    const fieldToken = this.peek();
    const field = this.parseField();
    const startPos: TqlPosition = { pos: fieldToken.pos, line: fieldToken.line, col: fieldToken.col };

    if (this.at("IS")) {
      this.advance();
      let negate = false;
      if (this.at("NOT")) {
        this.advance();
        negate = true;
      }
      if (this.at("EMPTY") || this.at("NULL")) {
        this.advance();
        return { kind: "empty", field, negate, pos: startPos };
      }
      throw new TqlParseError('Expected "EMPTY" or "NULL" after "IS"', {
        pos: this.peek().pos,
        line: this.peek().line,
        col: this.peek().col,
      });
    }

    let negateIn = false;
    if (this.at("NOT")) {
      this.advance();
      negateIn = true;
    }
    if (this.at("IN")) {
      this.advance();
      this.expect("LPAREN");
      const values = [this.parseValue()];
      while (this.at("COMMA")) {
        this.advance();
        values.push(this.parseValue());
      }
      this.expect("RPAREN");
      return { kind: "in", field, negate: negateIn, values, pos: startPos };
    }
    if (negateIn) {
      throw new TqlParseError('Expected "IN" after "NOT"', { pos: this.peek().pos, line: this.peek().line, col: this.peek().col });
    }

    const opToken = this.expect("OP");
    const value = this.parseValue();
    return { kind: "comparison", field, op: opToken.value as TqlOp, value, pos: startPos };
  }

  private parseField(): TqlField {
    if (this.at("CF")) {
      this.advance();
      this.expect("LBRACKET");
      const t = this.peek();
      if (t.type !== "STRING" && t.type !== "NUMBER" && t.type !== "IDENT") {
        throw new TqlParseError(`Expected a custom field id or name inside cf[...]`, { pos: t.pos, line: t.line, col: t.col });
      }
      this.advance();
      this.expect("RBRACKET");
      return { kind: "customField", ref: t.value };
    }
    const t = this.expect("IDENT");
    return { kind: "native", name: t.value.toLowerCase() };
  }

  private parseValue(): TqlValue {
    const t = this.peek();
    if (t.type === "STRING" || t.type === "NUMBER") {
      this.advance();
      return { kind: "literal", value: t.value };
    }
    if (t.type === "IDENT") {
      // Distinguish a bare identifier value ("Done", "me") from a function
      // call ("currentUser()") by checking for an immediately-following "(".
      if (this.peek(1).type === "LPAREN") {
        this.advance();
        this.advance(); // consume "("
        const args: TqlValue[] = [];
        if (!this.at("RPAREN")) {
          args.push(this.parseValue());
          while (this.at("COMMA")) {
            this.advance();
            args.push(this.parseValue());
          }
        }
        this.expect("RPAREN");
        return { kind: "function", name: t.value, args };
      }
      this.advance();
      return { kind: "literal", value: t.value };
    }
    throw new TqlParseError(`Expected a value but found "${t.value || t.type}"`, { pos: t.pos, line: t.line, col: t.col });
  }
}

export function parse(input: string): TqlQuery {
  return new Parser(tokenize(input)).parse();
}

export { TqlParseError };
