import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import parserVue from 'vue-eslint-parser';

/**
 * 🔥 严格配置 - 启用类型感知规则，所有规则设为 error
 * 用于日常开发、lint-staged 和 Betterer
 */
export default tseslint.config(
    // 1. 忽略文件
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'public/**',
            '*.config.js',
            '*.config.ts',
            '**/*.d.ts',
            // 自动化测试文件
            'src/tests/**/*.spec.ts',
            'src/tests/**/*.test.ts',
            '**/__tests__/**/*.spec.ts',
            '**/__tests__/**/*.test.ts'
        ]
    },

    // 2. 基础配置
    eslint.configs.recommended,
    ...pluginVue.configs['flat/recommended'],

    // 3. 严格全局规则
    {
        rules: {
            'no-debugger': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
            'no-case-declarations': 'error',
            'no-empty': 'error',
            'no-useless-catch': 'error',
            'no-constant-condition': 'error',
            'prefer-const': 'error',
        }
    },

    // 4. 最严格 TypeScript 规则（启用类型感知）
    {
        files: ['**/*.ts', '**/*.tsx'],
        extends: [
            ...tseslint.configs.recommendedTypeChecked,
            ...tseslint.configs.stylisticTypeChecked
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.node },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            }
        },
        rules: {
            // 🔥 Promise 处理规则
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',

            // 🔥 类型安全规则（unsafe 系列）
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',

            // 🔥 禁止显式 any
            '@typescript-eslint/no-explicit-any': 'error',

            // 其他严格规则
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none'
            }],
            '@typescript-eslint/no-empty-function': 'error',
            '@typescript-eslint/prefer-for-of': 'error',
            '@typescript-eslint/no-require-imports': 'error',
            '@typescript-eslint/ban-ts-comment': 'error',
            '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
        }
    },

    // 5. 最严格 Vue 规则（启用类型感知）
    {
        files: ['**/*.vue'],
        extends: [
            ...tseslint.configs.recommendedTypeChecked,
            ...tseslint.configs.stylisticTypeChecked
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.node },
            parser: parserVue,
            parserOptions: {
                parser: tseslint.parser,
                extraFileExtensions: ['.vue'],
                project: ['./tsconfig.json'],
                tsconfigRootDir: import.meta.dirname,
            }
        },
        rules: {
            // 🔥 Promise 处理规则
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',

            // 🔥 类型安全规则（unsafe 系列）
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',

            // 🔥 禁止显式 any
            '@typescript-eslint/no-explicit-any': 'error',

            // 其他严格规则
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none'
            }],
            '@typescript-eslint/no-empty-function': 'error',
            '@typescript-eslint/prefer-for-of': 'error',
            '@typescript-eslint/ban-ts-comment': 'error',

            // Vue 规则
            'vue/multi-word-component-names': 'off',
            'vue/no-v-html': 'error',
            'vue/attributes-order': 'error',

            // 禁用需要显式 strictNullChecks 的规则（tsconfig 使用 strict:true 隐含此配置）
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
        }
    },

    // 6. 导入排序
    {
        plugins: { 'simple-import-sort': simpleImportSort },
        rules: {
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
        }
    },

    // 7. Prettier 兼容
    eslintConfigPrettier
);
