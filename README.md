# Vitest Markdown TypeScript Loader

A Vitest plugin that parses markdown files, extracts TypeScript code blocks, and attempts to compile and execute them as tests.

## Caveats

- Use at your own risk.
- This plugin will evaluate your code, so don't run anything destructive.

## Features

- Parses markdown files for TypeScript code blocks
- Compiles extracted TypeScript code
- Executes compiled code as Vitest tests
- Supports named code blocks for better organization
- Provides detailed error reporting for compilation and runtime errors

## Configuration Block

You can configure a markdown block by giving it a filename and a title. This allows you to include that file in other places in your examples and provides better organization for your code snippets.

### Syntax

To configure a code block, use the following syntax in your markdown:

```typescript
//filename=/example.ts, title="Example TypeScript File"

console.log("Your typescript code here");
```

### Example

Here's an example of how to use configured code blocks:

# Configuration Block Example

## Define a reusable component

```typescript
//filename=/Button.tsx

export class Button {
  constructor(private props: { label: string }) {}

  render() {
    return `<button>${this.props.label}</button>`;
  }
}
```

## Use the component in a test

```typescript
//file=/Button.test.tsx
//title="Button Component Test"
import { expect, test } from 'vitest';
import { Button } from '/Button';

test('Button renders correctly', () => {
  const button = <Button>Click me</Button>;
  expect(button.render()).toBe('<button>Click me</button>');
});
```

## Reference the component in documentation

Now we can refer to our `Button` component defined in the `Button.tsx` file:

```typescript
import { Button } from '/Button';

console.log(<Button>Submit</Button>.render());
```

## Installation

```bash
npm install --save-dev @speajus/vitest-markdown
```

## Usage

1. Add the plugin to your Vitest configuration file:

```typescript
//file=/vitest.config.ts
import { defineConfig } from "vitest/config";
import { markdownTest } from "@speajus/vitest-markdown";

export default defineConfig({
  plugins: [markdownTest()],
  test: {
    // ... your other Vitest configurations
  },
});
```

2. Write your markdown files with TypeScript code blocks:

# Example Test

This is a simple test in markdown.

```typescript
import { expect, test } from "vitest";

test("adds 1 + 2 to equal 3", () => {
  expect(1 + 2).toBe(3);
});
```

You can also use named code blocks:

```typescript
//title=multiply.test.ts
import { expect, test } from "vitest";

test("multiplies 2 * 3 to equal 6", () => {
  expect(2 * 3).toBe(6);
});
```
