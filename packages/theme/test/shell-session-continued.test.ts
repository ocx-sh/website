// continued: which lines of a command fence are not the start of a command.
import { describe, expect, it } from 'vitest';
import { continued } from '../src/components/shell-session.mjs';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
/** The marks of each line of `code` in a fence of `language`, through the real line markup. */
const marks = (code: string, language = 'sh') => {
  const block =
    `command" data-language="${language}">` +
    code
      .split('\n')
      .map((l) => `<div class="ec-line"><div class="code"><span>${esc(l)}</span></div></div>`)
      .join('');
  return [...continued(block).matchAll(/<div( data-ocx-continued)? class="ec-line/g)].map((m) => Boolean(m[1]));
};

describe('continued: quotes', () => {
  it('a line starting inside a string left open is a continuation, the closing line included', () => {
    const pem = 'export OCX_EXTRA_CA_CERTS="-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----"\nocx lock';
    expect(marks(pem)).toEqual([false, true, true, false]);
    expect(marks("echo 'a\nb'\nocx lock", 'bash')).toEqual([false, true, false]);
  });

  it('a string opened and closed on one line, or an apostrophe inside double quotes, opens nothing', () => {
    expect(marks('echo "a"\nocx lock')).toEqual([false, false]);
    expect(marks('echo "it\'s"\nocx lock')).toEqual([false, false]);
    expect(marks('echo \'say "hi"\'\nocx lock')).toEqual([false, false]);
  });

  it('an escaped quote does not close a double-quoted string in sh, nor a backtick one in PowerShell', () => {
    expect(marks('echo "a \\"b\nc"\nocx lock')).toEqual([false, true, false]);
    expect(marks('echo \\"a\nocx lock')).toEqual([false, false]);
    expect(marks('Write-Host "a `"b\nc"\nocx lock', 'powershell')).toEqual([false, true, false]);
  });

  it('an apostrophe in a # comment opens nothing, nor does a comment after a command', () => {
    expect(marks("# it's here\nocx lock\nocx lock # don't\nocx add")).toEqual([true, false, false, false]);
  });

  it('two separate commands are two commands', () => {
    expect(marks('ocx lock\nocx pull')).toEqual([false, false]);
  });

  it('a language that is not a shell tracks no quotes', () => {
    expect(marks("it's\nb", 'text')).toEqual([false, false]);
  });
});

describe('continued: heredocs', () => {
  it('the body and its terminator are continuations', () => {
    expect(marks('cat <<EOF\nline "one\nEOF\nocx lock')).toEqual([false, true, true, false]);
  });

  it('handles <<-, quoted delimiters and a here-string', () => {
    expect(marks("cat <<-'END'\n\tbody\n\tEND\nocx lock")).toEqual([false, true, true, false]);
    expect(marks('cat <<"X"\n$a\nX\nocx lock')).toEqual([false, true, true, false]);
    expect(marks('cat <<< "a"\nocx lock')).toEqual([false, false]);
  });

  it('a << inside quotes starts no heredoc', () => {
    expect(marks('echo "a << EOF"\nocx lock')).toEqual([false, false]);
  });
});

describe('continued: PowerShell', () => {
  it('a line after one ending in a backtick or a pipe is a continuation', () => {
    expect(marks('Get-ChildItem `\n  -Recurse\nGet-Item |\n  Sort-Object\nocx lock', 'pwsh')).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('the lines of a block left open, and the line closing it, are continuations', () => {
    const code = '$items | ForEach-Object {\n  $_.Name\n}\nocx lock\nInvoke-X (\n  1\n)\nocx pull';
    expect(marks(code, 'powershell')).toEqual([false, true, true, false, false, true, true, false]);
  });

  it('a brace inside a string or comment opens no block; a block closed on its line opens none', () => {
    expect(marks('echo "{"\nocx lock\n# {\nocx pull\n& { 1 }\nocx add', 'powershell')).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('a backtick or pipe ending a line is no continuation in sh', () => {
    expect(marks('a |\nb', 'sh')).toEqual([false, false]);
  });
});

describe('continued: what was already so', () => {
  it('the line after a backslash, a blank line and a comment line', () => {
    expect(marks('# x\nocx lock\n\nocx a \\\n  # c\n  --b')).toEqual([true, false, true, false, true, false]);
    expect(marks('a \\\nb', 'text')).toEqual([false, true]);
  });
});
