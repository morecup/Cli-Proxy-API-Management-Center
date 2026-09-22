import { createRoot } from 'react-dom/client';
import i18n from '../../src/i18n';
import { ScopeFixture } from './ClaudeDesktopObservedScopeFixture';

void i18n.changeLanguage('zh-CN').then(() => {
  createRoot(document.getElementById('root')!).render(<ScopeFixture />);
});
