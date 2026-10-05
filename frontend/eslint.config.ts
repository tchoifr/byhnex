import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
  { ignores: ['dist/**', 'test-results/**', 'playwright-report/**', 'node_modules/**'] },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommendedTypeChecked,
  {
    rules: {
      // The markup reproduces the existing pages; attribute order and one-line elements follow them.
      'vue/attributes-order': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      'vue/no-v-html': 'error',
    },
  },
  {
    files: ['tests/**', '*.config.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },
)
