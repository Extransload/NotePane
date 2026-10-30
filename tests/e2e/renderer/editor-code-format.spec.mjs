import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  pastePlainText,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

// The languages Prettify gained beyond Prettier's own: a messy snippet, a word that stays in it
// after formatting, and the exact formatted text.
const FORMAT_CASES = [
  {
    language: "c",
    label: "C",
    marker: "main",
    input: "int main(){int x=1;if(x){return 0;}}",
    output: "int main() {\n  int x = 1;\n  if (x) {\n    return 0;\n  }\n}",
  },
  {
    language: "cpp",
    label: "C++",
    marker: "vector",
    input: "#include <vector>\nint main(){std::vector<int> v{1,2};return v.size();}",
    output: "#include <vector>\nint main() {\n  std::vector<int> v{1, 2};\n  return v.size();\n}",
  },
  {
    language: "objective-c",
    label: "Objective C",
    marker: "NSObject",
    input: "@interface A:NSObject\n-(void)f;\n@end",
    output: "@interface A : NSObject\n- (void)f;\n@end",
  },
  {
    language: "java",
    label: "Java",
    marker: "class",
    input: "class A{void f(){int x=1;}}",
    output: "class A {\n  void f() {\n    int x = 1;\n  }\n}",
  },
  {
    language: "csharp",
    label: "C#",
    marker: "class",
    input: "class A{void F(){int x=1;}}",
    output: "class A\n{\n    void F()\n    {\n        int x = 1;\n    }\n}",
  },
  {
    language: "python",
    label: "Python",
    marker: "result",
    input: "result={'value':42}\ndef f(a,b):\n  return a+b",
    output: "result = {\"value\": 42}\n\n\ndef f(a, b):\n    return a + b",
  },
  {
    language: "lua",
    label: "Lua",
    marker: "local",
    input: "local x={1,2,3} function f(a,b) return a+b end",
    output: "local x = { 1, 2, 3 }\nfunction f(a, b)\n  return a + b\nend",
  },
  {
    language: "shellscript",
    label: "Shell",
    marker: "echo",
    input: "if [ -f x ];then echo hi;fi",
    output: "if [ -f x ]; then echo hi; fi",
  },
  {
    language: "latex",
    label: "LaTeX",
    marker: "itemize",
    input: "\\begin{itemize}\n\\item a\n\\item b\n\\end{itemize}",
    output: "\\begin{itemize}\n  \\item a\n  \\item b\n\\end{itemize}",
  },
  {
    language: "rust",
    label: "Rust",
    marker: "main",
    input: "fn main(){let x=1;println!(\"{}\",x);}",
    output: "fn main() {\n    let x = 1;\n    println!(\"{}\", x);\n}",
  },
  {
    language: "swift",
    label: "Swift",
    marker: "func",
    input: "func f(a:Int)->Int{return a+1}",
    output: "func f(a: Int) -> Int { return a + 1 }",
  },
  {
    language: "ruby",
    label: "Ruby",
    marker: "def",
    input: "def f(a,b) a+b end",
    output: "def f(a, b)\n  a + b\nend",
  },
  {
    language: "sql",
    label: "SQL",
    marker: "select",
    input: "select a,b from t where a=1 and b=2",
    output: "select\n  a,\n  b\nfrom\n  t\nwhere\n  a = 1\n  and b = 2",
  },
  {
    language: "sass",
    label: "Sass",
    marker: "color",
    input: ".a\n      color: red\n  .b\n   margin:0",
    output: ".a\n  color: red\n  .b\n    margin: 0",
  },
  {
    language: "php",
    label: "PHP",
    marker: "function",
    input: "<?php $a=array(1,2);function f($x){return $x+1;}",
    output: "<?php $a = [1, 2];\nfunction f($x)\n{\n    return $x + 1;\n}",
  },
  {
    language: "xml",
    label: "XML",
    marker: "root",
    input: "<root><a x=\"1\"><b>text</b></a></root>",
    output: "<root>\n  <a x=\"1\">\n    <b>text</b>\n  </a>\n</root>",
  },
  {
    language: "svelte",
    label: "Svelte",
    marker: "script",
    input: "<script>let a=1</script><p>{a}</p>",
    output: "<script>\n  let a = 1;\n</script>\n\n<p>{a}</p>",
  },
  {
    language: "glsl",
    label: "GLSL",
    marker: "gl_FragColor",
    input: "void main(){gl_FragColor=vec4(1.0,0.0,0.0,1.0);}",
    output: "void main() {\n  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);\n}",
  },
];

// Pastes a fenced code block and returns it with its upper-right toolbar, which shows on hover.
async function pasteCodeBlock(page, { language, label, marker, input }) {
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, ["```" + language, input, "```"].join("\n"));
  const codeBlock = page.locator("[data-content-type='codeBlock']").filter({ hasText: marker });
  await expect(codeBlock).toHaveCount(1);
  await codeBlock.hover();
  const toolbar = page.getByRole("toolbar", { name: `${label} code block actions`, exact: true });
  await expect(toolbar).toBeVisible();
  return { codeBlock, toolbar };
}

// The code block's text as it is, line breaks and indentation included.
function readCode(codeBlock) {
  return codeBlock.locator("code").evaluate((code) => code.textContent);
}

for (const formatCase of FORMAT_CASES) {
  test(`prettifies ${formatCase.label} code`, async ({ page }) => {
    const { codeBlock, toolbar } = await pasteCodeBlock(page, formatCase);
    expect(await readCode(codeBlock)).toBe(formatCase.input);

    await toolbar.getByRole("button", { name: `Prettify ${formatCase.label} code`, exact: true }).click();
    await expect(toolbar.getByRole("button", { name: `${formatCase.label} code prettified`, exact: true }))
      .toHaveText("Formatted");
    expect(await readCode(codeBlock)).toBe(formatCase.output);
  });
}

test("leaves code it cannot parse as it was and shows Failed", async ({ page }) => {
  const brokenPython = { language: "python", label: "Python", marker: "def", input: "def f(:\n  return" };
  const { codeBlock, toolbar } = await pasteCodeBlock(page, brokenPython);

  await toolbar.getByRole("button", { name: "Prettify Python code", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Could not prettify Python code", exact: true }))
    .toHaveText("Failed");
  expect(await readCode(codeBlock)).toBe(brokenPython.input);
});
