import { marked, type Tokens } from "marked";
import fs from "fs/promises";
import * as ts from "typescript";
import { SourceMapGenerator } from "source-map";
import path from "path";
import { prettyDiag } from "./util";
const dirname = (() => {
  try {
    return __dirname;
  } catch (e) {
    //@ts-ignore
    return import.meta.dirname;
  }
})();
function removeInfoString(origText: string): {
  text: string;
  filename?: string;
  title?: string;
} {
  const obj: Record<string, string> = {};
  const text = origText.replace(
    /^\s*\/\/\s*(\w+\s*=\s*.+?)\n/gm,
    (_, matched) => {
      for (const [, key, value] of matched.matchAll(/(\w+)\s*=\s*([^,]*)/g)) {
        obj[key] = value;
      }
      return "";
    },
  );

  return {
    ...obj,
    text,
  };
}

const TRANSPILE_OPTIONS = {
  compilerOptions: {
    allowJs: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES5,
    sourceMap: true,
    skipLibCheck: true,
    reactNamespace: "React",
    jsx: ts.JsxEmit.React,
    jsxFactory: "React.createElement",
    jsxFragmentFactory: "React.Fragment",
  },
};

interface CodeBlock {
  lang: string;
  text: string;
  lineStart: number;
  filename: string;
  isNamed: boolean;
  title?: string;
}
type LineToken = Tokens.Code & { lineStart: number };
const toObjStrMap = (values: string[], map: Map<string, string>) => {
  return (
    values.reduce(
      (acc, cur, idx) => `${acc}${JSON.stringify(cur)}:__${idx},`,
      "{",
    ) +
    `
${Array.from(
  map,
  ([
    key,
    value,
  ]) => `${JSON.stringify(key)}:class extends MModule { constructor() {
  const exports = this.exports = {};
  ${value};
}}`,
).join(",")}  
}`
  );
};

function count(str: string) {
  return str.split("\n").length;
}
export async function parseMarkdownFile(
  filePath: string,
): Promise<CodeBlock[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const tokens = marked.lexer(content);
  let lineStart = 0;
  return tokens
    .reduce((acc, token) => {
      if (token.type === "code" && token.lang === "typescript") {
        acc.push({
          ...token,
          lineStart,
        } as any);
      }
      if ("text" in token) lineStart += count(token.raw);
      return acc;
    }, [] as LineToken[])
    .map((token, index) => {
      const { text, title, filename } = removeInfoString(token.text);
      const block = {
        isNamed: filename != null,
        title,
        lang: token.lang ?? "",
        text,
        lineStart: token.lineStart,
        filename:
          filename ??
          `${path.basename(filePath).replace(".md", "")}-example-${index}.ts`,
      };
      lineStart += text.split("\n").length + 1; // +1 for the code fence
      return block;
    });
}
const paths = {
  vitest: ["./node_modules/vitest/index.d.cts"],
  "@speajus/vitest-markdown": [`.`],
};

