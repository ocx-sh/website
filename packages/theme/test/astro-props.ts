// tsc cannot import a type from an .astro file, so a type test compiles the frontmatter's type
// declarations (and their type imports) next to the component, with probe assignments appended.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** 0-based lines (within `probes`) that fail to compile against the component's frontmatter types. */
export function probeErrorLines(component: URL, probes: string): number[] {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(component, 'utf8'))?.[1] ?? '';
  const src = ts.createSourceFile('fm.ts', fm, ts.ScriptTarget.Latest, true);
  const decls = src.statements
    .filter(
      (s) =>
        ts.isInterfaceDeclaration(s) ||
        ts.isTypeAliasDeclaration(s) ||
        (ts.isImportDeclaration(s) && s.importClause?.isTypeOnly),
    )
    .map((s) => s.getText(src));
  const path = fileURLToPath(new URL('./props.probe.ts', component));
  const code = `${decls.join('\n')}\n${probes}`;
  const options = {
    strict: true,
    noEmit: true,
    allowJs: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (name, ...rest) =>
    name === path ? ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true) : getSourceFile(name, ...rest);
  host.fileExists = (name) => name === path || fileExists(name);
  host.readFile = (name) => (name === path ? code : readFile(name));
  const program = ts.createProgram([path], options, host);
  const probe = program.getSourceFile(path)!;
  const offset = decls.join('\n').split('\n').length;
  return ts
    .getPreEmitDiagnostics(program, probe)
    .map((d) => probe.getLineAndCharacterOfPosition(d.start ?? 0).line - offset);
}
