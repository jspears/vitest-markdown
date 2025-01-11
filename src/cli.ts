import { markdownTest } from "./vitest-markdown-loader";
(async function (...files: string[]) {
    for (const arg of files) {
        console.log((await markdownTest().load(arg))?.code);
    }
})(...process.argv.slice(2)).then(undefined, console.error);