export function markdownTest(
  transpileOptions: ts.TranspileOptions = TRANSPILE_OPTIONS,
) {
  const compilerOptions: ts.TranspileOptions["compilerOptions"] =
    transpileOptions.compilerOptions ?? TRANSPILE_OPTIONS.compilerOptions;

  compilerOptions.paths = {
    ...paths,
    ...compilerOptions.paths,
  };

  const plugin = {
    name: "@speajus/vitest-markdown",
    async load(file: string) {
      if (!/\.mdx?$/.test(file)) return null;
      const name = path.basename(file);
      const codeBlocks = await parseMarkdownFile(file);
      const testCases: string[] = [];
      const importSet = new Set<string>();
      const sourceMapGenerator = new SourceMapGenerator({ file });
      let generatedLineOffset = 3; // Offset for import statements and other boilerplate
      const fsMap = new Map<string, string>();
      const host = ts.createCompilerHost(compilerOptions);
      const oRead = host.readFile;
      const fromMap = (fileName: string) => {
        return (
          fsMap.get(fileName) ||
          fsMap.get(fileName + ".tsx") ||
          fsMap.get(fileName + ".ts") ||
          fsMap.get(fileName + ".js  ")
        );
      };
      host.writeFile = (fileName: string, contents: string) => {
        fsMap.set(fileName, contents);
      };

      host.readFile = (fileName: string) => {
        return fromMap(fileName) ?? oRead.call(this, fileName);
      };
      const oFileExists = host.fileExists;
      host.fileExists = (fileName: string) => {
        const exists =
          fromMap(fileName) != null || oFileExists.call(this, fileName);
        return exists;
      };
      // Prepare and emit the d.ts files

      const rootNames: string[] = [];
      const transpiledMap = new Map<string, string>();
      const files = new Set<string>();

      for (const block of codeBlocks) {
        rootNames.push(block.filename);
        fsMap.set(block.filename, block.text);
        if (block.isNamed) {
          files.add(block.filename);
        }
      }
      const program = ts.createProgram(
        [...fsMap.keys()],
        compilerOptions,
        host,
      );
      const result = program.emit(undefined, (fileName, data) => {
        transpiledMap.set(fileName, data);
      });

      const diagnostics = program.getSemanticDiagnostics();
      const diagMap = new Map<string, ts.Diagnostic[]>();
      if (diagnostics.length) {
        for (const diag of diagnostics) {
          if (diag.file?.fileName) {
            diagMap.set(
              diag.file.fileName || "",
              (diagMap.get(diag.file.fileName) || []).concat(diag),
            );
          }
        }
      }

      for (const block of codeBlocks) {
        const diags = diagMap.get(block.filename);
        const index = testCases.length + 1;
        const testName = JSON.stringify(
          `Example ${index} -  ${(block.title ?? block.isNamed) ? ` (${name})` : ""}`,
        );

        if (diags?.length) {
          testCases.push(`__vitest__.test(${testName}, () => { 
    const diagnostics = ${diags.length ? JSON.stringify(prettyDiag(diags, block.lineStart)) : ""};
    __vitest__.expect(diagnostics).toEqual("", "Expected no warnings/errors");
});
`);
          continue;
        }

        const sourceFile = program.getSourceFile(block.filename);
        if (!sourceFile) {
          console.error(`Source file not found for ${block.filename}`);
          continue;
        }
        sourceFile.statements.forEach((statement) => {
          if (ts.isImportDeclaration(statement)) {
            importSet.add(
              statement.moduleSpecifier.getFullText().trim().slice(1, -1),
            );
          }
        });

        const transpiledCode =
          transpiledMap.get(block.filename.replace(".ts", ".js")) ??
          transpiledMap.get(block.filename.replace(".tsx", ".js"));
        const sourceMapContent =
          transpiledMap.get(block.filename.replace(".ts", ".js.map")) ??
          transpiledMap.get(block.filename.replace(".tsx", ".js.map"));

        if (transpiledCode && sourceMapContent) {
          const sourceMap = JSON.parse(sourceMapContent);
          sourceMap.sources = [block.filename];
          sourceMap.file = file;

          // Adjust mappings for the current block
          const mappings = sourceMap.mappings.split(";");
          const adjustedMappings = mappings
            .map((line: string, lineIndex: number) => {
              const segments = line.split(",");
              return segments
                .map((segment: string) => {
                  const [column, sourceIndex, sourceLine, sourceColumn] =
                    segment.split("").map(Number);
                  if (!isNaN(sourceLine)) {
                    sourceMapGenerator.addMapping({
                      generated: {
                        line: lineIndex + generatedLineOffset,
                        column: column || 0,
                      },
                      original: {
                        line: sourceLine + block.lineStart - 1,
                        column: sourceColumn || 0,
                      },
                      source: file,
                    });
                  }
                  return segment;
                })
                .join(",");
            })
            .join(";");

          sourceMap.mappings = adjustedMappings;

          // Add the original source content to the source map
          sourceMapGenerator.setSourceContent(block.filename, block.text);

          testCases.push(`
          __vitest__.it(${testName}, async () => {
            const exports = {};
            ${transpiledCode}
          });
        `);

          generatedLineOffset += transpiledCode.split("\n").length + 3; // +3 for test function wrapper
        }
      }

      const filteredFiles = new Map(
        [...transpiledMap]
          .filter(
            ([k, v]) =>
              files.has(k.replace(".js", ".ts")) ||
              files.has(k.replace(".js", ".tsx")),
          )
          .map(([k, v]) => [k.replace(".js", ""), v]),
      );

      const notTranspiledModule = [...importSet].filter(
        (v) => !(filteredFiles.has(v) || host.fileExists(v)),
      );
      generatedLineOffset += notTranspiledModule.length;
      const code = `
           
import * as __vitest__ from 'vitest';
${notTranspiledModule.map((name, idx) => `import * as __${idx} from '${compilerOptions.paths?.[name]?.[0] ?? name}'`).join(";\n")}

class MModule {  }

const require = ((map)=>{
const fakeViTest = {
 ...__vitest__,
 async describe(_,fn){
    return await fn();
 },
 async test(_,fn){
   return await fn();
 },
 async it(_,fn){
   return await fn();
 }
}

    return (name) => name === 'vitest' ? fakeViTest : map[name]?.constructor === MModule ? (map[name] = new (map[name])().exports) : map[name] 
})(${toObjStrMap(notTranspiledModule, filteredFiles)})

${testCases.length ? testCases.join("\n") : `__vitest__.it('No Tests', ()=>{__vitest__.expect(true).toBe(true)})`}

`;

      return {
        code,
        map: sourceMapGenerator.toString(),
      };
    },
  } as const;
  return plugin;
}
