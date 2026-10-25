// Splits a file into the pieces the index embeds (spec 0021 plan §3.3): TypeScript and JavaScript
// by top-level statement, Markdown by heading section, everything else by windows of lines.

import { createHash } from 'node:crypto';
import ts from 'typescript';

export type ChunkKind = 'code' | 'test' | 'spec' | 'doc' | 'deploy';
export type SpecStatus = 'binding' | 'history';

export interface Chunk {
  /** sha256 of the path, the lines and the blob hash. */
  id: string;
  path: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  kind: ChunkKind;
  symbol: string;
  specStatus: SpecStatus | null;
  text: string;
  blobHash: string;
}

export interface SourceFile {
  path: string;
  text: string;
  blobHash: string;
}

export const WINDOW_LINES = 60;
export const WINDOW_OVERLAP = 10;
export const MAX_STATEMENT_LINES = 120;
export const MAX_CHUNK_CHARS = 6000;
export const MAX_CLASS_LINES = 80;
const SYMBOL_CHARS = 80;

/** A piece before it becomes a chunk: 0-based, inclusive line numbers. */
interface Piece {
  start: number;
  end: number;
  symbol: string;
}

const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  ts: ts.ScriptKind.TS,
  mts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
  js: ts.ScriptKind.JS,
  mjs: ts.ScriptKind.JS,
  cjs: ts.ScriptKind.JS,
};

function extension(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1) : '';
}

export function chunkKind(path: string): ChunkKind {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (path.startsWith('specs/')) return 'spec';
  if (/\.(spec|e2e-spec)\.ts$|\.test\.tsx?$/.test(name)) return 'test';
  if (
    /^(deploy|\.github|scripts)\//.test(path) ||
    name === 'Dockerfile' ||
    /^docker-compose[^/]*\.yml$/.test(path)
  ) {
    return 'deploy';
  }
  return extension(path) === 'md' ? 'doc' : 'code';
}

export function specStatus(path: string, text: string): SpecStatus | null {
  if (!path.startsWith('specs/')) return null;
  if (path === 'specs/backlog.md' || path === 'specs/principles.md') return 'binding';
  const status = /^Status:\s*(\S+)/m.exec(text)?.[1];
  return status?.replace(/\W+$/, '') === 'done' ? 'history' : 'binding';
}

function firstLine(lines: string[]): string {
  return (lines.find((line) => line.trim() !== '') ?? '').trim().slice(0, SYMBOL_CHARS);
}

/**
 * Windows of `WINDOW_LINES` lines, fewer when they would pass `MAX_CHUNK_CHARS`, each sharing up
 * to `WINDOW_OVERLAP` lines, and at most a quarter of itself, with the window before.
 */
function windows(
  lines: string[],
  start: number,
  end: number,
  symbol: (start: number, end: number) => string,
): Piece[] {
  const pieces: Piece[] = [];
  let from = start;
  for (;;) {
    let to = from;
    let size = lines[from]!.length;
    while (to < end && to - from + 1 < WINDOW_LINES) {
      const next = size + 1 + lines[to + 1]!.length;
      if (next > MAX_CHUNK_CHARS) break;
      size = next;
      to++;
    }
    pieces.push({ start: from, end: to, symbol: symbol(from, to) });
    if (to >= end) return pieces;
    // A window cut short by long lines shares fewer, or every line would be embedded many times.
    const overlap = Math.min(WINDOW_OVERLAP, Math.floor((to - from + 1) / 4));
    from = to + 1 - overlap;
  }
}

function lineWindows(lines: string[]): Piece[] {
  if (lines.length === 0) return [];
  return windows(lines, 0, lines.length - 1, (from, to) => firstLine(lines.slice(from, to + 1)));
}

function isLarge(lines: string[], start: number, end: number): boolean {
  return (
    end - start + 1 > MAX_STATEMENT_LINES ||
    lines.slice(start, end + 1).join('\n').length > MAX_CHUNK_CHARS
  );
}

