import { describe, expect, it } from 'vitest';
import { convert } from './convert.ts';

describe('convert', () => {
  it('lifts the H1 into title frontmatter and strips heading anchors', () => {
    const out = convert('---\noutline: deep\n---\n# Getting Started {#start}\n\n## Next {#next}\n');
    expect(out).toBe('---\ntitle: "Getting Started"\n---\n\n## Next\n');
  });

  it('turns VitePress containers and code-groups into asides and titled code', () => {
    const out = convert(
      '# T\n::: tip First\nbody\n:::\n::: code-group\n```sh [Shell]\nx\n```\n:::\n::: details Why\nmore\n:::\n',
    );
    expect(out).toContain(':::tip[First]\nbody\n:::');
    expect(out).toContain('```sh title="Shell"\nx\n```');
    expect(out).toContain('<details><summary>Why</summary>\n\nmore\n\n</details>');
    expect(out).not.toContain('code-group');
  });

  it('turns Material admonitions and tabs into asides and titled code', () => {
    const out = convert('# T\n!!! warning "Careful"\n    Indented body.\n\n=== "Python"\n\n    ```python-no-run\n    x = 1\n    ```\n');
    expect(out).toContain(':::caution[Careful]\nIndented body.\n:::');
    expect(out).toContain('```python title="Python"\nx = 1\n```');
  });

  it('leaves code fences untouched', () => {
    const out = convert('# T\n```md\n::: tip\n# not a title\n```\n');
    expect(out).toContain('```md\n::: tip\n# not a title\n```');
  });
});
