import * as ts from "typescript";

export function stringify(obj: any, indent: string = '  ', depth: number = 0, seen: Map<any, number> = new Map()): string {
    if (obj === null) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);

    if (seen.has(obj)) {
        return JSON.stringify(`[Circular *${seen.get(obj)}]`);
    }

    seen.set(obj, seen.size);

    const currentIndent = indent.repeat(depth);
    const nextIndent = indent.repeat(depth + 1);

    if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        let result = '[\n';
        for (let i = 0; i < obj.length; i++) {
            result += nextIndent + stringify(obj[i], indent, depth + 1, seen);
            if (i < obj.length - 1) result += ',';
            result += '\n';
        }
        result += currentIndent + ']';
        return result;
    } else {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';
        let result = '{\n';
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            result += nextIndent + JSON.stringify(key) + ': ' + stringify(obj[key], indent, depth + 1, seen);
            if (i < keys.length - 1) result += ',';
            result += '\n';
        }
        result += currentIndent + '}';
        return result;
    }
}

export function prettyDiag(diagnostics: ts.Diagnostic[], lineStart:number = 0): string {
    return diagnostics.map(diagnostic => {
        if (diagnostic.file) {
          const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
         return `${diagnostic.file.fileName} (${line + 1 + lineStart},${character + 1}): ${message}`;
        } else {
         return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        }
      }).join("\n");
    }