function declaredNames(node: ts.Node, source: ts.SourceFile): string {
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.map((d) => d.name.getText(source)).join(', ');
  }
  if (ts.isExportAssignment(node)) return 'default';
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  ) {
    return node.name?.getText(source) ?? 'default';
  }
  return '';
}

function memberName(member: ts.ClassElement, source: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(member)) return 'constructor';
  return member.name?.getText(source) ?? '';
}

function isImportLike(node: ts.Statement): boolean {
  return (
    ts.isImportDeclaration(node) ||
    ts.isImportEqualsDeclaration(node) ||
    (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined)
  );
}

function scriptPieces(path: string, text: string, lines: string[]): Piece[] {
  const kind = SCRIPT_KINDS[extension(path)] ?? ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const line = (position: number) => source.getLineAndCharacterOfPosition(position).line;
  // A node starts at its first leading comment (JSDoc included), else at its first token.
  const startOf = (node: ts.Node) =>
    line(ts.getLeadingCommentRanges(text, node.pos)?.[0]?.pos ?? node.getStart(source));
  const endOf = (node: ts.Node) => line(node.end);

  const pieces: Piece[] = [];
  const add = (start: number, end: number, symbol: string) => {
    if (isLarge(lines, start, end)) pieces.push(...windows(lines, start, end, () => symbol));
    else pieces.push({ start, end, symbol });
  };

  const statements = source.statements;
  // Directives at the top (`'use client'`) go with the piece after them.
  let first = 0;
  while (
    first < statements.length - 1 &&
    ts.isExpressionStatement(statements[first]!) &&
    ts.isStringLiteral((statements[first] as ts.ExpressionStatement).expression)
  ) {
    first++;
  }
  const directivesStart = first > 0 ? startOf(statements[0]!) : null;

  for (let i = first; i < statements.length; i++) {
    const node = statements[i]!;
    const leading = i === first ? directivesStart : null;
    if (isImportLike(node)) {
      // Consecutive imports and re-exports make one piece.
      let last = i;
      while (last + 1 < statements.length && isImportLike(statements[last + 1]!)) last++;
      add(leading ?? startOf(node), endOf(statements[last]!), 'imports');
      i = last;
      continue;
    }
    const symbol = declaredNames(node, source);
    const start = leading ?? startOf(node);
    const end = endOf(node);
    if (ts.isClassDeclaration(node) && end - start + 1 > MAX_CLASS_LINES && node.members.length) {
      // The class's head goes with its first member, its closing brace with the last.
      node.members.forEach((member, index) => {
        const memberStart = index === 0 ? start : startOf(member);
        const memberEnd = index === node.members.length - 1 ? end : endOf(member);
        add(memberStart, memberEnd, `${symbol}.${memberName(member, source)}`);
      });
      continue;
    }
    add(start, end, symbol || firstLine(lines.slice(start, end + 1)));
  }
  if (pieces.length === 0) return lineWindows(lines);

  // Comments after the last statement go with the last piece, or windows of their own.
  const last = pieces.at(-1)!;
  if (lines.slice(last.end + 1).some((text) => text.trim() !== '')) {
    if (isLarge(lines, last.start, lines.length - 1)) {
      pieces.push(...windows(lines, last.end + 1, lines.length - 1, () => last.symbol));
    } else {
      last.end = lines.length - 1;
    }
  }
  return pieces;
}

const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const LIST_ITEM = /^(?:[-*+]|\d+\.)\s/;

function size(lines: string[], from: number, to: number): number {
  return lines.slice(from, to + 1).join('\n').length;
}

