import { BettererFileTest } from '@betterer/betterer';
import { typescript } from '@betterer/typescript';
import { ESLint } from 'eslint';

// ... (createEslintTest 函数保持不变，不需要修改) ...
function createEslintTest(configPath: string): BettererFileTest {
    // ... 原有代码 ...
    return new BettererFileTest(async (filePaths, fileTestResult, resolver) => {
        // ... 原有代码 ...
        // Betterer 会在调用这个回调之前，先根据 include/exclude 过滤 filePaths
        // 所以这里收到的 filePaths 已经是排除了测试文件的列表
        if (!filePaths.length) {
            return;
        }

        const { baseDirectory } = resolver;
        const eslint = new ESLint({
            cwd: baseDirectory,
            overrideConfigFile: configPath,
            cache: true,
            cacheLocation: '.eslintcache-betterer',
        });

        const results = await eslint.lintFiles([...filePaths]);

        for (const result of results) {
            if (!result.source || result.messages.length === 0) {
                continue;
            }
            const file = fileTestResult.addFile(result.filePath, result.source);
            for (const message of result.messages) {
                file.addIssue(
                    message.line - 1,
                    message.column - 1,
                    (message.endLine ?? message.line) - 1,
                    (message.endColumn ?? message.column) - 1,
                    `[${message.ruleId ?? 'unknown'}] ${message.message}`
                );
            }
        }
    });
}

export default {
    // 📊 ESLint 严格规则测试
    'stricter eslint': () =>
        createEslintTest('./eslint.config.js')
            .include('./src/**/*.ts', './src/**/*.vue', './src/**/*.tsx')
            // 👇 在这里添加 exclude
            .exclude(/\.test\.ts$/)      // 忽略 .test.ts
            .exclude(/\.spec\.ts$/)      // 忽略 .spec.ts
            .exclude(/__tests__\//),     // 忽略 __tests__ 目录下的文件

    // 📊 TypeScript 严格编译测试
    'stricter typescript': () =>
        typescript('./tsconfig.json', {
            strict: true,
            noEmit: true,
        })
            .include('./src/**/*.ts', './src/**/*.tsx')
            // 👇 这里也可以添加 exclude
            .exclude(/\.test\.tsx?$/)        // 忽略 .test.ts 和 .test.tsx
            .exclude(/\.spec\.tsx?$/),       // 忽略 .spec.ts 和 .spec.tsx
};