/** Lines `from..to` as units under the limit: whole, else by top-level list item, else by line. */
function units(lines: string[], from: number, to: number): [number, number][] {
  if (size(lines, from, to) <= MAX_CHUNK_CHARS) return [[from, to]];
  const starts = [from];
  for (let i = from + 1; i <= to; i++) if (LIST_ITEM.test(lines[i]!)) starts.push(i);
  if (starts.length === 1) {
    return Array.from({ length: to - from + 1 }, (_, i) => [from + i, from + i]);
  }
  return starts.flatMap((start, index) => units(lines, start, (starts[index + 1] ?? to + 1) - 1));
}

/** Splits lines `start..end` at blank lines into pieces of about `MAX_CHUNK_CHARS`. */
function splitSection(lines: string[], start: number, end: number, symbol: string): Piece[] {
  // Units are paragraphs; a paragraph over the limit falls apart into its list items or lines.
  const parts: [number, number][] = [];
  let unitStart = start;
  let inFence = false;
  for (let i = start; i <= end; i++) {
    if (FENCE.test(lines[i]!)) inFence = !inFence;
    if ((!inFence && lines[i]!.trim() === '') || i === end) {
      parts.push(...units(lines, unitStart, i));
      unitStart = i + 1;
    }
  }

  const pieces: Piece[] = [];
  let piece: Piece | null = null;
  let pieceSize = 0;
  for (const [from, to] of parts) {
    const unitSize = size(lines, from, to) + 1;
    if (piece && pieceSize + unitSize > MAX_CHUNK_CHARS) {
      pieces.push(piece);
      piece = null;
    }
    if (!piece) {
      piece = { start: from, end: to, symbol };
      pieceSize = 0;
    }
    piece.end = to;
    pieceSize += unitSize;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function markdownPieces(lines: string[]): Piece[] {
  const sections: { start: number; path: string[] }[] = [{ start: 0, path: [] }];
  const headings: string[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (FENCE.test(line)) inFence = !inFence;
    const match = inFence ? null : HEADING.exec(line);
    if (!match) return;
    const level = match[1]!.length;
    headings.length = level - 1;
    headings[level - 1] = match[2]!;
    sections.push({ start: index, path: headings.filter(Boolean) });
  });

  const pieces: Piece[] = [];
  sections.forEach((section, index) => {
    const end = (sections[index + 1]?.start ?? lines.length) - 1;
    const bodyStart = section.path.length > 0 ? section.start + 1 : section.start;
    // A heading with nothing under it but the next heading carries nothing to find.
    if (!lines.slice(bodyStart, end + 1).some((line) => line.trim() !== '')) return;
    const symbol =
      section.path.join(' › ') ||
      (lines[section.start] === '---'
        ? 'front matter'
        : firstLine(lines.slice(section.start, end + 1)));
    pieces.push(...splitSection(lines, section.start, end, symbol));
  });
  return pieces;
}

export function chunkFile(file: SourceFile): Chunk[] {
  const lines = file.text.split('\n');
  // A trailing newline is not a line of its own.
  if (lines.length > 0 && lines.at(-1) === '') lines.pop();
  const ext = extension(file.path);
  const pieces =
    ext in SCRIPT_KINDS
      ? scriptPieces(file.path, file.text, lines)
      : ext === 'md'
        ? markdownPieces(lines)
        : lineWindows(lines);

  const kind = chunkKind(file.path);
  const status = specStatus(file.path, file.text);
  return pieces.map((piece) => {
    const startLine = piece.start + 1;
    const endLine = piece.end + 1;
    return {
      id: createHash('sha256')
        .update(`${file.path}\0${startLine}\0${endLine}\0${file.blobHash}`)
        .digest('hex'),
      path: file.path,
      startLine,
      endLine,
      kind,
      symbol: piece.symbol,
      specStatus: status,
      text: lines.slice(piece.start, piece.end + 1).join('\n'),
      blobHash: file.blobHash,
    };
  });
}

/** What is sent to the embeddings model: the path's words help retrieval. */
export function embeddedText(chunk: Chunk): string {
  return `${chunk.path} ${chunk.symbol}\n${chunk.text}`;
}
